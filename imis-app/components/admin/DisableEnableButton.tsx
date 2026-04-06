"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DisableEnableButton({ uid, disabled }: { uid: string; disabled: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    setLoading(true);
    const action = disabled ? "enable" : "disable";
    await fetch(`/api/admin/users/${uid}/${action}`, { method: "POST" });
    setLoading(false);
    router.refresh();
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
        disabled
          ? "bg-green-50 text-green-700 hover:bg-green-100"
          : "bg-red-50 text-red-700 hover:bg-red-100"
      }`}
    >
      {loading ? "…" : disabled ? "Reactivate" : "Deactivate"}
    </button>
  );
}
