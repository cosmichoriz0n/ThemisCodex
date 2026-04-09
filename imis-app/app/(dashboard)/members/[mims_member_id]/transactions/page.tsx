"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";

interface MemberInfo {
  mimsMemberId:   string;
  fullName:       string;
  membershipType: string | null;
  status:         string;
  address:        string | null;
  contactNo:      string | null;
  lastSyncAt:     string | null;
}

interface Movement {
  movementId:   string;
  itemId:       string;
  itemName:     string;
  assetTag:     string | null;
  categoryCode: string;
  quantity:     number;
  unitCost:     string | null;
  referenceNo:  string | null;
  remarks:      string | null;
  movedBy:      string;
  movedAt:      string;
}

function getSessionToken(): string {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith("session="))
    ?.split("=")[1] ?? "";
}

const STATUS_COLORS: Record<string, string> = {
  active:       "bg-green-100 text-green-800",
  inactive:     "bg-gray-100 text-gray-600",
  disconnected: "bg-red-100 text-red-700",
};

export default function MemberTransactionsPage() {
  const router       = useRouter();
  const params       = useParams<{ mims_member_id: string }>();
  const searchParams = useSearchParams();
  const memberId     = params.mims_member_id;

  const [member, setMember]       = useState<MemberInfo | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const [fromDate, setFromDate] = useState(searchParams.get("from") ?? "");
  const [toDate, setToDate]     = useState(searchParams.get("to") ?? "");
  const [category, setCategory] = useState(searchParams.get("category") ?? "");

  const fetchData = useCallback(
    async (from: string, to: string, cat: string) => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (from)  qs.set("from", from);
        if (to)    qs.set("to", to);
        if (cat)   qs.set("category", cat);

        const res = await fetch(
          `/api/members/${encodeURIComponent(memberId)}/transactions${qs.size ? `?${qs}` : ""}`,
          { headers: { Authorization: `Bearer ${getSessionToken()}` } }
        );
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Failed to load.");
          return;
        }
        setMember(json.data.member);
        setMovements(json.data.movements ?? []);
      } finally {
        setLoading(false);
      }
    },
    [memberId]
  );

  useEffect(() => {
    fetchData(fromDate, toDate, category);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyFilter = () => {
    fetchData(fromDate, toDate, category);
  };

  // Group movements by category
  const grouped = movements.reduce<Record<string, Movement[]>>((acc, m) => {
    (acc[m.categoryCode] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="max-w-4xl space-y-6">
      {/* Back link */}
      <div>
        <Link
          href="/movements"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to Movements
        </Link>
      </div>

      {/* Member header */}
      {loading && !member ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : member ? (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold text-gray-900">{member.fullName}</h1>
                <p className="text-sm text-gray-500 mt-0.5 font-mono">{member.mimsMemberId}</p>
                {member.membershipType && (
                  <p className="text-sm text-gray-500 mt-1 capitalize">{member.membershipType}</p>
                )}
                {member.address && (
                  <p className="text-sm text-gray-400 mt-0.5">{member.address}</p>
                )}
                {member.contactNo && (
                  <p className="text-sm text-gray-400">{member.contactNo}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[member.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {member.status}
                </span>
                {member.lastSyncAt && (
                  <span className="text-xs text-gray-400">
                    Synced {new Date(member.lastSyncAt).toLocaleDateString("en-PH")}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Filter Issuances</h2>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value.toUpperCase())}
                  placeholder="e.g. LM, IT"
                  maxLength={4}
                  className="w-24 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={applyFilter}
                disabled={loading}
                className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Loading…" : "Apply"}
              </button>
              {(fromDate || toDate || category) && (
                <button
                  onClick={() => {
                    setFromDate("");
                    setToDate("");
                    setCategory("");
                    fetchData("", "", "");
                  }}
                  className="px-3 py-1.5 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Results */}
          {movements.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 px-6 py-10 text-center">
              <p className="text-sm text-gray-400">No issuances found for this member.</p>
              {(fromDate || toDate || category) && (
                <p className="text-xs text-gray-400 mt-1">Try widening the date range or removing the category filter.</p>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <p className="text-xs text-gray-500">
                {movements.length} issuance{movements.length !== 1 ? "s" : ""} across {Object.keys(grouped).length} categor{Object.keys(grouped).length !== 1 ? "ies" : "y"}
              </p>

              {Object.entries(grouped)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([catCode, rows]) => (
                  <div key={catCode} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                        {catCode}
                      </span>
                      <span className="text-sm text-gray-500">
                        {rows.length} item{rows.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {rows.map((mv) => (
                        <div key={mv.movementId} className="px-4 py-3 text-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {mv.assetTag && (
                                  <span className="font-mono text-xs text-blue-600">{mv.assetTag}</span>
                                )}
                                <span className="font-medium text-gray-800 truncate">{mv.itemName}</span>
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap gap-x-3">
                                <span>By: {mv.movedBy}</span>
                                {mv.referenceNo && <span>SR: {mv.referenceNo}</span>}
                                {mv.remarks && <span className="truncate max-w-xs">"{mv.remarks}"</span>}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-semibold text-gray-800">Qty {mv.quantity}</div>
                              <div className="text-xs text-gray-400">
                                {new Date(mv.movedAt).toLocaleDateString("en-PH")}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
