import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { ALL_ROLES } from "@/lib/auth/permissions";
import { members } from "@/lib/db/schema/members";
import { stockMovements } from "@/lib/db/schema/stock-movements";
import { items } from "@/lib/db/schema/items";

// GET /api/members/[mims_member_id]/transactions
// Returns member info + all issuances to that member.
// Query params: from (ISO date), to (ISO date), category (category_code)
export const GET = withAuth(
  async (req: NextRequest, { user, role, params }) => {
    const { mims_member_id } = params;
    const { searchParams } = new URL(req.url);
    const from     = searchParams.get("from");
    const to       = searchParams.get("to");
    const category = searchParams.get("category");

    const data = await withRole(user.uid, role, async (tx) => {
      // Fetch member record
      const [member] = await tx
        .select({
          mimsMemberId:   members.mimsMemberId,
          fullName:       members.fullName,
          membershipType: members.membershipType,
          status:         members.status,
          address:        members.address,
          contactNo:      members.contactNo,
          lastSyncAt:     members.lastSyncAt,
        })
        .from(members)
        .where(eq(members.mimsMemberId, mims_member_id))
        .limit(1);

      if (!member) return null;

      // Build movement filters
      const filters = [
        eq(stockMovements.memberId, mims_member_id),
        eq(stockMovements.movementType, "issue"),
      ];

      if (from) {
        // Parse as PHT (UTC+8) start-of-day so we include movements from PHT midnight onward
        filters.push(sql`${stockMovements.movedAt} >= ${new Date(`${from}T00:00:00+08:00`).toISOString()}`);
      }
      if (to) {
        // Parse as PHT (UTC+8) end-of-day so we include all movements on the "to" date in PHT
        filters.push(sql`${stockMovements.movedAt} <= ${new Date(`${to}T23:59:59.999+08:00`).toISOString()}`);
      }
      if (category) {
        filters.push(eq(items.categoryCode, category));
      }

      const movements = await tx
        .select({
          movementId:   stockMovements.movementId,
          itemId:       stockMovements.itemId,
          itemName:     items.itemName,
          assetTag:     items.assetTag,
          categoryCode: items.categoryCode,
          quantity:     stockMovements.quantity,
          unitCost:     stockMovements.unitCost,
          referenceNo:  stockMovements.referenceNo,
          remarks:      stockMovements.remarks,
          movedBy:      stockMovements.movedBy,
          movedAt:      stockMovements.movedAt,
        })
        .from(stockMovements)
        .innerJoin(items, eq(stockMovements.itemId, items.itemId))
        .where(and(...filters))
        .orderBy(desc(stockMovements.movedAt));

      return { member, movements };
    });

    if (!data) {
      return NextResponse.json({ error: "MEMBER_NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ data });
  },
  ALL_ROLES
);
