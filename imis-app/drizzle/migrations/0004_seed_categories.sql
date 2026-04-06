-- ============================================================
-- IMIS Migration 0004: Seed 13 Asset Category Codes
-- Source: IMIS Master Document v4.1, Section 2
-- ============================================================

INSERT INTO category_codes (code, name, is_consumable, nea_account_code, description) VALUES
  ('LM',   'Line Materials',                   FALSE, '154',      'Conductors, cables, poles, crossarms, and related line construction materials'),
  ('TE',   'Tools and Equipment',               FALSE, '163',      'Hand tools, power tools, metering equipment, and field service tools'),
  ('FF',   'Furniture and Fixtures',            FALSE, '391',      'Office furniture, storage units, and building fixtures'),
  ('OS',   'Office Supplies',                   TRUE,  NULL,       'Consumable office and administrative supplies'),
  ('MP',   'Motor Pool Equipment and Supplies', FALSE, '392',      'Service vehicles, trucks, and motor pool equipment'),
  ('HW',   'House Wiring Materials',            TRUE,  '154',      'Residential wiring materials for service connections'),
  ('SE',   'Special Equipment',                 FALSE, '163',      'Calibrated instruments, testing equipment requiring NTC/calibration certs'),
  ('UPIS', 'Utility Plant in Service',          FALSE, '101-199',  'Capital utility plant assets per NEA USOA accounts 101-199'),
  ('MS',   'Medical Supplies and Equipment',    TRUE,  NULL,       'First-aid supplies, medicines, and medical equipment with DOH classification'),
  ('TR',   'Transportation Equipment',          FALSE, '392',      'Registered vehicles — plate, OR/CR, insurance, chassis and engine tracking'),
  ('CE',   'Communication Equipment',           FALSE, '163',      'Radios, repeaters, and licensed communication devices with NTC license tracking'),
  ('BM',   'Building Repair Materials',         TRUE,  NULL,       'Construction and repair materials for cooperative buildings and facilities'),
  ('IT',   'IT Equipment and Software',         FALSE, '391',      'Computers, servers, networking equipment, and software licenses')
ON CONFLICT (code) DO NOTHING;
