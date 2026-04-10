import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { items } from "./items";

export const itemAttributes = pgTable(
  "item_attributes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.itemId, { onDelete: "cascade" }),
    attributeName: text("attribute_name").notNull(),
    attributeValue: text("attribute_value"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    index("item_attributes_item_idx").on(table.itemId),
    uniqueIndex("item_attributes_item_attr_unique").on(table.itemId, table.attributeName),
  ]
);
