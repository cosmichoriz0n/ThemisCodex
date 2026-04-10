import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { db } from "@/lib/db";
import { ADMIN_ONLY } from "@/lib/auth/permissions";
import { items } from "@/lib/db/schema/items";
import { itemAttributes } from "@/lib/db/schema/item-attributes";
import { integrationLog } from "@/lib/db/schema/integration-log";
import { stockMovements } from "@/lib/db/schema/stock-movements";
import { buildUpisDepreciationJournal } from "@/lib/cas/journal-mapper";
import { generateCasCsv } from "@/lib/webhooks/cas-csv";
import { uploadFile } from "@/lib/storage";

/**
 * POST /api/depreciation/run
 *
 * Manual trigger for the UPIS annual depreciation run.
 * Mirrors the logic of n8n IMIS-UPIS-DEPRECIATION.
 * Restricted to system_admin.
 *
 * Process per item:
 *   1. Fetch all active UPIS items with attributes
 *   2. Skip fully-depreciated items (accumulated >= acquisition_cost)
 *   3. Compute annual_depreciation = acquisition_cost × (rate / 100)
 *   4. POST journal to CAS2000 (Dr 5310 / Cr 1990)
 *      — If CAS2000 unavailable: generate flat-file CSV, store in Firebase Storage
 *   5. Upsert accumulated_depreciation in item_attributes (short transaction per item)
 *   6. Log to integration_log
 *
 * Query param: dry_run=true — skips all writes, returns computed values only.
 */
export const POST = withAuth(async (req: NextRequest, { user, role }) => {
  const { searchParams } = new URL(req.url);
  const isDryRun = searchParams.get("dry_run") === "true";

  const casBaseUrl = process.env.CAS2000_BASE_URL;
  const casApiKey  = process.env.CAS2000_API_KEY;

  if (!isDryRun && (!casBaseUrl || !casApiKey)) {
    return NextResponse.json(
      { error: "CAS2000_BASE_URL and CAS2000_API_KEY must be set" },
      { status: 500 }
    );
  }

  // ── Phase 1: READ — one short transaction to fetch all data ──────────────
  const { upısItems, attrMap, costMap } = await withRole(user.uid, role, async (tx) => {
    const upısItems = await tx
      .select({ itemId: items.itemId, itemName: items.itemName })
      .from(items)
      .where(
        and(
          eq(items.categoryCode, "UPIS"),
          sql`${items.lifecycleStatus} != 'disposed'`
        )
      );

    if (upısItems.length === 0) {
      return { upısItems: [], attrMap: new Map(), costMap: new Map() };
    }

    const itemIds = upısItems.map((i) => i.itemId);

    const attrs = await tx
      .select({
        itemId:         itemAttributes.itemId,
        attributeName:  itemAttributes.attributeName,
        attributeValue: itemAttributes.attributeValue,
      })
      .from(itemAttributes)
      .where(
        and(
          inArray(itemAttributes.itemId, itemIds),
          inArray(itemAttributes.attributeName, [
            "depreciation_rate",
            "accumulated_depreciation",
          ])
        )
      );

    const costs = await tx
      .select({
        itemId:   stockMovements.itemId,
        unitCost: sql<string>`MIN(${stockMovements.unitCost}::numeric)`,
      })
      .from(stockMovements)
      .where(
        and(
          inArray(stockMovements.itemId, itemIds),
          eq(stockMovements.movementType, "receive")
        )
      )
      .groupBy(stockMovements.itemId);

    const attrMap = new Map<string, Map<string, string>>();
    for (const attr of attrs) {
      if (!attrMap.has(attr.itemId)) attrMap.set(attr.itemId, new Map());
      if (attr.attributeValue != null) {
        attrMap.get(attr.itemId)!.set(attr.attributeName, attr.attributeValue);
      }
    }
    const costMap = new Map(costs.map((c) => [c.itemId, parseFloat(c.unitCost ?? "0")]));

    return { upısItems, attrMap, costMap };
  });

  if (upısItems.length === 0) {
    return NextResponse.json({ data: { items_processed: 0, total_depreciation: 0, dry_run: isDryRun, detail: [] } });
  }

  // ── Phase 2: COMPUTE + WRITE — per-item, each in its own short transaction ──
  const detail: {
    item_id: string;
    item_name: string;
    acquisition_cost: number;
    depreciation_rate: number;
    annual_depreciation: number;
    accumulated_depreciation_before: number;
    accumulated_depreciation_after: number;
    net_book_value: number;
    skipped_reason?: string;
    cas_status?: string;
    fallback_csv_path?: string;
  }[] = [];

  let totalDepreciation = 0;

  for (const item of upısItems) {
    const itemAttrs       = attrMap.get(item.itemId);
    const rateStr         = itemAttrs?.get("depreciation_rate");
    const prevAccum       = parseFloat(itemAttrs?.get("accumulated_depreciation") ?? "0");
    const acquisitionCost = costMap.get(item.itemId) ?? 0;

    // Skip: missing required attributes
    if (!rateStr || acquisitionCost <= 0) {
      detail.push({
        item_id:                         item.itemId,
        item_name:                       item.itemName,
        acquisition_cost:                acquisitionCost,
        depreciation_rate:               0,
        annual_depreciation:             0,
        accumulated_depreciation_before: prevAccum,
        accumulated_depreciation_after:  prevAccum,
        net_book_value:                  Math.max(0, acquisitionCost - prevAccum),
        skipped_reason: !rateStr
          ? "missing depreciation_rate attribute"
          : "acquisition_cost is 0 (no receive movement found)",
      });
      continue;
    }

    const rate    = parseFloat(rateStr);
    const journal = buildUpisDepreciationJournal(acquisitionCost * (rate / 100));
    const annualDepr = journal.entries[0].amount;
    const newAccum   = prevAccum + annualDepr;

    // HIGH-7: Skip fully-depreciated assets (NBV already zero)
    if (prevAccum >= acquisitionCost) {
      detail.push({
        item_id:                         item.itemId,
        item_name:                       item.itemName,
        acquisition_cost:                acquisitionCost,
        depreciation_rate:               rate,
        annual_depreciation:             0,
        accumulated_depreciation_before: prevAccum,
        accumulated_depreciation_after:  prevAccum,
        net_book_value:                  0,
        skipped_reason:                  "fully depreciated (accumulated >= acquisition_cost)",
      });
      continue;
    }

    totalDepreciation += annualDepr;

    if (isDryRun) {
      detail.push({
        item_id:                         item.itemId,
        item_name:                       item.itemName,
        acquisition_cost:                acquisitionCost,
        depreciation_rate:               rate,
        annual_depreciation:             annualDepr,
        accumulated_depreciation_before: prevAccum,
        accumulated_depreciation_after:  newAccum,
        net_book_value:                  Math.max(0, acquisitionCost - newAccum),
      });
      continue;
    }

    // ── Phase 2a: POST journal to CAS2000 (outside any DB transaction) ──────
    let casStatus: "success" | "failure" = "success";
    let casErrMsg: string | null = null;
    let fallbackCsvPath: string | undefined;

    try {
      const casRes = await fetch(`${casBaseUrl}/api/journals`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key":    casApiKey!,
        },
        body: JSON.stringify({
          journal_type: journal.journal_type,
          description:  `${journal.description} — ${item.itemName}`,
          entries:      journal.entries,
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

    // HIGH-8: CAS2000 unavailable — generate flat-file CSV fallback and store in Firebase Storage
    if (casStatus === "failure") {
      try {
        const csvContent = generateCasCsv({
          transactionId:   item.itemId,
          journalType:     journal.journal_type,
          description:     `${journal.description} — ${item.itemName}`,
          transactionDate: new Date(),
          createdBy:       user.uid,
          entries:         journal.entries,
        });
        const csvPath = `cas-fallback/depreciation/${new Date().getFullYear()}/${item.itemId}.csv`;
        await uploadFile(csvPath, Buffer.from(csvContent, "utf-8"), "text/csv");
        fallbackCsvPath = csvPath;
      } catch {
        // CSV storage failure is non-fatal — primary error already captured
      }
    }

    // ── Phase 2b: Upsert accumulated_depreciation (short transaction per item) ──
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL app.user_id = ${user.uid}`);
      await tx.execute(sql`SET LOCAL app.user_role = 'system_admin'`);

      await tx
        .insert(itemAttributes)
        .values({
          itemId:         item.itemId,
          attributeName:  "accumulated_depreciation",
          attributeValue: newAccum.toFixed(4),
        })
        .onConflictDoUpdate({
          target: [itemAttributes.itemId, itemAttributes.attributeName],
          set: {
            attributeValue: newAccum.toFixed(4),
            updatedAt:      new Date(),
          },
        });

      await tx.insert(integrationLog).values({
        sourceSystem: "CAS2000",
        operation:    "IMIS-UPIS-DEPRECIATION",
        status:       casStatus,
        payload: {
          item_id:              item.itemId,
          annual_depreciation:  annualDepr,
          journal,
          ...(fallbackCsvPath ? { fallback_csv_path: fallbackCsvPath } : {}),
        },
        errorMsg:   casErrMsg,
        retryCount: 0,
      });
    });

    detail.push({
      item_id:                         item.itemId,
      item_name:                       item.itemName,
      acquisition_cost:                acquisitionCost,
      depreciation_rate:               rate,
      annual_depreciation:             annualDepr,
      accumulated_depreciation_before: prevAccum,
      accumulated_depreciation_after:  newAccum,
      net_book_value:                  Math.max(0, acquisitionCost - newAccum),
      cas_status:                      casStatus,
      ...(fallbackCsvPath ? { fallback_csv_path: fallbackCsvPath } : {}),
    });
  }

  return NextResponse.json({
    data: {
      items_processed:    detail.filter((d) => !d.skipped_reason).length,
      total_depreciation: totalDepreciation,
      dry_run:            isDryRun,
      detail,
    },
  });
}, ADMIN_ONLY);
