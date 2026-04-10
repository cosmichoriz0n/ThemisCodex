import { pgTable, uuid, text, integer, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { stockMovements } from "./stock-movements";

export const transactions = pgTable(
  "transactions",
  {
    transactionId: uuid("transaction_id").primaryKey().default(sql`gen_random_uuid()`),
    memberId: text("member_id"),
    ebsBillingRef: text("ebs_billing_ref"),
    casJournalRef: text("cas_journal_ref"),
    totalAmount: numeric("total_amount", { precision: 14, scale: 4 }).notNull().default("0"),
    status: text("status", {
      enum: ["pending", "billed", "posted", "reconciled", "failed"],
    })
      .notNull()
      .default("pending"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
    // Sprint 6: EBS2000 billing sync
    ebsSyncStatus: text("ebs_sync_status", {
      enum: ["pending", "synced", "failed"],
    })
      .notNull()
      .default("pending"),
    ebsSyncAttempts: integer("ebs_sync_attempts").notNull().default(0),
    lastEbsAttemptAt: timestamp("last_ebs_attempt_at", { withTimezone: true }),
    movementId: uuid("movement_id").references(() => stockMovements.movementId),
  },
  (table) => [
    index("transactions_member_idx").on(table.memberId),
    index("transactions_status_idx").on(table.status),
    index("transactions_ebs_sync_status_idx").on(table.ebsSyncStatus),
    index("transactions_movement_idx").on(table.movementId),
  ]
);
