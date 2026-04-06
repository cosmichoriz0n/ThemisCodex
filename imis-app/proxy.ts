import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/login", "/api/auth/session", "/api/health"];
const ADMIN_ROUTES = ["/admin", "/api/admin"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes and static assets
  if (
    PUBLIC_ROUTES.some((r) => pathname.startsWith(r)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get("session")?.value;

  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Verify token via internal API (avoids importing firebase-admin in Edge/proxy runtime)
  const verifyUrl = new URL("/api/auth/session", request.url);
  const verifyRes = await fetch(verifyUrl, {
    headers: { "x-verify-session": sessionCookie },
  });

  if (!verifyRes.ok) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("session");
    return response;
  }

  const { role } = (await verifyRes.json()) as { role: string };

  // Guard admin routes — only system_admin
  if (ADMIN_ROUTES.some((r) => pathname.startsWith(r)) && role !== "system_admin") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)" ],
};
