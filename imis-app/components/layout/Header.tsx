"use client";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import RoleBadge from "@/components/admin/RoleBadge";
import type { Role } from "@/types/auth";

interface HeaderProps {
  displayName: string;
  email: string;
  role: Role;
}

export default function Header({ displayName, email, role }: HeaderProps) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/session", { method: "DELETE" });
    await signOut(auth);
    router.push("/login");
  };

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
      <div />
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-medium text-gray-800">{displayName}</p>
          <p className="text-xs text-gray-500">{email}</p>
        </div>
        <RoleBadge role={role} />
        <button
          onClick={handleLogout}
          className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
