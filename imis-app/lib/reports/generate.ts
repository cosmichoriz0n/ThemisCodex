import "server-only";
import type { Role } from "@/types/auth";
import type { ReportType, ReportFormat, ReportParams } from "./types";
import { REPORT_DEFINITIONS } from "./types";
import { generateCSV } from "./csv";
import { generatePDF } from "./pdf";
import { uploadReportAndSign } from "./storage";
import type { StoredReport } from "./storage";

import { HEADERS_01, queryCurrentStock } from "./queries/01-current-stock";
import { HEADERS_02, queryMovementHistory } from "./queries/02-movement-history";
import { HEADERS_03, queryLifecycleStatus } from "./queries/03-lifecycle-status";
import { HEADERS_04, queryConsumptionByMember } from "./queries/04-consumption-by-member";
import { HEADERS_05, queryUpisDepreciation } from "./queries/05-upis-depreciation";
import { HEADERS_06, queryPmsDue } from "./queries/06-pms-due";
import { HEADERS_07, queryExpiryTracking } from "./queries/07-expiry-tracking";
import { HEADERS_08, queryInventoryValuation } from "./queries/08-inventory-valuation";
import { HEADERS_09, queryBillingReconciliation } from "./queries/09-billing-reconciliation";
import { HEADERS_10, queryAccountingReconciliation } from "./queries/10-accounting-reconciliation";
import { HEADERS_11, queryPhysicalCountVariance } from "./queries/11-physical-count-variance";
import { HEADERS_12, queryDisposalSummary } from "./queries/12-disposal-summary";

export interface GeneratedReport extends StoredReport {
  reportType: ReportType;
  format: ReportFormat;
  rowCount: number;
}

/**
 * Generate a report buffer, upload to Firebase Storage, and return a signed URL.
 *
 * Enforces role-based access: throws if the caller's role is not in REPORT_ACCESS.
 * Caller must also write an audit_log entry (responsibility of the API route).
 */
export async function generateReport(
  reportType: ReportType,
  format: ReportFormat,
  params: ReportParams,
  userId: string,
  userDisplayName: string,
  role: Role
): Promise<GeneratedReport> {
  // Role guard
  const definition = REPORT_DEFINITIONS[reportType];
  if (!definition.allowedRoles.includes(role)) {
    throw new Error(`INSUFFICIENT_ROLE: role ${role} cannot access report ${reportType}`);
  }

  // Fetch rows
  const { headers, rows } = await fetchReportData(reportType, userId, role, params);

  // Generate buffer
  let buffer: Buffer;
  if (format === "csv") {
    buffer = generateCSV(headers, rows);
  } else {
    buffer = await generatePDF(
      {
        title: definition.label,
        generatedBy: userDisplayName,
        generatedAt: new Date(),
        filters: buildFilterSummary(params),
      },
      headers,
      rows
    );
  }

  // Upload and sign
  const stored = await uploadReportAndSign(buffer, format, reportType, userId);

  return {
    ...stored,
    reportType,
    format,
    rowCount: rows.length,
  };
}

async function fetchReportData(
  reportType: ReportType,
  userId: string,
  role: Role,
  params: ReportParams
): Promise<{ headers: string[]; rows: (string | number | boolean | null | undefined)[][] }> {
  switch (reportType) {
    case "current_stock":
      return { headers: HEADERS_01, rows: await queryCurrentStock(userId, role, params) };
    case "movement_history":
      return { headers: HEADERS_02, rows: await queryMovementHistory(userId, role, params) };
    case "lifecycle_status":
      return { headers: HEADERS_03, rows: await queryLifecycleStatus(userId, role, params) };
    case "consumption_by_member":
      return { headers: HEADERS_04, rows: await queryConsumptionByMember(userId, role, params) };
    case "upis_depreciation":
      return { headers: HEADERS_05, rows: await queryUpisDepreciation(userId, role, params) };
    case "pms_due":
      return { headers: HEADERS_06, rows: await queryPmsDue(userId, role, params) };
    case "expiry_tracking":
      return { headers: HEADERS_07, rows: await queryExpiryTracking(userId, role, params) };
    case "inventory_valuation":
      return { headers: HEADERS_08, rows: await queryInventoryValuation(userId, role, params) };
    case "billing_reconciliation":
      return { headers: HEADERS_09, rows: await queryBillingReconciliation(userId, role, params) };
    case "accounting_reconciliation":
      return { headers: HEADERS_10, rows: await queryAccountingReconciliation(userId, role, params) };
    case "physical_count_variance":
      return { headers: HEADERS_11, rows: await queryPhysicalCountVariance(userId, role, params) };
    case "disposal_summary":
      return { headers: HEADERS_12, rows: await queryDisposalSummary(userId, role, params) };
  }
}

function buildFilterSummary(params: ReportParams): Record<string, string> {
  const out: Record<string, string> = {};
  if (params.date_from) out["From"] = params.date_from;
  if (params.date_to)   out["To"]   = params.date_to;
  if (params.category_code) out["Category"] = params.category_code;
  if (params.member_id)     out["Member"]   = params.member_id;
  if (params.movement_type) out["Movement"] = params.movement_type;
  if (params.location)      out["Location"] = params.location;
  if (params.pms_window_days) out["Window"] = `${params.pms_window_days} days`;
  return out;
}
