import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(), // Firebase UID
  role: text("role", {
    enum: ["inventory_staff", "inventory_manager", "finance_officer", "system_admin", "auditor"],
  }).notNull(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  cooperativeId: text("cooperative_id").notNull().default("SAMELCO"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});
