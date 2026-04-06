/**
 * EBS2000 (Billing System) Simulator
 *
 * Endpoints:
 *   GET  /api/health                     → system health
 *   POST /api/billing                    → create billing record
 *   GET  /api/billing/:ref               → get billing record by reference
 *   POST /api/billing/:ref/void          → void a billing record
 *
 * Failure injection: set header X-Simulate-Failure: true to get a 500 response
 * HMAC verification: checks X-IMIS-Signature header (HMAC-SHA256 of body)
 */

"use strict";
const express = require("express");
const crypto = require("crypto");
const app = express();
app.use(express.json());

const billingStore = new Map();

function verifyHmac(req, res, next) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) return next(); // Skip in dev without env var

  const signature = req.headers["x-imis-signature"];
  if (!signature) return res.status(401).json({ error: "MISSING_SIGNATURE" });

  const expected = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.status(401).json({ error: "INVALID_SIGNATURE" });
  }
  next();
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", system: "EBS2000", billingRecords: billingStore.size });
});

app.post("/api/billing", verifyHmac, (req, res) => {
  if (req.headers["x-simulate-failure"] === "true") {
    return res.status(500).json({ error: "SIMULATED_FAILURE" });
  }

  const ref = `EBS-${Date.now()}-${Math.floor(Math.random() * 9999).toString().padStart(4, "0")}`;
  const record = { ref, ...req.body, status: "billed", created_at: new Date().toISOString() };
  billingStore.set(ref, record);

  res.status(201).json({ data: { billing_ref: ref, status: "billed" } });
});

app.get("/api/billing/:ref", (req, res) => {
  const record = billingStore.get(req.params.ref);
  if (!record) return res.status(404).json({ error: "BILLING_REF_NOT_FOUND" });
  res.json({ data: record });
});

app.post("/api/billing/:ref/void", (req, res) => {
  const record = billingStore.get(req.params.ref);
  if (!record) return res.status(404).json({ error: "BILLING_REF_NOT_FOUND" });
  record.status = "voided";
  record.voided_at = new Date().toISOString();
  billingStore.set(req.params.ref, record);
  res.json({ data: { ref: req.params.ref, status: "voided" } });
});

module.exports = app;
