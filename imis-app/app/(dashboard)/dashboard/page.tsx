import "server-only";
import { cookies } from "next/headers";
import Link from "next/link";

export const metadata = { title: "Dashboard — IMIS" };

const CATEGORY_META: Record<string, { name: string; account: string }> = {
  LM:   { name: "Line Materials",           account: "154" },
  TE:   { name: "Tools & Equipment",         account: "163" },
  FF:   { name: "Furniture & Fixtures",      account: "391" },
  OS:   { name: "Office Supplies",           account: "—" },
  MP:   { name: "Motor Pool",                account: "392" },
  HW:   { name: "House Wiring Materials",    account: "154" },
  SE:   { name: "Special Equipment",         account: "163" },
  UPIS: { name: "Utility Plant in Service",  account: "101-199" },
  MS:   { name: "Medical Supplies",          account: "—" },
  TR:   { name: "Transportation Equipment",  account: "392" },
  CE:   { name: "Communication Equipment",   account: "163" },
  BM:   { name: "Building Repair Materials", account: "—" },
  IT:   { name: "IT Equipment & Software",   account: "391" },
};

const MOVEMENT_TYPE_COLORS: Record<string, string> = {
  receive:  "bg-green-100 text-green-800",
  issue:    "bg-blue-100 text-blue-800",
  return:   "bg-yellow-100 text-yellow-800",
  adjust:   "bg-purple-100 text-purple-800",
  transfer: "bg-indigo-100 text-indigo-800",
  dispose:  "bg-red-100 text-red-800",
};

const ALERT_TYPE_LABELS: Record<string, string> = {
  low_stock:        "Low Stock",
  pms_due:          "PMS Due",
  expiry:           "Expiry",
  license_expiry:   "License Expiry",
  calibration_due:  "Calibration Due",
};

const ALERT_TYPE_COLORS: Record<string, string> = {
  low_stock:       "bg-orange-100 text-orange-800",
  pms_due:         "bg-yellow-100 text-yellow-800",
  expiry:          "bg-red-100 text-red-800",
  license_expiry:  "bg-red-100 text-red-800",
  calibration_due: "bg-amber-100 text-amber-800",
};

function healthBadge(status: string | null): string {
  if (status === "success") return "bg-green-100 text-green-800";
  if (status === "failure") return "bg-red-100 text-red-800";
  if (status === "retry")   return "bg-yellow-100 text-yellow-800";
  return "bg-gray-100 text-gray-500";
}

function healthLabel(status: string | null, lastSync: string | null): string {
  if (!lastSync) return "Never synced";
  const ago = Math.round((Date.now() - new Date(lastSync).getTime()) / 60000);
  const label = status === "success" ? "OK" : status === "failure" ? "Error" : status ?? "Unknown";
  return `${label} · ${ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`}`;
}

async function getDashboardData() {
  const jar = await cookies();
  const session = jar.get("session")?.value;
  if (!session) return null;

  const baseUrl = process.env.IMIS_APP_URL ?? "http://localhost:3000";

  try {
    const res = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${session}` },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const json = await res.json() as { data: DashboardData };
    return json.data;
  } catch {
    return null;
  }
}

interface StockCategory {
  categoryCode: string;
  totalOnHand: number;
  itemCount: number;
}

interface AlertCount {
  alertType: string;
  count: number;
}

interface RecentMovement {
  movementId: string;
  itemId: string;
  itemName: string;
  categoryCode: string;
  movementType: string;
  quantity: number;
  movedBy: string;
  movedAt: string;
}

interface IntegrationHealth {
  lastSync: string | null;
  lastStatus: string | null;
}

interface DashboardData {
  totalItems: number;
  totalOpenAlerts: number;
  alertCounts: AlertCount[];
  stockByCategory: StockCategory[];
  recentMovements: RecentMovement[];
  integrationHealth: Record<string, IntegrationHealth>;
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  if (!data) {
    // Dashboard fetch failed — still render shell (data unavailable)
  }

  const allCategoryCodes = Object.keys(CATEGORY_META);
  const stockMap = new Map((data?.stockByCategory ?? []).map((s) => [s.categoryCode, s]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">System overview</p>
      </div>

      {/* ── Top summary cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total Items</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {data ? data.totalItems.toLocaleString() : "—"}
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Open Alerts</p>
          <p className={`text-2xl font-bold mt-1 ${data && data.totalOpenAlerts > 0 ? "text-red-600" : "text-gray-900"}`}>
            {data ? data.totalOpenAlerts : "—"}
          </p>
          {data && data.alertCounts.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {data.alertCounts.map((ac) => (
                <span
                  key={ac.alertType}
                  className={`px-1.5 py-0.5 rounded text-xs font-medium ${ALERT_TYPE_COLORS[ac.alertType] ?? "bg-gray-100 text-gray-600"}`}
                >
                  {ALERT_TYPE_LABELS[ac.alertType] ?? ac.alertType}: {ac.count}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Integration health compact summary */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 col-span-2">
          <p className="text-xs text-gray-500 mb-2">Integration Health</p>
          <div className="space-y-1">
            {(["MIMS", "EBS2000", "CAS2000"] as const).map((sys) => {
              const h = data?.integrationHealth[sys];
              return (
                <div key={sys} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700">{sys}</span>
                  <span className={`px-2 py-0.5 rounded font-medium ${healthBadge(h?.lastStatus ?? null)}`}>
                    {healthLabel(h?.lastStatus ?? null, h?.lastSync ?? null)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Alert breakdown (if any open) ──────────────────────────────── */}
      {data && data.totalOpenAlerts > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-amber-900">
              {data.totalOpenAlerts} Open Alert{data.totalOpenAlerts !== 1 ? "s" : ""}
            </h2>
            <Link href="/alerts" className="text-xs text-amber-700 hover:underline">
              View all →
            </Link>
          </div>
          <div className="flex flex-wrap gap-3">
            {data.alertCounts.map((ac) => (
              <div key={ac.alertType} className="text-xs text-amber-800">
                <span className="font-medium">{ALERT_TYPE_LABELS[ac.alertType] ?? ac.alertType}:</span>{" "}
                {ac.count} item{ac.count !== 1 ? "s" : ""}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Stock by category ───────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-medium text-gray-700 mb-3">Stock by Asset Category</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {allCategoryCodes.map((code) => {
            const meta = CATEGORY_META[code];
            const stock = stockMap.get(code);
            return (
              <Link
                key={code}
                href={`/items?category_code=${code}`}
                className="bg-white rounded-lg border border-gray-200 p-3 hover:border-blue-400 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                    {code}
                  </span>
                  <span className="text-xs text-gray-400">Acct {meta.account}</span>
                </div>
                <p className="text-sm font-medium text-gray-800 mt-2 leading-tight">{meta.name}</p>
                <p className="text-lg font-bold text-gray-900 mt-1">
                  {stock ? stock.totalOnHand.toLocaleString() : "0"}
                </p>
                <p className="text-xs text-gray-400">
                  {stock ? `${stock.itemCount} item${stock.itemCount !== 1 ? "s" : ""}` : "no items"}
                </p>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Recent movements ────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-700">Recent Movements</h2>
          <Link href="/movements" className="text-xs text-blue-600 hover:underline">View all →</Link>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {!data || data.recentMovements.length === 0 ? (
            <p className="text-sm text-gray-400 p-4">No movements yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-600 text-xs">Item</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600 text-xs">Type</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600 text-xs">Qty</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600 text-xs">When</th>
                </tr>
              </thead>
              <tbody>
                {data.recentMovements.map((m) => (
                  <tr key={m.movementId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <Link href={`/movements/${m.itemId}`} className="font-medium text-blue-700 hover:underline">
                        {m.itemName}
                      </Link>
                      <span className="ml-1 text-xs text-gray-400">{m.categoryCode}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${MOVEMENT_TYPE_COLORS[m.movementType] ?? "bg-gray-100 text-gray-700"}`}>
                        {m.movementType}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{m.quantity}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {new Date(m.movedAt).toLocaleString("en-PH", {
                        month: "short", day: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
