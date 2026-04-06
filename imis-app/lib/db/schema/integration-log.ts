import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const integrationLog = pgTable(
  "integration_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sourceSystem: text("source_system", {
      enum: ["MIMS", "EBS2000", "CAS2000", "INTERNAL"],
    }).notNull(),
    operation: text("operation").notNull(),
    status: text("status", { enum: ["success", "failure", "retry"] }).notNull(),
    payload: jsonb("payload"),
    responseBody: jsonb("response_body"),
    errorMsg: text("error_msg"),
    retryCount: text("retry_count").default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    index("integration_log_system_idx").on(table.sourceSystem),
    index("integration_log_status_idx").on(table.status),
    index("integration_log_created_idx").on(table.createdAt),
  ]
);
