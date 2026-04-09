import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { ALL_ROLES } from "@/lib/auth/permissions";
import { members } from "@/lib/db/schema/members";

// GET /api/members/search?q={term}&limit={n}
// Typeahead search against local members cache. Requires min 2 chars.
// Auth: any Firebase-authenticated role.
export const GET = withAuth(async (req: NextRequest, { user, role }) => {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "10", 10), 20);

  if (q.length < 2) {
    return NextResponse.json({ data: [] });
  }

  const pattern = `%${q}%`;

  const results = await withRole(user.uid, role, async (tx) => {
    return tx
      .select({
        mimsMemberId:   members.mimsMemberId,
        fullName:       members.fullName,
        membershipType: members.membershipType,
        status:         members.status,
      })
      .from(members)
      .where(
        and(
          eq(members.isActive, true),
          sql`(${members.fullName} ILIKE ${pattern} OR ${members.mimsMemberId} ILIKE ${pattern})`
        )
      )
      .limit(limit);
  });

  return NextResponse.json({ data: results });
}, ALL_ROLES);
