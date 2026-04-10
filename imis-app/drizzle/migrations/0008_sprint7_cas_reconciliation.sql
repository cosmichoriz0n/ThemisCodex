-- Sprint 7: CAS2000 journal sync fields on transactions + reconciliation_results table

-- 1. CAS2000 sync columns on transactions
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS cas_sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (cas_sync_status IN ('pending', 'synced', 'failed')),
  ADD COLUMN IF NOT EXISTS cas_sync_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_cas_attempt_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS transactions_cas_sync_status_idx
  ON transactions(cas_sync_status);

-- 2. Unique constraint on item_attributes(item_id, attribute_name) — required for UPIS depreciation upsert
ALTER TABLE item_attributes
  ADD CONSTRAINT IF NOT EXISTS item_attributes_item_attr_unique UNIQUE (item_id, attribute_name);

-- 3. Nightly reconciliation results table (INSERT-only via RLS, like audit_log)
CREATE TABLE IF NOT EXISTS reconciliation_results (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_date DATE NOT NULL,
  imis_total          NUMERIC(14,4) NOT NULL DEFAULT 0,
  cas_total_debits    NUMERIC(14,4) NOT NULL DEFAULT 0,
  variance            NUMERIC(14,4) NOT NULL DEFAULT 0,
  matched_count       INTEGER NOT NULL DEFAULT 0,
  unmatched_count     INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('matched', 'variance', 'pending')),
  details             JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reconciliation_results_date_unique UNIQUE (reconciliation_date)
);

CREATE INDEX IF NOT EXISTS reconciliation_results_date_idx
  ON reconciliation_results(reconciliation_date DESC);

CREATE INDEX IF NOT EXISTS reconciliation_results_status_idx
  ON reconciliation_results(status);

-- 3. RLS
ALTER TABLE reconciliation_results ENABLE ROW LEVEL SECURITY;

-- finance_officer, inventory_manager, system_admin, auditor can read
CREATE POLICY reconciliation_results_select ON reconciliation_results
  FOR SELECT
  USING (
    get_user_role() IN ('finance_officer', 'inventory_manager', 'system_admin', 'auditor')
  );

-- n8n system (system_admin role) can insert/update
CREATE POLICY reconciliation_results_insert ON reconciliation_results
  FOR INSERT
  WITH CHECK (get_user_role() = 'system_admin');

CREATE POLICY reconciliation_results_update ON reconciliation_results
  FOR UPDATE
  USING (get_user_role() = 'system_admin');
