import "server-only";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/auth/firebase-admin";
import { withRole } from "@/lib/db/with-role";
import { pmsSchedules } from "@/lib/db/schema/pms-schedules";
import { items } from "@/lib/db/schema/items";
import { itemAttributes } from "@/lib/db/schema/item-attributes";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { Role } from "@/types/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "PMS Schedules — IMIS" };

const ALLOWED_ROLES: Role[] = ["inventory_staff", "inventory_manager", "system_admin"];

const STATUS_BADGE: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-800",
  overdue:   "bg-red-100 text-red-800",
  completed: "bg-green-100 text-green-800",
};

const STATUS_TABS = ["pending", "overdue", "completed"] as const;

interface SearchParams {
  status?: string;
  category?: string;
  page?: string;
}

export default async function PmsPage({
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

  const statusFilter   = STATUS_TABS.includes(sp.status as typeof STATUS_TABS[number])
    ? (sp.status as "pending" | "overdue" | "completed")
    : undefined;
  const categoryFilter = sp.category && ["MP", "TR"].includes(sp.category) ? sp.category : undefined;
  const page     = Math.max(1, parseInt(sp.page ?? "1", 10));
  const pageSize = 30;
  const offset   = (page - 1) * pageSize;

  const { rows, total, summary } = await withRole(uid, role, async (tx) => {
    // Resolve item IDs for category filter
    let categoryItemIds: string[] | null = null;
    if (categoryFilter) {
      const catItems = await tx
        .select({ itemId: items.itemId })
        .from(items)
        .where(eq(items.categoryCode, categoryFilter));
      categoryItemIds = catItems.map((i) => i.itemId);
      if (categoryItemIds.length === 0) {
        return { rows: [], total: 0, summary: { pending: 0, overdue: 0, completed: 0 } };
      }
    }

    const filters: ReturnType<typeof and>[] = [];
    if (statusFilter) filters.push(eq(pmsSchedules.status, statusFilter));
    if (categoryItemIds) filters.push(inArray(pmsSchedules.itemId, categoryItemIds));
    const where = filters.length > 0 ? and(...filters) : undefined;

    const rows = await tx
      .select({
        id: pmsSchedules.id,
        itemId: pmsSchedules.itemId,
        pmsType: pmsSchedules.pmsType,
        dueDate: pmsSchedules.dueDate,
        dueMileage: pmsSchedules.dueMileage,
        lastDoneAt: pmsSchedules.lastDoneAt,
        lastMileage: pmsSchedules.lastMileage,
        status: pmsSchedules.status,
        createdAt: pmsSchedules.createdAt,
        itemName: items.itemName,
        assetTag: items.assetTag,
        categoryCode: items.categoryCode,
      })
      .from(pmsSchedules)
      .leftJoin(items, eq(pmsSchedules.itemId, items.itemId))
      .where(where)
      .orderBy(desc(pmsSchedules.createdAt))
      .limit(pageSize)
      .offset(offset);

    // Fetch plate_no for all returned items
    const plateMap = new Map<string, string | null>();
    if (rows.length > 0) {
      const itemIds = [...new Set(rows.map((r) => r.itemId))];
      const plateAttrs = await tx
        .select({ itemId: itemAttributes.itemId, attributeValue: itemAttributes.attributeValue })
        .from(itemAttributes)
        .where(
          and(
            inArray(itemAttributes.itemId, itemIds),
            eq(itemAttributes.attributeName, "plate_no")
          )
        );
      for (const a of plateAttrs) plateMap.set(a.itemId, a.attributeValue);
    }

    const [{ value: total }] = await tx
      .select({ value: count() })
      .from(pmsSchedules)
      .where(where);

    // Summary (no status filter)
    const summaryFilter = categoryItemIds ? inArray(pmsSchedules.itemId, categoryItemIds) : undefined;
    const summaryRows = await tx
      .select({ status: pmsSchedules.status, cnt: count() })
      .from(pmsSchedules)
      .where(summaryFilter)
      .groupBy(pmsSchedules.status);

    const summary: Record<string, number> = { pending: 0, overdue: 0, completed: 0 };
    for (const r of summaryRows) {
      if (r.status in summary) summary[r.status] = Number(r.cnt);
    }

    return {
      rows: rows.map((r) => ({ ...r, plate_no: plateMap.get(r.itemId) ?? null })),
      total: Number(total),
      summary,
    };
  });

  const buildUrl = (overrides: Partial<SearchParams>) => {
    const p = { ...sp, ...overrides };
    const qs = Object.entries(p)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&");
    return `/pms${qs ? `?${qs}` : ""}`;
  };

  const canManage = role === "inventory_manager" || role === "system_admin";

  // Days until due (for highlighting)
  function daysUntil(date: Date | null): number | null {
    if (!date) return null;
    return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">PMS Schedules</h1>
          <p className="text-sm text-gray-500">Motor Pool and Transportation preventive maintenance</p>
        </div>
        {canManage && (
          <Link
            href="/pms/new"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            New PMS Schedule
          </Link>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Pending</p>
          <p className="text-3xl font-semibold text-yellow-700 mt-1">{summary.pending}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Overdue</p>
          <p className="text-3xl font-semibold text-red-700 mt-1">{summary.overdue}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Completed</p>
          <p className="text-3xl font-semibold text-green-700 mt-1">{summary.completed}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap gap-6 items-center">
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
                {s}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
          <div className="flex gap-1">
            <Link
              href={buildUrl({ category: undefined, page: "1" })}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${!categoryFilter ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              All
            </Link>
            {["MP", "TR"].map((c) => (
              <Link
                key={c}
                href={buildUrl({ category: c, page: "1" })}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${categoryFilter === c ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                {c === "MP" ? "Motor Pool" : "Transportation"}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Item</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Plate No.</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">PMS Type</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Due Date</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Due Mileage</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Last Done</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-gray-400">No PMS schedules found.</td>
              </tr>
            ) : (
              rows.map((row) => {
                const days = daysUntil(row.dueDate);
                const dueDateColor = row.status === "overdue"
                  ? "text-red-700 font-semibold"
                  : days != null && days <= 7
                  ? "text-orange-600 font-semibold"
                  : "text-gray-900";

                return (
                  <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="text-gray-900 font-medium">{row.itemName ?? "—"}</p>
                      <p className="text-xs text-gray-400">{row.assetTag ?? row.itemId} · {row.categoryCode}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">
                      {"plate_no" in row ? (row as typeof row & { plate_no: string | null }).plate_no ?? "—" : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{row.pmsType}</td>
                    <td className={`px-4 py-3 ${dueDateColor}`}>
                      {row.dueDate
                        ? new Date(row.dueDate).toLocaleDateString("en-PH")
                        : "—"}
                      {days != null && row.status === "pending" && (
                        <p className="text-xs font-normal text-gray-400">in {days}d</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {row.dueMileage != null ? `${row.dueMileage.toLocaleString()} km` : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {row.lastDoneAt ? new Date(row.lastDoneAt).toLocaleDateString("en-PH") : "—"}
                      {row.lastMileage != null && (
                        <p>{row.lastMileage.toLocaleString()} km</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[row.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/pms/${row.id}`}
                        className="text-blue-600 hover:underline text-xs font-medium"
                      >
                        View
                      </Link>
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
