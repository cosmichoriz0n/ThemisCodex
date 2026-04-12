# Sprint 9 Plan — IMIS
## Weeks 17–18 | Goal: 12 Reports, Signed Downloads, Executive Charts, CSV Injection Prevention
### Deliverable: D1 — Feature Complete milestone

---

## Context

Sprint 8 completed: multi-step disposal workflow, UPIS module (depreciation schedule, NBV), Motor Pool PMS full build (maintenance history, work orders, mileage tracker), Transportation alerts (LTO/insurance/emission), write-off to CAS2000.

Sprint 9 closes out D1 (platform development) before Sprint 10 (hardening) and Sprint 11 (UAT). This sprint is the **feature-complete milestone** — after S9 the app is functionally done and only needs load testing, bulk import, and security hardening.

---

## What Already Exists (usable in S9)

| Asset | Location | Notes |
|-------|----------|-------|
| Firebase Storage helper | `lib/storage/index.ts` | `uploadFile`, `getSignedUrl` (15-min expiry), `deleteFile` — already built |
| pdf-lib | `package.json` | Installed, used in barcode label generation |
| withAuth + withRole | `lib/auth/withAuth.ts`, `lib/db/with-role.ts` | All 15 tables accessible via role-aware transactions |
| All 15 DB schemas | `lib/db/schema/` | Full Drizzle schema, all tables including disposal_records, pms_schedules, item_attributes |
| Reconciliation API | `app/api/reconciliation/` | Already built in S7 — reports 09 and 10 can query same data |
| Dashboard API | `app/api/dashboard/` | stockByCategory, alertCounts, recentMovements, integrationHealth |
| physical-count API | `app/api/physical-count/` | Already produces variance data — report 11 queries same logic |

---

## What Is NOT There Yet (Sprint 9 adds)

- No `lib/reports/` module
- No `app/api/reports/` route
- No `app/(dashboard)/reports/` page
- No chart library (recharts to be installed)
- No `components/dashboard/` chart components
- No `components/reports/` components

---

## Sprint 9 Deliverables Breakdown

### Part A — lib/reports/ Module

#### `lib/reports/sanitize.ts`
```
sanitizeCell(value: unknown): string
  - Convert to string
  - Trim whitespace
  - Strip HTML tags (regex)
  - If starts with =, +, -, @: prepend single quote '
  - Returns safe string for CSV cell embedding
```

#### `lib/reports/csv.ts`
```
generateCSV(headers: string[], rows: string[][]): Buffer
  - Joins headers and rows with commas
  - Each cell passed through sanitizeCell()
  - Wraps cells containing commas or newlines in double quotes
  - Returns UTF-8 Buffer with BOM (for Excel compatibility on Windows)
```

#### `lib/reports/pdf.ts`
```
generatePDF(title: string, headers: string[], rows: string[][], meta: ReportMeta): Promise<Buffer>
  - Uses pdf-lib (already installed)
  - A4 landscape, 10pt font, header row shaded
  - Title block: report name, generated_at (PHT), generated_by (user display name), filters applied
  - Footer: "IMIS — Confidential — Page N of M"
  - Returns PDF Buffer
```

#### `lib/reports/storage.ts`
```
uploadReportAndSign(buffer: Buffer, format: 'pdf' | 'csv', reportType: string, userId: string): Promise<{ storagePath: string; signedUrl: string }>
  - Storage path: reports/{userId}/{reportType}/{timestamp}.{ext}
  - Calls uploadFile() from lib/storage/index.ts
  - Calls getSignedUrl() — 15-minute expiry
  - Returns { storagePath, signedUrl }
```

#### `lib/reports/queries/` — 12 query files (one per report type)

| File | Report | Key tables | Drizzle query shape |
|------|--------|------------|---------------------|
| `01-current-stock.ts` | Current Stock | items, inventory_stock, reorder_alerts, category_codes | LEFT JOIN stock, LEFT JOIN open alert, GROUP BY item |
| `02-movement-history.ts` | Stock Movement History | stock_movements, items, members | Filterable: category, item_id, member_id, date range, movement_type |
| `03-lifecycle-status.ts` | Asset Lifecycle Status | items, lifecycle_events | Latest event per item + EXTRACT(EPOCH FROM NOW()-event_at)/86400 as days_in_state |
| `04-consumption-by-member.ts` | Consumption by Member | stock_movements, members, items, transaction_items | issue movements only, GROUP BY member_id, SUM(qty * unit_cost) |
| `05-upis-depreciation.ts` | UPIS Depreciation Schedule | items, item_attributes | nea_asset_code, acquisition_cost, depreciation_rate, accumulated_depreciation, net_book_value per UPIS asset |
| `06-pms-due.ts` | Motor Pool PMS Due | pms_schedules, items | MP + TR categories, due_date within 30/60/90 days, last_done_at |
| `07-expiry-tracking.ts` | Expiry Tracking | items, item_attributes | MS (expiry_date), IT (license_expiry), CE (ntc_expiry), SE (calibration_expiry) — sorted by expiry ASC |
| `08-inventory-valuation.ts` | Inventory Valuation | items, inventory_stock, category_codes | SUM(qty_on_hand × unit_cost) per item, subtotal per category, grand total in PHP |
| `09-billing-reconciliation.ts` | Billing Reconciliation | transactions, integration_log | IMIS transaction total vs EBS2000 billing_ref match — side by side |
| `10-accounting-reconciliation.ts` | Accounting Reconciliation | transactions, integration_log | IMIS total vs CAS2000 journal debits with variance per day |
| `11-physical-count-variance.ts` | Physical Count Variance | physical_count_sessions (or derived), inventory_stock | scanner count vs system qty_on_hand per location, variance = counted - system |
| `12-disposal-summary.ts` | Disposal Summary | disposal_records, items, category_codes | disposed items by disposal_type and category_code, SUM(net_book_value) written off |

#### `lib/reports/generate.ts` — Main orchestrator
```typescript
type ReportType = 'current_stock' | 'movement_history' | 'lifecycle_status' | 'consumption_by_member'
  | 'upis_depreciation' | 'pms_due' | 'expiry_tracking' | 'inventory_valuation'
  | 'billing_reconciliation' | 'accounting_reconciliation' | 'physical_count_variance'
  | 'disposal_summary';

type ReportFormat = 'csv' | 'pdf';

interface ReportParams {
  date_from?: string;       // YYYY-MM-DD
  date_to?: string;
  category_code?: string;
  item_id?: string;
  member_id?: string;
  movement_type?: string;
  location?: string;
  pms_window_days?: 30 | 60 | 90;
}

// Role-based access control per report type
const REPORT_ACCESS: Record<ReportType, Role[]> = {
  current_stock:              ['inventory_manager', 'system_admin', 'auditor'],
  movement_history:           ['inventory_manager', 'system_admin', 'auditor'],
  lifecycle_status:           ['inventory_manager', 'system_admin', 'auditor'],
  consumption_by_member:      ['inventory_manager', 'system_admin', 'auditor'],
  upis_depreciation:          ['inventory_manager', 'finance_officer', 'system_admin', 'auditor'],
  pms_due:                    ['inventory_manager', 'system_admin', 'auditor'],
  expiry_tracking:            ['inventory_manager', 'system_admin', 'auditor'],
  inventory_valuation:        ['inventory_manager', 'finance_officer', 'system_admin', 'auditor'],
  billing_reconciliation:     ['finance_officer', 'system_admin', 'auditor'],
  accounting_reconciliation:  ['finance_officer', 'system_admin', 'auditor'],
  physical_count_variance:    ['inventory_manager', 'system_admin', 'auditor'],
  disposal_summary:           ['inventory_manager', 'finance_officer', 'system_admin', 'auditor'],
};

async function generateReport(
  reportType: ReportType,
  format: ReportFormat,
  params: ReportParams,
  user: AuthUser,
  role: Role
): Promise<{ signedUrl: string; storagePath: string; expiresAt: string }>
```

---

### Part B — API Route

#### `app/api/reports/route.ts`
```
POST /api/reports
Body: { report_type, format, params }
Roles: per REPORT_ACCESS map (403 if not authorized for that report type)
Flow:
  1. withAuth() checks Firebase JWT
  2. Role check against REPORT_ACCESS[report_type]
  3. Validate params with Zod (date formats, enums)
  4. Call generateReport(type, format, params, user, role)
  5. Insert to audit_log: { action: 'REPORT_DOWNLOAD', resource: report_type, details: { format, params } }
  6. Return { signed_url, storage_path, expires_at, report_type, format }

GET /api/reports/types
Roles: all authenticated
Returns: list of report types this role can access, with display names and param schemas
```

---

### Part C — Reports UI

#### `app/(dashboard)/reports/page.tsx`
- Server component: fetches `/api/reports/types` to get role-filtered list
- Renders `<ReportCard>` per report type

#### `components/reports/ReportCard.tsx`
- Props: `{ reportType, displayName, description, paramSchema }`
- Shows: report description, "Generate CSV" and "Generate PDF" buttons
- On click: opens `<ReportFilters>` inline, then calls `POST /api/reports`
- On success: shows download link (signed URL) that opens in new tab
- Signed URL displayed with expiry warning: "Link expires in 15 minutes"

#### `components/reports/ReportFilters.tsx`
- Date range picker (date_from / date_to)
- Category code selector (dropdown from category_codes)
- Conditional fields per report type (member_id for report 04, pms_window for report 06, etc.)

#### `components/reports/DownloadResult.tsx`
- Shows: filename, format badge, expiry countdown timer (client-side 15-min countdown)
- Download button opens the signed URL in a new tab
- Re-generate button if URL has expired

---

### Part D — Executive Dashboard Charts

Install recharts (SSR-compatible, most widely used with Next.js App Router):
```
npm install recharts
```

Note: recharts components must be wrapped in `'use client'` since they use browser APIs.

#### `components/dashboard/StockByCategoryChart.tsx`
- `'use client'` — BarChart from recharts
- Props: `{ data: { categoryCode, totalOnHand, itemCount }[] }`
- X-axis: category codes, Y-axis: qty on hand
- Tooltip: shows category name + qty + item count
- Color: single blue fill matching TailwindCSS palette

#### `components/dashboard/AlertsDonutChart.tsx`
- `'use client'` — PieChart/RadialBarChart from recharts
- Props: `{ data: { alertType, count }[] }`
- Segments per alert type (low_stock, pms_due, expiry_warning, license_expiry, calibration_due)
- Color-coded by severity (red = expiry, amber = pms, blue = low_stock)
- Center label: total open alerts

#### `components/dashboard/MovementTimelineChart.tsx`
- `'use client'` — AreaChart from recharts
- Props: `{ data: { date, movements }[] }` (last 7 days from /api/dashboard)
- X-axis: date labels, Y-axis: movement count
- Gradient fill

#### Update `app/(dashboard)/dashboard/page.tsx`
- Dashboard API already returns `stockByCategory`, `alertCounts`, `recentMovements`
- Pass these to the three new chart components
- Layout: 2 charts top row (StockByCategory wide, AlertsDonut narrow), MovementTimeline full-width below

---

## Dependency Install

```bash
cd imis-app && npm install recharts
```

No other new dependencies needed — pdf-lib and Firebase Storage are already there.

---

## RBAC Summary for Reports

| Role | Reports accessible |
|------|--------------------|
| `inventory_staff` | None (no access to any report) |
| `inventory_manager` | 01, 02, 03, 04, 05, 06, 07, 08, 11, 12 (all operational) |
| `finance_officer` | 05, 08, 09, 10, 12 (valuation + reconciliation) |
| `system_admin` | All 12 |
| `auditor` | All 12 (read-only, cannot re-trigger) |

---

## Security Checklist (build-time, enforce in code)

- [ ] `sanitizeCell()` applied to **every** string cell in CSV output — no exceptions
- [ ] PDF generation is **server-only** — never runs in client components
- [ ] Firebase Storage bucket for reports is **private** — no public access rule
- [ ] Signed URLs use **15-minute expiry** (enforced in `lib/storage/index.ts` `SIGNED_URL_EXPIRY_MINUTES`)
- [ ] Every report generation writes to `audit_log` with `user_id`, `action`, `resource`, `details`
- [ ] `inventory_staff` is **not** in any `REPORT_ACCESS` list — 403 on all report requests
- [ ] `finance_officer` can only access billing/accounting reconciliation + valuation/UPIS reports — not operational movement reports
- [ ] Report API routes all wrapped with `withAuth()` — 401 without Bearer token

---

## Task Sequence (optimal build order)

1. `lib/reports/sanitize.ts` — CSV injection prevention (foundational, needed by everything)
2. `lib/reports/csv.ts` — CSV formatter
3. `lib/reports/pdf.ts` — PDF builder with pdf-lib
4. `lib/reports/storage.ts` — upload + sign wrapper
5. `lib/reports/queries/01-current-stock.ts` through `12-disposal-summary.ts` (can parallelize)
6. `lib/reports/generate.ts` — orchestrator (depends on 1-5)
7. `app/api/reports/route.ts` (depends on 6)
8. `components/reports/ReportCard.tsx`, `ReportFilters.tsx`, `DownloadResult.tsx`
9. `app/(dashboard)/reports/page.tsx`
10. `npm install recharts`
11. `components/dashboard/StockByCategoryChart.tsx`, `AlertsDonutChart.tsx`, `MovementTimelineChart.tsx`
12. Update `app/(dashboard)/dashboard/page.tsx` with charts

---

## Notes / Watch-outs

**physical_count_variance (report 11):** The physical count API (`app/api/physical-count/`) already exists. Check its response shape and use the same query logic in the report query — do not duplicate the SQL. Report 11 should summarize all scan sessions.

**UPIS depreciation (report 05):** Item attributes for UPIS assets (nea_asset_code, depreciation_rate, accumulated_depreciation) are stored in `item_attributes` as EAV rows. The query must pivot these by `attribute_name`. The existing `/api/upis` route already does this — extract the query logic into `lib/reports/queries/05-upis-depreciation.ts`.

**Billing/accounting reconciliation (reports 09, 10):** `app/api/reconciliation/` already exists and was built in Sprint 7. The report queries should reuse the same data logic — the reports add formatting + PDF/CSV export on top.

**recharts + App Router:** recharts components require `'use client'`. Use a pattern like:
```tsx
// app/(dashboard)/dashboard/page.tsx — server component
// Passes pre-fetched data as props to client chart components
import { StockByCategoryChart } from '@/components/dashboard/StockByCategoryChart'
// <StockByCategoryChart data={stockByCategory} />
```

**pdf-lib font:** pdf-lib's embedded Helvetica covers ASCII only. Philippine-specific characters (if any in item names) need StandardFonts.Helvetica with UTF-8 fallback or use a custom font file. For Sprint 9, ASCII-safe content is sufficient — note this as a known limitation if non-ASCII names appear in reports.

**Excel BOM:** Philippine government finance staff typically open CSVs in Excel. Include UTF-8 BOM (`\uFEFF`) at the start of the CSV buffer to ensure correct encoding in Excel on Windows.

---

## Sprint 9 Acceptance Gates

See `SPRINT_9_VALIDATION_CHECKS.md` for full checklist with test commands.

Quick summary:
- All 12 reports generate without error for each authorized role
- CSV cells starting with `=`, `+`, `-`, `@` are prefixed with single quote
- PDF signed URLs expire after 15 minutes (test at 16-min mark)
- `inventory_staff` gets 403 on all `/api/reports` calls
- `finance_officer` gets 403 on movement_history report
- Every report download is logged to `audit_log`
- Dashboard page renders all 3 charts with real data
- `npm run build` passes with zero TypeScript errors
