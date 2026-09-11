'use strict';
/**
 * artisan-card-v3.test.js — Verification suite for artisan-card-v3.js + artisan-card-v3.css
 * Version: v3-a2 · 2026-09-10
 *
 * Covers all 23 Task 2.4A required tests + full prior test suite.
 * All tests are pure static analysis — no browser, no DOM, no network.
 */

const fs   = require('fs');
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
function assertThrows(fn, msgFragment)    {
  let threw = false;
  let err   = null;
  try { fn(); } catch (e) { threw = true; err = e; }
  if (!threw) throw new Error('Expected an error to be thrown');
  if (msgFragment && err && !err.message.includes(msgFragment)) {
    throw new Error(`Expected error containing "${msgFragment}", got: "${err.message}"`);
  }
}

// ── Load modules ──────────────────────────────────────────────────────────────

const {
  buildArtisanCard,
  _esc,
  _plainTextDesc,
  _descriptionForCard,
  _isValidSlug,
  _isValidPhotoUrl,
  _isValidProfileHref,
  _buildProfileHref,
  _buildPriceHtml,
  _svcLabel,
  _svcIcon,
} = require('./artisan-card-v3');

const { BANNED_TERMS } = require('./content-guard');

const CSS_PATH = path.join(__dirname, '../../assets/artisan-card-v3.css');
const css      = fs.readFileSync(CSS_PATH, 'utf8');

// Minimal valid opts
function validOpts(overrides = {}) {
  return Object.assign({
    name:         'Mohammed Alami',
    serviceLabel: 'Plomberie',
    cityLabel:    'Casablanca',
  }, overrides);
}

console.log('\nartisan-card-v3.test.js (v3-a2)\n');

// ══════════════════════════════════════════════════════════════
// TASK 2.4A REQUIRED TESTS (23 tests)
// ══════════════════════════════════════════════════════════════

console.log('── 2.4A: Profile Link Contract ──────────────────────────────');

test('2.4A-1. valid publicSlug → /artisan/{slug}', () => {
  const html = buildArtisanCard(validOpts({ publicSlug: 'alami-casablanca-plombier' }));
  assertContains(html, 'href="/artisan/alami-casablanca-plombier"');
  assertContains(html, 'fxseo-card-v3__profile-link');
});

test('2.4A-2. missing publicSlug → no profile CTA rendered', () => {
  const html = buildArtisanCard(validOpts());
  assertNotContains(html, 'fxseo-card-v3__profile-link');
  assertNotContains(html, 'href="/artisan');
  assertNotContains(html, '<a ');
});

test('2.4A-3. invalid publicSlug → no profile CTA rendered', () => {
  // Various invalid patterns — all must produce no CTA
  const invalids = [
    'ab',                          // too short
    'UPPERCASE',                   // uppercase
    'slug with spaces',            // spaces
    'javascript:alert(1)',         // dangerous
    '../../../etc/passwd',         // path traversal
    '',                            // empty
  ];
  invalids.forEach(slug => {
    const html = buildArtisanCard(validOpts({ publicSlug: slug }));
    assertNotContains(html, 'href="/artisan/', `Expected no profile CTA for invalid slug: "${slug}"`);
    assertNotContains(html, '<a ', `Expected no anchor for invalid slug: "${slug}"`);
  });
});

test('2.4A-4. No /artisan-profile.html?id= output anywhere in card HTML', () => {
  // Even with id-like data — legacy URL must never be generated
  const html = buildArtisanCard(validOpts({ publicSlug: 'alami-casablanca' }));
  assertNotContains(html, 'artisan-profile.html');
  assertNotContains(html, '?id=');
});

test('2.4A-5. No ?id= profile fallback is possible', () => {
  // Card with NO publicSlug — must produce no profile link at all, not a legacy one
  const html = buildArtisanCard(validOpts());
  assertNotContains(html, 'artisan-profile.html');
  assertNotContains(html, '?id=');
  assertNotContains(html, 'href=');
});

test('2.4A-6. id field is no longer in canonical card API (throws)', () => {
  assertThrows(() => buildArtisanCard(validOpts({ id: '1234' })), 'forbidden field "id"');
});

test('2.4A-7. Internal/Supabase IDs never render in card HTML', () => {
  const html = buildArtisanCard(validOpts({ publicSlug: 'alami-casa' }));
  // No raw numeric IDs, no supabase UUIDs, no data-artisan-id attributes
  assertNotContains(html, 'data-artisan-id');
  assertNotContains(html, '_supabase_id');
  assertNotContains(html, 'legacy_id');
});

console.log('── 2.4A: Description Truth-Guard ────────────────────────────');

test('2.4A-8. Safe description renders correctly', () => {
  const html = buildArtisanCard(validOpts({
    description: 'Expert en plomberie sanitaire et chauffage.',
  }));
  assertContains(html, 'fxseo-card-v3__desc');
  assertContains(html, 'plomberie sanitaire');
});

test('2.4A-9. HTML inside description is stripped (not escaped, not rendered)', () => {
  const html = buildArtisanCard(validOpts({
    description: '<b>Expert</b> en <i>plomberie</i> & travaux.',
  }));
  assertNotContains(html, '<b>');
  assertNotContains(html, '<i>');
  assertNotContains(html, '&lt;b&gt;'); // tags stripped, not escaped
  assertContains(html, 'Expert');
  assertContains(html, 'plomberie');
  assertContains(html, '&amp;'); // & is escaped in final output
});

test('2.4A-10. Banned description is omitted entirely — no block rendered', () => {
  // "artisan vérifié" is a BANNED_TERM
  const html = buildArtisanCard(validOpts({
    description: 'Artisan vérifié disponible immédiatement.',
  }));
  // Description block must be completely absent
  assertNotContains(html, 'fxseo-card-v3__desc');
  assertNotContains(html, 'vérifié');
  assertNotContains(html, 'disponible');
});

test('2.4A-11. Banned phrase is NOT surgically removed — no mutilated fragment', () => {
  // Input: "Artisan vérifié disponible immédiatement"
  // Old (wrong) output: "Artisan disponible"
  // Correct output: description block absent entirely
  const html = buildArtisanCard(validOpts({
    description: 'Artisan vérifié disponible immédiatement.',
  }));
  // The word "Artisan" alone must NOT appear in a desc context
  // (it would if the banned phrase was surgically removed)
  assertNotContains(html, 'fxseo-card-v3__desc');
  // Confirm the remaining text "Artisan" is not in a description paragraph
  // (it may appear in aria-label, so check specifically for <p> context)
  assert(!html.includes('<p class="fxseo-card-v3__desc">'), 'desc block must not exist');
});

test('2.4A-11b. Another banned phrase: devis gratuit → full omission', () => {
  const html = buildArtisanCard(validOpts({
    description: 'Contactez-moi pour un devis gratuit.',
  }));
  assertNotContains(html, 'fxseo-card-v3__desc');
  assertNotContains(html, 'devis gratuit');
});

test('2.4A-11c. Banned phrase mid-sentence → full omission (no partial output)', () => {
  const html = buildArtisanCard(validOpts({
    description: 'Expert plombier. Artisan vérifié Fixeo. Disponible 7j/7.',
  }));
  assertNotContains(html, 'fxseo-card-v3__desc');
  // The clean part "Expert plombier" must NOT appear alone in desc context
  assert(!html.includes('<p class="fxseo-card-v3__desc">'), 'desc block must not exist');
});

test('2.4A-12. Empty description degrades gracefully — no desc block', () => {
  const html = buildArtisanCard(validOpts({ description: '' }));
  assertNotContains(html, 'fxseo-card-v3__desc');
  // Card still renders fully
  assertContains(html, 'fxseo-card-v3__trust');
  assertContains(html, 'fxseo-card-v3__action');
});

test('2.4A-13. Description output is HTML-escaped', () => {
  const html = buildArtisanCard(validOpts({
    description: 'Expert en plomberie & chauffage "central".',
  }));
  assertContains(html, '&amp;');
  assertContains(html, '&quot;');
  assertNotContains(html, '"central"'); // raw quotes escaped
});

test('2.4A-14. Description max-length behavior is deterministic', () => {
  const long = 'Expert en plomberie. '.repeat(20); // >160 chars, no banned terms
  const html = buildArtisanCard(validOpts({ description: long }));
  assertContains(html, 'fxseo-card-v3__desc');
  // Must contain ellipsis (truncated)
  assertContains(html, '\u2026');
  // Must not exceed DESC_MAX_LENGTH significantly
  const match = html.match(/<p class="fxseo-card-v3__desc">([^<]*)<\/p>/);
  assert(match, 'desc paragraph not found');
  // Unescaping entities to get raw char count — rough check
  const rawText = match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  assert(rawText.length <= 170, `Description too long after truncation: ${rawText.length}`);
});

console.log('── 2.4A: Price Contract Verification ────────────────────────');

test('2.4A-15. priceFrom only renders when supplied with a positive value', () => {
  const with_price = buildArtisanCard(validOpts({ priceFrom: 150 }));
  assertContains(with_price, 'fxseo-card-v3__price');
  assertContains(with_price, '150');

  const no_price = buildArtisanCard(validOpts());
  assertNotContains(no_price, 'fxseo-card-v3__price');
});

test('2.4A-16. priceLabel only renders when supplied', () => {
  const with_label = buildArtisanCard(validOpts({ priceLabel: 'À partir de 120 DH' }));
  assertContains(with_label, 'fxseo-card-v3__price');
  assertContains(with_label, 'À partir de 120 DH');

  const no_label = buildArtisanCard(validOpts());
  assertNotContains(no_label, 'fxseo-card-v3__price');
});

test('2.4A-17. Missing price data produces no invented price', () => {
  const html = buildArtisanCard(validOpts());
  assertNotContains(html, 'fxseo-card-v3__price');
  assertNotContains(html, 'MAD');
  assertNotContains(html, 'DH');
  assertNotContains(html, 'Devis');
  assertNotContains(html, 'gratuit');
});

test('2.4A-18. No fixed/guaranteed-price wording in price block', () => {
  const html = buildArtisanCard(validOpts({ priceFrom: 200 }));
  const lc = html.toLowerCase();
  assertNotContains(lc, 'prix fixe');
  assertNotContains(lc, 'tarif fixe');
  assertNotContains(lc, 'garanti');
  assertNotContains(lc, 'fixé');
  // "Tarif indicatif" IS present — that's the correct, non-guaranteed wording
  assertContains(html, 'Tarif indicatif');
});

// ══════════════════════════════════════════════════════════════
// TASK 2.4A-19: Prior structural/security/accessibility tests
// (retained from v3-a1 test suite, updated where API changed)
// ══════════════════════════════════════════════════════════════

console.log('── Card Structure ───────────────────────────────────────────');

test('Card-1. Returns a string containing a valid article element', () => {
  const html = buildArtisanCard(validOpts());
  assert(typeof html === 'string', 'Output is not a string');
  assertContains(html, '<article class="fxseo-card-v3"');
  assertContains(html, '</article>');
});

test('Card-2. Required public fields render (name, service, city)', () => {
  const html = buildArtisanCard(validOpts());
  assertContains(html, 'Mohammed Alami');
  assertContains(html, 'Plomberie');
  assertContains(html, 'Casablanca');
});

test('Card-3. aria-label on article includes name + service + city', () => {
  const html = buildArtisanCard(validOpts());
  assertContains(html, 'aria-label="Mohammed Alami, Plomberie');
  assertContains(html, 'Casablanca');
});

test('Card-4. h3 heading present with correct class', () => {
  const html = buildArtisanCard(validOpts());
  assertContains(html, '<h3 class="fxseo-card-v3__name">');
  assertContains(html, 'Mohammed Alami');
  assertContains(html, '</h3>');
});

test('Card-5. Trust rows present: profil référencé + paiement', () => {
  const html = buildArtisanCard(validOpts());
  assertContains(html, 'Profil r\u00e9f\u00e9renc\u00e9 sur FIXEO');
  assertContains(html, 'Paiement apr\u00e8s intervention');
  assertContains(html, 'fxseo-card-v3__trust');
});

console.log('── Photo / Fallback ─────────────────────────────────────────');

test('Card-6. Optional photo renders when valid HTTPS URL supplied', () => {
  const html = buildArtisanCard(validOpts({ photoUrl: 'https://storage.fixeo.ma/avatars/alami.jpg' }));
  assertContains(html, 'fxseo-card-v3__avatar-img');
  assertContains(html, 'src="https://storage.fixeo.ma/avatars/alami.jpg"');
  assertContains(html, 'data-avatar-type="real-photo"');
});

test('Card-7. Alt text on photo uses artisan name', () => {
  const html = buildArtisanCard(validOpts({ photoUrl: 'https://cdn.fixeo.ma/photos/alami.jpg' }));
  assertContains(html, 'alt="Photo de Mohammed Alami"');
});

test('Card-8. Missing photo → initials fallback rendered', () => {
  const html = buildArtisanCard(validOpts());
  assertContains(html, 'fxseo-card-v3__avatar-initials');
  assertContains(html, 'data-avatar-state="initials"');
  assertContains(html, '>M<');
});

test('Card-9. No <img> in fallback state', () => {
  const html = buildArtisanCard(validOpts());
  assertNotContains(html, '<img');
});

console.log('── Forbidden Fields ─────────────────────────────────────────');

test('Card-14. phone field rejected with error', () => {
  assertThrows(() => buildArtisanCard(validOpts({ phone: '+212600000000' })), 'forbidden field "phone"');
});

test('Card-15. email field rejected with error', () => {
  assertThrows(() => buildArtisanCard(validOpts({ email: 'alami@example.com' })), 'forbidden field "email"');
});

test('Card-16. No phone output in card HTML', () => {
  const html = buildArtisanCard(validOpts({ description: 'Expert plombier.' }));
  assertNotContains(html, '+212');
  assertNotContains(html, 'tel:');
});

test('Card-17. No email output in card HTML', () => {
  const html = buildArtisanCard(validOpts({ description: 'Expert plombier.' }));
  assertNotContains(html, 'mailto:');
});

test('Card-18. verified field rejected (no badge claim allowed)', () => {
  assertThrows(() => buildArtisanCard(validOpts({ verified: true })), 'forbidden field "verified"');
});

test('Card-19. commission field rejected', () => {
  assertThrows(() => buildArtisanCard(validOpts({ commission: 0.15 })), 'forbidden field "commission"');
});

test('Card-20. claim_status field rejected', () => {
  assertThrows(() => buildArtisanCard(validOpts({ claim_status: 'claimed' })), 'forbidden field "claim_status"');
});

test('Card-21. rating field rejected', () => {
  assertThrows(() => buildArtisanCard(validOpts({ rating: 4.8 })), 'forbidden field "rating"');
});

test('Card-22. availability field rejected', () => {
  assertThrows(() => buildArtisanCard(validOpts({ availability: 'available' })), 'forbidden field "availability"');
});

console.log('── Security / Escaping ──────────────────────────────────────');

test('Card-23. Text is HTML-escaped (name with special chars)', () => {
  const html = buildArtisanCard(validOpts({ name: 'Ali <script>alert(1)</script>' }));
  assertNotContains(html, '<script>');
  assertContains(html, '&lt;script&gt;');
});

test('Card-24. Description is sanitized: HTML tags stripped, & escaped', () => {
  const html = buildArtisanCard(validOpts({
    description: 'Expert en plomberie & travaux.',
  }));
  assertContains(html, 'plomberie');
  assertContains(html, '&amp;');
  assertContains(html, 'travaux');
});

test('Card-25. javascript: href in publicSlug rejected — no profile link', () => {
  const html = buildArtisanCard(validOpts({ publicSlug: 'javascript:alert(1)' }));
  assertNotContains(html, 'javascript:');
  assertNotContains(html, '<a ');
});

test('Card-26. Unsafe photo URL rejected — data: scheme → initials fallback', () => {
  const html = buildArtisanCard(validOpts({ photoUrl: 'data:image/png;base64,abc123' }));
  assertNotContains(html, 'data:image');
  assertContains(html, 'fxseo-card-v3__avatar-initials');
});

test('Card-27. Unsafe photo URL rejected — HTTP (not HTTPS) → initials fallback', () => {
  const html = buildArtisanCard(validOpts({ photoUrl: 'http://cdn.fixeo.ma/photo.jpg' }));
  assertNotContains(html, 'src="http://');
  assertContains(html, 'fxseo-card-v3__avatar-initials');
});

console.log('── Rating / Reviews ─────────────────────────────────────────');

test('Card-28. No rating rendered — rating field is forbidden', () => {
  const html = buildArtisanCard(validOpts());
  assertNotContains(html, 'fxseo-card-v3__rating');
  assertNotContains(html, '★');
  assertNotContains(html, '5.0');
});

test('Card-29. No fake default rating (no star or numeric placeholder)', () => {
  const html = buildArtisanCard(validOpts());
  const ratingPatterns = ['rating-num', 'star', '(0)', '0 avis', '5.0'];
  ratingPatterns.forEach(p => {
    assertNotContains(html.toLowerCase(), p.toLowerCase(), `Found unexpected rating element: "${p}"`);
  });
});

test('Card-30. reviewCount field rejected', () => {
  assertThrows(() => buildArtisanCard(validOpts({ reviewCount: 42 })), 'forbidden field "reviewCount"');
});

console.log('── Vocabulary Compliance ────────────────────────────────────');

test('Vocab-1. No banned claims emitted', () => {
  const html = buildArtisanCard(validOpts({ publicSlug: 'alami-casablanca' }));
  const banned = [
    'artisan v\u00e9rifi\u00e9', 'artisan qualifi\u00e9', 'artisan certifi\u00e9',
    'disponible imm\u00e9diatement', 'disponible maintenant',
    '24h/7', 'r\u00e9ponse garantie', 'devis gratuit',
    'meilleur artisan', 'top artisan', 'matching intelligent',
  ];
  const lowerHtml = html.toLowerCase();
  banned.forEach(phrase => {
    assertNotContains(lowerHtml, phrase.toLowerCase(), `Banned phrase in output: "${phrase}"`);
  });
});

test('Vocab-2. Approved vocabulary present — "profil référencé sur FIXEO"', () => {
  const html = buildArtisanCard(validOpts());
  assert(html.includes('Profil r\u00e9f\u00e9renc\u00e9 sur FIXEO'), 'Missing trust row');
});

console.log('── Determinism / Legacy Isolation ───────────────────────────');

test('Iso-1. Deterministic output — same input → same output', () => {
  const opts = validOpts({ publicSlug: 'alami-casa', description: 'Expert plombier.' });
  const html1 = buildArtisanCard(opts);
  const html2 = buildArtisanCard(opts);
  assert(html1 === html2, 'Output is not deterministic');
});

test('Iso-2. No legacy pvc-* classes in output', () => {
  const html = buildArtisanCard(validOpts({ publicSlug: 'alami-casa' }));
  assertNotContains(html, 'pvc-');
  assertNotContains(html, 'fhp-');
  assertNotContains(html, 'artdir-');
});

test('Iso-3. No artisan-card-conversion-v1 class names in output', () => {
  const html = buildArtisanCard(validOpts());
  assertNotContains(html, 'pvc-card');
  assertNotContains(html, 'pvc-avatar');
  assertNotContains(html, 'pvc-name');
  assertNotContains(html, 'pvc-trust-v3b');
});

console.log('── CSS Scope ─────────────────────────────────────────────────');

test('CSS-1. All fxseo-card-v3 selectors scoped under body.seo-service-page', () => {
  const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const lines   = cssCode.split('\n');
  const violations = lines.filter(l => {
    const t = l.trim();
    if (!t.endsWith('{') && !t.endsWith(',')) return false;
    if (l[0] === ' ' || l[0] === '\t') return false;
    if (t.startsWith('@')) return false;
    return !t.startsWith('body.seo-service-page');
  });
  assert(violations.length === 0, `Unscoped top-level selectors:\n  ${violations.slice(0, 5).join('\n  ')}`);
});

test('CSS-2. No generic img / a / article / h3 selectors (bare, unscoped)', () => {
  const cssLines     = css.split('\n');
  const bareElements = ['img', 'a', 'article', 'h3', 'button'];
  const violations   = cssLines.filter(line => {
    const t = line.trim();
    if (line[0] === ' ' || line[0] === '\t') return false;
    return bareElements.some(el =>
      t === el + ' {' || t === el + '{' || t === el + ',' ||
      (t.startsWith(el + ':') && t.endsWith('{'))
    );
  });
  assert(violations.length === 0, `Bare global element selectors:\n  ${violations.join('\n  ')}`);
});

test('CSS-3. No .pvc-* / .fhp-* / .artdir-* overrides', () => {
  const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '');
  ['pvc-', 'fhp-', 'artdir-'].forEach(prefix => {
    assertNotContains(cssCode, '.' + prefix, `Legacy class namespace "${prefix}" in CSS`);
  });
});

test('CSS-4. Mobile rules present (max-width: 420px)', () => {
  assertContains(css, 'max-width: 420px');
  const mq = css.slice(css.indexOf('max-width: 420px'));
  assertContains(mq, 'fxseo-card-v3');
});

test('CSS-5. Desktop rules present (min-width: 768px)', () => {
  assertContains(css, 'min-width: 768px');
  const mq = css.slice(css.indexOf('min-width: 768px'));
  assertContains(mq, 'fxseo-card-v3');
});

test('CSS-6. focus-visible treatment present', () => {
  assertContains(css, ':focus-visible');
  assertContains(css, 'outline:');
});

test('CSS-7. prefers-reduced-motion present', () => {
  assertContains(css, 'prefers-reduced-motion: reduce');
});

test('CSS-8. No overflow:hidden on card shell (would clip focus rings)', () => {
  const cardBlockIdx = css.indexOf('body.seo-service-page .fxseo-card-v3 {');
  const cardBlockEnd = css.indexOf('\n}', cardBlockIdx) + 2;
  const cardBlock    = css.slice(cardBlockIdx, cardBlockEnd);
  assertNotContains(cardBlock, 'overflow: hidden', 'Card shell must not set overflow:hidden');
});

console.log('── Input Validation ─────────────────────────────────────────');

test('Input-1. Required field name — empty string throws', () => {
  assertThrows(() => buildArtisanCard(validOpts({ name: '' })), 'name is required');
});

test('Input-2. Required field serviceLabel — empty string throws', () => {
  assertThrows(() => buildArtisanCard(validOpts({ serviceLabel: '' })), 'serviceLabel is required');
});

test('Input-3. Required field cityLabel — empty string throws', () => {
  assertThrows(() => buildArtisanCard(validOpts({ cityLabel: '' })), 'cityLabel is required');
});

test('Input-4. opts not an object — throws TypeError', () => {
  assertThrows(() => buildArtisanCard(null),     'opts must be a plain object');
  assertThrows(() => buildArtisanCard('string'), 'opts must be a plain object');
});

console.log('── Helper Units ─────────────────────────────────────────────');

test('Helper-1. _esc escapes all HTML special characters', () => {
  assert(_esc('<script>&"\'</script>') === '&lt;script&gt;&amp;&quot;&#39;&lt;/script&gt;');
  assert(_esc(null) === '');
  assert(_esc(undefined) === '');
  assert(_esc(0) === '0');
});

test('Helper-2. _plainTextDesc strips HTML tags only (no content removal)', () => {
  const result = _plainTextDesc('<b>Expert</b> plombier & travaux vérifié.');
  assertNotContains(result, '<b>');
  assertContains(result, 'Expert');
  assertContains(result, 'plombier');
  assertContains(result, 'vérifi\u00e9'); // content preserved at this stage
  assertContains(result, '&'); // & not escaped at this stage — that's correct
});

test('Helper-3. _plainTextDesc normalizes whitespace', () => {
  const result = _plainTextDesc('  Expert   en    plomberie.  ');
  assert(result === 'Expert en plomberie.', `Got: "${result}"`);
});

test('Helper-4. _plainTextDesc returns empty for null/undefined', () => {
  assert(_plainTextDesc(null) === '');
  assert(_plainTextDesc(undefined) === '');
  assert(_plainTextDesc('') === '');
});

test('Helper-5. _descriptionForCard — safe description returns escaped string', () => {
  const result = _descriptionForCard('Expert en plomberie & chauffage.');
  assert(typeof result === 'string', 'Expected string');
  assertContains(result, 'plomberie');
  assertContains(result, '&amp;'); // escaped
});

test('Helper-6. _descriptionForCard — banned term returns null', () => {
  // "artisan vérifié" is in BANNED_TERMS
  const result = _descriptionForCard('Artisan v\u00e9rifi\u00e9 Fixeo.');
  assert(result === null, `Expected null, got: ${JSON.stringify(result)}`);
});

test('Helper-7. _descriptionForCard — "devis gratuit" returns null', () => {
  const result = _descriptionForCard('Contactez pour un devis gratuit rapide.');
  assert(result === null, `Expected null, got: ${JSON.stringify(result)}`);
});

test('Helper-8. _descriptionForCard — null input returns null', () => {
  assert(_descriptionForCard(null) === null);
  assert(_descriptionForCard('') === null);
  assert(_descriptionForCard(undefined) === null);
});

test('Helper-9. _descriptionForCard — truncates at DESC_MAX_LENGTH', () => {
  const long = 'Expert en plomberie sanitaire. '.repeat(10);
  const result = _descriptionForCard(long);
  assert(typeof result === 'string', 'Expected string for safe long desc');
  assert(result.endsWith('\u2026'), 'Expected ellipsis');
  // decoded length should be ≤ DESC_MAX_LENGTH + ellipsis
  const raw = result.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  assert(raw.length <= 165, `Too long after truncation: ${raw.length}`);
});

test('Helper-10. _descriptionForCard uses content-guard BANNED_TERMS (not custom list)', () => {
  // Verify it checks the same terms as the canonical content-guard
  assert(Array.isArray(BANNED_TERMS) && BANNED_TERMS.length >= 10, 'BANNED_TERMS sanity check');
  // Pick a term from BANNED_TERMS and verify it causes omission
  const term = BANNED_TERMS[0]; // "artisan vérifié" or similar
  const desc  = 'Profil ' + term + ' disponible.';
  const result = _descriptionForCard(desc);
  assert(result === null, `Term "${term}" should cause omission but got: ${JSON.stringify(result)}`);
});

test('Helper-11. _isValidSlug accepts valid slugs', () => {
  assert(_isValidSlug('alami-casablanca-plombier'));
  assert(_isValidSlug('john-doe'));
  assert(_isValidSlug('abcd')); // 4 chars — minimum valid
});

test('Helper-12. _isValidSlug rejects invalid slugs', () => {
  assert(!_isValidSlug(''));
  assert(!_isValidSlug('ab'));             // too short
  assert(!_isValidSlug('javascript:alert(1)'));
  assert(!_isValidSlug('../../../etc/passwd'));
  assert(!_isValidSlug('slug with spaces'));
  assert(!_isValidSlug('UPPERCASE'));
  assert(!_isValidSlug(null));
});

test('Helper-13. _isValidPhotoUrl accepts valid HTTPS URLs', () => {
  assert(_isValidPhotoUrl('https://storage.fixeo.ma/avatars/alami.jpg'));
  assert(_isValidPhotoUrl('https://cdn.example.com/photo.webp'));
});

test('Helper-14. _isValidPhotoUrl rejects unsafe URLs', () => {
  assert(!_isValidPhotoUrl('http://cdn.fixeo.ma/photo.jpg'));
  assert(!_isValidPhotoUrl('data:image/png;base64,abc'));
  assert(!_isValidPhotoUrl('javascript:alert(1)'));
  assert(!_isValidPhotoUrl(''));
  assert(!_isValidPhotoUrl(null));
});

test('Helper-15. _buildProfileHref — clean URL from valid slug', () => {
  const href = _buildProfileHref('alami-casablanca');
  assert(href === '/artisan/alami-casablanca', `Got: ${href}`);
});

test('Helper-16. _buildProfileHref — null when no slug', () => {
  assert(_buildProfileHref(null) === null);
  assert(_buildProfileHref('')   === null);
  assert(_buildProfileHref('ab') === null); // invalid slug
});

test('Helper-17. _buildProfileHref — no legacy URL generated (no id param)', () => {
  // Even called with nothing, must never produce ?id= URL
  const href = _buildProfileHref(null);
  assert(href === null, `Expected null, got: ${href}`);
  assert(!String(href || '').includes('artisan-profile.html'));
  assert(!String(href || '').includes('?id='));
});

test('Helper-18. _buildPriceHtml — returns empty when no price data', () => {
  assert(_buildPriceHtml(null, null) === '');
  assert(_buildPriceHtml(0, null)    === '');
  assert(_buildPriceHtml(-5, null)   === '');
});

test('Helper-19. _buildPriceHtml — renders price_from when positive', () => {
  const html = _buildPriceHtml(120, null);
  assertContains(html, '120');
  assertContains(html, 'MAD');
  assertContains(html, 'Tarif indicatif');
});

test('Helper-20. _buildPriceHtml — price_label takes priority over price_from', () => {
  const html = _buildPriceHtml(120, 'À partir de 120 DH');
  assertContains(html, 'À partir de 120 DH');
  assertNotContains(html, 'Tarif indicatif'); // hint absent when label supplied
});

test('Helper-21. _svcLabel returns human label from slug', () => {
  assert(_svcLabel('plomberie')   === 'Plomberie');
  assert(_svcLabel('electricite') === 'Électricité');
  assert(_svcLabel('maconnerie')  === 'Maçonnerie');
  assert(_svcLabel('unknown')     === 'Unknown');
});

test('Helper-22. _svcIcon returns emoji from slug', () => {
  assert(_svcIcon('plomberie')   === '🔧');
  assert(_svcIcon('electricite') === '⚡');
  assert(_svcIcon('serrurerie')  === '🔑');
  assert(_svcIcon('unknown')     === '🔧');
});

// ══════════════════════════════════════════════════════════════
// Task 2.4A-19–23: Regression
// ══════════════════════════════════════════════════════════════

console.log('── 2.4A-19–23: Regression ───────────────────────────────────');

test('2.4A-19. Prior card structural tests — sample check passes', () => {
  const html = buildArtisanCard(validOpts({ publicSlug: 'alami-casa' }));
  assertContains(html, '<article class="fxseo-card-v3"');
  assertContains(html, 'fxseo-card-v3__trust');
  assertContains(html, 'fxseo-card-v3__action');
  assertContains(html, 'Profil r\u00e9f\u00e9renc\u00e9 sur FIXEO');
});

test('2.4A-20. seo-v3.css visual system: 66/66 pass', () => {
  const { execSync } = require('child_process');
  const result = execSync(
    'node seo/assets/seo-v3.test.js 2>&1',
    { cwd: path.join(__dirname, '../../..') }
  ).toString();
  assert(result.includes('Passed    : 66'), `seo-v3 tests failed:\n${result.slice(-400)}`);
  assert(result.includes('Failed    : 0'),  `seo-v3 had failures:\n${result.slice(-400)}`);
});

test('2.4A-21. page-template.js: 62/62 pass', () => {
  const { execSync } = require('child_process');
  const result = execSync(
    'node seo/generators/shared/page-template.test.js 2>&1',
    { cwd: path.join(__dirname, '../../..') }
  ).toString();
  assert(result.includes('Passed    : 62'), `page-template tests failed:\n${result.slice(-400)}`);
  assert(result.includes('Failed    : 0'),  `page-template had failures:\n${result.slice(-400)}`);
});

test('2.4A-22. seo-head.js: 42/42 pass', () => {
  const { execSync } = require('child_process');
  const result = execSync(
    'node seo/generators/shared/seo-head.test.js 2>&1',
    { cwd: path.join(__dirname, '../../..') }
  ).toString();
  assert(result.includes('Passed    : 42'), `seo-head tests failed:\n${result.slice(-400)}`);
  assert(result.includes('Failed    : 0'),  `seo-head had failures:\n${result.slice(-400)}`);
});

test('2.4A-23. content-guard remains 51/51', () => {
  const { execSync } = require('child_process');
  const result = execSync(
    'node seo/generators/shared/content-guard.test.js 2>&1',
    { cwd: path.join(__dirname, '../../..') }
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
