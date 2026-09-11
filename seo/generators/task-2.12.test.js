'use strict';
/**
 * task-2.12.test.js
 * =================
 * Task 2.12 — Harden SEO V3 Public Asset Contract
 *
 * Tests (25 total):
 *
 * Asset contract (1–10):
 *   1.  sync-v3-css.js exists and requires cleanly
 *   2.  V3_CSS_ASSETS allowlist contains exactly the 3 expected entries
 *   3.  seo/assets/seo-v3.css exists (canonical source)
 *   4.  seo/assets/service-hub-v3.css exists (canonical source)
 *   5.  seo/assets/artisan-card-v3.css exists (canonical source)
 *   6.  css/seo-v3.css exists (public copy)
 *   7.  css/service-hub-v3.css exists (public copy)
 *   8.  css/artisan-card-v3.css exists (public copy)
 *   9.  css/seo-v3.css is byte-identical to seo/assets/seo-v3.css
 *   10. css/service-hub-v3.css is byte-identical to seo/assets/service-hub-v3.css
 *   11. css/artisan-card-v3.css is byte-identical to seo/assets/artisan-card-v3.css
 *
 * Sync helper behaviour (12–16):
 *   12. sync run() is idempotent — second run produces identical hashes
 *   13. sync run() returns result array with status OK for all 3 assets
 *   14. sync run() in check-only mode does not modify file mtimes
 *   15. sync run() throws clearly when a source file is missing
 *   16. sync V3_CSS_ASSETS touches only its allowlist — no other css/ files modified
 *
 * Generator URL contract (17–20):
 *   17. service-city-v3 generates /css/seo-v3.css (no /seo/assets/)
 *   18. service-city-v3 generates /css/artisan-card-v3.css (no /seo/assets/)
 *   19. service-hub-v3 generates /css/seo-v3.css
 *   20. service-hub-v3 generates /css/service-hub-v3.css
 *
 * Zero /seo/assets/ in generated HTML (21–22):
 *   21. hub generated HTML contains zero /seo/assets/ references
 *   22. service-city pilot HTML contains zero /seo/assets/ references
 *
 * Regression suites (23–25):
 *   23. task-2.10 / task-2.10a regression suites pass
 *   24. service-city-v3 pilot generates successfully
 *   25. service-hub-v3 generator produces 8 clean hubs
 */

const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');

// ── Helpers ───────────────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passCount++;
    console.log(`  ✅  ${passCount + failCount}. ${name}`);
  } catch (e) {
    failCount++;
    failures.push({ name, error: e.message });
    console.error(`  ❌  ${passCount + failCount}. ${name}`);
    console.error(`       ${e.message}`);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEquals(a, b, msg) {
  if (a !== b) throw new Error(msg || `expected ${JSON.stringify(a)} === ${JSON.stringify(b)}`);
}
function assertContains(s, sub, msg) {
  if (!s.includes(sub)) throw new Error(msg || `Expected to contain: ${JSON.stringify(sub)}`);
}
function assertNotContains(s, sub, msg) {
  if (s.includes(sub)) throw new Error(msg || `Must NOT contain: ${JSON.stringify(sub)}`);
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function readHex(relPath) {
  return sha256(fs.readFileSync(path.join(ROOT, relPath)));
}

// ── Load modules ──────────────────────────────────────────────────────────────

const syncModule  = require('./sync-v3-css');
const { generateServiceHubPage } = require('./service-hub-v3');
const { generateServiceCityPage } = require('./service-city-v3');

// Minimal artisan fixture for service-city pilot
// Field names match the artisanRecords contract in service-city-v3.js
// Required: name (string). Optional: profile_slug, photo_url, description.
// Forbidden fields (buildArtisanCard rejects): id, rating, review_count, phone, etc.
const PILOT_ARTISANS = [
  {
    name:         'Ali B.',
    profile_slug: 'ali-b',
    photo_url:    null,
    description:  null,
  },
  {
    name:         'Rachid M.',
    profile_slug: 'rachid-m',
    photo_url:    null,
    description:  null,
  },
];

console.log('\ntask-2.12.test.js — Harden SEO V3 Public Asset Contract\n');

// ── 1–5: Source assets ────────────────────────────────────────────────────────
console.log('── 1–5. Source assets ──────────────────────────────────────────');

test('1. sync-v3-css.js exists and requires cleanly', () => {
  assert(typeof syncModule.run === 'function',          'sync.run must be a function');
  assert(Array.isArray(syncModule.V3_CSS_ASSETS),       'sync.V3_CSS_ASSETS must be an array');
});

test('2. V3_CSS_ASSETS allowlist contains exactly 3 expected entries', () => {
  const names = syncModule.V3_CSS_ASSETS.map(a => a.name);
  assertEquals(names.length, 3, `Expected 3 entries, got ${names.length}`);
  assert(names.includes('seo-v3.css'),          'allowlist must include seo-v3.css');
  assert(names.includes('service-hub-v3.css'),  'allowlist must include service-hub-v3.css');
  assert(names.includes('artisan-card-v3.css'), 'allowlist must include artisan-card-v3.css');
  // Each entry has source and public fields
  syncModule.V3_CSS_ASSETS.forEach(a => {
    assert(a.source && a.source.startsWith('seo/assets/'), `${a.name}: source must be under seo/assets/`);
    assert(a.public && a.public.startsWith('css/'),        `${a.name}: public must be under css/`);
  });
});

test('3. seo/assets/seo-v3.css exists (canonical source)', () => {
  assert(fs.existsSync(path.join(ROOT, 'seo/assets/seo-v3.css')));
});

test('4. seo/assets/service-hub-v3.css exists (canonical source)', () => {
  assert(fs.existsSync(path.join(ROOT, 'seo/assets/service-hub-v3.css')));
});

test('5. seo/assets/artisan-card-v3.css exists (canonical source)', () => {
  assert(fs.existsSync(path.join(ROOT, 'seo/assets/artisan-card-v3.css')));
});

// ── 6–11: Public copies ───────────────────────────────────────────────────────
console.log('── 6–11. Public copies ─────────────────────────────────────────');

test('6. css/seo-v3.css exists (public copy)', () => {
  assert(fs.existsSync(path.join(ROOT, 'css/seo-v3.css')));
});

test('7. css/service-hub-v3.css exists (public copy)', () => {
  assert(fs.existsSync(path.join(ROOT, 'css/service-hub-v3.css')));
});

test('8. css/artisan-card-v3.css exists (public copy)', () => {
  assert(fs.existsSync(path.join(ROOT, 'css/artisan-card-v3.css')));
});

test('9. css/seo-v3.css is byte-identical to seo/assets/seo-v3.css', () => {
  const srcHash = readHex('seo/assets/seo-v3.css');
  const pubHash = readHex('css/seo-v3.css');
  assertEquals(srcHash, pubHash, `Hash mismatch:\n  src: ${srcHash}\n  pub: ${pubHash}`);
});

test('10. css/service-hub-v3.css is byte-identical to seo/assets/service-hub-v3.css', () => {
  const srcHash = readHex('seo/assets/service-hub-v3.css');
  const pubHash = readHex('css/service-hub-v3.css');
  assertEquals(srcHash, pubHash, `Hash mismatch:\n  src: ${srcHash}\n  pub: ${pubHash}`);
});

test('11. css/artisan-card-v3.css is byte-identical to seo/assets/artisan-card-v3.css', () => {
  const srcHash = readHex('seo/assets/artisan-card-v3.css');
  const pubHash = readHex('css/artisan-card-v3.css');
  assertEquals(srcHash, pubHash, `Hash mismatch:\n  src: ${srcHash}\n  pub: ${pubHash}`);
});

// ── 12–16: Sync helper behaviour ─────────────────────────────────────────────
console.log('── 12–16. Sync helper behaviour ────────────────────────────────');

test('12. sync run() is idempotent — second run produces identical hashes', () => {
  const r1 = syncModule.run({ silent: true });
  const r2 = syncModule.run({ silent: true });
  assertEquals(r1.length, r2.length, 'result lengths differ');
  r1.forEach((a, i) => {
    assertEquals(a.hash, r2[i].hash, `Hash changed between runs for ${a.name}`);
  });
});

test('13. sync run() returns result array with status OK for all 3 assets', () => {
  const results = syncModule.run({ silent: true });
  assertEquals(results.length, 3, `Expected 3 results, got ${results.length}`);
  results.forEach(r => {
    assertEquals(r.status, 'OK', `Asset ${r.name} did not return OK status`);
    assert(r.hash && r.hash.length === 64, `Asset ${r.name} missing/invalid hash`);
    assert(r.size > 0, `Asset ${r.name} size must be > 0`);
  });
});

test('14. sync run() in check-only mode does not modify file mtimes', () => {
  const pubPath = path.join(ROOT, 'css/artisan-card-v3.css');
  const mtimeBefore = fs.statSync(pubPath).mtimeMs;
  syncModule.run({ checkOnly: true, silent: true });
  const mtimeAfter = fs.statSync(pubPath).mtimeMs;
  assertEquals(mtimeBefore, mtimeAfter, 'check-only mode must not modify file mtime');
});

test('15. sync run() throws clearly when a source file is missing', () => {
  // Temporarily rename source to simulate missing
  const srcPath    = path.join(ROOT, 'seo/assets/artisan-card-v3.css');
  const tmpPath    = srcPath + '.tmp_test_backup';
  fs.renameSync(srcPath, tmpPath);
  let threw = false;
  let errMsg = '';
  try {
    syncModule.run({ silent: true });
  } catch (e) {
    threw = true;
    errMsg = e.message;
  } finally {
    fs.renameSync(tmpPath, srcPath); // always restore
  }
  assert(threw, 'sync.run() must throw when source file is missing');
  assert(errMsg.includes('FATAL') || errMsg.includes('missing'), `Error must mention FATAL or missing: ${errMsg}`);
});

test('16. sync V3_CSS_ASSETS touches only its allowlist — no other css/ files modified', () => {
  // Collect mtimes of non-V3 css files before
  const allowlisted = new Set(syncModule.V3_CSS_ASSETS.map(a => path.basename(a.public)));
  const cssDir = path.join(ROOT, 'css');
  const otherFiles = fs.readdirSync(cssDir)
    .filter(f => f.endsWith('.css') && !allowlisted.has(f));
  const mtimesBefore = {};
  otherFiles.forEach(f => {
    mtimesBefore[f] = fs.statSync(path.join(cssDir, f)).mtimeMs;
  });
  syncModule.run({ silent: true });
  otherFiles.forEach(f => {
    const after = fs.statSync(path.join(cssDir, f)).mtimeMs;
    assertEquals(mtimesBefore[f], after, `sync must not touch non-V3 css file: ${f}`);
  });
});

// ── 17–20: Generator URL contract ────────────────────────────────────────────
console.log('── 17–20. Generator URL contract ───────────────────────────────');

// Generate service-city pilot once
let pilotHtml = '';
let pilotErr  = null;
try {
  const result = generateServiceCityPage({
    serviceSlug:   'plombier',
    citySlug:      'casablanca',
    artisanRecords: PILOT_ARTISANS,
  });
  pilotHtml = result.html;
} catch (e) {
  pilotErr = e;
}

// Generate hub pilot once
let hubHtml = '';
let hubErr  = null;
try {
  const result = generateServiceHubPage({ serviceSlug: 'plombier' });
  hubHtml = result.html;
} catch (e) {
  hubErr = e;
}

test('17. service-city-v3 generates /css/seo-v3.css (not /seo/assets/)', () => {
  if (pilotErr) throw new Error(`Pilot generation failed: ${pilotErr.message}`);
  assertContains(pilotHtml,    '/css/seo-v3.css',         'service-city must reference /css/seo-v3.css');
  assertNotContains(pilotHtml, '/seo/assets/seo-v3.css',  'service-city must NOT reference /seo/assets/seo-v3.css');
});

test('18. service-city-v3 generates /css/artisan-card-v3.css (not /seo/assets/)', () => {
  if (pilotErr) throw new Error(`Pilot generation failed: ${pilotErr.message}`);
  assertContains(pilotHtml,    '/css/artisan-card-v3.css',         'service-city must reference /css/artisan-card-v3.css');
  assertNotContains(pilotHtml, '/seo/assets/artisan-card-v3.css',  'service-city must NOT reference /seo/assets/artisan-card-v3.css');
});

test('19. service-hub-v3 generates /css/seo-v3.css', () => {
  if (hubErr) throw new Error(`Hub generation failed: ${hubErr.message}`);
  assertContains(hubHtml,    '/css/seo-v3.css',        'hub must reference /css/seo-v3.css');
  assertNotContains(hubHtml, '/seo/assets/seo-v3.css', 'hub must NOT reference /seo/assets/seo-v3.css');
});

test('20. service-hub-v3 generates /css/service-hub-v3.css', () => {
  if (hubErr) throw new Error(`Hub generation failed: ${hubErr.message}`);
  assertContains(hubHtml,    '/css/service-hub-v3.css',        'hub must reference /css/service-hub-v3.css');
  assertNotContains(hubHtml, '/seo/assets/service-hub-v3.css', 'hub must NOT reference /seo/assets/service-hub-v3.css');
});

// ── 21–22: Zero /seo/assets/ in all generated HTML ───────────────────────────
console.log('── 21–22. Zero /seo/assets/ in generated HTML ──────────────────');

test('21. hub generated HTML contains zero /seo/assets/ references', () => {
  if (hubErr) throw new Error(`Hub generation failed: ${hubErr.message}`);
  assertNotContains(hubHtml, '/seo/assets/', 'hub HTML must contain zero /seo/assets/ references');
});

test('22. service-city pilot HTML contains zero /seo/assets/ references', () => {
  if (pilotErr) throw new Error(`Pilot generation failed: ${pilotErr.message}`);
  assertNotContains(pilotHtml, '/seo/assets/', 'service-city HTML must contain zero /seo/assets/ references');
});

// ── 23–25: Regression suites ─────────────────────────────────────────────────
console.log('── 23–25. Regression suites ────────────────────────────────────');

test('23. task-2.10 / task-2.10a regression suites pass', () => {
  const r10 = execSync('node seo/generators/task-2.10.test.js 2>&1', { cwd: ROOT }).toString();
  assert(r10.includes('Passed    : 45') && r10.includes('Failed    : 0'),
    `task-2.10 regression:\n${r10.slice(-300)}`);
  const r10a = execSync('node seo/generators/task-2.10a.test.js 2>&1', { cwd: ROOT }).toString();
  assert(r10a.includes('Passed    : 20') && r10a.includes('Failed    : 0'),
    `task-2.10a regression:\n${r10a.slice(-300)}`);
});

test('24. service-city-v3 pilot generates successfully', () => {
  if (pilotErr) throw new Error(`service-city-v3 pilot generation failed: ${pilotErr.message}`);
  assert(pilotHtml.length > 5000, `Pilot HTML too short (${pilotHtml.length} bytes)`);
  assertContains(pilotHtml, 'Plomberie',   'pilot must mention service label');
  assertContains(pilotHtml, 'Casablanca',  'pilot must mention city label');
  assertContains(pilotHtml, 'fxseo-card-v3', 'pilot must include artisan cards');
});

test('25. service-hub-v3 generator produces 8 clean hubs', () => {
  if (hubErr) throw new Error(`Hub generation failed: ${hubErr.message}`);
  assert(hubHtml.length > 10000, `Hub HTML too short (${hubHtml.length} bytes)`);
  // Spot-check for all 8 slugs via direct generation
  const slugs = ['plombier','electricien','serrurier','climatisation','peintre','menuisier','macon','nettoyage'];
  slugs.forEach(slug => {
    const r = generateServiceHubPage({ serviceSlug: slug });
    assert(r.html.length > 5000, `${slug}.html too short`);
    assertNotContains(r.html, '/seo/assets/', `${slug}.html must not reference /seo/assets/`);
    assertContains(r.html, '/css/seo-v3.css', `${slug}.html must reference /css/seo-v3.css`);
  });
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\nTotal tests : ${passCount + failCount}`);
console.log(`  Passed    : ${passCount}`);
console.log(`  Failed    : ${failCount}`);

if (failures.length) {
  console.log('\nFailed tests:');
  failures.forEach(f => console.log(`  ❌ ${f.name}\n     ${f.error}`));
  process.exit(1);
} else {
  console.log('\n✅ All tests passed.');
  process.exit(0);
}
