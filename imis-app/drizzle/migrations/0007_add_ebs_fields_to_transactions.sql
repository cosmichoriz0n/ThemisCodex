-- Sprint 6: Add EBS2000 billing sync fields to transactions table
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS ebs_sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (ebs_sync_status IN ('pending', 'synced', 'failed')),
  ADD COLUMN IF NOT EXISTS ebs_sync_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_ebs_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS movement_id UUID REFERENCES stock_movements(movement_id);

CREATE INDEX IF NOT EXISTS transactions_ebs_sync_status_idx
  ON transactions(ebs_sync_status);

CREATE INDEX IF NOT EXISTS transactions_movement_idx
  ON transactions(movement_id);
