"use client";
import type { ImportCommitResponse } from "@/lib/import/types";

interface Props {
  result: ImportCommitResponse;
  onReset: () => void;
}

export default function ImportResult({ result, onReset }: Props) {
  const success = result.inserted > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={`rounded-lg border px-5 py-4 ${success ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"}`}>
        <h3 className={`text-base font-semibold ${success ? "text-green-800" : "text-yellow-800"}`}>
          {success
            ? `Import complete — ${result.inserted} item${result.inserted !== 1 ? "s" : ""} added`
            : "Import complete — no items were inserted"}
        </h3>
        <div className="mt-1 flex flex-wrap gap-4 text-sm">
          <span className="text-gray-700">
            <span className="font-medium">{result.total_rows}</span> rows processed
          </span>
          {result.inserted > 0 && (
            <span className="text-green-700 font-medium">{result.inserted} inserted</span>
          )}
          {result.failed > 0 && (
            <span className="text-red-700 font-medium">{result.failed} skipped</span>
          )}
        </div>
      </div>

      {/* Failed rows */}
      {result.errors.length > 0 && (
        <div className="rounded-lg border border-red-200 overflow-hidden">
          <div className="bg-red-50 px-4 py-2 border-b border-red-200">
            <p className="text-xs font-semibold text-red-800">
              {result.failed} row{result.failed !== 1 ? "s" : ""} skipped due to validation errors
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 w-12">Row</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Item Name</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 w-20">Category</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.errors.map((row) => (
                  <tr key={row.row} className="bg-white">
                    <td className="px-3 py-2 text-gray-500">{row.row}</td>
                    <td className="px-3 py-2 text-gray-900 max-w-[180px] truncate">{row.item_name || "—"}</td>
                    <td className="px-3 py-2 font-mono text-gray-700">{row.category_code || "—"}</td>
                    <td className="px-3 py-2 text-red-600 max-w-[320px]">
                      {row.errors.join("; ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-gray-400">Audit log ID: {result.audit_log_id}</p>
        <button
          onClick={onReset}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Import another file
        </button>
      </div>
    </div>
  );
}
