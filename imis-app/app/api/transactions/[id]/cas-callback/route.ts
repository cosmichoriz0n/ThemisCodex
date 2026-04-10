import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema/transactions";
import { integrationLog } from "@/lib/db/schema/integration-log";

// Internal endpoint — called by n8n IMIS-CAS-001 after journal posting attempt.
// Auth: x-imis-secret header only (n8n has no Firebase user token).
function verifySecret(req: NextRequest): boolean {
  const secret   = process.env.N8N_WEBHOOK_SECRET;
  const incoming = req.headers.get("x-imis-secret");
  if (!secret || !incoming) return false;
  try {
    return timingSafeEqual(Buffer.from(incoming), Buffer.from(secret));
  } catch {
    return false; // length mismatch throws
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/transactions/[id]/cas-callback
// Updates transaction with CAS2000 journal posting result.
// Sets RLS session vars manually (no Firebase JWT).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await ctx.params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }

  let body: {
    cas_journal_ref?: string;
    cas_sync_status?: string;
    cas_sync_attempts?: number;
    error_msg?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const { cas_journal_ref, cas_sync_status, cas_sync_attempts = 0, error_msg } = body;

  if (!cas_sync_status || !["synced", "failed"].includes(cas_sync_status)) {
    return NextResponse.json(
      { error: "cas_sync_status must be 'synced' or 'failed'" },
      { status: 400 }
    );
  }

  const syncStatus = cas_sync_status as "synced" | "failed";
  const logStatus  = syncStatus === "synced" ? "success" : "failure";
  // On CAS success: advance to 'posted'. On failure: stay 'billed' (EBS already succeeded).
  const bizStatus  = syncStatus === "synced" ? "posted" : "billed";

  let rowsUpdated = 0;

  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.user_id = 'n8n-system'`);
    await tx.execute(sql`SET LOCAL app.user_role = 'system_admin'`);

    const result = await tx
      .update(transactions)
      .set({
        casJournalRef:    cas_journal_ref ?? null,
        casSyncStatus:    syncStatus,
        casSyncAttempts:  cas_sync_attempts,
        lastCasAttemptAt: new Date(),
        status:           bizStatus as typeof transactions.status._.data,
        updatedAt:        new Date(),
      })
      .where(eq(transactions.transactionId, id))
      .returning({ transactionId: transactions.transactionId });

    rowsUpdated = result.length;

    await tx.insert(integrationLog).values({
      sourceSystem: "CAS2000",
      operation:    "IMIS-CAS-001",
      status:       logStatus as typeof integrationLog.status._.data,
      payload:      { transaction_id: id, cas_journal_ref: cas_journal_ref ?? null },
      errorMsg:     error_msg ?? null,
      retryCount:   cas_sync_attempts,
    });
  });

  if (rowsUpdated === 0) {
    return NextResponse.json({ error: "TRANSACTION_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ data: { updated: true } });
}
