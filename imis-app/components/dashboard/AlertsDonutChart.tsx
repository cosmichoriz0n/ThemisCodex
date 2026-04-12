"use client";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface AlertCount {
  alertType: string;
  count: number;
}

interface Props {
  data: AlertCount[];
  totalAlerts: number;
}

const ALERT_LABELS: Record<string, string> = {
  low_stock:        "Low Stock",
  pms_due:          "PMS Due",
  expiry:           "Expiry",
  license_expiry:   "License Expiry",
  calibration_due:  "Calibration",
  lto_renewal:      "LTO Renewal",
  insurance_expiry: "Insurance",
  emission_due:     "Emission",
};

const ALERT_COLORS: Record<string, string> = {
  low_stock:        "#f97316", // orange
  pms_due:          "#eab308", // yellow
  expiry:           "#ef4444", // red
  license_expiry:   "#dc2626", // red-dark
  calibration_due:  "#f59e0b", // amber
  lto_renewal:      "#8b5cf6", // violet
  insurance_expiry: "#6366f1", // indigo
  emission_due:     "#14b8a6", // teal
};

const DEFAULT_COLOR = "#9ca3af";

export default function AlertsDonutChart({ data, totalAlerts }: Props) {
  if (!data || data.length === 0 || totalAlerts === 0) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="text-center">
          <p className="text-2xl font-bold text-green-600">0</p>
          <p className="text-xs text-gray-400 mt-1">Open Alerts</p>
        </div>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    name:  ALERT_LABELS[d.alertType] ?? d.alertType,
    value: d.count,
    color: ALERT_COLORS[d.alertType] ?? DEFAULT_COLOR,
  }));

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={48}
            outerRadius={72}
            paddingAngle={2}
            dataKey="value"
            strokeWidth={0}
          >
            {chartData.map((entry, idx) => (
              <Cell key={idx} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #e5e7eb" }}
            formatter={(value, name) => [`${value} items`, name]}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 10 }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Center label */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center" style={{ marginTop: "-24px" }}>
          <p className="text-xl font-bold text-gray-900">{totalAlerts}</p>
          <p className="text-xs text-gray-400">Open</p>
        </div>
      </div>
    </div>
  );
}
