"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

function getSessionToken(): string {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith("session="))
    ?.split("=")[1] ?? "";
}

interface RetryButtonProps {
  transactionId: string;
}

export default function RetryButton({ transactionId }: RetryButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRetry = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/${transactionId}/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getSessionToken()}` },
      });
      if (!res.ok) {
        const j = await res.json() as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        onClick={handleRetry}
        disabled={loading}
        className="px-2 py-1 text-xs bg-amber-100 text-amber-800 rounded hover:bg-amber-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Retrying…" : "Retry"}
      </button>
      {error && (
        <span className="text-xs text-red-500 max-w-[120px] text-right">{error}</span>
      )}
    </div>
  );
}
