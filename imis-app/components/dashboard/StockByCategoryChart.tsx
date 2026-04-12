"use client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface StockCategory {
  categoryCode: string;
  totalOnHand: number;
  itemCount: number;
}

interface Props {
  data: StockCategory[];
}

export default function StockByCategoryChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400">
        No stock data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart
        data={data}
        margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
        barSize={20}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis
          dataKey="categoryCode"
          tick={{ fontSize: 10, fill: "#6b7280" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#6b7280" }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #e5e7eb" }}
          formatter={(value, _name, entry) => [
            `${Number(value).toLocaleString()} units (${(entry.payload as StockCategory | undefined)?.itemCount ?? 0} items)`,
            "On Hand",
          ]}
          labelFormatter={(label) => `Category: ${label}`}
        />
        <Bar dataKey="totalOnHand" fill="#3b82f6" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
