import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { members } from "@/lib/db/schema/members";
import { integrationLog } from "@/lib/db/schema/integration-log";

function verifySecret(req: NextRequest): boolean {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) return false;
  return req.headers.get("x-imis-secret") === secret;
}

interface MimsMember {
  mims_member_id: string;
  full_name: string;
  membership_type?: string | null;
  status?: "active" | "inactive" | "disconnected";
  address?: string | null;
  contact_no?: string | null;
}

// POST /api/members/sync
// Called by n8n IMIS-MIMS-001 (delta) and IMIS-MIMS-NIGHTLY (full).
// Fetches members from MIMS, upserts to local DB, logs result.
// API key is NEVER logged — only included in the outbound fetch header.
export async function POST(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: { triggered_by?: string; mode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const { triggered_by = "IMIS-MIMS-SYNC", mode = "delta" } = body;

  if (mode !== "delta" && mode !== "full") {
    return NextResponse.json({ error: "mode must be 'delta' or 'full'" }, { status: 400 });
  }

  const mimsBase = process.env.MIMS_API_URL;
  const mimsKey = process.env.MIMS_API_KEY;

  if (!mimsBase || !mimsKey) {
    return NextResponse.json(
      { error: "MIMS_API_URL or MIMS_API_KEY not configured" },
      { status: 500 }
    );
  }

  const ranAt = new Date().toISOString();

  try {
    // Delta mode: pull only records updated since the last successful sync
    let mimsUrl = `${mimsBase}/api/members`;
    if (mode === "delta") {
      const [maxRow] = await db
        .select({ maxSync: sql<string | null>`MAX(last_sync_at)::text` })
        .from(members);
      if (maxRow?.maxSync) {
        mimsUrl += `?since=${encodeURIComponent(maxRow.maxSync)}`;
      }
    }

    // Fetch — API key only in outbound header, never stored or logged
    const mimsRes = await fetch(mimsUrl, {
      headers: { "x-api-key": mimsKey },
      // No cache — always fresh
      cache: "no-store",
    });

    if (!mimsRes.ok) {
      const errText = (await mimsRes.text()).slice(0, 200);
      await db.insert(integrationLog).values({
        sourceSystem: "MIMS",
        operation: triggered_by,
        status: "failure",
        payload: { mode },
        errorMsg: `MIMS HTTP ${mimsRes.status}: ${errText}`,
      });
      return NextResponse.json(
        { error: "MIMS_ERROR", details: `HTTP ${mimsRes.status}` },
        { status: 502 }
      );
    }

    const mimsJson = await mimsRes.json();
    const mimsMembers: MimsMember[] = Array.isArray(mimsJson.data) ? mimsJson.data : [];

    const nowTs = new Date();

    // Wrap all upserts + the success log in a single transaction so that a
    // mid-batch crash never advances last_sync_at for only some members,
    // which would cause delta mode to silently skip the unwritten remainder.
    const syncedCount = await db.transaction(async (tx) => {
      let count = 0;
      for (const m of mimsMembers) {
        if (!m.mims_member_id || !m.full_name) continue;

        const validStatus = (["active", "inactive", "disconnected"] as const).includes(
          m.status as "active" | "inactive" | "disconnected"
        )
          ? (m.status as "active" | "inactive" | "disconnected")
          : ("active" as const);

        await tx
          .insert(members)
          .values({
            mimsMemberId:   m.mims_member_id,
            fullName:       m.full_name,
            membershipType: m.membership_type ?? null,
            status:         validStatus,
            address:        m.address ?? null,
            contactNo:      m.contact_no ?? null,
            lastSyncAt:     nowTs,
          })
          .onConflictDoUpdate({
            target: members.mimsMemberId,
            set: {
              fullName:       m.full_name,
              membershipType: m.membership_type ?? null,
              status:         validStatus,
              address:        m.address ?? null,
              contactNo:      m.contact_no ?? null,
              lastSyncAt:     nowTs,
              updatedAt:      nowTs,
            },
          });

        count++;
      }

      await tx.insert(integrationLog).values({
        sourceSystem: "MIMS",
        operation:    triggered_by,
        status:       "success",
        payload:      { mode, synced_count: count },
      });

      return count;
    });

    return NextResponse.json({ data: { synced: syncedCount, mode, ran_at: ranAt } });
  } catch (err) {
    const errMsg = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    await db.insert(integrationLog).values({
      sourceSystem: "MIMS",
      operation:    triggered_by,
      status:       "failure",
      payload:      { mode },
      errorMsg:     errMsg,
    });
    return NextResponse.json({ error: "SYNC_FAILED", details: errMsg }, { status: 500 });
  }
}
