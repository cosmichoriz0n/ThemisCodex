-- ============================================================
-- IMIS Migration 0005: process_stock_movement() RPC
-- Sprint 3 — atomic stock movement + lifecycle state machine
-- ============================================================

-- --------------------------------------------------------
-- process_stock_movement()
--
-- Atomically:
--   1. Validates movement type, quantity, item state
--   2. Enforces over-issuance guard (manager_override opt-in)
--   3. Validates lifecycle state transition
--   4. Inserts stock_movement record
--   5. Updates inventory_stock qty
--   6. Records lifecycle_event if state changed
--   7. Updates items.lifecycle_status
--   8. Creates reorder_alert if qty drops to/below reorder_level
--
-- Returns JSONB:
--   { ok, movement_id, new_qty, new_status,
--     reorder_triggered, manager_override_used }
--   or { ok: false, error: TEXT, ... }
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION process_stock_movement(
  p_item_id          UUID,
  p_movement_type    TEXT,
  p_quantity         INTEGER,
  p_from_location    TEXT    DEFAULT 'main_warehouse',
  p_to_location      TEXT    DEFAULT NULL,
  p_member_id        TEXT    DEFAULT NULL,
  p_reference_no     TEXT    DEFAULT NULL,
  p_remarks          TEXT    DEFAULT NULL,
  p_moved_by         TEXT    DEFAULT NULL,
  p_moved_by_role    TEXT    DEFAULT NULL,
  p_unit_cost        NUMERIC DEFAULT NULL,
  p_manager_override BOOLEAN DEFAULT FALSE,
  p_override_reason  TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_item              RECORD;
  v_stock             RECORD;
  v_new_status        TEXT;
  v_movement_id       UUID;
  v_new_qty           INTEGER;
  v_reorder_triggered BOOLEAN := FALSE;
  v_override_applied  BOOLEAN := FALSE;
  v_effective_moved_by TEXT;
  v_remarks_stored    TEXT;
BEGIN
  -- 1. Validate movement type
  IF p_movement_type NOT IN ('receive','issue','return','adjust','transfer','dispose') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'INVALID_MOVEMENT_TYPE');
  END IF;

  -- 2. For non-adjust types qty must be > 0
  IF p_movement_type <> 'adjust' AND p_quantity <= 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'QUANTITY_MUST_BE_POSITIVE');
  END IF;

  -- 3. Resolve moved_by
  v_effective_moved_by := COALESCE(
    p_moved_by,
    NULLIF(current_setting('app.user_id', TRUE), '')
  );

  -- 4. Lock and fetch item
  SELECT * INTO v_item
  FROM items
  WHERE item_id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'ITEM_NOT_FOUND');
  END IF;

  -- 5. Disposed items cannot receive further movements (except adjust for corrections)
  IF v_item.lifecycle_status = 'disposed' AND p_movement_type NOT IN ('adjust') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'ITEM_IS_DISPOSED');
  END IF;

  -- 6. Fetch and lock stock record for from_location
  SELECT * INTO v_stock
  FROM inventory_stock
  WHERE item_id = p_item_id
    AND location = COALESCE(p_from_location, 'main_warehouse')
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_movement_type = 'receive' THEN
      -- Auto-create stock record for first receive
      INSERT INTO inventory_stock (item_id, location, qty_on_hand, qty_reserved, reorder_level)
      VALUES (p_item_id, COALESCE(p_from_location, 'main_warehouse'), 0, 0, 0)
      RETURNING * INTO v_stock;
    ELSE
      RETURN jsonb_build_object('ok', FALSE, 'error', 'STOCK_RECORD_NOT_FOUND');
    END IF;
  END IF;

  -- 7. Over-issuance guard (issue and dispose reduce stock)
  IF p_movement_type IN ('issue', 'dispose', 'transfer')
     AND v_stock.qty_on_hand < p_quantity THEN
    IF NOT p_manager_override THEN
      RETURN jsonb_build_object(
        'ok',            FALSE,
        'error',         'INSUFFICIENT_STOCK',
        'qty_on_hand',   v_stock.qty_on_hand,
        'qty_requested', p_quantity
      );
    END IF;
    v_override_applied := TRUE;
  END IF;

  -- 8. Lifecycle state machine — determine new status
  v_new_status := v_item.lifecycle_status;

  CASE p_movement_type
    WHEN 'receive' THEN
      IF v_item.lifecycle_status IN ('acquired', 'returned') THEN
        v_new_status := 'in_stock';
      END IF;

    WHEN 'issue' THEN
      IF v_item.lifecycle_status <> 'in_stock' THEN
        RETURN jsonb_build_object(
          'ok',             FALSE,
          'error',          'INVALID_STATE_TRANSITION',
          'current_status', v_item.lifecycle_status,
          'hint',           'Item must be in_stock to issue'
        );
      END IF;
      v_new_status := 'in_service';

    WHEN 'return' THEN
      CASE v_item.lifecycle_status
        WHEN 'in_service'   THEN v_new_status := 'under_repair';
        WHEN 'under_repair' THEN v_new_status := 'returned';
        WHEN 'returned'     THEN v_new_status := 'in_stock';
        ELSE
          RETURN jsonb_build_object(
            'ok',             FALSE,
            'error',          'INVALID_STATE_TRANSITION',
            'current_status', v_item.lifecycle_status
          );
      END CASE;

    WHEN 'dispose' THEN
      v_new_status := 'disposed';

    WHEN 'adjust', 'transfer' THEN
      NULL; -- no state change

  END CASE;

  -- 9. Calculate new quantity for from_location
  CASE p_movement_type
    WHEN 'receive', 'return' THEN
      v_new_qty := v_stock.qty_on_hand + p_quantity;
    WHEN 'issue', 'dispose' THEN
      v_new_qty := GREATEST(0, v_stock.qty_on_hand - p_quantity);
    WHEN 'adjust' THEN
      -- p_quantity is signed: positive = add, negative = subtract
      v_new_qty := GREATEST(0, v_stock.qty_on_hand + p_quantity);
    WHEN 'transfer' THEN
      v_new_qty := GREATEST(0, v_stock.qty_on_hand - p_quantity);
    ELSE
      v_new_qty := v_stock.qty_on_hand;
  END CASE;

  -- 10. Build remarks (prepend override notice if applicable)
  IF v_override_applied THEN
    v_remarks_stored := '[MANAGER_OVERRIDE: '
      || COALESCE(p_override_reason, 'no reason given')
      || '] '
      || COALESCE(p_remarks, '');
  ELSE
    v_remarks_stored := p_remarks;
  END IF;

  -- 11. Insert stock movement record
  INSERT INTO stock_movements (
    item_id, movement_type, quantity, unit_cost,
    from_location, to_location, member_id,
    reference_no, remarks, moved_by
  ) VALUES (
    p_item_id, p_movement_type, p_quantity, p_unit_cost,
    p_from_location, p_to_location, p_member_id,
    p_reference_no, v_remarks_stored, v_effective_moved_by
  )
  RETURNING movement_id INTO v_movement_id;

  -- 12. Record lifecycle event and update item status (if state changed)
  IF v_new_status <> v_item.lifecycle_status THEN
    INSERT INTO lifecycle_events (item_id, from_state, to_state, authorized_by, remarks)
    VALUES (
      p_item_id,
      v_item.lifecycle_status,
      v_new_status,
      v_effective_moved_by,
      p_remarks
    );

    UPDATE items
    SET lifecycle_status = v_new_status,
        updated_at       = now()
    WHERE item_id = p_item_id;
  END IF;

  -- 13. Update inventory_stock for from_location
  UPDATE inventory_stock
  SET qty_on_hand = v_new_qty,
      updated_at  = now()
  WHERE item_id = p_item_id
    AND location = COALESCE(p_from_location, 'main_warehouse');

  -- 14. For transfer: upsert destination location stock
  IF p_movement_type = 'transfer' AND p_to_location IS NOT NULL THEN
    INSERT INTO inventory_stock (item_id, location, qty_on_hand, qty_reserved, reorder_level)
    VALUES (p_item_id, p_to_location, p_quantity, 0, 0)
    ON CONFLICT (item_id, location)
    DO UPDATE SET
      qty_on_hand = inventory_stock.qty_on_hand + p_quantity,
      updated_at  = now();
  END IF;

  -- 15. Check reorder level — create alert if stock dropped to/below threshold
  IF p_movement_type IN ('issue', 'dispose', 'transfer', 'adjust')
     AND v_new_qty <= v_stock.reorder_level
     AND v_stock.reorder_level > 0 THEN
    IF NOT EXISTS (
      SELECT 1 FROM reorder_alerts
      WHERE item_id = p_item_id
        AND alert_type = 'low_stock'
        AND status = 'open'
    ) THEN
      INSERT INTO reorder_alerts (item_id, alert_type, status, details)
      VALUES (
        p_item_id,
        'low_stock',
        'open',
        'Stock dropped to ' || v_new_qty
          || ' (reorder level: ' || v_stock.reorder_level || ')'
      );
      v_reorder_triggered := TRUE;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok',                   TRUE,
    'movement_id',          v_movement_id,
    'new_qty',              v_new_qty,
    'new_status',           v_new_status,
    'reorder_triggered',    v_reorder_triggered,
    'manager_override_used', v_override_applied
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', SQLERRM);
END;
$$;

-- --------------------------------------------------------
-- Add updated_at trigger to inventory_stock (missed in 0003)
-- --------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_updated_at'
      AND tgrelid = 'inventory_stock'::regclass
  ) THEN
    CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON inventory_stock
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;
