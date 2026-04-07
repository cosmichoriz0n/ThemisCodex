import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { sql, desc, eq, and, gte, lte } from "drizzle-orm";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { ALL_ROLES } from "@/lib/auth/permissions";
import { stockMovements } from "@/lib/db/schema/stock-movements";
import { items } from "@/lib/db/schema/items";
import { inventoryStock } from "@/lib/db/schema/inventory-stock";
import { lifecycleEvents } from "@/lib/db/schema/lifecycle-events";

// GET /api/movements/[itemId] — movement history + lifecycle events for one item
export const GET = withAuth(async (req: NextRequest, { user, role, params }) => {
  const { itemId } = params;
  const { searchParams } = new URL(req.url);
  const movementType = searchParams.get("movement_type");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  const data = await withRole(user.uid, role, async (tx) => {
    // Verify item exists
    const [item] = await tx
      .select({
        itemId:          items.itemId,
        itemName:        items.itemName,
        assetTag:        items.assetTag,
        categoryCode:    items.categoryCode,
        lifecycleStatus: items.lifecycleStatus,
        location:        items.location,
      })
      .from(items)
      .where(eq(items.itemId, itemId))
      .limit(1);

    if (!item) return null;

    // Build movement filters
    const conditions: ReturnType<typeof eq>[] = [
      eq(stockMovements.itemId, itemId),
    ];
    if (movementType) {
      conditions.push(
        eq(
          stockMovements.movementType,
          movementType as typeof stockMovements.movementType._.data
        )
      );
    }
    if (dateFrom) conditions.push(gte(stockMovements.movedAt, new Date(dateFrom)) as ReturnType<typeof eq>);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(stockMovements.movedAt, end) as ReturnType<typeof eq>);
    }

    const movements = await tx
      .select()
      .from(stockMovements)
      .where(and(...conditions))
      .orderBy(desc(stockMovements.movedAt))
      .limit(pageSize)
      .offset(offset);

    const [{ count }] = await tx
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(stockMovements)
      .where(and(...conditions));

    // Stock snapshot per location
    const stock = await tx
      .select()
      .from(inventoryStock)
      .where(eq(inventoryStock.itemId, itemId));

    // Full lifecycle event history
    const lifecycle = await tx
      .select()
      .from(lifecycleEvents)
      .where(eq(lifecycleEvents.itemId, itemId))
      .orderBy(desc(lifecycleEvents.eventAt));

    return {
      item,
      movements,
      stock,
      lifecycle,
      total: count ?? 0,
    };
  });

  if (!data) {
    return NextResponse.json({ error: "ITEM_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      item:      data.item,
      stock:     data.stock,
      lifecycle: data.lifecycle,
      movements: data.movements,
    },
    meta: { page, pageSize, total: data.total },
  });
}, ALL_ROLES);
