import type { Role } from "@/types/auth";

export type ReportRow = (string | number | boolean | null | undefined)[];

export type ReportType =
  | "current_stock"
  | "movement_history"
  | "lifecycle_status"
  | "consumption_by_member"
  | "upis_depreciation"
  | "pms_due"
  | "expiry_tracking"
  | "inventory_valuation"
  | "billing_reconciliation"
  | "accounting_reconciliation"
  | "physical_count_variance"
  | "disposal_summary";

export type ReportFormat = "csv" | "pdf";

export interface ReportParams {
  date_from?: string;           // YYYY-MM-DD
  date_to?: string;             // YYYY-MM-DD
  category_code?: string;
  item_id?: string;
  member_id?: string;
  movement_type?: string;
  location?: string;
  pms_window_days?: 30 | 60 | 90;
}

export interface ReportDefinition {
  label: string;
  description: string;
  allowedRoles: Role[];
  paramFields: Array<"date_range" | "category_code" | "item_id" | "member_id" | "movement_type" | "location" | "pms_window">;
}

// Role-based access control — mirrors RBAC matrix in master document
export const REPORT_DEFINITIONS: Record<ReportType, ReportDefinition> = {
  current_stock: {
    label: "Current Stock",
    description: "All items by category with on-hand quantities, reserved qty, reorder status, and lifecycle state.",
    allowedRoles: ["inventory_manager", "system_admin", "auditor"],
    paramFields: ["category_code"],
  },
  movement_history: {
    label: "Stock Movement History",
    description: "Filterable movement log by category, item, member, date range, and movement type.",
    allowedRoles: ["inventory_manager", "system_admin", "auditor"],
    paramFields: ["date_range", "category_code", "item_id", "member_id", "movement_type"],
  },
  lifecycle_status: {
    label: "Asset Lifecycle Status",
    description: "All items by lifecycle state with days-in-state aging and last transition details.",
    allowedRoles: ["inventory_manager", "system_admin", "auditor"],
    paramFields: ["category_code"],
  },
  consumption_by_member: {
    label: "Consumption by Member",
    description: "Items issued per MIMS member with total value and period comparison.",
    allowedRoles: ["inventory_manager", "system_admin", "auditor"],
    paramFields: ["date_range", "category_code", "member_id"],
  },
  upis_depreciation: {
    label: "UPIS Depreciation Schedule",
    description: "UPIS assets with acquisition cost, depreciation rate, accumulated depreciation, and net book value.",
    allowedRoles: ["inventory_manager", "finance_officer", "system_admin", "auditor"],
    paramFields: [],
  },
  pms_due: {
    label: "Motor Pool PMS Due",
    description: "Motor Pool and Transportation vehicles with PMS due within 30/60/90 days.",
    allowedRoles: ["inventory_manager", "system_admin", "auditor"],
    paramFields: ["pms_window"],
  },
  expiry_tracking: {
    label: "Expiry Tracking",
    description: "Medical Supplies, IT licenses, NTC licenses, and calibrations sorted by expiry date.",
    allowedRoles: ["inventory_manager", "system_admin", "auditor"],
    paramFields: ["category_code"],
  },
  inventory_valuation: {
    label: "Inventory Valuation",
    description: "Qty × unit cost per item and category — total portfolio value in PHP.",
    allowedRoles: ["inventory_manager", "finance_officer", "system_admin", "auditor"],
    paramFields: ["category_code"],
  },
  billing_reconciliation: {
    label: "Billing Reconciliation",
    description: "IMIS transactions vs EBS2000 billing records side by side with sync status.",
    allowedRoles: ["finance_officer", "system_admin", "auditor"],
    paramFields: ["date_range", "member_id"],
  },
  accounting_reconciliation: {
    label: "Accounting Reconciliation",
    description: "IMIS transaction totals vs CAS2000 journal debits with daily variance.",
    allowedRoles: ["finance_officer", "system_admin", "auditor"],
    paramFields: ["date_range"],
  },
  physical_count_variance: {
    label: "Physical Count Variance",
    description: "Scanner count vs system on-hand per location with variance column.",
    allowedRoles: ["inventory_manager", "system_admin", "auditor"],
    paramFields: ["category_code", "location"],
  },
  disposal_summary: {
    label: "Disposal Summary",
    description: "Disposed items by type and category with net book value written off.",
    allowedRoles: ["inventory_manager", "finance_officer", "system_admin", "auditor"],
    paramFields: ["date_range", "category_code"],
  },
};
