"use client";
import { useState, useCallback } from "react";
import ImportUpload from "./ImportUpload";
import ImportPreview from "./ImportPreview";
import ImportResult from "./ImportResult";
import type { ImportPreviewResponse, ImportCommitResponse } from "@/lib/import/types";

type Stage = "idle" | "preview_ready" | "done";

export default function ImportFlow() {
  const [stage, setStage] = useState<Stage>("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [result, setResult] = useState<ImportCommitResponse | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const reset = useCallback(() => {
    setStage("idle");
    setLoading(false);
    setError(null);
    setPreview(null);
    setResult(null);
    setPendingFile(null);
  }, []);

  async function handleFileSelect(file: File) {
    setPendingFile(file);
    setError(null);
    setLoading(true);

    try {
      const fd = new FormData();
      fd.append("phase", "preview");
      fd.append("file", file);

      const res = await fetch("/api/import", { method: "POST", body: fd });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error ?? "Failed to parse file.");
        return;
      }

      setPreview(body as ImportPreviewResponse);
      setStage("preview_ready");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!pendingFile) return;
    setError(null);
    setLoading(true);

    try {
      const fd = new FormData();
      fd.append("phase", "commit");
      fd.append("file", pendingFile);

      const res = await fetch("/api/import", { method: "POST", body: fd });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error ?? "Import failed. No items were inserted.");
        return;
      }

      setResult(body as ImportCommitResponse);
      setStage("done");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {stage === "idle" && (
        <ImportUpload onFileSelect={handleFileSelect} loading={loading} />
      )}

      {stage === "preview_ready" && preview && (
        <ImportPreview
          preview={preview}
          onConfirm={handleConfirm}
          onReset={reset}
          loading={loading}
        />
      )}

      {stage === "done" && result && (
        <ImportResult result={result} onReset={reset} />
      )}
    </div>
  );
}
