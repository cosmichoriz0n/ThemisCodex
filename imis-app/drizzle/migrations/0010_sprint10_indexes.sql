-- Sprint 10: Performance indexes for high-traffic query paths
--
-- Already present (no-ops): items_category_idx, items_barcode_idx,
-- stock_movements_item_idx, stock_movements_moved_at_idx,
-- transactions_member_idx, transactions_ebs_sync_status_idx,
-- integration_log_system_idx, integration_log_created_idx,
-- item_attributes_item_idx, item_attributes_item_attr_unique.
--
-- New additions below:

-- 1. stock_movements: compound for "all movements for item X, newest first"
CREATE INDEX IF NOT EXISTS stock_movements_item_moved_at_idx
  ON stock_movements (item_id, moved_at DESC);

-- 2. stock_movements: member issuance history (member_id lookups)
CREATE INDEX IF NOT EXISTS stock_movements_member_id_idx
  ON stock_movements (member_id)
  WHERE member_id IS NOT NULL;

-- 3. integration_log: compound for "all logs for system X, newest first"
CREATE INDEX IF NOT EXISTS integration_log_source_created_at_idx
  ON integration_log (source_system, created_at DESC);
