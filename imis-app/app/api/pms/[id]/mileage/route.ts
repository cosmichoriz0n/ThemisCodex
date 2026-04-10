import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { MANAGER_ABOVE } from "@/lib/auth/permissions";
import { pmsSchedules } from "@/lib/db/schema/pms-schedules";
import { reorderAlerts } from "@/lib/db/schema/reorder-alerts";
import { auditLog } from "@/lib/db/schema/audit-log";
import { sql } from "drizzle-orm";

const mileageSchema = z.object({
  current_mileage: z.coerce.number().int().nonnegative("current_mileage must be 0 or greater"),
});

/**
 * PATCH /api/pms/[id]/mileage
 * Update the current mileage for a vehicle PMS schedule.
 * If current_mileage >= due_mileage, flips status to "overdue" and creates a pms_due alert.
 * Roles: inventory_manager, system_admin
 */
export const PATCH = withAuth(async (req: NextRequest, { user, role, params }) => {
  const { id } = params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = mileageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", detail: parsed.error.flatten() }, { status: 422 });
  }

  const { current_mileage } = parsed.data;

  const result = await withRole(user.uid, role, async (tx) => {
    const [schedule] = await tx
      .select({
        id: pmsSchedules.id,
        itemId: pmsSchedules.itemId,
        dueMileage: pmsSchedules.dueMileage,
        status: pmsSchedules.status,
        pmsType: pmsSchedules.pmsType,
      })
      .from(pmsSchedules)
      .where(eq(pmsSchedules.id, id))
      .limit(1);

    if (!schedule) return { error: "NOT_FOUND" } as const;
    if (schedule.status === "completed") return { error: "ALREADY_COMPLETED" } as const;

    const nowOverdue = schedule.dueMileage != null && current_mileage >= schedule.dueMileage;
    const newStatus = nowOverdue ? "overdue" : schedule.status === "overdue" ? "pending" : schedule.status;

    await tx
      .update(pmsSchedules)
      .set({
        lastMileage: current_mileage,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(pmsSchedules.id, id));

    // Create pms_due alert if now overdue and no open alert exists
    if (nowOverdue) {
      const [existingAlert] = await tx
        .select({ id: reorderAlerts.id })
        .from(reorderAlerts)
        .where(
          and(
            eq(reorderAlerts.itemId, schedule.itemId),
            eq(reorderAlerts.alertType, "pms_due"),
            sql`${reorderAlerts.status} != 'resolved'`
          )
        )
        .limit(1);

      if (!existingAlert) {
        await tx.insert(reorderAlerts).values({
          itemId: schedule.itemId,
          alertType: "pms_due",
          status: "open",
          details: `PMS overdue by mileage — current: ${current_mileage} km, due: ${schedule.dueMileage} km (${schedule.pmsType})`,
        });
      }
    }

    await tx.insert(auditLog).values({
      userId: user.uid,
      userRole: role,
      action: "pms_mileage_updated",
      resource: "pms_schedules",
      resourceId: id,
      details: { current_mileage, now_overdue: nowOverdue },
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    });

    return { data: { id, current_mileage, status: newStatus, now_overdue: nowOverdue } } as const;
  });

  if ("error" in result) {
    const status = result.error === "NOT_FOUND" ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ data: result.data });
}, MANAGER_ABOVE);
