import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { eq, sql, desc, and } from "drizzle-orm";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { ALL_ROLES } from "@/lib/auth/permissions";
import { items } from "@/lib/db/schema/items";
import { inventoryStock } from "@/lib/db/schema/inventory-stock";
import { reorderAlerts } from "@/lib/db/schema/reorder-alerts";
import { stockMovements } from "@/lib/db/schema/stock-movements";
import { integrationLog } from "@/lib/db/schema/integration-log";

// GET /api/dashboard — all data for the admin dashboard in one request
export const GET = withAuth(async (req: NextRequest, { user, role }) => {
  const data = await withRole(user.uid, role, async (tx) => {

    // 1. Total active items
    const [{ totalItems }] = await tx
      .select({ totalItems: sql<number>`COUNT(*)::int` })
      .from(items)
      .where(sql`lifecycle_status <> 'disposed'`);

    // 2. Open alerts by type
    const alertCounts = await tx
      .select({
        alertType: reorderAlerts.alertType,
        count:     sql<number>`COUNT(*)::int`,
      })
      .from(reorderAlerts)
      .where(eq(reorderAlerts.status, "open"))
      .groupBy(reorderAlerts.alertType);

    const totalOpenAlerts = alertCounts.reduce((sum, r) => sum + r.count, 0);

    // 3. Stock totals per category (sum of qty_on_hand across all locations)
    const stockByCategory = await tx
      .select({
        categoryCode: items.categoryCode,
        totalOnHand:  sql<number>`COALESCE(SUM(${inventoryStock.qtyOnHand}), 0)::int`,
        itemCount:    sql<number>`COUNT(DISTINCT ${items.itemId})::int`,
      })
      .from(items)
      .leftJoin(inventoryStock, eq(inventoryStock.itemId, items.itemId))
      .where(sql`${items.lifecycleStatus} <> 'disposed'`)
      .groupBy(items.categoryCode)
      .orderBy(items.categoryCode);

    // 4. Recent movements (last 10)
    const recentMovements = await tx
      .select({
        movementId:   stockMovements.movementId,
        itemId:       stockMovements.itemId,
        itemName:     items.itemName,
        categoryCode: items.categoryCode,
        movementType: stockMovements.movementType,
        quantity:     stockMovements.quantity,
        movedBy:      stockMovements.movedBy,
        movedAt:      stockMovements.movedAt,
      })
      .from(stockMovements)
      .innerJoin(items, eq(stockMovements.itemId, items.itemId))
      .orderBy(desc(stockMovements.movedAt))
      .limit(10);

    // 5. Integration health — last sync time per source system
    const integrationSystems = ["MIMS", "EBS2000", "CAS2000"] as const;
    const integrationHealth: Record<string, { lastSync: string | null; lastStatus: string | null }> = {};

    for (const system of integrationSystems) {
      const [latest] = await tx
        .select({
          createdAt: integrationLog.createdAt,
          status:    integrationLog.status,
        })
        .from(integrationLog)
        .where(eq(integrationLog.sourceSystem, system))
        .orderBy(desc(integrationLog.createdAt))
        .limit(1);

      integrationHealth[system] = {
        lastSync:   latest?.createdAt?.toISOString() ?? null,
        lastStatus: latest?.status ?? null,
      };
    }

    return {
      totalItems,
      totalOpenAlerts,
      alertCounts,
      stockByCategory,
      recentMovements,
      integrationHealth,
    };
  });

  return NextResponse.json({ data });
}, ALL_ROLES);
