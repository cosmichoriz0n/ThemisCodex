"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type LifecycleStatus = "acquired" | "in_stock" | "in_service" | "under_repair" | "returned" | "disposed";

interface ItemOption {
  item_id: string;
  item_name: string;
  asset_tag: string | null;
  category_code: string;
  lifecycle_status: LifecycleStatus;
}

const DISPOSAL_TYPES = [
  { value: "condemned",   label: "Condemned" },
  { value: "scrap_sale",  label: "Scrap Sale" },
  { value: "donated",     label: "Donated" },
  { value: "transferred", label: "Transferred" },
] as const;

function getToken(): string {
  return document.cookie.split("; ").find((c) => c.startsWith("session="))?.split("=")[1] ?? "";
}

export default function NewDisposalPage() {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [itemOptions, setItemOptions] = useState<ItemOption[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const [selectedItem, setSelectedItem] = useState<ItemOption | null>(null);
  const [disposalType, setDisposalType] = useState<string>("");
  const [remarks, setRemarks] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce search → fetch items
  useEffect(() => {
    if (search.length < 2) {
      setItemOptions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoadingItems(true);
      try {
        const res = await fetch(
          `/api/items?q=${encodeURIComponent(search)}&page_size=20`,
          { headers: { Authorization: `Bearer ${getToken()}` } }
        );
        const json = await res.json();
        const filtered = (json.data ?? []).filter(
          (i: ItemOption) => i.lifecycle_status !== "disposed"
        );
        setItemOptions(filtered);
      } catch {
        // ignore
      } finally {
        setLoadingItems(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedItem || !disposalType) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/disposal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          item_id: selectedItem.item_id,
          disposal_type: disposalType,
          remarks: remarks || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to create disposal request.");
        return;
      }
      router.push(`/disposal/${json.data.id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/disposal" className="hover:text-blue-600">Disposal</Link>
        <span>/</span>
        <span className="text-gray-900">New Request</span>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-gray-900">New Disposal Request</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Initiates the 4-step approval workflow. Authorization by system_admin required before disposal is final.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        {/* Item search */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">
            Item <span className="text-red-500">*</span>
          </label>
          {selectedItem ? (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <div>
                <p className="text-sm font-medium text-blue-900">{selectedItem.item_name}</p>
                <p className="text-xs text-blue-600">
                  {selectedItem.asset_tag ?? selectedItem.item_id} · {selectedItem.category_code} · {selectedItem.lifecycle_status}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedItem(null); setSearch(""); }}
                className="text-xs text-blue-600 hover:text-blue-800 underline ml-4"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                type="text"
                placeholder="Search by item name or asset tag…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="field-input"
              />
              {(loadingItems || itemOptions.length > 0) && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                  {loadingItems && (
                    <p className="px-3 py-2 text-sm text-gray-400">Searching…</p>
                  )}
                  {itemOptions.map((item) => (
                    <button
                      key={item.item_id}
                      type="button"
                      onClick={() => { setSelectedItem(item); setItemOptions([]); setSearch(""); }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                    >
                      <p className="text-sm font-medium text-gray-900">{item.item_name}</p>
                      <p className="text-xs text-gray-500">
                        {item.asset_tag ?? "No tag"} · {item.category_code} · {item.lifecycle_status}
                      </p>
                    </button>
                  ))}
                  {!loadingItems && itemOptions.length === 0 && search.length >= 2 && (
                    <p className="px-3 py-2 text-sm text-gray-400">No items found.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Disposal type */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">
            Disposal Type <span className="text-red-500">*</span>
          </label>
          <select
            value={disposalType}
            onChange={(e) => setDisposalType(e.target.value)}
            required
            className="field-input"
          >
            <option value="">Select type…</option>
            {DISPOSAL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Remarks */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Remarks</label>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={3}
            placeholder="Reason for disposal, condition details, etc."
            className="field-input resize-none"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting || !selectedItem || !disposalType}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Submitting…" : "Submit Disposal Request"}
          </button>
          <Link
            href="/disposal"
            className="px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
