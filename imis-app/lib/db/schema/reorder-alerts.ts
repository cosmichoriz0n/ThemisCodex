import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { items } from "./items";

export const reorderAlerts = pgTable(
  "reorder_alerts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.itemId),
    alertType: text("alert_type", {
      enum: ["low_stock", "expiry", "pms_due", "license_expiry", "calibration_due", "lto_renewal", "insurance_expiry", "emission_due"],
    }).notNull(),
    status: text("status", { enum: ["open", "acknowledged", "resolved"] })
      .notNull()
      .default("open"),
    triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull().default(sql`now()`),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"),
    details: text("details"),
  },
  (table) => [
    index("reorder_alerts_item_idx").on(table.itemId),
    index("reorder_alerts_status_idx").on(table.status),
  ]
);
