export type ImportPhase = "preview" | "commit";

export interface ImportRowResult {
  row: number; // 1-based (excludes header)
  item_name: string;
  category_code: string;
  valid: boolean;
  errors: string[];
}

export interface ImportPreviewResponse {
  phase: "preview";
  filename: string;
  total_rows: number;
  preview_rows: ImportRowResult[]; // first 20 rows
  valid_count: number;
  invalid_count: number;
}

export interface ImportCommitResponse {
  phase: "commit";
  total_rows: number;
  inserted: number;
  failed: number;
  errors: ImportRowResult[]; // all invalid rows
  audit_log_id: string;
}

export type ImportResponse = ImportPreviewResponse | ImportCommitResponse;
