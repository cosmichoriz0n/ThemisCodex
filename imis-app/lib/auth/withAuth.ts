import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "./firebase-admin";
import type { Role, DecodedFirebaseToken } from "@/types/auth";

type WrappedHandler = (
  req: NextRequest,
  context: { user: DecodedFirebaseToken; role: Role; params: Record<string, string> }
) => Promise<NextResponse | Response>;

/**
 * Route handler HOF for RBAC enforcement.
 *
 * ctx is typed `any` intentionally — Next.js 16 passes params as
 * Promise<{...}> which varies per route. We await it ourselves.
 * Runtime is fully correct; TypeScript compatibility is maintained
 * because `any` satisfies all route handler signatures.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withAuth(handler: WrappedHandler, allowedRoles: Role[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (req: NextRequest, ctx?: any): Promise<Response> => {
    // Extract token from Authorization header or session cookie
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : req.cookies.get("session")?.value;

    if (!token) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    let decoded: DecodedFirebaseToken;
    try {
      const result = await adminAuth.verifyIdToken(token);
      decoded = result as unknown as DecodedFirebaseToken;
    } catch {
      return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 401 });
    }

    if (decoded.is_active === false) {
      return NextResponse.json({ error: "ACCOUNT_DEACTIVATED" }, { status: 403 });
    }

    if (!allowedRoles.includes(decoded.role)) {
      return NextResponse.json({ error: "INSUFFICIENT_ROLE" }, { status: 403 });
    }

    // Await async params (Next.js 16: params is Promise<{...}>)
    const params: Record<string, string> = ctx?.params
      ? await ctx.params
      : {};

    return handler(req, { user: decoded, role: decoded.role, params });
  };
}
