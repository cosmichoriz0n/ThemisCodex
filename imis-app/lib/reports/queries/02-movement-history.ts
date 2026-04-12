import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { ReportParams, ReportRow } from "../types";
import type { Role } from "@/types/auth";
import { withRole } from "@/lib/db/with-role";
import { items } from "@/lib/db/schema/items";
import { stockMovements } from "@/lib/db/schema/stock-movements";
import { members } from "@/lib/db/schema/members";

export const HEADERS_02 = [
  "Date/Time (PHT)", "Item Name", "Asset Tag", "Category", "Movement Type",
  "Quantity", "Unit Cost", "Reference No", "From Location", "To Location",
  "Member Name", "Performed By", "Remarks",
];

export async function queryMovementHistory(
  userId: string,
  role: Role,
  params: ReportParams
): Promise<ReportRow[]> {
  return withRole(userId, role, async (tx) => {
    const conditions = [];
    if (params.category_code) {
      conditions.push(eq(items.categoryCode, params.category_code));
    }
    if (params.item_id) {
      conditions.push(eq(stockMovements.itemId, params.item_id));
    }
    if (params.member_id) {
      conditions.push(eq(stockMovements.memberId, params.member_id));
    }
    if (params.movement_type) {
      conditions.push(
        eq(
          stockMovements.movementType,
          params.movement_type as typeof stockMovements.movementType._.data
        )
      );
    }
    if (params.date_from) {
      conditions.push(gte(stockMovements.movedAt, new Date(params.date_from)));
    }
    if (params.date_to) {
      // Include the full day
      const end = new Date(params.date_to);
      end.setUTCHours(23, 59, 59, 999);
      conditions.push(lte(stockMovements.movedAt, end));
    }

    const rows = await tx
      .select({
        movedAt:      stockMovements.movedAt,
        itemName:     items.itemName,
        assetTag:     items.assetTag,
        categoryCode: items.categoryCode,
        movementType: stockMovements.movementType,
        quantity:     stockMovements.quantity,
        unitCost:     stockMovements.unitCost,
        referenceNo:  stockMovements.referenceNo,
        fromLocation: stockMovements.fromLocation,
        toLocation:   stockMovements.toLocation,
        memberId:     stockMovements.memberId,
        memberName:   members.fullName,
        movedBy:      stockMovements.movedBy,
        remarks:      stockMovements.remarks,
      })
      .from(stockMovements)
      .innerJoin(items, eq(stockMovements.itemId, items.itemId))
      .leftJoin(members, eq(stockMovements.memberId, members.mimsMemberId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(sql`${stockMovements.movedAt} DESC`)
      .limit(5000); // cap to avoid huge reports

    return rows.map((r) => [
      new Date(r.movedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" }),
      r.itemName,
      r.assetTag ?? "",
      r.categoryCode,
      r.movementType,
      r.quantity,
      r.unitCost ? Number(r.unitCost).toFixed(4) : "",
      r.referenceNo ?? "",
      r.fromLocation ?? "",
      r.toLocation ?? "",
      r.memberName ?? r.memberId ?? "",
      r.movedBy,
      r.remarks ?? "",
    ]);
  });
}
