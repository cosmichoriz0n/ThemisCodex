import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { ALL_ROLES } from "@/lib/auth/permissions";
import { transactions } from "@/lib/db/schema/transactions";

// GET /api/transactions — list transactions with billing status filters
// Query params: ebs_sync_status, date_from, date_to (PHT), page
export const GET = withAuth(async (req: NextRequest, { user, role }) => {
  const { searchParams } = new URL(req.url);
  const ebsSyncStatus = searchParams.get("ebs_sync_status");
  const dateFrom      = searchParams.get("date_from");
  const dateTo        = searchParams.get("date_to");
  const page          = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize      = 50;
  const offset        = (page - 1) * pageSize;

  const data = await withRole(user.uid, role, async (tx) => {
    const conditions = [];

    if (ebsSyncStatus && ["pending", "synced", "failed"].includes(ebsSyncStatus)) {
      conditions.push(
        eq(
          transactions.ebsSyncStatus,
          ebsSyncStatus as typeof transactions.ebsSyncStatus._.data
        )
      );
    }
    if (dateFrom) {
      conditions.push(
        sql`${transactions.createdAt} >= ${new Date(`${dateFrom}T00:00:00+08:00`).toISOString()}`
      );
    }
    if (dateTo) {
      conditions.push(
        sql`${transactions.createdAt} <= ${new Date(`${dateTo}T23:59:59.999+08:00`).toISOString()}`
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await tx
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(transactions)
      .where(where);

    const rows = await tx
      .select({
        transactionId:    transactions.transactionId,
        memberId:         transactions.memberId,
        ebsBillingRef:    transactions.ebsBillingRef,
        ebsSyncStatus:    transactions.ebsSyncStatus,
        ebsSyncAttempts:  transactions.ebsSyncAttempts,
        lastEbsAttemptAt: transactions.lastEbsAttemptAt,
        totalAmount:      transactions.totalAmount,
        status:           transactions.status,
        movementId:       transactions.movementId,
        createdBy:        transactions.createdBy,
        createdAt:        transactions.createdAt,
      })
      .from(transactions)
      .where(where)
      .orderBy(desc(transactions.createdAt))
      .limit(pageSize)
      .offset(offset);

    return { rows, total };
  });

  return NextResponse.json({
    data: data.rows,
    meta: { page, pageSize, total: data.total },
  });
}, ALL_ROLES);
