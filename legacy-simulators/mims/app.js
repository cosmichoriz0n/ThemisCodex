/**
 * MIMS (Member Information Management System) Simulator
 *
 * Endpoints:
 *   GET  /api/health            → system health
 *   GET  /api/members           → list all members (supports ?since= for delta sync)
 *   GET  /api/members/:id       → single member by ID
 */

"use strict";
const express = require("express");
const app = express();
app.use(express.json());

// ── Seeded members (8 Philippine electric cooperative members) ──────────────
const MEMBERS = [
  { mims_member_id: "MBR-001", full_name: "Juan dela Cruz", membership_type: "residential", status: "active", address: "Purok 1, Barangay Poblacion", contact_no: "09171234567", updated_at: "2026-01-01T00:00:00Z" },
  { mims_member_id: "MBR-002", full_name: "Maria Santos", membership_type: "residential", status: "active", address: "Purok 3, Barangay San Roque", contact_no: "09181234567", updated_at: "2026-01-02T00:00:00Z" },
  { mims_member_id: "MBR-003", full_name: "Pedro Reyes", membership_type: "commercial", status: "active", address: "National Highway, Brgy. Bagong Silang", contact_no: "09191234567", updated_at: "2026-01-03T00:00:00Z" },
  { mims_member_id: "MBR-004", full_name: "Ana Garcia", membership_type: "residential", status: "inactive", address: "Purok 5, Barangay Cuyab", contact_no: "09201234567", updated_at: "2026-02-01T00:00:00Z" },
  { mims_member_id: "MBR-005", full_name: "Lito Fernandez", membership_type: "industrial", status: "active", address: "Eco Zone, Barangay Maharlika", contact_no: "09211234567", updated_at: "2026-02-15T00:00:00Z" },
  { mims_member_id: "MBR-006", full_name: "Nena Torres", membership_type: "residential", status: "active", address: "Purok 2, Barangay Maligaya", contact_no: "09221234567", updated_at: "2026-03-01T00:00:00Z" },
  { mims_member_id: "MBR-007", full_name: "Danilo Aquino", membership_type: "commercial", status: "disconnected", address: "Rizal Street, Barangay Bagumbayan", contact_no: "09231234567", updated_at: "2026-03-10T00:00:00Z" },
  { mims_member_id: "MBR-008", full_name: "Rosario Villanueva", membership_type: "residential", status: "active", address: "Purok 4, Barangay Santa Cruz", contact_no: "09241234567", updated_at: "2026-04-01T00:00:00Z" },
];

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", system: "MIMS", memberCount: MEMBERS.length });
});

// Delta sync: ?since=ISO8601 returns only members updated after that timestamp
app.get("/api/members", (req, res) => {
  const since = req.query.since ? new Date(req.query.since) : null;
  const result = since
    ? MEMBERS.filter((m) => new Date(m.updated_at) > since)
    : MEMBERS;
  res.json({ data: result, total: result.length, syncedAt: new Date().toISOString() });
});

app.get("/api/members/:id", (req, res) => {
  const member = MEMBERS.find((m) => m.mims_member_id === req.params.id);
  if (!member) return res.status(404).json({ error: "MEMBER_NOT_FOUND" });
  res.json({ data: member });
});

module.exports = app;
