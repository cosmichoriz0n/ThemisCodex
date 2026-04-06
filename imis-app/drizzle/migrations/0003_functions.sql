-- ============================================================
-- IMIS Migration 0003: PostgreSQL Helper Functions
-- ============================================================

-- --------------------------------------------------------
-- get_user_role() — reads from SET LOCAL app.user_role
-- Called by all RLS policies to determine current user role
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT current_setting('app.user_role', TRUE)
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- --------------------------------------------------------
-- get_user_id() — reads from SET LOCAL app.user_id
-- Called by RLS policies that need to compare against user's own row
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_id()
RETURNS TEXT AS $$
  SELECT current_setting('app.user_id', TRUE)
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- --------------------------------------------------------
-- updated_at trigger function — auto-update timestamps
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all mutable tables
CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON category_codes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON item_attributes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON pms_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON disposal_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
