import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { MANAGER_ABOVE } from "@/lib/auth/permissions";
import { transactions } from "@/lib/db/schema/transactions";
import { transactionItems } from "@/lib/db/schema/transaction-items";
import { items } from "@/lib/db/schema/items";
import { generateEbsCsv } from "@/lib/webhooks/ebs-csv";

// GET /api/transactions/[id]/export-csv
// Streams an EBS2000-compatible CSV for the given transaction.
// Flat-file fallback when EBS2000 REST is unavailable — admin downloads and imports manually.
export const GET = withAuth(
  async (_req: NextRequest, { user, role, params }) => {
    const { id } = params;

    const data = await withRole(user.uid, role, async (tx) => {
      const [txn] = await tx
        .select({
          transactionId: transactions.transactionId,
          memberId:      transactions.memberId,
          totalAmount:   transactions.totalAmount,
          createdAt:     transactions.createdAt,
          createdBy:     transactions.createdBy,
        })
        .from(transactions)
        .where(eq(transactions.transactionId, id))
        .limit(1);

      if (!txn) return null;

      const lineItems = await tx
        .select({
          itemName:  items.itemName,
          assetTag:  items.assetTag,
          quantity:  transactionItems.quantity,
          unitPrice: transactionItems.unitPrice,
        })
        .from(transactionItems)
        .innerJoin(items, eq(transactionItems.itemId, items.itemId))
        .where(eq(transactionItems.transactionId, id));

      return { txn, lineItems };
    });

    if (!data) {
      return NextResponse.json({ error: "TRANSACTION_NOT_FOUND" }, { status: 404 });
    }
    if (data.lineItems.length === 0) {
      return NextResponse.json({ error: "NO_LINE_ITEMS" }, { status: 422 });
    }

    const csvString = generateEbsCsv({
      transactionId: data.txn.transactionId,
      memberId:      data.txn.memberId,
      createdAt:     data.txn.createdAt,
      createdBy:     data.txn.createdBy,
      items: data.lineItems.map((li) => ({
        itemName:  li.itemName,
        assetTag:  li.assetTag ?? null,
        quantity:  li.quantity,
        unitPrice: li.unitPrice,
      })),
    });

    return new Response(csvString, {
      headers: {
        "Content-Type":        "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ebs-${id.slice(0, 8)}.csv"`,
      },
    });
  },
  MANAGER_ABOVE
);
