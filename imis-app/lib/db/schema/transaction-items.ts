import { pgTable, uuid, integer, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { transactions } from "./transactions";
import { items } from "./items";

export const transactionItems = pgTable(
  "transaction_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.transactionId, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.itemId),
    quantity: integer("quantity").notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 4 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [index("transaction_items_transaction_idx").on(table.transactionId)]
);
