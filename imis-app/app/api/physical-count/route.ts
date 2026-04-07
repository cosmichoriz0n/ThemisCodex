import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { ALL_ROLES } from "@/lib/auth/permissions";
import { inventoryStock } from "@/lib/db/schema/inventory-stock";
import { items } from "@/lib/db/schema/items";

// GET /api/physical-count?location=main_warehouse
// Returns all items at the given location with current system qty
export const GET = withAuth(async (req: NextRequest, { user, role }) => {
  const { searchParams } = new URL(req.url);
  const location = searchParams.get("location") ?? "main_warehouse";

  const rows = await withRole(user.uid, role, async (tx) => {
    return tx
      .select({
        itemId:       items.itemId,
        itemName:     items.itemName,
        assetTag:     items.assetTag,
        categoryCode: items.categoryCode,
        location:     inventoryStock.location,
        qtyOnHand:    inventoryStock.qtyOnHand,
        reorderLevel: inventoryStock.reorderLevel,
      })
      .from(inventoryStock)
      .innerJoin(items, eq(inventoryStock.itemId, items.itemId))
      .where(eq(inventoryStock.location, location))
      .orderBy(items.categoryCode, items.itemName);
  });

  return NextResponse.json({ data: rows, location });
}, ALL_ROLES);

interface CountEntry {
  item_id: string;
  physical_qty: number;
}

interface VarianceRow {
  itemId:       string;
  itemName:     string;
  assetTag:     string | null;
  categoryCode: string;
  location:     string;
  systemQty:    number;
  physicalQty:  number;
  variance:     number;
}

// POST /api/physical-count
// Body: { location: string, counts: Array<{ item_id, physical_qty }> }
// Returns variance report — does NOT modify stock
export const POST = withAuth(async (req: NextRequest, { user, role }) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const { location, counts } = body as { location?: string; counts?: CountEntry[] };
  if (!location || typeof location !== "string") {
    return NextResponse.json({ error: "location is required" }, { status: 400 });
  }
  if (!Array.isArray(counts) || counts.length === 0) {
    return NextResponse.json({ error: "counts array is required" }, { status: 400 });
  }

  // Validate count entries
  for (const c of counts) {
    if (!c.item_id || typeof c.item_id !== "string") {
      return NextResponse.json({ error: "Each count entry must have item_id" }, { status: 400 });
    }
    if (typeof c.physical_qty !== "number" || c.physical_qty < 0) {
      return NextResponse.json({ error: "physical_qty must be a non-negative number" }, { status: 400 });
    }
  }

  // Fetch system quantities for all submitted item IDs
  const itemIds = counts.map((c) => c.item_id);

  const systemRows = await withRole(user.uid, role, async (tx) => {
    return tx
      .select({
        itemId:       items.itemId,
        itemName:     items.itemName,
        assetTag:     items.assetTag,
        categoryCode: items.categoryCode,
        location:     inventoryStock.location,
        qtyOnHand:    inventoryStock.qtyOnHand,
      })
      .from(inventoryStock)
      .innerJoin(items, eq(inventoryStock.itemId, items.itemId))
      .where(eq(inventoryStock.location, location));
  });

  // Build variance report
  const systemMap = new Map(systemRows.map((r) => [r.itemId, r]));
  const report: VarianceRow[] = [];
  let totalVariance = 0;

  for (const count of counts) {
    const sys = systemMap.get(count.item_id);
    if (!sys) continue; // item not found at this location
    const variance = count.physical_qty - sys.qtyOnHand;
    totalVariance += Math.abs(variance);
    report.push({
      itemId:       sys.itemId,
      itemName:     sys.itemName,
      assetTag:     sys.assetTag,
      categoryCode: sys.categoryCode,
      location:     sys.location,
      systemQty:    sys.qtyOnHand,
      physicalQty:  count.physical_qty,
      variance,
    });
  }

  // Items in system but NOT counted — list as missing from count
  for (const sys of systemRows) {
    if (!itemIds.includes(sys.itemId)) {
      report.push({
        itemId:       sys.itemId,
        itemName:     sys.itemName,
        assetTag:     sys.assetTag,
        categoryCode: sys.categoryCode,
        location:     sys.location,
        systemQty:    sys.qtyOnHand,
        physicalQty:  0,
        variance:     -sys.qtyOnHand,
      });
      totalVariance += sys.qtyOnHand;
    }
  }

  const hasVariance = report.some((r) => r.variance !== 0);

  return NextResponse.json({
    data: {
      location,
      counted_at:     new Date().toISOString(),
      counted_by:     user.uid,
      items_counted:  counts.length,
      total_items:    systemRows.length,
      total_variance: totalVariance,
      has_variance:   hasVariance,
      report,
    },
  });
}, ALL_ROLES);
