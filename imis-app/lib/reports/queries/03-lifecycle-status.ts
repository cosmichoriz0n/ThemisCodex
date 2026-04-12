import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { ReportParams, ReportRow } from "../types";
import type { Role } from "@/types/auth";
import { withRole } from "@/lib/db/with-role";
import { items } from "@/lib/db/schema/items";
import { lifecycleEvents } from "@/lib/db/schema/lifecycle-events";

export const HEADERS_03 = [
  "Asset Tag", "SKU", "Item Name", "Category", "Location",
  "Lifecycle Status", "Days in Current State", "Last Transition", "Authorized By",
];

export async function queryLifecycleStatus(
  userId: string,
  role: Role,
  params: ReportParams
): Promise<ReportRow[]> {
  return withRole(userId, role, async (tx) => {
    const conditions = [];
    if (params.category_code) {
      conditions.push(eq(items.categoryCode, params.category_code));
    }

    // Latest lifecycle event per item via lateral/subquery
    const latestEvent = tx
      .selectDistinctOn([lifecycleEvents.itemId], {
        itemId:      lifecycleEvents.itemId,
        toState:     lifecycleEvents.toState,
        authorizedBy: lifecycleEvents.authorizedBy,
        eventAt:     lifecycleEvents.eventAt,
      })
      .from(lifecycleEvents)
      .orderBy(lifecycleEvents.itemId, sql`${lifecycleEvents.eventAt} DESC`)
      .as("latest_event");

    const rows = await tx
      .select({
        assetTag:        items.assetTag,
        sku:             items.sku,
        itemName:        items.itemName,
        categoryCode:    items.categoryCode,
        location:        items.location,
        lifecycleStatus: items.lifecycleStatus,
        daysInState:     sql<number>`
          EXTRACT(EPOCH FROM (NOW() - COALESCE(${latestEvent.eventAt}, ${items.createdAt}))) / 86400.0
        `.mapWith(Number),
        lastTransition:  latestEvent.eventAt,
        authorizedBy:    latestEvent.authorizedBy,
      })
      .from(items)
      .leftJoin(latestEvent, eq(items.itemId, latestEvent.itemId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(items.lifecycleStatus, sql`days_in_state DESC`);

    return rows.map((r) => [
      r.assetTag ?? "",
      r.sku ?? "",
      r.itemName,
      r.categoryCode,
      r.location ?? "",
      r.lifecycleStatus,
      Math.floor(r.daysInState ?? 0),
      r.lastTransition
        ? new Date(r.lastTransition).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })
        : "",
      r.authorizedBy ?? "",
    ]);
  });
}
