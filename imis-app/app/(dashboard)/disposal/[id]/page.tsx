"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";

type DisposalStatus = "requested" | "under_inspection" | "authorized" | "disposed";

interface AuditEntry {
  id: string;
  action: string;
  userId: string;
  userRole: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

interface DisposalDetail {
  id: string;
  itemId: string;
  itemName: string | null;
  assetTag: string | null;
  categoryCode: string | null;
  lifecycleStatus: string | null;
  location: string | null;
  disposalType: string;
  status: DisposalStatus;
  authorizationNo: string | null;
  requestedBy: string;
  authorizedBy: string | null;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
  audit_trail: AuditEntry[];
}

const STEPS: { key: DisposalStatus; label: string }[] = [
  { key: "requested",        label: "Requested" },
  { key: "under_inspection", label: "Under Inspection" },
  { key: "authorized",       label: "Authorized" },
  { key: "disposed",         label: "Disposed" },
];

const TYPE_LABEL: Record<string, string> = {
  condemned:   "Condemned",
  scrap_sale:  "Scrap Sale",
  donated:     "Donated",
  transferred: "Transferred",
};

const ACTION_LABEL: Record<string, string> = {
  disposal_requested:       "Request submitted",
  disposal_under_inspection:"Marked under inspection",
  disposal_authorized:      "Authorized",
  disposal_completed:       "Disposal completed",
};

function getToken(): string {
  return document.cookie.split("; ").find((c) => c.startsWith("session="))?.split("=")[1] ?? "";
}

function getRole(): string {
  try {
    const payload = getToken().split(".")[1];
    const decoded = JSON.parse(atob(payload));
    return decoded.role ?? "";
  } catch {
    return "";
  }
}

export default function DisposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<DisposalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [authNo, setAuthNo] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const role = typeof window !== "undefined" ? getRole() : "";
  const isAdmin   = role === "system_admin";
  const isManager = role === "inventory_manager" || role === "system_admin";

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/disposal/${id}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to load."); return; }
      setData(json.data);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function advance(targetStatus: DisposalStatus, extras?: Record<string, string>) {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/disposal/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ status: targetStatus, ...extras }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.detail ?? json.error ?? "Action failed.");
        return;
      }
      await load();
    } catch {
      setActionError("Network error.");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <div className="text-gray-400 p-8">Loading…</div>;
  if (error || !data) return <div className="text-red-600 p-8">{error ?? "Not found."}</div>;

  const currentStepIdx = STEPS.findIndex((s) => s.key === data.status);

  return (
    <div className="max-w-3xl space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/disposal" className="hover:text-blue-600">Disposal</Link>
        <span>/</span>
        <span className="text-gray-900 font-mono text-xs">{id.slice(0, 8)}…</span>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Disposal Request</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {data.itemName ?? "Unknown item"} · {TYPE_LABEL[data.disposalType] ?? data.disposalType}
          </p>
        </div>
      </div>

      {/* Progress stepper */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-0">
          {STEPS.map((step, idx) => {
            const done    = idx < currentStepIdx;
            const current = idx === currentStepIdx;
            return (
              <div key={step.key} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 ${
                      done    ? "bg-green-600 border-green-600 text-white"
                      : current ? "bg-blue-600 border-blue-600 text-white"
                      : "bg-white border-gray-300 text-gray-400"
                    }`}
                  >
                    {done ? "✓" : idx + 1}
                  </div>
                  <p className={`text-xs mt-1 whitespace-nowrap ${current ? "text-blue-700 font-semibold" : done ? "text-green-700" : "text-gray-400"}`}>
                    {step.label}
                  </p>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 ${done ? "bg-green-400" : "bg-gray-200"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Item details card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Item Details</h2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div><dt className="text-gray-500">Item Name</dt><dd className="font-medium text-gray-900">{data.itemName ?? "—"}</dd></div>
          <div><dt className="text-gray-500">Asset Tag</dt><dd className="font-mono text-gray-900">{data.assetTag ?? "—"}</dd></div>
          <div><dt className="text-gray-500">Category</dt><dd><span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded text-xs font-medium">{data.categoryCode ?? "—"}</span></dd></div>
          <div><dt className="text-gray-500">Location</dt><dd className="text-gray-900">{data.location ?? "—"}</dd></div>
          <div><dt className="text-gray-500">Disposal Type</dt><dd className="text-gray-900">{TYPE_LABEL[data.disposalType] ?? data.disposalType}</dd></div>
          <div><dt className="text-gray-500">Authorization No.</dt><dd className="font-mono text-gray-900">{data.authorizationNo ?? "—"}</dd></div>
        </dl>
        {data.remarks && (
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-0.5">Remarks</p>
            <p className="text-sm text-gray-700">{data.remarks}</p>
          </div>
        )}
      </div>

      {/* Action panel */}
      {data.status !== "disposed" && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Actions</h2>
          {actionError && (
            <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-700">{actionError}</div>
          )}

          {/* requested → under_inspection */}
          {data.status === "requested" && isManager && (
            <div className="flex items-center gap-3">
              <p className="text-sm text-gray-600 flex-1">Mark this request as under inspection to begin the review process.</p>
              <button
                onClick={() => advance("under_inspection")}
                disabled={actionLoading}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? "Processing…" : "Mark Under Inspection"}
              </button>
            </div>
          )}

          {/* under_inspection → authorized */}
          {data.status === "under_inspection" && isAdmin && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Inspection complete. Enter the authorization reference number to approve.</p>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Authorization No. <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={authNo}
                    onChange={(e) => setAuthNo(e.target.value)}
                    placeholder="e.g. DISP-2026-001"
                    className="field-input"
                  />
                </div>
                <button
                  onClick={() => advance("authorized", { authorization_no: authNo })}
                  disabled={actionLoading || !authNo.trim()}
                  className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {actionLoading ? "Processing…" : "Authorize"}
                </button>
              </div>
            </div>
          )}

          {/* authorized → disposed */}
          {data.status === "authorized" && isAdmin && (
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-sm text-gray-600">Complete the disposal. This will post a write-off journal entry (Dr 5130 / Cr 1920) to CAS2000 and permanently mark the item as disposed.</p>
                <p className="text-xs text-red-600 mt-1 font-medium">This action cannot be undone.</p>
              </div>
              <button
                onClick={() => advance("disposed")}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? "Processing…" : "Complete Disposal"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Audit trail */}
      {data.audit_trail.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Audit Trail</h2>
          <div className="space-y-2">
            {data.audit_trail.map((entry) => (
              <div key={entry.id} className="flex gap-3 text-sm">
                <div className="w-36 shrink-0 text-xs text-gray-400">
                  {new Date(entry.createdAt).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
                <div>
                  <span className="text-gray-900 font-medium">
                    {ACTION_LABEL[entry.action] ?? entry.action}
                  </span>
                  <span className="text-gray-400 text-xs ml-2">by {entry.userRole.replace("_", " ")}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
