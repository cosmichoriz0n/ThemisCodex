import "server-only";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { ReportParams, ReportRow } from "../types";
import type { Role } from "@/types/auth";
import { withRole } from "@/lib/db/with-role";
import { items } from "@/lib/db/schema/items";
import { itemAttributes } from "@/lib/db/schema/item-attributes";

export const HEADERS_07 = [
  "Asset Tag", "Category", "Item Name",
  "Expiry Type", "Expiry Date", "Days Until Expiry", "Lifecycle Status",
];

// Attribute names per category that represent expiry dates
const EXPIRY_ATTRIBUTES: Record<string, string> = {
  MS: "expiry_date",
  IT: "license_expiry",
  CE: "ntc_expiry",
  SE: "calibration_expiry",
  MP: "insurance_expiry",
  TR: "insurance_expiry",
};

const EXPIRY_LABELS: Record<string, string> = {
  expiry_date:      "Product Expiry",
  license_expiry:   "License Expiry",
  ntc_expiry:       "NTC License Expiry",
  calibration_expiry: "Calibration Expiry",
  insurance_expiry: "Insurance Expiry",
  lto_expiry:       "LTO Registration",
  emission_due:     "Emission Test Due",
};

export async function queryExpiryTracking(
  userId: string,
  role: Role,
  params: ReportParams
): Promise<ReportRow[]> {
  return withRole(userId, role, async (tx) => {
    // Filter by category if specified; otherwise all expiry-tracked categories
    const targetCategories = params.category_code
      ? [params.category_code]
      : Object.keys(EXPIRY_ATTRIBUTES);

    const rows = await tx
      .select({
        assetTag:        items.assetTag,
        categoryCode:    items.categoryCode,
        itemName:        items.itemName,
        lifecycleStatus: items.lifecycleStatus,
        attributeName:   itemAttributes.attributeName,
        attributeValue:  itemAttributes.attributeValue,
        daysUntil: sql<number>`
          EXTRACT(EPOCH FROM (${itemAttributes.attributeValue}::timestamptz - NOW())) / 86400.0
        `.mapWith(Number),
      })
      .from(items)
      .innerJoin(itemAttributes, eq(items.itemId, itemAttributes.itemId))
      .where(
        and(
          inArray(items.categoryCode, targetCategories),
          inArray(
            itemAttributes.attributeName,
            [...new Set(Object.values(EXPIRY_ATTRIBUTES)), "lto_expiry", "emission_due"]
          ),
          sql`${itemAttributes.attributeValue} IS NOT NULL`,
          sql`${itemAttributes.attributeValue} <> ''`,
          // Guard: only proceed with the ::timestamptz cast if the value looks like a date.
          // Without this, malformed attribute_value strings (e.g. "N/A") throw a PostgreSQL
          // "invalid input syntax for type timestamp" exception and crash the entire query.
          sql`${itemAttributes.attributeValue} ~ '^\d{4}-\d{2}-\d{2}'`,
          // Only show items expiring within 1 year (for actionable reporting)
          lte(
            sql`(${itemAttributes.attributeValue}::timestamptz)`,
            sql`NOW() + INTERVAL '365 days'`
          )
        )
      )
      .orderBy(sql`(${itemAttributes.attributeValue}::timestamptz) ASC`);

    return rows
      .filter((r) => !isNaN(r.daysUntil))
      .map((r) => [
        r.assetTag ?? "",
        r.categoryCode,
        r.itemName,
        EXPIRY_LABELS[r.attributeName] ?? r.attributeName,
        r.attributeValue ?? "",
        Math.floor(r.daysUntil ?? 0),
        r.lifecycleStatus,
      ]);
  });
}
