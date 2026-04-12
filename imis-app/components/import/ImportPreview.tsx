"use client";
import type { ImportPreviewResponse, ImportRowResult } from "@/lib/import/types";

interface Props {
  preview: ImportPreviewResponse;
  onConfirm: () => void;
  onReset: () => void;
  loading: boolean;
}

function StatusBadge({ row }: { row: ImportRowResult }) {
  if (row.valid) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
        Valid
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
      Error
    </span>
  );
}

export default function ImportPreview({ preview, onConfirm, onReset, loading }: Props) {
  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 flex flex-wrap items-center gap-4 text-sm">
        <span className="text-gray-700">
          <span className="font-semibold">{preview.total_rows}</span> rows total
        </span>
        <span className="text-green-700 font-medium">
          {preview.valid_count} valid
        </span>
        {preview.invalid_count > 0 && (
          <span className="text-red-700 font-medium">
            {preview.invalid_count} invalid
          </span>
        )}
        <span className="text-gray-400 text-xs ml-auto">
          Showing first {Math.min(20, preview.total_rows)} rows
        </span>
      </div>

      {/* Invalid rows warning */}
      {preview.invalid_count > 0 && (
        <div className="rounded-md bg-yellow-50 border border-yellow-200 px-4 py-3">
          <p className="text-xs text-yellow-800">
            <span className="font-semibold">Warning:</span> {preview.invalid_count} invalid{" "}
            {preview.invalid_count === 1 ? "row" : "rows"} will be skipped. Only valid rows
            will be imported.
          </p>
        </div>
      )}

      {/* Preview table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-600 w-12">#</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-600">Item Name</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-600 w-20">Category</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-600 w-16">Status</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-600">Errors</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {preview.preview_rows.map((row) => (
              <tr key={row.row} className={row.valid ? "bg-white" : "bg-red-50"}>
                <td className="px-3 py-2 text-gray-500">{row.row}</td>
                <td className="px-3 py-2 text-gray-900 max-w-[200px] truncate" title={row.item_name}>
                  {row.item_name || <span className="italic text-gray-400">(empty)</span>}
                </td>
                <td className="px-3 py-2 font-mono text-gray-700">{row.category_code || "—"}</td>
                <td className="px-3 py-2"><StatusBadge row={row} /></td>
                <td className="px-3 py-2 text-red-600 max-w-[280px] truncate" title={row.errors.join("; ")}>
                  {row.errors.length > 0 ? row.errors[0] : null}
                  {row.errors.length > 1 && (
                    <span className="text-gray-400"> +{row.errors.length - 1} more</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={onReset}
          disabled={loading}
          className="text-sm text-gray-500 hover:text-gray-700 underline disabled:opacity-50"
        >
          Upload different file
        </button>
        <button
          onClick={onConfirm}
          disabled={loading || preview.valid_count === 0}
          className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Importing…
            </>
          ) : (
            `Import ${preview.valid_count} Item${preview.valid_count !== 1 ? "s" : ""}`
          )}
        </button>
      </div>
    </div>
  );
}
