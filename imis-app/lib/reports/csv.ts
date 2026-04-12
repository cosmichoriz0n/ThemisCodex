import "server-only";
import { csvCell } from "./sanitize";

/**
 * Generate a UTF-8 CSV buffer from headers and row data.
 *
 * Security:
 *  - Every cell is passed through csvCell() (sanitizeCell + quote-wrapping)
 *  - BOM (EF BB BF) prepended for correct Excel rendering on Windows clients
 */
export function generateCSV(headers: string[], rows: unknown[][]): Buffer {
  const lines: string[] = [];

  // Header row — sanitize header names too
  lines.push(headers.map(csvCell).join(","));

  // Data rows
  for (const row of rows) {
    lines.push(row.map(csvCell).join(","));
  }

  const csv = lines.join("\r\n");

  // UTF-8 BOM + content
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  const content = Buffer.from(csv, "utf-8");

  return Buffer.concat([bom, content]);
}
