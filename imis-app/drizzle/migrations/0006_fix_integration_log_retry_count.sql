-- Migration: fix integration_log.retry_count from text to integer
-- The column was incorrectly declared as text, which breaks numeric comparisons.
ALTER TABLE integration_log
  ALTER COLUMN retry_count TYPE integer
  USING COALESCE(NULLIF(retry_count, '')::integer, 0);

ALTER TABLE integration_log
  ALTER COLUMN retry_count SET DEFAULT 0;
