import "server-only";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/auth/firebase-admin";
import { withRole } from "@/lib/db/with-role";
import { transactions } from "@/lib/db/schema/transactions";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Role } from "@/types/auth";
import RetryButton from "./RetryButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Transactions — IMIS" };

const EBS_SYNC_BADGE: Record<string, string> = {
  synced:  "bg-green-100 text-green-800",
  pending: "bg-yellow-100 text-yellow-800",
  failed:  "bg-red-100 text-red-800",
};

const BIZ_STATUS_BADGE: Record<string, string> = {
  pending:    "bg-gray-100 text-gray-700",
  billed:     "bg-blue-100 text-blue-800",
  posted:     "bg-purple-100 text-purple-800",
  reconciled: "bg-green-100 text-green-800",
  failed:     "bg-red-100 text-red-800",
};

const EBS_SYNC_TABS = ["pending", "synced", "failed"] as const;

interface SearchParams {
  ebs_sync_status?: string;
  date_from?: string;
  date_to?: string;
  page?: string;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const session = cookieStore.get("session")?.value;
  if (!session) redirect("/login");

  let role: Role;
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(session);
    role = decoded.role as Role;
    uid = decoded.uid;
  } catch {
    redirect("/login");
  }

  const ebsSyncFilter = EBS_SYNC_TABS.includes(sp.ebs_sync_status as typeof EBS_SYNC_TABS[number])
    ? (sp.ebs_sync_status as "pending" | "synced" | "failed")
    : undefined;
  const dateFrom = sp.date_from;
  const dateTo   = sp.date_to;
  const page     = Math.max(1, parseInt(sp.page ?? "1", 10));
  const pageSize = 50;
  const offset   = (page - 1) * pageSize;

  const { rows, total } = await withRole(uid, role, async (tx) => {
    const conditions = [];

    if (ebsSyncFilter) {
      conditions.push(eq(transactions.ebsSyncStatus, ebsSyncFilter));
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
        totalAmount:      transactions.totalAmount,
        status:           transactions.status,
        ebsSyncStatus:    transactions.ebsSyncStatus,
        ebsSyncAttempts:  transactions.ebsSyncAttempts,
        ebsBillingRef:    transactions.ebsBillingRef,
        lastEbsAttemptAt: transactions.lastEbsAttemptAt,
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

  const isAdmin   = role === "system_admin";
  const canExport = role === "system_admin" || role === "inventory_manager";

  const buildUrl = (overrides: Partial<SearchParams>) => {
    const p = { ...sp, ...overrides };
    const qs = Object.entries(p)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&");
    return `/transactions${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Transactions</h1>
          <p className="text-sm text-gray-500">{total} total transactions</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap gap-4 items-end">
        {/* EBS sync status tabs */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">EBS Sync Status</label>
          <div className="flex gap-1">
            <Link
              href={buildUrl({ ebs_sync_status: undefined, page: "1" })}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                !ebsSyncFilter
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All
            </Link>
            {EBS_SYNC_TABS.map((s) => (
              <Link
                key={s}
                href={buildUrl({ ebs_sync_status: s, page: "1" })}
                className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                  ebsSyncFilter === s
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {s}
              </Link>
            ))}
          </div>
        </div>

        {/* Date range */}
        <form method="get" action="/transactions" className="flex gap-2 items-end">
          {ebsSyncFilter && (
            <input type="hidden" name="ebs_sync_status" value={ebsSyncFilter} />
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
            <input
              type="date"
              name="date_from"
              defaultValue={dateFrom ?? ""}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <input
              type="date"
              name="date_to"
              defaultValue={dateTo ?? ""}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200 transition-colors"
          >
            Filter
          </button>
          {(dateFrom || dateTo) && (
            <Link
              href={buildUrl({ date_from: undefined, date_to: undefined, page: "1" })}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date (PHT)</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Member ID</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Total (PHP)</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">EBS Sync</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Billing Ref</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-gray-400">
                  No transactions found.
                </td>
              </tr>
            ) : (
              rows.map((txn) => {
                const phtDate = new Date(
                  txn.createdAt.getTime() + 8 * 60 * 60 * 1000
                ).toLocaleString("en-PH", {
                  month: "short", day: "numeric", year: "numeric",
                  hour: "2-digit", minute: "2-digit", timeZone: "UTC",
                });
                return (
                  <tr key={txn.transactionId} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{phtDate}</td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-700">
                      {txn.memberId ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-900">
                      {Number(txn.totalAmount).toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${
                          BIZ_STATUS_BADGE[txn.status] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {txn.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium capitalize w-fit ${
                            EBS_SYNC_BADGE[txn.ebsSyncStatus] ?? "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {txn.ebsSyncStatus}
                        </span>
                        {txn.ebsSyncAttempts > 0 && (
                          <span className="text-xs text-gray-400">
                            {txn.ebsSyncAttempts} attempt{txn.ebsSyncAttempts !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-600">
                      {txn.ebsBillingRef ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {canExport && (
                          <a
                            href={`/api/transactions/${txn.transactionId}/export-csv`}
                            download
                            className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                          >
                            CSV
                          </a>
                        )}
                        {isAdmin && txn.ebsSyncStatus !== "synced" && (
                          <RetryButton transactionId={txn.transactionId} />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex justify-between items-center text-sm text-gray-600">
          <span>Page {page} of {Math.ceil(total / pageSize)}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildUrl({ page: String(page - 1) })}
                className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50"
              >
                Previous
              </Link>
            )}
            {page * pageSize < total && (
              <Link
                href={buildUrl({ page: String(page + 1) })}
                className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
