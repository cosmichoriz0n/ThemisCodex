# Sprint 9 Validation Checks
## IMIS — Reports, Charts, Signed Downloads
### Run before marking Sprint 9 complete

---

## How to Use This File

Work through each section top-to-bottom. Each check has:
- **What to test** — the specific scenario
- **How** — the exact curl command, SQL, or UI step
- **Expected result** — what pass looks like
- **[ ]** — checkbox to tick when confirmed

Fail = do not proceed. Fix the issue, then re-run the check.

---

## 0. Pre-flight

```bash
# Confirm build passes before running any checks
cd imis-app && npm run build
```

- [ ] `npm run build` exits with code 0, zero TypeScript errors
- [ ] No import errors referencing `lib/reports/` files that don't exist
- [ ] No `recharts` import errors (confirm `npm install recharts` ran successfully)

---

## 1. CSV Injection Prevention (sanitizeCell)

These checks validate the `sanitizeCell()` function in `lib/reports/sanitize.ts`.

### 1.1 Unit-level checks (manual code review)

Open `lib/reports/sanitize.ts` and confirm:

- [ ] String starting with `=` → output is `'=...` (single-quote prefix)
- [ ] String starting with `+` → output is `'+...`
- [ ] String starting with `-` → output is `'-...`
- [ ] String starting with `@` → output is `'@...`
- [ ] String with `<script>alert(1)</script>` → HTML stripped, output is plain text only
- [ ] String with leading/trailing whitespace → trimmed
- [ ] Non-string input (`null`, `undefined`, `number`) → converted to string without crash
- [ ] Normal string like `LM-2026-001234` → unchanged

### 1.2 End-to-end CSV download check

```bash
# Obtain a valid inventory_manager token first (use your login flow)
# TOKEN=<Firebase ID token>

curl -s -X POST http://localhost:3000/api/reports \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"report_type":"current_stock","format":"csv","params":{}}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['signed_url'])"
```

Then download the CSV from the signed URL and open in a text editor:

- [ ] No cell in the CSV output starts with `=`, `+`, `-`, or `@` without a single-quote prefix
- [ ] CSV has UTF-8 BOM as first 3 bytes (`EF BB BF` in hex)
- [ ] First row is a header row with column names
- [ ] If any test item name in the DB starts with `=FORMULA`, confirm it appears as `'=FORMULA` in the CSV

---

## 2. Report API — Authentication and Authorization

### 2.1 No token → 401

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/reports \
  -H "Content-Type: application/json" \
  -d '{"report_type":"current_stock","format":"csv","params":{}}'
```

- [ ] Returns `401`

### 2.2 Invalid/expired token → 401

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/reports \
  -H "Authorization: Bearer eyJthisisafaketoken" \
  -H "Content-Type: application/json" \
  -d '{"report_type":"current_stock","format":"csv","params":{}}'
```

- [ ] Returns `401`

### 2.3 inventory_staff → 403 on ALL report types

Using an `inventory_staff` token:

```bash
for RTYPE in current_stock movement_history lifecycle_status consumption_by_member \
  upis_depreciation pms_due expiry_tracking inventory_valuation \
  billing_reconciliation accounting_reconciliation physical_count_variance disposal_summary; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/reports \
    -H "Authorization: Bearer $STAFF_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"report_type\":\"$RTYPE\",\"format\":\"csv\",\"params\":{}}")
  echo "$RTYPE -> $CODE"
done
```

- [ ] All 12 report types return `403` for `inventory_staff`

### 2.4 finance_officer → 403 on operational reports

Using a `finance_officer` token, test these operational reports (should be forbidden):

```bash
for RTYPE in current_stock movement_history lifecycle_status pms_due expiry_tracking physical_count_variance; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/reports \
    -H "Authorization: Bearer $FINANCE_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"report_type\":\"$RTYPE\",\"format\":\"csv\",\"params\":{}}")
  echo "$RTYPE -> $CODE"
done
```

- [ ] `current_stock` → 403
- [ ] `movement_history` → 403
- [ ] `lifecycle_status` → 403
- [ ] `pms_due` → 403
- [ ] `expiry_tracking` → 403
- [ ] `physical_count_variance` → 403

And finance_officer CAN access:

```bash
for RTYPE in upis_depreciation inventory_valuation billing_reconciliation accounting_reconciliation disposal_summary; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/reports \
    -H "Authorization: Bearer $FINANCE_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"report_type\":\"$RTYPE\",\"format\":\"csv\",\"params\":{}}")
  echo "$RTYPE -> $CODE"
done
```

- [ ] All 5 return `200`

### 2.5 system_admin → 200 on ALL 12 reports

```bash
for RTYPE in current_stock movement_history lifecycle_status consumption_by_member \
  upis_depreciation pms_due expiry_tracking inventory_valuation \
  billing_reconciliation accounting_reconciliation physical_count_variance disposal_summary; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/reports \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"report_type\":\"$RTYPE\",\"format\":\"csv\",\"params\":{}}")
  echo "$RTYPE -> $CODE"
done
```

- [ ] All 12 return `200`

### 2.6 auditor → 200 on ALL 12 reports

- [ ] Repeat above loop with `$AUDITOR_TOKEN` — all 12 return `200`

---

## 3. Report Content Correctness

Run these after seeding the staging database with known test data.

### 3.1 Report 01 — Current Stock

```bash
curl -s -X POST http://localhost:3000/api/reports \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"report_type":"current_stock","format":"csv","params":{}}' > /tmp/r01.json

SIGNED_URL=$(python3 -c "import json; d=json.load(open('/tmp/r01.json')); print(d['signed_url'])")
curl -s "$SIGNED_URL" > /tmp/report_01_current_stock.csv
```

- [ ] CSV contains at least one row per active item
- [ ] Columns include: item_name, category_code, sku, qty_on_hand, qty_reserved, reorder_status, lifecycle_status
- [ ] Items with `lifecycle_status = 'disposed'` do NOT appear
- [ ] Cross-check: `SELECT COUNT(*) FROM items WHERE lifecycle_status <> 'disposed'` row count matches CSV row count (excluding header)

### 3.2 Report 05 — UPIS Depreciation Schedule

- [ ] Every row in the report corresponds to a `category_code = 'UPIS'` item
- [ ] `net_book_value = acquisition_cost - accumulated_depreciation` is mathematically correct for spot-checked rows
- [ ] `annual_depreciation = acquisition_cost × (depreciation_rate / 100)` is correct for spot-checked rows
- [ ] No non-UPIS items appear in the report

### 3.3 Report 06 — Motor Pool PMS Due

```bash
curl -s -X POST http://localhost:3000/api/reports \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"report_type":"pms_due","format":"csv","params":{"pms_window_days":30}}' > /tmp/r06.json
```

- [ ] Only items with `category_code IN ('MP', 'TR')` appear
- [ ] Only vehicles with `pms_schedules.due_date <= NOW() + 30 days` appear
- [ ] Spot-check: a vehicle due in 45 days does NOT appear in the 30-day window report
- [ ] Spot-check: a vehicle due in 25 days DOES appear in the 30-day window report

### 3.4 Report 08 — Inventory Valuation

- [ ] `total_value = qty_on_hand × unit_cost` is correct per spot-checked item
- [ ] Category subtotals are correct (sum of items in that category)
- [ ] Grand total matches `SELECT SUM(s.qty_on_hand * i.unit_cost) FROM inventory_stock s JOIN items i ON i.item_id = s.item_id WHERE i.lifecycle_status <> 'disposed'`

### 3.5 Report 09 — Billing Reconciliation

- [ ] Each row shows: transaction_ref, transaction_amount, ebs_billing_ref, ebs_sync_status
- [ ] Transactions with `ebs_sync_status = 'synced'` show a billing_ref value
- [ ] Transactions with `ebs_sync_status = 'pending_billing'` show no billing_ref (or NULL)
- [ ] Variance column = transaction_amount - billed_amount (0 for matched, non-zero for mismatches)

### 3.6 Report 11 — Physical Count Variance

- [ ] Each row shows: item_name, location, system_qty, counted_qty, variance
- [ ] `variance = counted_qty - system_qty`
- [ ] Items with variance = 0 can be included (for completeness) or excluded (for action-focus) — confirm chosen behavior is consistent

### 3.7 Report 12 — Disposal Summary

- [ ] Only items with `disposal_records.status = 'disposed'` appear
- [ ] Grouped by disposal_type and category_code
- [ ] `total_written_off` = sum of net_book_value of disposed items

---

## 4. PDF Generation and Signed URL Expiry

### 4.1 PDF generates and is valid

```bash
curl -s -X POST http://localhost:3000/api/reports \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"report_type":"disposal_summary","format":"pdf","params":{}}' > /tmp/pdf_response.json

SIGNED_URL=$(python3 -c "import json; d=json.load(open('/tmp/pdf_response.json')); print(d['signed_url'])")
curl -s "$SIGNED_URL" -o /tmp/test_report.pdf
file /tmp/test_report.pdf
```

- [ ] `file` output confirms it is a PDF document (`PDF document, version 1.x`)
- [ ] PDF opens in a PDF viewer without errors
- [ ] PDF contains: title block (report name, generated_at, generated_by), header row, data rows, footer with page numbers

### 4.2 PDF is NOT returned directly (only via signed URL)

```bash
curl -s -X POST http://localhost:3000/api/reports \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"report_type":"disposal_summary","format":"pdf","params":{}}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); assert 'signed_url' in d; assert 'pdf_data' not in d; print('PASS — no raw PDF in response')"
```

- [ ] Response body contains `signed_url` (a URL string)
- [ ] Response body does NOT contain `pdf_data`, `file`, or any base64 content
- [ ] `storage_path` field is present (for audit reference)
- [ ] `expires_at` field is present (ISO timestamp ~15 min from generation time)

### 4.3 Signed URL expires after 15 minutes

This test requires waiting — schedule for a time when you can leave it running.

```bash
# Step 1: Generate the signed URL
SIGNED_URL=$(curl -s -X POST http://localhost:3000/api/reports \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"report_type":"current_stock","format":"pdf","params":{}}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['signed_url'])")

echo "URL generated. Wait 16 minutes, then run Step 2."
echo $SIGNED_URL

# Step 2 (run manually after 16 minutes):
curl -s -o /dev/null -w "%{http_code}" "$SIGNED_URL"
# Expected: 403 (Firebase Storage signed URL expired)
```

- [ ] Signed URL returns `200` immediately after generation
- [ ] Signed URL returns `403` (or `400`/`401`) when accessed at 16+ minutes after generation
- [ ] Signed URL is NOT a public Firebase Storage URL (must contain `X-Goog-Signature` or `token=` query param)

---

## 5. Audit Log — Every Report Download Logged

```bash
# After generating any report, query audit_log
psql $DATABASE_URL -c "
SELECT user_id, action, resource, details, created_at
FROM audit_log
WHERE action = 'REPORT_DOWNLOAD'
ORDER BY created_at DESC
LIMIT 5;
"
```

- [ ] Every report generation creates exactly one `audit_log` row with `action = 'REPORT_DOWNLOAD'`
- [ ] `user_id` matches the authenticated user's Firebase UID
- [ ] `resource` matches the `report_type` requested
- [ ] `details` JSON includes at minimum: `{ format, params }`
- [ ] `created_at` is populated (not NULL)
- [ ] Generating the same report twice creates two separate audit_log rows (not deduplicated)

---

## 6. Reports UI (Browser)

### 6.1 Reports page renders correctly

Navigate to `/reports` as each role:

- [ ] **inventory_staff:** `/reports` is either hidden from sidebar or shows empty state "No reports available for your role" — no report cards shown
- [ ] **inventory_manager:** 10 report cards visible (all operational reports — NOT billing/accounting reconciliation, NOT movement_history for finance view)
- [ ] **finance_officer:** 5 report cards visible (upis_depreciation, inventory_valuation, billing_reconciliation, accounting_reconciliation, disposal_summary)
- [ ] **system_admin:** All 12 report cards visible
- [ ] **auditor:** All 12 report cards visible

### 6.2 Generate and download flow

As `inventory_manager`:

1. Click "Generate CSV" on "Current Stock" report
2. Wait for generation spinner
3. Signed URL download link appears
4. Click download link → file downloads or opens in browser

- [ ] Spinner shows during generation (no blank UI freeze)
- [ ] On success: download link appears with expiry warning ("Link expires in 15 minutes")
- [ ] Downloaded file is valid CSV
- [ ] On re-visiting the page (after 16 min): download link is gone (or shows "expired, re-generate")

### 6.3 Filter parameters work

For Report 02 (Stock Movement History):

- [ ] Date range filter (date_from / date_to) reduces the result set correctly
- [ ] Category code filter returns only items from that category
- [ ] Movement type filter returns only that movement type
- [ ] Combining filters applies all conditions (AND logic)

---

## 7. Executive Dashboard Charts

### 7.1 Charts render with real data

Navigate to `/dashboard` as `system_admin`:

- [ ] **StockByCategoryChart** renders a bar chart with one bar per category code
- [ ] Bars reflect actual `qty_on_hand` from the database (spot-check LM category total)
- [ ] **AlertsDonutChart** renders with segments — confirm total matches `SELECT COUNT(*) FROM reorder_alerts WHERE status='open'`
- [ ] **MovementTimelineChart** renders last 7 days of movement counts
- [ ] All 3 charts display without JavaScript console errors

### 7.2 Charts render gracefully with no data

Test against a user account with no items in their view:

- [ ] `StockByCategoryChart` with empty data: renders empty state ("No stock data") — no crash
- [ ] `AlertsDonutChart` with zero open alerts: renders "0 Open Alerts" center label — no crash
- [ ] `MovementTimelineChart` with no recent movements: renders flat line or empty state — no crash

### 7.3 Charts are client components (confirm SSR safety)

- [ ] All 3 chart components have `'use client'` directive at top of file
- [ ] Dashboard `page.tsx` (server component) only passes pre-fetched data as props — no recharts import in the server component
- [ ] `npm run build` passes (recharts not imported in server context)

---

## 8. Overall Acceptance Criteria (from Master Document §12.1)

Cross-reference with master document section 12 before marking sprint complete:

- [ ] All 12 reports generate with correct data and export to both CSV and PDF
- [ ] PDF downloads return signed URLs that expire after 15 minutes
- [ ] CSV exports reject cells with `=` prefix (tested with crafted malicious CSV value)
- [ ] Every audit_log entry has user_id, action, resource, and created_at populated
- [ ] All API routes return 401 without Authorization header (recheck `/api/reports`)
- [ ] All API routes return 403 for wrong role (recheck `/api/reports` for inventory_staff)
- [ ] `npm run build` passes with zero errors

---

## 9. Regression Checks (Sprint 1–8 routes must still work)

After adding Sprint 9 code, confirm nothing broke:

```bash
# Check a sample of prior routes still work
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health
# Expected: 200

curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3000/api/dashboard
# Expected: 200

curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3000/api/disposal
# Expected: 200

curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3000/api/upis
# Expected: 200

curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3000/api/pms
# Expected: 200
```

- [ ] `/api/health` → 200
- [ ] `/api/dashboard` → 200
- [ ] `/api/disposal` → 200
- [ ] `/api/upis` → 200
- [ ] `/api/pms` → 200
- [ ] `/api/movements` → 200
- [ ] `/api/transactions` → 200
- [ ] `/api/reconciliation` → 200

---

## Sign-off

| Check | Passed by | Date |
|-------|-----------|------|
| Section 0 — Pre-flight | | |
| Section 1 — CSV Injection Prevention | | |
| Section 2 — Auth/Authorization | | |
| Section 3 — Report Content Correctness | | |
| Section 4 — PDF + Signed URL Expiry | | |
| Section 5 — Audit Log | | |
| Section 6 — Reports UI | | |
| Section 7 — Dashboard Charts | | |
| Section 8 — Master Doc §12 Acceptance Criteria | | |
| Section 9 — Regression | | |

**Sprint 9 is complete when all sections are signed off.**

Next: Sprint 10 — Bulk CSV import, DB indexes, k6 load test (50 VUs), OWASP ZAP scan.
