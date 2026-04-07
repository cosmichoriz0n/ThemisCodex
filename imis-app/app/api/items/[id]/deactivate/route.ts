import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { MANAGER_ABOVE } from "@/lib/auth/permissions";
import { items } from "@/lib/db/schema/items";
import { lifecycleEvents } from "@/lib/db/schema/lifecycle-events";
import { auditLog } from "@/lib/db/schema/audit-log";

export const POST = withAuth(async (req: NextRequest, { user, role, params }) => {
  const { id } = params;

  const existing = await withRole(user.uid, role, async (tx) => {
    const [row] = await tx.select().from(items).where(eq(items.itemId, id)).limit(1);
    return row;
  });

  if (!existing) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  if (existing.lifecycleStatus === "disposed") {
    return NextResponse.json({ error: "ALREADY_DEACTIVATED" }, { status: 409 });
  }

  await withRole(user.uid, role, async (tx) => {
    const previousStatus = existing.lifecycleStatus;

    await tx
      .update(items)
      .set({ lifecycleStatus: "disposed", updatedAt: new Date() })
      .where(eq(items.itemId, id));

    await tx.insert(lifecycleEvents).values({
      itemId: id,
      fromState: previousStatus,
      toState: "disposed",
      authorizedBy: user.uid,
      remarks: "Deactivated via catalog management (Sprint 8 full disposal workflow pending)",
    });

    await tx.insert(auditLog).values({
      userId: user.uid,
      userRole: role,
      action: "item_deactivated",
      resource: "items",
      resourceId: id,
      details: { previousStatus },
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    });
  });

  return NextResponse.json({ success: true });
}, MANAGER_ABOVE);
