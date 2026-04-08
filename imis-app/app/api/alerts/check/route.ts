import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { items } from "@/lib/db/schema/items";
import { itemAttributes } from "@/lib/db/schema/item-attributes";
import { reorderAlerts } from "@/lib/db/schema/reorder-alerts";
import { pmsSchedules } from "@/lib/db/schema/pms-schedules";

// Internal-only endpoint — called by n8n IMIS-ALERT-DAILY workflow.
// Accepts x-imis-secret header (same secret as n8n webhook).
// Also callable from admin UI (system_admin only, checked via token separately).
function verifySecret(req: NextRequest): boolean {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) return false;
  return req.headers.get("x-imis-secret") === secret;
}

const NOW_PHT = () => new Date();

// Days from now
function daysFromNow(days: number): Date {
  const d = NOW_PHT();
  d.setDate(d.getDate() + days);
  return d;
}

interface AlertCreated {
  item_id: string;
  item_name: string;
  alert_type: string;
  details: string;
}

// POST /api/alerts/check
// Creates reorder_alert rows for:
//   - PMS due within 14 days (MP, TR categories — from pms_schedules)
//   - Medical expiry within 90 days (MS — expiry_date attribute)
//   - IT license expiry within 30 days (IT — license_expiry attribute)
//   - NTC license expiry within 30 days (CE — ntc_expiry attribute)
//   - Calibration expiry within 30 days (TE, SE — calibration_due/calibration_expiry attribute)
export async function POST(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const alertsCreated: AlertCreated[] = [];
  const threshold14 = daysFromNow(14);
  const threshold30 = daysFromNow(30);
  const threshold90 = daysFromNow(90);

  // ── 1. PMS due within 14 days ──────────────────────────────────────────────
  const pmsDue = await db
    .select({
      itemId:   pmsSchedules.itemId,
      itemName: items.itemName,
      pmsType:  pmsSchedules.pmsType,
      dueDate:  pmsSchedules.dueDate,
    })
    .from(pmsSchedules)
    .innerJoin(items, eq(pmsSchedules.itemId, items.itemId))
    .where(
      and(
        eq(pmsSchedules.status, "pending"),
        sql`${pmsSchedules.dueDate} <= ${threshold14.toISOString()}`,
        sql`${pmsSchedules.dueDate} >= now()`
      )
    );

  for (const pms of pmsDue) {
    const details = `PMS "${pms.pmsType}" due ${pms.dueDate ? new Date(pms.dueDate).toLocaleDateString("en-PH") : "soon"} (within 14 days)`;
    const created = await upsertAlert(pms.itemId, "pms_due", details);
    if (created) alertsCreated.push({ item_id: pms.itemId, item_name: pms.itemName, alert_type: "pms_due", details });
  }

  // ── 2. Medical expiry within 90 days (MS category, expiry_date attribute) ──
  const msExpiry = await db
    .select({
      itemId:          itemAttributes.itemId,
      itemName:        items.itemName,
      attributeValue:  itemAttributes.attributeValue,
    })
    .from(itemAttributes)
    .innerJoin(items, eq(itemAttributes.itemId, items.itemId))
    .where(
      and(
        eq(itemAttributes.attributeName, "expiry_date"),
        eq(items.categoryCode, "MS"),
        inArray(items.lifecycleStatus, ["in_stock", "acquired", "in_service"])
      )
    );

  for (const row of msExpiry) {
    if (!row.attributeValue) continue;
    const expiry = new Date(row.attributeValue);
    if (isNaN(expiry.getTime())) continue;
    if (expiry <= threshold90 && expiry >= NOW_PHT()) {
      const details = `Medical supply expires ${expiry.toLocaleDateString("en-PH")} (within 90 days)`;
      const created = await upsertAlert(row.itemId, "expiry", details);
      if (created) alertsCreated.push({ item_id: row.itemId, item_name: row.itemName, alert_type: "expiry", details });
    }
  }

  // ── 3. IT license expiry within 30 days ────────────────────────────────────
  const itLicense = await db
    .select({
      itemId:         itemAttributes.itemId,
      itemName:       items.itemName,
      attributeValue: itemAttributes.attributeValue,
    })
    .from(itemAttributes)
    .innerJoin(items, eq(itemAttributes.itemId, items.itemId))
    .where(
      and(
        eq(itemAttributes.attributeName, "license_expiry"),
        eq(items.categoryCode, "IT"),
        inArray(items.lifecycleStatus, ["in_stock", "acquired", "in_service"])
      )
    );

  for (const row of itLicense) {
    if (!row.attributeValue) continue;
    const expiry = new Date(row.attributeValue);
    if (isNaN(expiry.getTime())) continue;
    if (expiry <= threshold30 && expiry >= NOW_PHT()) {
      const details = `IT license expires ${expiry.toLocaleDateString("en-PH")} (within 30 days)`;
      const created = await upsertAlert(row.itemId, "license_expiry", details);
      if (created) alertsCreated.push({ item_id: row.itemId, item_name: row.itemName, alert_type: "license_expiry", details });
    }
  }

  // ── 4. NTC license expiry within 30 days (CE category) ────────────────────
  const ntcLicense = await db
    .select({
      itemId:         itemAttributes.itemId,
      itemName:       items.itemName,
      attributeValue: itemAttributes.attributeValue,
    })
    .from(itemAttributes)
    .innerJoin(items, eq(itemAttributes.itemId, items.itemId))
    .where(
      and(
        eq(itemAttributes.attributeName, "ntc_expiry"),
        eq(items.categoryCode, "CE"),
        inArray(items.lifecycleStatus, ["in_stock", "acquired", "in_service"])
      )
    );

  for (const row of ntcLicense) {
    if (!row.attributeValue) continue;
    const expiry = new Date(row.attributeValue);
    if (isNaN(expiry.getTime())) continue;
    if (expiry <= threshold30 && expiry >= NOW_PHT()) {
      const details = `NTC license expires ${expiry.toLocaleDateString("en-PH")} (within 30 days)`;
      const created = await upsertAlert(row.itemId, "license_expiry", details);
      if (created) alertsCreated.push({ item_id: row.itemId, item_name: row.itemName, alert_type: "license_expiry", details });
    }
  }

  // ── 5. Calibration expiry within 30 days (TE: calibration_due, SE: calibration_expiry) ──
  const calibrationAttrs = [
    { category: "TE", attr: "calibration_due" },
    { category: "SE", attr: "calibration_expiry" },
  ];

  for (const { category, attr } of calibrationAttrs) {
    const calibRows = await db
      .select({
        itemId:         itemAttributes.itemId,
        itemName:       items.itemName,
        attributeValue: itemAttributes.attributeValue,
      })
      .from(itemAttributes)
      .innerJoin(items, eq(itemAttributes.itemId, items.itemId))
      .where(
        and(
          eq(itemAttributes.attributeName, attr),
          eq(items.categoryCode, category),
          inArray(items.lifecycleStatus, ["in_stock", "acquired", "in_service"])
        )
      );

    for (const row of calibRows) {
      if (!row.attributeValue) continue;
      const expiry = new Date(row.attributeValue);
      if (isNaN(expiry.getTime())) continue;
      if (expiry <= threshold30 && expiry >= NOW_PHT()) {
        const details = `Calibration due ${expiry.toLocaleDateString("en-PH")} (within 30 days)`;
        const created = await upsertAlert(row.itemId, "calibration_due", details);
        if (created) alertsCreated.push({ item_id: row.itemId, item_name: row.itemName, alert_type: "calibration_due", details });
      }
    }
  }

  return NextResponse.json({
    data: {
      alerts_created: alertsCreated.length,
      ran_at: new Date().toISOString(),
      alerts: alertsCreated,
    },
  });
}

// Inserts an alert only if no open alert of the same type exists for this item.
// Returns true if a new row was created.
async function upsertAlert(itemId: string, alertType: string, details: string): Promise<boolean> {
  const existing = await db
    .select({ id: reorderAlerts.id })
    .from(reorderAlerts)
    .where(
      and(
        eq(reorderAlerts.itemId, itemId),
        eq(reorderAlerts.alertType, alertType as typeof reorderAlerts.alertType._.data),
        eq(reorderAlerts.status, "open")
      )
    )
    .limit(1);

  if (existing.length > 0) return false;

  await db.insert(reorderAlerts).values({
    itemId,
    alertType: alertType as typeof reorderAlerts.alertType._.data,
    status: "open",
    details,
  });
  return true;
}
