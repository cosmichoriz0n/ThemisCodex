import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { ALL_ROLES, MANAGER_ABOVE } from "@/lib/auth/permissions";
import { disposalRecords } from "@/lib/db/schema/disposal-records";
import { items } from "@/lib/db/schema/items";
import { auditLog } from "@/lib/db/schema/audit-log";

const createSchema = z.object({
  item_id: z.string().uuid("item_id must be a valid UUID"),
  disposal_type: z.enum(["condemned", "scrap_sale", "donated", "transferred"]),
  remarks: z.string().optional(),
});

/**
 * GET /api/disposal
 * List disposal records with optional filters.
 * Roles: all
 */
export const GET = withAuth(async (req: NextRequest, { user, role }) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const disposalType = searchParams.get("disposal_type");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("page_size") ?? "25", 10)));
  const offset = (page - 1) * pageSize;

  const filters: ReturnType<typeof and>[] = [];

  if (status && ["requested", "under_inspection", "authorized", "disposed"].includes(status)) {
    filters.push(eq(disposalRecords.status, status as "requested" | "under_inspection" | "authorized" | "disposed"));
  }
  if (disposalType && ["condemned", "scrap_sale", "donated", "transferred"].includes(disposalType)) {
    filters.push(eq(disposalRecords.disposalType, disposalType as "condemned" | "scrap_sale" | "donated" | "transferred"));
  }
  if (dateFrom) {
    filters.push(gte(disposalRecords.createdAt, new Date(dateFrom)));
  }
  if (dateTo) {
    const to = new Date(dateTo);
    to.setHours(23, 59, 59, 999);
    filters.push(lte(disposalRecords.createdAt, to));
  }

  const where = filters.length > 0 ? and(...filters) : undefined;

  const { rows, total } = await withRole(user.uid, role, async (tx) => {
    const rows = await tx
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
      })
      .from(disposalRecords)
      .leftJoin(items, eq(disposalRecords.itemId, items.itemId))
      .where(where)
      .orderBy(desc(disposalRecords.createdAt))
      .limit(pageSize)
      .offset(offset);

    const [{ value }] = await tx
      .select({ value: count() })
      .from(disposalRecords)
      .where(where);

    return { rows, total: value };
  });

  return NextResponse.json({
    data: rows,
    meta: { page, pageSize, total },
  });
}, ALL_ROLES);

/**
 * POST /api/disposal
 * Create a new disposal request.
 * Roles: inventory_manager, system_admin
 */
export const POST = withAuth(async (req: NextRequest, { user, role }) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", detail: parsed.error.flatten() }, { status: 422 });
  }

  const { item_id, disposal_type, remarks } = parsed.data;

  const result = await withRole(user.uid, role, async (tx) => {
    // Item must exist
    const [item] = await tx.select().from(items).where(eq(items.itemId, item_id)).limit(1);
    if (!item) return { error: "NOT_FOUND" } as const;

    // Item must not already be disposed
    if (item.lifecycleStatus === "disposed") {
      return { error: "ITEM_ALREADY_DISPOSED" } as const;
    }

    // Must not have an open disposal record
    const [existing] = await tx
      .select({ id: disposalRecords.id })
      .from(disposalRecords)
      .where(
        and(
          eq(disposalRecords.itemId, item_id),
          sql`${disposalRecords.status} != 'disposed'`
        )
      )
      .limit(1);

    if (existing) return { error: "DISPOSAL_ALREADY_IN_PROGRESS" } as const;

    const [created] = await tx
      .insert(disposalRecords)
      .values({
        itemId: item_id,
        disposalType: disposal_type,
        status: "requested",
        requestedBy: user.uid,
        remarks: remarks ?? null,
      })
      .returning();

    await tx.insert(auditLog).values({
      userId: user.uid,
      userRole: role,
      action: "disposal_requested",
      resource: "disposal_records",
      resourceId: created.id,
      details: { item_id, disposal_type, item_name: item.itemName },
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    });

    return { data: created } as const;
  });

  if ("error" in result) {
    const status =
      result.error === "NOT_FOUND"
        ? 404
        : result.error === "ITEM_ALREADY_DISPOSED" || result.error === "DISPOSAL_ALREADY_IN_PROGRESS"
        ? 422
        : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}, MANAGER_ABOVE);
