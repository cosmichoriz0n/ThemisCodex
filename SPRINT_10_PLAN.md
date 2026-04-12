# Sprint 10 Plan — IMIS
## Weeks 19–20 | Goal: Bulk CSV Import, DB Performance Indexes, k6 Load Test, OWASP Security Scan
### Deliverables: Data Migration Pilot (20% of client inventory) + Production Readiness Hardening

---

## Context

Sprint 9 completed: all 12 reports (CSV + PDF), signed URL downloads (15-min expiry), recharts dashboard (StockByCategoryChart, AlertsDonutChart, MovementTimelineChart), CSV injection prevention, `lib/reports/` module. `npm run build` passes clean.

Sprint 10 is the **hardening sprint** — no new business features. This sprint makes the system production-safe: performance-indexed DB, bulk import for client data migration, load-tested, and OWASP-clean. Sprint 11 follows with UAT and full documentation.

**Critical path note:** Sprint 11 requires the bulk import to complete full data migration. Sprint 10 runs the 20% pilot. The system must survive 50 VUs before Sprint 11 UAT begins.

---

## What Already Exists (usable in S10)

| Asset | Location | Notes |
|-------|----------|-------|
| Zod item validation | `lib/validation/items/schemas.ts` + `index.ts` | All 13 category schemas — bulk import reuses these directly, no bypass |
| Items + item_attributes insert logic | `lib/db/items/` | Pattern to follow for bulk insert transaction |
| DB schema definitions | `lib/db/schema/*.ts` | Drizzle schema — index() calls already exist on items(category_code, barcode) |
| Existing migrations | `drizzle/migrations/0001–0009` | Next is 0010 |
| withAuth + withRole | `lib/auth/withAuth.ts`, `lib/db/with-role.ts` | Required for import route |
| audit_log schema | `lib/db/schema/audit-log.ts` | Import summary logged here on commit |
| Firebase Storage | `lib/storage/index.ts` | Already built — signed URL pattern for import result files if needed |

**Indexes already in Drizzle schema (do NOT re-add):**
- `items`: `items_category_idx` (category_code), `items_barcode_idx` (barcode) — already defined in `items.ts`
- `stock_movements`: `stock_movements_item_idx` (item_id), `stock_movements_moved_at_idx` (moved_at) — already in `stock-movements.ts`

**Indexes NOT yet in schema (Sprint 10 adds):**
- `stock_movements(item_id, moved_at DESC)` — compound replaces the two separate indexes above
- `stock_movements(member_id)` — missing
- `transactions(member_id)` — missing
- `transactions(ebs_sync_status)` — missing
- `integration_log(source_system, logged_at DESC)` — compound, missing
- `item_attributes(item_id, attribute_name)` — compound, missing

---

## What Is NOT There Yet (Sprint 10 adds)

- No `lib/import/` module
- No `app/api/import/route.ts`
- No `app/(dashboard)/import/page.tsx`
- No `components/import/` components
- No `drizzle/migrations/0010_sprint10_indexes.sql`
- No `k6/` directory or load test script
- papaparse not installed

---

## Dependency to Install

```bash
cd imis-app && npm install papaparse
npm install --save-dev @types/papaparse
```

k6 is a standalone binary — not an npm package. Install via Homebrew: `brew install k6`

---

## Sprint 10 Deliverables Breakdown

---

### Part A — DB Performance Indexes (Migration 0010)

#### File: `drizzle/migrations/0010_sprint10_indexes.sql`

```sql
-- Sprint 10: Performance indexes for high-traffic query paths
-- Items indexes are already present from 0001_initial_schema — skipped

-- stock_movements: compound index for item history queries (replaces two singles)
DROP INDEX IF EXISTS stock_movements_item_idx;
DROP INDEX IF EXISTS stock_movements_moved_at_idx;
CREATE INDEX stock_movements_item_moved_at_idx
  ON stock_movements (item_id, moved_at DESC);

-- stock_movements: member issuance history
CREATE INDEX stock_movements_member_id_idx
  ON stock_movements (member_id);

-- transactions: member transaction history page
CREATE INDEX transactions_member_id_idx
  ON transactions (member_id);

-- transactions: EBS sync status filter (pending/failed billing queue)
CREATE INDEX transactions_ebs_sync_status_idx
  ON transactions (ebs_sync_status);

-- integration_log: source system + time range queries
CREATE INDEX integration_log_source_logged_at_idx
  ON integration_log (source_system, logged_at DESC);

-- item_attributes: EAV lookups by item + attribute name
CREATE INDEX item_attributes_item_attr_idx
  ON item_attributes (item_id, attribute_name);
```

#### Schema updates required

Update these Drizzle schema files to match the migration:

**`lib/db/schema/stock-movements.ts`** — replace the two separate `index()` calls with one compound:
```ts
// Replace:
// index("stock_movements_item_idx").on(table.itemId),
// index("stock_movements_moved_at_idx").on(table.movedAt),
// With:
index("stock_movements_item_moved_at_idx").on(table.itemId, table.movedAt),
index("stock_movements_member_id_idx").on(table.memberId),
```

**`lib/db/schema/transactions.ts`** — add inside the table index array:
```ts
index("transactions_member_id_idx").on(table.memberId),
index("transactions_ebs_sync_status_idx").on(table.ebsSyncStatus),
```

**`lib/db/schema/integration-log.ts`** — add:
```ts
index("integration_log_source_logged_at_idx").on(table.sourceSystem, table.loggedAt),
```

**`lib/db/schema/item-attributes.ts`** — add:
```ts
index("item_attributes_item_attr_idx").on(table.itemId, table.attributeName),
```

**Verification:** After applying migration, run:
```sql
SELECT indexname FROM pg_indexes WHERE tablename IN
  ('stock_movements','transactions','integration_log','item_attributes')
ORDER BY tablename, indexname;
```
Expect 6 new index names in the result.

---

### Part B — Bulk CSV Import

#### B1. `lib/import/types.ts`

```ts
export type ImportPhase = 'preview' | 'commit';

export interface ImportRowResult {
  row: number;           // 1-based row index (excludes header)
  item_name: string;
  category_code: string;
  valid: boolean;
  errors: string[];      // Zod error messages if invalid
}

export interface ImportPreviewResponse {
  phase: 'preview';
  filename: string;
  total_rows: number;    // total CSV data rows (excl. header)
  preview_rows: ImportRowResult[];  // first 20 rows
  valid_count: number;
  invalid_count: number;
}

export interface ImportCommitResponse {
  phase: 'commit';
  total_rows: number;
  inserted: number;
  failed: number;
  errors: ImportRowResult[];  // all invalid rows (row + errors)
  audit_log_id: string;
}

export type ImportResponse = ImportPreviewResponse | ImportCommitResponse;
```

#### B2. `lib/import/parser.ts`

```ts
import Papa from 'papaparse';

export interface ParsedCSV {
  headers: string[];
  rows: Record<string, string>[];  // header → cell value
  totalRows: number;
}

export function parseCSV(buffer: Buffer): ParsedCSV
  // Papa.parse(buffer.toString('utf-8'), { header: true, skipEmptyLines: true })
  // Returns { headers, rows: result.data, totalRows: result.data.length }
  // Throws Error('CSV_PARSE_ERROR: <message>') on parse failure

export function validateFileInput(file: File): void
  // Throws Error if:
  //   file.size > 10 * 1024 * 1024          → 'FILE_TOO_LARGE: Max 10MB'
  //   !file.name.toLowerCase().endsWith('.csv') → 'INVALID_FILE_TYPE: CSV only'
  //   file.type not in ['text/csv','application/vnd.ms-excel','text/plain',''] → same error
```

#### B3. `lib/import/validate.ts`

```ts
import { validateItemInput } from '../validation/items';  // reuse existing Zod validation
import type { ImportRowResult } from './types';

// Validates a single parsed CSV row against the item schema for its category_code.
// Returns ImportRowResult with valid=true or valid=false + errors[].
export function validateRow(row: Record<string, string>, rowIndex: number): ImportRowResult

  // 1. Require category_code and item_name present and non-empty
  // 2. Call validateItemInput(row.category_code, row) — same function used by manual entry
  // 3. Collect all ZodError messages into errors[]
  // 4. Return { row: rowIndex, item_name: row.item_name ?? '', category_code: row.category_code ?? '', valid: errors.length === 0, errors }

export function validateAllRows(rows: Record<string, string>[]): ImportRowResult[]
  // Map validateRow over rows with 1-based index
```

**Critical:** `validateItemInput` must not be modified. Import reuses it exactly — no bypass, no partial validation.

#### B4. `lib/import/insert.ts`

```ts
import { db } from '../db';
import { items, itemAttributes, inventoryStock, auditLog } from '../db/schema';
import type { ImportCommitResponse } from './types';
import type { ImportRowResult } from './types';

export async function bulkInsertItems(
  validatedRows: ImportRowResult[],
  allParsedRows: Record<string, string>[],
  userId: string,
  cooperativeId: string
): Promise<ImportCommitResponse>
```

Implementation notes:
- Open a **single DB transaction** using `db.transaction(async (tx) => { ... })`
- For each valid row (where `ImportRowResult.valid === true`):
  1. Insert into `items` — set `created_by = userId`, `lifecycle_status = 'acquired'`
  2. Extract category-specific fields → insert into `item_attributes` (EAV, one row per attribute)
  3. Insert into `inventory_stock` — `qty_on_hand = parseInt(row.qty_on_hand ?? '0')`, `location = row.location ?? 'main_warehouse'`, `reorder_level = parseInt(row.reorder_level ?? '0')`
- If **any** insert throws, the entire transaction rolls back — return failed = total_rows, inserted = 0
- After transaction commits, write **one** `audit_log` row:
  ```
  action: 'BULK_IMPORT'
  resource_type: 'items'
  resource_id: null
  performed_by: userId
  details: JSON.stringify({ filename, total_rows, inserted, failed, invalid_row_numbers })
  ```
- Returns `ImportCommitResponse`

**RLS note:** The `withRole` wrapper sets `app.user_role` and `app.user_id` session variables before calling this function. The insert will be blocked by RLS if the role is `inventory_staff` or `auditor` — this is intentional and must not be worked around.

#### B5. `app/api/import/route.ts`

```ts
export const POST = withAuth(withRole(['inventory_manager', 'system_admin'], handler))

async function handler(req: Request, ctx: AuthContext): Promise<Response>
  1. Parse multipart/form-data — extract `file` (File) and `phase` ('preview' | 'commit')
  2. Validate file via validateFileInput(file)
  3. Read file to Buffer: Buffer.from(await file.arrayBuffer())
  4. parseCSV(buffer) → { headers, rows, totalRows }
  5. validateAllRows(rows) → ImportRowResult[]
  6. If phase === 'preview':
       - Return ImportPreviewResponse:
           preview_rows = first 20 results from validateAllRows
           total_rows = totalRows
           valid_count / invalid_count = counts from full validateAllRows
  7. If phase === 'commit':
       - Call bulkInsertItems(validatedRows, rows, ctx.user.uid, ctx.claims.cooperative_id)
       - Return ImportCommitResponse
  8. Return 400 with { error: '...' } on any validation or parse error
  9. Return 500 on unexpected errors (no stack trace in response body)
```

**Content-Type on success:** `application/json`
**Max body size:** Set via Next.js route segment config: `export const config = { api: { bodyParser: false } }` — use native `req.formData()` instead.

#### B6. `components/import/ImportUpload.tsx`

```
Props: { onFileSelect: (file: File) => void; loading: boolean }
```
- File input accepting `.csv` only (`accept=".csv,text/csv"`)
- Drag-and-drop zone using HTML5 drag events (no external DnD library)
- Shows file name + size once selected
- "Preview Import" button triggers `onFileSelect`
- Disabled while `loading`

#### B7. `components/import/ImportPreview.tsx`

```
Props: { preview: ImportPreviewResponse; onConfirm: () => void; onReset: () => void; loading: boolean }
```
- Summary bar: "{valid_count} valid rows / {invalid_count} invalid rows out of {total_rows} total"
- Table showing up to 20 preview rows: Row #, item_name, category_code, Status (green "Valid" badge / red "Error" badge), Error detail (truncated to 80 chars)
- "Confirm Import" button — disabled if `valid_count === 0` or `loading`
- "Upload Different File" button → calls `onReset`
- Warning if `invalid_count > 0`: "Invalid rows will be skipped. Only valid rows will be imported."

#### B8. `components/import/ImportResult.tsx`

```
Props: { result: ImportCommitResponse; onReset: () => void }
```
- Success header if `result.inserted > 0`: "Import complete — {inserted} items added"
- If `result.failed > 0`: warning section listing failed rows with row number and error messages
- "Import Another File" button → calls `onReset`

#### B9. `app/(dashboard)/import/page.tsx`

```ts
// RBAC gate: only inventory_manager and system_admin see this page
// Redirect others to /dashboard with toast "Insufficient permissions"

// State machine: 'idle' | 'previewing' | 'preview_ready' | 'committing' | 'done'

// Idle → upload file → POST /api/import?phase=preview → preview_ready
// preview_ready → confirm → POST /api/import?phase=commit → done
// Any state → reset → idle
```

Add link to this page in the sidebar navigation — visible only to `inventory_manager` and `system_admin` roles.

**CSV template download:** Provide a "Download CSV Template" link on the idle screen. The template is a static file at `public/import-template.csv` with one header row listing all base columns + a note row (commented with #) showing category-specific columns.

#### B10. `public/import-template.csv`

```csv
item_name,category_code,sku,description,location,qty_on_hand,reorder_level,unit_cost,conductor_type,gauge,length_m,voltage_rating,lot_no,tool_type,condition,assigned_to,calibration_due,...
# LM fields: conductor_type gauge length_m voltage_rating lot_no
# TE fields: tool_type condition assigned_to calibration_due
# FF fields: acquisition_cost (room/location already in base location field)
# OS fields: brand pack_size unit
# MP fields: plate_no or_no make model year_model mileage
# HW fields: wire_type gauge length_m insulation_rating
# SE fields: serial_no calibration_cert calibration_expiry
# UPIS fields: nea_asset_code feeder depreciation_rate acquisition_cost
# MS fields: lot_no expiry_date storage_temp doh_class
# TR fields: plate_no or_no chassis_no engine_no insurance_expiry
# CE fields: serial_no ntc_license_no ntc_expiry
# BM fields: material_type unit supplier work_order_ref
# IT fields: serial_no mac_address os license_key license_expiry assigned_user
```

---

### Part C — k6 Load Test

#### `k6/load-test.js`

```js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

export const options = {
  vus: 50,
  duration: '120s',
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],  // <1% error rate
  },
};

// Target pages (GET — authenticated via session cookie)
const BASE_URL = __ENV.IMIS_BASE_URL || 'http://localhost:3000';
const SESSION_COOKIE = __ENV.IMIS_SESSION_COOKIE;  // required env var

const targets = [
  '/api/dashboard',
  '/api/items?page=1&limit=20',
  '/api/items?page=1&limit=20&category=LM',
  '/api/movements?page=1&limit=20',
  '/api/reports',
  '/api/alerts',
];

export default function () {
  const target = targets[Math.floor(Math.random() * targets.length)];
  const res = http.get(`${BASE_URL}${target}`, {
    headers: { Cookie: `session=${SESSION_COOKIE}` },
  });
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 2000ms': (r) => r.timings.duration < 2000,
  });
  sleep(0.5);
}
```

#### `k6/README.md`

```
## Running the load test

Prerequisites: k6 installed (brew install k6)

1. Start the app: cd imis-app && npm run dev
2. Log in and copy your session cookie from browser DevTools → Application → Cookies
3. Run:
   IMIS_BASE_URL=http://localhost:3000 \
   IMIS_SESSION_COOKIE=<your_session_value> \
   k6 run k6/load-test.js

Pass threshold: p95 < 2000ms across all endpoints for the full 120-second run.
Failed threshold means Sprint 11 is blocked — diagnose slow queries first (EXPLAIN ANALYZE).
```

---

### Part D — Security Hardening

#### D1. npm audit

```bash
cd imis-app
npm audit --audit-level=high
```

**Pass criteria:** Zero high or critical findings. Fix all before marking Sprint 10 done.

Process:
1. Run audit. Review each finding.
2. Run `npm audit fix` for safe auto-fixes.
3. For any remaining high/critical findings that require manual upgrade: update `package.json` version, run `npm install`, verify `npm run build` still passes.
4. Re-run audit. Zero high/critical = pass.

Do NOT use `npm audit fix --force` — it can introduce breaking changes.

#### D2. OWASP ZAP Baseline Scan

The OWASP ZAP baseline scan runs against the staging URL (Railway staging environment or local with `npm run dev`).

```bash
# Using Docker (recommended — no local ZAP install needed)
docker run --rm -v $(pwd):/zap/wrk/:rw \
  -t ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py \
  -t http://host.docker.internal:3000 \
  -r zap-report.html \
  -I
```

**Fix criteria:** All HIGH severity findings must be resolved before Sprint 11 begins.

Common HIGH findings and their IMIS-specific fixes:

| Finding | IMIS fix |
|---------|---------|
| Missing X-Content-Type-Options | Add `X-Content-Type-Options: nosniff` to `next.config.ts` headers |
| Missing X-Frame-Options | Add `X-Frame-Options: DENY` to `next.config.ts` headers |
| Missing Content-Security-Policy | Add strict CSP to `next.config.ts` headers |
| Missing HSTS | Railway auto-enforces HTTPS — add `Strict-Transport-Security` header |
| Cookie without Secure/HttpOnly | Set both flags on session cookie in `app/api/auth/session/route.ts` |
| Exposed server information | Set `X-Powered-By: false` in `next.config.ts` (already off by default in Next.js) |

All header fixes go in `next.config.ts` under `headers()` async function.

Save `zap-report.html` to `docs/security/zap-report-sprint10.html` for Sprint 11 system security plan.

#### D3. `next.config.ts` Security Headers (applies fixes from D2)

```ts
async headers() {
  return [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // Next.js requires these
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https://firebasestorage.googleapis.com",
            "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebasestorage.googleapis.com",
            "font-src 'self'",
            "frame-ancestors 'none'",
          ].join('; '),
        },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=31536000; includeSubDomains',
        },
      ],
    },
  ];
},
```

---

## Build Order

Execute in this sequence — each step depends on the previous passing:

```
1. Install papaparse (npm install papaparse && npm install --save-dev @types/papaparse)
2. Part A: Write 0010_sprint10_indexes.sql + update 4 schema files
3. Part D: npm audit + security headers in next.config.ts
4. Part B1–B4: lib/import/ module (types → parser → validate → insert)
5. Part B5: app/api/import/route.ts
6. Part B6–B8: components/import/
7. Part B9–B10: page + template file + sidebar link
8. npm run build → must pass clean
9. Part C: k6/ test script
10. Apply DB migration to Railway staging: railway run npx drizzle-kit migrate
11. Part D2: ZAP scan against staging, fix any HIGH findings, re-scan
12. npm run build → final pass
```

---

## RBAC Matrix for New Endpoints

| Endpoint | inventory_staff | inventory_manager | finance_officer | system_admin | auditor |
|----------|:-:|:-:|:-:|:-:|:-:|
| POST /api/import (preview) | ✗ | ✓ | ✗ | ✓ | ✗ |
| POST /api/import (commit) | ✗ | ✓ | ✗ | ✓ | ✗ |
| GET /import page | ✗ | ✓ | ✗ | ✓ | ✗ |

---

## Sprint 10 Acceptance Criteria

| # | Check | Pass condition |
|---|-------|---------------|
| 1 | DB migration | `npx drizzle-kit migrate` applies 0010 with no errors |
| 2 | New indexes present | 6 new indexes visible in `pg_indexes` |
| 3 | Import preview | Upload valid CSV → see first 20 rows with green Valid badges |
| 4 | Import preview validation | Upload CSV with 3 invalid rows → those rows show red Error badges |
| 5 | Import commit | Confirm import → items appear in `/items` list |
| 6 | Import rollback | Force one invalid row past preview → entire batch rolls back, zero items inserted |
| 7 | Import RBAC | `inventory_staff` user → POST /api/import → 403 |
| 8 | Import audit trail | After commit → `audit_log` shows BULK_IMPORT entry with correct counts |
| 9 | File limits | Upload 11MB CSV → 400 "FILE_TOO_LARGE" |
| 10 | Wrong file type | Upload .xlsx → 400 "INVALID_FILE_TYPE" |
| 11 | k6 threshold | p95 < 2000ms for full 120s run at 50 VUs |
| 12 | npm audit | Zero high or critical findings |
| 13 | Security headers | `curl -I http://localhost:3000` shows X-Frame-Options, CSP, HSTS, X-Content-Type-Options |
| 14 | ZAP HIGH findings | Zero HIGH severity in ZAP baseline report |
| 15 | Build | `npm run build` passes clean |

---

## Data Migration Pilot (20%)

At the end of Sprint 10, run a 20% data pilot with real client inventory data:

1. Client prepares a CSV of ~20% of their existing inventory in the template format
2. Import team (system_admin role) uploads via `/import` page to **staging** environment
3. Verify imported items appear correctly — spot-check 5 items per category present
4. Verify `audit_log` shows the pilot import entry
5. Document row counts: expected vs. imported in Sprint 10 handoff notes

Full migration (remaining 80%) happens in Sprint 11.

---

## Files Created/Modified in Sprint 10

**New files:**
- `drizzle/migrations/0010_sprint10_indexes.sql`
- `lib/import/types.ts`
- `lib/import/parser.ts`
- `lib/import/validate.ts`
- `lib/import/insert.ts`
- `app/api/import/route.ts`
- `components/import/ImportUpload.tsx`
- `components/import/ImportPreview.tsx`
- `components/import/ImportResult.tsx`
- `app/(dashboard)/import/page.tsx`
- `public/import-template.csv`
- `k6/load-test.js`
- `k6/README.md`
- `docs/security/zap-report-sprint10.html` (generated, not authored)

**Modified files:**
- `lib/db/schema/stock-movements.ts` — compound index + member_id index
- `lib/db/schema/transactions.ts` — member_id + ebs_sync_status indexes
- `lib/db/schema/integration-log.ts` — compound index
- `lib/db/schema/item-attributes.ts` — compound index
- `next.config.ts` — security headers
- Sidebar navigation component — add Import link for manager/admin roles
- `package.json` — papaparse dependency
