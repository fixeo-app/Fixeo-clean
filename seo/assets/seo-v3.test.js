'use strict';
/**
 * seo-v3.test.js — Static CSS verification for seo-v3.css (v3-a2)
 * Version: 2026-09-10
 *
 * Scope architecture verified:
 *   - All fxlp-* component selectors scoped under body.seo-service-page
 *   - No .fxseo-v3 namespace (page-template.js does not emit it)
 *   - No .navbar / .fixeo-footer / .bg-animated overrides (owned by global CSS)
 *   - Fixture HTML is ephemeral — written and deleted during test; not committed
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
function assertContains(str, sub, msg)    { if (!str.includes(sub)) throw new Error(msg || `Expected: ${JSON.stringify(sub)}`); }
function assertNotContains(str, sub, msg) { if (str.includes(sub)) throw new Error(msg || `Must NOT contain: ${JSON.stringify(sub)}`); }

// ── Load CSS source ───────────────────────────────────────────────────────────

const CSS_PATH = path.join(__dirname, 'seo-v3.css');
const css = fs.readFileSync(CSS_PATH, 'utf8');

// Strip CSS comment blocks and return only code lines.
// Handles both single-line and multi-line block comments.
function nonCommentLines(src) {
  // Remove /* ... */ blocks first (including multi-line)
  const noBlockComments = src.replace(/\/\*[\s\S]*?\*\//g, '');
  // Then filter out any lines that are purely line comments (// style, rare in CSS)
  return noBlockComments.split('\n').filter(l => {
    const t = l.trim();
    return t.length > 0 && !t.startsWith('//');
  }).join('\n');
}

const codeLines = nonCommentLines(css);

console.log('\nseo-v3.test.js (v3-a2)\n');

// ── FIXTURE: ephemeral — written and cleaned up after test ────────────────────

console.log('── Fixture ───────────────────────────────────────────────────');

const FIXTURE_PATH = path.join(__dirname, 'seo-v3-fixture.html');

test('Fixture-1. No committed seo-v3-fixture.html in repository', () => {
  // This test verifies the corrected architecture: fixture must not exist as a
  // committed artifact. It may be created and deleted ephemerally by Fixture-2.
  // If this test is called BEFORE Fixture-2, the file should not pre-exist.
  // If run after Fixture-2, the file should have been deleted.
  // Either way: if we see it here at test start, it's a repo leak — fail.
  // (We check existence only; Fixture-2 creates+deletes it mid-run.)
  // NOTE: This assertion runs at test discovery time, before Fixture-2.
  // If fixture was committed it would be present here. Pass = not present.
  if (fs.existsSync(FIXTURE_PATH)) {
    throw new Error(`seo-v3-fixture.html is present in the working directory. It must not be committed.`);
  }
});

test('Fixture-2. Test-generated fixture is ephemeral (written and cleaned up)', () => {
  // Write fixture for human manual inspection during this test run, then delete it.
  const { buildPage } = require('../generators/shared/page-template');

  const html = buildPage({
    pageType:  'service-city',
    generator: 'seo-v3-test-fixture',
    seo: {
      title:         'Plombier à Casablanca — Profils référencés sur Fixeo',
      description:   'Fixeo met en relation propriétaires et locataires avec des profils référencés à Casablanca.',
      canonicalPath: '/plombier/casablanca',
      service:       { key: 'plombier', label: 'Plombier' },
      city:          { key: 'casablanca', label: 'Casablanca' },
      breadcrumbs: [
        { name: 'Accueil',    path: '/' },
        { name: 'Plombier',   path: '/plombier' },
        { name: 'Casablanca', path: null },
      ],
    },
    hero: {
      eyebrow:    'Plombier · Casablanca',
      h1:         'Plombier à Casablanca',
      intro:      'Fixeo enregistre votre demande et la transmet aux artisans référencés à Casablanca.',
      ctaPrimary: {
        label: 'Décrire mon besoin à Casablanca',
        href:  '/?service=Plombier&city=Casablanca#hero-quick-search',
      },
      ctaSecondary: {
        label: 'Voir les profils référencés ↓',
        href:  '#fxlp-artisans',
      },
      trustLine: "Aucun paiement maintenant · Tarif confirmé avec l'artisan",
    },
    sections: [
      {
        type:    'steps',
        heading: 'Comment fonctionne Fixeo',
        steps: [
          { icon: '✏️', title: 'Décrivez votre besoin',   body: 'En quelques mots sur Fixeo.' },
          { icon: '📋', title: 'Fixeo transmet',           body: 'Votre demande est transmise aux profils référencés.' },
          { icon: '📞', title: "L'artisan vous contacte",  body: "Le tarif est confirmé avant toute intervention." },
        ],
      },
      {
        type:    'faq',
        heading: 'Questions fréquentes',
        items: [
          { q: 'Comment fonctionne Fixeo ?',    a: 'Vous décrivez votre besoin, Fixeo transmet aux profils référencés.' },
          { q: 'Quand est confirmé le tarif ?', a: "Le tarif définitif est confirmé par l'artisan avant toute intervention." },
        ],
      },
      {
        type:     'cta',
        eyebrow:  'Prêt à commencer ?',
        heading:  'Décrivez votre besoin à Casablanca',
        body:     "Fixeo enregistre votre demande. Tarif confirmé avec l'artisan.",
        ctaLabel: 'Décrire mon besoin',
        ctaHref:  '/?service=Plombier&city=Casablanca#hero-quick-search',
        note:     "Aucun paiement maintenant · Tarif confirmé avec l'artisan",
      },
    ],
    artisans: {
      heading:       'Plombiers référencés à Casablanca',
      subtext:       'Profils référencés sur Fixeo.',
      cityLabel:     'Casablanca',
      serviceSlug:   'plombier',
      categoryLabel: 'Plomberie',
    },
    extraCss: ['/seo/assets/seo-v3.css'],
  });

  // Verify key structural elements in generated HTML
  const checks = [
    ['fxlp-hero', '.fxlp-hero'],
    ['fxlp-steps-grid', '.fxlp-steps-grid'],
    ['fxlp-faq-list', '.fxlp-faq-list'],
    ['fxlp-cta-banner', '.fxlp-cta-banner'],
    ['fxlp-artisan-grid', '#fxlp-artisan-grid'],
    ['seo-service-page', 'body.seo-service-page (body class)'],
  ];
  checks.forEach(([sub, label]) => {
    if (!html.includes(sub)) throw new Error(`Missing ${label} in generated HTML`);
  });

  // Write fixture for manual inspection
  const preview = html.replace('</head>', `<style>\n${css}\n</style>\n</head>`);
  fs.writeFileSync(FIXTURE_PATH, preview);

  // Delete immediately — ephemeral only
  fs.unlinkSync(FIXTURE_PATH);

  // Confirm deleted
  if (fs.existsSync(FIXTURE_PATH)) throw new Error('Fixture file still exists after cleanup');
});

// ── SCOPE: namespace / boundary discipline ────────────────────────────────────

console.log('── Scope ────────────────────────────────────────────────────');

test('Scope-1. File exists and is non-empty', () => {
  assert(css.length > 5000, `File unexpectedly small: ${css.length} bytes`);
});

test('Scope-2. Scope anchor is body.seo-service-page (not .fxseo-v3)', () => {
  assertContains(css, 'body.seo-service-page');
  // The .fxseo-v3 namespace must NOT be used — page-template.js never emits it
  assertNotContains(codeLines, '.fxseo-v3', 'Stale .fxseo-v3 namespace found in code');
});

test('Scope-3. V3 tokens defined under body.seo-service-page', () => {
  // Token block must be scoped to body.seo-service-page, not :root
  // Search in full css (not comment-stripped) since tokens are in the token block
  const tokenIdx = css.indexOf('body.seo-service-page {');
  assert(tokenIdx !== -1, 'body.seo-service-page token block not found');
  // Token block ends at the next closing brace at the start of a line
  const endIdx = css.indexOf('\n}', tokenIdx) + 2;
  const tokenBlock = css.slice(tokenIdx, endIdx);
  assertContains(tokenBlock, '--v3-orange:',   'Missing --v3-orange in token block');
  assertContains(tokenBlock, '--v3-grad-cta:', 'Missing --v3-grad-cta in token block');
  assertContains(tokenBlock, '--v3-surface:',  'Missing --v3-surface in token block');
  assertContains(tokenBlock, '--v3-border:',   'Missing --v3-border in token block');
  assertContains(tokenBlock, '--v3-r-xl:',     'Missing --v3-r-xl in token block');
});

test('Scope-4. All fxlp-* component selectors scoped under body.seo-service-page', () => {
  // Every line that starts with a .fxlp- selector must be in body.seo-service-page context.
  // Approved stand-alone: none — all must be scoped.
  const lines = codeLines.split('\n');
  const violations = lines.filter(l => {
    const t = l.trim();
    return /^\.fxlp-/.test(t) && !t.startsWith('.fxseo-v3');
  });
  assert(
    violations.length === 0,
    `Unscoped .fxlp-* selectors (not prefixed by body.seo-service-page):\n  ${violations.slice(0, 5).join('\n  ')}`
  );
});

test('Scope-5. No generic .navbar styling (owned by main.css)', () => {
  // .navbar must NOT appear as a standalone scoped selector in V3 CSS
  // (body.seo-service-page > nav is also not needed — header is populated by JS)
  const navbarLines = codeLines.split('\n').filter(l => /\.navbar\b/.test(l));
  assert(navbarLines.length === 0, `V3 CSS must not style .navbar:\n  ${navbarLines.join('\n  ')}`);
});

test('Scope-6. No generic .fixeo-footer styling (owned by footer global CSS)', () => {
  const footerLines = codeLines.split('\n').filter(l => /\.fixeo-footer\b/.test(l));
  assert(footerLines.length === 0, `V3 CSS must not style .fixeo-footer:\n  ${footerLines.join('\n  ')}`);
});

test('Scope-7. No .bg-animated override (owned by main.css + fxlp-v1)', () => {
  const bgLines = codeLines.split('\n').filter(l => /\.bg-animated\b/.test(l));
  assert(bgLines.length === 0, `V3 CSS must not style .bg-animated:\n  ${bgLines.join('\n  ')}`);
});

test('Scope-8. No global img reset (owned by fixeo-local-flagship-v1.css)', () => {
  // img:not(.fixeo-logo-img) and img.fixeo-logo-img must not appear in V3 CSS
  assertNotContains(codeLines, 'img:not(.fixeo-logo-img)');
  assertNotContains(codeLines, 'img.fixeo-logo-img');
});

test('Scope-9. No universal * box-sizing reset (owned by fixeo-local-flagship-v1.css)', () => {
  // *, *::before, *::after { box-sizing } must not appear in V3 CSS
  const universalLines = codeLines.split('\n').filter(l => /^\s*\*\s*[{,]/.test(l));
  assert(universalLines.length === 0, `Universal * reset found in V3 CSS:\n  ${universalLines.join('\n  ')}`);
});

test('Scope-10. No global a { color } reset (owned by fixeo-local-flagship-v1.css)', () => {
  // Bare `a {` selector must not appear in V3 CSS
  const aLines = codeLines.split('\n').filter(l => /^a\s*\{/.test(l.trim()));
  assert(aLines.length === 0, `Bare global a selector found in V3 CSS:\n  ${aLines.join('\n  ')}`);
});

test('Scope-11. No !important overuse (≤12 occurrences)', () => {
  const count = (css.match(/!important/g) || []).length;
  assert(count <= 12, `Too many !important (${count}). Indicates cascade override wars.`);
});

// ── LEGACY: no RAFI / reservation / banned identifiers ───────────────────────

console.log('── Legacy ───────────────────────────────────────────────────');

test('Legacy-1. No fx-request-flow identifiers', () => {
  assertNotContains(codeLines, 'request-flow');
  assertNotContains(codeLines, 'fx-request-flow');
});

test('Legacy-2. No reservation CSS identifiers', () => {
  ['reservation', 'fxresf-', 'cod-payment', 'fixeo-reservation'].forEach(id => {
    assertNotContains(codeLines, id, `Legacy reservation identifier: ${id}`);
  });
});

test('Legacy-3. No RAFI hidden input selectors', () => {
  assertNotContains(codeLines, 'qsm-select-city');
  assertNotContains(codeLines, 'qsm-input-nlp');
  assertNotContains(codeLines, 'open-request-form');
});

test('Legacy-4. No artisan-card-conversion-v1 overrides (frozen)', () => {
  assertNotContains(codeLines, 'artisan-card-conversion-v1');
});

// ── SELECTORS: required visual system elements ────────────────────────────────

console.log('── Selectors ─────────────────────────────────────────────────');

test('Sel-1. Hero selectors present', () => {
  assertContains(css, '.fxlp-hero');
  assertContains(css, '.fxlp-h1');
  assertContains(css, '.fxlp-lead');
  assertContains(css, '.fxlp-hero-cta-group');
  assertContains(css, '.fxlp-hero-trust');
});

test('Sel-2. Section system selectors present', () => {
  assertContains(css, '.fxlp-section');
  assertContains(css, '.fxlp-section-title');
  assertContains(css, '.fxlp-section-sub');
  assertContains(css, '.fxlp-section-label');
  assertContains(css, '.fxlp-section-body');
  assertContains(css, '.fxlp-list');
});

test('Sel-3. Eyebrow selectors present', () => {
  assertContains(css, '.fxlp-eyebrow');
  assertContains(css, 'v3-dot-pulse');
});

test('Sel-4. Button selectors present', () => {
  assertContains(css, '.fxlp-btn-primary');
  assertContains(css, '.fxlp-btn-secondary');
});

test('Sel-5. Artisan-zone selectors present', () => {
  assertContains(css, '#fxlp-artisan-grid');
  assertContains(css, '#fxlp-artisan-empty');
  assertContains(css, '.fxlp-skeleton');
  assertContains(css, '.fxlp-artisan-grid');
  assertContains(css, '#fxlp-artisans');
  assertContains(css, '.fxlp-artisan-loading');
});

test('Sel-6. Skeleton shimmer animation present', () => {
  assertContains(css, 'v3-shimmer');
  assertContains(css, '@keyframes v3-shimmer');
});

test('Sel-7. Process / steps selectors present', () => {
  assertContains(css, '.fxlp-steps-grid');
  assertContains(css, '.fxlp-step');
  assertContains(css, '.fxlp-step-icon');
  assertContains(css, '.fxlp-step-title');
  assertContains(css, '.fxlp-step-body');
});

test('Sel-8. FAQ selectors present', () => {
  assertContains(css, '.fxlp-faq-list');
  assertContains(css, '.fxlp-faq-item');
  assertContains(css, '.fxlp-faq-summary');
  assertContains(css, '.fxlp-faq-chevron');
  assertContains(css, '.fxlp-faq-answer');
});

test('Sel-9. FAQ open state present', () => {
  assertContains(css, 'details.fxlp-faq-item[open]');
  assertContains(css, '.fxlp-faq-item[open]');
});

test('Sel-10. Final CTA selectors present', () => {
  assertContains(css, '.fxlp-cta-banner');
  assertContains(css, '.fxlp-cta-title');
  assertContains(css, '.fxlp-cta-lead');
  assertContains(css, '.fxlp-cta-eyebrow');
  assertContains(css, '.fxlp-cta-note');
});

test('Sel-11. Breadcrumb selectors present', () => {
  assertContains(css, '.fxlp-breadcrumbs');
  assertContains(css, '.fxlp-bc-sep');
});

test('Sel-12. Divider and wrap present', () => {
  assertContains(css, '.fxlp-divider');
  assertContains(css, '.fxlp-wrap');
});

test('Sel-13. Skip link present and focusable', () => {
  assertContains(css, '.fxlp-skip-link');
  assertContains(css, '.fxlp-skip-link:focus');
  // Off-screen pattern
  const skipIdx  = css.indexOf('.fxlp-skip-link');
  const focusIdx = css.indexOf('.fxlp-skip-link:focus');
  const skipBlock = css.slice(skipIdx, focusIdx + 80);
  assertContains(skipBlock, 'top: -999px', 'Skip link must use top: -999px off-screen pattern');
});

test('Sel-14. CTA decorative ::before/::after present', () => {
  assertContains(css, '.fxlp-cta-banner::before');
  assertContains(css, '.fxlp-cta-banner::after');
});

test('Sel-15. Zero LocalBusiness in CSS source', () => {
  assertNotContains(codeLines, 'LocalBusiness');
});

test('Sel-16. Dead selector fxlp-section--tinted removed', () => {
  // page-template.js never emits .fxlp-section--tinted — dead selector must be absent
  assertNotContains(codeLines, 'fxlp-section--tinted');
});

test('Sel-17. Dead selector fxlp-section-header removed', () => {
  // page-template.js never emits .fxlp-section-header — dead selector must be absent
  assertNotContains(codeLines, 'fxlp-section-header');
});

// ── LEAKAGE: verify legacy pages cannot be affected ──────────────────────────

console.log('── Leakage ───────────────────────────────────────────────────');

test('Leak-1. All selectors gated by body.seo-service-page or @keyframes/media', () => {
  // Every CSS rule block must be prefixed by body.seo-service-page or be an @rule.
  // Strategy: find lines that look like top-level selectors (no indentation, end with { or ,)
  // and verify they are inside body.seo-service-page context or are @-rules.
  const lines = css.split('\n');
  const topLevelSelectors = lines.filter((l, i) => {
    const t = l.trim();
    if (!t || t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return false;
    // @-rules are fine
    if (t.startsWith('@')) return false;
    // Must end with { or , to be a selector line
    if (!t.endsWith('{') && !t.endsWith(',')) return false;
    // Starts at column 0 (top-level, not indented inside a rule)
    if (l[0] === ' ' || l[0] === '\t') return false;
    return true;
  });
  // Allowed top-level selectors
  const allowed = [
    'body.seo-service-page',
    '@keyframes',
    '@media',
  ];
  const violations = topLevelSelectors.filter(l => {
    const t = l.trim();
    return !allowed.some(prefix => t.startsWith(prefix));
  });
  assert(
    violations.length === 0,
    `Top-level selectors found NOT gated by body.seo-service-page:\n  ${violations.slice(0, 5).join('\n  ')}`
  );
});

test('Leak-2. No selector that could match non-V3 pages (bare .navbar)', () => {
  assertNotContains(codeLines, '.navbar');
});

test('Leak-3. No selector that could match non-V3 pages (bare .fixeo-footer)', () => {
  assertNotContains(codeLines, '.fixeo-footer');
});

test('Leak-4. No selector that could match non-V3 pages (.bg-animated)', () => {
  assertNotContains(codeLines, '.bg-animated');
});

// ── RESPONSIVE ────────────────────────────────────────────────────────────────

console.log('── Responsive ───────────────────────────────────────────────');

test('Resp-1. ≤1100px breakpoint present', () => {
  assertContains(css, 'max-width: 1100px');
});

test('Resp-2. ≤820px breakpoint present', () => {
  assertContains(css, 'max-width: 820px');
});

test('Resp-3. ≤640px breakpoint present', () => {
  assertContains(css, 'max-width: 640px');
});

test('Resp-4. ≤420px breakpoint present', () => {
  assertContains(css, 'max-width: 420px');
});

test('Resp-5. min-width: 768px artisan grid switch to 3-column', () => {
  assertContains(css, 'min-width: 768px');
  const section = css.slice(css.indexOf('min-width: 768px'));
  assertContains(section, 'repeat(3, 1fr)');
});

test('Resp-6. Mobile CTA buttons full-width at ≤640px', () => {
  const mq640 = css.slice(css.indexOf('max-width: 640px'));
  assertContains(mq640, 'width: 100%');
});

test('Resp-7. No horizontal overflow risk — no fixed widths >1400px', () => {
  const wideWidths = (css.match(/width:\s*(\d+)px/gi) || [])
    .filter(m => parseInt(m.replace(/\D/g, '')) > 1400);
  assert(wideWidths.length === 0, `Fixed widths >1400px: ${wideWidths.join(', ')}`);
});

// ── ACCESSIBILITY ─────────────────────────────────────────────────────────────

console.log('── Accessibility ─────────────────────────────────────────────');

test('A11y-1. focus-visible treatment present', () => {
  assertContains(css, ':focus-visible');
  assertContains(css, 'outline:');
});

test('A11y-2. prefers-reduced-motion present', () => {
  assertContains(css, 'prefers-reduced-motion: reduce');
});

test('A11y-3. Skeleton animation disabled under reduced-motion', () => {
  const rmSection = css.slice(css.indexOf('prefers-reduced-motion: reduce'));
  assertContains(rmSection, '.fxlp-skeleton');
  assertContains(rmSection, 'animation: none');
});

test('A11y-4. Eyebrow pulse disabled under reduced-motion', () => {
  const rmSection = css.slice(css.indexOf('prefers-reduced-motion: reduce'));
  assertContains(rmSection, 'fxlp-eyebrow::before');
  assertContains(rmSection, 'animation: none');
});

test('A11y-5. Primary button min-height ≥48px', () => {
  const startIdx = css.indexOf('body.seo-service-page .fxlp-btn-primary {');
  const endIdx   = css.indexOf('\n}', startIdx) + 2;
  const block    = css.slice(startIdx, endIdx);
  assertContains(block, 'min-height: 48px', 'btn-primary block missing min-height: 48px');
});

test('A11y-6. Secondary button min-height ≥48px', () => {
  const startIdx = css.indexOf('body.seo-service-page .fxlp-btn-secondary {');
  const endIdx   = css.indexOf('\n}', startIdx) + 2;
  const block    = css.slice(startIdx, endIdx);
  assertContains(block, 'min-height: 48px', 'btn-secondary block missing min-height: 48px');
});

test('A11y-7. FAQ summary min-height ≥44px tap target', () => {
  const startIdx = css.indexOf('body.seo-service-page .fxlp-faq-summary {');
  const endIdx   = css.indexOf('\n}', startIdx) + 2;
  const block    = css.slice(startIdx, endIdx);
  assert(
    block.includes('min-height: 54px') || block.includes('min-height: 44px'),
    'FAQ summary min-height not found (should be ≥44px)'
  );
});

test('A11y-8. ::-webkit-details-marker hidden for custom FAQ', () => {
  assertContains(css, '::-webkit-details-marker');
  assertContains(css, 'display: none');
});

// ── SAFETY ────────────────────────────────────────────────────────────────────

console.log('── Safety ────────────────────────────────────────────────────');

test('Safety-1. No fixed heights that could truncate text content', () => {
  const heightPattern = /(?<!min-)height:\s*(-?\d+)px/gi;
  const violations = [];
  let match;
  while ((match = heightPattern.exec(codeLines)) !== null) {
    const px = parseInt(match[1]);
    if (px < 0) continue;
    if (px <= 70) continue; // icons, badges, chevrons — fine
    // Skeleton loaders: intentional fixed placeholder height
    const ctx = codeLines.slice(Math.max(0, match.index - 120), match.index + 80);
    if (ctx.includes('skeleton') || ctx.includes('shimmer')) continue;
    violations.push(`height: ${px}px — ${ctx.trim().slice(0, 80)}`);
  }
  assert(violations.length === 0,
    `Fixed content heights >70px (truncation risk):\n  ${violations.slice(0, 3).join('\n  ')}`);
});

test('Safety-2. No banned marketing copy in CSS content values', () => {
  const banned = [
    'artisan vérifié', 'artisans vérifiés', 'artisan qualifié', 'certifié',
    'devis gratuit', 'disponible immédiatement', "dans l'heure",
    'intervention immédiate', '24h/7', '24/7',
  ];
  const contentVals = (css.match(/content:\s*['"][^'"]*['"]/gi) || []).join(' ').toLowerCase();
  banned.forEach(p => assertNotContains(contentVals, p.toLowerCase(), `Banned phrase in content: "${p}"`));
});

test('Safety-3. No LocalBusiness or schema-related content', () => {
  assertNotContains(css, 'LocalBusiness');
  assertNotContains(css, '@type');
  assertNotContains(css, 'schema.org');
});

test('Safety-4. No RAFI-generated CSS classes', () => {
  ['fxresf-', 'rafi-', 'open-request', 'reservation-modal'].forEach(cls => {
    assertNotContains(codeLines, cls, `RAFI class in CSS: ${cls}`);
  });
});

test('Safety-5. No overflow: hidden on artisan grid', () => {
  const gridStart = css.indexOf('body.seo-service-page #fxlp-artisan-grid {');
  const gridEnd   = css.indexOf('\n}', gridStart) + 2;
  const gridBlock = css.slice(gridStart, gridEnd);
  assert(!/overflow:\s*hidden/.test(gridBlock), '#fxlp-artisan-grid must not have overflow: hidden');
});

// ── ASSET ─────────────────────────────────────────────────────────────────────

console.log('── Asset ─────────────────────────────────────────────────────');

test('Asset-1. Deterministic — same content on re-read', () => {
  const css2 = fs.readFileSync(CSS_PATH, 'utf8');
  assert(css === css2, 'File content changed between reads');
});

test('Asset-2. No @import rules', () => {
  assertNotContains(css, '@import');
});

test('Asset-3. No external url() references', () => {
  const urlRefs = (css.match(/url\(['"]?([^)'"]+)['"]?\)/gi) || [])
    .filter(u => !u.includes('data:') && !u.includes('#'));
  assert(urlRefs.length === 0, `External url() found:\n  ${urlRefs.join('\n  ')}`);
});

test('Asset-4. No syntax errors — balanced braces', () => {
  let depth = 0;
  let inString = false, stringChar = '';
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (inString) { if (ch === stringChar) inString = false; continue; }
    if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}') { depth--; if (depth < 0) throw new Error(`Unexpected } at ${i}`); }
  }
  assert(depth === 0, `Unbalanced braces: depth=${depth} at EOF`);
});

test('Asset-5. File header present', () => {
  assertContains(css, 'seo-v3.css');
  assertContains(css, 'body.seo-service-page');
  assertContains(css, 'seo-v3-a2');
});

// ── REGRESSION: prior test suites ────────────────────────────────────────────

console.log('── Regression ────────────────────────────────────────────────');

test('Reg-1. page-template.js: 62/62 pass', () => {
  const { execSync } = require('child_process');
  const result = execSync(
    'node seo/generators/shared/page-template.test.js 2>&1',
    { cwd: path.join(__dirname, '../..') }
  ).toString();
  assert(result.includes('Passed    : 62'), `page-template tests failed:\n${result.slice(-400)}`);
  assert(result.includes('Failed    : 0'), `page-template had failures:\n${result.slice(-400)}`);
});

test('Reg-2. seo-head.js: 42/42 pass', () => {
  const { execSync } = require('child_process');
  const result = execSync(
    'node seo/generators/shared/seo-head.test.js 2>&1',
    { cwd: path.join(__dirname, '../..') }
  ).toString();
  assert(result.includes('Passed    : 42'), `seo-head tests failed:\n${result.slice(-400)}`);
  assert(result.includes('Failed    : 0'), `seo-head had failures:\n${result.slice(-400)}`);
});

test('Reg-3. content-guard: 51/51 pass', () => {
  const { execSync } = require('child_process');
  const result = execSync(
    'node seo/generators/shared/content-guard.test.js 2>&1',
    { cwd: path.join(__dirname, '../..') }
  ).toString();
  assert(result.includes('Passed      : 51'), `content-guard tests failed:\n${result.slice(-400)}`);
  assert(result.includes('Failed      : 0'), `content-guard had failures:\n${result.slice(-400)}`);
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
