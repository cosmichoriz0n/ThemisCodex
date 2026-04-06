import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { items } from "./items";

export const pmsSchedules = pgTable(
  "pms_schedules",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.itemId, { onDelete: "cascade" }),
    pmsType: text("pms_type").notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    dueMileage: integer("due_mileage"),
    lastDoneAt: timestamp("last_done_at", { withTimezone: true }),
    lastMileage: integer("last_mileage"),
    status: text("status", { enum: ["pending", "completed", "overdue"] })
      .notNull()
      .default("pending"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [index("pms_schedules_item_idx").on(table.itemId)]
);
