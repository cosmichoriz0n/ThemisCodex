import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/auth/firebase-admin";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60, // 1 hour — matches Firebase ID token expiry
};

// POST /api/auth/session — exchange Firebase ID token for session cookie
export async function POST(req: NextRequest) {
  const { idToken } = (await req.json()) as { idToken: string };

  if (!idToken) {
    return NextResponse.json({ error: "MISSING_TOKEN" }, { status: 400 });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);

    if (decoded.is_active === false) {
      return NextResponse.json({ error: "ACCOUNT_DEACTIVATED" }, { status: 403 });
    }

    const response = NextResponse.json({ ok: true, role: decoded.role });
    response.cookies.set("session", idToken, COOKIE_OPTIONS);
    return response;
  } catch {
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 401 });
  }
}

// DELETE /api/auth/session — logout
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("session");
  return response;
}

// GET /api/auth/session — verify session (used by middleware)
export async function GET(req: NextRequest) {
  const token = req.headers.get("x-verify-session");
  if (!token) {
    return NextResponse.json({ error: "MISSING_TOKEN" }, { status: 400 });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded.is_active === false) {
      return NextResponse.json({ error: "ACCOUNT_DEACTIVATED" }, { status: 403 });
    }
    return NextResponse.json({ ok: true, role: decoded.role, uid: decoded.uid });
  } catch {
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 401 });
  }
}
