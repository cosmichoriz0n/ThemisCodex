import "server-only";
import Link from "next/link";
import UserTable from "@/components/admin/UserTable";
import type { FirebaseUserRecord } from "@/types/auth";

export const metadata = { title: "User Management — IMIS Admin" };

async function getUsers(): Promise<FirebaseUserRecord[]> {
  // In production this calls the API route; here we call the Firebase Admin SDK directly
  // since this is a server component with access to server-only modules
  const { adminAuth } = await import("@/lib/auth/firebase-admin");
  const list = await adminAuth.listUsers(1000);
  return list.users.map((u) => ({
    uid: u.uid,
    email: u.email ?? "",
    displayName: u.displayName ?? "",
    disabled: u.disabled,
    role: (u.customClaims?.role as FirebaseUserRecord["role"]) ?? null,
    cooperativeId: (u.customClaims?.cooperative_id as string) ?? null,
    lastSignInTime: u.metadata.lastSignInTime ?? null,
    creationTime: u.metadata.creationTime ?? null,
  }));
}

export default async function UsersPage() {
  const users = await getUsers();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500">{users.length} accounts</p>
        </div>
        <Link
          href="/admin/users/new"
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          + New User
        </Link>
      </div>
      <UserTable users={users} />
    </div>
  );
}
