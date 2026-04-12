import { parseItemWithAttributes } from "@/lib/validation/items";
import type { ImportRowResult } from "./types";

/**
 * Validates a single CSV row using the same Zod schema as manual item entry.
 * No bypass — identical validation path to POST /api/items.
 */
export function validateRow(
  row: Record<string, string>,
  rowIndex: number
): ImportRowResult {
  const item_name = row.item_name ?? "";
  const category_code = row.category_code ?? "";

  if (!category_code) {
    return {
      row: rowIndex,
      item_name,
      category_code,
      valid: false,
      errors: ["category_code is required"],
    };
  }

  if (!item_name) {
    return {
      row: rowIndex,
      item_name,
      category_code,
      valid: false,
      errors: ["item_name is required"],
    };
  }

  const result = parseItemWithAttributes(row, category_code);

  if (!result.success) {
    return {
      row: rowIndex,
      item_name,
      category_code,
      valid: false,
      errors: result.errors.issues.map((i) => i.message),
    };
  }

  return { row: rowIndex, item_name, category_code, valid: true, errors: [] };
}

export function validateAllRows(
  rows: Record<string, string>[]
): ImportRowResult[] {
  return rows.map((row, i) => validateRow(row, i + 1));
}
