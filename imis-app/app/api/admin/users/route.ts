import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { adminAuth } from "@/lib/auth/firebase-admin";
import type { FirebaseUserRecord } from "@/types/auth";

export const GET = withAuth(async () => {
  const listResult = await adminAuth.listUsers(1000);

  const users: FirebaseUserRecord[] = listResult.users.map((u) => ({
    uid: u.uid,
    email: u.email ?? "",
    displayName: u.displayName ?? "",
    disabled: u.disabled,
    role: (u.customClaims?.role as FirebaseUserRecord["role"]) ?? null,
    cooperativeId: (u.customClaims?.cooperative_id as string) ?? null,
    lastSignInTime: u.metadata.lastSignInTime ?? null,
    creationTime: u.metadata.creationTime ?? null,
  }));

  return NextResponse.json({ data: users });
}, ["system_admin"]);
