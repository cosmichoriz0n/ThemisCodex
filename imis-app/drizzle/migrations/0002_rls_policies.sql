-- ============================================================
-- IMIS Migration 0002: RLS Policies
-- All policies use get_user_role() and get_user_id()
-- which read from SET LOCAL session variables set by withRole()
-- ============================================================

-- --------------------------------------------------------
-- profiles
-- --------------------------------------------------------
CREATE POLICY profiles_select ON profiles
  FOR SELECT USING (id = get_user_id() OR get_user_role() = 'system_admin');

CREATE POLICY profiles_insert ON profiles
  FOR INSERT WITH CHECK (get_user_role() = 'system_admin');

CREATE POLICY profiles_update ON profiles
  FOR UPDATE USING (get_user_role() = 'system_admin');

-- No DELETE policy — profiles are deactivated, never deleted

-- --------------------------------------------------------
-- category_codes — all roles read; admin write
-- --------------------------------------------------------
CREATE POLICY category_codes_select ON category_codes
  FOR SELECT USING (TRUE);

CREATE POLICY category_codes_insert ON category_codes
  FOR INSERT WITH CHECK (get_user_role() = 'system_admin');

CREATE POLICY category_codes_update ON category_codes
  FOR UPDATE USING (get_user_role() = 'system_admin');

-- --------------------------------------------------------
-- items — all roles read; manager/admin write
-- --------------------------------------------------------
CREATE POLICY items_select ON items
  FOR SELECT USING (TRUE);

CREATE POLICY items_insert ON items
  FOR INSERT WITH CHECK (get_user_role() IN ('inventory_manager','system_admin'));

CREATE POLICY items_update ON items
  FOR UPDATE USING (get_user_role() IN ('inventory_manager','system_admin'));

-- --------------------------------------------------------
-- item_attributes — same as items
-- --------------------------------------------------------
CREATE POLICY item_attributes_select ON item_attributes
  FOR SELECT USING (TRUE);

CREATE POLICY item_attributes_insert ON item_attributes
  FOR INSERT WITH CHECK (get_user_role() IN ('inventory_manager','system_admin'));

CREATE POLICY item_attributes_update ON item_attributes
  FOR UPDATE USING (get_user_role() IN ('inventory_manager','system_admin'));

-- --------------------------------------------------------
-- inventory_stock — all roles read; system write (via API)
-- --------------------------------------------------------
CREATE POLICY inventory_stock_select ON inventory_stock
  FOR SELECT USING (TRUE);

CREATE POLICY inventory_stock_insert ON inventory_stock
  FOR INSERT WITH CHECK (get_user_role() IN ('inventory_staff','inventory_manager','system_admin'));

CREATE POLICY inventory_stock_update ON inventory_stock
  FOR UPDATE USING (get_user_role() IN ('inventory_staff','inventory_manager','system_admin'));

-- --------------------------------------------------------
-- stock_movements — INSERT-ONLY (immutable log)
-- --------------------------------------------------------
CREATE POLICY stock_movements_select ON stock_movements
  FOR SELECT USING (TRUE);

CREATE POLICY stock_movements_insert ON stock_movements
  FOR INSERT WITH CHECK (get_user_role() IN ('inventory_staff','inventory_manager','system_admin'));

-- NO UPDATE or DELETE policies

-- --------------------------------------------------------
-- lifecycle_events — INSERT-ONLY (immutable log)
-- --------------------------------------------------------
CREATE POLICY lifecycle_events_select ON lifecycle_events
  FOR SELECT USING (TRUE);

CREATE POLICY lifecycle_events_insert ON lifecycle_events
  FOR INSERT WITH CHECK (get_user_role() IN ('inventory_staff','inventory_manager','system_admin'));

-- NO UPDATE or DELETE policies

-- --------------------------------------------------------
-- transactions — finance/admin/auditor read; system write
-- --------------------------------------------------------
CREATE POLICY transactions_select ON transactions
  FOR SELECT USING (get_user_role() IN ('finance_officer','system_admin','auditor','inventory_manager','inventory_staff'));

CREATE POLICY transactions_insert ON transactions
  FOR INSERT WITH CHECK (get_user_role() IN ('inventory_staff','inventory_manager','system_admin'));

CREATE POLICY transactions_update ON transactions
  FOR UPDATE USING (get_user_role() IN ('system_admin'));

-- --------------------------------------------------------
-- transaction_items — same as transactions
-- --------------------------------------------------------
CREATE POLICY transaction_items_select ON transaction_items
  FOR SELECT USING (get_user_role() IN ('finance_officer','system_admin','auditor','inventory_manager','inventory_staff'));

CREATE POLICY transaction_items_insert ON transaction_items
  FOR INSERT WITH CHECK (get_user_role() IN ('inventory_staff','inventory_manager','system_admin'));

-- --------------------------------------------------------
-- pms_schedules — manager/admin read-write
-- --------------------------------------------------------
CREATE POLICY pms_schedules_select ON pms_schedules
  FOR SELECT USING (get_user_role() IN ('inventory_manager','system_admin','inventory_staff'));

CREATE POLICY pms_schedules_insert ON pms_schedules
  FOR INSERT WITH CHECK (get_user_role() IN ('inventory_manager','system_admin'));

CREATE POLICY pms_schedules_update ON pms_schedules
  FOR UPDATE USING (get_user_role() IN ('inventory_manager','system_admin'));

-- --------------------------------------------------------
-- disposal_records — manager/admin write; immutable after disposed
-- --------------------------------------------------------
CREATE POLICY disposal_records_select ON disposal_records
  FOR SELECT USING (get_user_role() IN ('inventory_manager','system_admin','auditor'));

CREATE POLICY disposal_records_insert ON disposal_records
  FOR INSERT WITH CHECK (get_user_role() IN ('inventory_manager','system_admin'));

CREATE POLICY disposal_records_update ON disposal_records
  FOR UPDATE USING (
    get_user_role() IN ('inventory_manager','system_admin')
    AND status != 'disposed'
  );

-- --------------------------------------------------------
-- members — all roles read; system write (MIMS sync)
-- --------------------------------------------------------
CREATE POLICY members_select ON members
  FOR SELECT USING (TRUE);

CREATE POLICY members_insert ON members
  FOR INSERT WITH CHECK (get_user_role() = 'system_admin');

CREATE POLICY members_update ON members
  FOR UPDATE USING (get_user_role() = 'system_admin');

-- --------------------------------------------------------
-- reorder_alerts — all roles read; manager/admin resolve
-- --------------------------------------------------------
CREATE POLICY reorder_alerts_select ON reorder_alerts
  FOR SELECT USING (TRUE);

CREATE POLICY reorder_alerts_insert ON reorder_alerts
  FOR INSERT WITH CHECK (get_user_role() IN ('inventory_manager','system_admin'));

CREATE POLICY reorder_alerts_update ON reorder_alerts
  FOR UPDATE USING (get_user_role() IN ('inventory_manager','system_admin'));

-- --------------------------------------------------------
-- integration_log — INSERT-ONLY (immutable log)
-- --------------------------------------------------------
CREATE POLICY integration_log_select ON integration_log
  FOR SELECT USING (get_user_role() IN ('finance_officer','system_admin','auditor'));

CREATE POLICY integration_log_insert ON integration_log
  FOR INSERT WITH CHECK (TRUE); -- system inserts; role check in app layer

-- NO UPDATE or DELETE policies

-- --------------------------------------------------------
-- audit_log — INSERT-ONLY (immutable log)
-- --------------------------------------------------------
CREATE POLICY audit_log_select ON audit_log
  FOR SELECT USING (get_user_role() IN ('system_admin','auditor'));

CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT WITH CHECK (TRUE); -- every authenticated action inserts

-- NO UPDATE or DELETE policies
