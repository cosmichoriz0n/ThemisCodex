import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { ADMIN_ONLY } from "@/lib/auth/permissions";
import { transactions } from "@/lib/db/schema/transactions";
import { transactionItems } from "@/lib/db/schema/transaction-items";
import { auditLog } from "@/lib/db/schema/audit-log";
import { signPayload } from "@/lib/webhooks/sign";

// POST /api/transactions/[id]/retry
// Re-fires the HMAC-signed webhook to n8n for a pending/failed transaction.
// Restricted to system_admin only (ADMIN_ONLY) — keeps within existing RLS UPDATE policy.
// Attempt counter is only incremented AFTER n8n confirms receipt to prevent locking
// out transactions due to transient network failures.
export const POST = withAuth(
  async (req: NextRequest, { user, role, params }) => {
    const { id } = params;

    // Step 1: fetch & validate guards (read-only — no writes yet)
    const fetched = await withRole(user.uid, role, async (tx) => {
      const [txn] = await tx
        .select({
          transactionId:   transactions.transactionId,
          memberId:        transactions.memberId,
          ebsSyncStatus:   transactions.ebsSyncStatus,
          ebsSyncAttempts: transactions.ebsSyncAttempts,
          movementId:      transactions.movementId,
        })
        .from(transactions)
        .where(eq(transactions.transactionId, id))
        .limit(1);

      if (!txn) return { notFound: true } as const;
      if (txn.ebsSyncStatus === "synced") return { alreadySynced: true } as const;
      if (txn.ebsSyncAttempts >= 10) return { maxRetry: true } as const;

      const [item] = await tx
        .select({
          itemId:   transactionItems.itemId,
          quantity: transactionItems.quantity,
        })
        .from(transactionItems)
        .where(eq(transactionItems.transactionId, id))
        .limit(1);

      return { txn, item: item ?? null } as const;
    });

    if ("notFound" in fetched)     return NextResponse.json({ error: "TRANSACTION_NOT_FOUND" }, { status: 404 });
    if ("alreadySynced" in fetched) return NextResponse.json({ error: "ALREADY_SYNCED" }, { status: 409 });
    if ("maxRetry" in fetched)     return NextResponse.json({ error: "MAX_RETRY_EXCEEDED" }, { status: 429 });

    const { txn, item } = fetched;

    if (!process.env.N8N_WEBHOOK_URL) {
      return NextResponse.json({ error: "N8N_WEBHOOK_URL not configured" }, { status: 500 });
    }

    const webhookPayload = {
      transaction_id: txn.transactionId,
      movement_id:    txn.movementId ?? null,
      item_id:        item?.itemId ?? null,
      quantity:       item?.quantity ?? 0,
      member_id:      txn.memberId ?? null,
      reference_no:   null,
      moved_by:       user.uid,
      moved_at:       new Date().toISOString(),
    };

    const signature = signPayload(webhookPayload, process.env.N8N_WEBHOOK_SECRET ?? "");

    // Step 2: fire webhook — only proceed to DB write if this succeeds
    try {
      const res = await fetch(`${process.env.N8N_WEBHOOK_URL}/imis-ebs-001`, {
        method: "POST",
        headers: {
          "Content-Type":     "application/json",
          "X-IMIS-Signature": signature,
        },
        body: JSON.stringify(webhookPayload),
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: "N8N_UNREACHABLE", detail: `HTTP ${res.status}` },
          { status: 502 }
        );
      }
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).slice(0, 200);
      return NextResponse.json({ error: "N8N_UNREACHABLE", detail: msg }, { status: 502 });
    }

    // Step 3: n8n confirmed receipt — now increment attempt count and write audit log
    await withRole(user.uid, role, async (tx) => {
      await tx
        .update(transactions)
        .set({
          ebsSyncAttempts:  sql`${transactions.ebsSyncAttempts} + 1`,
          lastEbsAttemptAt: new Date(),
          updatedAt:        new Date(),
        })
        .where(eq(transactions.transactionId, id));

      await tx.insert(auditLog).values({
        userId:     user.uid,
        userRole:   role,
        action:     "ebs_retry_transaction",
        resource:   "transactions",
        resourceId: id,
        details: {
          previous_status:   txn.ebsSyncStatus,
          previous_attempts: txn.ebsSyncAttempts,
        },
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      });
    });

    return NextResponse.json({ data: { queued: true } });
  },
  ADMIN_ONLY
);
