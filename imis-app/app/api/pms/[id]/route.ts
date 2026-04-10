import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { ALL_ROLES } from "@/lib/auth/permissions";
import { pmsSchedules } from "@/lib/db/schema/pms-schedules";
import { items } from "@/lib/db/schema/items";
import { itemAttributes } from "@/lib/db/schema/item-attributes";

/**
 * GET /api/pms/[id]
 * Fetch a single PMS schedule with vehicle info and full maintenance history.
 * History = all pms_schedules rows for the same item_id, ordered desc.
 * Roles: all
 */
export const GET = withAuth(async (_req: NextRequest, { user, role, params }) => {
  const { id } = params;

  const result = await withRole(user.uid, role, async (tx) => {
    const [schedule] = await tx
      .select({
        id: pmsSchedules.id,
        itemId: pmsSchedules.itemId,
        pmsType: pmsSchedules.pmsType,
        dueDate: pmsSchedules.dueDate,
        dueMileage: pmsSchedules.dueMileage,
        lastDoneAt: pmsSchedules.lastDoneAt,
        lastMileage: pmsSchedules.lastMileage,
        status: pmsSchedules.status,
        createdBy: pmsSchedules.createdBy,
        createdAt: pmsSchedules.createdAt,
        updatedAt: pmsSchedules.updatedAt,
        itemName: items.itemName,
        assetTag: items.assetTag,
        categoryCode: items.categoryCode,
        location: items.location,
      })
      .from(pmsSchedules)
      .leftJoin(items, eq(pmsSchedules.itemId, items.itemId))
      .where(eq(pmsSchedules.id, id))
      .limit(1);

    if (!schedule) return null;

    // Vehicle attributes — fetch only relevant fields for MP/TR items
    const attrs = await tx
      .select({ attributeName: itemAttributes.attributeName, attributeValue: itemAttributes.attributeValue })
      .from(itemAttributes)
      .where(
        and(
          eq(itemAttributes.itemId, schedule.itemId),
          inArray(itemAttributes.attributeName, ["plate_no", "make", "model", "year", "mileage", "or_no", "insurance_expiry"])
        )
      );

    const attrMap = Object.fromEntries(
      attrs
        .filter((a) => a.attributeValue != null)
        .map((a) => [a.attributeName, a.attributeValue!])
    );

    // Full maintenance history (all pms_schedules for this item, desc)
    const history = await tx
      .select({
        id: pmsSchedules.id,
        pmsType: pmsSchedules.pmsType,
        dueDate: pmsSchedules.dueDate,
        dueMileage: pmsSchedules.dueMileage,
        lastDoneAt: pmsSchedules.lastDoneAt,
        lastMileage: pmsSchedules.lastMileage,
        status: pmsSchedules.status,
        createdAt: pmsSchedules.createdAt,
        updatedAt: pmsSchedules.updatedAt,
      })
      .from(pmsSchedules)
      .where(eq(pmsSchedules.itemId, schedule.itemId))
      .orderBy(desc(pmsSchedules.updatedAt));

    return { schedule, attrs: attrMap, history };
  });

  if (!result) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ data: result });
}, ALL_ROLES);
