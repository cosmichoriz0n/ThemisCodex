"use client";
import { useRef, useState } from "react";

interface Props {
  onFileSelect: (file: File) => void;
  loading: boolean;
}

export default function ImportUpload({ onFileSelect, loading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<File | null>(null);

  function handleFile(file: File) {
    setSelected(file);
    onFileSelect(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !loading && inputRef.current?.click()}
        className={[
          "border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors",
          dragOver ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-gray-50",
          loading ? "opacity-50 cursor-not-allowed" : "",
        ].join(" ")}
      >
        <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        {selected ? (
          <div className="text-center">
            <p className="text-sm font-medium text-gray-900">{selected.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{formatBytes(selected.size)}</p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700">Drop CSV file here or click to browse</p>
            <p className="text-xs text-gray-500 mt-0.5">CSV format only — max 10 MB</p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleInputChange}
          disabled={loading}
        />
      </div>

      <div className="flex items-center justify-between">
        <a
          href="/import-template.csv"
          download
          className="text-xs text-blue-600 hover:underline"
        >
          Download CSV template
        </a>
        <button
          onClick={() => !loading && inputRef.current?.click()}
          disabled={loading || !selected}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Parsing…
            </>
          ) : "Preview Import"}
        </button>
      </div>
    </div>
  );
}
