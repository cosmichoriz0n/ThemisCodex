import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { MANAGER_ABOVE } from "@/lib/auth/permissions";

/**
 * POST/PATCH/DELETE /api/items/[id]/deactivate
 *
 * Superseded by the Sprint 8 multi-step disposal workflow.
 * All verbs return 410 so callers on any HTTP method get the deprecation notice.
 * Use POST /api/disposal to initiate the 4-step disposal workflow.
 */
const gone = withAuth(async (_req: NextRequest) => {
  return NextResponse.json(
    {
      error: "ENDPOINT_REMOVED",
      message:
        "Direct deactivation is no longer supported. Use POST /api/disposal to initiate the 4-step disposal workflow (requested → under_inspection → authorized → disposed).",
    },
    { status: 410 }
  );
}, MANAGER_ABOVE);

export const POST   = gone;
export const PATCH  = gone;
export const DELETE = gone;
