import type { Role } from "@/types/auth";

const ROLE_STYLES: Record<Role, string> = {
  system_admin: "bg-purple-100 text-purple-800",
  inventory_manager: "bg-blue-100 text-blue-800",
  inventory_staff: "bg-green-100 text-green-800",
  finance_officer: "bg-yellow-100 text-yellow-800",
  auditor: "bg-gray-100 text-gray-700",
};

const ROLE_LABELS: Record<Role, string> = {
  system_admin: "Admin",
  inventory_manager: "Manager",
  inventory_staff: "Staff",
  finance_officer: "Finance",
  auditor: "Auditor",
};

export default function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ROLE_STYLES[role]}`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}
