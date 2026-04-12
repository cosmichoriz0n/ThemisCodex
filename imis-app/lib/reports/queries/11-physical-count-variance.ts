import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { ReportParams, ReportRow } from "../types";
import type { Role } from "@/types/auth";
import { withRole } from "@/lib/db/with-role";
import { items } from "@/lib/db/schema/items";
import { inventoryStock } from "@/lib/db/schema/inventory-stock";
import { stockMovements } from "@/lib/db/schema/stock-movements";

export const HEADERS_11 = [
  "Asset Tag", "SKU", "Item Name", "Category",
  "Location", "System Qty", "Last Count Qty",
  "Variance", "Last Counted Date",
];

export async function queryPhysicalCountVariance(
  userId: string,
  role: Role,
  params: ReportParams
): Promise<ReportRow[]> {
  return withRole(userId, role, async (tx) => {
    // "Last count qty" = quantity from the most recent 'adjust' movement per item+location
    // (Physical count reconciliation posts adjustments to sync stock)
    const latestAdjust = tx
      .selectDistinctOn([stockMovements.itemId, stockMovements.toLocation], {
        itemId:    stockMovements.itemId,
        location:  stockMovements.toLocation,
        qty:       stockMovements.quantity,
        movedAt:   stockMovements.movedAt,
      })
      .from(stockMovements)
      .where(eq(stockMovements.movementType, "adjust"))
      .orderBy(
        stockMovements.itemId,
        stockMovements.toLocation,
        sql`${stockMovements.movedAt} DESC`
      )
      .as("latest_adjust");

    const conditions = [sql`${items.lifecycleStatus} <> 'disposed'`];
    if (params.category_code) {
      conditions.push(eq(items.categoryCode, params.category_code));
    }
    if (params.location) {
      conditions.push(eq(inventoryStock.location, params.location));
    }

    const rows = await tx
      .select({
        assetTag:      items.assetTag,
        sku:           items.sku,
        itemName:      items.itemName,
        categoryCode:  items.categoryCode,
        location:      inventoryStock.location,
        systemQty:     inventoryStock.qtyOnHand,
        lastCountQty:  latestAdjust.qty,
        lastCountedAt: latestAdjust.movedAt,
        variance:      sql<number>`
          COALESCE(${latestAdjust.qty}, ${inventoryStock.qtyOnHand}) - ${inventoryStock.qtyOnHand}
        `.mapWith(Number),
      })
      .from(items)
      .innerJoin(inventoryStock, eq(items.itemId, inventoryStock.itemId))
      .leftJoin(
        latestAdjust,
        and(
          eq(items.itemId, latestAdjust.itemId),
          eq(inventoryStock.location, latestAdjust.location)
        )
      )
      .where(and(...conditions))
      .orderBy(items.categoryCode, items.itemName);

    return rows.map((r) => [
      r.assetTag ?? "",
      r.sku ?? "",
      r.itemName,
      r.categoryCode,
      r.location,
      r.systemQty,
      r.lastCountQty ?? "N/A",
      r.variance,
      r.lastCountedAt
        ? new Date(r.lastCountedAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })
        : "Never counted",
    ]);
  });
}
