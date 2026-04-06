import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const members = pgTable(
  "members",
  {
    mimsMemberId: text("mims_member_id").primaryKey(),
    fullName: text("full_name").notNull(),
    membershipType: text("membership_type"),
    status: text("status", { enum: ["active", "inactive", "disconnected"] })
      .notNull()
      .default("active"),
    address: text("address"),
    contactNo: text("contact_no"),
    isActive: boolean("is_active").notNull().default(true),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [index("members_status_idx").on(table.status)]
);
