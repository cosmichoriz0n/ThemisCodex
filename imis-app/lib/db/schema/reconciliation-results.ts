import { pgTable, uuid, date, numeric, integer, text, jsonb, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const reconciliationResults = pgTable("reconciliation_results", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reconciliationDate: date("reconciliation_date").notNull(),
  imisTotal: numeric("imis_total", { precision: 14, scale: 4 }).notNull().default("0"),
  casTotalDebits: numeric("cas_total_debits", { precision: 14, scale: 4 }).notNull().default("0"),
  variance: numeric("variance", { precision: 14, scale: 4 }).notNull().default("0"),
  matchedCount: integer("matched_count").notNull().default(0),
  unmatchedCount: integer("unmatched_count").notNull().default(0),
  status: text("status", { enum: ["matched", "variance", "pending"] })
    .notNull()
    .default("pending"),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
},
(table) => [
  uniqueIndex("reconciliation_results_date_unique").on(table.reconciliationDate),
  index("reconciliation_results_date_idx").on(table.reconciliationDate),
  index("reconciliation_results_status_idx").on(table.status),
]);
