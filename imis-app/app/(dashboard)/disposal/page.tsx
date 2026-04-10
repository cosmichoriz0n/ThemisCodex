import "server-only";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/auth/firebase-admin";
import { withRole } from "@/lib/db/with-role";
import { disposalRecords } from "@/lib/db/schema/disposal-records";
import { items } from "@/lib/db/schema/items";
import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import type { Role } from "@/types/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Disposal — IMIS" };

const ALLOWED_ROLES: Role[] = ["inventory_manager", "system_admin", "auditor"];

const STATUS_TABS = ["requested", "under_inspection", "authorized", "disposed"] as const;

const STATUS_BADGE: Record<string, string> = {
  requested:        "bg-yellow-100 text-yellow-800",
  under_inspection: "bg-blue-100 text-blue-800",
  authorized:       "bg-purple-100 text-purple-800",
  disposed:         "bg-red-100 text-red-800",
};

const TYPE_LABEL: Record<string, string> = {
  condemned:  "Condemned",
  scrap_sale: "Scrap Sale",
  donated:    "Donated",
  transferred:"Transferred",
};

interface SearchParams {
  status?: string;
  disposal_type?: string;
  date_from?: string;
  date_to?: string;
  page?: string;
}

export default async function DisposalPage({
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

  if (!ALLOWED_ROLES.includes(role)) redirect("/dashboard");

  const statusFilter = STATUS_TABS.includes(sp.status as typeof STATUS_TABS[number])
    ? (sp.status as typeof STATUS_TABS[number])
    : undefined;
  const dateFrom = sp.date_from ?? "";
  const dateTo   = sp.date_to ?? "";
  const page     = Math.max(1, parseInt(sp.page ?? "1", 10));
  const pageSize = 25;
  const offset   = (page - 1) * pageSize;

  const { rows, total, summary } = await withRole(uid, role, async (tx) => {
    const filters: ReturnType<typeof and>[] = [];
    if (statusFilter) filters.push(eq(disposalRecords.status, statusFilter));
    if (dateFrom) filters.push(gte(disposalRecords.createdAt, new Date(dateFrom)));
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      filters.push(lte(disposalRecords.createdAt, to));
    }
    const where = filters.length > 0 ? and(...filters) : undefined;

    const rows = await tx
      .select({
        id: disposalRecords.id,
        disposalType: disposalRecords.disposalType,
        status: disposalRecords.status,
        requestedBy: disposalRecords.requestedBy,
        authorizationNo: disposalRecords.authorizationNo,
        createdAt: disposalRecords.createdAt,
        itemName: items.itemName,
        assetTag: items.assetTag,
        categoryCode: items.categoryCode,
      })
      .from(disposalRecords)
      .leftJoin(items, eq(disposalRecords.itemId, items.itemId))
      .where(where)
      .orderBy(desc(disposalRecords.createdAt))
      .limit(pageSize)
      .offset(offset);

    const [{ value: total }] = await tx
      .select({ value: count() })
      .from(disposalRecords)
      .where(where);

    // Summary counts (no date filter for summary)
    const summaryRows = await tx
      .select({ status: disposalRecords.status, cnt: count() })
      .from(disposalRecords)
      .groupBy(disposalRecords.status);

    const summary: Record<string, number> = { requested: 0, under_inspection: 0, authorized: 0, disposed: 0 };
    for (const r of summaryRows) {
      if (r.status in summary) summary[r.status] = Number(r.cnt);
    }

    return { rows, total: Number(total), summary };
  });

  const buildUrl = (overrides: Partial<SearchParams>) => {
    const p = { ...sp, ...overrides };
    const qs = Object.entries(p)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&");
    return `/disposal${qs ? `?${qs}` : ""}`;
  };

  const canRequest = role === "inventory_manager" || role === "system_admin";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Disposal Workflow</h1>
          <p className="text-sm text-gray-500">4-step state machine: Requested → Under Inspection → Authorized → Disposed</p>
        </div>
        {canRequest && (
          <Link
            href="/disposal/new"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            New Disposal Request
          </Link>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {STATUS_TABS.map((s) => (
          <div key={s} className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{s.replace("_", " ")}</p>
            <p className={`text-3xl font-semibold mt-1 ${s === "disposed" ? "text-red-700" : s === "authorized" ? "text-purple-700" : s === "under_inspection" ? "text-blue-700" : "text-yellow-700"}`}>
              {summary[s] ?? 0}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
          <div className="flex gap-1">
            <Link
              href={buildUrl({ status: undefined, page: "1" })}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${!statusFilter ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              All
            </Link>
            {STATUS_TABS.map((s) => (
              <Link
                key={s}
                href={buildUrl({ status: s, page: "1" })}
                className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${statusFilter === s ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                {s.replace("_", " ")}
              </Link>
            ))}
          </div>
        </div>

        <form method="get" action="/disposal" className="flex gap-2 items-end">
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
            <input type="date" name="date_from" defaultValue={dateFrom}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <input type="date" name="date_to" defaultValue={dateTo}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button type="submit" className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200 transition-colors">
            Filter
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Asset Tag</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Item</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Disposal Type</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Requested</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-gray-400">No disposal records found.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{row.assetTag ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-900">{row.itemName ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
                      {row.categoryCode ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{TYPE_LABEL[row.disposalType] ?? row.disposalType}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[row.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {row.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(row.createdAt).toLocaleDateString("en-PH")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/disposal/${row.id}`}
                      className="text-blue-600 hover:underline text-xs font-medium"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
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
              <Link href={buildUrl({ page: String(page - 1) })} className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50">
                Previous
              </Link>
            )}
            {page * pageSize < total && (
              <Link href={buildUrl({ page: String(page + 1) })} className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
