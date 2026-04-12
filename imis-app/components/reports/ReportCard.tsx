"use client";
import { useState, useCallback } from "react";
import type { ReportParams } from "@/lib/reports/types";
import ReportFilters from "./ReportFilters";
import DownloadResult from "./DownloadResult";

interface ReportCardProps {
  reportType: string;
  label: string;
  description: string;
  paramFields: string[];
}

interface GenerateResult {
  signed_url: string;
  expires_at: string;
  row_count: number;
  format: "csv" | "pdf";
}

export default function ReportCard({
  reportType,
  label,
  description,
  paramFields,
}: ReportCardProps) {
  const [params, setParams] = useState<ReportParams>({});
  const [loading, setLoading] = useState<"csv" | "pdf" | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExpired = useCallback(() => {
    setResult(null);
  }, []);

  async function generate(format: "csv" | "pdf") {
    setLoading(format);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_type: reportType, format, params }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 403) {
          setError("You do not have permission to generate this report.");
        } else if (res.status === 400 && body.issues) {
          setError("Invalid filters: " + body.issues.map((i: { message: string }) => i.message).join(", "));
        } else {
          setError(body.detail ?? body.error ?? "Failed to generate report.");
        }
        return;
      }

      const data = await res.json();
      setResult({ ...data, format });
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <button
            onClick={() => generate("csv")}
            disabled={!!loading}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading === "csv" ? (
              <span className="flex items-center gap-1">
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Generating…
              </span>
            ) : "CSV"}
          </button>
          <button
            onClick={() => generate("pdf")}
            disabled={!!loading}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading === "pdf" ? (
              <span className="flex items-center gap-1">
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Generating…
              </span>
            ) : "PDF"}
          </button>
        </div>
      </div>

      {/* Filters */}
      {paramFields.length > 0 && (
        <ReportFilters
          paramFields={paramFields as Parameters<typeof ReportFilters>[0]["paramFields"]}
          onChange={setParams}
        />
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 rounded-md bg-red-50 border border-red-200 px-3 py-2">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Download result */}
      {result && (
        <DownloadResult
          signedUrl={result.signed_url}
          expiresAt={result.expires_at}
          reportLabel={label}
          format={result.format}
          rowCount={result.row_count}
          onExpired={handleExpired}
        />
      )}
    </div>
  );
}
