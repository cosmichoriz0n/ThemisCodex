"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import ScannerInput, { type ScannerInputHandle } from "@/components/barcode/ScannerInput";

interface SystemItem {
  itemId:       string;
  itemName:     string;
  assetTag:     string | null;
  categoryCode: string;
  location:     string;
  qtyOnHand:    number;
  reorderLevel: number;
}

interface VarianceRow {
  itemId:       string;
  itemName:     string;
  assetTag:     string | null;
  categoryCode: string;
  location:     string;
  systemQty:    number;
  physicalQty:  number;
  variance:     number;
}

interface CountReport {
  location:       string;
  counted_at:     string;
  items_counted:  number;
  total_items:    number;
  total_variance: number;
  has_variance:   boolean;
  report:         VarianceRow[];
}

type PhysicalCount = Record<string, string>; // itemId → entered qty string

const LOCATIONS = [
  "main_warehouse",
  "warehouse_b",
  "field_office",
  "repair_bay",
  "disposal_area",
];

function getSessionToken(): string {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith("session="))
    ?.split("=")[1] ?? "";
}

export default function PhysicalCountPage() {
  const scannerRef = useRef<ScannerInputHandle>(null);

  const [location, setLocation] = useState("main_warehouse");
  const [customLocation, setCustomLocation] = useState("");
  const [systemItems, setSystemItems] = useState<SystemItem[]>([]);
  const [physicalCounts, setPhysicalCounts] = useState<PhysicalCount>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [report, setReport] = useState<CountReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveLocation = location === "__custom__" ? customLocation.trim() : location;

  // Load items for location
  const loadItems = useCallback(async (loc: string) => {
    if (!loc) return;
    setLoading(true);
    setReport(null);
    setError(null);
    setPhysicalCounts({});
    try {
      const res = await fetch(
        `/api/physical-count?location=${encodeURIComponent(loc)}`,
        { headers: { Authorization: `Bearer ${getSessionToken()}` } }
      );
      if (!res.ok) throw new Error("Failed to load items");
      const json = await res.json();
      setSystemItems(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (effectiveLocation) loadItems(effectiveLocation);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle barcode scan — find item and focus its qty input
  const handleScan = useCallback(
    (code: string) => {
      const item = systemItems.find(
        (i) => i.assetTag === code || i.itemId === code
      );
      if (item) {
        const el = document.getElementById(`count-${item.itemId}`);
        if (el) {
          (el as HTMLInputElement).focus();
          (el as HTMLInputElement).select();
        }
      }
    },
    [systemItems]
  );

  const setCount = (itemId: string, val: string) => {
    setPhysicalCounts((c) => ({ ...c, [itemId]: val }));
  };

  // Pre-fill all with system qty (quick "all match" helper)
  const prefillSystemQty = () => {
    const counts: PhysicalCount = {};
    systemItems.forEach((i) => { counts[i.itemId] = String(i.qtyOnHand); });
    setPhysicalCounts(counts);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const counts = systemItems
      .filter((i) => physicalCounts[i.itemId] !== undefined && physicalCounts[i.itemId] !== "")
      .map((i) => ({
        item_id:      i.itemId,
        physical_qty: parseInt(physicalCounts[i.itemId] ?? "0", 10),
      }));

    if (counts.length === 0) {
      setError("Enter at least one physical quantity before generating the report.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/physical-count", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${getSessionToken()}`,
        },
        body: JSON.stringify({ location: effectiveLocation, counts }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to generate report"); return; }
      setReport(json.data as CountReport);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSubmitting(false);
    }
  };

  const variantBadge = (v: number) => {
    if (v === 0) return "bg-green-100 text-green-800";
    if (v > 0)  return "bg-blue-100 text-blue-800";
    return "bg-red-100 text-red-800";
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Physical Count</h1>
        <p className="text-sm text-gray-500">
          Scan or enter physical quantities for a location, then generate a variance report.
        </p>
      </div>

      {/* Variance report (shown after submission) */}
      {report && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">
                Variance Report — {report.location}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Counted: {new Date(report.counted_at).toLocaleString("en-PH")} ·
                {" "}{report.items_counted} of {report.total_items} items counted
              </p>
            </div>
            <div className="text-right">
              <div className={`text-lg font-bold ${report.has_variance ? "text-red-600" : "text-green-600"}`}>
                {report.has_variance
                  ? `${report.total_variance} unit${report.total_variance !== 1 ? "s" : ""} variance`
                  : "No variance"}
              </div>
              <p className="text-xs text-gray-500">total absolute variance</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Asset Tag</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Item</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Cat</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">System</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Physical</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Variance</th>
                </tr>
              </thead>
              <tbody>
                {report.report.map((row) => (
                  <tr
                    key={row.itemId}
                    className={`border-b border-gray-50 ${row.variance !== 0 ? "bg-red-50/40" : ""}`}
                  >
                    <td className="px-3 py-2 font-mono text-xs text-blue-700">
                      {row.assetTag ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-900">{row.itemName}</td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs">
                        {row.categoryCode}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{row.systemQty}</td>
                    <td className="px-3 py-2 text-right font-mono">{row.physicalQty}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${variantBadge(row.variance)}`}>
                        {row.variance > 0 ? "+" : ""}{row.variance}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button
              onClick={() => setReport(null)}
              className="px-4 py-2 border border-gray-200 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50"
            >
              New Count
            </button>
            {report.has_variance && (
              <a
                href="/movements/new"
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
              >
                Record Adjustments
              </a>
            )}
          </div>
        </div>
      )}

      {!report && (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Location selector */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">Location</h2>
            <div className="flex flex-wrap gap-2">
              {LOCATIONS.map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => setLocation(loc)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    location === loc
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {loc}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setLocation("__custom__")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  location === "__custom__"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                Other…
              </button>
            </div>

            {location === "__custom__" && (
              <input
                type="text"
                value={customLocation}
                onChange={(e) => setCustomLocation(e.target.value)}
                placeholder="Enter location name"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}

            <button
              type="button"
              onClick={() => loadItems(effectiveLocation)}
              disabled={!effectiveLocation || loading}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              {loading ? "Loading…" : "Load Items"}
            </button>
          </div>

          {/* Scanner */}
          {systemItems.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
              <h2 className="text-sm font-semibold text-gray-700">Scanner</h2>
              <p className="text-xs text-gray-500">
                Scan an item to jump to its quantity field.
              </p>
              <ScannerInput
                ref={scannerRef}
                onScan={handleScan}
                placeholder="Scan item barcode to locate it…"
              />
            </div>
          )}

          {/* Items table with qty inputs */}
          {systemItems.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">
                  {systemItems.length} items at {effectiveLocation}
                </h2>
                <button
                  type="button"
                  onClick={prefillSystemQty}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Pre-fill system quantities
                </button>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Asset Tag</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Item</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Cat</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">System Qty</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Physical Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {systemItems.map((item) => {
                    const val = physicalCounts[item.itemId] ?? "";
                    const pqty = val !== "" ? parseInt(val, 10) : null;
                    const variance = pqty !== null ? pqty - item.qtyOnHand : null;
                    return (
                      <tr key={item.itemId} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-xs text-blue-700">
                          {item.assetTag ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-gray-900">{item.itemName}</td>
                        <td className="px-4 py-2">
                          <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs">
                            {item.categoryCode}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right font-mono">{item.qtyOnHand}</td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {variance !== null && variance !== 0 && (
                              <span className={`text-xs font-medium ${variance > 0 ? "text-blue-600" : "text-red-600"}`}>
                                {variance > 0 ? "+" : ""}{variance}
                              </span>
                            )}
                            <input
                              id={`count-${item.itemId}`}
                              type="number"
                              min="0"
                              value={val}
                              onChange={(e) => setCount(item.itemId, e.target.value)}
                              placeholder={String(item.qtyOnHand)}
                              className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {systemItems.length === 0 && !loading && (
            <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">
              Select a location and click &ldquo;Load Items&rdquo; to begin.
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {systemItems.length > 0 && (
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? "Generating…" : "Generate Variance Report"}
              </button>
              <button
                type="button"
                onClick={() => setPhysicalCounts({})}
                className="px-4 py-2.5 border border-gray-200 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Clear All
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
