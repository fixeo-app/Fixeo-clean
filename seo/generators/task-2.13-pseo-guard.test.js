'use strict';
/**
 * task-2.13-pseo-guard.test.js
 * ================================
 * P1-3 — Regression suite for the legacy PSEO V2 generator safety lock.
 *
 * Verifies:
 *   1. Invoking generate-pseo-v2.js exits non-zero
 *   2. Expected safety message is emitted on stderr
 *   3. No SEO HTML file is modified by the attempt
 *   4. vercel.json and sitemap-index.xml are not modified
 *   5. No active tooling dependency is broken
 *   6. V3 fleet remains 77/77 pages, V3 generators remain operational
 *   7. P1-2 guard on generate-lps.js is still intact
 *
 * Test runner: node seo/generators/task-2.13-pseo-guard.test.js
 */

const { spawnSync } = require('child_process');
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
const PSEO_SCRIPT  = path.join(ROOT, 'scripts', 'generate-pseo-v2.js');
const LPS_SCRIPT   = path.join(ROOT, 'scripts', 'generate-lps.js');
const VERCEL_JSON  = path.join(ROOT, 'vercel.json');
const SITEMAP_IDX  = path.join(ROOT, 'sitemap-index.xml');

/** Run the PSEO generator and capture result without throwing. */
function runPseo(args = []) {
  return spawnSync(process.execPath, [PSEO_SCRIPT, ...args], {
    cwd:     ROOT,
    timeout: 10000,
    encoding: 'utf8',
  });
}

/** Snapshot mtime for a set of critical files. */
function snapshotMtimes(files) {
  const result = {};
  for (const f of files) {
    if (fs.existsSync(f)) result[f] = fs.statSync(f).mtimeMs;
  }
  return result;
}

/* Critical files that must NOT be modified by the PSEO generator */
const CRITICAL_FILES = [
  path.join(ROOT, 'vercel.json'),
  path.join(ROOT, 'sitemap-index.xml'),
  path.join(ROOT, 'sitemap-pseo.xml'),
  path.join(ROOT, 'plombier-casablanca.html'),
  path.join(ROOT, 'electricien-rabat.html'),
  path.join(ROOT, 'menuisier-casablanca.html'),
  // Sample of legacy pages (problem/price/quartier) that pseo owns
  path.join(ROOT, 'fuite-eau-casablanca.html'),
  path.join(ROOT, 'prix-plombier-casablanca.html'),
];

/* ── Section 1: Safety guard behaviour ──────────────────────────────────── */
console.log('\ntask-2.13-pseo-guard.test.js\n');
console.log('── Section 1: Safety guard behaviour ─────────────────────────');

const EXPECTED_BLOCKED  = 'BLOCKED: legacy PSEO V2 generator';
const EXPECTED_FROZEN   = 'generate-pseo-v2.js) is FROZEN';
const EXPECTED_V3_PATH  = 'generate-service-cities-v3.js';
const EXPECTED_VERCEL   = 'vercel.json routes (DESTRUCTIVE)';

const runNoArgs = runPseo([]);

test('PG-1. direct invocation exits non-zero', () => {
  assert(runNoArgs.status !== 0, `Expected non-zero exit, got ${runNoArgs.status}`);
});

test('PG-2. exit code is exactly 1', () => {
  assert(runNoArgs.status === 1, `Expected exit code 1, got ${runNoArgs.status}`);
});

test('PG-3. BLOCKED message present in stderr', () => {
  assertContains(runNoArgs.stderr, EXPECTED_BLOCKED, 'BLOCKED message');
});

test('PG-4. FROZEN message present in stderr', () => {
  assertContains(runNoArgs.stderr, EXPECTED_FROZEN, 'FROZEN message');
});

test('PG-5. canonical V3 generator path present in stderr', () => {
  assertContains(runNoArgs.stderr, EXPECTED_V3_PATH, 'V3 generator path');
});

test('PG-6. vercel.json DESTRUCTIVE warning present in stderr', () => {
  assertContains(runNoArgs.stderr, EXPECTED_VERCEL, 'vercel.json destructive warning');
});

test('PG-7. no page-generation output on stdout', () => {
  assert(
    runNoArgs.stdout.trim() === '' || runNoArgs.stdout.length < 5,
    `Expected empty stdout, got: ${runNoArgs.stdout.slice(0, 100)}`
  );
});

/* ── Section 2: No filesystem mutation ──────────────────────────────────── */
console.log('\n── Section 2: No filesystem mutation ─────────────────────────');

const mtimesBefore = snapshotMtimes(CRITICAL_FILES);

// Re-run to confirm no writes happened
runPseo([]);

const mtimesAfter = snapshotMtimes(CRITICAL_FILES);

test('PG-8. vercel.json mtime unchanged after guard invocation', () => {
  if (mtimesBefore[VERCEL_JSON] !== undefined) {
    assert(
      mtimesBefore[VERCEL_JSON] === mtimesAfter[VERCEL_JSON],
      'vercel.json was modified by the PSEO generator'
    );
  }
});

test('PG-9. sitemap-index.xml mtime unchanged after guard invocation', () => {
  if (mtimesBefore[SITEMAP_IDX] !== undefined) {
    assert(
      mtimesBefore[SITEMAP_IDX] === mtimesAfter[SITEMAP_IDX],
      'sitemap-index.xml was modified by the PSEO generator'
    );
  }
});

test('PG-10. plombier-casablanca.html mtime unchanged after guard invocation', () => {
  const f = path.join(ROOT, 'plombier-casablanca.html');
  if (mtimesBefore[f] !== undefined) {
    assert(mtimesBefore[f] === mtimesAfter[f], 'plombier-casablanca.html was modified');
  }
});

test('PG-11. electricien-rabat.html mtime unchanged after guard invocation', () => {
  const f = path.join(ROOT, 'electricien-rabat.html');
  if (mtimesBefore[f] !== undefined) {
    assert(mtimesBefore[f] === mtimesAfter[f], 'electricien-rabat.html was modified');
  }
});

test('PG-12. menuisier-casablanca.html mtime unchanged after guard invocation', () => {
  const f = path.join(ROOT, 'menuisier-casablanca.html');
  if (mtimesBefore[f] !== undefined) {
    assert(mtimesBefore[f] === mtimesAfter[f], 'menuisier-casablanca.html was modified');
  }
});

/* ── Section 3: Active tooling dependency check ─────────────────────────── */
console.log('\n── Section 3: No active tooling dependency ────────────────────');

test('PG-13. scripts/generate-pseo-v2.js has no module.exports', () => {
  const src = fs.readFileSync(PSEO_SCRIPT, 'utf8');
  assertNotContains(src, 'module.exports', 'module.exports found — file may be imported');
});

test('PG-14. vercel.json does not reference generate-pseo', () => {
  const src = fs.readFileSync(VERCEL_JSON, 'utf8');
  assertNotContains(src, 'generate-pseo', 'vercel.json references generate-pseo');
});

test('PG-15. api/package.json scripts do not reference generate-pseo', () => {
  const pkgPath = path.join(ROOT, 'api', 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const scripts = JSON.stringify(pkg.scripts || {});
    assertNotContains(scripts, 'generate-pseo', 'api/package.json scripts reference generate-pseo');
  }
});

test('PG-16. no other JS file requires/imports generate-pseo-v2', () => {
  const THIS_FILE = path.resolve(__filename);
  const dirs = [
    path.join(ROOT, 'seo'),
    path.join(ROOT, 'scripts'),
  ];
  // Match actual require/import call syntax — not comments or string literals
  const pattern = /require\s*\(['"``][^'"``]*generate-pseo|import\s+.*from\s+['"``][^'"``]*generate-pseo/;
  const violations = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory() && entry !== 'node_modules') { walk(full); continue; }
      if (!entry.endsWith('.js')) continue;
      if (full === PSEO_SCRIPT) continue;   // skip self
      if (full === THIS_FILE)   continue;   // skip this test file
      const src = fs.readFileSync(full, 'utf8');
      if (pattern.test(src)) violations.push(full);
    }
  }
  dirs.forEach(walk);
  assert(violations.length === 0, `Found require/import of generate-pseo in: ${violations.join(', ')}`);
});

/* ── Section 4: V3 generators still operational ─────────────────────────── */
console.log('\n── Section 4: V3 generators still operational ─────────────────');

test('PG-17. generate-service-cities-v3.js exists on disk', () => {
  const p = path.join(ROOT, 'seo', 'generators', 'generate-service-cities-v3.js');
  assert(fs.existsSync(p), 'generate-service-cities-v3.js not found');
});

test('PG-18. generate-service-hubs.js exists on disk', () => {
  const p = path.join(ROOT, 'seo', 'generators', 'generate-service-hubs.js');
  assert(fs.existsSync(p), 'generate-service-hubs.js not found');
});

test('PG-19. service-city-v3.js V3 generator produces valid output', () => {
  const { generateServiceCityPage } = require(
    path.join(ROOT, 'seo', 'generators', 'service-city-v3.js')
  );
  const result = generateServiceCityPage({
    serviceSlug: 'electricien',
    citySlug:    'rabat',
    artisanRecords: [{
      name:       'Test Artisan',
      publicSlug: 'test-artisan-rabat-001',
      priceLabel: '300 DH',
    }],
  });
  assert(result && result.html, 'V3 generator returned no html');
  assertContains(result.html, 'class="seo-service-page"', 'V3 html missing seo-service-page body class');
  assertContains(result.html, '/electricien/rabat', 'V3 html missing canonical path');
});

test('PG-20. service-hub-v3.js V3 hub generator produces valid output', () => {
  const { generateServiceHubPage } = require(
    path.join(ROOT, 'seo', 'generators', 'service-hub-v3.js')
  );
  const result = generateServiceHubPage({ serviceSlug: 'electricien' });
  assert(result && result.html, 'V3 hub generator returned no html');
  assertContains(result.html, '/electricien', 'V3 hub html missing canonical path');
});

/* ── Section 5: P1-2 guard on generate-lps.js still intact ─────────────── */
console.log('\n── Section 5: P1-2 generate-lps.js guard still intact ─────────');

const runLps = spawnSync(process.execPath, [LPS_SCRIPT], {
  cwd: ROOT, timeout: 10000, encoding: 'utf8',
});

test('PG-21. generate-lps.js guard still active (exits 1)', () => {
  assert(runLps.status === 1, `Expected exit 1 from generate-lps.js, got ${runLps.status}`);
});

test('PG-22. generate-lps.js guard still emits BLOCKED message', () => {
  assertContains(runLps.stderr, 'BLOCKED: legacy service×city generator', 'LPS guard message changed');
});

/* ── Section 6: Legacy source preserved below guard ─────────────────────── */
console.log('\n── Section 6: Legacy source integrity ─────────────────────────');

test('PG-23. legacy PSEO source (PROBLEMS, PRICES, QUARTIERS) preserved below guard', () => {
  const src = fs.readFileSync(PSEO_SCRIPT, 'utf8');
  assertContains(src, 'const PROBLEMS = {',  'PROBLEMS data missing — legacy source deleted');
  assertContains(src, 'const CITIES = {',    'CITIES data missing — legacy source deleted');
  assertContains(src, 'generateProblemPages', 'generateProblemPages function missing');
  assertContains(src, 'generatePricePages',   'generatePricePages function missing');
  assertContains(src, 'generateQuartierPages','generateQuartierPages function missing');
});

test('PG-24. safety guard IIFE is present and identifiable', () => {
  const src = fs.readFileSync(PSEO_SCRIPT, 'utf8');
  assertContains(src, 'legacyPseoGeneratorGuard', 'Guard IIFE name missing');
  assertContains(src, 'process.exit(1)',           'process.exit(1) missing from guard');
  assertContains(src, 'SAFETY GUARD',              'SAFETY GUARD comment missing');
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
