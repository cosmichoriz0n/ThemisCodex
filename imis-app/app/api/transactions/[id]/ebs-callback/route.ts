import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema/transactions";
import { integrationLog } from "@/lib/db/schema/integration-log";

// Internal endpoint — called by n8n IMIS-EBS-001 after billing attempt.
// Auth: x-imis-secret header only (n8n has no Firebase user token).
function verifySecret(req: NextRequest): boolean {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  const incoming = req.headers.get("x-imis-secret");
  if (!secret || !incoming) return false;
  try {
    return timingSafeEqual(Buffer.from(incoming), Buffer.from(secret));
  } catch {
    return false; // length mismatch throws
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/transactions/[id]/ebs-callback
// Updates transaction with billing result. Sets RLS session vars manually
// (no Firebase JWT — uses system_admin role to satisfy the UPDATE policy).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await ctx.params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }

  let body: {
    billing_ref?: string;
    ebs_sync_status?: string;
    ebs_sync_attempts?: number;
    error_msg?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const { billing_ref, ebs_sync_status, ebs_sync_attempts = 0, error_msg } = body;

  if (!ebs_sync_status || !["synced", "failed"].includes(ebs_sync_status)) {
    return NextResponse.json(
      { error: "ebs_sync_status must be 'synced' or 'failed'" },
      { status: 400 }
    );
  }

  const syncStatus = ebs_sync_status as "synced" | "failed";
  const logStatus  = syncStatus === "synced" ? "success" : "failure";
  const bizStatus  = syncStatus === "synced" ? "billed" : "failed";

  await db.transaction(async (tx) => {
    // Set RLS session variables so the existing system_admin UPDATE policy passes
    await tx.execute(sql`SET LOCAL app.user_id = 'n8n-system'`);
    await tx.execute(sql`SET LOCAL app.user_role = 'system_admin'`);

    await tx
      .update(transactions)
      .set({
        ebsBillingRef:    billing_ref ?? null,
        ebsSyncStatus:    syncStatus,
        ebsSyncAttempts:  ebs_sync_attempts,
        lastEbsAttemptAt: new Date(),
        status:           bizStatus as typeof transactions.status._.data,
        updatedAt:        new Date(),
      })
      .where(eq(transactions.transactionId, id));

    await tx.insert(integrationLog).values({
      sourceSystem: "EBS2000",
      operation:    "IMIS-EBS-001",
      status:       logStatus as typeof integrationLog.status._.data,
      payload:      { transaction_id: id, billing_ref: billing_ref ?? null },
      errorMsg:     error_msg ?? null,
      retryCount:   ebs_sync_attempts,
    });
  });

  return NextResponse.json({ data: { updated: true } });
}
