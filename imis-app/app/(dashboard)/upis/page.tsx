import "server-only";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/auth/firebase-admin";
import { withRole } from "@/lib/db/with-role";
import { items } from "@/lib/db/schema/items";
import { itemAttributes } from "@/lib/db/schema/item-attributes";
import { stockMovements } from "@/lib/db/schema/stock-movements";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Role } from "@/types/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "UPIS Module — IMIS" };

const ALLOWED_ROLES: Role[] = ["inventory_manager", "finance_officer", "system_admin", "auditor"];

const LIFECYCLE_BADGE: Record<string, string> = {
  acquired:     "bg-gray-100 text-gray-700",
  in_stock:     "bg-blue-100 text-blue-700",
  in_service:   "bg-green-100 text-green-700",
  under_repair: "bg-yellow-100 text-yellow-700",
  returned:     "bg-purple-100 text-purple-700",
  disposed:     "bg-red-100 text-red-700",
};

function nbvColor(pct: number) {
  if (pct > 50) return "text-green-700 font-semibold";
  if (pct > 10) return "text-amber-700 font-semibold";
  return "text-red-700 font-semibold";
}

function phpFmt(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface SearchParams {
  feeder?: string;
  lifecycle_status?: string;
}

export default async function UpisPage({
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

  const feederFilter = sp.feeder ?? null;
  const lifecycleFilter = sp.lifecycle_status ?? null;

  const { data, feeders, totals } = await withRole(uid, role, async (tx) => {
    const lifecycleWhere = lifecycleFilter
      ? and(
          eq(items.categoryCode, "UPIS"),
          eq(items.lifecycleStatus, lifecycleFilter as "acquired" | "in_stock" | "in_service" | "under_repair" | "returned" | "disposed")
        )
      : eq(items.categoryCode, "UPIS");

    const upisItems = await tx
      .select({
        itemId: items.itemId,
        itemName: items.itemName,
        assetTag: items.assetTag,
        lifecycleStatus: items.lifecycleStatus,
        location: items.location,
      })
      .from(items)
      .where(lifecycleWhere);

    if (upisItems.length === 0) {
      return { data: [], feeders: [], totals: { acquisition: 0, accumulated: 0, nbv: 0 } };
    }

    const itemIds = upisItems.map((i) => i.itemId);

    const attrRows = await tx
      .select({
        itemId: itemAttributes.itemId,
        attributeName: itemAttributes.attributeName,
        attributeValue: itemAttributes.attributeValue,
      })
      .from(itemAttributes)
      .where(
        and(
          inArray(itemAttributes.itemId, itemIds),
          inArray(itemAttributes.attributeName, [
            "nea_asset_code",
            "feeder",
            "depreciation_rate",
            "accumulated_depreciation",
            "installation_date",
          ])
        )
      );

    const costRows = await tx
      .select({
        itemId: stockMovements.itemId,
        acquisitionCost: sql<string>`MIN(${stockMovements.unitCost}::numeric)`,
      })
      .from(stockMovements)
      .where(
        and(
          inArray(stockMovements.itemId, itemIds),
          eq(stockMovements.movementType, "receive")
        )
      )
      .groupBy(stockMovements.itemId);

    // Build attribute map
    const attrMap = new Map<string, Map<string, string>>();
    for (const row of attrRows) {
      if (!attrMap.has(row.itemId)) attrMap.set(row.itemId, new Map());
      if (row.attributeValue != null) {
        attrMap.get(row.itemId)!.set(row.attributeName, row.attributeValue);
      }
    }
    const costMap = new Map(costRows.map((r) => [r.itemId, parseFloat(r.acquisitionCost ?? "0")]));

    const allFeeders = new Set<string>();
    const data = upisItems
      .map((item) => {
        const attrs = attrMap.get(item.itemId) ?? new Map();
        const acquisitionCost = costMap.get(item.itemId) ?? 0;
        const depreciationRate = parseFloat(attrs.get("depreciation_rate") ?? "0");
        const accumulatedDepr = parseFloat(attrs.get("accumulated_depreciation") ?? "0");
        const netBookValue = Math.max(0, acquisitionCost - accumulatedDepr);
        const feeder = attrs.get("feeder") ?? null;
        if (feeder) allFeeders.add(feeder);

        return {
          itemId: item.itemId,
          itemName: item.itemName,
          assetTag: item.assetTag,
          lifecycleStatus: item.lifecycleStatus,
          location: item.location,
          neaAssetCode: attrs.get("nea_asset_code") ?? null,
          feeder,
          installationDate: attrs.get("installation_date") ?? null,
          acquisitionCost,
          depreciationRate,
          accumulatedDepr,
          netBookValue,
          nbvPct: acquisitionCost > 0 ? (netBookValue / acquisitionCost) * 100 : 0,
        };
      })
      .filter((item) => !feederFilter || item.feeder === feederFilter);

    const feeders = [...allFeeders].sort();
    const totals = data.reduce(
      (acc, item) => ({
        acquisition: acc.acquisition + item.acquisitionCost,
        accumulated: acc.accumulated + item.accumulatedDepr,
        nbv: acc.nbv + item.netBookValue,
      }),
      { acquisition: 0, accumulated: 0, nbv: 0 }
    );

    return { data, feeders, totals };
  });

  const buildUrl = (overrides: Partial<SearchParams>) => {
    const p = { ...sp, ...overrides };
    const qs = Object.entries(p)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&");
    return `/upis${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">UPIS Module</h1>
          <p className="text-sm text-gray-500">Utility Plant in Service — depreciation schedule and net book values</p>
        </div>
        {role === "system_admin" && (
          <Link
            href="/api/depreciation/run?dry_run=true"
            target="_blank"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Run Depreciation (Dry Run)
          </Link>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Assets</p>
          <p className="text-3xl font-semibold text-gray-900 mt-1">{data.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">UPIS items</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Acquisition Cost</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">₱{phpFmt(totals.acquisition)}</p>
          <p className="text-xs text-gray-400 mt-0.5">total original cost</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Accumulated Depr.</p>
          <p className="text-2xl font-semibold text-amber-700 mt-1">₱{phpFmt(totals.accumulated)}</p>
          <p className="text-xs text-gray-400 mt-0.5">Dr 5310 / Cr 1990</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Net Book Value</p>
          <p className="text-2xl font-semibold text-green-700 mt-1">₱{phpFmt(totals.nbv)}</p>
          <p className="text-xs text-gray-400 mt-0.5">remaining value</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap gap-4 items-center">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Feeder</label>
          <div className="flex gap-1 flex-wrap">
            <Link
              href={buildUrl({ feeder: undefined })}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                !feederFilter ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All Feeders
            </Link>
            {feeders.map((f) => (
              <Link
                key={f}
                href={buildUrl({ feeder: f })}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  feederFilter === f ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {f}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Lifecycle Status</label>
          <div className="flex gap-1">
            <Link
              href={buildUrl({ lifecycle_status: undefined })}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                !lifecycleFilter ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All
            </Link>
            {["in_service", "under_repair", "disposed"].map((s) => (
              <Link
                key={s}
                href={buildUrl({ lifecycle_status: s })}
                className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                  lifecycleFilter === s ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {s.replace("_", " ")}
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
              <th className="text-left px-4 py-3 font-medium text-gray-600">Asset Tag</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">NEA Code</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Feeder</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Acq. Cost (PHP)</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Rate %</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Accum. Depr. (PHP)</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">NBV (PHP)</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-gray-400">
                  No UPIS assets found.
                </td>
              </tr>
            ) : (
              data.map((item) => (
                <tr key={item.itemId} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">
                    {item.assetTag ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-900 max-w-xs">
                    <Link href={`/items/${item.itemId}`} className="hover:text-blue-600">
                      {item.itemName}
                    </Link>
                    {item.installationDate && (
                      <p className="text-xs text-gray-400">Installed: {item.installationDate}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                    {item.neaAssetCode ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {item.feeder ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-900">
                    {phpFmt(item.acquisitionCost)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {item.depreciationRate.toFixed(2)}%
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-amber-700">
                    {phpFmt(item.accumulatedDepr)}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${nbvColor(item.nbvPct)}`}>
                    {phpFmt(item.netBookValue)}
                    <p className="text-xs font-normal">({item.nbvPct.toFixed(1)}%)</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        LIFECYCLE_BADGE[item.lifecycleStatus] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {item.lifecycleStatus.replace("_", " ")}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data.length > 0 && (
        <p className="text-xs text-gray-400">
          NBV color: <span className="text-green-700 font-semibold">&gt;50% remaining</span> ·{" "}
          <span className="text-amber-700 font-semibold">10–50%</span> ·{" "}
          <span className="text-red-700 font-semibold">&lt;10%</span>
        </p>
      )}
    </div>
  );
}
