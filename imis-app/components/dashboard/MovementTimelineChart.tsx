"use client";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface RecentMovement {
  movementId: string;
  movedAt: string;
  movementType?: string;
}

interface Props {
  movements: RecentMovement[];
}

function buildDailyData(movements: RecentMovement[]) {
  // Group movements by day (PHT) for the last 7 days
  const now = new Date();
  const days: { date: string; label: string; count: number }[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString("en-PH", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const label = d.toLocaleDateString("en-PH", {
      timeZone: "Asia/Manila",
      month: "short",
      day: "numeric",
    });
    days.push({ date: dateStr, label, count: 0 });
  }

  for (const m of movements) {
    const dateStr = new Date(m.movedAt).toLocaleDateString("en-PH", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const bucket = days.find((d) => d.date === dateStr);
    if (bucket) bucket.count++;
  }

  return days;
}

export default function MovementTimelineChart({ movements }: Props) {
  const data = buildDailyData(movements ?? []);
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  if (movements.length === 0) {
    return (
      <div className="flex items-center justify-center h-28 text-sm text-gray-400">
        No movements in the last 7 days
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={120}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="movementGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={true} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "#6b7280" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#6b7280" }}
          axisLine={false}
          tickLine={false}
          width={24}
          domain={[0, maxCount + 1]}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #e5e7eb" }}
          formatter={(value) => [`${value} movement${value !== 1 ? "s" : ""}`, ""]}
          labelFormatter={(label) => label}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="#3b82f6"
          strokeWidth={2}
          fill="url(#movementGradient)"
          dot={{ r: 3, fill: "#3b82f6", strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
