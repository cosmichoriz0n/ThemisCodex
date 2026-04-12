import Papa from "papaparse";

export interface ParsedCSV {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

export function validateFileInput(file: File): void {
  const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

  if (file.size > MAX_BYTES) {
    throw new Error("FILE_TOO_LARGE: Max 10MB");
  }

  const nameLower = file.name.toLowerCase();
  if (!nameLower.endsWith(".csv")) {
    throw new Error("INVALID_FILE_TYPE: CSV only");
  }

  // Reject spoofed MIME types — browsers send text/csv, application/vnd.ms-excel, or text/plain
  const allowed = ["text/csv", "application/vnd.ms-excel", "text/plain", ""];
  if (file.type && !allowed.includes(file.type)) {
    throw new Error("INVALID_FILE_TYPE: CSV only");
  }
}

export function parseCSV(buffer: Buffer): ParsedCSV {
  const text = buffer.toString("utf-8");

  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
    transform: (v) => v.trim(),
  });

  if (result.errors.length > 0) {
    const first = result.errors[0];
    throw new Error(`CSV_PARSE_ERROR: ${first.message} (row ${first.row ?? "?"})`);
  }

  const headers = result.meta.fields ?? [];
  const rows = result.data as Record<string, string>[];

  return { headers, rows, totalRows: rows.length };
}
