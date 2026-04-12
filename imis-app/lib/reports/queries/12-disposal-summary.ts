import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { ReportParams, ReportRow } from "../types";
import type { Role } from "@/types/auth";
import { withRole } from "@/lib/db/with-role";
import { items } from "@/lib/db/schema/items";
import { disposalRecords } from "@/lib/db/schema/disposal-records";
import { itemAttributes } from "@/lib/db/schema/item-attributes";
import { categoryCodes } from "@/lib/db/schema/category-codes";

export const HEADERS_12 = [
  "Authorization No", "Disposal Type", "Category", "Category Name",
  "Asset Tag", "Item Name", "Authorized By",
  "Net Book Value (PHP)", "Disposal Date",
];

export async function queryDisposalSummary(
  userId: string,
  role: Role,
  params: ReportParams
): Promise<ReportRow[]> {
  return withRole(userId, role, async (tx) => {
    // NBV from item_attributes (stored during disposal write-off)
    const nbvAttr = tx
      .selectDistinctOn([itemAttributes.itemId], {
        itemId: itemAttributes.itemId,
        nbv:    itemAttributes.attributeValue,
      })
      .from(itemAttributes)
      .where(eq(itemAttributes.attributeName, "net_book_value"))
      .groupBy(itemAttributes.itemId, itemAttributes.attributeValue)
      .as("nbv_attr");

    const conditions = [
      eq(disposalRecords.status, "disposed"),
    ];
    if (params.category_code) {
      conditions.push(eq(items.categoryCode, params.category_code));
    }
    if (params.date_from) {
      conditions.push(gte(disposalRecords.updatedAt, new Date(params.date_from)));
    }
    if (params.date_to) {
      const end = new Date(params.date_to);
      end.setUTCHours(23, 59, 59, 999);
      conditions.push(lte(disposalRecords.updatedAt, end));
    }

    const rows = await tx
      .select({
        authorizationNo: disposalRecords.authorizationNo,
        disposalType:    disposalRecords.disposalType,
        categoryCode:    items.categoryCode,
        categoryName:    categoryCodes.name,
        assetTag:        items.assetTag,
        itemName:        items.itemName,
        authorizedBy:    disposalRecords.authorizedBy,
        nbv:             nbvAttr.nbv,
        disposedAt:      disposalRecords.updatedAt,
        totalNbv:        sql<number>`COALESCE(${nbvAttr.nbv}::numeric, 0)`.mapWith(Number),
      })
      .from(disposalRecords)
      .innerJoin(items, eq(disposalRecords.itemId, items.itemId))
      .innerJoin(categoryCodes, eq(items.categoryCode, categoryCodes.code))
      .leftJoin(nbvAttr, eq(items.itemId, nbvAttr.itemId))
      .where(and(...conditions))
      .orderBy(items.categoryCode, disposalRecords.updatedAt);

    return rows.map((r) => [
      r.authorizationNo ?? "",
      r.disposalType,
      r.categoryCode,
      r.categoryName,
      r.assetTag ?? "",
      r.itemName,
      r.authorizedBy ?? "",
      r.nbv ? Number(r.nbv).toFixed(2) : "0.00",
      r.disposedAt
        ? new Date(r.disposedAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })
        : "",
    ]);
  });
}
