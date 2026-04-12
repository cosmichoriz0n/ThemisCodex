import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { ReportParams, ReportRow } from "../types";
import type { Role } from "@/types/auth";
import { withRole } from "@/lib/db/with-role";
import { items } from "@/lib/db/schema/items";
import { inventoryStock } from "@/lib/db/schema/inventory-stock";
import { stockMovements } from "@/lib/db/schema/stock-movements";
import { categoryCodes } from "@/lib/db/schema/category-codes";

export const HEADERS_08 = [
  "Asset Tag", "SKU", "Item Name", "Category", "Category Name",
  "NEA Account", "Location", "Qty On Hand",
  "Unit Cost (PHP)", "Total Value (PHP)", "Lifecycle Status",
];

export async function queryInventoryValuation(
  userId: string,
  role: Role,
  params: ReportParams
): Promise<ReportRow[]> {
  return withRole(userId, role, async (tx) => {
    // Unit cost: most recent "receive" movement's unit_cost per item
    const latestUnitCost = tx
      .selectDistinctOn([stockMovements.itemId], {
        itemId:   stockMovements.itemId,
        unitCost: stockMovements.unitCost,
      })
      .from(stockMovements)
      .where(eq(stockMovements.movementType, "receive"))
      .orderBy(stockMovements.itemId, sql`${stockMovements.movedAt} DESC`)
      .as("latest_unit_cost");

    const conditions = [sql`${items.lifecycleStatus} <> 'disposed'`];
    if (params.category_code) {
      conditions.push(eq(items.categoryCode, params.category_code));
    }

    const rows = await tx
      .select({
        assetTag:        items.assetTag,
        sku:             items.sku,
        itemName:        items.itemName,
        categoryCode:    items.categoryCode,
        categoryName:    categoryCodes.name,
        neaAccountCode:  categoryCodes.neaAccountCode,
        location:        inventoryStock.location,
        qtyOnHand:       inventoryStock.qtyOnHand,
        unitCost:        latestUnitCost.unitCost,
        totalValue:      sql<number>`
          COALESCE(${inventoryStock.qtyOnHand}, 0) *
          COALESCE(${latestUnitCost.unitCost}::numeric, 0)
        `.mapWith(Number),
        lifecycleStatus: items.lifecycleStatus,
      })
      .from(items)
      .innerJoin(categoryCodes, eq(items.categoryCode, categoryCodes.code))
      .leftJoin(inventoryStock, eq(items.itemId, inventoryStock.itemId))
      .leftJoin(latestUnitCost, eq(items.itemId, latestUnitCost.itemId))
      .where(and(...conditions))
      .orderBy(items.categoryCode, items.itemName);

    return rows.map((r) => [
      r.assetTag ?? "",
      r.sku ?? "",
      r.itemName,
      r.categoryCode,
      r.categoryName,
      r.neaAccountCode ?? "",
      r.location ?? "",
      r.qtyOnHand ?? 0,
      r.unitCost ? Number(r.unitCost).toFixed(4) : "0.0000",
      r.totalValue.toFixed(2),
      r.lifecycleStatus,
    ]);
  });
}
