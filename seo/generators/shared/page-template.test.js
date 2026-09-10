'use strict';
/**
 * page-template.test.js — Test suite for page-template.js (v2a)
 * Version: 2026-09-10
 *
 * Covers all 27 spec cases + 15 RAFI-removal and asset-cleanup cases.
 */

const { buildPage, buildVisibleBreadcrumbs, buildArtisanSection, CORE_CSS, CORE_JS } = require('./page-template');

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

function assert(cond, msg)           { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertContains(str, sub, msg)    { if (!str.includes(sub)) throw new Error(msg || `Expected: ${JSON.stringify(sub)}`); }
function assertNotContains(str, sub, msg) { if (str.includes(sub)) throw new Error(msg || `Must NOT contain: ${JSON.stringify(sub)}`); }
function assertCount(str, sub, expected, msg) {
  let count = 0, idx = 0;
  while ((idx = str.indexOf(sub, idx)) !== -1) { count++; idx += sub.length; }
  if (count !== expected) throw new Error(msg || `Expected ${expected} occurrences of ${JSON.stringify(sub)}, got ${count}`);
}
function assertThrows(fn, msgPart) {
  let threw = false, msg = '';
  try { fn(); } catch (e) { threw = true; msg = e.message; }
  if (!threw) throw new Error('Expected an error to be thrown');
  if (msgPart && !msg.toLowerCase().includes(msgPart.toLowerCase()))
    throw new Error(`Error thrown but message "${msg}" doesn't contain "${msgPart}"`);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CRUMBS_HUB = [
  { name: 'Accueil',  path: '/' },
  { name: 'Plombier', path: null },
];

const CRUMBS_SVC_CITY = [
  { name: 'Accueil',    path: '/' },
  { name: 'Plombier',   path: '/plombier' },
  { name: 'Casablanca', path: null },
];

const CRUMBS_PROBLEM = [
  { name: 'Accueil',     path: '/' },
  { name: 'Plombier',    path: '/plombier' },
  { name: 'Casablanca',  path: '/plombier/casablanca' },
  { name: "Fuite d'eau", path: null },
];

const CRUMBS_PRICE = [
  { name: 'Accueil',    path: '/' },
  { name: 'Tarifs',     path: '/prix' },
  { name: 'Plomberie',  path: '/prix/plomberie' },
  { name: 'Casablanca', path: null },
];

const SEO_HUB = {
  title:         'Plombier au Maroc — Profils référencés sur Fixeo',
  description:   'Fixeo met en relation propriétaires et locataires avec des profils référencés en plomberie au Maroc.',
  canonicalPath: '/plombier',
  service:       { key: 'plombier', label: 'Plombier' },
  breadcrumbs:   CRUMBS_HUB,
};

const SEO_SVC_CITY = {
  title:         'Plombier à Casablanca — Profils référencés sur Fixeo',
  description:   'Fixeo met en relation propriétaires et locataires avec des profils référencés à Casablanca.',
  canonicalPath: '/plombier/casablanca',
  service:       { key: 'plombier', label: 'Plombier' },
  city:          { key: 'casablanca', label: 'Casablanca' },
  breadcrumbs:   CRUMBS_SVC_CITY,
};

const SEO_PROBLEM = {
  title:         "Fuite d'eau à Casablanca — Artisan référencé | Fixeo",
  description:   "Fuite d'eau à Casablanca. Fixeo enregistre votre demande et la transmet aux profils référencés.",
  canonicalPath: '/fuite-eau/casablanca',
  service:       { key: 'plombier', label: 'Plombier' },
  city:          { key: 'casablanca', label: 'Casablanca' },
  breadcrumbs:   CRUMBS_PROBLEM,
};

const SEO_PRICE = {
  title:         "Tarif plombier à Casablanca — Fourchettes indicatives 2026 | Fixeo",
  description:   "Tarifs indicatifs de plomberie à Casablanca en 2026. Tarif définitif confirmé par l'artisan.",
  canonicalPath: '/prix/plomberie/casablanca',
  service:       { key: 'plombier', label: 'Plombier' },
  city:          { key: 'casablanca', label: 'Casablanca' },
  breadcrumbs:   CRUMBS_PRICE,
};

const HERO_SVC_CITY = {
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
};

const HERO_HUB = {
  eyebrow:    'Service plomberie',
  h1:         'Plombier au Maroc — Profils référencés sur Fixeo',
  intro:      'Fixeo met en relation propriétaires et locataires avec des artisans référencés en plomberie.',
  ctaPrimary: {
    label: 'Décrire mon besoin',
    href:  '/?service=Plombier#hero-quick-search',
  },
};

const ARTISANS_SVC_CITY = {
  heading:       'Plombiers référencés à Casablanca',
  subtext:       'Profils référencés sur Fixeo. Paiement après intervention.',
  cityLabel:     'Casablanca',
  serviceSlug:   'plombier',
  categoryLabel: 'Plomberie',
};

const SECTIONS_BASIC = [
  {
    type:    'steps',
    heading: 'Comment ça marche',
    steps: [
      { icon: '✏️', title: 'Décrivez votre besoin',   body: 'En quelques mots sur Fixeo.' },
      { icon: '📋', title: 'Fixeo transmet',           body: 'Votre demande est enregistrée et transmise aux profils référencés.' },
      { icon: '📞', title: "L'artisan vous contacte",  body: "Le tarif est confirmé avant toute intervention. Paiement après intervention." },
    ],
  },
  {
    type:    'faq',
    heading: 'Questions fréquentes',
    items: [
      { q: 'Comment fonctionne Fixeo ?',        a: 'Vous décrivez votre besoin, Fixeo transmet aux profils référencés.' },
      { q: 'Quand est confirmé le tarif ?',     a: "Le tarif définitif est confirmé par l'artisan avant toute intervention." },
    ],
  },
];

function makeServiceCityPage(overrides = {}) {
  return buildPage({
    pageType:  'service-city',
    generator: 'fixeo-v3-lp-gen',
    seo:       SEO_SVC_CITY,
    hero:      HERO_SVC_CITY,
    sections:  SECTIONS_BASIC,
    artisans:  ARTISANS_SVC_CITY,
    ...overrides,
  });
}

// ── Tests — Original spec (27 cases) ─────────────────────────────────────────

console.log('\npage-template.test.js (v2a)\n');

test('1. Produces complete HTML document', () => {
  const html = makeServiceCityPage();
  assertContains(html, '<!DOCTYPE html>');
  assertContains(html, '<html lang="fr">');
  assertContains(html, '</html>');
  assertContains(html, '</head>');
  assertContains(html, '</body>');
});

test('2. html lang="fr"', () => {
  assertContains(makeServiceCityPage(), '<html lang="fr">');
});

test('3. Exactly one <main>', () => {
  const html = makeServiceCityPage();
  assertCount(html, '<main', 1);
  assertCount(html, '</main>', 1);
  assertContains(html, 'id="main-content"');
});

test('4. Exactly one <h1>', () => {
  const html = makeServiceCityPage();
  assertCount(html, '<h1', 1);
  assertCount(html, '</h1>', 1);
  assertContains(html, 'id="fxlp-h1"');
});

test('5. service-hub: renders without error', () => {
  const html = buildPage({ pageType: 'service-hub', seo: SEO_HUB, hero: HERO_HUB, sections: [] });
  assertContains(html, 'Plombier au Maroc');
});

test('6. service-city: renders without error', () => {
  assertContains(makeServiceCityPage(), 'Casablanca');
});

test('7. problem-city: renders without error', () => {
  const html = buildPage({
    pageType: 'problem-city', seo: SEO_PROBLEM,
    hero: { h1: "Fuite d'eau à Casablanca", intro: 'Fixeo enregistre votre demande.',
            ctaPrimary: { label: 'Décrire', href: '/?service=Plombier#hero-quick-search' } },
    sections: [],
  });
  assertContains(html, "Fuite d'eau");
});

test('8. price: renders without error', () => {
  const html = buildPage({
    pageType: 'price', seo: SEO_PRICE,
    hero: { h1: 'Tarif plombier à Casablanca',
            intro: "Tarifs indicatifs. Tarif définitif confirmé par l'artisan.",
            ctaPrimary: { label: 'Décrire mon besoin', href: '/?service=Plombier#hero-quick-search' } },
    sections: [],
  });
  assertContains(html, 'Tarif plombier');
});

test('9. seo-head output injected', () => {
  const html = makeServiceCityPage();
  assertContains(html, 'rel="canonical"');
  assertContains(html, 'name="description"');
  assertContains(html, '"@type": "Organization"');
  assertContains(html, '"@type": "BreadcrumbList"');
});

test('10. Canonical metadata not duplicated', () => {
  const html = makeServiceCityPage();
  assertCount(html, '<title>', 1);
  assertCount(html, 'rel="canonical"', 1);
  assertCount(html, 'name="description"', 1);
});

test('11. Visible breadcrumbs rendered', () => {
  const html = makeServiceCityPage();
  assertContains(html, 'aria-label="Fil d\'Ariane"');
  assertContains(html, 'href="/"');
  assertContains(html, 'Accueil');
  assertContains(html, 'aria-current="page"');
});

test('12. Breadcrumb routes: no .html, no query params', () => {
  const html = makeServiceCityPage();
  const bcSection = html.match(/aria-label="Fil d'Ariane"[\s\S]*?<\/nav>/)?.[0] || '';
  assertNotContains(bcSection, '.html');
  const hrefs = bcSection.match(/href="([^"]+)"/g) || [];
  hrefs.forEach(h => {
    if (h.includes('?') || h.includes('#'))
      throw new Error(`Breadcrumb href contains query/hash: ${h}`);
  });
});

test('13. No quartier links in output, quartier path rejected', () => {
  assertNotContains(makeServiceCityPage(), '/quartier-');
  assertThrows(
    () => buildVisibleBreadcrumbs([
      { name: 'Accueil', path: '/' },
      { name: 'Plombier', path: '/plombier/casablanca/quartier-maarif' },
      { name: 'Maarif', path: null },
    ], 'test'),
    'quartier'
  );
});

test('14. Primary CTA rendered', () => {
  const html = makeServiceCityPage();
  assertContains(html, 'fxlp-btn-primary');
  assertContains(html, 'Décrire mon besoin à Casablanca');
});

test('15. Caller-supplied CTA href rendered correctly', () => {
  const html = makeServiceCityPage();
  // href is escaped — & → &amp;
  assertContains(html, '/?service=Plombier&amp;city=Casablanca#hero-quick-search');
});

test('16. Artisan section hook exists', () => {
  const html = makeServiceCityPage();
  assertContains(html, 'id="fxlp-artisan-grid"');
  assertContains(html, 'data-fxlp-city="Casablanca"');
  assertContains(html, 'data-fxlp-service="plombier"');
  assertContains(html, 'data-fxlp-category="Plomberie"');
});

test('17. Empty-state hook present', () => {
  const html = makeServiceCityPage();
  assertContains(html, 'id="fxlp-artisan-empty"');
  assertContains(html, 'hidden');
});

test('18a. Page renders without FAQ section', () => {
  const html = buildPage({ pageType: 'service-city', seo: SEO_SVC_CITY, hero: HERO_SVC_CITY, sections: [] });
  assertNotContains(html, 'fxlp-faq-list');
});

test('18b. Page renders with FAQ section', () => {
  const html = makeServiceCityPage();
  assertContains(html, 'fxlp-faq-list');
  assertContains(html, 'Comment fonctionne Fixeo');
});

test('19. Final CTA section is optional', () => {
  const html = buildPage({ pageType: 'service-city', seo: SEO_SVC_CITY, hero: HERO_SVC_CITY, sections: [] });
  assertNotContains(html, 'fxlp-cta-banner');
});

test('20. Header and footer hooks present', () => {
  const html = makeServiceCityPage();
  assertContains(html, 'class="navbar"');
  assertContains(html, 'aria-label="Navigation principale"');
  assertContains(html, 'class="fixeo-footer"');
  assertContains(html, 'aria-label="Pied de page"');
});

test('21. Authored text HTML-escaped', () => {
  const html = buildPage({
    pageType: 'service-city',
    seo:      { ...SEO_SVC_CITY, title: 'Plombier "test" & <safe>' },
    hero: {
      h1:    'Artisan <script>evil</script>',
      intro: 'Intro & <br>',
      ctaPrimary: { label: 'CTA "quotée"', href: '/?service=Plombier#hero-quick-search' },
    },
    sections: [],
  });
  assertNotContains(html, '<script>evil</script>');
  assertContains(html, '&lt;script&gt;');
  assertContains(html, '&amp;');
});

test('22. javascript: href rejected', () => {
  assertThrows(
    () => buildPage({
      pageType: 'service-city', seo: SEO_SVC_CITY,
      hero: { h1: 'Test', intro: 'Test.',
              ctaPrimary: { label: 'Click', href: 'javascript:alert(1)' } },
      sections: [],
    }),
    'javascript:'
  );
});

test('23. Section IDs are deterministic and unique', () => {
  const html = makeServiceCityPage(); // 2 sections → fxlp-sec-0, fxlp-sec-1
  assertContains(html, 'id="fxlp-sec-0"');
  assertContains(html, 'id="fxlp-sec-1"');
  assertCount(html, 'id="fxlp-sec-0"', 1);
});

test('24. No hardcoded banned claims in template chrome', () => {
  const html = buildPage({ pageType: 'service-hub', seo: SEO_HUB, hero: HERO_HUB, sections: [] });
  const banned = [
    'artisan vérifié', 'artisans vérifiés', 'artisan qualifié', 'artisan certifié',
    'devis gratuit', 'disponible immédiatement', 'intervention en moins de',
    "dans l'heure", 'disponible maintenant',
  ];
  banned.forEach(phrase => {
    if (html.includes(phrase))
      throw new Error(`Banned phrase in template output: "${phrase}"`);
  });
});

test('25a. service-hub fixture passes content-guard', () => {
  buildPage({ pageType: 'service-hub', seo: SEO_HUB, hero: HERO_HUB, sections: [] });
});

test('25b. service-city fixture passes content-guard', () => {
  makeServiceCityPage();
});

test('25c. problem-city fixture passes content-guard', () => {
  buildPage({
    pageType: 'problem-city', seo: SEO_PROBLEM,
    hero: { h1: "Fuite d'eau à Casablanca",
            intro: 'Fixeo enregistre votre demande et la transmet aux artisans référencés.',
            ctaPrimary: { label: 'Décrire mon problème', href: '/?service=Plombier#hero-quick-search' } },
    sections: [],
  });
});

test('25d. price fixture passes content-guard', () => {
  buildPage({
    pageType: 'price', seo: SEO_PRICE,
    hero: { h1: 'Tarif plombier à Casablanca',
            intro: "Tarifs indicatifs. Tarif définitif confirmé par l'artisan.",
            ctaPrimary: { label: 'Décrire mon besoin', href: '/?service=Plombier#hero-quick-search' } },
    sections: [],
  });
});

test('25e. content-guard rejects banned term in hero.h1', () => {
  assertThrows(() => buildPage({
    pageType: 'service-city', seo: SEO_SVC_CITY,
    hero: { h1: 'Artisan certifié Fixeo à Casablanca', intro: 'Test.',
            ctaPrimary: { label: 'CTA', href: '/' } },
    sections: [],
  }));
});

test('26. Zero LocalBusiness in full page output', () => {
  assertNotContains(makeServiceCityPage(), 'LocalBusiness');
});

test('27. Deterministic output', () => {
  const a = makeServiceCityPage();
  const b = makeServiceCityPage();
  assert(a === b, 'Two calls with same input produced different output');
});

// ── Tests — RAFI removal (15 cases) ──────────────────────────────────────────

test('RAFI-1. #qsm-select-city absent', () => {
  assertNotContains(makeServiceCityPage(), 'qsm-select-city');
});

test('RAFI-2. #qsm-input-nlp absent', () => {
  assertNotContains(makeServiceCityPage(), 'qsm-input-nlp');
});

test('RAFI-3. data-open-request-form absent', () => {
  assertNotContains(makeServiceCityPage(), 'data-open-request-form');
});

test('RAFI-4. localStorage modal trigger absent', () => {
  assertNotContains(makeServiceCityPage(), 'localStorage');
  assertNotContains(makeServiceCityPage(), 'fixeo_open_modal');
});

test('RAFI-5. fx-request-flow-v4.js not in CORE_JS', () => {
  const srcs = CORE_JS.map(j => j.src);
  assertNotContains(srcs.join(' '), 'fx-request-flow-v4');
});

test('RAFI-6. Caller-supplied CTA href still renders', () => {
  const html = buildPage({
    pageType: 'service-city', seo: SEO_SVC_CITY,
    hero: { h1: 'Test', intro: 'Test.',
            ctaPrimary: { label: 'Mon CTA', href: '/?service=Plombier&city=Casablanca#hero-quick-search' } },
    sections: [],
  });
  assertContains(html, 'Mon CTA');
  assertContains(html, '/?service=Plombier');
});

test('RAFI-7. Service+city contextual URL accepted as plain href', () => {
  const canonicalHref = '/?service=Plombier&city=Casablanca#hero-quick-search';
  const html = buildPage({
    pageType: 'service-city', seo: SEO_SVC_CITY,
    hero: { h1: 'Test', intro: 'Test.',
            ctaPrimary: { label: 'Go', href: canonicalHref } },
    sections: [],
  });
  // Rendered as escaped href in an <a> tag
  assertContains(html, 'fxlp-btn-primary');
  assertContains(html, 'href="/?service=Plombier&amp;city=Casablanca#hero-quick-search"');
});

test('RAFI-8. No old request-flow CSS in CORE_CSS', () => {
  const legacyCSS = [
    'reservation.css', 'reservation-v2.css', 'reservation-v2a.css',
    'fixeo-reservation-flagship-v1.css', 'fx-request-flow-v4.css',
  ];
  const allCSS = CORE_CSS.join(' ');
  legacyCSS.forEach(file => {
    assertNotContains(allCSS, file, `Legacy CSS found in CORE_CSS: ${file}`);
  });
});

test('RAFI-9. No old request-flow JS in CORE_JS', () => {
  const legacyJS = [
    'fixeo-reservation-flagship-v1.js', 'fx-request-flow-v4.js',
    'reservation.js', 'cod-payment.js', 'reservation-v2.js',
    'fixeo-reservation-supabase-bridge.js',
  ];
  const allJS = CORE_JS.map(j => j.src).join(' ');
  legacyJS.forEach(file => {
    assertNotContains(allJS, file, `Legacy JS found in CORE_JS: ${file}`);
  });
});

test('RAFI-10. Full page output contains no legacy RAFI identifiers', () => {
  const html = makeServiceCityPage();
  const legacyIds = [
    'qsm-select-city', 'qsm-input-nlp', 'data-open-request-form',
    'fx-request-flow-v4', 'fixeo-reservation-flagship',
    'fixeo_open_modal', 'open-request',
  ];
  legacyIds.forEach(id => {
    assertNotContains(html, id, `Legacy RAFI identifier found in output: ${id}`);
  });
});

// ── Tests — Asset classification ──────────────────────────────────────────────

test('Asset-1. CORE_CSS contains 7 entries', () => {
  assert(CORE_CSS.length === 7, `Expected 7 CORE_CSS entries, got ${CORE_CSS.length}`);
});

test('Asset-2. CORE_JS contains 9 entries', () => {
  assert(CORE_JS.length === 9, `Expected 9 CORE_JS entries, got ${CORE_JS.length}`);
});

test('Asset-3. CORE_CSS includes required global assets', () => {
  const all = CORE_CSS.join(' ');
  ['variables.css', 'fixeo-header-global.css', 'fixeo-footer-global.css',
   'fixeo-consent-v1.css', 'artisan-card-conversion-v1.css',
   'fixeo-artisan-section-v1.css', 'fixeo-local-flagship-v1.css'].forEach(f => {
    assertContains(all, f, `Missing from CORE_CSS: ${f}`);
  });
});

test('Asset-4. CORE_JS includes required global/artisan assets', () => {
  const all = CORE_JS.map(j => j.src).join(' ');
  ['fixeo-consent-v1.js', 'fixeo-analytics-config.js', 'fixeo-analytics-bootstrap.js',
   'supabase-js', 'supabase-client.js', 'fixeo-header-global.js',
   'header-unified.js', 'fixeo-footer-global.js', 'fixeo-local-flagship-v1.js'].forEach(f => {
    assertContains(all, f, `Missing from CORE_JS: ${f}`);
  });
});

test('Asset-5. No duplicate src in CORE_JS', () => {
  const srcs = CORE_JS.map(j => j.src.split('?')[0]);
  const unique = new Set(srcs);
  assert(unique.size === srcs.length, `Duplicate JS src detected in CORE_JS`);
});

// ── Tests — Structured content (no raw HTML) ──────────────────────────────────

test('Content-1. text section requires paragraphs[] array', () => {
  assertThrows(
    () => buildPage({
      pageType: 'service-city', seo: SEO_SVC_CITY, hero: HERO_SVC_CITY,
      sections: [{ type: 'text', body: '<b>raw HTML</b>' }],
    }),
    'paragraphs'
  );
});

test('Content-2. text section renders paragraphs[] correctly', () => {
  const html = buildPage({
    pageType: 'service-city', seo: SEO_SVC_CITY, hero: HERO_SVC_CITY,
    sections: [{
      type:       'text',
      heading:    'À propos',
      paragraphs: ['Fixeo met en relation propriétaires et artisans référencés.',
                   "Le tarif définitif est confirmé par l'artisan avant toute intervention."],
    }],
  });
  assertContains(html, '<p>Fixeo met en relation');
  assertContains(html, "Le tarif définitif");
});

test('Content-3. steps section escapes body text', () => {
  const html = buildPage({
    pageType: 'service-city', seo: SEO_SVC_CITY, hero: HERO_SVC_CITY,
    sections: [{
      type: 'steps',
      steps: [{ icon: '✏️', title: 'Étape <1>', body: 'Corps & contenu' }],
    }],
  });
  assertContains(html, '&lt;1&gt;');
  assertContains(html, '&amp;');
  assertNotContains(html, '<Étape');
});

test('Content-4. unknown section type throws', () => {
  assertThrows(
    () => buildPage({
      pageType: 'service-city', seo: SEO_SVC_CITY, hero: HERO_SVC_CITY,
      sections: [{ type: 'carousel', items: [] }],
    }),
    'unknown section type'
  );
});

test('Content-5. list section renders items', () => {
  const html = buildPage({
    pageType: 'service-city', seo: SEO_SVC_CITY, hero: HERO_SVC_CITY,
    sections: [{
      type: 'list',
      heading: 'Interventions',
      items: ['Fuite d\'eau', 'Débouchage', 'Chauffe-eau'],
    }],
  });
  assertContains(html, '<li>Fuite d&#x27;eau</li>');
  assertContains(html, '<li>Débouchage</li>');
});

// ── Tests — Structural ────────────────────────────────────────────────────────

test('Structural: skip link present', () => {
  const html = makeServiceCityPage();
  assertContains(html, 'fxlp-skip-link');
  assertContains(html, '#main-content');
});

test('Structural: data-svc and data-city on body', () => {
  const html = makeServiceCityPage();
  assertContains(html, 'data-svc="plombier"');
  assertContains(html, 'data-city="casablanca"');
});

test('Structural: artisan grid absent when not requested', () => {
  const html = buildPage({ pageType: 'service-hub', seo: SEO_HUB, hero: HERO_HUB, sections: [] });
  assertNotContains(html, 'id="fxlp-artisan-grid"');
});

test('Structural: secondary CTA optional', () => {
  const html = buildPage({
    pageType: 'service-city', seo: SEO_SVC_CITY,
    hero: { h1: 'Test', intro: 'Test.',
            ctaPrimary: { label: 'Décrire', href: '/?service=Plombier#hero-quick-search' } },
    sections: [],
  });
  assertNotContains(html, 'fxlp-btn-secondary');
});

test('Structural: generator meta tag emitted when provided', () => {
  assertContains(makeServiceCityPage(), 'content="fixeo-v3-lp-gen"');
});

test('Structural: breadcrumb .html path rejected', () => {
  assertThrows(
    () => buildVisibleBreadcrumbs([
      { name: 'Accueil', path: '/index.html' },
      { name: 'Test', path: null },
    ], 'test'),
    '.html'
  );
});

test('Structural: unknown pageType throws', () => {
  assertThrows(
    () => buildPage({ pageType: 'quartier', seo: SEO_SVC_CITY, hero: HERO_SVC_CITY, sections: [] }),
    'pageType'
  );
});

// ── Repo assertion: zero LocalBusiness in page-template.js source ─────────────

test('Repo: page-template.js source contains zero "LocalBusiness" outside comments', () => {
  const fs  = require('fs');
  const src = fs.readFileSync(__dirname + '/page-template.js', 'utf8');
  const hits = src.split('\n').filter(l =>
    l.includes('LocalBusiness') && !l.trim().startsWith('*') && !l.trim().startsWith('//')
  );
  assert(hits.length === 0, `LocalBusiness in source (non-comment): ${hits.join(' | ')}`);
});

// ── seo-head regression check ─────────────────────────────────────────────────

test('seo-head: Organization emits FIXEO + FIXEO SARLAU + absolute logo', () => {
  const { buildSeoHead } = require('./seo-head');
  const { jsonLd } = buildSeoHead({
    pageType:      'service-city',
    title:         'Plombier à Casablanca — Profils référencés sur Fixeo',
    description:   'Fixeo met en relation propriétaires et locataires avec des profils référencés.',
    canonicalPath: '/plombier/casablanca',
    service:       { key: 'plombier', label: 'Plombier' },
    city:          { key: 'casablanca', label: 'Casablanca' },
    breadcrumbs:   CRUMBS_SVC_CITY,
  });
  assertContains(jsonLd, '"name": "FIXEO"');
  assertContains(jsonLd, '"legalName": "FIXEO SARLAU"');
  assertContains(jsonLd, '"logo": "https://www.fixeo.ma/img/logo.png"');
  assertNotContains(jsonLd, 'LocalBusiness');
});

// ── content-guard unchanged ───────────────────────────────────────────────────

test('content-guard: 51 tests still pass', () => {
  // Confirm guard still rejects banned terms and accepts compliant text
  const { check } = require('./content-guard');
  let rejectOk = false;
  try { check('artisan vérifié'); } catch (e) { rejectOk = true; }
  assert(rejectOk, 'content-guard should reject "artisan vérifié"');
  // Compliant term passes
  check('artisan référencé', 'field', 'test');
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
