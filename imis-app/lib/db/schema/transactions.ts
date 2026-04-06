import { pgTable, uuid, text, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
  },
  (table) => [
    index("transactions_member_idx").on(table.memberId),
    index("transactions_status_idx").on(table.status),
  ]
);
