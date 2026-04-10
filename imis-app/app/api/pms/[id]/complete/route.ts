import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { MANAGER_ABOVE } from "@/lib/auth/permissions";
import { pmsSchedules } from "@/lib/db/schema/pms-schedules";
import { auditLog } from "@/lib/db/schema/audit-log";

const completeSchema = z.object({
  completed_at: z.string().min(1, "completed_at is required"),
  completed_mileage: z.coerce.number().int().nonnegative().optional(),
  technician: z.string().min(1, "technician is required"),
  notes: z.string().optional(),
});

/**
 * PATCH /api/pms/[id]/complete
 * Sign off a PMS completion.
 * Sets status = completed, last_done_at, last_mileage.
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

  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", detail: parsed.error.flatten() }, { status: 422 });
  }

  const { completed_at, completed_mileage, technician, notes } = parsed.data;

  const result = await withRole(user.uid, role, async (tx) => {
    const [schedule] = await tx
      .select({ id: pmsSchedules.id, itemId: pmsSchedules.itemId, status: pmsSchedules.status, pmsType: pmsSchedules.pmsType })
      .from(pmsSchedules)
      .where(eq(pmsSchedules.id, id))
      .limit(1);

    if (!schedule) return { error: "NOT_FOUND" } as const;
    if (schedule.status === "completed") return { error: "ALREADY_COMPLETED" } as const;

    await tx
      .update(pmsSchedules)
      .set({
        status: "completed",
        lastDoneAt: new Date(completed_at),
        lastMileage: completed_mileage ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(pmsSchedules.id, id));

    await tx.insert(auditLog).values({
      userId: user.uid,
      userRole: role,
      action: "pms_completed",
      resource: "pms_schedules",
      resourceId: id,
      details: {
        item_id: schedule.itemId,
        pms_type: schedule.pmsType,
        completed_at,
        completed_mileage,
        technician,
        notes,
      },
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    });

    return { data: { id, status: "completed", last_done_at: completed_at } } as const;
  });

  if ("error" in result) {
    const status = result.error === "NOT_FOUND" ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ data: result.data });
}, MANAGER_ABOVE);
