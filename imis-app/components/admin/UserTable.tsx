"use client";
import Link from "next/link";
import RoleBadge from "./RoleBadge";
import type { FirebaseUserRecord, Role } from "@/types/auth";

export default function UserTable({ users }: { users: FirebaseUserRecord[] }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Last Sign-In</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {users.map((user) => (
            <tr key={user.uid} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">
                {user.displayName || <span className="text-gray-400 italic">No name</span>}
              </td>
              <td className="px-4 py-3 text-gray-600">{user.email}</td>
              <td className="px-4 py-3">
                {user.role ? (
                  <RoleBadge role={user.role as Role} />
                ) : (
                  <span className="text-gray-400 text-xs">Unassigned</span>
                )}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    user.disabled ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
                  }`}
                >
                  {user.disabled ? "Deactivated" : "Active"}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs">
                {user.lastSignInTime
                  ? new Date(user.lastSignInTime).toLocaleDateString("en-PH", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "Never"}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/admin/users/${user.uid}`}
                  className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                >
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {users.length === 0 && (
        <div className="py-12 text-center text-gray-400 text-sm">No user accounts yet.</div>
      )}
    </div>
  );
}
