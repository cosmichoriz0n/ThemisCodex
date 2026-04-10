-- Sprint 8: Align disposal_type enum, add Transportation alert types

-- ─── 1. disposal_records.disposal_type ────────────────────────────────────────
-- Master doc requires: condemned | scrap_sale | donated | transferred
-- Previous values:     auction | condemnation | donation | write_off
-- Drop old inline CHECK (auto-named) and add new one.

DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'disposal_records'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%disposal_type%';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE disposal_records DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE disposal_records
  ADD CONSTRAINT disposal_records_disposal_type_check
  CHECK (disposal_type IN ('condemned','scrap_sale','donated','transferred'));

-- ─── 2. reorder_alerts.alert_type ────────────────────────────────────────────
-- Add Transportation alert types: lto_renewal | insurance_expiry | emission_due

DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'reorder_alerts'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%alert_type%';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE reorder_alerts DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE reorder_alerts
  ADD CONSTRAINT reorder_alerts_alert_type_check
  CHECK (alert_type IN (
    'low_stock','expiry','pms_due','license_expiry','calibration_due',
    'lto_renewal','insurance_expiry','emission_due'
  ));
