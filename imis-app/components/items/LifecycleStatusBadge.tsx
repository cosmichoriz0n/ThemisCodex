"use client";

const STATUS_STYLES: Record<string, string> = {
  acquired: "bg-yellow-50 text-yellow-700 border-yellow-200",
  in_stock: "bg-green-50 text-green-700 border-green-200",
  in_service: "bg-blue-50 text-blue-700 border-blue-200",
  under_repair: "bg-orange-50 text-orange-700 border-orange-200",
  returned: "bg-purple-50 text-purple-700 border-purple-200",
  disposed: "bg-gray-50 text-gray-500 border-gray-200",
};

const STATUS_LABELS: Record<string, string> = {
  acquired: "Acquired",
  in_stock: "In Stock",
  in_service: "In Service",
  under_repair: "Under Repair",
  returned: "Returned",
  disposed: "Disposed",
};

export default function LifecycleStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-gray-50 text-gray-500 border-gray-200";
  const label = STATUS_LABELS[status] ?? status;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${style}`}
    >
      {label}
    </span>
  );
}
