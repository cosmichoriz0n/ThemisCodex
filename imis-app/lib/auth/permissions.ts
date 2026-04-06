import type { Role } from "@/types/auth";

export const ALL_ROLES: Role[] = [
  "inventory_staff",
  "inventory_manager",
  "finance_officer",
  "system_admin",
  "auditor",
];

export const MANAGER_ABOVE: Role[] = [
  "inventory_manager",
  "system_admin",
];

export const FINANCE_ABOVE: Role[] = [
  "finance_officer",
  "system_admin",
];

export const ADMIN_ONLY: Role[] = ["system_admin"];

export const AUDIT_ACCESS: Role[] = ["system_admin", "auditor"];

// Permission map — mirrors RBAC matrix in IMIS master document
export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  inventory_staff: [
    "view_stock",
    "create_movement",
    "view_transactions",
    "view_pms",
    "view_members",
    "view_alerts",
  ],
  inventory_manager: [
    "view_stock",
    "create_movement",
    "approve_adjustment",
    "request_disposal",
    "view_transactions",
    "download_reports",
    "manage_catalog",
    "bulk_import",
    "view_pms",
    "manage_pms",
    "view_members",
    "view_alerts",
    "resolve_alerts",
    "view_integration_config",
  ],
  finance_officer: [
    "view_stock",
    "view_transactions",
    "download_reports",
    "generate_billing_report",
    "view_alerts",
    "view_integration_config",
  ],
  system_admin: [
    "view_stock",
    "create_movement",
    "approve_adjustment",
    "request_disposal",
    "authorize_disposal",
    "view_transactions",
    "download_reports",
    "generate_billing_report",
    "manage_catalog",
    "bulk_import",
    "manage_users",
    "view_integration_config",
    "edit_integration_config",
    "view_audit_log",
    "trigger_resync",
    "post_upis_depreciation",
    "view_pms",
    "manage_pms",
    "view_members",
    "view_alerts",
    "resolve_alerts",
  ],
  auditor: [
    "view_stock",
    "view_transactions",
    "download_reports",
    "generate_billing_report",
    "view_audit_log",
    "view_integration_config",
    "view_alerts",
  ],
};

export function hasPermission(role: Role, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
