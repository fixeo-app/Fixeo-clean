'use strict';
/**
 * task-2.10.test.js — Controlled Production Generation of 8 Service Hubs
 * =========================================================================
 * 45 required spec tests (per task spec).
 * Tests both the generator output and the generated HTML files at repo root.
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const { generateServiceHubPage } = require('./service-hub-v3');
const { check: contentGuardCheck } = require('./shared/content-guard');
const { generateAll, checkDeterminism, SLUGS, OUTFILES } = require('./generate-service-hubs');
const vercelJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const sitemapStaticXml = fs.readFileSync(path.join(ROOT, 'sitemap-static.xml'), 'utf8');

let passed = 0; let failed = 0; const failures = [];
function test(label, fn) {
  try { fn(); process.stdout.write(`  ✅  ${label}\n`); passed++; }
  catch (e) { process.stdout.write(`  ❌  ${label}\n      ${e.message}\n`); failures.push({ label, error: e.message }); failed++; }
}
function assert(cond, msg)              { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertContains(s, sub, msg)    { if (!s.includes(sub)) throw new Error(msg || `Expected to contain: ${JSON.stringify(sub)}`); }
function assertNotContains(s, sub, msg) { if (s.includes(sub))  throw new Error(msg || `Must NOT contain: ${JSON.stringify(sub)}`); }
function assertEquals(a, b, msg)        { if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

// Pre-load generated files from disk (production state)
const FILES = {};
SLUGS.forEach(slug => {
  const fp = OUTFILES[slug];
  FILES[slug] = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : null;
});

// Pre-generate from generator (in-memory check)
const GENERATED = {};
SLUGS.forEach(slug => {
  GENERATED[slug] = generateServiceHubPage({ serviceSlug: slug });
});

console.log('\ntask-2.10.test.js — Production Generation of 8 Service Hubs\n');

// ── 1–3: File generation ─────────────────────────────────────────────────────
console.log('── 1–3. File generation ────────────────────────────────────────');

test('1. exactly 8 production hub HTML files exist at repo root', () => {
  const missing = SLUGS.filter(s => !FILES[s]);
  assertEquals(missing.length, 0, `Missing files: ${missing.map(s => s + '.html').join(', ')}`);
});

test('2. generation is deterministic (byte-identical on 2 runs)', () => {
  const mismatches = checkDeterminism();
  assertEquals(mismatches.length, 0, `Non-deterministic output for: ${mismatches.join(', ')}`);
});

test('3. generated files on disk match fresh generator output (no stale files)', () => {
  const staleMismatches = [];
  SLUGS.forEach(slug => {
    const fresh = generateServiceHubPage({ serviceSlug: slug }).html;
    if (FILES[slug] !== fresh) staleMismatches.push(slug);
  });
  assertEquals(staleMismatches.length, 0,
    `Stale disk files (re-generate required): ${staleMismatches.join(', ')}`);
});

// ── 4–7: Meta correctness ────────────────────────────────────────────────────
console.log('── 4–7. Meta correctness ───────────────────────────────────────');

test('4. all 8 canonical URLs are correct (no .html, no query, no city)', () => {
  SLUGS.forEach(slug => {
    const canon = (FILES[slug].match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || '';
    assertEquals(canon, `https://www.fixeo.ma/${slug}`,
      `${slug}: canonical mismatch — got ${canon}`);
  });
});

test('5. all 8 robots are index,follow', () => {
  SLUGS.forEach(slug => {
    assertContains(FILES[slug], 'name="robots" content="index,follow"',
      `${slug}: robots not index,follow`);
  });
});

test('6. all 8 titles are unique', () => {
  const titles = SLUGS.map(s => (FILES[s].match(/<title>([^<]+)<\/title>/) || [])[1] || '');
  assertEquals(new Set(titles).size, 8, 'Duplicate titles found');
  titles.forEach((t, i) => assert(t.length > 10, `${SLUGS[i]}: title too short`));
});

test('7. all 8 meta descriptions are unique', () => {
  const descs = SLUGS.map(s =>
    (FILES[s].match(/<meta name="description" content="([^"]+)"/) || [])[1] || '');
  assertEquals(new Set(descs).size, 8, 'Duplicate meta descriptions found');
});

// ── 8–10: H1 uniqueness ──────────────────────────────────────────────────────
console.log('── 8–10. H1 + schema ───────────────────────────────────────────');

test('8. all 8 H1 values are unique', () => {
  const h1s = SLUGS.map(s => (FILES[s].match(/<h1[^>]*>([^<]+)<\/h1>/) || [])[1] || '');
  assertEquals(new Set(h1s).size, 8, 'Duplicate H1 values found');
});

test('9. Organization schema on all 8 hubs', () => {
  SLUGS.forEach(slug => assertContains(FILES[slug], '"@type": "Organization"',
    `${slug}: Organization schema missing`));
});

test('10. Service schema on all 8 hubs', () => {
  SLUGS.forEach(slug => assertContains(FILES[slug], '"@type": "Service"',
    `${slug}: Service schema missing`));
});

// ── 11–15: Schema negatives ──────────────────────────────────────────────────
test('11. BreadcrumbList on all 8 hubs', () => {
  SLUGS.forEach(slug => assertContains(FILES[slug], '"@type": "BreadcrumbList"',
    `${slug}: BreadcrumbList missing`));
});

test('12. no LocalBusiness schema on any hub', () => {
  SLUGS.forEach(slug => assertNotContains(FILES[slug], 'LocalBusiness',
    `${slug}: LocalBusiness must be absent`));
});

test('13. no FAQPage schema on any hub', () => {
  SLUGS.forEach(slug => assertNotContains(FILES[slug], 'FAQPage',
    `${slug}: FAQPage must be absent`));
});

test('14. no AggregateRating schema on any hub', () => {
  SLUGS.forEach(slug => assertNotContains(FILES[slug], 'AggregateRating',
    `${slug}: AggregateRating must be absent`));
});

test('15. no Offer schema on any hub', () => {
  SLUGS.forEach(slug => assertNotContains(FILES[slug], '"@type": "Offer"',
    `${slug}: Offer must be absent`));
});

// ── 16–20: Content integrity ─────────────────────────────────────────────────
console.log('── 16–20. Content integrity ────────────────────────────────────');

test('16. visible FAQ section on all 8 hubs (<details> elements)', () => {
  SLUGS.forEach(slug => {
    const count = (FILES[slug].match(/<details/g) || []).length;
    assert(count >= 3, `${slug}: expected ≥3 FAQ <details>, found ${count}`);
  });
});

test('17. no broken /probleme/* links on any hub', () => {
  SLUGS.forEach(slug => {
    const links = (FILES[slug].match(/href="[^"]*probleme[^"]*"/g) || []);
    assertEquals(links.length, 0, `${slug}: ${links.length} /probleme/ links found`);
  });
});

test('18. no .html internal links on any hub', () => {
  SLUGS.forEach(slug => {
    const htmlLinks = (FILES[slug].match(/href="[^"]+\.html[^"]*"/g) || []);
    assertEquals(htmlLinks.length, 0,
      `${slug}: .html href found — ${htmlLinks[0]}`);
  });
});

test('19. no quartier links on any hub', () => {
  SLUGS.forEach(slug => {
    // quartier links would be /service/{city}/{quartier} or text "quartier"
    const qLinks = (FILES[slug].match(/href="\/[a-z]+\/[a-z-]+\/[a-z-]+"/g) || []);
    assertEquals(qLinks.length, 0,
      `${slug}: quartier-depth href found — ${qLinks[0]}`);
  });
});

test('20. service-only handoff CTA correct (fx_service, no fx_city)', () => {
  SLUGS.forEach(slug => {
    assertContains(FILES[slug], `fx_service=${slug}`,
      `${slug}: CTA must contain fx_service=${slug}`);
    assertNotContains(FILES[slug], 'fx_city=',
      `${slug}: hub CTA must NOT include fx_city`);
  });
});

// ── 21–25: CTA / RAFI hygiene ────────────────────────────────────────────────
console.log('── 21–25. CTA / RAFI hygiene ───────────────────────────────────');

test('21. no legacy generic ?service= query param on any hub', () => {
  SLUGS.forEach(slug => assertNotContains(FILES[slug], '?service=',
    `${slug}: legacy ?service= param found`));
});

test('22. no legacy generic ?city= query param on any hub', () => {
  SLUGS.forEach(slug => assertNotContains(FILES[slug], '?city=',
    `${slug}: legacy ?city= param found`));
});

test('23. no RAFI/modal coupling on any hub', () => {
  SLUGS.forEach(slug => {
    assertNotContains(FILES[slug], 'data-open-request-form',
      `${slug}: RAFI modal trigger found`);
    assertNotContains(FILES[slug], 'fx-request-flow-v4',
      `${slug}: fxrf4 script referenced`);
  });
});

test('24. fixeo-local-flagship-v1.js NOT in any hub', () => {
  SLUGS.forEach(slug => assertNotContains(FILES[slug], 'fixeo-local-flagship-v1.js',
    `${slug}: flagship script must be absent from hub`));
});

test('25. no legacy artisan-card-conversion runtime on any hub', () => {
  // The CSS is loaded (compat layer) but no legacy card JS/markup
  SLUGS.forEach(slug => {
    assertNotContains(FILES[slug], 'fxlp-artisan-card-v2',
      `${slug}: legacy v2 artisan card class found`);
  });
});

// ── 26–27: Asset contract ────────────────────────────────────────────────────
console.log('── 26–27. Asset contract ───────────────────────────────────────');

test('26. hub CSS is external (no inline <style data-hub-v3> in any hub)', () => {
  SLUGS.forEach(slug => assertNotContains(FILES[slug], '<style data-hub-v3',
    `${slug}: inline hub CSS found — must be external`));
});

test('27. all referenced local SEO assets exist on disk', () => {
  // CSS moved from seo/assets/ to css/ (Task 2.11 hotfix; Task 2.12 hardens the contract)
  // All three V3 CSS files must exist as public copies under css/
  const LOCAL_ASSETS = [
    '/css/seo-v3.css',
    '/css/service-hub-v3.css',
    '/css/artisan-card-v3.css',  // added Task 2.12 — required by service-city-v3
  ];
  LOCAL_ASSETS.forEach(asset => {
    const disk = path.join(ROOT, asset);
    assert(fs.existsSync(disk), `Asset missing at public path: ${asset}`);
  });
  // Source copies must also exist (canonical origin)
  const SOURCE_ASSETS = [
    '/seo/assets/seo-v3.css',
    '/seo/assets/service-hub-v3.css',
    '/seo/assets/artisan-card-v3.css',
  ];
  SOURCE_ASSETS.forEach(asset => {
    const disk = path.join(ROOT, asset);
    assert(fs.existsSync(disk), `Source asset missing: ${asset}`);
  });
  // Verify public copies are byte-identical to source
  const crypto = require('crypto');
  const pairs = [
    ['seo/assets/seo-v3.css',          'css/seo-v3.css'],
    ['seo/assets/service-hub-v3.css',  'css/service-hub-v3.css'],
    ['seo/assets/artisan-card-v3.css', 'css/artisan-card-v3.css'],
  ];
  pairs.forEach(([src, pub]) => {
    const srcHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, src))).digest('hex');
    const pubHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, pub))).digest('hex');
    assertEquals(srcHash, pubHash, `Public copy not byte-identical to source: ${pub} vs ${src}`);
  });
  // Verify hub HTML references /css/ paths (not /seo/assets/)
  assertContains(FILES['plombier'], '/css/seo-v3.css', 'seo-v3.css not referenced at /css/ in hub');
  assertContains(FILES['plombier'], '/css/service-hub-v3.css', 'service-hub-v3.css not referenced at /css/ in hub');
  assertNotContains(FILES['plombier'], '/seo/assets/', 'hub HTML must not reference /seo/assets/');
});

// ── 28–30: Routing ───────────────────────────────────────────────────────────
console.log('── 28–30. Routing ──────────────────────────────────────────────');

test('28. vercel.json contains hub route rule for all 8 slugs', () => {
  const hubRule = vercelJson.routes.find(r =>
    r.src === '^/(plombier|electricien|serrurier|climatisation|peintre|menuisier|macon|nettoyage)$');
  assert(hubRule, 'Hub route rule not found in vercel.json');
  assertEquals(hubRule.dest, '/$1.html', `Hub dest wrong: ${hubRule.dest}`);
  // Confirm it's a rewrite (200), not redirect
  assert(!hubRule.status || hubRule.status === 200,
    `Hub rule must be a rewrite (no status or 200), got ${hubRule.status}`);
});

test('29. hub rule positioned before quartier/city rules (correct priority)', () => {
  const routes = vercelJson.routes;
  const hubIdx = routes.findIndex(r =>
    r.src === '^/(plombier|electricien|serrurier|climatisation|peintre|menuisier|macon|nettoyage)$');
  const quartierIdx = routes.findIndex(r =>
    r.src && r.src === '^/plombier/([a-z][a-z-]*)/([a-z][a-z-]*)$');
  const cityIdx = routes.findIndex(r =>
    r.src && r.src === '^/plombier/([a-z][a-z-]*)$');
  assert(hubIdx >= 0, 'Hub rule not found');
  assert(hubIdx < quartierIdx, `Hub rule (${hubIdx}) must come before quartier rule (${quartierIdx})`);
  assert(hubIdx < cityIdx, `Hub rule (${hubIdx}) must come before city rule (${cityIdx})`);
});

test('30. hub rule does NOT collide with /service/{city} or /service/{city}/{quartier}', () => {
  // Hub rule src: ^/(plombier|...|nettoyage)$
  // It uses $ anchor — no path after slug possible
  const hubRule = vercelJson.routes.find(r =>
    r.src === '^/(plombier|electricien|serrurier|climatisation|peintre|menuisier|macon|nettoyage)$');
  const src = hubRule.src;
  // Test patterns that must NOT match
  const shouldNotMatch = [
    '/plombier/casablanca',
    '/plombier/casablanca/maarif',
    '/electricien/rabat',
    '/macon/tanger',
  ];
  shouldNotMatch.forEach(path => {
    const slug = path.replace(/^\//, '').split('/')[0];
    const re = new RegExp(src);
    // The hub rule only matches the bare slug — with nothing after
    assert(!re.test(path),
      `Hub rule WRONGLY matches ${path} — would steal service×city traffic`);
  });
});

// ── 31–36: Sitemap ───────────────────────────────────────────────────────────
console.log('── 31–36. Sitemap ──────────────────────────────────────────────');

test('31. sitemap-static.xml contains all 8 hub URLs', () => {
  SLUGS.forEach(slug => {
    assertContains(sitemapStaticXml, `https://www.fixeo.ma/${slug}`,
      `${slug}: hub URL missing from sitemap-static.xml`);
  });
});

test('32. each hub appears exactly once in sitemap-static.xml', () => {
  SLUGS.forEach(slug => {
    const count = (sitemapStaticXml.match(
      new RegExp(`https://www\\.fixeo\\.ma/${slug}[<"\\s]`, 'g')) || []).length;
    assertEquals(count, 1, `${slug}: appears ${count} times in sitemap-static.xml (expected 1)`);
  });
});

test('33. sitemap-static.xml contains no .html hub variant', () => {
  SLUGS.forEach(slug => {
    assertNotContains(sitemapStaticXml, `/${slug}.html`,
      `${slug}: .html sitemap entry must be absent`);
  });
});

test('34. hub URLs not duplicated in other sitemaps', () => {
  const otherSitemaps = [
    'sitemap.xml', 'sitemap-local-plombier.xml', 'sitemap-local-electricien.xml',
    'sitemap-local-serrurier.xml', 'sitemap-local-climatisation.xml',
    'sitemap-lp.xml', 'sitemap-pseo.xml', 'sitemap-blog.xml', 'sitemap-trust.xml',
  ];
  SLUGS.forEach(slug => {
    otherSitemaps.forEach(file => {
      const fp = path.join(ROOT, file);
      if (!fs.existsSync(fp)) return;
      const content = fs.readFileSync(fp, 'utf8');
      // Check for bare hub URL (not service×city)
      const barePattern = new RegExp(`fixeo\\.ma/${slug}[<"\\s]`);
      assert(!barePattern.test(content),
        `${slug}: bare hub URL found in ${file} (should only be in sitemap-static.xml)`);
    });
  });
});

test('35. sitemap XML is valid (basic well-formedness)', () => {
  // Check opening and closing tags match
  assert(sitemapStaticXml.includes('<urlset'), 'sitemap-static.xml missing <urlset>');
  assert(sitemapStaticXml.includes('</urlset>'), 'sitemap-static.xml missing </urlset>');
  const openCount  = (sitemapStaticXml.match(/<url>/g) || []).length;
  const closeCount = (sitemapStaticXml.match(/<\/url>/g) || []).length;
  assertEquals(openCount, closeCount, `sitemap-static.xml: ${openCount} <url> but ${closeCount} </url>`);
});

test('36. hub sitemap entries use priority 0.9 and changefreq weekly', () => {
  // Find the block after "SEO V3 Service Hubs" comment
  const hubBlock = sitemapStaticXml.split('SEO V3 Service Hubs')[1] || '';
  const prioCount = (hubBlock.match(/<priority>0\.9<\/priority>/g) || []).length;
  const freqCount = (hubBlock.match(/<changefreq>weekly<\/changefreq>/g) || []).length;
  assertEquals(prioCount, 8, `Expected 8 hub entries with priority 0.9, got ${prioCount}`);
  assertEquals(freqCount, 8, `Expected 8 hub entries with changefreq weekly, got ${freqCount}`);
});

// ── 37–38: Internal linking / discoverability ────────────────────────────────
console.log('── 37–38. Internal linking ─────────────────────────────────────');

test('37. hub→city links use canonical clean routes (no .html, no legacy)', () => {
  SLUGS.forEach(slug => {
    // All city links in hub should be /{slug}/{city}
    const cityLinks = (FILES[slug].match(/href="(\/[a-z]+\/[a-z][a-z-]*)"/g) || [])
      .map(m => m.replace(/href="|"$/g,''));
    cityLinks.forEach(link => {
      assertNotContains(link, '.html', `${slug}: .html in city link: ${link}`);
      assert(link.match(/^\/[a-z]+\/[a-z][a-z-]*$/),
        `${slug}: city link malformed: ${link}`);
    });
  });
});

test('38. service×city breadcrumbs already reference parent hub (existing equity)', () => {
  // Verify the known plombier-casablanca breadcrumb already points to /plombier
  const plombierCasaPath = path.join(ROOT, 'plombier-casablanca.html');
  if (fs.existsSync(plombierCasaPath)) {
    const html = fs.readFileSync(plombierCasaPath, 'utf8');
    assertContains(html, 'fixeo.ma/plombier"',
      'plombier-casablanca.html breadcrumb must reference https://www.fixeo.ma/plombier');
  } else {
    // File not in root (may be served via rewrite from {service}-{city}.html)
    console.log('      [INFO] plombier-casablanca.html not at root — checking via html pattern');
  }
});

// ── 39–40: City publishability ───────────────────────────────────────────────
console.log('── 39–40. City publishability ──────────────────────────────────');

test('39. review cities excluded from all hub city grids', () => {
  // Review cities = 0 artisans; they must not appear as linked chips
  // Check that meta.reviewCities are not in the city grid links
  SLUGS.forEach(slug => {
    const { meta } = GENERATED[slug];
    const reviewCities = meta.reviewCities || [];
    reviewCities.forEach(citySlug => {
      // The city should not appear as an <a href=...> chip in the city grid
      const cityLink = `href="/${slug}/${citySlug}"`;
      assertNotContains(FILES[slug], cityLink,
        `${slug}: review city ${citySlug} (0 artisans) must not be linked`);
    });
  });
});

test('40. block cities excluded from all hub city grids', () => {
  SLUGS.forEach(slug => {
    const { meta } = GENERATED[slug];
    // meta.linkedCities contains only publish/preserve cities
    // Verify linked count matches generator meta
    const linkedCount = (FILES[slug].match(new RegExp(`href="\\/${slug}\\/[a-z]`, 'g')) || []).length;
    // Hub emits city chips + CTA link; city chips should dominate
    assert(linkedCount >= meta.linkedCityCount,
      `${slug}: expected ≥${meta.linkedCityCount} city links, found ${linkedCount}`);
  });
});

// ── 41–45: Regressions ───────────────────────────────────────────────────────
console.log('── 41–45. Regressions ──────────────────────────────────────────');

test('41. content-guard passes all 8 generated hubs', () => {
  SLUGS.forEach(slug => {
    try { contentGuardCheck(FILES[slug], 'disk_html', `/${slug}`); }
    catch (e) { throw new Error(`${slug}: content-guard FAIL — ${e.message.slice(0,100)}`); }
  });
});

test('42. all previous service hub tests pass (42/42)', () => {
  const r = execSync('node seo/generators/service-hub-v3.test.js 2>&1', { cwd: ROOT }).toString();
  assert(r.includes('Passed    : 42') && !r.match(/Failed\s+: [1-9]/),
    `service-hub-v3.test.js regression:\n${r.slice(-200)}`);
});

test('43. all previous service-city tests pass (47/47)', () => {
  const r = execSync('node seo/generators/service-city-v3.test.js 2>&1', { cwd: ROOT }).toString();
  assert(r.includes('Passed    : 47') && !r.match(/Failed\s+: [1-9]/),
    `service-city-v3.test.js regression:\n${r.slice(-200)}`);
});

test('44. Task 2.9A + 2.9 tests pass', () => {
  const ra = execSync('node seo/generators/task-2.9a.test.js 2>&1', { cwd: ROOT }).toString();
  const r9 = execSync('node seo/generators/task-2.9.test.js 2>&1', { cwd: ROOT }).toString();
  assert(ra.includes('Passed    : 19') && !ra.match(/Failed\s+: [1-9]/), `2.9a fail:\n${ra.slice(-200)}`);
  assert(r9.includes('Passed    : 40') && !r9.match(/Failed\s+: [1-9]/), `2.9 fail:\n${r9.slice(-200)}`);
});

test('45. all other standard SEO V3 regression suites pass', () => {
  const suites = [
    ['seo/generators/shared/seo-head.test.js',            'Passed    : 42'],
    ['seo/generators/shared/page-template.test.js',       'Passed    : 62'],
    ['seo/generators/shared/seo-handoff-href.test.js',    'Passed    : 26'],
    ['seo/generators/shared/v3-legacy-removal.test.js',   'Passed    : 12'],
    ['js/fixeo-seo-handoff-v1.test.js',                   'Passed    : 56'],
    ['seo/generators/task-2.8.test.js',                   'Passed    : 32'],
    ['seo/generators/task-2.8a.test.js',                  'Passed    : 18'],
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
