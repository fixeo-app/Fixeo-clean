'use strict';
/**
 * service-city-v3.test.js — Verification suite for service-city-v3.js (v3-a2)
 * Covers all 30 required Task 2.5A tests + prior structural tests.
 */

const path = require('path');

// ── Harness ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try {
    fn();
    process.stdout.write(`  ✅  ${label}\n`);
    passed++;
  } catch (e) {
    process.stdout.write(`  ❌  ${label}\n      ${e.message}\n`);
    failures.push({ label, error: e.message });
    failed++;
  }
}

function assert(cond, msg)                { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertContains(str, sub, msg)    { if (!str.includes(sub)) throw new Error(msg || `Expected to find: ${JSON.stringify(sub)}`); }
function assertNotContains(str, sub, msg) { if (str.includes(sub)) throw new Error(msg || `Must NOT contain: ${JSON.stringify(sub)}`); }
function assertThrows(fn, frag) {
  let threw = false; let err = null;
  try { fn(); } catch (e) { threw = true; err = e; }
  if (!threw) throw new Error('Expected an error to be thrown');
  if (frag && !(err && err.message.includes(frag)))
    throw new Error(`Expected error containing "${frag}", got: "${err && err.message}"`);
}

// ── Load modules ──────────────────────────────────────────────────────────────

const {
  generateServiceCityPage,
  _validateArtisanRecord,
  _buildRenderedCards,
  _patchArtisanGrid,
  _removeFlagshipScript,
  _isPlaceholderName,
  _FLAGSHIP_SCRIPT_TAG,
  _MAX_CARDS,
} = require('./service-city-v3');

// ── Fixtures ──────────────────────────────────────────────────────────────────

// New pilot artisans (v3-a2): selected by name-ascending order, no writing-system filter
// These are the first 3 eligible records from Casablanca plomberie (name asc).
const ARTISAN_ABDELALI = {
  name:        'abdelali traghane',
  publicSlug:  'abdelali-traghane-casablanca-0194-bricole-pb10',
  photoUrl:    'https://ztwtbgoqanqzvwiibtuh.supabase.co/storage/v1/object/public/artisan-media/bricole/casablanca/plomberie/batch10/abdelali-traghane-casablanca-0194-bricole-pb10.png',
  description: 'abdelali traghane est référencé sur FIXEO à Casablanca pour des travaux de plomberie. Les services renseignés sur sa fiche comprennent notamment Dépannage plomberie, Fuite d\'eau et Sanitaire. Les modalités d\'intervention et le tarif final dépendent du besoin et sont à confirmer directement avec le prestataire.',
  priceLabel:  'À partir de 150 DH',
};

const ARTISAN_ABDELATI = {
  name:        'abdelati',
  publicSlug:  'abdelati-casablanca-4384-bricole-pb12',
  photoUrl:    'https://ztwtbgoqanqzvwiibtuh.supabase.co/storage/v1/object/public/artisan-media/bricole/casablanca/plomberie/batch12/abdelati-casablanca-4384-bricole-pb12.png',
  description: 'abdelati est référencé sur FIXEO à Casablanca pour des travaux de plomberie. Les services renseignés sur sa fiche comprennent notamment Sanitaire. La zone exacte de déplacement, les délais et le tarif sont à confirmer au moment de la prise de contact.',
  priceLabel:  'À partir de 150 DH',
};

const ARTISAN_ABDELGHAFOUR = {
  name:       'Abdelghafour Mafhoul',
  publicSlug: 'abdelghafour-mafhoul-casablanca-7470-after722',
  photoUrl:   null,   // no photo → initials fallback
  description: 'Abdelghafour Mafhoul est référencé sur FIXEO à Casablanca pour des travaux de plomberie. Les services renseignés sur sa fiche comprennent notamment Dépannage plomberie et Installation plomberie. La zone exacte de déplacement, les délais et le tarif sont à confirmer au moment de la prise de contact.',
  priceLabel: 'À partir de 150 DH',
};

const THREE_ARTISANS = [ARTISAN_ABDELALI, ARTISAN_ABDELATI, ARTISAN_ABDELGHAFOUR];

// Cached pilot builds
let _pilot = null;
function getPilot() {
  if (!_pilot) {
    _pilot = generateServiceCityPage({
      serviceSlug:    'plombier',
      citySlug:       'casablanca',
      artisanRecords: THREE_ARTISANS,
    });
  }
  return _pilot;
}

console.log('\nservice-city-v3.test.js (v3-a2)\n');

// ══════════════════════════════════════════════════════════════
// TASK 2.5A REQUIRED TESTS (T-1 through T-30)
// ══════════════════════════════════════════════════════════════

console.log('── T-1. V3 card output ──────────────────────────────────────');

test('T-1. Generated HTML contains artisan-card-v3 cards (fxseo-card-v3)', () => {
  const h = getPilot().html;
  assertContains(h, 'fxseo-card-v3');
  assertContains(h, 'fxseo-card-v3__name');
  assertContains(h, 'fxseo-card-v3__trust');
});

console.log('── T-2. Flagship JS removed ─────────────────────────────────');

test('T-2. Generated HTML does NOT load fixeo-local-flagship-v1.js (script tag absent)', () => {
  const h = getPilot().html;
  // The <script src=...> tag must be completely absent
  assertNotContains(h, 'src="/js/fixeo-local-flagship-v1.js');
  assertNotContains(h, `src="${_FLAGSHIP_SCRIPT_TAG && _FLAGSHIP_SCRIPT_TAG.match(/src="([^"]+)"/)?.[1] || 'fixeo-local-flagship-v1'}`);
  // Removal must be confirmed by meta flag
  assert(getPilot().meta.flagshipRemoved === true, 'flagshipRemoved must be true');
  // The FLAGSHIP_SCRIPT_TAG constant must exist and be derivable from CORE_JS
  assert(typeof _FLAGSHIP_SCRIPT_TAG === 'string', '_FLAGSHIP_SCRIPT_TAG must be a string');
  assert(_FLAGSHIP_SCRIPT_TAG.includes('fixeo-local-flagship-v1.js'), 'TAG must contain flagship script name');
  // Confirm the CSS (different extension) is still present — CSS is needed, JS is not
  assertContains(h, 'fixeo-local-flagship-v1.css');
});

test('T-3. No client-side legacy artisan overwrite dependency remains', () => {
  const h = getPilot().html;
  // The script tag src must be absent
  assertNotContains(h, 'src="/js/fixeo-local-flagship-v1.js');
  // No RAFI artifacts either
  assertNotContains(h, 'fixeo-reservation-flagship-v1.js');
  assertNotContains(h, 'fx-request-flow-v4.js');
});

test('T-4. No pvc-* legacy card markup generated', () => {
  const h = getPilot().html;
  assertNotContains(h, 'class="pvc-');
  assertNotContains(h, 'pvc-card');
  assertNotContains(h, 'pvc-avatar');
  assertNotContains(h, 'pvc-trust-v3b');
});

console.log('── T-5. Artisan grid populated ──────────────────────────────');

test('T-5. Artisan grid remains populated in initial HTML', () => {
  const h = getPilot().html;
  // Grid element exists
  assertContains(h, 'id="fxlp-artisan-grid"');
  // V3 cards are inside (server-rendered)
  assertContains(h, 'abdelali traghane');
  assertContains(h, 'abdelati');
  assertContains(h, 'Abdelghafour Mafhoul');
  // No skeleton placeholder divs
  assertNotContains(h, 'fxlp-skeleton');
  assertNotContains(h, 'fxlp-artisan-loading');
});

console.log('── T-6. FAQ section ─────────────────────────────────────────');

test('T-6. Visible FAQ section still renders', () => {
  const h = getPilot().html;
  assertContains(h, 'id="fxlp-faq"');
  assertContains(h, '<details class="fxlp-faq-item"');
  assertContains(h, '<summary class="fxlp-faq-summary"');
  assertContains(h, 'fxlp-faq-answer');
  // FAQ content is present
  assertContains(h, 'tarif définitif');
});

console.log('── T-7. FAQPage JSON-LD absent ───────────────────────────────');

test('T-7. FAQPage JSON-LD is absent (structured-data ownership stays in seo-head.js)', () => {
  const h = getPilot().html;
  assertNotContains(h, '"FAQPage"');
  assertNotContains(h, 'FAQPage');
  // No _buildFaqSchema export either — module no longer exports it
  assert(!('_buildFaqSchema' in require('./service-city-v3')), '_buildFaqSchema must not be exported');
});

console.log('── T-8–11. Schema ───────────────────────────────────────────');

test('T-8. Organization schema remains', () => {
  assertContains(getPilot().html, '"@type": "Organization"');
});

test('T-9. Service schema remains', () => {
  assertContains(getPilot().html, '"@type": "Service"');
});

test('T-10. BreadcrumbList remains', () => {
  const h = getPilot().html;
  assertContains(h, '"@type": "BreadcrumbList"');
  assertContains(h, '"item": "https://www.fixeo.ma/plombier/casablanca"');
});

test('T-11. LocalBusiness remains absent', () => {
  assertNotContains(getPilot().html, 'LocalBusiness');
});

console.log('── T-12–15. Writing system / photo ──────────────────────────');

test('T-12. Arabic-script public artisan names are accepted', () => {
  // Arabic name artisan — must be eligible (not excluded)
  const arabicArtisan = {
    name:        '\u0633\u0645\u0627\u0624\u064a', // Arabic name: سماؤي
    publicSlug:  'artisan-casablanca-3958-bricole-pb12',
    description: 'Profil référencé sur FIXEO.',
    priceLabel:  'À partir de 150 DH',
  };
  const { ok, reason } = _validateArtisanRecord(arabicArtisan);
  assert(ok === true, `Arabic-script name should be eligible, got: ${reason}`);
});

test('T-13. Accented/Unicode names are accepted', () => {
  const accentedArtisan = {
    name:       'Abdelkadér Saïd-Bahmad',
    publicSlug: 'abdelkader-said-bahmad-casablanca-0001',
    description: 'Profil référencé sur FIXEO.',
  };
  const { ok, reason } = _validateArtisanRecord(accentedArtisan);
  assert(ok === true, `Accented name should be eligible, got: ${reason}`);
});

test('T-14. No-photo artisan records remain eligible', () => {
  const noPhotoArtisan = {
    name:        'Benhaida Hassan',
    publicSlug:  'benhaida-hassan-casablanca-6267-p23',
    description: 'Profil référencé sur FIXEO.',
    priceLabel:  'À partir de 150 DH',
    // photoUrl omitted — no photo
  };
  const { ok, reason } = _validateArtisanRecord(noPhotoArtisan);
  assert(ok === true, `No-photo artisan should be eligible, got: ${reason}`);
});

test('T-15. No-photo cards use artisan-card-v3 initials fallback', () => {
  // ARTISAN_ABDELGHAFOUR has photoUrl: null — should render initials
  const h = getPilot().html;
  // Abdelghafour should be rendered with initials
  assertContains(h, 'Abdelghafour Mafhoul');
  assertContains(h, 'fxseo-card-v3__avatar-initials');
  // at least one card with initials (data-avatar-state="initials")
  assertContains(h, 'data-avatar-state="initials"');
});

console.log('── T-16–20. Selection policy ────────────────────────────────');

test('T-16. Selection does not use verified field — record with verified is excluded', () => {
  const r = _validateArtisanRecord({ name: 'Test', verified: true });
  assert(r.ok === false, 'verified field must cause exclusion');
  assertContains(r.reason, 'forbidden field "verified"');
});

test('T-17. Selection does not use rating/reviews — records with these fields excluded', () => {
  const r1 = _validateArtisanRecord({ name: 'Test', rating: 4.8 });
  assert(r1.ok === false, 'rating must cause exclusion');
  assertContains(r1.reason, 'forbidden field "rating"');
  const r2 = _validateArtisanRecord({ name: 'Test', reviews: 10 });
  assert(r2.ok === false, 'reviews must cause exclusion');
  assertContains(r2.reason, 'forbidden field "reviews"');
});

test('T-18. Selection does not use availability — record with availability excluded', () => {
  const r = _validateArtisanRecord({ name: 'Test', availability: 'available' });
  assert(r.ok === false, 'availability must cause exclusion');
  assertContains(r.reason, 'forbidden field "availability"');
});

test('T-19. Selection does not use response time — record with response_time_min excluded', () => {
  const r = _validateArtisanRecord({ name: 'Test', response_time_min: 30 });
  assert(r.ok === false, 'response_time_min must cause exclusion');
  assertContains(r.reason, 'forbidden field "response_time_min"');
});

test('T-20. Selection does not use internal IDs — records with id/legacy_id excluded', () => {
  const r1 = _validateArtisanRecord({ name: 'Test', id: 'abc123' });
  assert(r1.ok === false, 'id must cause exclusion');
  assertContains(r1.reason, 'forbidden field "id"');
  const r2 = _validateArtisanRecord({ name: 'Test', legacy_id: '9999' });
  assert(r2.ok === false, 'legacy_id must cause exclusion');
  assertContains(r2.reason, 'forbidden field "legacy_id"');
});

console.log('── T-21–22. Cards ───────────────────────────────────────────');

test('T-21. Max 3 real cards rendered', () => {
  const result = getPilot();
  assert(result.meta.cardCount === 3, `Expected 3 cards, got ${result.meta.cardCount}`);
  assert(_MAX_CARDS === 3, 'MAX_CARDS must be 3');
});

test('T-22. Selection is deterministic (same input → same output)', () => {
  const r1 = generateServiceCityPage({
    serviceSlug: 'plombier', citySlug: 'casablanca', artisanRecords: THREE_ARTISANS,
  });
  const r2 = generateServiceCityPage({
    serviceSlug: 'plombier', citySlug: 'casablanca', artisanRecords: THREE_ARTISANS,
  });
  assert(r1.html === r2.html, 'Output must be deterministic');
});

console.log('── T-23–25. Data integrity ──────────────────────────────────');

test('T-23. No phone/email/private fields render', () => {
  const h = getPilot().html;
  assertNotContains(h, '+212');
  assertNotContains(h, 'tel:');
  assertNotContains(h, 'mailto:');
  assertNotContains(h, 'data-artisan-id');
  assertNotContains(h, 'legacy_id');
});

test('T-24. Profile links remain only /artisan/{publicSlug}', () => {
  const h = getPilot().html;
  assertContains(h, 'href="/artisan/abdelali-traghane-casablanca-0194-bricole-pb10"');
  assertContains(h, 'href="/artisan/abdelati-casablanca-4384-bricole-pb12"');
  assertContains(h, 'href="/artisan/abdelghafour-mafhoul-casablanca-7470-after722"');
});

test('T-25. Invalid/missing publicSlug still allows card without CTA', () => {
  const noSlugArtisan = {
    name:        'Hamza Zouine',
    description: 'Profil référencé sur FIXEO.',
    priceLabel:  'À partir de 100 DH',
    // publicSlug omitted
  };
  const result = generateServiceCityPage({
    serviceSlug:    'plombier',
    citySlug:       'casablanca',
    artisanRecords: [noSlugArtisan],
  });
  assertContains(result.html, 'Hamza Zouine');
  assertContains(result.html, 'fxseo-card-v3');
  // No profile CTA (no <a> element for profile)
  assertNotContains(result.html, 'fxseo-card-v3__profile-link');
  assert(result.meta.cardCount === 1, 'Card without slug must still render');
});

console.log('── T-26–30. Regression ──────────────────────────────────────');

test('T-26. Content-guard passes on full page HTML', () => {
  const { check } = require('./shared/content-guard');
  try {
    check(getPilot().html, 'full_html', '/plombier/casablanca');
  } catch (e) {
    throw new Error('Banned term found in page HTML: ' + e.message);
  }
});

test('T-27. page-template.js: 62/62 pass', () => {
  const { execSync } = require('child_process');
  const result = execSync(
    'node seo/generators/shared/page-template.test.js 2>&1',
    { cwd: path.join(__dirname, '../..') }
  ).toString();
  assert(result.includes('Passed    : 62'), `page-template tests failed:\n${result.slice(-400)}`);
  assert(result.includes('Failed    : 0'),  `page-template had failures:\n${result.slice(-400)}`);
});

test('T-28. artisan-card-v3.js: 90/90 pass', () => {
  const { execSync } = require('child_process');
  const result = execSync(
    'node seo/generators/shared/artisan-card-v3.test.js 2>&1',
    { cwd: path.join(__dirname, '../..') }
  ).toString();
  assert(result.includes('Passed    : 90'), `artisan-card tests failed:\n${result.slice(-400)}`);
  assert(result.includes('Failed    : 0'),  `artisan-card had failures:\n${result.slice(-400)}`);
});

test('T-29. seo-head.js: 42/42 pass', () => {
  const { execSync } = require('child_process');
  const result = execSync(
    'node seo/generators/shared/seo-head.test.js 2>&1',
    { cwd: path.join(__dirname, '../..') }
  ).toString();
  assert(result.includes('Passed    : 42'), `seo-head tests failed:\n${result.slice(-400)}`);
  assert(result.includes('Failed    : 0'),  `seo-head had failures:\n${result.slice(-400)}`);
});

test('T-30. seo-v3.css: 66/66 pass', () => {
  const { execSync } = require('child_process');
  const result = execSync(
    'node seo/assets/seo-v3.test.js 2>&1',
    { cwd: path.join(__dirname, '../..') }
  ).toString();
  assert(result.includes('Passed    : 66'), `seo-v3 CSS tests failed:\n${result.slice(-400)}`);
  assert(result.includes('Failed    : 0'),  `seo-v3 CSS had failures:\n${result.slice(-400)}`);
});

// ══════════════════════════════════════════════════════════════
// PRIOR STRUCTURAL TESTS (retained from T-1..38 v3-a1 suite)
// ══════════════════════════════════════════════════════════════

console.log('── Prior structural tests ───────────────────────────────────');

test('S-1. Build succeeds with full pilot data', () => {
  const r = getPilot();
  assert(typeof r.html === 'string');
  assert(r.html.length > 10000, 'html too short');
  assert(r.meta.serviceSlug === 'plombier');
  assert(r.meta.citySlug    === 'casablanca');
});

test('S-2. Canonical URL: https://www.fixeo.ma/plombier/casablanca', () => {
  const { html, meta } = getPilot();
  assert(meta.canonicalUrl === 'https://www.fixeo.ma/plombier/casablanca');
  assertContains(html, 'href="https://www.fixeo.ma/plombier/casablanca"');
});

test('S-3. robots=index,follow', () => {
  assertContains(getPilot().html, 'content="index,follow"');
});

test('S-4. Exactly one H1', () => {
  const h1s = (getPilot().html.match(/<h1[^>]*>/g) || []);
  assert(h1s.length === 1, `Expected 1 H1, got ${h1s.length}`);
});

test('S-5. H1 contains Plombier + Casablanca', () => {
  const m = getPilot().html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  assert(m, 'No H1 found');
  assertContains(m[1], 'Plombier');
  assertContains(m[1], 'Casablanca');
});

test('S-6. seo-v3.css + artisan-card-v3.css loaded', () => {
  assertContains(getPilot().html, 'seo-v3.css');
  assertContains(getPilot().html, 'artisan-card-v3.css');
});

test('S-7. No reservation CSS', () => {
  const h = getPilot().html.toLowerCase();
  assertNotContains(h, 'reservation.css');
  assertNotContains(h, 'fixeo-reservation-flagship');
  assertNotContains(h, 'fx-request-flow');
});

test('S-8. No RAFI JS or hidden inputs', () => {
  const h = getPilot().html;
  assertNotContains(h, 'fx-request-flow-v4');
  assertNotContains(h, 'qsm-select-city');
  assertNotContains(h, 'qsm-input-nlp');
  assertNotContains(h, 'data-open-request-form');
});

test('S-9. Meaningful initial HTML (sections present)', () => {
  const h = getPilot().html;
  assertContains(h, 'fxlp-sit-grid');
  assertContains(h, 'fxlp-steps');
  assertContains(h, 'fxlp-faq');
  assertContains(h, 'fxlp-price');
  assertContains(h, 'fxlp-explorer');
});

test('S-10. No .html SEO internal links', () => {
  assertNotContains(getPilot().html, 'casablanca.html');
  assertNotContains(getPilot().html, 'plombier.html');
  assertNotContains(getPilot().html, 'quartier-plombier');
  assertNotContains(getPilot().html, '?id=');
});

test('S-11. No fake ratings or availability claims', () => {
  const h = getPilot().html;
  assertNotContains(h, 'fxseo-card-v3__rating');
  assertNotContains(h, '★');
  const hl = h.toLowerCase();
  assertNotContains(hl, 'disponible immédiatement');
  assertNotContains(hl, '24h/7');
});

test('S-12. CTA is canonical fx_* handoff URL, no modal triggers', () => {
  const r = getPilot();
  const h = r.html;
  assertNotContains(h, 'data-open-request-form');
  // New canonical handoff URL (Task 2.6)
  assertContains(r.meta.ctaHref, 'fx_service=plombier', 'CTA must use fx_service slug');
  assertContains(r.meta.ctaHref, 'fx_city=casablanca',  'CTA must use fx_city slug');
  assertContains(r.meta.ctaHref, 'fx_source=seo',       'CTA must include fx_source=seo');
  // Old generic params must be absent
  assertNotContains(r.meta.ctaHref, '?service=', 'Old ?service= must be absent from CTA');
  assertNotContains(r.meta.ctaHref, '&city=',    'Old &city= must be absent from CTA');
  // CTA href present in HTML
  const ctaHrefEscaped = r.meta.ctaHref.replace(/&/g, '&amp;');
  assert(
    h.includes(r.meta.ctaHref) || h.includes(ctaHrefEscaped),
    'CTA href not found in HTML'
  );
});

test('S-12a. fixeo-seo-handoff-v1.js loaded as extraJs', () => {
  assertContains(getPilot().html, 'fixeo-seo-handoff-v1.js', 'Handoff script must appear in HTML');
});

test('S-13. Price section: indicative wording, no guaranteed price', () => {
  const h = getPilot().html;
  assertContains(h, 'TARIFS INDICATIFS');
  assertContains(h, 'fxlp-price');
  const hl = h.toLowerCase();
  assertNotContains(hl, 'prix fixe');
  assertNotContains(hl, 'tarif garanti');
  assertNotContains(hl, 'devis gratuit');
});

test('S-14. Placeholder names excluded by documented pattern', () => {
  assert(_isPlaceholderName('Participant anonyme 911'));
  assert(_isPlaceholderName('Plombier Casa IG'));
  assert(_isPlaceholderName('Plombier Casa IG 2'));
  assert(_isPlaceholderName('Ibrahim Plomberie Services'));
  assert(_isPlaceholderName('Ibrahim Plomberie Services 2'));
  // Must NOT exclude valid names
  assert(!_isPlaceholderName('Mohammed Alami'));
  assert(!_isPlaceholderName('abdelali traghane'));
  assert(!_isPlaceholderName('\u0633\u0645\u0627\u0624\u064a')); // Arabic: سماؤي
  assert(!_isPlaceholderName('Abdelghafour Mafhoul'));
});

test('S-15. removeFlagshipScript operates on exact derived tag', () => {
  // Build a minimal html string containing the exact flagship script tag
  const fakeHtml = '<html><head></head><body></body>\n'
    + _FLAGSHIP_SCRIPT_TAG
    + '\n</html>';
  const { html, removed, warning } = _removeFlagshipScript(fakeHtml);
  assert(removed === true, 'must report removed=true');
  assert(warning === null, 'must have no warning');
  assertNotContains(html, 'fixeo-local-flagship-v1.js');
});

test('S-16. content-guard 51/51 still passes', () => {
  const { execSync } = require('child_process');
  const result = execSync(
    'node seo/generators/shared/content-guard.test.js 2>&1',
    { cwd: path.join(__dirname, '../..') }
  ).toString();
  assert(result.includes('Passed      : 51'), `content-guard tests failed:\n${result.slice(-400)}`);
  assert(result.includes('Failed      : 0'),  `content-guard had failures:\n${result.slice(-400)}`);
});

// ── Summary ───────────────────────────────────────────────────────────────────

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
