import "server-only";

/**
 * Sanitize a single cell value for safe CSV embedding.
 *
 * Rules (RA 10173 + OWASP CSV injection prevention):
 *  - Convert non-string inputs to string
 *  - Trim leading/trailing whitespace
 *  - Strip HTML tags
 *  - Prepend single quote if value starts with =, +, -, @ (formula-trigger chars)
 */
export function sanitizeCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  let str = String(value);

  // Strip HTML tags
  str = str.replace(/<[^>]*>/g, "");

  // Trim whitespace
  str = str.trim();

  // CSV injection prevention — prefix formula-trigger characters
  if (/^[=+\-@|]/.test(str)) {
    str = `'${str}`;
  }

  return str;
}

/**
 * Sanitize a cell and wrap it for CSV embedding.
 * Wraps in double quotes if the value contains commas, newlines, or double quotes.
 * Double quotes inside the value are escaped as "".
 */
export function csvCell(value: unknown): string {
  const sanitized = sanitizeCell(value);
  // Escape internal double quotes
  const escaped = sanitized.replace(/"/g, '""');
  // Wrap in quotes if the value contains commas, newlines, or quote chars
  if (/[,"\r\n]/.test(sanitized)) {
    return `"${escaped}"`;
  }
  return escaped;
}
