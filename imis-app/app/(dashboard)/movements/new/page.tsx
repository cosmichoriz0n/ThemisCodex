"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import ScannerInput, { type ScannerInputHandle } from "@/components/barcode/ScannerInput";

const MOVEMENT_TYPES = [
  { value: "receive",  label: "Receive",  desc: "Stock received from supplier / acquisition" },
  { value: "issue",    label: "Issue",    desc: "Issue to member, crew, or location" },
  { value: "return",   label: "Return",   desc: "Return from service or repair" },
  { value: "adjust",   label: "Adjust",   desc: "Manual quantity adjustment (manager only)" },
  { value: "transfer", label: "Transfer", desc: "Move between locations (manager only)" },
  { value: "dispose",  label: "Dispose",  desc: "Write-off / condemnation (manager only)" },
] as const;

type MovementType = typeof MOVEMENT_TYPES[number]["value"];

interface ItemSearchResult {
  itemId:          string;
  itemName:        string;
  assetTag:        string | null;
  categoryCode:    string;
  location:        string | null;
  lifecycleStatus: string;
  qtyOnHand:       number | null;
}

interface FormState {
  itemId:          string;
  itemName:        string;
  qtyOnHand:       number;
  lifecycleStatus: string;
  movementType:    MovementType;
  quantity:        string;
  fromLocation:    string;
  toLocation:      string;
  memberId:        string;
  referenceNo:     string;
  unitCost:        string;
  remarks:         string;
  managerOverride: boolean;
  overrideReason:  string;
}

const DEFAULT: FormState = {
  itemId:          "",
  itemName:        "",
  qtyOnHand:       0,
  lifecycleStatus: "",
  movementType:    "receive",
  quantity:        "",
  fromLocation:    "main_warehouse",
  toLocation:      "",
  memberId:        "",
  referenceNo:     "",
  unitCost:        "",
  remarks:         "",
  managerOverride: false,
  overrideReason:  "",
};

function getSessionToken(): string {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith("session="))
    ?.split("=")[1] ?? "";
}

export default function NewMovementPage() {
  const router = useRouter();
  const scannerRef = useRef<ScannerInputHandle>(null);

  const [form, setForm]             = useState<FormState>(DEFAULT);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ItemSearchResult[]>([]);
  const [searching, setSearching]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState<string | null>(null);

  const set = (key: keyof FormState, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Search items by name or barcode
  const searchItems = useCallback(async (q: string) => {
    if (!q) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(
        `/api/items?search=${encodeURIComponent(q)}&page=1`,
        { headers: { Authorization: `Bearer ${getSessionToken()}` } }
      );
      const json = await res.json();
      setSearchResults((json.data ?? []) as ItemSearchResult[]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleBarcodeSearch = useCallback(
    async (code: string) => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/items?search=${encodeURIComponent(code)}&page=1`,
          { headers: { Authorization: `Bearer ${getSessionToken()}` } }
        );
        const json = await res.json();
        const results = (json.data ?? []) as ItemSearchResult[];
        if (results.length === 1) {
          selectItem(results[0]);
        } else {
          setSearchResults(results);
          setSearchQuery(code);
        }
      } finally {
        setSearching(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const selectItem = (item: ItemSearchResult) => {
    setForm((f) => ({
      ...f,
      itemId:          item.itemId,
      itemName:        item.itemName,
      qtyOnHand:       item.qtyOnHand ?? 0,
      lifecycleStatus: item.lifecycleStatus,
      fromLocation:    item.location ?? "main_warehouse",
    }));
    setSearchQuery(item.itemName);
    setSearchResults([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.itemId) { setError("Please select an item first."); return; }

    const qty = parseInt(form.quantity, 10);
    if (isNaN(qty)) { setError("Quantity must be a number."); return; }

    // For adjust: allow negative values (pass as-is)
    // For all others: must be positive
    if (form.movementType !== "adjust" && qty <= 0) {
      setError("Quantity must be greater than 0.");
      return;
    }

    if (form.managerOverride && !form.overrideReason.trim()) {
      setError("Override reason is required when using manager override.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/movements", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${getSessionToken()}`,
        },
        body: JSON.stringify({
          item_id:          form.itemId,
          movement_type:    form.movementType,
          quantity:         qty,
          from_location:    form.fromLocation || "main_warehouse",
          to_location:      form.toLocation   || undefined,
          member_id:        form.memberId     || undefined,
          reference_no:     form.referenceNo  || undefined,
          unit_cost:        form.unitCost ? parseFloat(form.unitCost) : undefined,
          remarks:          form.remarks      || undefined,
          manager_override: form.managerOverride,
          override_reason:  form.overrideReason || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Movement failed.");
        return;
      }

      const { new_qty, new_status, reorder_triggered } = json.data ?? {};
      let msg = `Movement recorded. New qty: ${new_qty}`;
      if (new_status) msg += ` | Status: ${new_status}`;
      if (reorder_triggered) msg += " ⚠ Reorder alert triggered.";
      setSuccess(msg);

      // Reset form but keep movement type
      const mt = form.movementType;
      setForm({ ...DEFAULT, movementType: mt });
      setSearchQuery("");
      setSearchResults([]);
      scannerRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  const mt = form.movementType;
  const showToLocation   = mt === "transfer";
  const showMemberId     = mt === "issue";
  const showUnitCost     = mt === "receive";
  const showAdjustHint   = mt === "adjust";
  const managerOnlyTypes: MovementType[] = ["adjust", "transfer", "dispose"];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">New Stock Movement</h1>
        <p className="text-sm text-gray-500">Record a stock transaction against an item.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Item selection */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Item</h2>

          {/* Barcode scanner */}
          <div>
            <p className="text-xs text-gray-500 mb-1">Scan barcode or search by name</p>
            <ScannerInput
              ref={scannerRef}
              onScan={handleBarcodeSearch}
              placeholder="Scan barcode or type item name…"
            />
          </div>

          {/* Text search */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                searchItems(e.target.value);
              }}
              placeholder="Search by item name…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searching && (
              <span className="absolute right-3 top-2 text-xs text-gray-400">Searching…</span>
            )}
          </div>

          {/* Search results dropdown */}
          {searchResults.length > 0 && (
            <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
              {searchResults.map((item) => (
                <li key={item.itemId}>
                  <button
                    type="button"
                    onClick={() => selectItem(item)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                  >
                    <span className="font-mono text-xs text-blue-700 mr-2">{item.assetTag}</span>
                    <span className="font-medium text-gray-800">{item.itemName}</span>
                    <span className="ml-2 text-gray-400 text-xs">{item.categoryCode}</span>
                    <span className="ml-2 text-gray-500 text-xs">Qty: {item.qtyOnHand ?? 0}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Selected item summary */}
          {form.itemId && (
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-sm">
              <span className="font-medium text-blue-800">{form.itemName}</span>
              <span className="ml-3 text-blue-600">
                System qty: <strong>{form.qtyOnHand}</strong>
              </span>
              <span className="ml-3 text-blue-600">
                Status: <strong>{form.lifecycleStatus}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Movement type */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Movement Type</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {MOVEMENT_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => set("movementType", t.value)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  form.movementType === t.value
                    ? "border-blue-500 bg-blue-50 text-blue-800"
                    : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{t.desc}</div>
                {managerOnlyTypes.includes(t.value) && (
                  <div className="text-xs text-amber-600 mt-0.5">Manager+</div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Quantity + locations */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Details</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Quantity{showAdjustHint && " (negative to subtract)"}
                <span className="text-red-500 ml-0.5">*</span>
              </label>
              <input
                type="number"
                value={form.quantity}
                onChange={(e) => set("quantity", e.target.value)}
                placeholder={showAdjustHint ? "e.g. -5 or +10" : "e.g. 10"}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                From Location
              </label>
              <input
                type="text"
                value={form.fromLocation}
                onChange={(e) => set("fromLocation", e.target.value)}
                placeholder="main_warehouse"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {showToLocation && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                To Location <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.toLocation}
                onChange={(e) => set("toLocation", e.target.value)}
                placeholder="e.g. warehouse_b"
                required={showToLocation}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {showMemberId && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Member / Recipient ID
              </label>
              <input
                type="text"
                value={form.memberId}
                onChange={(e) => set("memberId", e.target.value)}
                placeholder="MIMS member ID or employee ID"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Reference No.
              </label>
              <input
                type="text"
                value={form.referenceNo}
                onChange={(e) => set("referenceNo", e.target.value)}
                placeholder="PO / RIS / DR no."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {showUnitCost && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Unit Cost (PHP)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={form.unitCost}
                  onChange={(e) => set("unitCost", e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Remarks
            </label>
            <textarea
              value={form.remarks}
              onChange={(e) => set("remarks", e.target.value)}
              rows={2}
              placeholder="Optional notes"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Manager override (shown for issue movements when qty might be insufficient) */}
        {(mt === "issue" || mt === "dispose" || mt === "transfer") && (
          <div className="bg-white rounded-xl border border-amber-200 p-4 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.managerOverride}
                onChange={(e) => set("managerOverride", e.target.checked)}
                className="rounded border-gray-300 text-amber-600"
              />
              <span className="text-sm font-medium text-amber-800">
                Manager override (allow over-issuance)
              </span>
              <span className="text-xs text-amber-600">Requires manager+ role</span>
            </label>
            {form.managerOverride && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Override reason <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.overrideReason}
                  onChange={(e) => set("overrideReason", e.target.value)}
                  placeholder="Reason for override"
                  required={form.managerOverride}
                  className="w-full rounded-md border border-amber-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            )}
          </div>
        )}

        {/* Error / success messages */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            {success}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting || !form.itemId}
            className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Processing…" : "Record Movement"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/movements")}
            className="px-4 py-2.5 border border-gray-200 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
