import { pgTable, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const categoryCodes = pgTable("category_codes", {
  code: varchar("code", { length: 10 }).primaryKey(),
  name: text("name").notNull(),
  isConsumable: boolean("is_consumable").notNull().default(false),
  neaAccountCode: varchar("nea_account_code", { length: 20 }),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});
