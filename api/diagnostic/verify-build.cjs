"use strict";
// Build gate: deterministic Diagnostic tests only. No Supabase, Storage or AI calls.
// The real photo E2E is a separate, explicitly confirmed manual command.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { config } = require("./config");

const root = path.resolve(__dirname, "../..");
const testsDir = path.join(root, "tests/diagnostic");
const tests = fs
  .readdirSync(testsDir)
  .filter((name) => name.endsWith(".test.cjs"))
  .sort()
  .map((name) => path.join(testsDir, name));
assert.ok(tests.length > 0, "DIAGNOSTIC_BUILD_TESTS_MISSING");
const result = spawnSync(process.execPath, ["--test", ...tests], {
  cwd: root,
  stdio: "inherit",
  // Tests use injected fixtures and loopback HTTP. Never inherit production secrets.
  env: {
    PATH: process.env.PATH || "",
    NODE_PATH: path.join(root, "api/node_modules"),
  },
});
if (result.error || result.status !== 0) {
  console.error("DIAGNOSTIC_BUILD_TESTS_FAILED");
  process.exit(1);
}

// Retain static Production prerequisites without contacting external dependencies.
if (process.env.VERCEL_ENV === "production") {
  const cfg = config();
  assert.ok(cfg.secret.length >= 32 && cfg.maintenanceSecret.length >= 32);
  assert.ok(
    process.env.SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.OPENAI_API_KEY &&
      cfg.model,
  );
  if (process.env.FIXEO_DIAGNOSTIC_ENABLED === "1")
    assert.equal(cfg.enabled, true);
  assert.ok(
    require("../../vercel.json").crons.some(
      (c) =>
        c.path === "/api/diagnostic-maintenance" && c.schedule === "0 * * * *",
    ),
  );
}
console.log(
  "DIAGNOSTIC_BUILD_TESTS_PASS: live photo E2E is manual and was not run.",
);
