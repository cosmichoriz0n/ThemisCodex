import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { sql, desc, eq, and, gte, lte } from "drizzle-orm";
import { withAuth } from "@/lib/auth/withAuth";
import { withRole } from "@/lib/db/with-role";
import { ALL_ROLES, MANAGER_ABOVE } from "@/lib/auth/permissions";
import { stockMovements } from "@/lib/db/schema/stock-movements";
import { items } from "@/lib/db/schema/items";
import { auditLog } from "@/lib/db/schema/audit-log";
import { transactions } from "@/lib/db/schema/transactions";
import { transactionItems } from "@/lib/db/schema/transaction-items";
import { signPayload } from "@/lib/webhooks/sign";
import type { Role } from "@/types/auth";

// Movement types and who can perform them
const MOVEMENT_PERMISSIONS: Record<string, Role[]> = {
  receive:  ["inventory_staff", "inventory_manager", "system_admin"],
  issue:    ["inventory_staff", "inventory_manager", "system_admin"],
  return:   ["inventory_staff", "inventory_manager", "system_admin"],
  adjust:   ["inventory_manager", "system_admin"],
  transfer: ["inventory_manager", "system_admin"],
  dispose:  ["inventory_manager", "system_admin"],
};

const OVERRIDE_ROLES: Role[] = ["inventory_manager", "system_admin"];

interface RpcResult {
  ok: boolean;
  movement_id?: string;
  new_qty?: number;
  new_status?: string;
  reorder_triggered?: boolean;
  manager_override_used?: boolean;
  error?: string;
  qty_on_hand?: number;
  qty_requested?: number;
  current_status?: string;
  hint?: string;
}

// GET /api/movements — list all movements with filters
export const GET = withAuth(async (req: NextRequest, { user, role }) => {
  const { searchParams } = new URL(req.url);
  const movementType = searchParams.get("movement_type");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  const data = await withRole(user.uid, role, async (tx) => {
    const conditions = [];
    if (movementType) {
      conditions.push(
        eq(
          stockMovements.movementType,
          movementType as typeof stockMovements.movementType._.data
        )
      );
    }
    if (dateFrom) conditions.push(gte(stockMovements.movedAt, new Date(dateFrom)));
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(stockMovements.movedAt, end));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await tx
      .select({
        movementId:   stockMovements.movementId,
        itemId:       stockMovements.itemId,
        itemName:     items.itemName,
        assetTag:     items.assetTag,
        categoryCode: items.categoryCode,
        movementType: stockMovements.movementType,
        quantity:     stockMovements.quantity,
        fromLocation: stockMovements.fromLocation,
        toLocation:   stockMovements.toLocation,
        memberId:     stockMovements.memberId,
        referenceNo:  stockMovements.referenceNo,
        remarks:      stockMovements.remarks,
        movedBy:      stockMovements.movedBy,
        movedAt:      stockMovements.movedAt,
      })
      .from(stockMovements)
      .innerJoin(items, eq(stockMovements.itemId, items.itemId))
      .where(where)
      .orderBy(desc(stockMovements.movedAt))
      .limit(pageSize)
      .offset(offset);

    const [{ count }] = await tx
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(stockMovements)
      .where(where);

    return { rows, total: count ?? 0 };
  });

  return NextResponse.json({
    data: data.rows,
    meta: { page, pageSize, total: data.total },
  });
}, ALL_ROLES);

// POST /api/movements — create a stock movement via process_stock_movement() RPC
export const POST = withAuth(async (req: NextRequest, { user, role }) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const {
    item_id,
    movement_type,
    quantity,
    from_location,
    to_location,
    member_id,
    reference_no,
    remarks,
    unit_cost,
    manager_override,
    override_reason,
  } = body as Record<string, unknown>;

  // Basic validation
  if (!item_id || typeof item_id !== "string") {
    return NextResponse.json({ error: "item_id is required" }, { status: 400 });
  }
  if (!movement_type || typeof movement_type !== "string") {
    return NextResponse.json({ error: "movement_type is required" }, { status: 400 });
  }
  if (typeof quantity !== "number" || !Number.isInteger(quantity)) {
    return NextResponse.json({ error: "quantity must be an integer" }, { status: 400 });
  }

  // Role-based permission check for movement type
  const allowedRoles = MOVEMENT_PERMISSIONS[movement_type];
  if (!allowedRoles) {
    return NextResponse.json({ error: "INVALID_MOVEMENT_TYPE" }, { status: 400 });
  }
  if (!allowedRoles.includes(role)) {
    return NextResponse.json(
      { error: "INSUFFICIENT_ROLE", detail: `${movement_type} requires role: ${allowedRoles.join(", ")}` },
      { status: 403 }
    );
  }

  // Manager override only allowed for approved roles
  const useOverride = Boolean(manager_override);
  if (useOverride && !OVERRIDE_ROLES.includes(role)) {
    return NextResponse.json(
      { error: "OVERRIDE_NOT_PERMITTED", detail: "Only managers and admins can use manager override" },
      { status: 403 }
    );
  }

  const withRoleResult = await withRole(user.uid, role, async (tx) => {
    // Call the process_stock_movement() PostgreSQL RPC
    const rows = await tx.execute(sql`
      SELECT process_stock_movement(
        ${item_id}::uuid,
        ${movement_type}::text,
        ${quantity}::int,
        ${(from_location as string | null) ?? "main_warehouse"}::text,
        ${(to_location as string | null) ?? null}::text,
        ${(member_id as string | null) ?? null}::text,
        ${(reference_no as string | null) ?? null}::text,
        ${(remarks as string | null) ?? null}::text,
        ${user.uid}::text,
        ${role}::text,
        ${unit_cost != null ? String(unit_cost) : null}::numeric,
        ${useOverride}::boolean,
        ${(override_reason as string | null) ?? null}::text
      ) AS result
    `);

    const rpcResult = (rows as unknown as Array<{ result: RpcResult }>)[0]?.result;
    if (!rpcResult) return { ok: false as const, error: "RPC_RETURNED_NULL", transactionId: null };

    // If manager override was used, write a warning entry to audit_log
    if (rpcResult.ok && rpcResult.manager_override_used) {
      await tx.insert(auditLog).values({
        userId:     user.uid,
        userRole:   role,
        action:     "movement_manager_override",
        resource:   "stock_movements",
        resourceId: rpcResult.movement_id ?? null,
        details: {
          item_id,
          movement_type,
          quantity,
          override_reason: override_reason ?? null,
          qty_on_hand_at_time: rpcResult.qty_on_hand,
        },
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      });
    }

    // Write movement to audit_log
    if (rpcResult.ok) {
      await tx.insert(auditLog).values({
        userId:     user.uid,
        userRole:   role,
        action:     `stock_${movement_type}`,
        resource:   "stock_movements",
        resourceId: rpcResult.movement_id ?? null,
        details: {
          item_id,
          movement_type,
          quantity,
          from_location: from_location ?? "main_warehouse",
          to_location:   to_location ?? null,
          new_qty:       rpcResult.new_qty,
          new_status:    rpcResult.new_status,
        },
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      });
    }

    // Sprint 6: create a transaction record for issue movements (atomic with the movement)
    let transactionId: string | null = null;
    if (rpcResult.ok && movement_type === "issue") {
      const unitCostVal = unit_cost != null ? String(unit_cost) : "0";
      const totalAmount = (Number(unitCostVal) * (quantity as number)).toFixed(4);
      const [txnRow] = await tx
        .insert(transactions)
        .values({
          memberId:      (member_id as string | null) ?? null,
          totalAmount,
          status:        "pending",
          ebsSyncStatus: "pending",
          createdBy:     user.uid,
          movementId:    rpcResult.movement_id ?? null,
        })
        .returning({ transactionId: transactions.transactionId });
      transactionId = txnRow.transactionId;
      await tx.insert(transactionItems).values({
        transactionId: txnRow.transactionId,
        itemId:        item_id as string,
        quantity:      quantity as number,
        unitPrice:     unitCostVal,
      });
    }

    return { ...rpcResult, transactionId };
  });

  const { transactionId, ...result } = withRoleResult;

  if (!result.ok) {
    const statusMap: Record<string, number> = {
      ITEM_NOT_FOUND:           404,
      ITEM_IS_DISPOSED:         409,
      INSUFFICIENT_STOCK:       409,
      INVALID_STATE_TRANSITION: 409,
      STOCK_RECORD_NOT_FOUND:   404,
      INVALID_MOVEMENT_TYPE:    400,
      QUANTITY_MUST_BE_POSITIVE: 400,
    };
    const httpStatus = statusMap[result.error ?? ""] ?? 500;
    return NextResponse.json({ error: result.error, detail: result }, { status: httpStatus });
  }

  // Sprint 6: Fire HMAC-signed webhook to n8n IMIS-EBS-001 for issue movements.
  // Fire-and-forget — if n8n is unreachable the transaction stays ebs_sync_status='pending'
  // and admin can use the manual retry button to re-trigger.
  if (result.ok && movement_type === "issue" && transactionId && process.env.N8N_WEBHOOK_URL) {
    const webhookPayload = {
      transaction_id: transactionId,
      movement_id:    result.movement_id,
      item_id,
      quantity,
      member_id:      member_id ?? null,
      reference_no:   reference_no ?? null,
      moved_by:       user.uid,
      moved_at:       new Date().toISOString(),
    };
    const signature = signPayload(webhookPayload, process.env.N8N_WEBHOOK_SECRET ?? "");
    fetch(`${process.env.N8N_WEBHOOK_URL}/imis-ebs-001`, {
      method: "POST",
      headers: {
        "Content-Type":    "application/json",
        "X-IMIS-Signature": signature,
      },
      body: JSON.stringify(webhookPayload),
    }).catch(() => {});
  }

  return NextResponse.json({ data: result }, { status: 201 });
}, ALL_ROLES);
