import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { ReportParams, ReportRow } from "../types";
import type { Role } from "@/types/auth";
import { withRole } from "@/lib/db/with-role";
import { items } from "@/lib/db/schema/items";
import { inventoryStock } from "@/lib/db/schema/inventory-stock";
import { reorderAlerts } from "@/lib/db/schema/reorder-alerts";

export const HEADERS_01 = [
  "Asset Tag", "SKU", "Item Name", "Category", "Location",
  "Qty On Hand", "Qty Reserved", "Reorder Level", "Reorder Status", "Lifecycle Status",
];

export async function queryCurrentStock(
  userId: string,
  role: Role,
  params: ReportParams
): Promise<ReportRow[]> {
  return withRole(userId, role, async (tx) => {
    const conditions = [sql`${items.lifecycleStatus} <> 'disposed'`];
    if (params.category_code) {
      conditions.push(eq(items.categoryCode, params.category_code));
    }

    // Subquery: open reorder alerts per item
    const openAlertItems = tx
      .selectDistinct({ itemId: reorderAlerts.itemId })
      .from(reorderAlerts)
      .where(eq(reorderAlerts.status, "open"))
      .as("open_alert_items");

    const rows = await tx
      .select({
        assetTag:        items.assetTag,
        sku:             items.sku,
        itemName:        items.itemName,
        categoryCode:    items.categoryCode,
        location:        inventoryStock.location,
        qtyOnHand:       inventoryStock.qtyOnHand,
        qtyReserved:     inventoryStock.qtyReserved,
        reorderLevel:    inventoryStock.reorderLevel,
        hasOpenAlert:    sql<boolean>`(${openAlertItems.itemId} IS NOT NULL)`,
        lifecycleStatus: items.lifecycleStatus,
      })
      .from(items)
      .leftJoin(inventoryStock, eq(items.itemId, inventoryStock.itemId))
      .leftJoin(openAlertItems, eq(items.itemId, openAlertItems.itemId))
      .where(and(...conditions))
      .orderBy(items.categoryCode, items.itemName);

    return rows.map((r) => [
      r.assetTag ?? "",
      r.sku ?? "",
      r.itemName,
      r.categoryCode,
      r.location ?? "",
      r.qtyOnHand ?? 0,
      r.qtyReserved ?? 0,
      r.reorderLevel ?? 0,
      r.hasOpenAlert ? "REORDER" : "OK",
      r.lifecycleStatus,
    ]);
  });
}

