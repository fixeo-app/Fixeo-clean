'use strict';
/**
 * fleet-qa-v3.test.js
 * ====================
 * Phase 4 Step 1 — Programmatic QA of all generated service×city V3 pages.
 *
 * For every generated page, verifies:
 *  1. One canonical, matching intended route
 *  2. One H1
 *  3. Exact V3 section order
 *  4. No legacy RAFI request modal
 *  5. No data-open-request-form coupling
 *  6. Correct fx_service
 *  7. Correct fx_city
 *  8. Organization schema present
 *  9. Service schema present
 * 10. BreadcrumbList schema present
 * 11. LocalBusiness absent
 * 12. FAQPage schema absent
 * 13. AggregateRating absent
 * 14. Offer absent
 * 15. No banned product-truth phrases
 * 16. Artisan section exactly once
 * 17. Referenced artisan cards >= 1 (WARN for 0, flagged separately)
 * 18. No duplicate artisan profile slug in same page
 * 19. No broken artisan profile slug (no /artisan/undefined or /artisan/ )
 * 20. No empty service/city labels
 * 21. No duplicate canonical URLs across fleet
 */

'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../');

const cities_raw   = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cities.json'), 'utf8'));
const services_raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/services.json'), 'utf8'));
const counts_raw   = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/artisan-counts.json'), 'utf8'));

delete cities_raw._meta;
delete services_raw._meta;
delete counts_raw._meta;

const publishable = Object.keys(cities_raw).filter(c => cities_raw[c].publishable);
const svcs        = Object.keys(services_raw);
const NEW_THRESHOLD = 3;

// Build fleet manifest
const fleet = [];
for (const svc of svcs) {
  for (const city of publishable) {
    const cnt    = (counts_raw[city] || {})[svc] || 0;
    const fname  = `${svc}-${city}.html`;
    const fpath  = path.join(ROOT, fname);
    const exists = fs.existsSync(fpath);
    const eligible = (exists && cnt >= 1) || (!exists && cnt >= NEW_THRESHOLD);
    if (eligible) {
      fleet.push({ svc, city, fname, fpath, cnt, is_new: !exists });
    }
  }
}

console.log(`\nfleet-qa-v3.test.js — ${fleet.length} pages\n`);

// ── Test harness ─────────────────────────────────────────────────────────────
let total = 0, passed = 0, failed = 0;
const failures = [];
const zero_card_pages = [];
const all_canonicals  = [];

function test(label, fn) {
  total++;
  try {
    fn();
    passed++;
  } catch(e) {
    failed++;
    failures.push({ label, error: e.message });
    process.stdout.write(`  ❌ FAIL: ${label}\n     ${e.message}\n`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertContains(str, substr, label) {
  if (!str.includes(substr)) throw new Error(`Expected "${substr}" to be present: ${label}`);
}

function assertNotContains(str, substr, label) {
  if (str.includes(substr)) throw new Error(`Expected "${substr}" to be ABSENT: ${label}`);
}

// ── Banned phrases from content-guard ────────────────────────────────────────
const BANNED_PHRASES = [
  'artisan vérifié', 'artisans vérifiés', 'professionnel vérifié',
  'artisan qualifié', 'artisans qualifiés',
  'artisan certifié', 'artisans certifiés',
  'disponible 24h', '24h/7', '24h sur 24',
  'intervention en 30 min', 'rappelle sous 30 min',
  'dans l\'heure', 'devis gratuit',
  'acompte', 'disponible immédiatement',
];

// ── Per-page checks ───────────────────────────────────────────────────────────
for (const entry of fleet) {
  const { svc, city, fname, fpath } = entry;
  const pageId = fname.replace('.html','');

  if (!fs.existsSync(fpath)) {
    // This page was excluded during generation (e.g. zero artisan cards from live Supabase)
    // Log as informational, not a test failure
    console.log(`  ⚠ SKIPPED (not on disk): ${fname}`);
    continue;
  }

  const html      = fs.readFileSync(fpath, 'utf8');
  const svcData   = services_raw[svc];
  const cityData  = cities_raw[city];
  const routeKey  = svcData.canonicalRouteKey || svc;
  const canonPath = '/' + routeKey + '/' + city;
  const canonUrl  = 'https://www.fixeo.ma' + canonPath;

  // Check 1: Canonical URL present and correct
  test(`${pageId} — canonical`, () => {
    assertContains(html, `<link rel="canonical" href="${canonUrl}"`, 'canonical link');
    all_canonicals.push(canonUrl);
  });

  // Check 2: One H1
  test(`${pageId} — one H1`, () => {
    const h1matches = html.match(/<h1[^>]*>/g) || [];
    assert(h1matches.length === 1, `Expected exactly 1 <h1>, found ${h1matches.length}`);
  });

  // Check 3: Section order
  test(`${pageId} — section order`, () => {
    const sections = [
      ['HERO',     'class="fxlp-hero'],
      ['BESOINS',  'fxlp-sit-grid'],
      ['ARTISANS', 'id="fxlp-artisans"'],
      ['STEPS',    'fxlp-section--steps'],
      ['AVANT',    'fxlp-before-title'],
      ['TARIFS',   'fxlp-price-list'],
      ['FAQ',      'id="fxlp-faq"'],
      ['EXPLORER', 'fxlp-explorer-grid'],
      ['CTA',      'fxlp-cta-banner'],
    ];
    let lastPos = -1;
    for (const [name, marker] of sections) {
      const pos = html.indexOf(marker);
      assert(pos !== -1,      `Section ${name} marker "${marker}" not found`);
      assert(pos > lastPos,   `Section ${name} out of order (pos ${pos} <= prev ${lastPos})`);
      lastPos = pos;
    }
  });

  // Check 4: No legacy RAFI request modal
  test(`${pageId} — no RAFI modal`, () => {
    assertNotContains(html, 'id="request-modal"',      'request-modal id');
    assertNotContains(html, 'fixeo-rafi-os',            'fixeo-rafi-os');
  });

  // Check 5: No data-open-request-form coupling
  test(`${pageId} — no data-open-request-form`, () => {
    assertNotContains(html, 'data-open-request-form',  'data-open-request-form');
  });

  // Check 6 & 7: CTA contains correct fx_service and fx_city
  test(`${pageId} — CTA fx_service + fx_city`, () => {
    assertContains(html, `fx_service=${svc}`,           'fx_service slug');
    assertContains(html, `fx_city=${city}`,              'fx_city slug');
    assertContains(html, `fx_source=seo`,                'fx_source=seo');
  });

  // Checks 8–10: Schema presence (JSON-LD uses spaces: "@type": "Foo")
  test(`${pageId} — Organization schema`, () => {
    if (!html.match(/"@type"\s*:\s*"Organization"/)) throw new Error('Organization schema not found');
  });
  test(`${pageId} — Service schema`, () => {
    if (!html.match(/"@type"\s*:\s*"Service"/)) throw new Error('Service schema not found');
  });
  test(`${pageId} — BreadcrumbList schema`, () => {
    if (!html.match(/"@type"\s*:\s*"BreadcrumbList"/)) throw new Error('BreadcrumbList schema not found');
  });

  // Checks 11–14: Schema absence
  test(`${pageId} — no LocalBusiness`, () => {
    if (html.match(/"@type"\s*:\s*"LocalBusiness"/)) throw new Error('LocalBusiness schema present');
  });
  test(`${pageId} — no FAQPage schema`, () => {
    if (html.match(/"@type"\s*:\s*"FAQPage"/)) throw new Error('FAQPage schema present');
  });
  test(`${pageId} — no AggregateRating`, () => {
    if (html.match(/"@type"\s*:\s*"AggregateRating"/)) throw new Error('AggregateRating schema present');
  });
  test(`${pageId} — no Offer schema`, () => {
    if (html.match(/"@type"\s*:\s*"Offer"/)) throw new Error('Offer schema present');
  });

  // Check 15: No banned phrases
  test(`${pageId} — no banned phrases`, () => {
    for (const phrase of BANNED_PHRASES) {
      if (html.toLowerCase().includes(phrase.toLowerCase())) {
        throw new Error(`Banned phrase found: "${phrase}"`);
      }
    }
  });

  // Check 16: Artisan section exactly once
  test(`${pageId} — artisan section once`, () => {
    const cnt = (html.match(/id="fxlp-artisans"/g) || []).length;
    assert(cnt === 1, `Expected exactly 1 artisan section, found ${cnt}`);
  });

  // Check 17: Artisan cards >= 1 (warn on 0)
  test(`${pageId} — artisan cards count`, () => {
    const cardCount = (html.match(/class="fxseo-card-v3"/g) || []).length;
    if (cardCount === 0) {
      zero_card_pages.push({ pageId, artisanCount: entry.cnt });
      throw new Error(`Zero artisan cards rendered (artisan-counts shows ${entry.cnt})`);
    }
    assert(cardCount <= 3, `Max 3 cards, found ${cardCount}`);
  });

  // Check 18: No duplicate artisan slugs on same page
  test(`${pageId} — no duplicate artisan slugs`, () => {
    const slugs = (html.match(/href="\/artisan\/([^"]+)"/g) || []).map(m => m.match(/href="\/artisan\/([^"]+)"/)[1]);
    const uniq = new Set(slugs);
    assert(uniq.size === slugs.length, `Duplicate artisan slugs: ${[...slugs].filter((s,i,a) => a.indexOf(s) !== i)}`);
  });

  // Check 19: No broken profile slugs
  test(`${pageId} — no broken profile slugs`, () => {
    assertNotContains(html, 'href="/artisan/undefined"',  '/artisan/undefined');
    assertNotContains(html, 'href="/artisan/ "',           '/artisan/ ');
    // href="/artisan/" with no slug
    const bad = (html.match(/href="\/artisan\/\s*"/g) || []);
    assert(bad.length === 0, `Empty artisan slug href found`);
  });

  // Check 20: No empty service/city labels in H1
  test(`${pageId} — no empty labels`, () => {
    assertContains(html, svcData.label,  'service label in HTML');
    assertContains(html, cityData.label, 'city label in HTML');
  });

  // Check: flagship script removed
  test(`${pageId} — no fixeo-local-flagship-v1.js`, () => {
    assertNotContains(html, 'src="/js/fixeo-local-flagship-v1.js', 'flagship script');
  });

  // Check: V3 CSS loaded
  test(`${pageId} — V3 CSS present`, () => {
    assertContains(html, '/css/seo-v3.css',           'seo-v3.css');
    assertContains(html, '/css/artisan-card-v3.css',  'artisan-card-v3.css');
  });

  // Check: body class
  test(`${pageId} — body.seo-service-page`, () => {
    assertContains(html, 'class="seo-service-page"', 'body.seo-service-page');
  });
}

// Check 21: No duplicate canonical URLs across fleet
test('FLEET — no duplicate canonicals', () => {
  const dupes = all_canonicals.filter((u, i, a) => a.indexOf(u) !== i);
  assert(dupes.length === 0, `Duplicate canonicals: ${dupes.join(', ')}`);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Fleet:        ${fleet.length} pages`);
console.log(`Tests:        ${total}`);
console.log(`Passed:       ${passed}`);
console.log(`Failed:       ${failed}`);
console.log();

if (zero_card_pages.length > 0) {
  console.log(`⚠ ZERO-CARD PAGES (${zero_card_pages.length}):`);
  zero_card_pages.forEach(p => console.log(`  ${p.pageId} [counts.json=${p.artisanCount}]`));
  console.log('  → These pages exist but have no renderable artisan cards.');
  console.log('  → Likely data drift between artisan-counts.json and live Supabase.\n');
}

if (failed === 0) {
  console.log('✅ All fleet QA checks passed.');
} else {
  console.log('❌ FAILURES:');
  failures.forEach(f => console.log(`  - ${f.label}: ${f.error}`));
  process.exit(1);
}
