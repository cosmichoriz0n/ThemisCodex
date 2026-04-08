"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

export const dynamic = "force-dynamic";

const ALERT_TYPE_LABELS: Record<string, string> = {
  low_stock:       "Low Stock",
  pms_due:         "PMS Due",
  expiry:          "Expiry Warning",
  license_expiry:  "License Expiry",
  calibration_due: "Calibration Due",
};

const ALERT_TYPE_COLORS: Record<string, string> = {
  low_stock:       "bg-orange-100 text-orange-800",
  pms_due:         "bg-yellow-100 text-yellow-800",
  expiry:          "bg-red-100 text-red-800",
  license_expiry:  "bg-red-100 text-red-800",
  calibration_due: "bg-amber-100 text-amber-800",
};

const STATUS_COLORS: Record<string, string> = {
  open:         "bg-red-100 text-red-800",
  acknowledged: "bg-yellow-100 text-yellow-800",
  resolved:     "bg-green-100 text-green-800",
};

interface Alert {
  id: string;
  itemId: string;
  itemName: string;
  assetTag: string | null;
  categoryCode: string;
  alertType: string;
  status: string;
  details: string | null;
  triggeredAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

const MANAGER_ROLES = ["inventory_manager", "system_admin"];

export default function AlertsPage() {
  const { user, role } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [statusFilter, setStatusFilter] = useState("open");
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchAlerts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("alert_type", typeFilter);
      const res = await fetch(`/api/alerts?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch alerts");
      const json = await res.json() as { data: Alert[] };
      setAlerts(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [user, statusFilter, typeFilter]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const handleAction = async (id: string, action: "acknowledge" | "resolve") => {
    if (!user) return;
    setActionLoading(id);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/alerts", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) {
        const j = await res.json() as { error?: string };
        throw new Error(j.error ?? "Failed");
      }
      await fetchAlerts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  const canAct = role && MANAGER_ROLES.includes(role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Alerts</h1>
          <p className="text-sm text-gray-500">PMS, expiry, license, calibration, and stock alerts</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">All types</option>
          {Object.entries(ALERT_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <p className="text-sm text-gray-400 p-6">Loading...</p>
        ) : alerts.length === 0 ? (
          <p className="text-sm text-gray-400 p-6">No alerts found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-600 text-xs">Item</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600 text-xs">Type</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600 text-xs">Details</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600 text-xs">Status</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600 text-xs">Triggered</th>
                {canAct && (
                  <th className="px-4 py-2 text-right font-medium text-gray-600 text-xs">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <a href={`/movements/${alert.itemId}`} className="font-medium text-blue-700 hover:underline">
                      {alert.itemName}
                    </a>
                    <div className="text-xs text-gray-400">
                      {alert.categoryCode}{alert.assetTag ? ` · ${alert.assetTag}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${ALERT_TYPE_COLORS[alert.alertType] ?? "bg-gray-100 text-gray-700"}`}>
                      {ALERT_TYPE_LABELS[alert.alertType] ?? alert.alertType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 max-w-xs">{alert.details ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[alert.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {alert.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(alert.triggeredAt).toLocaleString("en-PH", {
                      month: "short", day: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </td>
                  {canAct && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {alert.status === "open" && (
                          <button
                            onClick={() => handleAction(alert.id, "acknowledge")}
                            disabled={actionLoading === alert.id}
                            className="text-xs text-yellow-700 hover:underline disabled:opacity-50"
                          >
                            Acknowledge
                          </button>
                        )}
                        {alert.status !== "resolved" && (
                          <button
                            onClick={() => handleAction(alert.id, "resolve")}
                            disabled={actionLoading === alert.id}
                            className="text-xs text-green-700 hover:underline disabled:opacity-50"
                          >
                            Resolve
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
