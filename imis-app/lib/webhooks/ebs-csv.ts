import "server-only";

export interface EbsCsvItem {
  itemName: string;
  assetTag: string | null;
  quantity: number;
  unitPrice: string; // numeric string from DB
}

export interface EbsCsvTransaction {
  transactionId: string;
  memberId: string | null;
  createdAt: Date;
  createdBy: string;
  referenceNo?: string | null;
  items: EbsCsvItem[];
}

/** Wraps a CSV field value per RFC 4180: quote if it contains comma, double-quote, or newline. */
function csvField(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Generates an EBS2000-compatible CSV from a transaction and its items.
 * One row per line item. Pure function — no DB access.
 *
 * Columns:
 *   transaction_id, member_id, item_name, asset_tag, quantity,
 *   unit_price, total_line_amount, reference_no, transaction_date_pht, created_by
 */
export function generateEbsCsv(txn: EbsCsvTransaction): string {
  const header = [
    "transaction_id",
    "member_id",
    "item_name",
    "asset_tag",
    "quantity",
    "unit_price",
    "total_line_amount",
    "reference_no",
    "transaction_date_pht",
    "created_by",
  ].join(",");

  // Format date as PHT (UTC+8) ISO string
  const phtDate = new Date(txn.createdAt.getTime() + 8 * 60 * 60 * 1000)
    .toISOString()
    .replace("Z", "+08:00");

  const rows = txn.items.map((item) => {
    const unitPrice = parseFloat(item.unitPrice) || 0;
    const totalLine = (unitPrice * item.quantity).toFixed(4);
    return [
      csvField(txn.transactionId),
      csvField(txn.memberId),
      csvField(item.itemName),
      csvField(item.assetTag),
      csvField(item.quantity),
      csvField(item.unitPrice),
      csvField(totalLine),
      csvField(txn.referenceNo),
      csvField(phtDate),
      csvField(txn.createdBy),
    ].join(",");
  });

  return [header, ...rows].join("\r\n");
}
