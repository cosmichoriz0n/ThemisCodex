import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { items } from "./items";

export const disposalRecords = pgTable(
  "disposal_records",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.itemId),
    disposalType: text("disposal_type", {
      enum: ["condemned", "scrap_sale", "donated", "transferred"],
    }).notNull(),
    status: text("status", {
      enum: ["requested", "under_inspection", "authorized", "disposed"],
    })
      .notNull()
      .default("requested"),
    authorizationNo: text("authorization_no"),
    requestedBy: text("requested_by").notNull(),
    authorizedBy: text("authorized_by"),
    remarks: text("remarks"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [index("disposal_records_item_idx").on(table.itemId)]
);
