'use strict';
/**
 * task-2.8a.test.js — Broken Hub Problem Link Prevention
 * =======================================================
 * Task 2.8A — Proves the two-layer gate in _buildProblemsHtml:
 *   Layer 1: slug exists in problems.json (data existence)
 *   Layer 2: slug is in publishedProblemSlugs (URL existence / live route)
 *
 * 18 required spec tests.
 */

const path = require('path');
const { execSync } = require('child_process');
const sh = require('./service-hub-v3');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0; let failed = 0; const failures = [];
function test(label, fn) {
  try { fn(); process.stdout.write(`  ✅  ${label}\n`); passed++; }
  catch (e) { process.stdout.write(`  ❌  ${label}\n      ${e.message}\n`); failures.push({ label, error: e.message }); failed++; }
}
function assert(cond, msg)             { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertContains(s, sub, msg)   { if (!s.includes(sub)) throw new Error(msg || `Expected: ${JSON.stringify(sub)}`); }
function assertNotContains(s, sub, msg){ if (s.includes(sub))  throw new Error(msg || `Must NOT: ${JSON.stringify(sub)}`); }
function assertEquals(a, b, msg)       { if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

const HUB = sh.generateServiceHubPage({ serviceSlug: 'plombier' });

console.log('\ntask-2.8a.test.js — Broken Hub Problem Link Prevention\n');

// ── 1–4: Routing reality (pre-conditions) ─────────────────────────────────
console.log('── 1–4. Routing reality pre-conditions ────────────────────────');

test('1. no /probleme/ links emitted in current hub output', () => {
  const links = HUB.html.match(/href="[^"]*probleme[^"]*"/g) || [];
  assertEquals(links.length, 0, 'No /probleme/ href must appear in hub HTML. Found: ' + links.join(', '));
});

test('2. problems.json entries exist (data exists) but no public route does', () => {
  const problems = require('../data/problems.json');
  const fs = require('fs');
  const plombierProblems = Object.values(problems)
    .filter(p => p.parent_service_route === '/plombier');
  // Data exists
  assert(plombierProblems.length >= 2, 'Must have at least 2 plombier problems in problems.json');
  // No HTML files for any of them
  plombierProblems.forEach(p => {
    const htmlFile = path.join(ROOT, `probleme-${p.slug}.html`);
    assert(!fs.existsSync(htmlFile), `/probleme-${p.slug}.html must not exist`);
  });
  // No vercel route for /probleme/*
  const vercel = require(path.join(ROOT, 'vercel.json'));
  const hasProblemeRoute = (vercel.routes || []).some(r => r.src && r.src.includes('probleme'));
  assert(!hasProblemeRoute, 'vercel.json must have no /probleme/ route');
});

test('3. publishedProblemSlugs is [] for plombier (no live destinations)', () => {
  assertEquals(
    sh.HUB_CONTENT.plombier.publishedProblemSlugs.length, 0,
    'publishedProblemSlugs must be [] — no problem pages are live yet'
  );
});

test('4. relatedProblemSlugs still contains the data (not deleted from config)', () => {
  const slugs = sh.HUB_CONTENT.plombier.relatedProblemSlugs;
  assert(slugs.includes('fuite-eau'), 'fuite-eau must remain in relatedProblemSlugs');
  assert(slugs.includes('wc-bouche'), 'wc-bouche must remain in relatedProblemSlugs');
});

// ── 5–7: Omission behaviour ────────────────────────────────────────────────
console.log('── 5–7. Omission behaviour ────────────────────────────────────');

test('5. no broken problem link to fuite-eau (not published)', () => {
  assertNotContains(HUB.html, 'href="/probleme/fuite-eau"', 'fuite-eau link must be absent');
});

test('6. no broken problem link to wc-bouche (not published)', () => {
  assertNotContains(HUB.html, 'href="/probleme/wc-bouche"', 'wc-bouche link must be absent');
});

test('7. no broken problem link to chauffe-eau-en-panne (not published)', () => {
  assertNotContains(HUB.html, 'href="/probleme/chauffe-eau-en-panne"', 'chauffe-eau link must be absent');
  assertNotContains(HUB.html, 'chauffe-eau-en-panne', 'chauffe-eau slug must not appear in hub');
});

// ── 8–9: Clean section omission ────────────────────────────────────────────
console.log('── 8–9. Clean section omission ────────────────────────────────');

test('8. empty related-problems set removes section completely', () => {
  assertNotContains(HUB.html, 'fxlp-hub-problems-section', 'Problems section element must be absent');
  assertNotContains(HUB.html, 'fxlp-hub-problem-chips',    'Problem chips container must be absent');
});

test('9. no empty heading or container left behind', () => {
  assertNotContains(HUB.html, 'Problèmes courants',    'Problems section heading must be absent');
  assertNotContains(HUB.html, 'Problèmes fréquents',   'Problems section heading must be absent');
  // No div/section with empty content
  assertNotContains(HUB.html, '<div class="fxlp-hub-problem-chips">', 'No empty chip container');
});

// ── 10–16: Other hub sections unchanged ───────────────────────────────────
console.log('── 10–16. Unaffected hub sections ────────────────────────────');

test('10. /plombier canonical unchanged', () => {
  assertContains(HUB.html, 'rel="canonical" href="https://www.fixeo.ma/plombier"');
});

test('11. city grid unchanged (17 cities)', () => {
  assertEquals(HUB.meta.linkedCityCount, 17, 'Must still have 17 linked cities');
  assertContains(HUB.html, 'fxlp-hub-city-grid', 'City grid must still be present');
  assertContains(HUB.html, 'href="/plombier/casablanca"', 'Casablanca link must still be present');
});

test('12. service-only handoff unchanged', () => {
  assertEquals(HUB.meta.ctaHref, '/?fx_service=plombier&fx_source=seo#hero-quick-search');
  assertNotContains(HUB.html, 'fx_city=', 'No fx_city in hub');
});

test('13. schema still Organization + Service + BreadcrumbList', () => {
  const compact = HUB.html.replace(/\s+/g, ' ');
  assertContains(compact, '"@type": "Organization"');
  assertContains(compact, '"@type": "Service"');
  assertContains(compact, '"@type": "BreadcrumbList"');
});

test('14. no FAQPage schema', () => {
  assertNotContains(HUB.html, 'FAQPage');
});

test('15. no LocalBusiness schema', () => {
  assertNotContains(HUB.html, 'LocalBusiness');
});

test('16. content-guard passes', () => {
  const { check } = require('./shared/content-guard');
  try { check(HUB.html, 'full_html', '/plombier'); }
  catch (e) { throw new Error('content-guard failed: ' + e.message); }
});

// ── 17–18: Regressions ─────────────────────────────────────────────────────
console.log('── 17–18. Regressions ─────────────────────────────────────────');

test('17. all previous Task 2.8 tests still pass (32/32)', () => {
  const r = execSync('node seo/generators/task-2.8.test.js 2>&1', { cwd: ROOT }).toString();
  assert(r.includes('Passed    : 32') && r.includes('Failed    : 0'),
    `task-2.8 regression:\n${r.slice(-200)}`);
});

test('18. all regression suites pass', () => {
  const suites = [
    ['seo/generators/service-hub-v3.test.js',    'Passed    : 42'],
    ['seo/generators/service-city-v3.test.js',   'Passed    : 47'],
    ['seo/generators/shared/seo-head.test.js',   'Passed    : 42'],
    ['seo/generators/shared/page-template.test.js', 'Passed    : 62'],
    ['seo/generators/shared/content-guard.test.js', 'Passed      : 51\n  Failed      : 0'],
    ['js/fixeo-seo-handoff-v1.test.js',          'Passed    : 56'],
  ];
  suites.forEach(([file, expected]) => {
    const r = execSync(`node ${file} 2>&1`, { cwd: ROOT }).toString();
    const passes = r.includes(expected);
    const noFail = !r.match(/Failed\s+: [1-9]/);
    assert(passes && noFail, `${file} failed:\n${r.slice(-200)}`);
  });
});

// Summary
console.log(`\nTotal tests : ${passed + failed}`);
console.log(`  Passed    : ${passed}`);
console.log(`  Failed    : ${failed}`);
if (failed > 0) {
  console.log('\nFailed tests:');
  failures.forEach(f => console.log(`  ❌ ${f.label}\n     ${f.error}`));
  process.exit(1);
} else { console.log('\n✅ All tests passed.\n'); }
