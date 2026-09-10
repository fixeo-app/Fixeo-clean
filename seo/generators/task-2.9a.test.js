'use strict';
/**
 * task-2.9a.test.js — Hub Copy and Grammar Polish
 * ================================================
 * Task 2.9A: Prove grammar, differentiation, and content-truth fixes.
 * 19 required spec tests.
 */

const path = require('path');
const { execSync } = require('child_process');
const sh = require('./service-hub-v3');
const { check: contentGuardCheck } = require('./shared/content-guard');

const ROOT = path.join(__dirname, '..', '..');
const ALL_SLUGS = ['plombier', 'electricien', 'serrurier', 'climatisation', 'peintre', 'menuisier', 'macon', 'nettoyage'];

let passed = 0; let failed = 0; const failures = [];
function test(label, fn) {
  try { fn(); process.stdout.write(`  ✅  ${label}\n`); passed++; }
  catch (e) { process.stdout.write(`  ❌  ${label}\n      ${e.message}\n`); failures.push({ label, error: e.message }); failed++; }
}
function assert(cond, msg)              { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertContains(s, sub, msg)    { if (!s.includes(sub)) throw new Error(msg || `Expected: ${JSON.stringify(sub)}`); }
function assertNotContains(s, sub, msg) { if (s.includes(sub))  throw new Error(msg || `Must NOT: ${JSON.stringify(sub)}`); }
function assertEquals(a, b, msg)        { if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

// Pre-generate all 8 hubs
const HUBS = {};
ALL_SLUGS.forEach(slug => { HUBS[slug] = sh.generateServiceHubPage({ serviceSlug: slug }); });

// Helper: extract city-grid heading
function getCityGridHeading(html) {
  // Matches the h2 inside the city-grid section (after the eyebrow "Villes couvertes")
  const m = html.match(/Villes couvertes[\s\S]{0,200}?<h2[^>]*>([^<]+)<\/h2>/);
  return m ? m[1] : null;
}

console.log('\ntask-2.9a.test.js — Hub Copy and Grammar Polish\n');

// ── 1–5: City-grid heading grammar ────────────────────────────────────────
console.log('── 1–5. City-grid heading grammar ─────────────────────────────');

test('1. all 8 city-grid headings are grammatically correct (profession plural)', () => {
  const EXPECTED = {
    plombier:       'Plombiers référencés par ville',
    electricien:    'Électriciens référencés par ville',
    serrurier:      'Serruriers référencés par ville',
    climatisation:  'Techniciens climatisation référencés par ville',
    peintre:        'Peintres référencés par ville',
    menuisier:      'Menuisiers référencés par ville',
    macon:          'Maçons référencés par ville',
    nettoyage:      'Prestataires de nettoyage référencés par ville',
  };
  ALL_SLUGS.forEach(slug => {
    const heading = getCityGridHeading(HUBS[slug].html);
    assertEquals(heading, EXPECTED[slug], `${slug}: city-grid heading mismatch`);
  });
});

test('2. no "Serrurerie référencés" in any hub output', () => {
  ALL_SLUGS.forEach(slug => {
    assertNotContains(HUBS[slug].html, 'Serrurerie référencés',
      `${slug}: must not emit "Serrurerie référencés"`);
  });
});

test('3. no "Menuiserie référencés" in any hub output', () => {
  ALL_SLUGS.forEach(slug => {
    assertNotContains(HUBS[slug].html, 'Menuiserie référencés',
      `${slug}: must not emit "Menuiserie référencés"`);
  });
});

test('4. no "Maçonnerie référencés" in any hub output', () => {
  ALL_SLUGS.forEach(slug => {
    assertNotContains(HUBS[slug].html, 'Maçonnerie référencés',
      `${slug}: must not emit "Maçonnerie référencés"`);
  });
});

test('5. all professionPlural fields defined in HUB_CONTENT', () => {
  ALL_SLUGS.forEach(slug => {
    const val = sh.HUB_CONTENT[slug].professionPlural;
    assert(val && val.length > 2, `${slug}: HUB_CONTENT.professionPlural must be defined`);
  });
});

// ── 6–8: Meta description differentiation ─────────────────────────────────
console.log('── 6–8. Meta description differentiation ───────────────────────');

test('6. all 8 meta descriptions are distinct', () => {
  const descs = ALL_SLUGS.map(s => {
    return (HUBS[s].html.match(/<meta name="description" content="([^"]+)"/) || [])[1] || '';
  });
  assertEquals(new Set(descs).size, 8, 'All 8 meta descriptions must be unique');
});

test('7. meta descriptions are not mechanical service-name substitutions', () => {
  // Each description must start differently (not all "Trouvez un X référencé...")
  const TEMPLATE_OPENER = 'Trouvez un';
  const openers = ALL_SLUGS.map(s =>
    ((HUBS[s].html.match(/<meta name="description" content="([^"]+)"/) || [])[1] || '').substring(0, 12)
  );
  const startedWithTrouvez = openers.filter(o => o.startsWith(TEMPLATE_OPENER));
  // At most 2 may share the "Trouvez un" opener (plombier may keep it; others must differ)
  assert(startedWithTrouvez.length <= 2,
    `Too many descriptions use mechanical "Trouvez un" opener: ${startedWithTrouvez.length}/8. Expected ≤2.`);
});

test('8. all 8 meta descriptions pass content-guard', () => {
  ALL_SLUGS.forEach(slug => {
    const desc = (HUBS[slug].html.match(/<meta name="description" content="([^"]+)"/) || [])[1] || '';
    try { contentGuardCheck(desc, 'metaDesc', '/' + slug); }
    catch (e) { throw new Error(`${slug}: metaDesc content-guard FAIL — ${e.message.slice(0, 100)}`); }
  });
});

// ── 9–10: Maçon content corrections ───────────────────────────────────────
console.log('── 9–10. Maçon content corrections ────────────────────────────');

test('9. maçon hub no longer emits "Diagnostic et renforcement"', () => {
  assertNotContains(HUBS['macon'].html, 'Diagnostic et renforcement',
    'macon: "Diagnostic et renforcement" must be replaced');
});

test('10. no structural-engineering claims in maçon hub', () => {
  const h = HUBS['macon'].html;
  // "porteur" as standalone structural engineering reference
  assertNotContains(h, 'mur porteur', 'macon: "mur porteur" must not appear (load-bearing implication)');
  assertNotContains(h, 'reprise de fondation', 'macon: foundation repair claim must not appear');
  assertNotContains(h, 'renforcement structurel', 'macon: structural reinforcement claim must not appear');
  assertNotContains(h, 'diagnostic structurel', 'macon: structural diagnosis claim must not appear');
});

// ── 11–17: Content truth and contract integrity ────────────────────────────
console.log('── 11–17. Content truth and contract integrity ──────────────────');

test('11. all 8 hubs pass full content-guard', () => {
  ALL_SLUGS.forEach(slug => {
    try { contentGuardCheck(HUBS[slug].html, 'full_html', '/' + slug); }
    catch (e) { throw new Error(`${slug}: content-guard FAIL — ${e.message.slice(0, 100)}`); }
  });
});

test('12. all 8 hubs still dry-run successfully', () => {
  ALL_SLUGS.forEach(slug => {
    assert(HUBS[slug].html.length > 5000, `${slug}: hub output too short — generation may have failed`);
    assert(HUBS[slug].meta.linkedCityCount >= 1, `${slug}: must have at least 1 linked city`);
  });
});

test('13. CTA contracts unchanged (service-only handoff, no fx_city)', () => {
  ALL_SLUGS.forEach(slug => {
    assertContains(HUBS[slug].html, `fx_service=${slug}`, `${slug}: CTA must include fx_service`);
    assertNotContains(HUBS[slug].html, 'fx_city=', `${slug}: hub CTA must NOT include fx_city`);
  });
});

test('14. no broken /probleme/ links on any hub', () => {
  ALL_SLUGS.forEach(slug => {
    const links = HUBS[slug].html.match(/href="[^"]*probleme[^"]*"/g) || [];
    assertEquals(links.length, 0, `${slug}: ${links.length} broken /probleme/ links found`);
  });
});

test('15. no .html links introduced', () => {
  ALL_SLUGS.forEach(slug => {
    const htmlLinks = HUBS[slug].html.match(/href="[^"]+\.html[^"]*"/g) || [];
    assertEquals(htmlLinks.length, 0, `${slug}: .html href found — must use clean canonical URLs`);
  });
});

test('16. schema: Organization + Service + BreadcrumbList on all 8 hubs', () => {
  ALL_SLUGS.forEach(slug => {
    const h = HUBS[slug].html;
    assertContains(h, '"@type": "Organization"',   `${slug}: Organization schema missing`);
    assertContains(h, '"@type": "Service"',        `${slug}: Service schema missing`);
    assertContains(h, '"@type": "BreadcrumbList"', `${slug}: BreadcrumbList schema missing`);
    assertNotContains(h, 'LocalBusiness', `${slug}: LocalBusiness must be absent`);
    assertNotContains(h, 'FAQPage',       `${slug}: FAQPage must be absent`);
  });
});

test('17. no banned product-truth vocabulary in descriptions or headings', () => {
  const BANNED = [/vérifié/i, /qualifié/i, /certifié/i, /24h\/7/i, /devis gratuit/i,
    /disponible immédiatement/i, /dans l.heure/i, /garantie.*disponibilité/i];
  ALL_SLUGS.forEach(slug => {
    const desc = (HUBS[slug].html.match(/<meta name="description" content="([^"]+)"/) || [])[1] || '';
    const heading = getCityGridHeading(HUBS[slug].html) || '';
    BANNED.forEach(pat => {
      assert(!pat.test(desc),    `${slug} desc: banned pattern ${pat}`);
      assert(!pat.test(heading), `${slug} heading: banned pattern ${pat}`);
    });
  });
});

// ── 18–19: Regressions ─────────────────────────────────────────────────────
console.log('── 18–19. Regressions ──────────────────────────────────────────');

test('18. all previous Task 2.9 tests still pass (40/40)', () => {
  const r = execSync('node seo/generators/task-2.9.test.js 2>&1', { cwd: ROOT }).toString();
  assert(r.includes('Passed    : 40') && !r.match(/Failed\s+: [1-9]/),
    `task-2.9 regression:\n${r.slice(-300)}`);
});

test('19. all standard SEO V3 regression suites pass', () => {
  const suites = [
    ['seo/generators/service-hub-v3.test.js',   'Passed    : 42'],
    ['seo/generators/task-2.8.test.js',          'Passed    : 32'],
    ['seo/generators/task-2.8a.test.js',         'Passed    : 18'],
    ['seo/generators/service-city-v3.test.js',   'Passed    : 47'],
    ['seo/generators/shared/seo-head.test.js',   'Passed    : 42'],
    ['seo/generators/shared/page-template.test.js', 'Passed    : 62'],
    ['seo/generators/shared/seo-handoff-href.test.js', 'Passed    : 26'],
    ['seo/generators/shared/v3-legacy-removal.test.js', 'Passed    : 12'],
    ['js/fixeo-seo-handoff-v1.test.js',          'Passed    : 56'],
  ];
  suites.forEach(([file, expected]) => {
    const r = execSync(`node ${file} 2>&1`, { cwd: ROOT }).toString();
    assert(r.includes(expected) && !r.match(/Failed\s+: [1-9]/),
      `${file} failed:\n${r.slice(-200)}`);
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
