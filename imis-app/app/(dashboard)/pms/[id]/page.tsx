"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";

interface PmsSchedule {
  id: string;
  itemId: string;
  pmsType: string;
  dueDate: string | null;
  dueMileage: number | null;
  lastDoneAt: string | null;
  lastMileage: number | null;
  status: "pending" | "overdue" | "completed";
  createdAt: string;
  updatedAt: string;
}

interface PmsDetail {
  schedule: PmsSchedule & {
    itemName: string | null;
    assetTag: string | null;
    categoryCode: string | null;
    location: string | null;
  };
  attrs: Record<string, string>;
  history: PmsSchedule[];
}

const STATUS_BADGE: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-800",
  overdue:   "bg-red-100 text-red-800",
  completed: "bg-green-100 text-green-800",
};

function getToken(): string {
  return document.cookie.split("; ").find((c) => c.startsWith("session="))?.split("=")[1] ?? "";
}

function getRole(): string {
  try {
    const payload = getToken().split(".")[1];
    return JSON.parse(atob(payload)).role ?? "";
  } catch {
    return "";
  }
}

export default function PmsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<PmsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Completion form
  const [completedAt, setCompletedAt]       = useState(new Date().toISOString().slice(0, 10));
  const [completedMileage, setCompletedMileage] = useState("");
  const [technician, setTechnician]         = useState("");
  const [notes, setNotes]                   = useState("");
  const [completing, setCompleting]         = useState(false);
  const [completeError, setCompleteError]   = useState<string | null>(null);

  // Mileage update
  const [currentMileage, setCurrentMileage] = useState("");
  const [updatingMileage, setUpdatingMileage] = useState(false);
  const [mileageMsg, setMileageMsg]         = useState<string | null>(null);

  const role = typeof window !== "undefined" ? getRole() : "";
  const canManage = role === "inventory_manager" || role === "system_admin";

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/pms/${id}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to load."); return; }
      setData(json.data);
      if (json.data.attrs?.mileage) setCurrentMileage(json.data.attrs.mileage);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault();
    setCompleting(true);
    setCompleteError(null);
    try {
      const res = await fetch(`/api/pms/${id}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          completed_at: completedAt,
          completed_mileage: completedMileage ? parseInt(completedMileage, 10) : undefined,
          technician,
          notes: notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setCompleteError(json.detail ?? json.error ?? "Failed."); return; }
      await load();
    } catch {
      setCompleteError("Network error.");
    } finally {
      setCompleting(false);
    }
  }

  async function handleMileageUpdate(e: React.FormEvent) {
    e.preventDefault();
    setUpdatingMileage(true);
    setMileageMsg(null);
    try {
      const res = await fetch(`/api/pms/${id}/mileage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ current_mileage: parseInt(currentMileage, 10) }),
      });
      const json = await res.json();
      if (!res.ok) { setMileageMsg(json.error ?? "Failed."); return; }
      setMileageMsg(json.data.now_overdue ? "Mileage updated — schedule is now overdue." : "Mileage updated.");
      await load();
    } catch {
      setMileageMsg("Network error.");
    } finally {
      setUpdatingMileage(false);
    }
  }

  if (loading) return <div className="text-gray-400 p-8">Loading…</div>;
  if (error || !data) return <div className="text-red-600 p-8">{error ?? "Not found."}</div>;

  const { schedule, attrs, history } = data;

  return (
    <div className="max-w-3xl space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/pms" className="hover:text-blue-600">PMS Schedules</Link>
        <span>/</span>
        <span className="text-gray-900">{schedule.itemName ?? id.slice(0, 8)}</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{schedule.itemName ?? "PMS Schedule"}</h1>
          <p className="text-sm text-gray-500">{schedule.pmsType} · {schedule.categoryCode} · {schedule.assetTag ?? "No tag"}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_BADGE[schedule.status] ?? "bg-gray-100 text-gray-700"}`}>
          {schedule.status}
        </span>
      </div>

      {/* Vehicle info card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Vehicle / Equipment Info</h2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div><dt className="text-gray-500">Plate No.</dt><dd className="font-mono font-medium text-gray-900">{attrs.plate_no ?? "—"}</dd></div>
          <div><dt className="text-gray-500">Make / Model</dt><dd className="text-gray-900">{attrs.make && attrs.model ? `${attrs.make} ${attrs.model}` : "—"}</dd></div>
          <div><dt className="text-gray-500">Year</dt><dd className="text-gray-900">{attrs.year ?? "—"}</dd></div>
          <div><dt className="text-gray-500">OR No.</dt><dd className="font-mono text-gray-900">{attrs.or_no ?? "—"}</dd></div>
          <div><dt className="text-gray-500">Location</dt><dd className="text-gray-900">{schedule.location ?? "—"}</dd></div>
        </dl>
      </div>

      {/* Current PMS schedule */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Current Schedule</h2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div><dt className="text-gray-500">PMS Type</dt><dd className="font-medium text-gray-900">{schedule.pmsType}</dd></div>
          <div>
            <dt className="text-gray-500">Due Date</dt>
            <dd className={`font-medium ${schedule.status === "overdue" ? "text-red-700" : "text-gray-900"}`}>
              {schedule.dueDate ? new Date(schedule.dueDate).toLocaleDateString("en-PH") : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Due Mileage</dt>
            <dd className="font-medium text-gray-900">{schedule.dueMileage != null ? `${schedule.dueMileage.toLocaleString()} km` : "—"}</dd>
          </div>
          <div><dt className="text-gray-500">Last Done</dt><dd className="text-gray-900">{schedule.lastDoneAt ? new Date(schedule.lastDoneAt).toLocaleDateString("en-PH") : "—"}</dd></div>
          <div><dt className="text-gray-500">Last Mileage</dt><dd className="text-gray-900">{schedule.lastMileage != null ? `${schedule.lastMileage.toLocaleString()} km` : "—"}</dd></div>
        </dl>
      </div>

      {/* Actions — only when not completed */}
      {canManage && schedule.status !== "completed" && (
        <>
          {/* Log completion */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Log PMS Completion</h2>
            {completeError && (
              <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-700">{completeError}</div>
            )}
            <form onSubmit={handleComplete} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Date Completed <span className="text-red-500">*</span></label>
                  <input type="date" value={completedAt} onChange={(e) => setCompletedAt(e.target.value)}
                    required className="field-input" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Mileage at Completion (km)</label>
                  <input type="number" value={completedMileage} onChange={(e) => setCompletedMileage(e.target.value)}
                    min={0} className="field-input" placeholder="Optional" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Technician <span className="text-red-500">*</span></label>
                  <input type="text" value={technician} onChange={(e) => setTechnician(e.target.value)}
                    required className="field-input" placeholder="Name of technician" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Notes</label>
                  <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                    className="field-input" placeholder="Work done, parts replaced, etc." />
                </div>
              </div>
              <button
                type="submit"
                disabled={completing || !technician}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {completing ? "Saving…" : "Log Completion"}
              </button>
            </form>
          </div>

          {/* Update mileage */}
          {schedule.dueMileage != null && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Update Current Mileage</h2>
              {mileageMsg && (
                <div className={`mb-3 rounded p-2 text-sm ${mileageMsg.includes("overdue") ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-700 border border-green-200"}`}>
                  {mileageMsg}
                </div>
              )}
              <form onSubmit={handleMileageUpdate} className="flex gap-3 items-end">
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium text-gray-600">Current Mileage (km)</label>
                  <input
                    type="number"
                    value={currentMileage}
                    onChange={(e) => setCurrentMileage(e.target.value)}
                    min={0}
                    required
                    className="field-input"
                    placeholder="Enter current odometer reading"
                  />
                </div>
                <button
                  type="submit"
                  disabled={updatingMileage || !currentMileage}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {updatingMileage ? "Saving…" : "Update"}
                </button>
              </form>
              <p className="text-xs text-gray-400 mt-2">Due at {schedule.dueMileage.toLocaleString()} km. Will flip to overdue if current ≥ due.</p>
            </div>
          )}
        </>
      )}

      {/* Maintenance history */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Maintenance History</h2>
        {history.length === 0 ? (
          <p className="text-sm text-gray-400">No history yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">PMS Type</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Due Date</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600 text-xs">Due Mileage</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Done</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600 text-xs">Done Mileage</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className={`border-b border-gray-50 ${h.id === id ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                    <td className="px-3 py-2 text-gray-900">{h.pmsType}</td>
                    <td className="px-3 py-2 text-gray-600 text-xs">{h.dueDate ? new Date(h.dueDate).toLocaleDateString("en-PH") : "—"}</td>
                    <td className="px-3 py-2 text-right text-gray-600 text-xs">{h.dueMileage != null ? `${h.dueMileage.toLocaleString()} km` : "—"}</td>
                    <td className="px-3 py-2 text-gray-600 text-xs">{h.lastDoneAt ? new Date(h.lastDoneAt).toLocaleDateString("en-PH") : "—"}</td>
                    <td className="px-3 py-2 text-right text-gray-600 text-xs">{h.lastMileage != null ? `${h.lastMileage.toLocaleString()} km` : "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[h.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {h.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
