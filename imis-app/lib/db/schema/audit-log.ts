import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id").notNull(),
    userRole: text("user_role").notNull(),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
    resourceId: text("resource_id"),
    details: jsonb("details"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    index("audit_log_user_idx").on(table.userId),
    index("audit_log_created_idx").on(table.createdAt),
    index("audit_log_resource_idx").on(table.resource),
  ]
);
