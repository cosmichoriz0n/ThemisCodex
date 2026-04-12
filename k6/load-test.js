// IMIS Sprint 10 — k6 Load Test
// Target: 50 VUs, 120 seconds, p95 < 2000ms on all main API endpoints.
//
// Usage:
//   IMIS_BASE_URL=http://localhost:3000 \
//   IMIS_SESSION=<session_cookie_value> \
//   k6 run k6/load-test.js

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

export const options = {
  vus: 50,
  duration: "120s",
  thresholds: {
    // Sprint 10 acceptance criterion: p95 < 2000ms
    http_req_duration: ["p(95)<2000"],
    // <1% error rate required
    http_req_failed: ["rate<0.01"],
  },
};

const BASE_URL = __ENV.IMIS_BASE_URL || "http://localhost:3000";
const SESSION  = __ENV.IMIS_SESSION || "";

if (!SESSION) {
  console.error(
    "ERROR: IMIS_SESSION env var is required.\n" +
    "Log in to the app, copy the session cookie value, then re-run:\n" +
    "  IMIS_SESSION=<value> k6 run k6/load-test.js"
  );
}

// Weighted endpoint list — mirrors real user traffic distribution
// Higher weight = more likely to be selected in a given iteration
const ENDPOINTS = [
  // High-traffic: dashboard + item list (most common landing pages)
  { path: "/api/dashboard",                                     weight: 25 },
  { path: "/api/items?page=1&limit=20",                         weight: 20 },
  { path: "/api/items?page=1&limit=20&category_code=LM",       weight: 5  },
  { path: "/api/items?page=1&limit=20&category_code=TE",       weight: 5  },
  // Medium-traffic: movements, transactions, alerts
  { path: "/api/movements?page=1&limit=20",                     weight: 10 },
  { path: "/api/transactions?page=1&limit=20",                  weight: 8  },
  { path: "/api/alerts",                                        weight: 8  },
  // Lower-traffic: reports list, members, reconciliation
  { path: "/api/reports",                                       weight: 5  },
  { path: "/api/members/search?q=dela+cruz",                   weight: 5  },
  { path: "/api/reconciliation",                                weight: 4  },
  // Health check (cheap, keeps variety)
  { path: "/api/health",                                        weight: 5  },
];

// Build cumulative weight table for weighted random selection
const TOTAL_WEIGHT = ENDPOINTS.reduce((s, e) => s + e.weight, 0);
const CDF = [];
let cumulative = 0;
for (const ep of ENDPOINTS) {
  cumulative += ep.weight;
  CDF.push({ path: ep.path, cdf: cumulative / TOTAL_WEIGHT });
}

function pickEndpoint() {
  const r = Math.random();
  return CDF.find((e) => r <= e.cdf)?.path ?? ENDPOINTS[0].path;
}

export default function () {
  const path = pickEndpoint();
  const url  = `${BASE_URL}${path}`;

  const res = http.get(url, {
    headers: {
      Cookie: `session=${SESSION}`,
      Accept: "application/json",
    },
    tags: { name: path.split("?")[0] }, // group metrics by route, not query string
  });

  check(res, {
    "status 200": (r) => r.status === 200,
    "response < 2000ms": (r) => r.timings.duration < 2000,
    "body is JSON": (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch {
        return false;
      }
    },
  });

  // Simulate realistic inter-request pause (0.5–1.5s)
  sleep(0.5 + Math.random());
}
