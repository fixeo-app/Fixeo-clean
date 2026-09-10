'use strict';
/**
 * service-hub-v3.test.js (hub-v1)
 * Task 2.7 — Service Hub V3 pilot: /plombier
 *
 * 30 required spec tests + additional focused tests.
 */

const path = require('path');
const fs   = require('fs');
const { generateServiceHubPage, _esc, _buildCityGrid, HUB_CONTENT } = require('./service-hub-v3');

/* ── Harness ─────────────────────────────────────────────────────────────── */
let passed = 0; let failed = 0; const failures = [];

function test(label, fn) {
  try { fn(); process.stdout.write(`  ✅  ${label}\n`); passed++; }
  catch (e) { process.stdout.write(`  ❌  ${label}\n      ${e.message}\n`); failures.push({ label, error: e.message }); failed++; }
}
function assert(cond, msg)             { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertContains(s, sub, msg)   { if (!s.includes(sub)) throw new Error(msg || `Expected to contain: ${JSON.stringify(sub)}`); }
function assertNotContains(s, sub, msg){ if (s.includes(sub))  throw new Error(msg || `Must NOT contain: ${JSON.stringify(sub)}`); }
function assertEquals(a, b, msg)       { if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

/* ── Generate once (shared result) ─────────────────────────────────────── */
const RESULT = generateServiceHubPage({ serviceSlug: 'plombier' });
const { html, meta, warnings } = RESULT;

console.log('\nservice-hub-v3.test.js (hub-v1)\n');

/* ── Tests 1–10: Structure & schema ────────────────────────────────────── */
console.log('── 1–10. Canonical structure & schema ────────────────────────');

test('1. canonical /plombier', () => {
  assertEquals(meta.canonicalPath, '/plombier', 'canonicalPath must be /plombier');
  assertContains(html, 'rel="canonical" href="https://www.fixeo.ma/plombier"');
});

test('2. robots index,follow', () => {
  assertEquals(meta.robots, 'index,follow');
  assertContains(html, 'name="robots" content="index,follow"');
});

test('3. correct service-hub pageType', () => {
  assertEquals(meta.pageType, 'service-hub');
  assertContains(html, 'content="service-hub-v3/hub-v1"');
});

test('4. Organization schema present', () => {
  // JSON-LD may be pretty-printed; strip whitespace for search
  const compact = html.replace(/\s+/g, ' ');
  assertContains(compact, '"@type": "Organization"');
  assertContains(compact, '"@id": "https://www.fixeo.ma/#organization"');
  assertContains(compact, '"name": "FIXEO"');
});

test('5. Service schema present', () => {
  const compact = html.replace(/\s+/g, ' ');
  assertContains(compact, '"@type": "Service"');
  assertContains(compact, '"serviceType": "Plomberie"');
  assertContains(compact, '"@id": "https://www.fixeo.ma/plombier#service"');
});

test('6. BreadcrumbList present', () => {
  const compact = html.replace(/\s+/g, ' ');
  assertContains(compact, '"@type": "BreadcrumbList"');
  assertContains(compact, '"name": "Accueil"');
  assertContains(compact, '"name": "Plomberie"');
});

test('7. LocalBusiness absent', () => {
  assertNotContains(html, 'LocalBusiness', 'LocalBusiness schema must be absent');
});

test('8. FAQPage schema absent (visible FAQ only)', () => {
  assertNotContains(html, 'FAQPage', 'FAQPage JSON-LD must be absent');
  assertNotContains(html, '"@type":"FAQPage"', 'FAQPage schema must be absent');
});

test('9. visible FAQ present in HTML', () => {
  assertContains(html, '<details class="fxlp-faq-item">', 'Visible FAQ details elements must be present');
  assertContains(html, 'class="fxlp-faq-summary"', 'FAQ summary elements must be present');
  // At least 3 FAQ items
  const count = (html.match(/fxlp-faq-item/g) || []).length;
  assert(count >= 3, `Expected at least 3 FAQ items, got ${count}`);
});

test('10. no banned content (content-guard passes)', () => {
  const { check } = require('./shared/content-guard');
  try { check(html, 'full_html', '/plombier'); }
  catch (e) { throw new Error('Banned term found: ' + e.message); }
});

/* ── Tests 11–16: No legacy/forbidden markup ────────────────────────────── */
console.log('── 11–16. No legacy / forbidden markup ───────────────────────');

test('11. no old RAFI selectors (data-open-request-form, qsm-input-nlp)', () => {
  assertNotContains(html, 'data-open-request-form', 'No RAFI data attributes');
  assertNotContains(html, 'qsm-input-nlp', 'No QSM selector');
  assertNotContains(html, 'qsm-select-city', 'No QSM city selector');
});

test('12. no request modal attributes', () => {
  assertNotContains(html, 'data-modal', 'No data-modal');
  assertNotContains(html, 'openExpress', 'No openExpress call');
  assertNotContains(html, 'openModal(', 'No openModal call');
});

test('13. fixeo-local-flagship-v1.js removed', () => {
  assert(meta.flagshipRemoved === true, 'flagshipRemoved must be true');
  assertNotContains(html, 'fixeo-local-flagship-v1.js', 'flagship JS must be absent from output');
});

test('14. no pvc-* markup', () => {
  assertNotContains(html, 'pvc-', 'No pvc-* class markup');
  assertNotContains(html, 'class="pvc', 'No pvc class');
});

test('15. no .html internal links', () => {
  // All internal links should use clean URLs
  const htmlLinksInContent = html.match(/href="\/[^"]*\.html[^"]*"/g) || [];
  const badLinks = htmlLinksInContent.filter(l => !l.includes('favicon'));
  assert(badLinks.length === 0, `Found .html internal links: ${badLinks.join(', ')}`);
});

test('16. no quartier links', () => {
  assertNotContains(html, 'quartier-plombier', 'No quartier links');
  assertNotContains(html, '/plombier/casablanca/', 'No triple-depth quartier URL');
});

/* ── Tests 17–22: City link policy ─────────────────────────────────────── */
console.log('── 17–22. City link policy ────────────────────────────────────');

test('17. city links respect publishability: 17 preserve cities linked', () => {
  assertEquals(meta.linkedCityCount, 17, 'Must have 17 linked (preserve) cities for plombier');
});

test('18. blocked new combinations absent (none for plombier — all are preserved)', () => {
  // All plombier cities are preserved (existing URLs). 3 are review (not featured).
  // Confirm review cities are absent from city grid
  ['mohammedia', 'el-jadida', 'khouribga'].forEach(city => {
    assertNotContains(
      html.match(/fxlp-hub-city-grid[\s\S]*?<\/div>/m)?.[0] || '',
      `/plombier/${city}`,
      `Review city ${city} must not appear in city grid`
    );
  });
});

test('19. review cities not featured in hub (0 artisans, flagged by policy)', () => {
  assertEquals(meta.reviewCityCount, 3, 'Must have 3 review cities (mohammedia, el-jadida, khouribga)');
  assert(meta.reviewCities.includes('mohammedia'), 'mohammedia must be in review');
  assert(meta.reviewCities.includes('el-jadida'), 'el-jadida must be in review');
  assert(meta.reviewCities.includes('khouribga'), 'khouribga must be in review');
  // Warning emitted
  assert(warnings.some(w => w.includes('review')), 'Warning must note review cities');
});

test('20. city links use clean /plombier/{slug} format', () => {
  assertContains(html, 'href="/plombier/casablanca"', 'Casablanca must use clean URL');
  assertContains(html, 'href="/plombier/rabat"', 'Rabat must use clean URL');
  assertContains(html, 'href="/plombier/marrakech"', 'Marrakech must use clean URL');
  assertContains(html, 'href="/plombier/tanger"', 'Tanger must use clean URL');
  assertContains(html, 'href="/plombier/tetouan"', 'Tetouan must use clean URL');
});

test('21. all 17 preserve cities are linked', () => {
  const preservedCities = ['casablanca','rabat','marrakech','fes','tanger','agadir',
    'meknes','oujda','kenitra','temara','sale','beni-mellal','safi','nador','taza',
    'ouarzazate','tetouan'];
  preservedCities.forEach(city => {
    assertContains(html, `href="/plombier/${city}"`, `${city} must be linked`);
  });
});

test('22. Casablanca shows artisan count badge', () => {
  // casablanca has 69 artisans — should show count
  assertContains(html, '69 profils', 'Casablanca count badge must show 69 profils');
});

/* ── Tests 23–25: CTA and internal links ──────────────────────────────── */
console.log('── 23–25. CTA and internal links ─────────────────────────────');

test('23. service-only canonical handoff URL emitted', () => {
  assertContains(html, 'fx_service=plombier', 'Must contain fx_service=plombier');
  assertContains(html, 'fx_source=seo', 'Must contain fx_source=seo');
  assertContains(html, 'hero-quick-search', 'Must anchor to hero-quick-search');
  assertEquals(meta.ctaHref, '/?fx_service=plombier&fx_source=seo#hero-quick-search');
});

test('24. no fabricated fx_city', () => {
  assertNotContains(html, 'fx_city=', 'No fx_city must appear in hub CTA');
});

test('25. no old generic ?service= contract', () => {
  assertNotContains(html, '?service=Plomb', 'Old ?service= contract must be absent');
  assertNotContains(html, '?service=plomb', 'Old lowercase ?service= must be absent');
});

/* ── Tests 26–30: Regression ────────────────────────────────────────────── */
console.log('── 26–30. Regressions ─────────────────────────────────────────');

test('26. page-template regression passes', () => {
  const { execSync } = require('child_process');
  const r = execSync('node seo/generators/shared/page-template.test.js 2>&1', { cwd: path.join(__dirname, '..', '..') }).toString();
  assert(r.includes('Passed    : 62') && r.includes('Failed    : 0'), `page-template:\n${r.slice(-300)}`);
});

test('27. seo-head regression passes', () => {
  const { execSync } = require('child_process');
  const r = execSync('node seo/generators/shared/seo-head.test.js 2>&1', { cwd: path.join(__dirname, '..', '..') }).toString();
  assert(r.includes('Passed    : 42') && r.includes('Failed    : 0'), `seo-head:\n${r.slice(-300)}`);
});

test('28. content-guard regression passes', () => {
  const { execSync } = require('child_process');
  const r = execSync('node seo/generators/shared/content-guard.test.js 2>&1', { cwd: path.join(__dirname, '..', '..') }).toString();
  assert(r.includes('Passed      : 51') && r.includes('Failed      : 0'), `content-guard:\n${r.slice(-300)}`);
});

test('29. service-city-v3 regression passes', () => {
  const { execSync } = require('child_process');
  const r = execSync('node seo/generators/service-city-v3.test.js 2>&1', { cwd: path.join(__dirname, '..', '..') }).toString();
  assert(r.includes('Failed    : 0'), `service-city-v3:\n${r.slice(-300)}`);
});

test('30. seo-v3 CSS regression passes', () => {
  const { execSync } = require('child_process');
  const r = execSync('node seo/assets/seo-v3.test.js 2>&1', { cwd: path.join(__dirname, '..', '..') }).toString();
  assert(r.includes('Passed    : 66') && r.includes('Failed    : 0'), `seo-v3:\n${r.slice(-300)}`);
});

/* ── Additional focused tests ─────────────────────────────────────────── */
console.log('── Additional: hub-specific ───────────────────────────────────');

test('H-1. deterministic output (two calls produce identical HTML)', () => {
  const r2 = generateServiceHubPage({ serviceSlug: 'plombier' });
  assertEquals(html, r2.html, 'Output must be deterministic');
});

test('H-2. safe HTML escaping (no raw unescaped output)', () => {
  // Verify _esc works
  assertEquals(_esc('<script>'), '&lt;script&gt;', '_esc must escape <script>');
  assertEquals(_esc('"hello"'), '&quot;hello&quot;', '_esc must escape quotes');
  // No raw < or > in user-data positions (city/service labels)
  assertNotContains(html, '<script>alert', 'No unescaped script tag from content');
});

test('H-3. unknown serviceSlug throws', () => {
  let threw = false;
  try { generateServiceHubPage({ serviceSlug: 'unknown-service' }); } catch (_) { threw = true; }
  assert(threw, 'Unknown serviceSlug must throw');
});

test('H-4. missing serviceSlug throws', () => {
  let threw = false;
  try { generateServiceHubPage({}); } catch (_) { threw = true; }
  assert(threw, 'Missing serviceSlug must throw');
});

test('H-5. handoff adapter script present in output', () => {
  assertContains(html, 'fixeo-seo-handoff-v1.js', 'Handoff adapter must be in hub output');
});

test('H-6. hub has needs section with 6 plumbing needs', () => {
  assertContains(html, 'fxlp-hub-needs-grid', 'Needs grid must be present');
  assertContains(html, 'Fuite d\'eau', 'Fuite d\'eau need must be present');
  assertContains(html, 'WC bouché', 'WC bouché need must be present');
  assertContains(html, 'Chauffe-eau', 'Chauffe-eau need must be present');
});

test('H-7. hub how-it-works section present', () => {
  assertContains(html, 'fxlp-hub-how-section', 'How-it-works section must be present');
  assertContains(html, 'Décrivez votre besoin', 'Step 1 text must be present');
  assertContains(html, 'Paiement après intervention', 'Step 4 text must be present');
});

test('H-8. hub price guidance section present', () => {
  assertContains(html, 'fxlp-hub-price-section', 'Price section must be present');
  assertContains(html, 'Diagnostic et déplacement', 'Price item must be present');
  assertNotContains(html, 'garantie', 'No pricing guarantee language');
});

test('H-9. no broken problem links emitted (publishedProblemSlugs=[]) — section omitted', () => {
  // publishedProblemSlugs is [] for plombier — no /probleme/* pages exist yet.
  // Both fuite-eau and wc-bouche are in relatedProblemSlugs but NOT in publishedProblemSlugs.
  // The hub must NOT emit links to non-existent pages.
  assertNotContains(html, 'href="/probleme/fuite-eau"', 'fuite-eau must not be linked (page does not exist)');
  assertNotContains(html, 'href="/probleme/wc-bouche"', 'wc-bouche must not be linked (page does not exist)');
  // No broken links anywhere in hub output
  assertNotContains(html, 'href="/probleme/', 'No /probleme/ links must appear in hub');
  // Section omitted entirely
  assertNotContains(html, 'fxlp-hub-problems-section', 'Problems section must be absent when no published slugs');
  assertNotContains(html, 'fxlp-hub-problem-chips', 'Problem chips container must be absent');
  // No empty heading/container
  assertNotContains(html, 'Problèmes courants', 'No problem section heading when section is omitted');
  // No fallback .html links or fabricated URLs
  assertNotContains(html, 'probleme', 'No /probleme mention anywhere in hub output');
});

test('H-10. hub meta title is distinct from service×city title', () => {
  assertContains(html, '<title>Plombier au Maroc', 'Hub title should target national intent');
  assertNotContains(html, 'Casablanca</title>', 'Hub title must not include city name');
  assertNotContains(html, 'Rabat</title>', 'Hub title must not include city name');
});

test('H-11. artisan cards are absent from hub (no fxlp-artisan-grid)', () => {
  assertNotContains(html, 'fxlp-artisan-grid', 'No artisan grid in hub — by design');
  // artisan-card-v3.js is not loaded and no artisan card markup is present
  assertNotContains(html, 'artisan-card-v3.js', 'artisan-card-v3.js must not be loaded in hub');
  assertNotContains(html, 'class="fxlp-card"', 'No artisan card fxlp-card class in hub');
});

test('H-12. city count reflects artisan data (casablanca=69, temara=1)', () => {
  assertContains(html, '69 profils', 'Casablanca count must be 69');
  assertContains(html, '1 profil', 'Temara count must show 1 profil (singular)');
  assertNotContains(html, '1 profils', 'Singular form: must not say 1 profils');
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
