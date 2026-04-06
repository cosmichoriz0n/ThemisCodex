import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { items } from "./items";

export const lifecycleEvents = pgTable(
  "lifecycle_events",
  {
    eventId: uuid("event_id").primaryKey().default(sql`gen_random_uuid()`),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.itemId),
    fromState: text("from_state"),
    toState: text("to_state", {
      enum: ["acquired", "in_stock", "in_service", "under_repair", "returned", "disposed"],
    }).notNull(),
    authorizedBy: text("authorized_by").notNull(),
    remarks: text("remarks"),
    eventAt: timestamp("event_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [index("lifecycle_events_item_idx").on(table.itemId)]
);
