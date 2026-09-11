'use strict';
/**
 * seo-handoff-href.test.js
 * Task 2.8 — Canonical SEO handoff URL builder
 */

const { buildSeoHandoffHref, ALLOWED_SOURCES, ANCHOR } = require('./seo-handoff-href');

let passed = 0; let failed = 0; const failures = [];
function test(label, fn) {
  try { fn(); process.stdout.write(`  ✅  ${label}\n`); passed++; }
  catch (e) { process.stdout.write(`  ❌  ${label}\n      ${e.message}\n`); failures.push({ label, error: e.message }); failed++; }
}
function assert(cond, msg)           { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertContains(s, sub, msg) { if (!s.includes(sub)) throw new Error(msg || `Expected to contain: ${JSON.stringify(sub)}`); }
function assertNotContains(s, sub, msg) { if (s.includes(sub)) throw new Error(msg || `Must NOT contain: ${JSON.stringify(sub)}`); }
function assertEquals(a, b, msg)     { if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function assertThrows(fn, msg)       { let threw = false; try { fn(); } catch (_) { threw = true; } assert(threw, msg || 'Expected to throw'); }

console.log('\nseo-handoff-href.test.js\n');

// ── Correct output ─────────────────────────────────────────────
test('1. service×city: correct canonical URL', () => {
  const href = buildSeoHandoffHref({ serviceSlug: 'plombier', citySlug: 'casablanca' });
  assertEquals(href, '/?fx_service=plombier&fx_city=casablanca&fx_source=seo#hero-quick-search');
});

test('2. service-only hub: fx_city omitted', () => {
  const href = buildSeoHandoffHref({ serviceSlug: 'plombier' });
  assertEquals(href, '/?fx_service=plombier&fx_source=seo#hero-quick-search');
  assertNotContains(href, 'fx_city', 'fx_city must be absent when citySlug not provided');
});

test('3. beni-mellal (hyphenated city slug)', () => {
  const href = buildSeoHandoffHref({ serviceSlug: 'plombier', citySlug: 'beni-mellal' });
  assertEquals(href, '/?fx_service=plombier&fx_city=beni-mellal&fx_source=seo#hero-quick-search');
});

test('4. electricien×rabat', () => {
  const href = buildSeoHandoffHref({ serviceSlug: 'electricien', citySlug: 'rabat' });
  assertEquals(href, '/?fx_service=electricien&fx_city=rabat&fx_source=seo#hero-quick-search');
});

test('5. all 8 canonical service slugs produce valid URLs', () => {
  const services = ['plombier','electricien','serrurier','climatisation','peintre','menuisier','macon','nettoyage'];
  services.forEach(svc => {
    const href = buildSeoHandoffHref({ serviceSlug: svc });
    assertContains(href, 'fx_service=' + svc, `${svc}: must contain fx_service=${svc}`);
    assertContains(href, 'fx_source=seo', `${svc}: must contain fx_source=seo`);
    assertContains(href, '#hero-quick-search', `${svc}: must contain anchor`);
    assertNotContains(href, 'fx_city', `${svc}: must not contain fx_city`);
  });
});

test('6. parameter order is deterministic: fx_service, [fx_city], fx_source', () => {
  const withCity = buildSeoHandoffHref({ serviceSlug: 'plombier', citySlug: 'casablanca' });
  const svcIdx = withCity.indexOf('fx_service');
  const cityIdx = withCity.indexOf('fx_city');
  const srcIdx = withCity.indexOf('fx_source');
  assert(svcIdx < cityIdx, 'fx_service must come before fx_city');
  assert(cityIdx < srcIdx, 'fx_city must come before fx_source');

  const noCity = buildSeoHandoffHref({ serviceSlug: 'plombier' });
  const svcIdx2 = noCity.indexOf('fx_service');
  const srcIdx2 = noCity.indexOf('fx_source');
  assert(svcIdx2 < srcIdx2, 'fx_service must come before fx_source (no city)');
});

test('7. anchor is always #hero-quick-search', () => {
  assertEquals(ANCHOR, '#hero-quick-search');
  const href = buildSeoHandoffHref({ serviceSlug: 'plombier', citySlug: 'casablanca' });
  assert(href.endsWith('#hero-quick-search'), 'URL must end with the canonical anchor');
});

test('8. URL starts with /?', () => {
  const href = buildSeoHandoffHref({ serviceSlug: 'plombier' });
  assert(href.startsWith('/?'), 'URL must start with /?');
});

test('9. source defaults to seo', () => {
  const href = buildSeoHandoffHref({ serviceSlug: 'plombier' });
  assertContains(href, 'fx_source=seo');
});

test('10. citySlug=null is treated as absent (no fx_city)', () => {
  const href = buildSeoHandoffHref({ serviceSlug: 'plombier', citySlug: null });
  assertNotContains(href, 'fx_city', 'null citySlug must not emit fx_city');
});

// ── Validation: required fields ────────────────────────────────
test('11. missing serviceSlug throws', () => {
  assertThrows(() => buildSeoHandoffHref({}), 'Missing serviceSlug must throw');
});

test('12. empty serviceSlug throws', () => {
  assertThrows(() => buildSeoHandoffHref({ serviceSlug: '' }), 'Empty serviceSlug must throw');
});

test('13. invalid slug with uppercase throws', () => {
  assertThrows(() => buildSeoHandoffHref({ serviceSlug: 'Plombier' }), 'Uppercase slug must throw');
});

test('14. invalid slug with display label (space) throws', () => {
  assertThrows(() => buildSeoHandoffHref({ serviceSlug: 'service de nettoyage' }), 'Display label must throw');
});

test('15. invalid slug with ?= characters throws', () => {
  assertThrows(() => buildSeoHandoffHref({ serviceSlug: 'service=plombier' }), 'Legacy ?= format must throw');
});

test('16. invalid source throws', () => {
  assertThrows(() => buildSeoHandoffHref({ serviceSlug: 'plombier', source: 'hack' }), 'Unknown source must throw');
  assertThrows(() => buildSeoHandoffHref({ serviceSlug: 'plombier', source: '' }), 'Empty source must throw');
  assertThrows(() => buildSeoHandoffHref({ serviceSlug: 'plombier', source: 'organic' }), 'Unapproved source must throw');
});

test('17. invalid citySlug with uppercase throws', () => {
  assertThrows(() => buildSeoHandoffHref({ serviceSlug: 'plombier', citySlug: 'Casablanca' }), 'Uppercase city must throw');
});

test('18. invalid citySlug with display label throws', () => {
  assertThrows(() => buildSeoHandoffHref({ serviceSlug: 'plombier', citySlug: 'Béni Mellal' }), 'Display label city must throw');
});

test('19. non-string opts throws', () => {
  assertThrows(() => buildSeoHandoffHref('plombier'), 'String opts must throw');
  assertThrows(() => buildSeoHandoffHref(null), 'null opts must throw');
});

// ── Forbidden patterns ─────────────────────────────────────────
test('20. no generic ?service= in output', () => {
  const href = buildSeoHandoffHref({ serviceSlug: 'plombier', citySlug: 'casablanca' });
  assertNotContains(href, '?service=', 'No generic ?service= param');
  assertNotContains(href, '&service=', 'No generic &service= param');
});

test('21. no generic ?city= in output', () => {
  const href = buildSeoHandoffHref({ serviceSlug: 'plombier', citySlug: 'casablanca' });
  assertNotContains(href, '?city=', 'No generic ?city= param');
  assertNotContains(href, '&city=', 'No generic &city= param');
});

test('22. no RAFI parameters in output', () => {
  const href = buildSeoHandoffHref({ serviceSlug: 'plombier', citySlug: 'casablanca' });
  assertNotContains(href, 'modal', 'No modal param');
  assertNotContains(href, 'rafi', 'No rafi param');
  assertNotContains(href, 'openExpress', 'No openExpress param');
  assertNotContains(href, 'dispatch', 'No dispatch param');
});

test('23. ALLOWED_SOURCES is frozen/correct', () => {
  assert(Array.isArray(ALLOWED_SOURCES), 'ALLOWED_SOURCES must be array');
  assert(ALLOWED_SOURCES.includes('seo'), 'ALLOWED_SOURCES must include seo');
  assertEquals(ALLOWED_SOURCES.length, 1, 'Only seo is allowed at V3 launch');
});

test('24. deterministic: same inputs always produce same output', () => {
  const a = buildSeoHandoffHref({ serviceSlug: 'plombier', citySlug: 'casablanca' });
  const b = buildSeoHandoffHref({ serviceSlug: 'plombier', citySlug: 'casablanca' });
  assertEquals(a, b, 'Output must be deterministic');
});

test('25. service-city URL matches the canonical Task 2.7 contract exactly', () => {
  // The canonical contract established in Task 2.6/2.7:
  // /?fx_service=plombier&fx_city=casablanca&fx_source=seo#hero-quick-search
  const href = buildSeoHandoffHref({ serviceSlug: 'plombier', citySlug: 'casablanca' });
  assertEquals(href, '/?fx_service=plombier&fx_city=casablanca&fx_source=seo#hero-quick-search',
    'Must match the canonical contract established in Task 2.6');
});

test('26. hub URL matches the canonical Task 2.7 hub contract exactly', () => {
  // The canonical hub contract: /?fx_service=plombier&fx_source=seo#hero-quick-search
  const href = buildSeoHandoffHref({ serviceSlug: 'plombier' });
  assertEquals(href, '/?fx_service=plombier&fx_source=seo#hero-quick-search',
    'Must match the canonical hub contract established in Task 2.7');
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
