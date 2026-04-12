import "server-only";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { ReportParams, ReportRow } from "../types";
import type { Role } from "@/types/auth";
import { withRole } from "@/lib/db/with-role";
import { items } from "@/lib/db/schema/items";
import { pmsSchedules } from "@/lib/db/schema/pms-schedules";
import { itemAttributes } from "@/lib/db/schema/item-attributes";

export const HEADERS_06 = [
  "Asset Tag", "Category", "Item Name", "Plate No",
  "PMS Type", "Due Date", "Due Mileage",
  "Last Done", "Last Mileage", "PMS Status", "Days Until Due",
];

export async function queryPmsDue(
  userId: string,
  role: Role,
  params: ReportParams
): Promise<ReportRow[]> {
  return withRole(userId, role, async (tx) => {
    const windowDays = params.pms_window_days ?? 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + windowDays);

    // Plate number from item_attributes.
    // unique constraint (item_id, attribute_name) guarantees at most one row per item —
    // no aggregation needed; selectDistinctOn + groupBy conflict, use plain select.
    const plateAttr = tx
      .select({
        itemId:  itemAttributes.itemId,
        plateNo: itemAttributes.attributeValue,
      })
      .from(itemAttributes)
      .where(eq(itemAttributes.attributeName, "plate_no"))
      .as("plate_attr");

    const rows = await tx
      .select({
        assetTag:     items.assetTag,
        categoryCode: items.categoryCode,
        itemName:     items.itemName,
        plateNo:      plateAttr.plateNo,
        pmsType:      pmsSchedules.pmsType,
        dueDate:      pmsSchedules.dueDate,
        dueMileage:   pmsSchedules.dueMileage,
        lastDoneAt:   pmsSchedules.lastDoneAt,
        lastMileage:  pmsSchedules.lastMileage,
        status:       pmsSchedules.status,
        daysUntilDue: sql<number>`
          EXTRACT(EPOCH FROM (${pmsSchedules.dueDate} - NOW())) / 86400.0
        `.mapWith(Number),
      })
      .from(pmsSchedules)
      .innerJoin(items, eq(pmsSchedules.itemId, items.itemId))
      .leftJoin(plateAttr, eq(items.itemId, plateAttr.itemId))
      .where(
        and(
          inArray(items.categoryCode, ["MP", "TR"]),
          lte(pmsSchedules.dueDate, cutoff)
        )
      )
      .orderBy(pmsSchedules.dueDate);

    return rows.map((r) => [
      r.assetTag ?? "",
      r.categoryCode,
      r.itemName,
      r.plateNo ?? "",
      r.pmsType,
      r.dueDate
        ? new Date(r.dueDate).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })
        : "",
      r.dueMileage ?? "",
      r.lastDoneAt
        ? new Date(r.lastDoneAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })
        : "",
      r.lastMileage ?? "",
      r.status,
      r.daysUntilDue != null ? Math.floor(r.daysUntilDue) : "",
    ]);
  });
}
