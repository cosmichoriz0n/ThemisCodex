import "server-only";
import { and, eq, gte, lte } from "drizzle-orm";
import type { ReportParams, ReportRow } from "../types";
import type { Role } from "@/types/auth";
import { withRole } from "@/lib/db/with-role";
import { transactions } from "@/lib/db/schema/transactions";
import { members } from "@/lib/db/schema/members";

export const HEADERS_09 = [
  "Transaction ID", "Date (PHT)", "Member Name", "Member ID",
  "IMIS Total (PHP)", "EBS Billing Ref", "EBS Sync Status",
  "Sync Attempts", "Last EBS Attempt", "Status",
];

export async function queryBillingReconciliation(
  userId: string,
  role: Role,
  params: ReportParams
): Promise<ReportRow[]> {
  return withRole(userId, role, async (tx) => {
    const conditions = [];
    if (params.date_from) {
      conditions.push(gte(transactions.createdAt, new Date(params.date_from)));
    }
    if (params.date_to) {
      const end = new Date(params.date_to);
      end.setUTCHours(23, 59, 59, 999);
      conditions.push(lte(transactions.createdAt, end));
    }
    if (params.member_id) {
      conditions.push(eq(transactions.memberId, params.member_id));
    }

    const rows = await tx
      .select({
        transactionId:     transactions.transactionId,
        createdAt:         transactions.createdAt,
        memberName:        members.fullName,
        memberId:          transactions.memberId,
        totalAmount:       transactions.totalAmount,
        ebsBillingRef:     transactions.ebsBillingRef,
        ebsSyncStatus:     transactions.ebsSyncStatus,
        ebsSyncAttempts:   transactions.ebsSyncAttempts,
        lastEbsAttemptAt:  transactions.lastEbsAttemptAt,
        status:            transactions.status,
      })
      .from(transactions)
      .leftJoin(members, eq(transactions.memberId, members.mimsMemberId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(transactions.createdAt);

    return rows.map((r) => [
      r.transactionId.slice(0, 8) + "…",
      new Date(r.createdAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" }),
      r.memberName ?? "",
      r.memberId ?? "",
      Number(r.totalAmount).toFixed(2),
      r.ebsBillingRef ?? "",
      r.ebsSyncStatus,
      r.ebsSyncAttempts,
      r.lastEbsAttemptAt
        ? new Date(r.lastEbsAttemptAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })
        : "",
      r.status,
    ]);
  });
}
