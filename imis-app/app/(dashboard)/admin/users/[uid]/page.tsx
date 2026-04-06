import "server-only";
import { notFound } from "next/navigation";
import { adminAuth } from "@/lib/auth/firebase-admin";
import UserForm from "@/components/admin/UserForm";
import RoleBadge from "@/components/admin/RoleBadge";
import DisableEnableButton from "@/components/admin/DisableEnableButton";
import type { Role } from "@/types/auth";

export const metadata = { title: "Edit User — IMIS Admin" };

export default async function EditUserPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;

  let user;
  try {
    user = await adminAuth.getUser(uid);
  } catch {
    notFound();
  }

  const role = (user.customClaims?.role as Role) ?? null;
  const isActive = user.customClaims?.is_active !== false;

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{user.displayName || user.email}</h1>
          <p className="text-sm text-gray-500">{user.email}</p>
          <div className="flex items-center gap-2 mt-2">
            {role && <RoleBadge role={role} />}
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              }`}
            >
              {isActive ? "Active" : "Deactivated"}
            </span>
          </div>
        </div>
        <DisableEnableButton uid={uid} disabled={user.disabled} />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 text-sm text-gray-600 space-y-1">
        <div><span className="font-medium">UID:</span> {uid}</div>
        <div><span className="font-medium">Created:</span> {user.metadata.creationTime}</div>
        <div><span className="font-medium">Last sign-in:</span> {user.metadata.lastSignInTime ?? "Never"}</div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-700 mb-3">Update Role</h2>
        <UserForm mode="edit" uid={uid} currentRole={role} />
      </div>
    </div>
  );
}
