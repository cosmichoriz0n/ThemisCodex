import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { reconciliationResults } from "@/lib/db/schema/reconciliation-results";
import type { Role } from "@/types/auth";

const ALLOWED_ROLES: Role[] = [
  "finance_officer",
  "inventory_manager",
  "system_admin",
  "auditor",
];

// GET /api/reconciliation
// Query params: date_from (YYYY-MM-DD), date_to (YYYY-MM-DD), status, page
export const GET = withAuth(async (req: NextRequest, { user, role }) => {
  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get("date_from");
  const dateTo   = searchParams.get("date_to");
  const status   = searchParams.get("status");
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = 30;
  const offset   = (page - 1) * pageSize;

  const data = await withRole(user.uid, role, async (tx) => {
    const conditions = [];

    if (dateFrom) {
      conditions.push(gte(reconciliationResults.reconciliationDate, dateFrom));
    }
    if (dateTo) {
      conditions.push(lte(reconciliationResults.reconciliationDate, dateTo));
    }
    if (status && ["matched", "variance", "pending"].includes(status)) {
      conditions.push(
        eq(
          reconciliationResults.status,
          status as typeof reconciliationResults.status._.data
        )
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await tx
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(reconciliationResults)
      .where(where);

    const rows = await tx
      .select({
        id:                 reconciliationResults.id,
        reconciliationDate: reconciliationResults.reconciliationDate,
        imisTotal:          reconciliationResults.imisTotal,
        casTotalDebits:     reconciliationResults.casTotalDebits,
        variance:           reconciliationResults.variance,
        matchedCount:       reconciliationResults.matchedCount,
        unmatchedCount:     reconciliationResults.unmatchedCount,
        status:             reconciliationResults.status,
        details:            reconciliationResults.details,
        createdAt:          reconciliationResults.createdAt,
      })
      .from(reconciliationResults)
      .where(where)
      .orderBy(desc(reconciliationResults.reconciliationDate))
      .limit(pageSize)
      .offset(offset);

    return { rows, total };
  });

  return NextResponse.json({
    data: data.rows,
    meta: { page, pageSize, total: data.total },
  });
}, ALLOWED_ROLES);
