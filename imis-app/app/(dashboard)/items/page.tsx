import "server-only";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/auth/firebase-admin";
import { withRole } from "@/lib/db/with-role";
import { items } from "@/lib/db/schema/items";
import { inventoryStock } from "@/lib/db/schema/inventory-stock";
import { eq, ne, and, ilike, sql } from "drizzle-orm";
import type { Role } from "@/types/auth";
import LifecycleStatusBadge from "@/components/items/LifecycleStatusBadge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Item Catalog — IMIS" };

const CATEGORIES = [
  { code: "LM", name: "Line Materials" },
  { code: "TE", name: "Tools & Equipment" },
  { code: "FF", name: "Furniture & Fixtures" },
  { code: "OS", name: "Office Supplies" },
  { code: "MP", name: "Motor Pool" },
  { code: "HW", name: "House Wiring" },
  { code: "SE", name: "Special Equipment" },
  { code: "UPIS", name: "UPIS" },
  { code: "MS", name: "Medical Supplies" },
  { code: "TR", name: "Transportation" },
  { code: "CE", name: "Communication Equip." },
  { code: "BM", name: "Building Materials" },
  { code: "IT", name: "IT Equipment" },
];

interface SearchParams {
  category?: string;
  search?: string;
  page?: string;
}

export default async function ItemsPage({
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

  const categoryFilter = sp.category;
  const searchQuery = sp.search;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  const { rows, total } = await withRole(uid, role, async (tx) => {
    const conditions = [ne(items.lifecycleStatus, "disposed")];
    if (categoryFilter) conditions.push(eq(items.categoryCode, categoryFilter));
    if (searchQuery) conditions.push(ilike(items.itemName, `%${searchQuery}%`));

    const rows = await tx
      .select({
        itemId: items.itemId,
        categoryCode: items.categoryCode,
        itemName: items.itemName,
        assetTag: items.assetTag,
        location: items.location,
        lifecycleStatus: items.lifecycleStatus,
        createdAt: items.createdAt,
        qtyOnHand: inventoryStock.qtyOnHand,
      })
      .from(items)
      .leftJoin(inventoryStock, eq(items.itemId, inventoryStock.itemId))
      .where(and(...conditions))
      .orderBy(items.createdAt)
      .limit(pageSize)
      .offset(offset);

    const [{ count }] = await tx
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(items)
      .where(and(...conditions));

    return { rows, total: count ?? 0 };
  });

  const canCreate = role === "inventory_manager" || role === "system_admin";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Item Catalog</h1>
          <p className="text-sm text-gray-500">{total} active items</p>
        </div>
        {canCreate && (
          <Link
            href="/items/new"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            + New Item
          </Link>
        )}
      </div>

      {/* Category filter tabs */}
      <div className="flex flex-wrap gap-1">
        <Link
          href="/items"
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            !categoryFilter
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          All
        </Link>
        {CATEGORIES.map((cat) => (
          <Link
            key={cat.code}
            href={`/items?category=${cat.code}`}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              categoryFilter === cat.code
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {cat.code}
          </Link>
        ))}
      </div>

      {/* Items table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Asset Tag</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Location</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Qty</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-gray-400">
                  No items found.{" "}
                  {canCreate && (
                    <Link href="/items/new" className="text-blue-600 hover:underline">
                      Add the first item
                    </Link>
                  )}
                </td>
              </tr>
            ) : (
              rows.map((item) => (
                <tr key={item.itemId} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-blue-700">
                    {item.assetTag ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{item.itemName}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs font-medium">
                      {item.categoryCode}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{item.location ?? "—"}</td>
                  <td className="px-4 py-3">
                    <LifecycleStatusBadge status={item.lifecycleStatus} />
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {item.qtyOnHand ?? 0}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/items/${item.itemId}`}
                      className="text-blue-600 text-xs hover:underline"
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
          <span>
            Page {page} of {Math.ceil(total / pageSize)}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/items?page=${page - 1}${categoryFilter ? `&category=${categoryFilter}` : ""}`}
                className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50"
              >
                Previous
              </Link>
            )}
            {page * pageSize < total && (
              <Link
                href={`/items?page=${page + 1}${categoryFilter ? `&category=${categoryFilter}` : ""}`}
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
