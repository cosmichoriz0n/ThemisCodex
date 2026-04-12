import "server-only";
import { and, desc, gte, lte } from "drizzle-orm";
import type { ReportParams, ReportRow } from "../types";
import type { Role } from "@/types/auth";
import { withRole } from "@/lib/db/with-role";
import { reconciliationResults } from "@/lib/db/schema/reconciliation-results";

export const HEADERS_10 = [
  "Date", "IMIS Total (PHP)", "CAS2000 Journal Debits (PHP)",
  "Variance (PHP)", "Matched Transactions", "Unmatched Transactions",
  "Status",
];

export async function queryAccountingReconciliation(
  userId: string,
  role: Role,
  params: ReportParams
): Promise<ReportRow[]> {
  return withRole(userId, role, async (tx) => {
    const conditions = [];
    if (params.date_from) {
      conditions.push(gte(reconciliationResults.reconciliationDate, params.date_from));
    }
    if (params.date_to) {
      conditions.push(lte(reconciliationResults.reconciliationDate, params.date_to));
    }

    const rows = await tx
      .select({
        reconciliationDate: reconciliationResults.reconciliationDate,
        imisTotal:          reconciliationResults.imisTotal,
        casTotalDebits:     reconciliationResults.casTotalDebits,
        variance:           reconciliationResults.variance,
        matchedCount:       reconciliationResults.matchedCount,
        unmatchedCount:     reconciliationResults.unmatchedCount,
        status:             reconciliationResults.status,
      })
      .from(reconciliationResults)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(reconciliationResults.reconciliationDate));

    return rows.map((r) => [
      r.reconciliationDate,
      Number(r.imisTotal).toFixed(2),
      Number(r.casTotalDebits).toFixed(2),
      Number(r.variance).toFixed(2),
      r.matchedCount,
      r.unmatchedCount,
      r.status,
    ]);
  });
}
