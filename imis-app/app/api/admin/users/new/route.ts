import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/withAuth";
import { adminAuth } from "@/lib/auth/firebase-admin";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
const CreateUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(100),
  password: z.string().min(8),
  role: z.enum(["inventory_staff", "inventory_manager", "finance_officer", "system_admin", "auditor"]),
  cooperativeId: z.string().default("SAMELCO"),
});

export const POST = withAuth(
  async (req: NextRequest) => {
    const body = CreateUserSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: body.error.flatten() }, { status: 400 });
    }

    const { email, displayName, password, role, cooperativeId } = body.data;

    // Create Firebase user
    const newUser = await adminAuth.createUser({ email, password, displayName });

    // Set custom claims
    await adminAuth.setCustomUserClaims(newUser.uid, {
      role,
      is_active: true,
      cooperative_id: cooperativeId,
    });

    // Create profiles row in Railway Postgres
    await db.insert(profiles).values({
      id: newUser.uid,
      role,
      fullName: displayName,
      email,
      cooperativeId,
      isActive: true,
    });

    // TODO S3: insert to audit_log here

    return NextResponse.json(
      { data: { uid: newUser.uid, email, displayName, role } },
      { status: 201 }
    );
  },
  ["system_admin"]
);
