import "server-only";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/auth/firebase-admin";
import { withRole } from "@/lib/db/with-role";
import { reconciliationResults } from "@/lib/db/schema/reconciliation-results";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { Role } from "@/types/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reconciliation — IMIS" };

const ALLOWED_ROLES: Role[] = [
  "finance_officer",
  "inventory_manager",
  "system_admin",
  "auditor",
];

const STATUS_BADGE: Record<string, string> = {
  matched:  "bg-green-100 text-green-800",
  variance: "bg-red-100 text-red-800",
  pending:  "bg-yellow-100 text-yellow-800",
};

const STATUS_TABS = ["matched", "variance", "pending"] as const;

interface SearchParams {
  status?: string;
  date_from?: string;
  date_to?: string;
  page?: string;
}

// Default date range: last 7 days PHT
function defaultDateRange() {
  const now    = new Date();
  const phtNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const to     = phtNow.toISOString().slice(0, 10);
  const from7  = new Date(phtNow.getTime() - 6 * 24 * 60 * 60 * 1000);
  const from   = from7.toISOString().slice(0, 10);
  return { from, to };
}

export default async function ReconciliationPage({
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

  if (!ALLOWED_ROLES.includes(role)) {
    redirect("/dashboard");
  }

  const defaults      = defaultDateRange();
  const statusFilter  = STATUS_TABS.includes(sp.status as typeof STATUS_TABS[number])
    ? (sp.status as "matched" | "variance" | "pending")
    : undefined;
  const dateFrom = sp.date_from ?? defaults.from;
  const dateTo   = sp.date_to   ?? defaults.to;
  const page     = Math.max(1, parseInt(sp.page ?? "1", 10));
  const pageSize = 30;
  const offset   = (page - 1) * pageSize;

  const { rows, total, summary } = await withRole(uid, role, async (tx) => {
    const conditions = [
      gte(reconciliationResults.reconciliationDate, dateFrom),
      lte(reconciliationResults.reconciliationDate, dateTo),
    ];
    if (statusFilter) {
      conditions.push(eq(reconciliationResults.status, statusFilter));
    }
    const where = and(...conditions);

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
        updatedAt:          reconciliationResults.updatedAt,
      })
      .from(reconciliationResults)
      .where(where)
      .orderBy(desc(reconciliationResults.reconciliationDate))
      .limit(pageSize)
      .offset(offset);

    // Summary counts across the full filtered date range (no pagination)
    const summaryRows = await tx
      .select({
        status: reconciliationResults.status,
        count:  sql<number>`COUNT(*)::int`,
      })
      .from(reconciliationResults)
      .where(and(
        gte(reconciliationResults.reconciliationDate, dateFrom),
        lte(reconciliationResults.reconciliationDate, dateTo),
      ))
      .groupBy(reconciliationResults.status);

    const summary = { matched: 0, variance: 0, pending: 0 };
    for (const r of summaryRows) {
      if (r.status in summary) summary[r.status as keyof typeof summary] = r.count;
    }

    return { rows, total, summary };
  });

  const buildUrl = (overrides: Partial<SearchParams>) => {
    const p = { date_from: dateFrom, date_to: dateTo, ...sp, ...overrides };
    const qs = Object.entries(p)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&");
    return `/reconciliation${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Reconciliation</h1>
          <p className="text-sm text-gray-500">IMIS vs CAS2000 daily journal totals</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Matched</p>
          <p className="text-3xl font-semibold text-green-700 mt-1">{summary.matched}</p>
          <p className="text-xs text-gray-400 mt-0.5">days with no variance</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Variance</p>
          <p className="text-3xl font-semibold text-red-700 mt-1">{summary.variance}</p>
          <p className="text-xs text-gray-400 mt-0.5">days requiring review</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Pending</p>
          <p className="text-3xl font-semibold text-yellow-700 mt-1">{summary.pending}</p>
          <p className="text-xs text-gray-400 mt-0.5">CAS2000 data unavailable</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap gap-4 items-end">
        {/* Status tabs */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
          <div className="flex gap-1">
            <Link
              href={buildUrl({ status: undefined, page: "1" })}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                !statusFilter
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All
            </Link>
            {STATUS_TABS.map((s) => (
              <Link
                key={s}
                href={buildUrl({ status: s, page: "1" })}
                className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                  statusFilter === s
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
        <form method="get" action="/reconciliation" className="flex gap-2 items-end">
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
            <input
              type="date"
              name="date_from"
              defaultValue={dateFrom}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <input
              type="date"
              name="date_to"
              defaultValue={dateTo}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200 transition-colors"
          >
            Filter
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date (PHT)</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">IMIS Total (PHP)</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">CAS Debits (PHP)</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Variance (PHP)</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Matched / Unmatched</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-gray-400">
                  No reconciliation data found for this period.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const varianceNum = Number(row.variance);
                const varianceColor =
                  varianceNum === 0
                    ? "text-gray-500"
                    : varianceNum > 0
                    ? "text-red-700 font-semibold"
                    : "text-orange-700 font-semibold";

                const updatedPht = new Date(
                  new Date(row.updatedAt).getTime() + 8 * 60 * 60 * 1000
                ).toLocaleString("en-PH", {
                  month: "short", day: "numeric",
                  hour: "2-digit", minute: "2-digit",
                  timeZone: "UTC",
                });

                // Drill-down details from jsonb
                const details = row.details as {
                  imis_transaction_count?: number;
                  cas_available?: boolean;
                  variance_explanation?: string;
                } | null;

                return (
                  <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50 align-top">
                    <td className="px-4 py-3 font-mono text-sm text-gray-800">
                      {row.reconciliationDate}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-900">
                      {Number(row.imisTotal).toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-900">
                      {Number(row.casTotalDebits).toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${varianceColor}`}>
                      {varianceNum === 0 ? "—" : varianceNum.toLocaleString("en-PH", {
                        minimumFractionDigits: 4,
                        maximumFractionDigits: 4,
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${
                          STATUS_BADGE[row.status] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {row.status}
                      </span>
                      {details?.variance_explanation && row.status === "variance" && (
                        <p className="text-xs text-gray-400 mt-0.5 max-w-xs">
                          {details.variance_explanation}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-600">
                      <span className="text-green-700">{row.matchedCount}</span>
                      {" / "}
                      <span className="text-red-700">{row.unmatchedCount}</span>
                      {details?.imis_transaction_count != null && (
                        <p className="text-gray-400">{details.imis_transaction_count} txns</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {updatedPht}
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
