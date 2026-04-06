import "server-only";
export const dynamic = "force-dynamic";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/auth/firebase-admin";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import type { Role } from "@/types/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const session = cookieStore.get("session")?.value;

  if (!session) redirect("/login");

  let role: Role;
  let displayName: string;
  let email: string;

  try {
    const decoded = await adminAuth.verifyIdToken(session);
    if (decoded.is_active === false) redirect("/login");
    role = decoded.role as Role;
    displayName = decoded.name ?? decoded.email ?? "User";
    email = decoded.email ?? "";
  } catch {
    redirect("/login");
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar role={role} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header displayName={displayName} email={email} role={role} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
