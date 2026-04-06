import { pgTable, uuid, text, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { categoryCodes } from "./category-codes";

export const items = pgTable(
  "items",
  {
    itemId: uuid("item_id").primaryKey().default(sql`gen_random_uuid()`),
    categoryCode: varchar("category_code", { length: 10 })
      .notNull()
      .references(() => categoryCodes.code),
    itemName: text("item_name").notNull(),
    sku: varchar("sku", { length: 100 }),
    barcode: varchar("barcode", { length: 100 }),
    assetTag: varchar("asset_tag", { length: 50 }),
    lifecycleStatus: text("lifecycle_status", {
      enum: ["acquired", "in_stock", "in_service", "under_repair", "returned", "disposed"],
    })
      .notNull()
      .default("acquired"),
    location: text("location"),
    description: text("description"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    index("items_category_idx").on(table.categoryCode),
    index("items_barcode_idx").on(table.barcode),
    index("items_asset_tag_idx").on(table.assetTag),
  ]
);
