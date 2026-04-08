import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema/profiles";
import { and, eq, inArray } from "drizzle-orm";

function verifySecret(req: NextRequest): boolean {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) return false;
  return req.headers.get("x-imis-secret") === secret;
}

interface AlertItem {
  item_id: string;
  item_name: string;
  alert_type: string;
  details: string;
}

interface AlertPayload {
  alerts_created: number;
  ran_at: string;
  alerts: AlertItem[];
}

// POST /api/alerts/notify
// Called by n8n after /api/alerts/check when alerts_created > 0.
// Sends a Resend email to all inventory_manager users listing new alerts.
export async function POST(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let payload: AlertPayload;
  try {
    payload = await req.json() as AlertPayload;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  if (!payload.alerts || payload.alerts.length === 0) {
    return NextResponse.json({ data: { sent: 0 } });
  }

  // Fetch all active inventory_manager emails
  const activeManagers = await db
    .select({ email: profiles.email, fullName: profiles.fullName })
    .from(profiles)
    .where(
      and(
        inArray(profiles.role, ["inventory_manager", "system_admin"]),
        eq(profiles.isActive, true)
      )
    );
  if (activeManagers.length === 0) {
    return NextResponse.json({ data: { sent: 0, reason: "no_managers" } });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const adminEmail = process.env.ALERT_EMAIL_ADMIN ?? "admin@imis.local";
  const appUrl = process.env.IMIS_APP_URL ?? "https://imis-app.up.railway.app";

  // Group alerts by type for readable email body
  const byType: Record<string, AlertItem[]> = {};
  for (const alert of payload.alerts) {
    if (!byType[alert.alert_type]) byType[alert.alert_type] = [];
    byType[alert.alert_type].push(alert);
  }

  const typeLabels: Record<string, string> = {
    pms_due:          "PMS Due (within 14 days)",
    expiry:           "Medical Expiry Warning (within 90 days)",
    license_expiry:   "License Expiry Warning (within 30 days)",
    calibration_due:  "Calibration Due (within 30 days)",
    low_stock:        "Low Stock Alerts",
  };

  const sections = Object.entries(byType)
    .map(([type, alerts]) => {
      const label = typeLabels[type] ?? type;
      const rows = alerts
        .map((a) => `<li><strong>${a.item_name}</strong> — ${a.details}</li>`)
        .join("\n");
      return `<h3 style="color:#b45309;margin:16px 0 4px">${label} (${alerts.length})</h3><ul>${rows}</ul>`;
    })
    .join("\n");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;color:#1f2937;max-width:600px;margin:0 auto;padding:24px">
  <div style="background:#1d4ed8;padding:16px 24px;border-radius:8px 8px 0 0">
    <h1 style="color:white;margin:0;font-size:20px">IMIS Daily Alert Summary</h1>
    <p style="color:#bfdbfe;margin:4px 0 0;font-size:13px">
      ${payload.alerts_created} alert${payload.alerts_created !== 1 ? "s" : ""} generated · ${new Date(payload.ran_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} PHT
    </p>
  </div>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;padding:20px 24px;border-radius:0 0 8px 8px">
    ${sections}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
    <p style="font-size:13px;color:#6b7280">
      <a href="${appUrl}/alerts" style="color:#1d4ed8">View all alerts in IMIS</a> ·
      Resolve alerts to stop receiving notifications for that item.
    </p>
  </div>
</body>
</html>`;

  const toEmails = activeManagers.map((m) => m.email);

  try {
    await resend.emails.send({
      from: `IMIS Alerts <${adminEmail}>`,
      to: toEmails,
      subject: `[IMIS] ${payload.alerts_created} Alert${payload.alerts_created !== 1 ? "s" : ""} — ${new Date(payload.ran_at).toLocaleDateString("en-PH")}`,
      html,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "EMAIL_SEND_FAILED", detail: msg }, { status: 500 });
  }

  return NextResponse.json({ data: { sent: toEmails.length } });
}
