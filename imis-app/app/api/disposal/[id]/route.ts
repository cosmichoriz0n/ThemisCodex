import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { db } from "@/lib/db";
import { ALL_ROLES, ADMIN_ONLY, MANAGER_ABOVE } from "@/lib/auth/permissions";
import { disposalRecords } from "@/lib/db/schema/disposal-records";
import { items } from "@/lib/db/schema/items";
import { itemAttributes } from "@/lib/db/schema/item-attributes";
import { stockMovements } from "@/lib/db/schema/stock-movements";
import { lifecycleEvents } from "@/lib/db/schema/lifecycle-events";
import { auditLog } from "@/lib/db/schema/audit-log";
import { integrationLog } from "@/lib/db/schema/integration-log";
import { mapJournal } from "@/lib/cas/journal-mapper";
import { generateCasCsv } from "@/lib/webhooks/cas-csv";
import { uploadFile } from "@/lib/storage";
import type { Role } from "@/types/auth";

const VALID_TRANSITIONS: Record<string, { nextStatus: string; allowedRoles: Role[] }> = {
  requested: { nextStatus: "under_inspection", allowedRoles: MANAGER_ABOVE },
  under_inspection: { nextStatus: "authorized", allowedRoles: ADMIN_ONLY },
  authorized: { nextStatus: "disposed", allowedRoles: ADMIN_ONLY },
};

const patchSchema = z.object({
  status: z.enum(["under_inspection", "authorized", "disposed"]),
  authorization_no: z.string().optional(),
  remarks: z.string().optional(),
});

/**
 * GET /api/disposal/[id]
 * Fetch a single disposal record with item details and audit trail.
 * Roles: all
 */
export const GET = withAuth(async (_req: NextRequest, { user, role, params }) => {
  const { id } = params;

  const { record, auditTrail } = await withRole(user.uid, role, async (tx) => {
    const [record] = await tx
      .select({
        id: disposalRecords.id,
        itemId: disposalRecords.itemId,
        disposalType: disposalRecords.disposalType,
        status: disposalRecords.status,
        authorizationNo: disposalRecords.authorizationNo,
        requestedBy: disposalRecords.requestedBy,
        authorizedBy: disposalRecords.authorizedBy,
        remarks: disposalRecords.remarks,
        createdAt: disposalRecords.createdAt,
        updatedAt: disposalRecords.updatedAt,
        itemName: items.itemName,
        assetTag: items.assetTag,
        categoryCode: items.categoryCode,
        lifecycleStatus: items.lifecycleStatus,
        location: items.location,
      })
      .from(disposalRecords)
      .leftJoin(items, eq(disposalRecords.itemId, items.itemId))
      .where(eq(disposalRecords.id, id))
      .limit(1);

    const auditTrail = await tx
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.resource, "disposal_records"),
          eq(auditLog.resourceId, id)
        )
      )
      .orderBy(desc(auditLog.createdAt));

    return { record, auditTrail };
  });

  if (!record) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ data: { ...record, audit_trail: auditTrail } });
}, ALL_ROLES);

/**
 * PATCH /api/disposal/[id]
 * Advance the disposal state machine. Role-gated per transition:
 *   requested → under_inspection  : inventory_manager | system_admin
 *   under_inspection → authorized : system_admin
 *   authorized → disposed          : system_admin (triggers CAS2000 write-off journal)
 *
 * Roles checked dynamically — route accepts MANAGER_ABOVE minimum;
 * finer-grained checks happen inside the handler.
 */
export const PATCH = withAuth(async (req: NextRequest, { user, role, params }) => {
  const { id } = params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", detail: parsed.error.flatten() }, { status: 422 });
  }

  const { status: targetStatus, authorization_no, remarks } = parsed.data;

  // Phase 1: Read + validate
  const readResult = await withRole(user.uid, role, async (tx) => {
    const [record] = await tx
      .select({
        id: disposalRecords.id,
        itemId: disposalRecords.itemId,
        status: disposalRecords.status,
        disposalType: disposalRecords.disposalType,
        authorizationNo: disposalRecords.authorizationNo,
        requestedBy: disposalRecords.requestedBy,
      })
      .from(disposalRecords)
      .where(eq(disposalRecords.id, id))
      .limit(1);

    if (!record) return { error: "NOT_FOUND" } as const;

    const [item] = await tx
      .select({
        itemId: items.itemId,
        itemName: items.itemName,
        assetTag: items.assetTag,
        categoryCode: items.categoryCode,
        lifecycleStatus: items.lifecycleStatus,
      })
      .from(items)
      .where(eq(items.itemId, record.itemId))
      .limit(1);

    return { record, item } as const;
  });

  if ("error" in readResult) {
    return NextResponse.json({ error: readResult.error }, { status: 404 });
  }

  const { record, item } = readResult;

  // Validate transition
  const transition = VALID_TRANSITIONS[record.status];
  if (!transition || transition.nextStatus !== targetStatus) {
    return NextResponse.json(
      { error: "INVALID_TRANSITION", detail: `Cannot move from ${record.status} to ${targetStatus}` },
      { status: 422 }
    );
  }

  // Role gate per transition
  if (!transition.allowedRoles.includes(role)) {
    return NextResponse.json({ error: "INSUFFICIENT_ROLE" }, { status: 403 });
  }

  // authorization_no required when moving to "authorized"
  if (targetStatus === "authorized" && !authorization_no) {
    return NextResponse.json({ error: "VALIDATION_ERROR", detail: "authorization_no is required to authorize a disposal" }, { status: 422 });
  }

  // ── Simple transitions (requested → under_inspection, under_inspection → authorized) ──
  if (targetStatus !== "disposed") {
    await withRole(user.uid, role, async (tx) => {
      await tx
        .update(disposalRecords)
        .set({
          status: targetStatus as "under_inspection" | "authorized",
          ...(targetStatus === "authorized" ? { authorizationNo: authorization_no!, authorizedBy: user.uid } : {}),
          ...(remarks ? { remarks } : {}),
          updatedAt: new Date(),
        })
        .where(eq(disposalRecords.id, id));

      await tx.insert(auditLog).values({
        userId: user.uid,
        userRole: role,
        action: `disposal_${targetStatus}`,
        resource: "disposal_records",
        resourceId: id,
        details: {
          from_status: record.status,
          to_status: targetStatus,
          item_id: record.itemId,
          ...(authorization_no ? { authorization_no } : {}),
        },
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      });
    });

    return NextResponse.json({ data: { id, status: targetStatus } });
  }

  // ── Final transition: authorized → disposed ──────────────────────────────
  // 1. Compute net book value
  const nbv = await withRole(user.uid, role, async (tx) => {
    const [costRow] = await tx
      .select({ unitCost: sql<string>`MIN(${stockMovements.unitCost}::numeric)` })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.itemId, record.itemId),
          eq(stockMovements.movementType, "receive")
        )
      );

    const acquisitionCost = parseFloat(costRow?.unitCost ?? "0");

    let accumulatedDepr = 0;
    if (item.categoryCode === "UPIS") {
      const [attr] = await tx
        .select({ attributeValue: itemAttributes.attributeValue })
        .from(itemAttributes)
        .where(
          and(
            eq(itemAttributes.itemId, record.itemId),
            eq(itemAttributes.attributeName, "accumulated_depreciation")
          )
        )
        .limit(1);
      accumulatedDepr = parseFloat(attr?.attributeValue ?? "0");
    }

    return Math.max(0, acquisitionCost - accumulatedDepr);
  });

  // 2. Post CAS2000 journal (outside DB transaction)
  const casBaseUrl = process.env.CAS2000_BASE_URL;
  const casApiKey  = process.env.CAS2000_API_KEY;

  let casStatus: "success" | "failure" = "success";
  let casErrMsg: string | null = null;
  let fallbackCsvPath: string | undefined;

  if (casBaseUrl && casApiKey && nbv > 0) {
    const journal = mapJournal(
      "dispose",
      nbv,
      `Asset ${record.disposalType} — ${item.assetTag ?? item.itemId} ${item.itemName}`
    );

    try {
      const casRes = await fetch(`${casBaseUrl}/api/journals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": casApiKey },
        body: JSON.stringify({
          journal_type: journal.journal_type,
          description: journal.description,
          entries: journal.entries,
        }),
      });
      if (!casRes.ok) {
        casStatus = "failure";
        casErrMsg = `CAS2000 responded ${casRes.status}`;
      }
    } catch (err) {
      casStatus = "failure";
      casErrMsg = err instanceof Error ? err.message : String(err);
    }

    if (casStatus === "failure") {
      try {
        const csvContent = generateCasCsv({
          transactionId: id,
          journalType: journal.journal_type,
          description: journal.description,
          transactionDate: new Date(),
          createdBy: user.uid,
          entries: journal.entries,
        });
        const csvPath = `cas-fallback/disposal/${new Date().getFullYear()}/${id}.csv`;
        await uploadFile(csvPath, Buffer.from(csvContent, "utf-8"), "text/csv");
        fallbackCsvPath = csvPath;
      } catch {
        // non-fatal
      }
    }
  }

  // 3. Write all DB changes in one transaction
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.user_id = ${user.uid}`);
    await tx.execute(sql`SET LOCAL app.user_role = ${role}`);

    // Advance disposal record
    await tx
      .update(disposalRecords)
      .set({ status: "disposed", updatedAt: new Date() })
      .where(eq(disposalRecords.id, id));

    // Transition item lifecycle
    const prevStatus = item.lifecycleStatus;
    await tx
      .update(items)
      .set({ lifecycleStatus: "disposed", updatedAt: new Date() })
      .where(eq(items.itemId, record.itemId));

    await tx.insert(lifecycleEvents).values({
      itemId: record.itemId,
      fromState: prevStatus,
      toState: "disposed",
      authorizedBy: user.uid,
      remarks: `Disposal completed — ${record.disposalType} — auth no. ${record.authorizationNo ?? "N/A"}`,
    });

    // Integration log — always record, even for zero-NBV fully-depreciated assets
    await tx.insert(integrationLog).values({
        sourceSystem: "CAS2000",
        operation: "DISPOSAL_WRITE_OFF",
        status: nbv > 0 ? casStatus : "success",
        payload: {
          disposal_id: id,
          item_id: record.itemId,
          disposal_type: record.disposalType,
          net_book_value: nbv,
          ...(nbv === 0 ? { skipped_reason: "fully_depreciated_no_journal_required" } : {}),
          ...(fallbackCsvPath ? { fallback_csv_path: fallbackCsvPath } : {}),
        },
        errorMsg: nbv > 0 ? casErrMsg : null,
        retryCount: 0,
      });

    // Audit log
    await tx.insert(auditLog).values({
      userId: user.uid,
      userRole: role,
      action: "disposal_completed",
      resource: "disposal_records",
      resourceId: id,
      details: {
        item_id: record.itemId,
        disposal_type: record.disposalType,
        net_book_value: nbv,
        cas_status: casStatus,
        ...(fallbackCsvPath ? { fallback_csv_path: fallbackCsvPath } : {}),
      },
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    });
  });

  return NextResponse.json({
    data: {
      id,
      status: "disposed",
      net_book_value: nbv,
      cas_status: casStatus,
      ...(fallbackCsvPath ? { fallback_csv_path: fallbackCsvPath } : {}),
    },
  });
}, MANAGER_ABOVE);
