import { pgTable, uuid, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { items } from "./items";

export const inventoryStock = pgTable(
  "inventory_stock",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.itemId, { onDelete: "cascade" }),
    location: text("location").notNull().default("main_warehouse"),
    qtyOnHand: integer("qty_on_hand").notNull().default(0),
    qtyReserved: integer("qty_reserved").notNull().default(0),
    reorderLevel: integer("reorder_level").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [uniqueIndex("inventory_stock_item_location_idx").on(table.itemId, table.location)]
);
