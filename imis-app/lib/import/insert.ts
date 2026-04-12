import "server-only";
import { withRole } from "@/lib/db/with-role";
import { items } from "@/lib/db/schema/items";
import { itemAttributes } from "@/lib/db/schema/item-attributes";
import { inventoryStock } from "@/lib/db/schema/inventory-stock";
import { auditLog } from "@/lib/db/schema/audit-log";
import { parseItemWithAttributes } from "@/lib/validation/items";
import { generateAssetTag } from "@/lib/inventory/asset-tag";
import type { Role } from "@/types/auth";
import type { ImportRowResult, ImportCommitResponse } from "./types";

export async function bulkInsertItems(
  validatedResults: ImportRowResult[],
  rawRows: Record<string, string>[],
  userId: string,
  role: Role,
  filename: string
): Promise<ImportCommitResponse> {
  const validIndices = validatedResults
    .map((r, i) => (r.valid ? i : -1))
    .filter((i) => i !== -1);

  const invalidRows = validatedResults.filter((r) => !r.valid);
  const totalRows = validatedResults.length;

  if (validIndices.length === 0) {
    // Nothing to insert — write audit log outside a write transaction
    const auditResult = await withRole(userId, role, async (tx) => {
      const [entry] = await tx
        .insert(auditLog)
        .values({
          userId,
          userRole: role,
          action: "bulk_import",
          resource: "items",
          details: {
            filename,
            total_rows: totalRows,
            inserted: 0,
            failed: invalidRows.length,
            invalid_row_numbers: invalidRows.map((r) => r.row),
          },
        })
        .returning({ id: auditLog.id });
      return entry;
    });

    return {
      phase: "commit",
      total_rows: totalRows,
      inserted: 0,
      failed: invalidRows.length,
      errors: invalidRows,
      audit_log_id: auditResult.id,
    };
  }

  let insertedCount = 0;

  const auditResult = await withRole(userId, role, async (tx) => {
    for (const idx of validIndices) {
      const row = rawRows[idx];
      const categoryCode = row.category_code;

      // Re-parse to get typed item data + attributes (identical to POST /api/items path)
      const parsed = parseItemWithAttributes(row, categoryCode);
      if (!parsed.success) continue; // should not happen — already validated

      const { item: itemData, attributes } = parsed.data;
      const location = itemData.location ?? "main_warehouse";
      const qtyOnHand = Math.max(0, parseInt(row.qty_on_hand ?? "0", 10) || 0);
      const reorderLevel = Math.max(0, parseInt(row.reorder_level ?? "0", 10) || 0);

      const assetTag = await generateAssetTag(tx, categoryCode);

      const [newItem] = await tx
        .insert(items)
        .values({
          categoryCode: itemData.category_code,
          itemName: itemData.item_name,
          sku: itemData.sku,
          description: itemData.description,
          location,
          barcode: assetTag,
          assetTag,
          lifecycleStatus: "acquired",
          createdBy: userId,
        })
        .returning();

      if (attributes.length > 0) {
        await tx.insert(itemAttributes).values(
          attributes.map((a) => ({
            itemId: newItem.itemId,
            attributeName: a.name,
            attributeValue: a.value,
          }))
        );
      }

      await tx.insert(inventoryStock).values({
        itemId: newItem.itemId,
        location,
        qtyOnHand,
        qtyReserved: 0,
        reorderLevel,
      });

      insertedCount++;
    }

    // One audit log entry for the entire import batch
    const [entry] = await tx
      .insert(auditLog)
      .values({
        userId,
        userRole: role,
        action: "bulk_import",
        resource: "items",
        details: {
          filename,
          total_rows: totalRows,
          inserted: insertedCount,
          failed: invalidRows.length,
          invalid_row_numbers: invalidRows.map((r) => r.row),
        },
      })
      .returning({ id: auditLog.id });

    return entry;
  });

  return {
    phase: "commit",
    total_rows: totalRows,
    inserted: insertedCount,
    failed: invalidRows.length,
    errors: invalidRows,
    audit_log_id: auditResult.id,
  };
}
