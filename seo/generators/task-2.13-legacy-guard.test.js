'use strict';
/**
 * task-2.13-legacy-guard.test.js
 * ================================
 * P1-2 — Regression suite for the legacy service×city generator safety lock.
 *
 * Verifies:
 *   1. Invoking generate-lps.js exits non-zero
 *   2. Expected safety message is emitted on stderr
 *   3. No service×city HTML file is modified by the attempt
 *   4. V3 generator remains operational
 *   5. Package/build/deploy tooling has no dependency on the legacy generator
 *
 * Test runner: node seo/generators/task-2.13-legacy-guard.test.js
 */

const { execFileSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

/* ── minimal test harness ────────────────────────────────────────────────── */
let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try {
    fn();
    console.log(`  ✅  ${label}`);
    passed++;
  } catch (e) {
    console.log(`  ❌  ${label}`);
    console.log(`       ${e.message}`);
    failures.push({ label, error: e.message });
    failed++;
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertContains(str, sub, msg) {
  if (!str.includes(sub)) throw new Error(`${msg || 'assertContains'}: expected ${JSON.stringify(sub)} in output`);
}
function assertNotContains(str, sub, msg) {
  if (str.includes(sub)) throw new Error(`${msg || 'assertNotContains'}: did not expect ${JSON.stringify(sub)} in output`);
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
const LEGACY_SCRIPT = path.join(ROOT, 'scripts', 'generate-lps.js');
const V3_GENERATOR  = path.join(ROOT, 'seo', 'generators', 'generate-service-cities-v3.js');

/** Run the legacy generator (no flags) and capture result without throwing. */
function runLegacy(args = []) {
  return spawnSync(process.execPath, [LEGACY_SCRIPT, ...args], {
    cwd:     ROOT,
    timeout: 10000,
    encoding: 'utf8',
  });
}

/** Snapshot mtimes for a sample of V3 service×city HTML files. */
function snapshotMtimes() {
  const samples = [
    'plombier-casablanca.html',
    'electricien-rabat.html',
    'menuisier-casablanca.html',
    'menuisier-sale.html',
  ];
  const result = {};
  for (const f of samples) {
    const fp = path.join(ROOT, f);
    if (fs.existsSync(fp)) result[f] = fs.statSync(fp).mtimeMs;
  }
  return result;
}

/* ── Test section 1: Safety guard behaviour ─────────────────────────────── */
console.log('\ntask-2.13-legacy-guard.test.js\n');
console.log('── Section 1: Safety guard behaviour ─────────────────────────');

const EXPECTED_BLOCKED = 'BLOCKED: legacy service×city generator';
const EXPECTED_FROZEN  = 'generate-lps.js) is FROZEN';
const EXPECTED_V3_PATH = 'generate-service-cities-v3.js';

const runNoArgs = runLegacy([]);

test('LG-1. direct invocation exits non-zero', () => {
  assert(runNoArgs.status !== 0, `Expected non-zero exit, got ${runNoArgs.status}`);
});

test('LG-2. exit code is exactly 1', () => {
  assert(runNoArgs.status === 1, `Expected exit code 1, got ${runNoArgs.status}`);
});

test('LG-3. BLOCKED message present in stderr', () => {
  assertContains(runNoArgs.stderr, EXPECTED_BLOCKED, 'BLOCKED message');
});

test('LG-4. FROZEN message present in stderr', () => {
  assertContains(runNoArgs.stderr, EXPECTED_FROZEN, 'FROZEN message');
});

test('LG-5. canonical V3 generator path present in stderr', () => {
  assertContains(runNoArgs.stderr, EXPECTED_V3_PATH, 'V3 generator path');
});

test('LG-6. no service×city output on stdout', () => {
  assert(
    runNoArgs.stdout.trim() === '' || runNoArgs.stdout.length < 5,
    `Expected empty stdout, got: ${runNoArgs.stdout.slice(0,100)}`
  );
});

// --dry-run must also be blocked
const runDryRun = runLegacy(['--dry-run']);
test('LG-7. --dry-run flag also blocked (exit 1)', () => {
  assert(runDryRun.status === 1, `Expected exit 1 with --dry-run, got ${runDryRun.status}`);
});

// --force must also be blocked
const runForce = runLegacy(['--force']);
test('LG-8. --force flag also blocked (exit 1)', () => {
  assert(runForce.status === 1, `Expected exit 1 with --force, got ${runForce.status}`);
});

// targeted invocation must also be blocked
const runTargeted = runLegacy(['--service=plombier', '--city=casablanca']);
test('LG-9. targeted --service/--city invocation also blocked (exit 1)', () => {
  assert(runTargeted.status === 1, `Expected exit 1 for targeted invocation, got ${runTargeted.status}`);
});

/* ── Test section 2: No filesystem mutation ─────────────────────────────── */
console.log('\n── Section 2: No filesystem mutation ─────────────────────────');

const mtimesBefore = snapshotMtimes();

// Re-run legacy to confirm no writes happened
runLegacy([]);

const mtimesAfter = snapshotMtimes();

test('LG-10. plombier-casablanca.html mtime unchanged after guard invocation', () => {
  if (mtimesBefore['plombier-casablanca.html'] !== undefined) {
    assert(
      mtimesBefore['plombier-casablanca.html'] === mtimesAfter['plombier-casablanca.html'],
      'plombier-casablanca.html was modified'
    );
  }
  // If file didn't exist before, that's fine — guard still passed
});

test('LG-11. electricien-rabat.html mtime unchanged after guard invocation', () => {
  if (mtimesBefore['electricien-rabat.html'] !== undefined) {
    assert(
      mtimesBefore['electricien-rabat.html'] === mtimesAfter['electricien-rabat.html'],
      'electricien-rabat.html was modified'
    );
  }
});

test('LG-12. menuisier-casablanca.html mtime unchanged after guard invocation', () => {
  if (mtimesBefore['menuisier-casablanca.html'] !== undefined) {
    assert(
      mtimesBefore['menuisier-casablanca.html'] === mtimesAfter['menuisier-casablanca.html'],
      'menuisier-casablanca.html was modified'
    );
  }
});

test('LG-13. menuisier-sale.html mtime unchanged after guard invocation', () => {
  if (mtimesBefore['menuisier-sale.html'] !== undefined) {
    assert(
      mtimesBefore['menuisier-sale.html'] === mtimesAfter['menuisier-sale.html'],
      'menuisier-sale.html was modified'
    );
  }
});

/* ── Test section 3: V3 generator still operational ─────────────────────── */
console.log('\n── Section 3: V3 generator still operational ─────────────────');

test('LG-14. V3 generator entry-point file exists on disk', () => {
  const exists = fs.existsSync(V3_GENERATOR);
  assert(exists, 'generate-service-cities-v3.js does not exist');
});

test('LG-15. service-city-v3.js V3 generator produces valid output (plombier × casablanca)', () => {
  const { generateServiceCityPage } = require(
    path.join(ROOT, 'seo', 'generators', 'service-city-v3.js')
  );
  const result = generateServiceCityPage({
    serviceSlug: 'plombier',
    citySlug:    'casablanca',
    artisanRecords: [{
      name:       'Test Artisan',
      publicSlug: 'test-artisan-casa-001',
      priceLabel: '200 DH',
    }],
  });
  assert(result && result.html, 'V3 generator returned no html');
  // body class is emitted as class="seo-service-page" on the <body> tag
  assertContains(result.html, 'class="seo-service-page"', 'V3 html missing seo-service-page body class');
  assertContains(result.html, '/plombier/casablanca', 'V3 html missing canonical path');
});

/* ── Test section 4: No package/build/deploy dependency ─────────────────── */
console.log('\n── Section 4: No active tooling dependency on legacy generator ─');

test('LG-16. scripts/generate-lps.js has no module.exports', () => {
  const src = fs.readFileSync(LEGACY_SCRIPT, 'utf8');
  assertNotContains(src, 'module.exports', 'module.exports found — file may be imported by other scripts');
});

test('LG-17. vercel.json does not reference generate-lps', () => {
  const vercelJson = path.join(ROOT, 'vercel.json');
  const src = fs.readFileSync(vercelJson, 'utf8');
  assertNotContains(src, 'generate-lps', 'vercel.json references generate-lps');
});

test('LG-18. api/package.json scripts do not reference generate-lps', () => {
  const pkgPath = path.join(ROOT, 'api', 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const scripts = JSON.stringify(pkg.scripts || {});
    assertNotContains(scripts, 'generate-lps', 'api/package.json scripts reference generate-lps');
  }
  // No root package.json exists — skip
});

test('LG-19. no other JS file requires/imports generate-lps', () => {
  // Walk seo/generators/ and scripts/ for any require/import of generate-lps
  const THIS_FILE = path.resolve(__filename);
  const dirs = [
    path.join(ROOT, 'seo'),
    path.join(ROOT, 'scripts'),
  ];
  // Match actual require/import call syntax — not comments or string literals in test descriptions
  const pattern = /require\s*\(['"`][^'"`]*generate-lps|import\s+.*from\s+['"`][^'"`]*generate-lps/;
  let violations = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory() && entry !== 'node_modules') { walk(full); continue; }
      if (!entry.endsWith('.js')) continue;
      if (full === LEGACY_SCRIPT) continue; // skip self-reference in comments
      if (full === THIS_FILE) continue;     // skip this test file
      const src = fs.readFileSync(full, 'utf8');
      if (pattern.test(src)) violations.push(full);
    }
  }
  dirs.forEach(walk);
  assert(violations.length === 0, `Found require/import of generate-lps in: ${violations.join(', ')}`);
});

/* ── Test section 5: Legacy source preserved below guard ─────────────────── */
console.log('\n── Section 5: Legacy source integrity ─────────────────────────');

test('LG-20. legacy source (CITY_DATA) is still present below the guard', () => {
  const src = fs.readFileSync(LEGACY_SCRIPT, 'utf8');
  assertContains(src, 'const CITIES = {', 'CITIES data missing — legacy source was deleted');
  assertContains(src, 'const SERVICES = {', 'SERVICES data missing — legacy source was deleted');
});

test('LG-21. safety guard IIFE is present and identifiable', () => {
  const src = fs.readFileSync(LEGACY_SCRIPT, 'utf8');
  assertContains(src, 'legacyGeneratorGuard', 'Guard IIFE name missing');
  assertContains(src, 'process.exit(1)', 'process.exit(1) missing from guard');
  assertContains(src, 'SAFETY GUARD', 'SAFETY GUARD comment missing');
});

/* ── Summary ─────────────────────────────────────────────────────────────── */
console.log(`\nTotal tests : ${passed + failed}`);
console.log(`  Passed    : ${passed}`);
console.log(`  Failed    : ${failed}`);

if (failed > 0) {
  console.log('\nFailed tests:');
  failures.forEach(f => console.log(`  ❌ ${f.label}\n     ${f.error}`));
  process.exit(1);
} else {
  console.log('\n✅ All tests passed.\n');
}
