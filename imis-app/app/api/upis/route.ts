import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { items } from "@/lib/db/schema/items";
import { itemAttributes } from "@/lib/db/schema/item-attributes";
import { stockMovements } from "@/lib/db/schema/stock-movements";

const ALLOWED_ROLES = ["inventory_manager", "finance_officer", "system_admin", "auditor"] as const;

/**
 * GET /api/upis
 * List all UPIS items with depreciation schedule data.
 * Returns: acquisition_cost, depreciation_rate, accumulated_depreciation, net_book_value per asset.
 *
 * Query params:
 *   feeder          — filter by feeder attribute value
 *   lifecycle_status — filter by item lifecycle status
 */
export const GET = withAuth(async (req: NextRequest, { user, role }) => {
  const { searchParams } = new URL(req.url);
  const feederFilter = searchParams.get("feeder");
  const lifecycleFilter = searchParams.get("lifecycle_status");

  const { upisItems, attrRows, costRows } = await withRole(user.uid, role, async (tx) => {
    const lifecycleWhere = lifecycleFilter
      ? and(eq(items.categoryCode, "UPIS"), eq(items.lifecycleStatus, lifecycleFilter as "acquired" | "in_stock" | "in_service" | "under_repair" | "returned" | "disposed"))
      : eq(items.categoryCode, "UPIS");

    const upisItems = await tx
      .select({
        itemId: items.itemId,
        itemName: items.itemName,
        assetTag: items.assetTag,
        lifecycleStatus: items.lifecycleStatus,
        location: items.location,
      })
      .from(items)
      .where(lifecycleWhere);

    if (upisItems.length === 0) {
      return { upisItems: [], attrRows: [], costRows: [] };
    }

    const itemIds = upisItems.map((i) => i.itemId);

    const attrRows = await tx
      .select({
        itemId: itemAttributes.itemId,
        attributeName: itemAttributes.attributeName,
        attributeValue: itemAttributes.attributeValue,
      })
      .from(itemAttributes)
      .where(
        and(
          inArray(itemAttributes.itemId, itemIds),
          inArray(itemAttributes.attributeName, [
            "nea_asset_code",
            "feeder",
            "depreciation_rate",
            "accumulated_depreciation",
            "installation_date",
          ])
        )
      );

    const costRows = await tx
      .select({
        itemId: stockMovements.itemId,
        acquisitionCost: sql<string>`MIN(${stockMovements.unitCost}::numeric)`,
      })
      .from(stockMovements)
      .where(
        and(
          inArray(stockMovements.itemId, itemIds),
          eq(stockMovements.movementType, "receive")
        )
      )
      .groupBy(stockMovements.itemId);

    return { upisItems, attrRows, costRows };
  });

  // Build attribute map
  const attrMap = new Map<string, Map<string, string>>();
  for (const row of attrRows) {
    if (!attrMap.has(row.itemId)) attrMap.set(row.itemId, new Map());
    if (row.attributeValue != null) {
      attrMap.get(row.itemId)!.set(row.attributeName, row.attributeValue);
    }
  }
  const costMap = new Map(costRows.map((r) => [r.itemId, parseFloat(r.acquisitionCost ?? "0")]));

  const data = upisItems
    .map((item) => {
      const attrs = attrMap.get(item.itemId) ?? new Map();
      const acquisitionCost = costMap.get(item.itemId) ?? 0;
      const depreciationRate = parseFloat(attrs.get("depreciation_rate") ?? "0");
      const accumulatedDepr = parseFloat(attrs.get("accumulated_depreciation") ?? "0");
      const netBookValue = Math.max(0, acquisitionCost - accumulatedDepr);
      const feeder = attrs.get("feeder") ?? null;

      return {
        item_id: item.itemId,
        asset_tag: item.assetTag,
        item_name: item.itemName,
        lifecycle_status: item.lifecycleStatus,
        location: item.location,
        nea_asset_code: attrs.get("nea_asset_code") ?? null,
        feeder,
        installation_date: attrs.get("installation_date") ?? null,
        acquisition_cost: acquisitionCost,
        depreciation_rate: depreciationRate,
        accumulated_depreciation: accumulatedDepr,
        net_book_value: netBookValue,
        annual_depreciation: acquisitionCost > 0 ? acquisitionCost * (depreciationRate / 100) : 0,
        nbv_pct: acquisitionCost > 0 ? (netBookValue / acquisitionCost) * 100 : 0,
      };
    })
    .filter((item) => !feederFilter || item.feeder === feederFilter);

  // Totals
  const totals = data.reduce(
    (acc, item) => ({
      total_acquisition_cost: acc.total_acquisition_cost + item.acquisition_cost,
      total_accumulated_depreciation: acc.total_accumulated_depreciation + item.accumulated_depreciation,
      total_net_book_value: acc.total_net_book_value + item.net_book_value,
    }),
    { total_acquisition_cost: 0, total_accumulated_depreciation: 0, total_net_book_value: 0 }
  );

  const feeders = [...new Set(data.map((i) => i.feeder).filter(Boolean))].sort();

  return NextResponse.json({
    data,
    meta: {
      count: data.length,
      feeders,
      ...totals,
    },
  });
}, ALLOWED_ROLES as unknown as import("@/types/auth").Role[]);
