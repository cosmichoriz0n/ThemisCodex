import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/withAuth";
import { adminAuth } from "@/lib/auth/firebase-admin";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const SetRoleSchema = z.object({
  role: z.enum(["inventory_staff", "inventory_manager", "finance_officer", "system_admin", "auditor"]),
});

export const POST = withAuth(
  async (req: NextRequest, { user, params }: { user: { uid: string }; params?: Record<string, string> }) => {
    const uid = params?.uid;
    if (!uid) return NextResponse.json({ error: "MISSING_UID" }, { status: 400 });

    const body = SetRoleSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: body.error.flatten() }, { status: 400 });
    }

    const { role } = body.data;

    // Get existing claims to preserve other fields
    const existing = await adminAuth.getUser(uid);
    const currentClaims = existing.customClaims ?? {};

    await adminAuth.setCustomUserClaims(uid, {
      ...currentClaims,
      role,
    });

    // Sync to profiles table
    await db.update(profiles).set({ role, updatedAt: new Date() }).where(eq(profiles.id, uid));

    return NextResponse.json({ data: { uid, role } });
  },
  ["system_admin"]
);
