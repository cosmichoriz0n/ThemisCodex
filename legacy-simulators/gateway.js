/**
 * IMIS Legacy System Simulators Gateway
 * Single $PORT entry point → routes to MIMS, EBS2000, CAS2000 sub-apps
 *
 * Routes:
 *   /mims/*      → MIMS member sync simulator
 *   /ebs2000/*   → EBS2000 billing simulator
 *   /cas2000/*   → CAS2000 accounting simulator
 */

"use strict";
const express = require("express");
const mimsApp = require("./mims/app");
const ebsApp = require("./ebs2000/app");
const casApp = require("./cas2000/app");

const gateway = express();
const PORT = process.env.PORT || 3001;

// JSON parsing for all sub-apps
gateway.use(express.json());

// API key middleware — each system has its own key in env vars
function requireApiKey(keyEnvVar) {
  return (req, res, next) => {
    const key = req.headers["x-api-key"];
    const expected = process.env[keyEnvVar];
    // In dev mode without env vars, skip key check
    if (expected && key !== expected) {
      return res.status(401).json({ error: "INVALID_API_KEY" });
    }
    next();
  };
}

// Mount sub-apps
gateway.use("/mims", requireApiKey("MIMS_API_KEY"), mimsApp);
gateway.use("/ebs2000", requireApiKey("EBS2000_API_KEY"), ebsApp);
gateway.use("/cas2000", requireApiKey("CAS2000_API_KEY"), casApp);

// Root health check
gateway.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "imis-simulators", ts: new Date().toISOString() });
});

gateway.listen(PORT, () => {
  console.log(`[IMIS Simulators] Gateway listening on port ${PORT}`);
});
