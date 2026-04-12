import "server-only";
import { eq, sql } from "drizzle-orm";
import type { ReportParams, ReportRow } from "../types";
import type { Role } from "@/types/auth";
import { withRole } from "@/lib/db/with-role";
import { items } from "@/lib/db/schema/items";
import { itemAttributes } from "@/lib/db/schema/item-attributes";

export const HEADERS_05 = [
  "Asset Tag", "NEA Asset Code", "Item Name", "Feeder",
  "Installation Date", "Acquisition Cost (PHP)",
  "Depreciation Rate (%)", "Annual Depreciation (PHP)",
  "Accumulated Depreciation (PHP)", "Net Book Value (PHP)",
  "Lifecycle Status",
];

export async function queryUpisDepreciation(
  userId: string,
  role: Role,
  _params: ReportParams
): Promise<ReportRow[]> {
  return withRole(userId, role, async (tx) => {
    // Pivot EAV attributes for UPIS items via conditional aggregation
    const rows = await tx
      .select({
        assetTag:        items.assetTag,
        itemName:        items.itemName,
        lifecycleStatus: items.lifecycleStatus,
        neaAssetCode: sql<string>`
          MAX(CASE WHEN ${itemAttributes.attributeName} = 'nea_asset_code' THEN ${itemAttributes.attributeValue} END)
        `,
        feeder: sql<string>`
          MAX(CASE WHEN ${itemAttributes.attributeName} = 'feeder' THEN ${itemAttributes.attributeValue} END)
        `,
        installationDate: sql<string>`
          MAX(CASE WHEN ${itemAttributes.attributeName} = 'installation_date' THEN ${itemAttributes.attributeValue} END)
        `,
        acquisitionCost: sql<string>`
          MAX(CASE WHEN ${itemAttributes.attributeName} = 'acquisition_cost' THEN ${itemAttributes.attributeValue} END)
        `,
        depreciationRate: sql<string>`
          MAX(CASE WHEN ${itemAttributes.attributeName} = 'depreciation_rate' THEN ${itemAttributes.attributeValue} END)
        `,
        accumulatedDepreciation: sql<string>`
          MAX(CASE WHEN ${itemAttributes.attributeName} = 'accumulated_depreciation' THEN ${itemAttributes.attributeValue} END)
        `,
      })
      .from(items)
      .innerJoin(itemAttributes, eq(items.itemId, itemAttributes.itemId))
      .where(eq(items.categoryCode, "UPIS"))
      .groupBy(items.itemId, items.assetTag, items.itemName, items.lifecycleStatus)
      .orderBy(items.itemName);

    return rows.map((r) => {
      const acquisitionCost = parseFloat(r.acquisitionCost ?? "0") || 0;
      const depreciationRate = parseFloat(r.depreciationRate ?? "0") || 0;
      const annualDepreciation = acquisitionCost * (depreciationRate / 100);
      const accumulated = parseFloat(r.accumulatedDepreciation ?? "0") || 0;
      const nbv = acquisitionCost - accumulated;

      return [
        r.assetTag ?? "",
        r.neaAssetCode ?? "",
        r.itemName,
        r.feeder ?? "",
        r.installationDate ?? "",
        acquisitionCost.toFixed(2),
        depreciationRate.toFixed(2),
        annualDepreciation.toFixed(2),
        accumulated.toFixed(2),
        nbv.toFixed(2),
        r.lifecycleStatus,
      ];
    });
  });
}
