import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { adminAuth } from "@/lib/auth/firebase-admin";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const POST = withAuth(
  async (_req: NextRequest, { params }: { params?: Record<string, string> }) => {
    const uid = params?.uid;
    if (!uid) return NextResponse.json({ error: "MISSING_UID" }, { status: 400 });

    await adminAuth.updateUser(uid, { disabled: false });

    const existing = await adminAuth.getUser(uid);
    await adminAuth.setCustomUserClaims(uid, {
      ...(existing.customClaims ?? {}),
      is_active: true,
    });

    await db.update(profiles).set({ isActive: true, updatedAt: new Date() }).where(eq(profiles.id, uid));

    return NextResponse.json({ data: { uid, disabled: false } });
  },
  ["system_admin"]
);
