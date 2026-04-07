import "server-only";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/auth/firebase-admin";
import { withRole } from "@/lib/db/with-role";
import { stockMovements } from "@/lib/db/schema/stock-movements";
import { items } from "@/lib/db/schema/items";
import { inventoryStock } from "@/lib/db/schema/inventory-stock";
import { lifecycleEvents } from "@/lib/db/schema/lifecycle-events";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import type { Role } from "@/types/auth";
import LifecycleStatusBadge from "@/components/items/LifecycleStatusBadge";

export const dynamic = "force-dynamic";

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

export default async function ItemMovementHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ itemId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { itemId } = await params;
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

  const data = await withRole(uid, role, async (tx) => {
    const [item] = await tx
      .select()
      .from(items)
      .where(eq(items.itemId, itemId))
      .limit(1);

    if (!item) return null;

    const conditions: ReturnType<typeof eq>[] = [eq(stockMovements.itemId, itemId)];
    if (movementTypeFilter) {
      conditions.push(
        eq(
          stockMovements.movementType,
          movementTypeFilter as typeof stockMovements.movementType._.data
        )
      );
    }
    if (dateFrom) conditions.push(gte(stockMovements.movedAt, new Date(dateFrom)) as ReturnType<typeof eq>);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(stockMovements.movedAt, end) as ReturnType<typeof eq>);
    }

    const movements = await tx
      .select()
      .from(stockMovements)
      .where(and(...conditions))
      .orderBy(desc(stockMovements.movedAt))
      .limit(pageSize)
      .offset(offset);

    const [{ count }] = await tx
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(stockMovements)
      .where(and(...conditions));

    const stock = await tx
      .select()
      .from(inventoryStock)
      .where(eq(inventoryStock.itemId, itemId));

    const lifecycle = await tx
      .select()
      .from(lifecycleEvents)
      .where(eq(lifecycleEvents.itemId, itemId))
      .orderBy(desc(lifecycleEvents.eventAt));

    return { item, movements, stock, lifecycle, total: count ?? 0 };
  });

  if (!data) notFound();

  const { item, movements, stock, lifecycle, total } = data;

  const buildUrl = (overrides: Partial<SearchParams>) => {
    const p = { ...sp, ...overrides };
    const qs = Object.entries(p)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&");
    return `/movements/${itemId}${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 flex items-center gap-1">
        <Link href="/movements" className="hover:text-blue-600">Movement History</Link>
        <span>›</span>
        <Link href={`/items/${itemId}`} className="hover:text-blue-600">{item.assetTag ?? itemId}</Link>
        <span>›</span>
        <span className="text-gray-900">Timeline</span>
      </nav>

      {/* Item header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
              {item.assetTag}
            </span>
            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs font-medium">
              {item.categoryCode}
            </span>
            <LifecycleStatusBadge status={item.lifecycleStatus} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">{item.itemName}</h1>
        </div>
        <Link
          href="/movements/new"
          className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 whitespace-nowrap"
        >
          + New Movement
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: stock snapshot + lifecycle events */}
        <div className="space-y-4">
          {/* Stock per location */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Current Stock</h2>
            {stock.length === 0 ? (
              <p className="text-sm text-gray-400">No stock records.</p>
            ) : (
              <ul className="space-y-2">
                {stock.map((s) => (
                  <li key={s.id} className="flex justify-between text-sm">
                    <span className="text-gray-600 truncate">{s.location}</span>
                    <span className="font-mono font-semibold text-gray-900">{s.qtyOnHand}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Lifecycle event timeline */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Lifecycle Events</h2>
            {lifecycle.length === 0 ? (
              <p className="text-sm text-gray-400">No lifecycle events.</p>
            ) : (
              <ol className="relative border-l border-gray-200 ml-2 space-y-4">
                {lifecycle.map((event) => (
                  <li key={event.eventId} className="ml-4">
                    <div className="absolute -left-1.5 mt-1 w-3 h-3 rounded-full border-2 border-white bg-blue-500" />
                    <div className="text-xs text-gray-400">
                      {new Date(event.eventAt).toLocaleString("en-PH")}
                    </div>
                    <div className="text-sm font-medium text-gray-800 mt-0.5">
                      {event.fromState ? `${event.fromState} → ` : ""}
                      <span className="text-blue-700">{event.toState}</span>
                    </div>
                    {event.remarks && (
                      <p className="text-xs text-gray-500 mt-0.5">{event.remarks}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* Right: movement table with filters */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-lg border border-gray-200 p-3 flex flex-wrap gap-3 items-end">
            <div className="flex gap-1 flex-wrap">
              <Link
                href={buildUrl({ movement_type: undefined, page: "1" })}
                className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                  !movementTypeFilter ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                All
              </Link>
              {["receive","issue","return","adjust","transfer","dispose"].map((t) => (
                <Link
                  key={t}
                  href={buildUrl({ movement_type: t, page: "1" })}
                  className={`px-2 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                    movementTypeFilter === t ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {t}
                </Link>
              ))}
            </div>

            <form method="get" action={`/movements/${itemId}`} className="flex gap-2 items-end">
              {movementTypeFilter && (
                <input type="hidden" name="movement_type" value={movementTypeFilter} />
              )}
              <input
                type="date"
                name="date_from"
                defaultValue={dateFrom ?? ""}
                className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="date"
                name="date_to"
                defaultValue={dateTo ?? ""}
                className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded hover:bg-gray-200"
              >
                Filter
              </button>
            </form>
          </div>

          {/* Movements */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-100 text-xs text-gray-500">
              {total} movement{total !== 1 ? "s" : ""}
            </div>
            {movements.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                No movements match the current filters.
              </div>
            ) : (
              <ol className="relative border-l border-gray-200 ml-6 py-4 pr-4 space-y-5">
                {movements.map((m) => (
                  <li key={m.movementId} className="ml-4">
                    <div className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full border-2 border-white bg-gray-400" />
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${MOVEMENT_COLORS[m.movementType] ?? "bg-gray-100 text-gray-700"}`}>
                            {m.movementType}
                          </span>
                          <span className="font-mono text-sm font-semibold text-gray-900">
                            {m.movementType === "adjust" && m.quantity > 0 ? "+" : ""}
                            {m.quantity}
                          </span>
                          {m.fromLocation && (
                            <span className="text-xs text-gray-400">
                              {m.fromLocation}
                              {m.toLocation && ` → ${m.toLocation}`}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {new Date(m.movedAt).toLocaleString("en-PH")}
                          {m.referenceNo && <span className="ml-2">Ref: {m.referenceNo}</span>}
                          {m.memberId && <span className="ml-2">Member: {m.memberId}</span>}
                        </div>
                        {m.remarks && (
                          <p className="text-xs text-gray-500 mt-0.5 italic">{m.remarks}</p>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 font-mono shrink-0">
                        {m.movedBy}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
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
      </div>
    </div>
  );
}
