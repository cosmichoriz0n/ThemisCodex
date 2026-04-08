import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { ALL_ROLES, MANAGER_ABOVE } from "@/lib/auth/permissions";
import { reorderAlerts } from "@/lib/db/schema/reorder-alerts";
import { items } from "@/lib/db/schema/items";

// GET /api/alerts?status=open&alert_type=pms_due
export const GET = withAuth(async (req: NextRequest, { user, role }) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const alertType = searchParams.get("alert_type");

  const rows = await withRole(user.uid, role, async (tx) => {
    const conditions = [];
    if (status) {
      conditions.push(eq(reorderAlerts.status, status as typeof reorderAlerts.status._.data));
    }
    if (alertType) {
      conditions.push(eq(reorderAlerts.alertType, alertType as typeof reorderAlerts.alertType._.data));
    }

    return tx
      .select({
        id:          reorderAlerts.id,
        itemId:      reorderAlerts.itemId,
        itemName:    items.itemName,
        assetTag:    items.assetTag,
        categoryCode: items.categoryCode,
        alertType:   reorderAlerts.alertType,
        status:      reorderAlerts.status,
        details:     reorderAlerts.details,
        triggeredAt: reorderAlerts.triggeredAt,
        resolvedAt:  reorderAlerts.resolvedAt,
        resolvedBy:  reorderAlerts.resolvedBy,
      })
      .from(reorderAlerts)
      .innerJoin(items, eq(reorderAlerts.itemId, items.itemId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(reorderAlerts.triggeredAt));
  });

  return NextResponse.json({ data: rows });
}, ALL_ROLES);

// PATCH /api/alerts — resolve an alert (manager+)
export const PATCH = withAuth(async (req: NextRequest, { user, role }) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const { id, action } = body as { id?: string; action?: string };
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (action !== "resolve" && action !== "acknowledge") {
    return NextResponse.json({ error: "action must be resolve or acknowledge" }, { status: 400 });
  }

  const newStatus = action === "resolve" ? "resolved" : "acknowledged";

  await withRole(user.uid, role, async (tx) => {
    await tx
      .update(reorderAlerts)
      .set({
        status:     newStatus as typeof reorderAlerts.status._.data,
        resolvedAt: action === "resolve" ? new Date() : undefined,
        resolvedBy: action === "resolve" ? user.uid : undefined,
      })
      .where(eq(reorderAlerts.id, id));
  });

  return NextResponse.json({ data: { id, status: newStatus } });
}, MANAGER_ABOVE);
