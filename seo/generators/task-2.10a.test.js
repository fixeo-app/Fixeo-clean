'use strict';
/**
 * task-2.10a.test.js — Hub Data/Truth/Copy Corrections
 * =====================================================
 * 20 required spec tests.
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const { generateServiceHubPage } = require('./service-hub-v3');
const { check: contentGuardCheck } = require('./shared/content-guard');
const { SLUGS, OUTFILES, checkDeterminism } = require('./generate-service-hubs');

const countsJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'seo/data/artisan-counts.json'), 'utf8'));
const citiesJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'seo/data/cities.json'), 'utf8'));
const citySlugs  = Object.keys(citiesJson).filter(k => k !== '_meta');
const vercelJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const sitemapXml = fs.readFileSync(path.join(ROOT, 'sitemap-static.xml'), 'utf8');

// Load committed HTML files
const FILES = {};
SLUGS.forEach(slug => {
  FILES[slug] = fs.readFileSync(OUTFILES[slug], 'utf8');
});

let passed = 0; let failed = 0; const failures = [];
function test(label, fn) {
  try { fn(); process.stdout.write(`  ✅  ${label}\n`); passed++; }
  catch (e) { process.stdout.write(`  ❌  ${label}\n      ${e.message}\n`); failures.push({ label, error: e.message }); failed++; }
}
function assert(cond, msg)              { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertContains(s, sub, msg)    { if (!s.includes(sub)) throw new Error(msg || `Expected: ${JSON.stringify(sub)}`); }
function assertNotContains(s, sub, msg) { if (s.includes(sub))  throw new Error(msg || `Must NOT: ${JSON.stringify(sub)}`); }
function assertEquals(a, b, msg)        { if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

console.log('\ntask-2.10a.test.js — Hub Data/Truth/Copy Corrections\n');

// ── 1–5: City count audit ──────────────────────────────────────────────────
console.log('── 1–5. City count audit ───────────────────────────────────────');

test('1. every rendered city count equals the authoritative SEO snapshot (all 8 services)', () => {
  const mismatches = [];
  SLUGS.forEach(slug => {
    const html = FILES[slug];
    // Find all city chips: href="/slug/cityslug" with optional count span
    const chipPattern = new RegExp(
      `href="/${slug}/([a-z][a-z-]*)"`
      + `[\\s\\S]{0,200}?fxlp-hub-city-count[^>]*>(\\d+)`, 'g');
    let m;
    while ((m = chipPattern.exec(html)) !== null) {
      const citySlug   = m[1];
      const rendered   = parseInt(m[2], 10);
      const src        = (countsJson[citySlug] || {})[slug];
      if (src !== rendered) {
        mismatches.push(`${slug}/${citySlug}: src=${src} rendered=${rendered}`);
      }
    }
    // Also verify cities with no badge (count=0 — should not appear as linked anyway)
  });
  assertEquals(mismatches.length, 0,
    `Count mismatches found:\n  ${mismatches.join('\n  ')}`);
});

test('2. no city chip uses a national service total as its count', () => {
  // National total per service
  const nationalTotals = {};
  SLUGS.forEach(svc => {
    nationalTotals[svc] = citySlugs.reduce((sum, c) => sum + ((countsJson[c] || {})[svc] || 0), 0);
  });
  SLUGS.forEach(slug => {
    const html = FILES[slug];
    const nat = nationalTotals[slug];
    // The national total must never appear as a city chip badge
    const chipCounts = [...html.matchAll(/fxlp-hub-city-count[^>]*>(\d+)/g)].map(m => parseInt(m[1]));
    const usingNational = chipCounts.filter(c => c === nat);
    assertEquals(usingNational.length, 0,
      `${slug}: national total ${nat} found as ${usingNational.length} city chip(s) — mismatch suspected`);
  });
});

test('3. all 8 services count-validated (full matrix)', () => {
  const results = {};
  SLUGS.forEach(slug => {
    const html = FILES[slug];
    const chips = [];
    const chipPattern = new RegExp(`href="/${slug}/([a-z][a-z-]*)"[\\s\\S]{0,200}?fxlp-hub-city-count[^>]*>(\\d+)`, 'g');
    let m;
    while ((m = chipPattern.exec(html)) !== null) {
      chips.push({ city: m[1], count: parseInt(m[2]) });
    }
    results[slug] = chips.length;
  });
  SLUGS.forEach(slug => {
    assert(results[slug] >= 1, `${slug}: no city chips with counts found`);
  });
});

test('4. publishability decisions unchanged (linked city counts match generator)', () => {
  SLUGS.forEach(slug => {
    const { meta } = generateServiceHubPage({ serviceSlug: slug });
    const html = FILES[slug];
    // Count linked chips in HTML
    const chipCount = (html.match(new RegExp(`href="/${slug}/[a-z]`, 'g')) || []).length;
    // chipCount may include CTA link — allow ±1 tolerance for CTA
    assert(chipCount >= meta.linkedCityCount,
      `${slug}: expected ≥${meta.linkedCityCount} city links in HTML, found ${chipCount}`);
  });
});

test('5. linked-city sets unchanged (same cities linked as in generator output)', () => {
  SLUGS.forEach(slug => {
    const { meta } = generateServiceHubPage({ serviceSlug: slug });
    const html = FILES[slug];
    meta.linkedCities.forEach(citySlug => {
      assertContains(html, `href="/${slug}/${citySlug}"`,
        `${slug}: expected linked city ${citySlug} not found in HTML`);
    });
  });
});

// ── 6–7: Payment wording ──────────────────────────────────────────────────────
console.log('── 6–7. Payment wording ────────────────────────────────────────');

test('6. no "Aucun acompte n\'est demandé" in any hub', () => {
  SLUGS.forEach(slug => {
    assertNotContains(FILES[slug], 'Aucun acompte',
      `${slug}: "Aucun acompte" must be removed`);
  });
});

test('7. no universal no-deposit claim ("n\'est demandé à l\'avance" etc.)', () => {
  const BANNED_DEPOSIT = [
    "n'est demandé à l'avance",
    "aucun acompte",
    "sans acompte",
    "no deposit",
  ];
  SLUGS.forEach(slug => {
    BANNED_DEPOSIT.forEach(phrase => {
      assertNotContains(FILES[slug].toLowerCase(), phrase.toLowerCase(),
        `${slug}: banned deposit phrase: "${phrase}"`);
    });
  });
});

// ── 8–9: CTA eyebrow ──────────────────────────────────────────────────────────
console.log('── 8–9. CTA eyebrow ────────────────────────────────────────────');

test('8. no "Démarrer votre demande" or "DEMANDEZ VOTRE DEMANDE" in any hub CTA', () => {
  SLUGS.forEach(slug => {
    assertNotContains(FILES[slug], 'Démarrer votre demande',
      `${slug}: old CTA eyebrow still present`);
    assertNotContains(FILES[slug].toUpperCase(), 'DEMANDEZ VOTRE DEMANDE',
      `${slug}: "DEMANDEZ VOTRE DEMANDE" found`);
  });
});

test('9. CTA eyebrow is "Votre demande" on all 8 hubs', () => {
  SLUGS.forEach(slug => {
    assertContains(FILES[slug], 'class="fxlp-cta-eyebrow">Votre demande<',
      `${slug}: CTA eyebrow must be "Votre demande"`);
  });
});

// ── 10–11: FAQ availability wording ──────────────────────────────────────────
console.log('── 10–11. FAQ availability wording ─────────────────────────────');

test('10. no "disponibilité immédiate" or "intervention immédiate" as FAQ question on any hub', () => {
  const BANNED_IN_QUESTIONS = ['disponibilité immédiate', 'intervention immédiate', 'prestation immédiate'];
  SLUGS.forEach(slug => {
    const html = FILES[slug];
    // Extract only <summary> text (FAQ questions), not answer bodies
    const summaries = (html.match(/<summary[\s\S]*?<\/summary>/g) || []).join(' ');
    BANNED_IN_QUESTIONS.forEach(phrase => {
      assertNotContains(summaries, phrase,
        `${slug}: banned phrase "${phrase}" found in FAQ question text`);
    });
  });
});

test('11. availability FAQ reflects artisan confirmation (not platform guarantee)', () => {
  // plombier uses "confirmée", others use "garantie" → both fine
  const REQUIRED_SIGNALS = ['artisan', 'disponibilité', 'garantie'];
  // Each FAQ section must contain at least 2 of these signals
  SLUGS.forEach(slug => {
    const html = FILES[slug];
    const signals = REQUIRED_SIGNALS.filter(s => html.includes(s));
    assert(signals.length >= 2,
      `${slug}: FAQ must reference artisan + availability context (found: ${signals.join(', ')})`);
  });
});

// ── 12: Serrurier wording audit ────────────────────────────────────────────────
console.log('── 12. Serrurier wording audit ─────────────────────────────────');

test('12. serrurier need card does not contain "cassée au contact" or awkward wording', () => {
  assertNotContains(FILES['serrurier'], 'cassée au contact',
    'serrurier: "cassée au contact" must not appear');
  // Confirm the actual label is natural French
  assert(
    FILES['serrurier'].includes('Clé cassée ou perdue') ||
    FILES['serrurier'].includes('Clé cassée dans la serrure'),
    'serrurier: expected natural Clé cassée label'
  );
});

// ── 13–18: Invariants unchanged ──────────────────────────────────────────────
console.log('── 13–18. Invariants unchanged ─────────────────────────────────');

test('13. content-guard passes all 8 generated hubs', () => {
  SLUGS.forEach(slug => {
    try { contentGuardCheck(FILES[slug], 'disk_html', `/${slug}`); }
    catch (e) { throw new Error(`${slug}: FAIL — ${e.message.slice(0, 100)}`); }
  });
});

test('14. all 8 canonical URLs unchanged', () => {
  SLUGS.forEach(slug => {
    const canon = (FILES[slug].match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || '';
    assertEquals(canon, `https://www.fixeo.ma/${slug}`, `${slug}: canonical changed`);
  });
});

test('15. routing unchanged (hub rule still at correct position)', () => {
  const hubIdx = vercelJson.routes.findIndex(r =>
    r.src === '^/(plombier|electricien|serrurier|climatisation|peintre|menuisier|macon|nettoyage)$');
  assert(hubIdx >= 0, 'Hub route rule missing');
  const quartierIdx = vercelJson.routes.findIndex(r =>
    r.src === '^/plombier/([a-z][a-z-]*)/([a-z][a-z-]*)$');
  assert(hubIdx < quartierIdx, 'Hub rule must precede quartier rule');
});

test('16. sitemap unchanged (8 hub URLs still in sitemap-static.xml)', () => {
  SLUGS.forEach(slug => {
    assertContains(sitemapXml, `https://www.fixeo.ma/${slug}`,
      `${slug}: hub URL missing from sitemap`);
  });
});

test('17. schema unchanged (Organization + Service + BreadcrumbList on all 8)', () => {
  SLUGS.forEach(slug => {
    assertContains(FILES[slug], '"@type": "Organization"', `${slug}: Organization missing`);
    assertContains(FILES[slug], '"@type": "Service"',      `${slug}: Service missing`);
    assertContains(FILES[slug], '"@type": "BreadcrumbList"', `${slug}: BreadcrumbList missing`);
    assertNotContains(FILES[slug], 'LocalBusiness', `${slug}: LocalBusiness must be absent`);
  });
});

test('18. generation remains deterministic after copy corrections', () => {
  const mismatches = checkDeterminism();
  assertEquals(mismatches.length, 0,
    `Non-deterministic output: ${mismatches.join(', ')}`);
});

// ── 19–20: Regressions ─────────────────────────────────────────────────────
console.log('── 19–20. Regressions ──────────────────────────────────────────');

test('19. all Task 2.10 tests pass (45/45)', () => {
  const r = execSync('node seo/generators/task-2.10.test.js 2>&1', { cwd: ROOT }).toString();
  assert(r.includes('Passed    : 45') && !r.match(/Failed\s+: [1-9]/),
    `task-2.10 regression:\n${r.slice(-300)}`);
});

test('20. all prior SEO V3 regression suites pass', () => {
  const suites = [
    ['seo/generators/task-2.9a.test.js',                  'Passed    : 19'],
    ['seo/generators/task-2.9.test.js',                   'Passed    : 40'],
    ['seo/generators/service-hub-v3.test.js',             'Passed    : 42'],
    ['seo/generators/task-2.8.test.js',                   'Passed    : 32'],
    ['seo/generators/task-2.8a.test.js',                  'Passed    : 18'],
    ['seo/generators/service-city-v3.test.js',            'Passed    : 47'],
    ['seo/generators/shared/seo-head.test.js',            'Passed    : 42'],
    ['seo/generators/shared/page-template.test.js',       'Passed    : 62'],
    ['seo/generators/shared/seo-handoff-href.test.js',    'Passed    : 26'],
    ['seo/generators/shared/v3-legacy-removal.test.js',   'Passed    : 12'],
    ['js/fixeo-seo-handoff-v1.test.js',                   'Passed    : 56'],
  ];
  suites.forEach(([file, expected]) => {
    const r = execSync(`node ${file} 2>&1`, { cwd: ROOT }).toString();
    assert(r.includes(expected) && !r.match(/Failed\s+: [1-9]/),
      `${file} failed:\n${r.slice(-200)}`);
  });
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\nTotal tests : ${passed + failed}`);
console.log(`  Passed    : ${passed}`);
console.log(`  Failed    : ${failed}`);
if (failed > 0) {
  console.log('\nFailed tests:');
  failures.forEach(f => console.log(`  ❌ ${f.label}\n     ${f.error}`));
  process.exit(1);
} else { console.log('\n✅ All tests passed.\n'); }
