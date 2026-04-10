import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { ALL_ROLES, MANAGER_ABOVE } from "@/lib/auth/permissions";
import { pmsSchedules } from "@/lib/db/schema/pms-schedules";
import { items } from "@/lib/db/schema/items";
import { itemAttributes } from "@/lib/db/schema/item-attributes";
import { auditLog } from "@/lib/db/schema/audit-log";

const createSchema = z.object({
  item_id: z.string().uuid("item_id must be a valid UUID"),
  pms_type: z.string().min(1, "pms_type is required"),
  due_date: z.string().optional(),
  due_mileage: z.coerce.number().int().positive().optional(),
  remarks: z.string().optional(),
});

/**
 * GET /api/pms
 * List PMS schedules joined with item + plate_no attribute.
 *
 * Query params:
 *   status   — pending | completed | overdue
 *   category — MP | TR  (filters by item category_code)
 *   item_id  — UUID
 *   page     — page number
 */
export const GET = withAuth(async (req: NextRequest, { user, role }) => {
  const { searchParams } = new URL(req.url);
  const statusFilter   = searchParams.get("status");
  const categoryFilter = searchParams.get("category");
  const itemIdFilter   = searchParams.get("item_id");
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = 30;
  const offset   = (page - 1) * pageSize;

  const { rows, total } = await withRole(user.uid, role, async (tx) => {
    // Resolve item IDs for category filter
    let categoryItemIds: string[] | null = null;
    if (categoryFilter && ["MP", "TR"].includes(categoryFilter)) {
      const categoryItems = await tx
        .select({ itemId: items.itemId })
        .from(items)
        .where(eq(items.categoryCode, categoryFilter));
      categoryItemIds = categoryItems.map((i) => i.itemId);
      if (categoryItemIds.length === 0) {
        return { rows: [], total: 0 };
      }
    }

    const filters: ReturnType<typeof and>[] = [];
    if (statusFilter && ["pending", "completed", "overdue"].includes(statusFilter)) {
      filters.push(eq(pmsSchedules.status, statusFilter as "pending" | "completed" | "overdue"));
    }
    if (itemIdFilter) {
      filters.push(eq(pmsSchedules.itemId, itemIdFilter));
    }
    if (categoryItemIds) {
      filters.push(inArray(pmsSchedules.itemId, categoryItemIds));
    }

    const where = filters.length > 0 ? and(...filters) : undefined;

    const rows = await tx
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
        categoryCode: items.categoryCode,
        assetTag: items.assetTag,
      })
      .from(pmsSchedules)
      .leftJoin(items, eq(pmsSchedules.itemId, items.itemId))
      .where(where)
      .orderBy(desc(pmsSchedules.createdAt))
      .limit(pageSize)
      .offset(offset);

    // Fetch plate_no for all returned items
    if (rows.length > 0) {
      const itemIds = [...new Set(rows.map((r) => r.itemId))];
      const plateAttrs = await tx
        .select({ itemId: itemAttributes.itemId, attributeValue: itemAttributes.attributeValue })
        .from(itemAttributes)
        .where(
          and(
            inArray(itemAttributes.itemId, itemIds),
            eq(itemAttributes.attributeName, "plate_no")
          )
        );
      const plateMap = new Map(plateAttrs.map((a) => [a.itemId, a.attributeValue]));
      const rowsWithPlate = rows.map((r) => ({
        ...r,
        plate_no: plateMap.get(r.itemId) ?? null,
      }));

      const [{ value }] = await tx
        .select({ value: count() })
        .from(pmsSchedules)
        .where(where);

      return { rows: rowsWithPlate, total: value };
    }

    const [{ value }] = await tx
      .select({ value: count() })
      .from(pmsSchedules)
      .where(where);

    return { rows: rows.map((r) => ({ ...r, plate_no: null })), total: value };
  });

  return NextResponse.json({ data: rows, meta: { page, pageSize, total } });
}, ALL_ROLES);

/**
 * POST /api/pms
 * Create a new PMS schedule for a Motor Pool or Transportation item.
 * Roles: inventory_manager, system_admin
 */
export const POST = withAuth(async (req: NextRequest, { user, role }) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", detail: parsed.error.flatten() }, { status: 422 });
  }

  const { item_id, pms_type, due_date, due_mileage, remarks } = parsed.data;

  const result = await withRole(user.uid, role, async (tx) => {
    const [item] = await tx
      .select({ itemId: items.itemId, categoryCode: items.categoryCode, itemName: items.itemName })
      .from(items)
      .where(eq(items.itemId, item_id))
      .limit(1);

    if (!item) return { error: "NOT_FOUND" } as const;
    if (!["MP", "TR"].includes(item.categoryCode)) {
      return { error: "INVALID_CATEGORY", detail: "PMS schedules only apply to Motor Pool (MP) and Transportation (TR) items" } as const;
    }
    if (!due_date && !due_mileage) {
      return { error: "VALIDATION_ERROR", detail: "At least one of due_date or due_mileage is required" } as const;
    }

    const [created] = await tx
      .insert(pmsSchedules)
      .values({
        itemId: item_id,
        pmsType: pms_type,
        dueDate: due_date ? new Date(due_date) : undefined,
        dueMileage: due_mileage,
        status: "pending",
        createdBy: user.uid,
      })
      .returning();

    await tx.insert(auditLog).values({
      userId: user.uid,
      userRole: role,
      action: "pms_schedule_created",
      resource: "pms_schedules",
      resourceId: created.id,
      details: { item_id, pms_type, due_date, due_mileage, item_name: item.itemName, remarks },
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    });

    return { data: created } as const;
  });

  if ("error" in result) {
    const status = result.error === "NOT_FOUND" ? 404 : 422;
    return NextResponse.json({ error: result.error, ...("detail" in result ? { detail: result.detail } : {}) }, { status });
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}, MANAGER_ABOVE);
