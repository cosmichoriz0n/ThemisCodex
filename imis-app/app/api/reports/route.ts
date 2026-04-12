import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { generateReport } from "@/lib/reports/generate";
import { REPORT_DEFINITIONS } from "@/lib/reports/types";
import type { ReportType, ReportFormat, ReportParams } from "@/lib/reports/types";
import { ALL_ROLES } from "@/lib/auth/permissions";
import { auditLog } from "@/lib/db/schema/audit-log";
import type { Role } from "@/types/auth";

// ── Zod schema for POST body ────────────────────────────────────────────────

const ReportTypeValues = [
  "current_stock", "movement_history", "lifecycle_status", "consumption_by_member",
  "upis_depreciation", "pms_due", "expiry_tracking", "inventory_valuation",
  "billing_reconciliation", "accounting_reconciliation", "physical_count_variance",
  "disposal_summary",
] as const;

const PostBodySchema = z.object({
  report_type: z.enum(ReportTypeValues, { error: "Invalid report_type" }),
  format: z.enum(["csv", "pdf"], { error: "format must be csv or pdf" }),
  params: z.object({
    date_from:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    date_to:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    category_code:   z.string().max(10).optional(),
    item_id:         z.string().uuid().optional(),
    member_id:       z.string().max(50).optional(),
    movement_type:   z.enum(["receive", "issue", "return", "adjust", "transfer", "dispose"]).optional(),
    location:        z.string().max(100).optional(),
    pms_window_days: z.union([z.literal(30), z.literal(60), z.literal(90)]).optional(),
  }).optional().default({}),
});

// ── POST /api/reports — generate and return signed URL ──────────────────────

export const POST = withAuth(async (req: NextRequest, { user, role }) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { report_type: reportType, format, params } = parsed.data;

  // Role check against report-specific access list
  const definition = REPORT_DEFINITIONS[reportType as ReportType];
  if (!definition.allowedRoles.includes(role)) {
    return NextResponse.json({ error: "INSUFFICIENT_ROLE" }, { status: 403 });
  }

  // Generate report (upload to Firebase Storage, get signed URL)
  let result;
  try {
    result = await generateReport(
      reportType as ReportType,
      format as ReportFormat,
      params as ReportParams,
      user.uid,
      user.email ?? user.uid,
      role
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Report generation failed";
    if (msg.startsWith("INSUFFICIENT_ROLE")) {
      return NextResponse.json({ error: "INSUFFICIENT_ROLE" }, { status: 403 });
    }
    console.error("[reports] generation error:", err);
    return NextResponse.json({ error: "REPORT_GENERATION_FAILED", detail: msg }, { status: 500 });
  }

  // Write audit_log — every report download must be logged (RA 10173)
  try {
    await withRole(user.uid, role, async (tx) => {
      await tx.insert(auditLog).values({
        userId:   user.uid,
        userRole: role,
        action:   "REPORT_DOWNLOAD",
        resource: reportType,
        details:  { format, params, rowCount: result.rowCount, storagePath: result.storagePath },
      });
    });
  } catch (auditErr) {
    // Audit failure must NOT block the response — log server-side and continue
    console.error("[reports] audit_log insert failed:", auditErr);
  }

  return NextResponse.json({
    signed_url:   result.signedUrl,
    storage_path: result.storagePath,
    expires_at:   result.expiresAt,
    report_type:  result.reportType,
    format:       result.format,
    row_count:    result.rowCount,
  });
}, ALL_ROLES); // withAuth does basic auth; role check per-report is inside handler

// ── GET /api/reports/types — list reports accessible to this role ───────────

export const GET = withAuth(async (_req: NextRequest, { role }) => {
  const accessible = Object.entries(REPORT_DEFINITIONS)
    .filter(([, def]) => def.allowedRoles.includes(role as Role))
    .map(([type, def]) => ({
      report_type:  type,
      label:        def.label,
      description:  def.description,
      param_fields: def.paramFields,
    }));

  return NextResponse.json({ data: accessible });
}, ALL_ROLES);
