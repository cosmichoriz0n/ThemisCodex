import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { integrationLog } from "@/lib/db/schema/integration-log";

// Internal endpoint — n8n logs workflow results here.
// Auth: x-imis-secret header only (not Firebase, since n8n has no user token).
function verifySecret(req: NextRequest): boolean {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) return false;
  return req.headers.get("x-imis-secret") === secret;
}

// POST /api/integration-log
export async function POST(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const { source_system, operation, status, payload, response_body, error_msg } = body;

  const validSystems = ["MIMS", "EBS2000", "CAS2000", "INTERNAL"];
  const validStatuses = ["success", "failure", "retry"];

  if (!validSystems.includes(source_system as string)) {
    return NextResponse.json({ error: "Invalid source_system" }, { status: 400 });
  }
  if (!validStatuses.includes(status as string)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (!operation || typeof operation !== "string") {
    return NextResponse.json({ error: "operation is required" }, { status: 400 });
  }

  // Sanitize: never log secrets. n8n is instructed not to include them,
  // but double-check by removing any key containing "key", "secret", "password", "token".
  const sanitize = (obj: unknown): unknown => {
    if (!obj || typeof obj !== "object") return obj;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (/key|secret|password|token/i.test(k)) {
        result[k] = "[REDACTED]";
      } else {
        result[k] = v;
      }
    }
    return result;
  };

  await db.insert(integrationLog).values({
    sourceSystem: source_system as typeof integrationLog.sourceSystem._.data,
    operation:    operation as string,
    status:       status as typeof integrationLog.status._.data,
    payload:      sanitize(payload) ?? null,
    responseBody: sanitize(response_body) ?? null,
    errorMsg:     typeof error_msg === "string" ? error_msg : null,
  });

  return NextResponse.json({ data: { logged: true } }, { status: 201 });
}
