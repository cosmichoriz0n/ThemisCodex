import "server-only";
import { sql } from "drizzle-orm";
import type { db } from "@/lib/db";

/**
 * Generates a unique asset tag for a new item.
 * Format: {CODE}-{YYYY}-{SEQUENCE} e.g. LM-2026-001234
 *
 * Sequence is based on the total count of existing items in the category,
 * computed inside the same transaction to be race-safe.
 */
export async function generateAssetTag(
  tx: typeof db,
  categoryCode: string
): Promise<string> {
  const year = new Date().getFullYear();

  // Count existing items in this category to derive the next sequence number
  const result = await tx.execute(
    sql`SELECT COUNT(*)::int AS cnt FROM items WHERE category_code = ${categoryCode}`
  );

  // drizzle postgres-js RowList is array-like; index directly
  const count = ((result as unknown as Array<{ cnt: number }>)[0]?.cnt) ?? 0;
  const sequence = String(count + 1).padStart(6, "0");

  return `${categoryCode}-${year}-${sequence}`;
}

/**
 * The barcode value is the same as the asset tag for Code128.
 */
export function getBarcodeValue(assetTag: string): string {
  return assetTag;
}
