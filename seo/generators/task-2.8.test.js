'use strict';
/**
 * task-2.8.test.js — Architecture Hardening Integration Tests
 * ============================================================
 * Covers the 32 required spec tests for Task 2.8.
 * Validates: CSS extraction, shared removal, shared CTA builder,
 * 8-service genericity, service×city genericity, rich-section stability.
 */

const path = require('path');
const { execSync } = require('child_process');

const sc  = require('./service-city-v3');
const sh  = require('./service-hub-v3');
const { removeFlagshipScript, FLAGSHIP_SCRIPT_TAG } = require('./shared/v3-legacy-removal');
const { buildSeoHandoffHref } = require('./shared/seo-handoff-href');
const services = require('../data/services.json');
const cities   = require('../data/cities.json');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0; let failed = 0; const failures = [];
function test(label, fn) {
  try { fn(); process.stdout.write(`  ✅  ${label}\n`); passed++; }
  catch (e) { process.stdout.write(`  ❌  ${label}\n      ${e.message}\n`); failures.push({ label, error: e.message }); failed++; }
}
function assert(cond, msg)             { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertContains(s, sub, msg)   { if (!s.includes(sub)) throw new Error(msg || `Expected: ${JSON.stringify(sub)}`); }
function assertNotContains(s, sub, msg){ if (s.includes(sub))  throw new Error(msg || `Must NOT contain: ${JSON.stringify(sub)}`); }
function assertEquals(a, b, msg)       { if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function assertThrows(fn, msg)         { let threw=false; try{fn();}catch(_){threw=true;} assert(threw, msg||'Expected to throw'); }

// Generate once for reuse
const HUB = sh.generateServiceHubPage({ serviceSlug: 'plombier' });
const CITY = sc.generateServiceCityPage({ serviceSlug: 'plombier', citySlug: 'casablanca', artisanRecords: [] });

console.log('\ntask-2.8.test.js — Architecture Hardening\n');

// ── 1–4: CSS ownership ─────────────────────────────────────────────────────
console.log('── 1–4. CSS ownership ─────────────────────────────────────────');

test('1. service hub has NO inline hub CSS block', () => {
  assertNotContains(HUB.html, 'data-hub-v3', 'Inline <style data-hub-v3> must be absent');
  assertNotContains(HUB.html, 'const HUB_CSS', 'HUB_CSS JS constant must not appear in output');
});

test('2. service-hub-v3.css is loaded via <link> in hub output', () => {
  assertContains(HUB.html, 'service-hub-v3.css', 'service-hub-v3.css must be in hub <link> tags');
});

test('3. service-hub-v3.css selectors are scoped to body.seo-service-page', () => {
  const fs = require('fs');
  const css = fs.readFileSync(path.join(ROOT, 'seo/assets/service-hub-v3.css'), 'utf8');
  const ruleLines = css.split('\n').filter(l =>
    l.trim() &&
    !l.trim().startsWith('/*') &&
    !l.trim().startsWith('*') &&
    !l.trim().startsWith('@') &&
    !l.trim().startsWith('}') &&
    l.includes('{')
  );
  ruleLines.forEach(line => {
    assert(
      line.includes('body.seo-service-page') || line.includes('@media'),
      `Unscoped rule found: ${line.trim().slice(0, 80)}`
    );
  });
});

test('4. no generic global selector leakage in service-hub-v3.css', () => {
  const fs = require('fs');
  const css = fs.readFileSync(path.join(ROOT, 'seo/assets/service-hub-v3.css'), 'utf8');
  // These global selectors must not appear outside of body.seo-service-page scope
  const forbidden = [/^body\s*\{/, /^html\s*\{/, /^\*\s*\{/, /^a\s*\{/, /^p\s*\{/];
  forbidden.forEach(pat => {
    const lines = css.split('\n').filter(l => pat.test(l.trim()));
    assertEquals(lines.length, 0, `Forbidden global selector found: ${pat}`);
  });
});

// ── 5: Visual hooks still covered ─────────────────────────────────────────
console.log('── 5. Visual hooks ────────────────────────────────────────────');

test('5. hub visual hooks are still present (city grid, needs, how, price)', () => {
  assertContains(HUB.html, 'fxlp-hub-city-grid', 'City grid class must be present');
  assertContains(HUB.html, 'fxlp-hub-needs-grid', 'Needs grid class must be present');
  assertContains(HUB.html, 'fxlp-hub-how-section', 'How-it-works class must be present');
  assertContains(HUB.html, 'fxlp-hub-price-table', 'Price table class must be present');
  // Problem chips: section omitted when publishedProblemSlugs=[] — no broken links emitted
  assertNotContains(HUB.html, 'fxlp-hub-problem-chips', 'Problem chips must be absent (no published problem pages yet)');
});

// ── 6–7: Artisan card ownership ────────────────────────────────────────────
console.log('── 6–7. Artisan card ownership ────────────────────────────────');

test('6. service-city SSR artisan cards unchanged (fxlp-artisan-grid present)', () => {
  // service×city page has the artisan grid element
  assertContains(CITY.html, 'id="fxlp-artisan-grid"', 'Artisan grid element must be present in service×city');
  // artisan-card-v3.css is loaded
  assertContains(CITY.html, 'artisan-card-v3.css', 'artisan-card-v3.css must be loaded');
});

test('7. hub has no artisan grid (card-free by design)', () => {
  assertNotContains(HUB.html, 'fxlp-artisan-grid', 'Hub must have no artisan grid');
  assertNotContains(HUB.html, 'artisan-card-v3.js', 'Hub must not load artisan-card-v3.js');
  assertNotContains(HUB.html, 'class="fxlp-card"', 'Hub must have no artisan card elements');
});

// ── 8–9: Flagship runtime removal ─────────────────────────────────────────
console.log('── 8–9. Flagship runtime removal ──────────────────────────────');

test('8. legacy flagship runtime absent from both V3 families', () => {
  // Check as a <script> tag (CSS link is intentionally kept)
  const cityScripts = (CITY.html.match(/<script[^>]*>/g) || []);
  const hubScripts  = (HUB.html.match(/<script[^>]*>/g) || []);
  const cityHasFlagship = cityScripts.some(s => s.includes('fixeo-local-flagship-v1.js'));
  const hubHasFlagship  = hubScripts.some(s => s.includes('fixeo-local-flagship-v1.js'));
  assert(!cityHasFlagship, 'flagship-v1.js must not be in service×city scripts');
  assert(!hubHasFlagship,  'flagship-v1.js must not be in hub scripts');
});

test('9. removal is exact/deterministic (uses shared v3-legacy-removal, not copy)', () => {
  // Confirm both generators meta.flagshipRemoved=true
  assertEquals(CITY.meta.flagshipRemoved, true, 'city meta.flagshipRemoved must be true');
  assertEquals(HUB.meta.flagshipRemoved, true, 'hub meta.flagshipRemoved must be true');
  // Verify FLAGSHIP_SCRIPT_TAG has exactly 2 leading spaces (matches page-template output)
  assert(FLAGSHIP_SCRIPT_TAG.startsWith('  <script '), 'Tag must have 2 leading spaces');
  // Verify shared module is what both generators import
  const scSrc = require('fs').readFileSync(
    path.join(__dirname, 'service-city-v3.js'), 'utf8');
  const shSrc = require('fs').readFileSync(
    path.join(__dirname, 'service-hub-v3.js'), 'utf8');
  assertContains(scSrc, "require('./shared/v3-legacy-removal')", 'service-city must import shared module');
  assertContains(shSrc, "require('./shared/v3-legacy-removal')", 'service-hub must import shared module');
});

// ── 10–18: CTA handoff builder ─────────────────────────────────────────────
console.log('── 10–18. CTA handoff builder ─────────────────────────────────');

test('10. service×city handoff URL is correct', () => {
  assertEquals(CITY.meta.ctaHref,
    '/?fx_service=plombier&fx_city=casablanca&fx_source=seo#hero-quick-search');
});

test('11. service-only hub handoff URL is correct', () => {
  assertEquals(HUB.meta.ctaHref,
    '/?fx_service=plombier&fx_source=seo#hero-quick-search');
});

test('12. city omitted cleanly when absent (hub)', () => {
  assertNotContains(HUB.meta.ctaHref, 'fx_city', 'fx_city must be absent from hub CTA');
  assertNotContains(HUB.html, 'fx_city=', 'fx_city must not appear anywhere in hub HTML');
});

test('13. invalid service slug rejected by builder', () => {
  assertThrows(() => buildSeoHandoffHref({ serviceSlug: 'PLOMBIER' }));
  assertThrows(() => buildSeoHandoffHref({ serviceSlug: '' }));
  assertThrows(() => buildSeoHandoffHref({ serviceSlug: 'Plomberie' }));
});

test('14. invalid city slug rejected by builder', () => {
  assertThrows(() => buildSeoHandoffHref({ serviceSlug: 'plombier', citySlug: 'Casablanca' }));
  assertThrows(() => buildSeoHandoffHref({ serviceSlug: 'plombier', citySlug: 'Béni Mellal' }));
});

test('15. source validation works', () => {
  assertThrows(() => buildSeoHandoffHref({ serviceSlug: 'plombier', source: 'paid' }));
  assertThrows(() => buildSeoHandoffHref({ serviceSlug: 'plombier', source: '' }));
  // 'seo' must work
  const href = buildSeoHandoffHref({ serviceSlug: 'plombier', source: 'seo' });
  assertContains(href, 'fx_source=seo');
});

test('16. no generic ?service= in builder output', () => {
  const href = buildSeoHandoffHref({ serviceSlug: 'plombier', citySlug: 'casablanca' });
  assertNotContains(href, '?service=');
  assertNotContains(href, '&service=');
});

test('17. no generic ?city= in builder output', () => {
  const href = buildSeoHandoffHref({ serviceSlug: 'plombier', citySlug: 'casablanca' });
  assertNotContains(href, '?city=');
  assertNotContains(href, '&city=');
});

test('18. no RAFI parameters in builder output', () => {
  const href = buildSeoHandoffHref({ serviceSlug: 'plombier', citySlug: 'casablanca' });
  assertNotContains(href, 'modal');
  assertNotContains(href, 'dispatch');
  assertNotContains(href, 'openExpress');
});

// ── 19–20: 8-service hub genericity ───────────────────────────────────────
console.log('── 19–20. 8-service hub genericity ────────────────────────────');

test('19. all 8 canonical services generate without architecture errors', () => {
  // Task 2.9: all 8 services now have HUB_CONTENT — all must generate successfully
  const svcs = Object.keys(services).filter(k => k !== '_meta');
  assertEquals(svcs.length, 8, 'Must have exactly 8 services');

  const errors = [];
  const succeeded = [];
  svcs.forEach(svc => {
    try {
      const r = sh.generateServiceHubPage({ serviceSlug: svc });
      // Must produce a valid HTML page with correct canonical
      assertContains(r.html, `rel="canonical" href="https://www.fixeo.ma/${svc}"`,
        `${svc}: canonical must match /${svc}`);
      succeeded.push(svc);
    } catch (e) {
      errors.push(svc + ': ' + e.message);
    }
  });

  assertEquals(errors.length, 0, 'Architecture errors: ' + errors.join('; '));
  assertEquals(succeeded.length, 8, 'All 8 services must generate successfully after Task 2.9');
});

test('20. all 8 hubs pass content-guard — no fabricated/banned content', () => {
  // Task 2.9: all 8 services have authored HUB_CONTENT — content-guard must pass for all
  const { check } = require('./shared/content-guard');
  const svcs = Object.keys(services).filter(k => k !== '_meta');
  svcs.forEach(svc => {
    const r = sh.generateServiceHubPage({ serviceSlug: svc });
    // Throws if any banned term is found in generated HTML
    check(r.html, 'full_html', '/' + svc);
    // Must not have LocalBusiness or FAQPage
    assertNotContains(r.html, 'LocalBusiness', `${svc}: must not emit LocalBusiness`);
    assertNotContains(r.html, 'FAQPage',       `${svc}: must not emit FAQPage`);
    // Must not have broken problem links
    const problemLinks = r.html.match(/href="[^"]*probleme[^"]*"/g) || [];
    assertEquals(problemLinks.length, 0, `${svc}: no broken /probleme/ links must appear`);
  });
});

// ── 21–23: Service×city genericity ────────────────────────────────────────
console.log('── 21–23. Service×city genericity ────────────────────────────');

test('21. service×city generator has no hidden Casablanca-only routing', () => {
  // Test non-plombier, non-casablanca combinations
  const combos = [
    { serviceSlug: 'electricien', citySlug: 'rabat' },
    { serviceSlug: 'serrurier',   citySlug: 'tanger' },
    { serviceSlug: 'climatisation', citySlug: 'agadir' },
    { serviceSlug: 'peintre',     citySlug: 'fes' },
    { serviceSlug: 'menuisier',   citySlug: 'marrakech' },
    { serviceSlug: 'macon',       citySlug: 'meknes' },
    { serviceSlug: 'nettoyage',   citySlug: 'oujda' },
  ];
  combos.forEach(({ serviceSlug, citySlug }) => {
    const r = sc.generateServiceCityPage({ serviceSlug, citySlug, artisanRecords: [] });
    assert(r.html && r.html.length > 1000, `${serviceSlug}×${citySlug}: must produce real HTML`);
    // Title must use this service+city, not plombier/casablanca
    assertContains(r.html, `<title>${services[serviceSlug].label}`, `${serviceSlug}: title must use correct service label`);
    assertNotContains(r.html.split('<title>')[1]?.split('</title>')[0] || '', 'Plombier', `${serviceSlug}: title must not contain Plombier`);
    // CTA must use correct slugs
    assertContains(r.meta.ctaHref, `fx_service=${serviceSlug}`, `${serviceSlug}: CTA must use correct service slug`);
    assertContains(r.meta.ctaHref, `fx_city=${citySlug}`, `${citySlug}: CTA must use correct city slug`);
  });
});

test('22. publishability policy unchanged (preserve/review/block logic intact)', () => {
  const { decide } = require('./shared/publishability');
  // preserve: existing URL + count >= 1
  const r1 = decide('casablanca', 'plombier', 69, true, cities, services);
  assertEquals(r1.status, 'preserve', 'Existing URL + count >= 1 must be preserve');
  // review: existing URL + count === 0
  const r2 = decide('mohammedia', 'plombier', 0, true, cities, services);
  assertEquals(r2.status, 'review', 'Existing URL + count === 0 must be review');
  // block: new combination, count < threshold
  const r3 = decide('casablanca', 'plombier', 2, false, cities, services);
  assertEquals(r3.status, 'block', 'New combination count=2 must be block (below threshold 3)');
  // publish: new combination, count >= threshold
  const r4 = decide('casablanca', 'plombier', 10, false, cities, services);
  assertEquals(r4.status, 'publish', 'New combination count=10 must be publish');
});

test('23. review/block logic results in correct hub city count (17 preserve, 3 review)', () => {
  assertEquals(HUB.meta.linkedCityCount, 17, 'Must have 17 linked cities');
  assertEquals(HUB.meta.reviewCityCount, 3, 'Must have 3 review cities');
  assert(HUB.meta.reviewCities.includes('mohammedia'), 'mohammedia must be in review');
  assert(HUB.meta.reviewCities.includes('el-jadida'), 'el-jadida must be in review');
  assert(HUB.meta.reviewCities.includes('khouribga'), 'khouribga must be in review');
});

// ── 24–26: Schema ownership ────────────────────────────────────────────────
console.log('── 24–26. Schema ownership ────────────────────────────────────');

test('24. schema ownership remains seo-head.js (both families)', () => {
  // JSON-LD blocks must be present
  assert((HUB.html.match(/<script type="application\/ld\+json">/g) || []).length >= 3,
    'Hub must have at least 3 JSON-LD blocks');
  assert((CITY.html.match(/<script type="application\/ld\+json">/g) || []).length >= 3,
    'City must have at least 3 JSON-LD blocks');
});

test('25. no FAQPage schema in either V3 family', () => {
  assertNotContains(HUB.html, 'FAQPage', 'Hub must have no FAQPage schema');
  assertNotContains(CITY.html, 'FAQPage', 'City must have no FAQPage schema');
});

test('26. no LocalBusiness in either V3 family', () => {
  assertNotContains(HUB.html, 'LocalBusiness', 'Hub must have no LocalBusiness schema');
  assertNotContains(CITY.html, 'LocalBusiness', 'City must have no LocalBusiness schema');
});

// ── 27–32: Regressions ─────────────────────────────────────────────────────
console.log('── 27–32. Regressions ─────────────────────────────────────────');

test('27. content-guard passes for both families', () => {
  const { check, checkFields } = require('./shared/content-guard');
  // Hub
  try { check(HUB.html, 'full_html', '/plombier'); }
  catch (e) { throw new Error('Hub content-guard failed: ' + e.message); }
  // City
  try { check(CITY.html, 'full_html', '/plombier/casablanca'); }
  catch (e) { throw new Error('City content-guard failed: ' + e.message); }
});

test('28. page-template regression: 62/62', () => {
  const r = execSync('node seo/generators/shared/page-template.test.js 2>&1',
    { cwd: ROOT }).toString();
  assert(r.includes('Passed    : 62') && r.includes('Failed    : 0'),
    `page-template regression failed:\n${r.slice(-200)}`);
});

test('29. seo-head regression: 42/42', () => {
  const r = execSync('node seo/generators/shared/seo-head.test.js 2>&1',
    { cwd: ROOT }).toString();
  assert(r.includes('Passed    : 42') && r.includes('Failed    : 0'),
    `seo-head regression failed:\n${r.slice(-200)}`);
});

test('30. artisan-card regression: 90/90', () => {
  const r = execSync('node seo/generators/shared/artisan-card-v3.test.js 2>&1',
    { cwd: ROOT }).toString();
  assert(r.includes('Passed    : 90') && r.includes('Failed    : 0'),
    `artisan-card regression failed:\n${r.slice(-200)}`);
});

test('31. seo-v3 CSS regression: 66/66', () => {
  const r = execSync('node seo/assets/seo-v3.test.js 2>&1',
    { cwd: ROOT }).toString();
  assert(r.includes('Passed    : 66') && r.includes('Failed    : 0'),
    `seo-v3 CSS regression failed:\n${r.slice(-200)}`);
});

test('32. existing handoff adapter tests remain passing: 56/56', () => {
  const r = execSync('node js/fixeo-seo-handoff-v1.test.js 2>&1',
    { cwd: ROOT }).toString();
  assert(r.includes('Passed    : 56') && r.includes('Failed    : 0'),
    `handoff adapter regression failed:\n${r.slice(-200)}`);
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
