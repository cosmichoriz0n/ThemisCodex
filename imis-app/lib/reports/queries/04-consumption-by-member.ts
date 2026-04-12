import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { ReportParams, ReportRow } from "../types";
import type { Role } from "@/types/auth";
import { withRole } from "@/lib/db/with-role";
import { items } from "@/lib/db/schema/items";
import { stockMovements } from "@/lib/db/schema/stock-movements";
import { members } from "@/lib/db/schema/members";

export const HEADERS_04 = [
  "Member ID", "Member Name", "Membership Type",
  "Category", "Item Name", "Total Qty Issued",
  "Total Value (PHP)", "Last Issued Date",
];

export async function queryConsumptionByMember(
  userId: string,
  role: Role,
  params: ReportParams
): Promise<ReportRow[]> {
  return withRole(userId, role, async (tx) => {
    const conditions = [
      eq(stockMovements.movementType, "issue"),
    ];
    if (params.member_id) {
      conditions.push(eq(stockMovements.memberId, params.member_id));
    }
    if (params.category_code) {
      conditions.push(eq(items.categoryCode, params.category_code));
    }
    if (params.date_from) {
      conditions.push(gte(stockMovements.movedAt, new Date(params.date_from)));
    }
    if (params.date_to) {
      const end = new Date(params.date_to);
      end.setUTCHours(23, 59, 59, 999);
      conditions.push(lte(stockMovements.movedAt, end));
    }

    const rows = await tx
      .select({
        memberId:       stockMovements.memberId,
        memberName:     members.fullName,
        membershipType: members.membershipType,
        categoryCode:   items.categoryCode,
        itemName:       items.itemName,
        totalQty:       sql<number>`SUM(${stockMovements.quantity})`.mapWith(Number),
        totalValue:     sql<number>`
          SUM(${stockMovements.quantity} * COALESCE(${stockMovements.unitCost}, 0))
        `.mapWith(Number),
        lastIssued:     sql<Date>`MAX(${stockMovements.movedAt})`,
      })
      .from(stockMovements)
      .innerJoin(items, eq(stockMovements.itemId, items.itemId))
      .leftJoin(members, eq(stockMovements.memberId, members.mimsMemberId))
      .where(and(...conditions))
      .groupBy(
        stockMovements.memberId,
        members.fullName,
        members.membershipType,
        items.categoryCode,
        items.itemName
      )
      .orderBy(members.fullName, items.categoryCode, items.itemName);

    return rows.map((r) => [
      r.memberId ?? "",
      r.memberName ?? "",
      r.membershipType ?? "",
      r.categoryCode,
      r.itemName,
      r.totalQty,
      r.totalValue.toFixed(2),
      r.lastIssued
        ? new Date(r.lastIssued).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })
        : "",
    ]);
  });
}
