# IMIS k6 Load Test

Sprint 10 acceptance criterion: **p95 < 2000ms** across all main endpoints, 50 VUs, 120 seconds.

## Prerequisites

```bash
# Install k6 (macOS)
brew install k6

# Verify
k6 version
```

## Setup

1. Start the app (or point at a staging URL):
   ```bash
   cd imis-app && npm run dev
   ```

2. Log in to IMIS in your browser. Open DevTools → Application → Cookies → copy the `session` cookie value.

## Run

```bash
cd /path/to/ThemisCodex

IMIS_BASE_URL=http://localhost:3000 \
IMIS_SESSION=<your_session_cookie_value> \
k6 run k6/load-test.js
```

Against Railway staging:
```bash
IMIS_BASE_URL=https://imis-app.up.railway.app \
IMIS_SESSION=<your_session_cookie_value> \
k6 run k6/load-test.js
```

## Pass/fail criteria

| Metric | Threshold |
|--------|-----------|
| `http_req_duration p(95)` | < 2000ms |
| `http_req_failed rate` | < 1% |

A green `✓` next to both thresholds = pass. Sprint 11 is unblocked.

A red `✗` means at least one endpoint is too slow. Steps to diagnose:

1. Check which endpoint tags are slowest in the k6 output.
2. In Railway Postgres, run `EXPLAIN (ANALYZE, BUFFERS)` on the slow query.
3. Verify migration 0010 indexes were applied: `SELECT indexname FROM pg_indexes WHERE tablename = 'stock_movements';`
4. If indexes are missing, apply the migration: `railway run npx drizzle-kit migrate`

## Endpoints under test

| Endpoint | Weight |
|----------|--------|
| GET /api/dashboard | 25% |
| GET /api/items (page 1) | 20% |
| GET /api/items (LM category) | 5% |
| GET /api/items (TE category) | 5% |
| GET /api/movements | 10% |
| GET /api/transactions | 8% |
| GET /api/alerts | 8% |
| GET /api/reports | 5% |
| GET /api/members/search | 5% |
| GET /api/reconciliation | 4% |
| GET /api/health | 5% |
