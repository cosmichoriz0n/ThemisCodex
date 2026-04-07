import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { eq, ilike, ne, and, sql } from "drizzle-orm";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { ALL_ROLES, MANAGER_ABOVE } from "@/lib/auth/permissions";
import { items } from "@/lib/db/schema/items";
import { itemAttributes } from "@/lib/db/schema/item-attributes";
import { inventoryStock } from "@/lib/db/schema/inventory-stock";
import { auditLog } from "@/lib/db/schema/audit-log";
import { parseItemWithAttributes } from "@/lib/validation/items";
import { generateAssetTag } from "@/lib/inventory/asset-tag";

export const GET = withAuth(async (req: NextRequest, { user, role }) => {
  const { searchParams } = new URL(req.url);
  const categoryCode = searchParams.get("category_code");
  const search = searchParams.get("search");
  const status = searchParams.get("status");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  const data = await withRole(user.uid, role, async (tx) => {
    const conditions = [];

    // Default: exclude disposed items unless status filter explicitly requests them
    if (status) {
      conditions.push(eq(items.lifecycleStatus, status as typeof items.lifecycleStatus._.data));
    } else {
      conditions.push(ne(items.lifecycleStatus, "disposed"));
    }

    if (categoryCode) {
      conditions.push(eq(items.categoryCode, categoryCode));
    }

    if (search) {
      conditions.push(
        ilike(items.itemName, `%${search}%`)
      );
    }

    const rows = await tx
      .select({
        itemId: items.itemId,
        categoryCode: items.categoryCode,
        itemName: items.itemName,
        assetTag: items.assetTag,
        sku: items.sku,
        location: items.location,
        lifecycleStatus: items.lifecycleStatus,
        createdAt: items.createdAt,
        qtyOnHand: inventoryStock.qtyOnHand,
      })
      .from(items)
      .leftJoin(inventoryStock, eq(items.itemId, inventoryStock.itemId))
      .where(and(...conditions))
      .orderBy(items.createdAt)
      .limit(pageSize)
      .offset(offset);

    const countResult = await tx
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(items)
      .where(and(...conditions));

    return { rows, total: countResult[0]?.count ?? 0 };
  });

  return NextResponse.json({
    data: data.rows,
    meta: { page, pageSize, total: data.total },
  });
}, ALL_ROLES);

export const POST = withAuth(async (req: NextRequest, { user, role }) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const categoryCode = (body as Record<string, unknown>)?.category_code;
  if (typeof categoryCode !== "string" || !categoryCode) {
    return NextResponse.json({ error: "category_code is required" }, { status: 400 });
  }

  const parsed = parseItemWithAttributes(body, categoryCode);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.errors.issues },
      { status: 422 }
    );
  }

  const { item: itemData, attributes } = parsed.data;
  const location = itemData.location ?? "main_warehouse";

  const created = await withRole(user.uid, role, async (tx) => {
    const assetTag = await generateAssetTag(tx, categoryCode);

    const [newItem] = await tx
      .insert(items)
      .values({
        categoryCode: itemData.category_code,
        itemName: itemData.item_name,
        sku: itemData.sku,
        description: itemData.description,
        location,
        barcode: assetTag,
        assetTag,
        lifecycleStatus: "acquired",
        createdBy: user.uid,
      })
      .returning();

    if (attributes.length > 0) {
      await tx.insert(itemAttributes).values(
        attributes.map((a) => ({
          itemId: newItem.itemId,
          attributeName: a.name,
          attributeValue: a.value,
        }))
      );
    }

    await tx.insert(inventoryStock).values({
      itemId: newItem.itemId,
      location,
      qtyOnHand: 0,
      qtyReserved: 0,
    });

    await tx.insert(auditLog).values({
      userId: user.uid,
      userRole: role,
      action: "item_created",
      resource: "items",
      resourceId: newItem.itemId,
      details: { categoryCode, assetTag, itemName: itemData.item_name },
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    });

    return newItem;
  });

  return NextResponse.json({ data: created }, { status: 201 });
}, MANAGER_ABOVE);
