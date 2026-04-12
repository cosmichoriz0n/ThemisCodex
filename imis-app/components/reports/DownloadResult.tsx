"use client";
import { useEffect, useState } from "react";

interface Props {
  signedUrl: string;
  expiresAt: string;
  reportLabel: string;
  format: "csv" | "pdf";
  rowCount: number;
  onExpired: () => void;
}

export default function DownloadResult({
  signedUrl,
  expiresAt,
  reportLabel,
  format,
  rowCount,
  onExpired,
}: Props) {
  const [secondsLeft, setSecondsLeft] = useState<number>(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  );

  useEffect(() => {
    if (secondsLeft <= 0) {
      onExpired();
      return;
    }
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          onExpired();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft, onExpired]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const isExpiring = secondsLeft < 120;

  const formatLabel = format === "pdf" ? "PDF" : "CSV";
  const formatColor = format === "pdf" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700";

  return (
    <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${formatColor}`}>
              {formatLabel}
            </span>
            <span className="text-xs text-gray-600">{rowCount.toLocaleString()} rows</span>
          </div>
          <p className="text-xs text-gray-700 font-medium truncate">{reportLabel}</p>
        </div>

        <a
          href={signedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors"
        >
          Download
        </a>
      </div>

      <div className={`mt-2 text-xs ${isExpiring ? "text-red-600 font-medium" : "text-gray-500"}`}>
        Link expires in {minutes}:{String(seconds).padStart(2, "0")}
        {isExpiring && " — download now before it expires"}
      </div>
    </div>
  );
}
