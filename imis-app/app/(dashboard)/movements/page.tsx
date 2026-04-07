import "server-only";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/auth/firebase-admin";
import { withRole } from "@/lib/db/with-role";
import { stockMovements } from "@/lib/db/schema/stock-movements";
import { items } from "@/lib/db/schema/items";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import type { Role } from "@/types/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Movement History — IMIS" };

const MOVEMENT_COLORS: Record<string, string> = {
  receive:  "bg-green-100 text-green-800",
  issue:    "bg-blue-100 text-blue-800",
  return:   "bg-yellow-100 text-yellow-800",
  adjust:   "bg-purple-100 text-purple-800",
  transfer: "bg-indigo-100 text-indigo-800",
  dispose:  "bg-red-100 text-red-800",
};

interface SearchParams {
  movement_type?: string;
  date_from?: string;
  date_to?: string;
  page?: string;
}

export default async function MovementsPage({
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

  const movementTypeFilter = sp.movement_type;
  const dateFrom = sp.date_from;
  const dateTo = sp.date_to;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  const { rows, total } = await withRole(uid, role, async (tx) => {
    const conditions = [];
    if (movementTypeFilter) {
      conditions.push(
        eq(
          stockMovements.movementType,
          movementTypeFilter as typeof stockMovements.movementType._.data
        )
      );
    }
    if (dateFrom) conditions.push(gte(stockMovements.movedAt, new Date(dateFrom)));
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(stockMovements.movedAt, end));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await tx
      .select({
        movementId:   stockMovements.movementId,
        itemId:       stockMovements.itemId,
        itemName:     items.itemName,
        assetTag:     items.assetTag,
        categoryCode: items.categoryCode,
        movementType: stockMovements.movementType,
        quantity:     stockMovements.quantity,
        fromLocation: stockMovements.fromLocation,
        toLocation:   stockMovements.toLocation,
        memberId:     stockMovements.memberId,
        referenceNo:  stockMovements.referenceNo,
        movedBy:      stockMovements.movedBy,
        movedAt:      stockMovements.movedAt,
      })
      .from(stockMovements)
      .innerJoin(items, eq(stockMovements.itemId, items.itemId))
      .where(where)
      .orderBy(desc(stockMovements.movedAt))
      .limit(pageSize)
      .offset(offset);

    const [{ count }] = await tx
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(stockMovements)
      .where(where);

    return { rows, total: count ?? 0 };
  });

  const canCreate = ["inventory_staff", "inventory_manager", "system_admin"].includes(role);

  const buildUrl = (overrides: Partial<SearchParams>) => {
    const p = { ...sp, ...overrides };
    const qs = Object.entries(p)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&");
    return `/movements${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Movement History</h1>
          <p className="text-sm text-gray-500">{total} total movements</p>
        </div>
        {canCreate && (
          <Link
            href="/movements/new"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            + New Movement
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap gap-4 items-end">
        {/* Movement type filter */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Movement Type</label>
          <div className="flex gap-1 flex-wrap">
            <Link
              href={buildUrl({ movement_type: undefined, page: "1" })}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                !movementTypeFilter
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All
            </Link>
            {["receive", "issue", "return", "adjust", "transfer", "dispose"].map((t) => (
              <Link
                key={t}
                href={buildUrl({ movement_type: t, page: "1" })}
                className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                  movementTypeFilter === t
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {t}
              </Link>
            ))}
          </div>
        </div>

        {/* Date range */}
        <form method="get" action="/movements" className="flex gap-2 items-end">
          {movementTypeFilter && (
            <input type="hidden" name="movement_type" value={movementTypeFilter} />
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

      {/* Movements table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Item</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Location</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Qty</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Ref / Member</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">By</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-gray-400">
                  No movements found.
                </td>
              </tr>
            ) : (
              rows.map((m) => (
                <tr key={m.movementId} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(m.movedAt).toLocaleString("en-PH", {
                      month: "short", day: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${MOVEMENT_COLORS[m.movementType] ?? "bg-gray-100 text-gray-700"}`}>
                      {m.movementType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/items/${m.itemId}`}
                      className="font-medium text-gray-900 hover:text-blue-600"
                    >
                      {m.itemName}
                    </Link>
                    <div className="text-xs text-gray-400 font-mono">{m.assetTag}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {m.fromLocation ?? "—"}
                    {m.toLocation && (
                      <span className="text-gray-400"> → {m.toLocation}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {m.movementType === "adjust" && m.quantity > 0 ? "+" : ""}
                    {m.quantity}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {m.referenceNo ?? m.memberId ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 font-mono truncate max-w-[120px]">
                    {m.movedBy}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/movements/${m.itemId}`}
                      className="text-blue-600 text-xs hover:underline whitespace-nowrap"
                    >
                      Item history
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
