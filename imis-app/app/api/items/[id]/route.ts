import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { ALL_ROLES, MANAGER_ABOVE } from "@/lib/auth/permissions";
import { items } from "@/lib/db/schema/items";
import { itemAttributes } from "@/lib/db/schema/item-attributes";
import { lifecycleEvents } from "@/lib/db/schema/lifecycle-events";
import { auditLog } from "@/lib/db/schema/audit-log";
import { parseItemWithAttributes } from "@/lib/validation/items";

export const GET = withAuth(async (_req: NextRequest, { user, role, params }) => {
  const { id } = params;

  const data = await withRole(user.uid, role, async (tx) => {
    const [item] = await tx
      .select()
      .from(items)
      .where(eq(items.itemId, id))
      .limit(1);

    if (!item) return null;

    const attrs = await tx
      .select()
      .from(itemAttributes)
      .where(eq(itemAttributes.itemId, id));

    const events = await tx
      .select()
      .from(lifecycleEvents)
      .where(eq(lifecycleEvents.itemId, id))
      .orderBy(lifecycleEvents.eventAt);

    return { item, attributes: attrs, lifecycleHistory: events };
  });

  if (!data) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ data });
}, ALL_ROLES);

export const PATCH = withAuth(async (req: NextRequest, { user, role, params }) => {
  const { id } = params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  // Fetch existing item to get category_code for validation
  const existing = await withRole(user.uid, role, async (tx) => {
    const [row] = await tx.select().from(items).where(eq(items.itemId, id)).limit(1);
    return row;
  });

  if (!existing) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const categoryCode = existing.categoryCode;
  const parsed = parseItemWithAttributes(
    { ...body as object, category_code: categoryCode },
    categoryCode
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.errors.issues },
      { status: 422 }
    );
  }

  const { item: itemData, attributes } = parsed.data;

  await withRole(user.uid, role, async (tx) => {
    await tx
      .update(items)
      .set({
        itemName: itemData.item_name,
        sku: itemData.sku,
        description: itemData.description,
        location: itemData.location,
        updatedAt: new Date(),
      })
      .where(eq(items.itemId, id));

    // Upsert each attribute: delete old ones for this item then re-insert
    await tx.delete(itemAttributes).where(eq(itemAttributes.itemId, id));
    if (attributes.length > 0) {
      await tx.insert(itemAttributes).values(
        attributes.map((a) => ({
          itemId: id,
          attributeName: a.name,
          attributeValue: a.value,
        }))
      );
    }

    await tx.insert(auditLog).values({
      userId: user.uid,
      userRole: role,
      action: "item_updated",
      resource: "items",
      resourceId: id,
      details: { categoryCode, itemName: itemData.item_name },
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    });
  });

  return NextResponse.json({ success: true });
}, MANAGER_ABOVE);
