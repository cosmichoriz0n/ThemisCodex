import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/withAuth";
import { adminAuth } from "@/lib/auth/firebase-admin";

const UpdateUserSchema = z.object({
  displayName: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
});

export const GET = withAuth(
  async (_req: NextRequest, { params }: { params?: Record<string, string> }) => {
    const uid = params?.uid;
    if (!uid) return NextResponse.json({ error: "MISSING_UID" }, { status: 400 });

    const user = await adminAuth.getUser(uid);
    return NextResponse.json({
      data: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        disabled: user.disabled,
        role: user.customClaims?.role ?? null,
        cooperativeId: user.customClaims?.cooperative_id ?? null,
        lastSignInTime: user.metadata.lastSignInTime,
        creationTime: user.metadata.creationTime,
      },
    });
  },
  ["system_admin"]
);

export const PATCH = withAuth(
  async (req: NextRequest, { params }: { params?: Record<string, string> }) => {
    const uid = params?.uid;
    if (!uid) return NextResponse.json({ error: "MISSING_UID" }, { status: 400 });

    const body = UpdateUserSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: body.error.flatten() }, { status: 400 });
    }

    await adminAuth.updateUser(uid, body.data);
    return NextResponse.json({ data: { ok: true } });
  },
  ["system_admin"]
);
