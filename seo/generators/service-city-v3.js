'use strict';
/**
 * service-city-v3.js — V3 Service×City Page Generator
 * =====================================================
 * Assembles one SEO V3 flagship page for a given service×city pair.
 * This is the reference generator for the entire V3 SEO matrix.
 *
 * FIRST IMPLEMENTATION: Plombier × Casablanca
 * TARGET ROUTE: /plombier/casablanca (vercel.json rewrite → plombier-casablanca.html)
 * CANONICAL URL: https://www.fixeo.ma/plombier/casablanca
 *
 * CONSUMPTION CONTRACT:
 *   - seo/data/services.json       (service metadata)
 *   - seo/data/cities.json         (city metadata)
 *   - seo/data/artisan-counts.json (artisan count by city×service)
 *   - seo/generators/shared/seo-head.js         (meta/schema)
 *   - seo/generators/shared/page-template.js    (HTML shell + structured sections)
 *   - seo/generators/shared/artisan-card-v3.js  (server-rendered artisan cards)
 *   - seo/generators/shared/content-guard.js    (truth enforcement)
 *
 * OUTPUT CONTRACT:
 *   - Full HTML string (no further transformation required)
 *   - All artisan cards server-rendered in initial HTML (inside #fxlp-artisan-grid)
 *   - Meaningful service×city content present without JS
 *   - Zero banned product-truth claims
 *   - No RAFI/reservation coupling
 *   - fixeo-local-flagship-v1.js REMOVED from script output (Task 2.5A)
 *
 * PRODUCT-FLOW HANDOFF (Task 2.6):
 *   CTA href is caller-supplied or auto-derived at generate time.
 *   Canonical handoff URL: /?fx_service={serviceSlug}&fx_city={citySlug}&fx_source=seo#hero-quick-search
 *   Uses canonical V3 slugs (not display labels) in fx_* namespace.
 *   Consumed by js/fixeo-seo-handoff-v1.js on homepage arrival.
 *   Old generic ?service=&city= URL retired as V3 generator default.
 *
 * ARTISAN CARDS:
 *   Server-rendered using buildArtisanCard (artisan-card-v3.js).
 *   Injected into the #fxlp-artisan-grid element (replacing skeleton loaders).
 *   Max 3 cards. Generator validates each record before rendering.
 *
 * SCHEMA (Task 2.5A):
 *   Organization + Service + BreadcrumbList — via buildPage → seo-head.js ONLY.
 *   NO FAQPage JSON-LD — structured-data ownership remains canonical in seo-head.js.
 *   Visible FAQ section is rendered; FAQPage schema is not emitted.
 *
 * ARTISAN ELIGIBILITY (Task 2.5A):
 *   Artisans are excluded ONLY for objective public-data reasons:
 *     - empty/whitespace-only display name
 *     - name matches documented placeholder pattern
 *   NOT excluded for: Arabic script, non-Latin chars, missing photo, no publicSlug.
 *   No photo → initials fallback via artisan-card-v3 (by design).
 *   No publicSlug → card renders without profile CTA (by design).
 *   Banned description → description omitted via artisan-card-v3 truth-guard; artisan kept.
 *   Selection order: name ascending (stable, deterministic, no private fields used).
 *
 * FLAGSHIP JS REMOVAL (Task 2.5A):
 *   fixeo-local-flagship-v1.js is in CORE_JS (page-template.js) because it serves
 *   the global artisan grid for all legacy SEO pages. V3 pages server-render their
 *   artisan cards and must not have them overwritten at runtime by this legacy script.
 *   Solution: after buildPage() returns HTML, the exact <script> tag for
 *   fixeo-local-flagship-v1.js is removed by deterministic string replacement.
 *   The target string is derived at runtime from CORE_JS (same source as the tag),
 *   making it version-safe. Tested explicitly (T-2).
 *   page-template.js is NOT modified.
 *
 * SECTION ARCHITECTURE:
 *   Structured sections (steps, faq, cta) via page-template.js buildPage().
 *   Rich HTML sections (situations grid, before-intervention, price table, explorer)
 *   rendered by local builders and injected into the HTML after buildPage().
 *
 * VERSION HISTORY:
 *   v3-a1 (2026-09-10): Initial implementation — Task 2.5
 *   v3-a3 (2026-09-10): Task 2.6 — canonical handoff URL emitted:
 *     /?fx_service={slug}&fx_city={slug}&fx_source=seo#hero-quick-search
 *     Old generic ?service=&city= default retired.
 *   v3-a2 (2026-09-10): Task 2.5A corrections:
 *     - fixeo-local-flagship-v1.js removed from V3 output (no client-side overwrite)
 *     - FAQPage JSON-LD removed (schema ownership stays in seo-head.js)
 *     - Arabic/non-Latin name exclusion removed (not an approved filter)
 *     - Artisan eligibility: only empty name + documented placeholder patterns
 *     - Selection order: name ascending (deterministic, public-only)
 *
 * FILE: seo/generators/service-city-v3.js
 */

const path = require('path');

const { buildPage, CORE_JS } = require('./shared/page-template');
const { buildArtisanCard }   = require('./shared/artisan-card-v3');
const { checkFields }        = require('./shared/content-guard');
const { removeFlagshipScript, FLAGSHIP_SCRIPT_TAG } = require('./shared/v3-legacy-removal');
const { buildSeoHandoffHref } = require('./shared/seo-handoff-href');

// ── Data paths ─────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, '../data');

function loadData() {
  return {
    services:      require(path.join(DATA_DIR, 'services.json')),
    cities:        require(path.join(DATA_DIR, 'cities.json')),
    artisanCounts: require(path.join(DATA_DIR, 'artisan-counts.json')),
  };
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ORIGIN    = 'https://www.fixeo.ma';
const MAX_CARDS = 3;

// ── Placeholder-name patterns (deterministic, documented) ─────────────────────
//
// Artisans are excluded ONLY if their display name matches one of these
// deterministic patterns. These represent generic placeholders, not real
// professional identities. All other names — including Arabic-script,
// accented, or single-word names — are eligible.
//
// Rules: case-insensitive. Tested explicitly (T-12, T-13).

const PLACEHOLDER_PATTERNS = [
  /^participant\s+anonyme\b/i,           // 'Participant anonyme NNN'
  /^plombier\s+casa\s+(ig|ig\s)/i,       // 'Plombier Casa IG', 'Plombier Casa IG 2'
  /^ibrahim\s+plomberie\s+services\b/i,  // 'Ibrahim Plomberie Services', '... 2'
];

function isPlaceholderName(name) {
  return PLACEHOLDER_PATTERNS.some(pat => pat.test(name));
}

// ── HTML escape ───────────────────────────────────────────────────────────────

function esc(val) {
  return String(val == null ? '' : val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Flagship JS removal — delegated to shared/v3-legacy-removal.js ───────────
//
// fixeo-local-flagship-v1.js is in CORE_JS (page-template.js). For V3 pages
// that server-render artisan cards, this script must NOT be loaded — it would
// replace the V3 cards at runtime with legacy-styled cards.
//
// Canonical logic lives in seo/generators/shared/v3-legacy-removal.js.
// The shared module derives the exact <script> tag from CORE_JS and performs
// exact string replacement (version-safe, no broad regex surgery).
// Re-exported here as private aliases for test compatibility.

// ── Artisan record validation ──────────────────────────────────────────────────

/**
 * Validate a caller-supplied artisan record before rendering as a V3 card.
 *
 * ELIGIBILITY RULES (v3-a2, approved):
 *   EXCLUDED if:
 *     - record is not an object
 *     - name is empty/whitespace-only
 *     - name matches a documented placeholder pattern
 *   NOT excluded for:
 *     - Arabic/non-Latin script names
 *     - missing photo (initials fallback used)
 *     - missing publicSlug (card renders without CTA)
 *     - banned description (description omitted by artisan-card-v3 truth-guard; artisan kept)
 *
 * Also rejects any forbidden field that must never reach buildArtisanCard.
 *
 * @param {object} record
 * @returns {{ ok: boolean, reason: string|null }}
 */
function validateArtisanRecord(record) {
  if (!record || typeof record !== 'object') {
    return { ok: false, reason: 'not an object' };
  }

  // Forbidden fields must never reach buildArtisanCard
  const forbidden = [
    'id', 'legacy_id', '_supabase_id',
    'phone', 'telephone', 'email',
    'owner_user_id', 'verified', 'verifie',
    'claim_status', 'onboarding_completed',
    'commission', 'pricing_margin', 'admin_notes',
    'response_time_min', 'responseTime',
    'rating', 'note', 'reviews', 'reviewCount', 'avis',
    'availability', 'disponibilite', 'available',
    'created_at', 'updated_at',
  ];

  for (const f of forbidden) {
    if (Object.prototype.hasOwnProperty.call(record, f)) {
      return { ok: false, reason: `forbidden field "${f}" present` };
    }
  }

  const name = String(record.name || '').trim();
  if (!name) {
    return { ok: false, reason: 'name is empty' };
  }
  if (isPlaceholderName(name)) {
    return { ok: false, reason: 'placeholder identity (matches documented exclusion pattern)' };
  }

  return { ok: true, reason: null };
}

// ── Server-rendered artisan cards ─────────────────────────────────────────────

/**
 * Build server-rendered card HTML for up to MAX_CARDS valid artisan records.
 * Records are already sorted in deterministic order by the caller.
 */
function buildRenderedCards(artisanRecords, serviceLabel, cityLabel) {
  const rendered = [];
  const excluded = [];

  for (const record of (artisanRecords || [])) {
    if (rendered.length >= MAX_CARDS) break;

    const { ok, reason } = validateArtisanRecord(record);
    if (!ok) {
      excluded.push({ name: String(record.name || '(unknown)').trim() || '(unknown)', reason });
      continue;
    }

    try {
      const cardHtml = buildArtisanCard({
        name:         String(record.name).trim(),
        serviceLabel: serviceLabel,
        cityLabel:    cityLabel,
        serviceSlug:  record.serviceSlug  || '',
        photoUrl:     record.photoUrl     || null,
        publicSlug:   record.publicSlug   || null,
        description:  record.description  || null,
        priceFrom:    record.priceFrom    || null,
        priceLabel:   record.priceLabel   || null,
      });
      rendered.push(cardHtml);
    } catch (e) {
      excluded.push({
        name:   String(record.name || '(unknown)').trim() || '(unknown)',
        reason: 'buildArtisanCard threw: ' + e.message,
      });
    }
  }

  return {
    cardsHtml:     rendered.join('\n'),
    renderedCount: rendered.length,
    excluded,
  };
}

// ── Patch skeleton → server-rendered cards ────────────────────────────────────

function patchArtisanGrid(html, cardsHtml, renderedCount) {
  // Remove skeleton comment
  html = html.replace(/<!--[^>]*skeleton[^>]*-->\s*/gi, '');

  // Remove skeleton divs
  html = html.replace(/<div class="fxlp-skeleton" aria-hidden="true"><\/div>\s*/g, '');

  // Change class fxlp-artisan-loading → fxlp-artisan-grid on the grid element
  const OPEN_PATTERN = /<div\s+id="fxlp-artisan-grid"\s+class="fxlp-artisan-loading"([^>]*)>/;
  html = html.replace(OPEN_PATTERN, (match, attrs) =>
    '<div id="fxlp-artisan-grid" class="fxlp-artisan-grid"' + attrs + '>'
  );

  // Inject server-rendered cards after the grid opening tag
  const anchor = 'id="fxlp-artisan-grid"';
  const anchorIdx = html.indexOf(anchor);
  if (anchorIdx !== -1) {
    const closeOfTag = html.indexOf('>', anchorIdx) + 1;
    const cardsBlock = renderedCount > 0
      ? '\n' + cardsHtml + '\n'
      : '\n<p class="fxlp-artisan-empty">Aucun profil disponible pour le moment.</p>\n';
    html = html.slice(0, closeOfTag) + cardsBlock + html.slice(closeOfTag);
  }

  return html;
}

// ── Rich HTML section builders ────────────────────────────────────────────────

function buildSituationsHtml(situations, profession, cityLabel) {
  const items = situations.map(s =>
    '<li class="fxlp-sit-item" role="listitem">'
    + '<span class="fxlp-sit-icon" aria-hidden="true">' + esc(s.icon) + '</span>'
    + '<span class="fxlp-sit-label">' + esc(s.label) + '</span>'
    + '</li>'
  ).join('\n          ');

  return ''
    + '\n<hr class="fxlp-divider">\n'
    + '<section class="fxlp-section" aria-labelledby="fxlp-sit-title">\n'
    + '  <div class="fxlp-wrap">\n'
    + '    <span class="fxlp-section-label">BESOINS FRÉQUENTS</span>\n'
    + '    <h2 id="fxlp-sit-title" class="fxlp-section-title">'
    + 'Pour quels besoins contacter un ' + esc(profession) + ' à ' + esc(cityLabel) + ' ?'
    + '</h2>\n'
    + '    <p class="fxlp-section-sub">Les prestations proposées dépendent du diagnostic et des compétences de l\'artisan sélectionné.</p>\n'
    + '    <ul class="fxlp-sit-grid" role="list">\n          '
    + items
    + '\n    </ul>\n'
    + '  </div>\n'
    + '</section>';
}

function buildBeforeHtml(profession, cityLabel) {
  return ''
    + '\n<hr class="fxlp-divider">\n'
    + '<section class="fxlp-section" aria-labelledby="fxlp-before-title">\n'
    + '  <div class="fxlp-wrap">\n'
    + '    <span class="fxlp-section-label">AVANT L\'INTERVENTION</span>\n'
    + '    <h2 id="fxlp-before-title" class="fxlp-section-title">Ce qui se passe avant le début des travaux</h2>\n'
    + '    <div class="fxlp-expl-grid">\n'
    + '      <div class="fxlp-expl-item">\n'
    + '        <span class="fxlp-expl-icon" aria-hidden="true">🔍</span>\n'
    + '        <p class="fxlp-expl-text">Le ' + esc(profession) + ' évalue votre situation et pose les questions utiles avant de se déplacer ou en arrivant chez vous à ' + esc(cityLabel) + '.</p>\n'
    + '      </div>\n'
    + '      <div class="fxlp-expl-item">\n'
    + '        <span class="fxlp-expl-icon" aria-hidden="true">📋</span>\n'
    + '        <p class="fxlp-expl-text">Il vous communique le tarif définitif avant de commencer, en détaillant la prestation prévue et les pièces si nécessaires.</p>\n'
    + '      </div>\n'
    + '      <div class="fxlp-expl-item">\n'
    + '        <span class="fxlp-expl-icon" aria-hidden="true">✔️</span>\n'
    + '        <p class="fxlp-expl-text">Vous confirmez l\'accord. L\'intervention démarre. Le paiement s\'effectue après la fin des travaux, pas avant.</p>\n'
    + '      </div>\n'
    + '    </div>\n'
    + '  </div>\n'
    + '</section>';
}

function buildPriceHtml(pricingTiers, priceIntro, pricingNote, cityLabel) {
  const tiersHtml = (pricingTiers || []).map(tier =>
    '<li class="fxlp-price-item">'
    + '<span class="fxlp-price-label">' + esc(tier.label) + '</span>'
    + '<span class="fxlp-price-range">' + esc(tier.range) + '</span>'
    + '</li>'
  ).join('\n          ');

  return ''
    + '\n<hr class="fxlp-divider">\n'
    + '<section class="fxlp-section" aria-labelledby="fxlp-price-title">\n'
    + '  <div class="fxlp-wrap">\n'
    + '    <span class="fxlp-section-label">TARIFS INDICATIFS</span>\n'
    + '    <h2 id="fxlp-price-title" class="fxlp-section-title">'
    + 'Coût d\'une intervention à ' + esc(cityLabel)
    + '</h2>\n'
    + '    <p class="fxlp-section-sub">' + esc(priceIntro) + '</p>\n'
    + (pricingNote ? '    <p class="fxlp-price-note">' + esc(pricingNote) + '</p>\n' : '')
    + (tiersHtml
      ? '    <ul class="fxlp-price-list" role="list">\n          ' + tiersHtml + '\n    </ul>\n'
      : '')
    + '    <p class="fxlp-price-disclaimer">Ces fourchettes sont indicatives. Le tarif définitif est toujours confirmé par le professionnel avant l\'intervention.</p>\n'
    + '  </div>\n'
    + '</section>';
}

function buildExplorerHtml(service, citySlug, city, cities, services) {
  const relatedLinks = (service.related_services || [])
    .filter(relSlug => services[relSlug])
    .map(relSlug => {
      const rel = services[relSlug];
      return {
        href:  '/' + rel.canonicalRouteKey + '/' + citySlug,
        icon:  rel.icon || '🔧',
        city:  city.label,
        label: rel.label + ' à ' + city.label,
      };
    });

  const nearbyLinks = (city.nearby || [])
    .filter(nearSlug => cities[nearSlug])
    .map(nearSlug => {
      const nearCity = cities[nearSlug];
      return {
        href:  '/' + service.canonicalRouteKey + '/' + nearSlug,
        icon:  service.icon || '🔧',
        city:  nearCity.label,
        label: service.label + ' à ' + nearCity.label,
      };
    });

  const allLinks = [...relatedLinks, ...nearbyLinks].slice(0, 6);
  if (allLinks.length === 0) return '';

  const cards = allLinks.map(l =>
    '<a class="fxlp-explorer-card" href="' + esc(l.href) + '">\n'
    + '      <span class="fxlp-explorer-icon" aria-hidden="true">' + esc(l.icon) + '</span>\n'
    + '      <span class="fxlp-explorer-city">' + esc(l.city) + '</span>\n'
    + '      <span class="fxlp-explorer-title">' + esc(l.label) + '</span>\n'
    + '    </a>'
  ).join('\n    ');

  return ''
    + '\n<hr class="fxlp-divider">\n'
    + '<section class="fxlp-explorer" aria-labelledby="fxlp-explorer-title">\n'
    + '  <div class="fxlp-wrap">\n'
    + '    <span class="fxlp-section-label">EXPLORER AUSSI</span>\n'
    + '    <h2 id="fxlp-explorer-title" class="fxlp-explorer-heading">Explorer aussi</h2>\n'
    + '    <nav class="fxlp-explorer-grid" aria-label="Pages liées">\n    '
    + cards + '\n'
    + '    </nav>\n'
    + '  </div>\n'
    + '</section>';
}

// ── Main generator ────────────────────────────────────────────────────────────

/**
 * generateServiceCityPage — assemble one complete V3 service×city page.
 *
 * @param {object} opts
 * @param {string}   opts.serviceSlug      — e.g. 'plombier'
 * @param {string}   opts.citySlug         — e.g. 'casablanca'
 * @param {Array}   [opts.artisanRecords]  — caller-supplied, pre-fetched.
 *   Records must use ONLY the V3 card allowlist fields.
 *   Records are sorted by name ascending before rendering.
 *   No forbidden fields (id, phone, email, rating, verified, etc.)
 * @param {string}  [opts.ctaHref]         — primary CTA href (defaults to approved fallback)
 * @param {string}  [opts.robots]          — defaults to 'index,follow'
 * @returns {{ html, meta, excluded, warnings }}
 */
function generateServiceCityPage(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new TypeError('service-city-v3: opts must be a plain object');
  }

  const {
    serviceSlug,
    citySlug,
    artisanRecords = [],
    robots = 'index,follow',
  } = opts;

  if (!serviceSlug) throw new Error('service-city-v3: serviceSlug is required');
  if (!citySlug)    throw new Error('service-city-v3: citySlug is required');

  // ── Load canonical data ──────────────────────────────────────────────────────

  const { services, cities } = loadData();

  const service = services[serviceSlug];
  if (!service) throw new Error(`service-city-v3: unknown service "${serviceSlug}"`);

  const city = cities[citySlug];
  if (!city)    throw new Error(`service-city-v3: unknown city "${citySlug}"`);

  const cityLabel     = city.label;
  const serviceLabel  = service.label;
  const profession    = service.profession || serviceLabel.toLowerCase();
  const routeKey      = service.canonicalRouteKey;
  const canonicalPath = '/' + routeKey + '/' + citySlug;
  const canonicalUrl  = ORIGIN + canonicalPath;

  // ── CTA href ─────────────────────────────────────────────────────────────────

  // Canonical handoff URL (Task 2.6): uses fx_* namespace with canonical slugs.
  // Consumed by js/fixeo-seo-handoff-v1.js on homepage arrival.
  // Caller may override with opts.ctaHref for non-standard configurations.
  const ctaHref = opts.ctaHref
    || buildSeoHandoffHref({ serviceSlug, citySlug });

  // ── FAQ items (no FAQPage schema — visible only) ──────────────────────────────
  // All strings use service data (profession, label_adj) — never hardcoded service names.

  const faqItems = [
    {
      q: 'Comment trouver un ' + profession + ' à ' + cityLabel + ' ?',
      a: 'Décrivez votre besoin sur FIXEO. Votre demande est enregistrée et transmise aux '
        + profession + 's référencés dans votre secteur à ' + cityLabel + '. Le professionnel vous contacte et confirme le tarif définitif avant d\'intervenir.',
    },
    {
      q: 'Quels travaux les ' + profession + 's référencés prennent-ils en charge ?',
      a: 'Les prestations disponibles dépendent du profil de l\'artisan, du diagnostic effectué sur place et de la nature de votre besoin. Décrivez précisément votre situation pour orienter votre demande vers les profils correspondants.',
    },
    {
      q: 'Comment le tarif est-il confirmé avant l\'intervention ?',
      a: 'Après avoir évalué votre situation, le ' + profession + ' vous communique le tarif définitif avant de commencer. Vous n\'êtes pas obligé d\'accepter. En cas d\'accord, le paiement s\'effectue après la fin de l\'intervention.',
    },
    {
      q: 'Le déplacement est-il facturable ?',
      a: 'Le déplacement peut être inclus ou facturé séparément selon le professionnel, la distance et le secteur concerné. Ces modalités sont précisées lors de la confirmation du tarif, avant toute intervention.',
    },
    {
      q: 'Quand effectue-t-on le paiement ?',
      a: 'Le paiement s\'effectue après l\'intervention, une fois les travaux réalisés et vérifiés. Aucun paiement anticipé intégral n\'est demandé.',
    },
  ];

  // ── Authored strings — content-guard ──────────────────────────────────────────
  // All strings are service-generic (use profession/label_adj from services.json).

  const titleStr   = serviceLabel + ' à ' + cityLabel + ' — Profils référencés | FIXEO';
  const descStr    = 'Trouvez un ' + profession + ' référencé à ' + cityLabel + ' sur FIXEO. Le tarif est confirmé avec l\'artisan avant toute intervention.';
  const heroIntro  = 'FIXEO référence des professionnels en ' + (service.label_adj || serviceLabel.toLowerCase()) + ' à ' + cityLabel + '. Décrivez votre besoin et découvrez les profils référencés dans votre secteur.';
  const priceIntro = 'Le coût d\'une intervention en ' + (service.label_adj || serviceLabel.toLowerCase()) + ' à ' + cityLabel + ' dépend de la nature du problème, des matériaux nécessaires, de la complexité et de l\'accessibilité. Le tarif définitif est confirmé avec le professionnel avant toute intervention.';
  const ctaBody    = 'FIXEO référence des profils professionnels à ' + cityLabel + '. Décrivez votre situation — le tarif est confirmé avant toute intervention.';

  checkFields({
    title:       titleStr,
    description: descStr,
    hero_intro:  heroIntro,
    price_intro: priceIntro,
    cta_body:    ctaBody,
    faq_q1: faqItems[0].q, faq_a1: faqItems[0].a,
    faq_q2: faqItems[1].q, faq_a2: faqItems[1].a,
    faq_q3: faqItems[2].q, faq_a3: faqItems[2].a,
    faq_q4: faqItems[3].q, faq_a4: faqItems[3].a,
    faq_q5: faqItems[4].q, faq_a5: faqItems[4].a,
  }, canonicalPath);

  // ── Artisan selection: sort by name ascending ─────────────────────────────────
  // Only public fields used. No verified, rating, availability, response_time, etc.

  const sortedRecords = (artisanRecords || []).slice().sort((a, b) => {
    const na = String(a.name || '').trim().toLowerCase();
    const nb = String(b.name || '').trim().toLowerCase();
    return na < nb ? -1 : na > nb ? 1 : 0;
  });

  const { cardsHtml, renderedCount, excluded } = buildRenderedCards(
    sortedRecords,
    serviceLabel,
    cityLabel
  );

  const warnings = [];
  if (renderedCount === 0 && artisanRecords.length > 0) {
    warnings.push('All supplied artisan records were excluded. No cards will render.');
  }

  // ── Extra CSS ─────────────────────────────────────────────────────────────────

  const extraCss = [
    '/css/seo-v3.css',          // Task 2.12: public copy (source: seo/assets/seo-v3.css)
    '/css/artisan-card-v3.css', // Task 2.12: public copy (source: seo/assets/artisan-card-v3.css)
  ];

  // ── Build page via page-template ──────────────────────────────────────────────

  let html = buildPage({
    pageType:  'service-city',
    generator: 'service-city-v3/v3-a2',

    seo: {
      title:         titleStr,
      description:   descStr,
      canonicalPath: canonicalPath,
      robots:        robots,
      service: {
        label:      serviceLabel,
        schemaType: service.service_schema_type || 'Service',
        key:        service.runtimeServiceKey,
      },
      city: {
        label:   cityLabel,
        lat:     city.lat,
        lng:     city.lng,
        region:  city.region,
        country: 'Maroc',
        key:     citySlug,
      },
      breadcrumbs: [
        { name: 'Accueil',    path: '/' },
        { name: serviceLabel, path: '/' + routeKey },
        { name: cityLabel,    path: canonicalPath },
      ],
      ogImage: ORIGIN + '/img/logo.png',
    },

    hero: {
      eyebrow: serviceLabel.toUpperCase() + ' · ' + cityLabel.toUpperCase(),
      h1:      serviceLabel + ' à\u00a0' + cityLabel,
      intro:   heroIntro,
      chips: [
        { icon: '📍', text: cityLabel },
        { icon: service.icon || '🚿', text: serviceLabel },
        { icon: '✓', text: 'Paiement après intervention' },
      ],
      ctaPrimary: {
        label: 'Décrire mon besoin à ' + cityLabel,
        href:  ctaHref,
      },
      ctaSecondary: {
        label: 'Voir les profils référencés ↓',
        href:  '#fxlp-artisans',
      },
      pricenote: 'Le tarif définitif est confirmé avec l\'artisan avant l\'intervention.',
    },

    sections: [
      // §1 — How FIXEO helps (3 steps)
      {
        type:    'steps',
        heading: 'Trouver un ' + profession + ' à ' + cityLabel + ' avec FIXEO',
        steps: [
          {
            icon:  '1',
            title: 'Décrivez votre besoin',
            body:  'Indiquez votre situation — type de problème, localisation à ' + cityLabel + ', contexte. Aucun engagement à ce stade.',
          },
          {
            icon:  '2',
            title: 'FIXEO transmet aux profils référencés',
            body:  'Votre demande est enregistrée et transmise aux professionnels référencés correspondant à votre secteur à ' + cityLabel + '.',
          },
          {
            icon:  '3',
            title: 'L\'artisan confirme le tarif avant l\'intervention',
            body:  'Le professionnel vous contacte, évalue la situation et vous communique le tarif définitif avant de commencer. Paiement après intervention.',
          },
        ],
      },
      // §2 — FAQ (visible only — no FAQPage schema)
      {
        type:    'faq',
        heading: 'Questions fréquentes — ' + serviceLabel + ' à ' + cityLabel,
        items:   faqItems,
      },
      // §3 — Final CTA
      {
        type:     'cta',
        eyebrow:  'BESOIN D\'UN ' + serviceLabel.toUpperCase() + ' ?',
        heading:  'Décrire mon besoin en ' + (service.label_adj || serviceLabel.toLowerCase()) + ' à ' + cityLabel,
        body:     ctaBody,
        ctaLabel: 'Décrire mon besoin à ' + cityLabel,
        ctaHref:  ctaHref,
        note:     'Aucun paiement maintenant · Tarif confirmé avant l\'intervention',
      },
    ],

    artisanPosition: 'after_hero_marker',

    artisans: {
      heading:       serviceLabel + 's référencés à ' + cityLabel,
      subtext:       'Profils référencés sur FIXEO · Paiement après intervention',
      cityLabel:     cityLabel,
      serviceSlug:   service.runtimeServiceKey,
      categoryLabel: service.supabase_category,
    },

    extraCss,
    extraJs: [
      // SEO → Flagship handoff adapter (Task 2.6).
      // Reads fx_* params and seeds the hero estimation entry point.
      // Must be last (after CORE_JS), and only on V3 SEO pages.
      { src: '/js/fixeo-seo-handoff-v1.js?v=fsh-v1', defer: true },
    ],
  });

  // ── Post-process 1: remove fixeo-local-flagship-v1.js ────────────────────────

  const { html: htmlNoFlagship, removed: flagshipRemoved, warning: flagshipWarning } =
    removeFlagshipScript(html);
  html = htmlNoFlagship;
  if (flagshipWarning) warnings.push(flagshipWarning);

  // ── Post-process 2: patch skeleton → server-rendered V3 cards ────────────────

  html = patchArtisanGrid(html, cardsHtml, renderedCount);

  // ── Post-process 3: inject rich HTML sections ─────────────────────────────────

  const situationsHtml = buildSituationsHtml(service.situations || [], profession, cityLabel);
  const beforeHtml     = buildBeforeHtml(profession, cityLabel);
  const priceHtml      = buildPriceHtml(service.pricing_tiers, priceIntro, city.pricing_note, cityLabel);
  const explorerHtml   = buildExplorerHtml(service, citySlug, city, cities, services);

  // Injection 1: insert BESOINS FRÉQUENTS after the first <hr class="fxlp-divider"> (post-hero).
  // artisanHtml is already placed by page-template immediately after that <hr> (artisanPosition).
  // So the injection order becomes: <hr> → situationsHtml → artisanHtml → sections
  const heroEndMarker = '<hr class="fxlp-divider">';
  const heroEndIdx    = html.indexOf(heroEndMarker);
  if (heroEndIdx !== -1) {
    const insertAt = heroEndIdx + heroEndMarker.length;
    html = html.slice(0, insertAt)
      + situationsHtml
      + html.slice(insertAt);
  }

  // Injection 2: insert AVANT L'INTERVENTION after the COMMENT FIXEO (steps) section close tag.
  // steps section is uniquely identified by class="fxlp-section--steps".
  // Target order: artisans → steps (COMMENT FIXEO) → avant → tarifs → faq → ...
  const stepsAnchor    = 'class="fxlp-section fxlp-section--steps"';
  const stepsAnchorIdx = html.indexOf(stepsAnchor);
  if (stepsAnchorIdx !== -1) {
    const stepsCloseTag = '</section>';
    const stepsCloseIdx = html.indexOf(stepsCloseTag, stepsAnchorIdx);
    if (stepsCloseIdx !== -1) {
      const insertAt = stepsCloseIdx + stepsCloseTag.length;
      html = html.slice(0, insertAt)
        + beforeHtml
        + html.slice(insertAt);
    }
  }

  // Injection 3: insert TARIFS INDICATIFS just before the FAQ section.
  const faqMarker = '<section id="fxlp-faq"';
  const faqIdx    = html.indexOf(faqMarker);
  if (faqIdx !== -1) {
    html = html.slice(0, faqIdx)
      + priceHtml + '\n\n'
      + html.slice(faqIdx);
  }

  // Injection 4: insert EXPLORER AUSSI just before the CTA banner (after FAQ).
  const ctaMarker = '<div class="fxlp-cta-banner"';
  const ctaIdx    = html.indexOf(ctaMarker);
  if (ctaIdx !== -1) {
    html = html.slice(0, ctaIdx)
      + explorerHtml + '\n\n'
      + html.slice(ctaIdx);
  }

  // ── Return result ─────────────────────────────────────────────────────────────

  return {
    html,
    meta: {
      serviceSlug,
      citySlug,
      serviceLabel,
      cityLabel,
      canonicalUrl,
      canonicalPath,
      title:          titleStr,
      description:    descStr,
      cardCount:      renderedCount,
      robots,
      ctaHref,
      flagshipRemoved,
    },
    excluded,
    warnings,
  };
}

// ── Module exports ────────────────────────────────────────────────────────────

module.exports = {
  generateServiceCityPage,
  // Internals for testing
  _validateArtisanRecord:       validateArtisanRecord,
  _buildRenderedCards:          buildRenderedCards,
  _patchArtisanGrid:            patchArtisanGrid,
  _buildSituationsHtml:         buildSituationsHtml,
  _removeFlagshipScript:        removeFlagshipScript,
  _isPlaceholderName:           isPlaceholderName,
  _FLAGSHIP_SCRIPT_TAG:         FLAGSHIP_SCRIPT_TAG,
  _MAX_CARDS:                   MAX_CARDS,
};
