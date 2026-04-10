"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/types/auth";

interface NavItem {
  href: string;
  label: string;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["inventory_staff", "inventory_manager", "finance_officer", "system_admin", "auditor"] },
  { href: "/inventory", label: "Inventory", roles: ["inventory_staff", "inventory_manager", "finance_officer", "system_admin", "auditor"] },
  { href: "/movements/new", label: "New Movement", roles: ["inventory_staff", "inventory_manager", "system_admin"] },
  { href: "/movements", label: "Movement History", roles: ["inventory_staff", "inventory_manager", "finance_officer", "system_admin", "auditor"] },
  { href: "/physical-count", label: "Physical Count", roles: ["inventory_staff", "inventory_manager", "system_admin"] },
  { href: "/items", label: "Item Catalog", roles: ["inventory_manager", "system_admin"] },
  { href: "/members", label: "Members", roles: ["inventory_staff", "inventory_manager", "finance_officer", "system_admin"] },
  { href: "/transactions", label: "Transactions", roles: ["inventory_staff", "inventory_manager", "finance_officer", "system_admin", "auditor"] },
  { href: "/reconciliation", label: "Reconciliation", roles: ["finance_officer", "inventory_manager", "system_admin", "auditor"] },
  { href: "/disposal", label: "Disposal", roles: ["inventory_manager", "system_admin", "auditor"] },
  { href: "/upis", label: "UPIS Module", roles: ["inventory_manager", "finance_officer", "system_admin", "auditor"] },
  { href: "/pms", label: "PMS Schedules", roles: ["inventory_staff", "inventory_manager", "system_admin"] },
  { href: "/alerts", label: "Alerts", roles: ["inventory_staff", "inventory_manager", "finance_officer", "system_admin", "auditor"] },
  { href: "/reports", label: "Reports", roles: ["inventory_manager", "finance_officer", "system_admin", "auditor"] },
  { href: "/integrations", label: "Integrations", roles: ["system_admin", "auditor"] },
];

const ADMIN_ITEMS: NavItem[] = [
  { href: "/admin/users", label: "User Management", roles: ["system_admin"] },
  { href: "/admin/audit-log", label: "Audit Log", roles: ["system_admin", "auditor"] },
];

export default function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();

  const visible = (item: NavItem) => item.roles.includes(role);
  const active = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  return (
    <aside className="w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col">
      <div className="px-4 py-4 border-b border-gray-100">
        <span className="text-lg font-bold text-blue-700">IMIS</span>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        <ul className="space-y-0.5 px-2">
          {NAV_ITEMS.filter(visible).map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
                  active(item.href)
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        {ADMIN_ITEMS.some(visible) && (
          <>
            <div className="px-4 pt-4 pb-1">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Admin</span>
            </div>
            <ul className="space-y-0.5 px-2">
              {ADMIN_ITEMS.filter(visible).map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
                      active(item.href)
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </nav>
    </aside>
  );
}
