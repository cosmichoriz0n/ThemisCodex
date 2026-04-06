/**
 * CAS2000 (Cooperative Accounting System) Simulator
 *
 * Endpoints:
 *   GET  /api/health                     → system health
 *   GET  /api/accounts                   → NEA Chart of Accounts
 *   POST /api/journals                   → post journal entry
 *   GET  /api/journals/:ref              → get journal by reference
 *   POST /api/journals/:ref/reverse      → reverse a journal entry
 *   GET  /api/totals                     → get account totals (for reconciliation)
 *
 * Seeded with NEA USOA accounts per IMIS master document
 */

"use strict";
const express = require("express");
const crypto = require("crypto");
const app = express();
app.use(express.json());

const journalStore = new Map();

// NEA Uniform System of Accounts — seeded entries
const NEA_ACCOUNTS = [
  { code: "1540", name: "Materials and Supplies", type: "asset" },
  { code: "1920", name: "Utility Plant in Service", type: "asset" },
  { code: "1990", name: "Accumulated Depreciation", type: "contra_asset" },
  { code: "2110", name: "Accounts Payable", type: "liability" },
  { code: "5110", name: "Cost of Goods Sold", type: "expense" },
  { code: "5120", name: "Inventory Adjustment Expense", type: "expense" },
  { code: "5130", name: "Loss on Disposal", type: "expense" },
  { code: "5310", name: "Depreciation Expense - UPIS", type: "expense" },
];

function verifyHmac(req, res, next) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) return next();

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
  res.json({ status: "ok", system: "CAS2000", journals: journalStore.size });
});

app.get("/api/accounts", (_req, res) => {
  res.json({ data: NEA_ACCOUNTS });
});

app.post("/api/journals", verifyHmac, (req, res) => {
  if (req.headers["x-simulate-failure"] === "true") {
    return res.status(500).json({ error: "SIMULATED_FAILURE" });
  }

  const { journal_type, entries } = req.body;

  // Validate debit = credit balance
  const totalDebit = (entries || []).filter((e) => e.side === "debit").reduce((s, e) => s + Number(e.amount), 0);
  const totalCredit = (entries || []).filter((e) => e.side === "credit").reduce((s, e) => s + Number(e.amount), 0);

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return res.status(422).json({ error: "JOURNAL_UNBALANCED", debit: totalDebit, credit: totalCredit });
  }

  const ref = `CAS-${journal_type ?? "JE"}-${Date.now()}`;
  const record = { ref, journal_type, entries, status: "posted", posted_at: new Date().toISOString() };
  journalStore.set(ref, record);

  res.status(201).json({ data: { journal_ref: ref, status: "posted" } });
});

app.get("/api/journals/:ref", (req, res) => {
  const record = journalStore.get(req.params.ref);
  if (!record) return res.status(404).json({ error: "JOURNAL_NOT_FOUND" });
  res.json({ data: record });
});

app.post("/api/journals/:ref/reverse", verifyHmac, (req, res) => {
  const record = journalStore.get(req.params.ref);
  if (!record) return res.status(404).json({ error: "JOURNAL_NOT_FOUND" });
  if (record.status === "reversed") return res.status(409).json({ error: "ALREADY_REVERSED" });

  const revRef = `${req.params.ref}-REV`;
  const reversal = {
    ref: revRef,
    journal_type: "reversal",
    original_ref: req.params.ref,
    entries: record.entries.map((e) => ({ ...e, side: e.side === "debit" ? "credit" : "debit" })),
    status: "posted",
    posted_at: new Date().toISOString(),
  };
  record.status = "reversed";
  journalStore.set(req.params.ref, record);
  journalStore.set(revRef, reversal);

  res.json({ data: { journal_ref: revRef, status: "posted", reverses: req.params.ref } });
});

// Nightly reconciliation endpoint — returns sum per account code
app.get("/api/totals", (_req, res) => {
  const totals = {};
  for (const journal of journalStore.values()) {
    if (journal.status === "reversed") continue;
    for (const entry of journal.entries || []) {
      if (!totals[entry.account_code]) totals[entry.account_code] = { debit: 0, credit: 0 };
      totals[entry.account_code][entry.side] += Number(entry.amount);
    }
  }
  res.json({ data: totals, asOf: new Date().toISOString() });
});

module.exports = app;
