import { pgTable, uuid, text, integer, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { items } from "./items";

export const stockMovements = pgTable(
  "stock_movements",
  {
    movementId: uuid("movement_id").primaryKey().default(sql`gen_random_uuid()`),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.itemId),
    movementType: text("movement_type", {
      enum: ["receive", "issue", "return", "adjust", "transfer", "dispose"],
    }).notNull(),
    quantity: integer("quantity").notNull(),
    unitCost: numeric("unit_cost", { precision: 12, scale: 4 }),
    fromLocation: text("from_location"),
    toLocation: text("to_location"),
    memberId: text("member_id"),
    referenceNo: text("reference_no"),
    remarks: text("remarks"),
    movedBy: text("moved_by").notNull(),
    movedAt: timestamp("moved_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    index("stock_movements_item_idx").on(table.itemId),
    index("stock_movements_moved_at_idx").on(table.movedAt),
  ]
);
