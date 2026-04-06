-- ============================================================
-- IMIS Migration 0001: Initial Schema
-- All 15 tables with RLS enabled immediately after creation
-- ============================================================

-- --------------------------------------------------------
-- 1. profiles — User accounts + RBAC roles (Firebase UIDs)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id               TEXT PRIMARY KEY,
  role             TEXT NOT NULL CHECK (role IN ('inventory_staff','inventory_manager','finance_officer','system_admin','auditor')),
  full_name        TEXT NOT NULL,
  email            TEXT NOT NULL,
  cooperative_id   TEXT NOT NULL DEFAULT 'SAMELCO',
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------
-- 2. category_codes — 13 asset category reference data
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS category_codes (
  code             VARCHAR(10) PRIMARY KEY,
  name             TEXT NOT NULL,
  is_consumable    BOOLEAN NOT NULL DEFAULT FALSE,
  nea_account_code VARCHAR(20),
  description      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE category_codes ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------
-- 3. items — Master item catalog for all 13 categories
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS items (
  item_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_code    VARCHAR(10) NOT NULL REFERENCES category_codes(code),
  item_name        TEXT NOT NULL,
  sku              VARCHAR(100),
  barcode          VARCHAR(100),
  asset_tag        VARCHAR(50),
  lifecycle_status TEXT NOT NULL DEFAULT 'acquired'
                     CHECK (lifecycle_status IN ('acquired','in_stock','in_service','under_repair','returned','disposed')),
  location         TEXT,
  description      TEXT,
  created_by       TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS items_category_idx  ON items(category_code);
CREATE INDEX IF NOT EXISTS items_barcode_idx   ON items(barcode);
CREATE INDEX IF NOT EXISTS items_asset_tag_idx ON items(asset_tag);
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------
-- 4. item_attributes — Category-specific EAV fields
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS item_attributes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id          UUID NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
  attribute_name   TEXT NOT NULL,
  attribute_value  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS item_attributes_item_idx ON item_attributes(item_id);
ALTER TABLE item_attributes ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------
-- 5. inventory_stock — Current qty per item per location
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_stock (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        UUID NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
  location       TEXT NOT NULL DEFAULT 'main_warehouse',
  qty_on_hand    INTEGER NOT NULL DEFAULT 0,
  qty_reserved   INTEGER NOT NULL DEFAULT 0,
  reorder_level  INTEGER NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(item_id, location)
);
ALTER TABLE inventory_stock ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------
-- 6. stock_movements — IMMUTABLE movement log (INSERT-ONLY)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_movements (
  movement_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        UUID NOT NULL REFERENCES items(item_id),
  movement_type  TEXT NOT NULL CHECK (movement_type IN ('receive','issue','return','adjust','transfer','dispose')),
  quantity       INTEGER NOT NULL,
  unit_cost      NUMERIC(12,4),
  from_location  TEXT,
  to_location    TEXT,
  member_id      TEXT,
  reference_no   TEXT,
  remarks        TEXT,
  moved_by       TEXT NOT NULL,
  moved_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_movements_item_idx     ON stock_movements(item_id);
CREATE INDEX IF NOT EXISTS stock_movements_moved_at_idx ON stock_movements(moved_at);
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------
-- 7. lifecycle_events — IMMUTABLE state audit trail (INSERT-ONLY)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS lifecycle_events (
  event_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        UUID NOT NULL REFERENCES items(item_id),
  from_state     TEXT,
  to_state       TEXT NOT NULL CHECK (to_state IN ('acquired','in_stock','in_service','under_repair','returned','disposed')),
  authorized_by  TEXT NOT NULL,
  remarks        TEXT,
  event_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lifecycle_events_item_idx ON lifecycle_events(item_id);
ALTER TABLE lifecycle_events ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------
-- 8. transactions — Master billing/accounting records
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  transaction_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       TEXT,
  ebs_billing_ref TEXT,
  cas_journal_ref TEXT,
  total_amount    NUMERIC(14,4) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','billed','posted','reconciled','failed')),
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transactions_member_idx ON transactions(member_id);
CREATE INDEX IF NOT EXISTS transactions_status_idx ON transactions(status);
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------
-- 9. transaction_items — Line items per transaction
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS transaction_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID NOT NULL REFERENCES transactions(transaction_id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES items(item_id),
  quantity        INTEGER NOT NULL,
  unit_price      NUMERIC(12,4) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transaction_items_transaction_idx ON transaction_items(transaction_id);
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------
-- 10. pms_schedules — Preventive maintenance schedules
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS pms_schedules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        UUID NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
  pms_type       TEXT NOT NULL,
  due_date       TIMESTAMPTZ,
  due_mileage    INTEGER,
  last_done_at   TIMESTAMPTZ,
  last_mileage   INTEGER,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','overdue')),
  created_by     TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pms_schedules_item_idx ON pms_schedules(item_id);
ALTER TABLE pms_schedules ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------
-- 11. disposal_records — Asset disposal authorization
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS disposal_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id          UUID NOT NULL REFERENCES items(item_id),
  disposal_type    TEXT NOT NULL CHECK (disposal_type IN ('auction','condemnation','donation','write_off')),
  status           TEXT NOT NULL DEFAULT 'requested'
                     CHECK (status IN ('requested','under_inspection','authorized','disposed')),
  authorization_no TEXT,
  requested_by     TEXT NOT NULL,
  authorized_by    TEXT,
  remarks          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS disposal_records_item_idx ON disposal_records(item_id);
ALTER TABLE disposal_records ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------
-- 12. members — Cached MIMS member data
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS members (
  mims_member_id  TEXT PRIMARY KEY,
  full_name       TEXT NOT NULL,
  membership_type TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','disconnected')),
  address         TEXT,
  contact_no      TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_sync_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS members_status_idx ON members(status);
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------
-- 13. reorder_alerts — Low-stock and lifecycle alerts
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS reorder_alerts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        UUID NOT NULL REFERENCES items(item_id),
  alert_type     TEXT NOT NULL CHECK (alert_type IN ('low_stock','expiry','pms_due','license_expiry','calibration_due')),
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  triggered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at    TIMESTAMPTZ,
  resolved_by    TEXT,
  details        TEXT
);
CREATE INDEX IF NOT EXISTS reorder_alerts_item_idx   ON reorder_alerts(item_id);
CREATE INDEX IF NOT EXISTS reorder_alerts_status_idx ON reorder_alerts(status);
ALTER TABLE reorder_alerts ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------
-- 14. integration_log — IMMUTABLE external API audit trail (INSERT-ONLY)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS integration_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system   TEXT NOT NULL CHECK (source_system IN ('MIMS','EBS2000','CAS2000','INTERNAL')),
  operation       TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('success','failure','retry')),
  payload         JSONB,
  response_body   JSONB,
  error_msg       TEXT,
  retry_count     INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_log_system_idx  ON integration_log(source_system);
CREATE INDEX IF NOT EXISTS integration_log_status_idx  ON integration_log(status);
CREATE INDEX IF NOT EXISTS integration_log_created_idx ON integration_log(created_at);
ALTER TABLE integration_log ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------
-- 15. audit_log — IMMUTABLE user action audit trail (INSERT-ONLY)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL,
  user_role    TEXT NOT NULL,
  action       TEXT NOT NULL,
  resource     TEXT NOT NULL,
  resource_id  TEXT,
  details      JSONB,
  ip_address   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_user_idx     ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS audit_log_created_idx  ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS audit_log_resource_idx ON audit_log(resource);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
