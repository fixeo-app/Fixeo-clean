'use strict';
/**
 * page-template.js — FIXEO SEO V3 Canonical Page Template
 * Version: page-template-v2a — 2026-09-10
 *
 * Renders complete, valid HTML for V3 SEO pages.
 * Consumes seo-head.js for all metadata/schema logic.
 *
 * Exports:
 *   buildPage(options) → string (complete HTML document)
 *
 * Supported page types: service-hub | service-city | problem-city | price
 *
 * DESIGN RULES:
 *   - ZERO legacy RAFI coupling (no #qsm-select-city, #qsm-input-nlp,
 *     data-open-request-form, fx-request-flow-v4.js, reservation scripts)
 *   - CTA href is CALLER-SUPPLIED — template never constructs request-flow URLs
 *   - Product-flow integration deferred to a dedicated isolated Task
 *   - Zero LocalBusiness schema (delegated to seo-head.js which emits none)
 *   - No hardcoded banned FIXEO claims in template chrome
 *   - Header rendered empty <nav>; fixeo-header-global.js populates it at runtime
 *   - Footer rendered empty <footer>; fixeo-footer-global.js populates it at runtime
 *   - Artisan grid hook: #fxlp-artisan-grid with data-* attributes wired to fixeo-local-flagship-v1.js
 *   - All content values use structured objects; no unrestricted raw HTML
 *   - No inline CSS blobs; no inline JS
 *   - Deterministic output
 *
 * ASSET CLASSIFICATION (see CORE_CSS / CORE_JS below):
 *   A — required global shell asset
 *   B — required current production compatibility asset
 *   C — legacy RAFI/request-flow (EXCLUDED)
 *   D — page-specific (added via extraCss/extraJs by generator)
 *   E — unnecessary for structural template (excluded)
 *
 * INTENTIONALLY DEFERRED (later tasks):
 *   - Product-flow / flagship CTA wiring (Task 2.x)
 *   - Final artisan card V3 design (Task 2.x)
 *   - Visual premium CSS (Task 2.x)
 *   - Generator wiring (each generator imports this module separately)
 *
 * VISUAL SYSTEM NOTE (frozen requirement for next task):
 *   SEO V3 visual quality must match the highest-quality recently approved FIXEO pages.
 *   It must feel flagship, premium institutional, unmistakably FIXEO, mobile-first,
 *   product-led — not a generic SEO template or legacy directory.
 *   The future visual system must establish a recognisable FIXEO signature across:
 *   hero, section rhythm, cards, badges, borders, spacing, CTA hierarchy,
 *   artisan presentation, process blocks, FAQ, final conversion area.
 *   Implementation: deferred to dedicated visual Task.
 */

const { buildSeoHead } = require('./seo-head');
const { check }        = require('./content-guard');

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_PAGE_TYPES = new Set(['service-hub', 'service-city', 'problem-city', 'price']);

/**
 * CORE_CSS — global/structural assets required on all V3 SEO pages.
 *
 * A  /css/variables.css                   — design tokens, always required
 * A  /css/fixeo-header-global.css         — global header shell
 * A  /css/fixeo-footer-global.css         — global footer shell
 * A  /css/fixeo-consent-v1.css            — consent banner
 * B  /css/artisan-card-conversion-v1.css  — artisan card styles (frozen, never modify)
 * B  /css/fixeo-artisan-section-v1.css    — artisan grid section layout
 * D  /css/fixeo-local-flagship-v1.css     — LP page structural styles
 *
 * Excluded (C — legacy RAFI / request-flow):
 *   reservation.css, reservation-v2.css, reservation-v2a.css,
 *   fixeo-reservation-flagship-v1.css, fx-request-flow-v4.css
 */
const CORE_CSS = [
  '/css/variables.css',
  '/css/fixeo-header-global.css',
  '/css/fixeo-footer-global.css?v=gf4a',
  '/css/fixeo-consent-v1.css?v=fcv1b',
  '/css/artisan-card-conversion-v1.css?v=fxhome-artisan-card-v3b2',
  '/css/fixeo-artisan-section-v1.css?v=fxhome-artisan-section-v1a2-int11',
  '/css/fixeo-local-flagship-v1.css?v=fxlp-v15',
];

/**
 * CORE_JS — global runtime assets required on all V3 SEO pages.
 *
 * A  fixeo-consent-v1.js         — consent banner (sync, before analytics)
 * A  fixeo-analytics-config.js   — analytics config
 * A  fixeo-analytics-bootstrap.js — analytics bootstrap
 * B  supabase-js (CDN)           — Supabase client (required by artisan grid)
 * B  supabase-client.js          — FIXEO Supabase wrapper
 * A  fixeo-header-global.js      — global header render
 * B  header-unified.js           — header modal/unification compatibility
 * A  fixeo-footer-global.js      — global footer render
 * B  fixeo-local-flagship-v1.js  — artisan grid (queries Supabase directly)
 *
 * Excluded (C — legacy RAFI / request-flow — NOT carried into V3):
 *   fixeo-reservation-flagship-v1.js  — old reservation modal
 *   fx-request-flow-v4.js             — old RAFI flow (reads #qsm-select-city)
 *   reservation.js, cod-payment.js,
 *   reservation-v2.js, fixeo-reservation-supabase-bridge.js
 *
 * Excluded (E — unnecessary for structural template):
 *   fixeo-heroes.js (avatar data provider — not needed on SEO pages)
 */
const CORE_JS = [
  { src: '/js/fixeo-consent-v1.js?v=fcv1c',                                                defer: false },
  { src: '/js/fixeo-analytics-config.js?v=fac1b',                                           defer: true  },
  { src: '/js/fixeo-analytics-bootstrap.js?v=fab1c',                                        defer: true  },
  { src: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',  defer: false },
  { src: '/js/supabase-client.js?v=sc2',                                                    defer: false },
  { src: '/js/fixeo-header-global.js?v=gfnav5',                                             defer: false },
  { src: '/js/header-unified.js?v=modalfix3',                                               defer: false },
  { src: '/js/fixeo-footer-global.js?v=gf4a',                                               defer: true  },
  { src: '/js/fixeo-local-flagship-v1.js?v=fxlp-v12',                                       defer: true  },
];

// ── HTML escape ───────────────────────────────────────────────────────────────

function esc(raw) {
  if (typeof raw !== 'string') throw new TypeError(`esc: expected string, got ${typeof raw}`);
  return raw
    .replace(/&/g,  '&amp;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#x27;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;');
}

function escHref(raw) {
  if (typeof raw !== 'string') throw new TypeError(`escHref: expected string`);
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:'))
    throw new Error(`escHref: unsafe href scheme: ${raw}`);
  return esc(raw);
}

// ── Content-guard wrapper ─────────────────────────────────────────────────────

function guard(value, field, pageRef) {
  if (typeof value !== 'string') return;
  check(value, field, pageRef || 'page-template');
}

// ── Breadcrumb HTML ───────────────────────────────────────────────────────────

/**
 * breadcrumbs: [{ name, path }]
 * path: clean canonical path or null for last item
 * Validation applies to ALL items (including last).
 */
function buildVisibleBreadcrumbs(breadcrumbs, pageRef) {
  if (!Array.isArray(breadcrumbs) || breadcrumbs.length === 0)
    throw new Error('page-template: breadcrumbs must be a non-empty array');

  const items = breadcrumbs.map((crumb, idx) => {
    if (!crumb.name || typeof crumb.name !== 'string')
      throw new Error(`page-template: breadcrumbs[${idx}].name must be a non-empty string`);
    guard(crumb.name, `breadcrumb[${idx}]`, pageRef);

    // Validate path if present (all items, including last)
    if (crumb.path) {
      if (crumb.path.endsWith('.html'))
        throw new Error(`page-template: breadcrumb path must not end with .html: ${crumb.path}`);
      if (/[?#]/.test(crumb.path))
        throw new Error(`page-template: breadcrumb path must not contain query/hash: ${crumb.path}`);
      if (crumb.path.includes('/quartier-'))
        throw new Error(`page-template: retired quartier URL not allowed in breadcrumbs: ${crumb.path}`);
    }

    const isLast = idx === breadcrumbs.length - 1;

    if (isLast) {
      return `<span aria-current="page">${esc(crumb.name)}</span>`;
    }

    return crumb.path
      ? `<a href="${esc(crumb.path)}">${esc(crumb.name)}</a>`
      : `<span>${esc(crumb.name)}</span>`;
  });

  const withSeps = items.map((item, idx) =>
    idx < items.length - 1
      ? item + '\n        <span aria-hidden="true" class="fxlp-bc-sep">›</span>'
      : item
  );

  return `<nav class="fxlp-breadcrumbs" aria-label="Fil d'Ariane">
      ${withSeps.join('\n        ')}
    </nav>`;
}

// ── Hero section ──────────────────────────────────────────────────────────────

/**
 * hero: {
 *   eyebrow?,         string
 *   h1,               string — the page's single <h1>
 *   intro,            string — introductory paragraph
 *   ctaPrimary: {
 *     label,          string
 *     href,           string — caller-supplied canonical href (no URL construction here)
 *   },
 *   ctaSecondary?: {  optional
 *     label,          string
 *     href,           string
 *   },
 *   trustLine?,       string — e.g. "Paiement après intervention · Tarif confirmé avant de commencer"
 * }
 *
 * NOTE: CTA href is passed in by the caller (generator). The template never constructs
 * request-flow URLs internally. Product-flow integration is a separate Task.
 */
function buildHeroSection(hero, pageRef) {
  if (!hero) throw new Error('page-template: hero is required');
  if (!hero.h1) throw new Error('page-template: hero.h1 is required');
  if (!hero.intro) throw new Error('page-template: hero.intro is required');
  if (!hero.ctaPrimary || !hero.ctaPrimary.label || !hero.ctaPrimary.href)
    throw new Error('page-template: hero.ctaPrimary.{label,href} are required');

  guard(hero.eyebrow,          'hero.eyebrow',          pageRef);
  guard(hero.h1,               'hero.h1',               pageRef);
  guard(hero.intro,            'hero.intro',            pageRef);
  guard(hero.ctaPrimary.label, 'hero.ctaPrimary.label', pageRef);
  if (hero.ctaSecondary) guard(hero.ctaSecondary.label, 'hero.ctaSecondary.label', pageRef);
  if (hero.trustLine)    guard(hero.trustLine,           'hero.trustLine',          pageRef);

  const eyebrowHtml = hero.eyebrow
    ? `<p class="fxlp-eyebrow">${esc(hero.eyebrow)}</p>` : '';

  const secondaryBtn = hero.ctaSecondary
    ? `\n          <a href="${escHref(hero.ctaSecondary.href)}" class="fxlp-btn-secondary">${esc(hero.ctaSecondary.label)}</a>`
    : '';

  const trustHtml = hero.trustLine
    ? `\n        <p class="fxlp-hero-trust">${esc(hero.trustLine)}</p>` : '';

  return `<section class="fxlp-hero" aria-labelledby="fxlp-h1">
      <div class="fxlp-wrap">
        ${eyebrowHtml}
        <h1 id="fxlp-h1" class="fxlp-h1">${esc(hero.h1)}</h1>
        <p class="fxlp-lead">${esc(hero.intro)}</p>
        <div class="fxlp-hero-cta-group">
          <a href="${escHref(hero.ctaPrimary.href)}" class="fxlp-btn-primary">${esc(hero.ctaPrimary.label)}</a>${secondaryBtn}
        </div>${trustHtml}
      </div>
    </section>`;
}

// ── Content sections ──────────────────────────────────────────────────────────

/**
 * sections: Array of section objects. Each MUST have a 'type' field.
 *
 * Supported types — ALL use structured content; no unrestricted raw HTML:
 *
 *   { type: 'text',
 *     heading?: string,
 *     paragraphs: string[]      — array of paragraph strings (each escaped)
 *   }
 *
 *   { type: 'list',
 *     heading?: string,
 *     items: string[]           — list item strings (each escaped)
 *   }
 *
 *   { type: 'steps',
 *     heading?: string,
 *     steps: [{ icon?, title, body }]
 *       icon: string (emoji or short label)
 *       title: string
 *       body: string            — plain text paragraph (escaped)
 *   }
 *
 *   { type: 'faq',
 *     heading?: string,
 *     items: [{ q, a }]         — both strings (escaped)
 *   }
 *
 *   { type: 'cta',
 *     eyebrow?: string,
 *     heading?: string,
 *     body?: string,
 *     ctaLabel: string,
 *     ctaHref:  string,         — caller-supplied href
 *     note?:    string
 *   }
 *
 * Raw HTML escape hatch: REMOVED. Use structured types above.
 * If a generator needs inline-formatted content, use 'text' with
 * paragraphs[] and keep formatting in separate section objects.
 */
function buildContentSections(sections, pageRef) {
  if (!Array.isArray(sections)) return '';

  return sections.map((sec, idx) => {
    const secId = `fxlp-sec-${idx}`;

    switch (sec.type) {

      case 'text': {
        if (!Array.isArray(sec.paragraphs))
          throw new Error(`page-template: sections[${idx}] type=text requires paragraphs[] array`);
        sec.paragraphs.forEach((p, pi) => {
          if (typeof p !== 'string')
            throw new Error(`page-template: sections[${idx}].paragraphs[${pi}] must be a string`);
          guard(p, `sections[${idx}].paragraphs[${pi}]`, pageRef);
        });
        const headingHtml = sec.heading
          ? `<h2 id="${secId}" class="fxlp-section-title">${esc(sec.heading)}</h2>` : '';
        const bodyHtml = sec.paragraphs.map(p => `<p>${esc(p)}</p>`).join('\n        ');
        return `<section class="fxlp-section" aria-labelledby="${secId}">
      <div class="fxlp-wrap">
        ${headingHtml}
        <div class="fxlp-section-body">
        ${bodyHtml}
        </div>
      </div>
    </section>`;
      }

      case 'list': {
        if (!Array.isArray(sec.items)) throw new Error(`page-template: sections[${idx}].items must be an array`);
        sec.items.forEach(item => guard(item, `sections[${idx}].items[]`, pageRef));
        const headingHtml = sec.heading
          ? `<h2 id="${secId}" class="fxlp-section-title">${esc(sec.heading)}</h2>` : '';
        const liHtml = sec.items.map(item => `<li>${esc(item)}</li>`).join('\n          ');
        return `<section class="fxlp-section" aria-labelledby="${secId}">
      <div class="fxlp-wrap">
        ${headingHtml}
        <ul class="fxlp-list" role="list">
          ${liHtml}
        </ul>
      </div>
    </section>`;
      }

      case 'steps': {
        if (!Array.isArray(sec.steps)) throw new Error(`page-template: sections[${idx}].steps must be an array`);
        sec.steps.forEach((step, si) => {
          guard(step.title, `sections[${idx}].steps[${si}].title`, pageRef);
          guard(step.body,  `sections[${idx}].steps[${si}].body`,  pageRef);
        });
        const headingHtml = sec.heading
          ? `<h2 id="${secId}" class="fxlp-section-title">${esc(sec.heading)}</h2>` : '';
        const stepsHtml = sec.steps.map((step, si) => `<div class="fxlp-step">
            <span class="fxlp-step-icon" aria-hidden="true">${esc(step.icon || String(si + 1))}</span>
            <div class="fxlp-step-content">
              <strong class="fxlp-step-title">${esc(step.title)}</strong>
              <p class="fxlp-step-body">${esc(step.body || '')}</p>
            </div>
          </div>`).join('\n          ');
        return `<section class="fxlp-section fxlp-section--steps" aria-labelledby="${secId}">
      <div class="fxlp-wrap">
        ${headingHtml}
        <div class="fxlp-steps-grid">
          ${stepsHtml}
        </div>
      </div>
    </section>`;
      }

      case 'faq': {
        if (!Array.isArray(sec.items)) throw new Error(`page-template: sections[${idx}].items must be an array`);
        sec.items.forEach((item, fi) => {
          guard(item.q, `sections[${idx}].faq[${fi}].q`, pageRef);
          guard(item.a, `sections[${idx}].faq[${fi}].a`, pageRef);
        });
        const headingHtml = sec.heading
          ? `<h2 id="${secId}" class="fxlp-section-title">${esc(sec.heading)}</h2>` : '';
        const faqHtml = sec.items.map(item => `<details class="fxlp-faq-item">
            <summary class="fxlp-faq-summary">
              <strong>${esc(item.q)}</strong>
              <span class="fxlp-faq-chevron" aria-hidden="true">›</span>
            </summary>
            <div class="fxlp-faq-answer"><p>${esc(item.a)}</p></div>
          </details>`).join('\n          ');
        return `<section id="fxlp-faq" class="fxlp-section fxlp-section--faq" aria-labelledby="${secId}">
      <div class="fxlp-wrap">
        ${headingHtml}
        <div class="fxlp-faq-list">
          ${faqHtml}
        </div>
      </div>
    </section>`;
      }

      case 'cta': {
        if (!sec.ctaLabel || !sec.ctaHref)
          throw new Error(`page-template: sections[${idx}] type=cta requires ctaLabel and ctaHref`);
        guard(sec.eyebrow,  `sections[${idx}].cta.eyebrow`,  pageRef);
        guard(sec.heading,  `sections[${idx}].cta.heading`,  pageRef);
        guard(sec.body,     `sections[${idx}].cta.body`,     pageRef);
        guard(sec.ctaLabel, `sections[${idx}].cta.ctaLabel`, pageRef);
        guard(sec.note,     `sections[${idx}].cta.note`,     pageRef);
        const eyebrowHtml = sec.eyebrow ? `<p class="fxlp-cta-eyebrow">${esc(sec.eyebrow)}</p>` : '';
        const headHtml    = sec.heading ? `<p class="fxlp-cta-title">${esc(sec.heading)}</p>` : '';
        const bodyHtml    = sec.body    ? `<p class="fxlp-cta-lead">${esc(sec.body)}</p>` : '';
        const noteHtml    = sec.note    ? `<p class="fxlp-cta-note">${esc(sec.note)}</p>` : '';
        return `<div class="fxlp-wrap">
      <div class="fxlp-cta-banner" id="${secId}" role="complementary">
        ${eyebrowHtml}
        ${headHtml}
        ${bodyHtml}
        <a href="${escHref(sec.ctaHref)}" class="fxlp-btn-primary">${esc(sec.ctaLabel)}</a>
        ${noteHtml}
      </div>
    </div>`;
      }

      default:
        throw new Error(`page-template: unknown section type "${sec.type}" at index ${idx}`);
    }
  }).join('\n\n    <hr class="fxlp-divider">\n\n    ');
}

// ── Artisan grid section ──────────────────────────────────────────────────────

/**
 * artisans: {
 *   heading,        string
 *   subtext?,       string
 *   cityLabel,      string  — human-readable city name (data-fxlp-city)
 *   serviceSlug,    string  — route slug e.g. "plombier" (data-fxlp-service)
 *   categoryLabel,  string  — Supabase category prefix e.g. "Plomberie" (data-fxlp-category)
 * }
 *
 * fixeo-local-flagship-v1.js reads:
 *   #fxlp-artisan-grid[data-fxlp-city][data-fxlp-service][data-fxlp-category]
 * and replaces skeleton loaders with live Supabase-sourced cards.
 */
function buildArtisanSection(artisans, pageRef) {
  if (!artisans) return '';
  if (!artisans.heading)       throw new Error('page-template: artisans.heading is required');
  if (!artisans.cityLabel)     throw new Error('page-template: artisans.cityLabel is required');
  if (!artisans.serviceSlug)   throw new Error('page-template: artisans.serviceSlug is required');
  if (!artisans.categoryLabel) throw new Error('page-template: artisans.categoryLabel is required');

  guard(artisans.heading, 'artisans.heading', pageRef);
  guard(artisans.subtext, 'artisans.subtext', pageRef);

  const subtextHtml = artisans.subtext
    ? `<p class="fxlp-section-sub">${esc(artisans.subtext)}</p>` : '';
  const ariaLabel = `${esc(artisans.heading)}`;

  return `<section id="fxlp-artisans" class="fxlp-section" aria-labelledby="fxlp-art-title">
      <div class="fxlp-wrap">
        <span class="fxlp-section-label">ARTISANS RÉFÉRENCÉS</span>
        <h2 id="fxlp-art-title" class="fxlp-section-title">${esc(artisans.heading)}</h2>
        ${subtextHtml}
        <div class="fxlp-artisan-grid" role="list" aria-label="${ariaLabel}" aria-live="polite">
          <div
            id="fxlp-artisan-grid"
            class="fxlp-artisan-loading"
            role="list"
            aria-label="${ariaLabel}"
            data-fxlp-city="${esc(artisans.cityLabel)}"
            data-fxlp-service="${esc(artisans.serviceSlug)}"
            data-fxlp-category="${esc(artisans.categoryLabel)}">
            <!-- skeleton loaders — replaced by fixeo-local-flagship-v1.js -->
            <div class="fxlp-skeleton" aria-hidden="true"></div>
            <div class="fxlp-skeleton" aria-hidden="true"></div>
            <div class="fxlp-skeleton" aria-hidden="true"></div>
          </div>
          <!-- empty-state hook — populated by fixeo-local-flagship-v1.js when no profiles found -->
          <div id="fxlp-artisan-empty" class="fxlp-artisan-empty" hidden aria-live="polite">
            <p>Aucun profil référencé disponible pour ce secteur pour l'instant.</p>
          </div>
        </div>
      </div>
    </section>`;
}

// ── CSS / JS asset blocks ─────────────────────────────────────────────────────

function buildCssLinks(extraCss) {
  const all = [...CORE_CSS, ...(extraCss || [])];
  const seen = new Set();
  return all.filter(href => {
    const base = href.split('?')[0];
    if (seen.has(base)) return false;
    seen.add(base);
    return true;
  }).map(href => `  <link rel="stylesheet" href="${esc(href)}">`).join('\n');
}

function buildScriptTags(extraJs) {
  const all = [...CORE_JS, ...(extraJs || [])];
  return all.map(s =>
    s.defer
      ? `  <script src="${esc(s.src)}" defer></script>`
      : `  <script src="${esc(s.src)}"></script>`
  ).join('\n');
}

// ── ID collision guard ────────────────────────────────────────────────────────

const RESERVED_IDS = new Set([
  'fxlp-h1', 'fxlp-artisans', 'fxlp-artisan-grid', 'fxlp-artisan-empty',
  'fxlp-faq', 'main-content',
]);

function checkDuplicateIds(sections) {
  const seen = new Set(RESERVED_IDS);
  (sections || []).forEach((sec, idx) => {
    const id = `fxlp-sec-${idx}`;
    if (seen.has(id)) throw new Error(`page-template: duplicate section id "${id}"`);
    seen.add(id);
  });
}

// ── Main API ──────────────────────────────────────────────────────────────────

/**
 * buildPage(options) → string (complete <!DOCTYPE html> document)
 *
 * @param {object}   options
 * @param {string}   options.pageType      — 'service-hub'|'service-city'|'problem-city'|'price'
 * @param {string}   [options.generator]   — generator id for <meta name="generator">
 * @param {object}   options.seo           — passed verbatim to buildSeoHead()
 *                                           { title, description, canonicalPath, robots?,
 *                                             service?, city?, breadcrumbs, ogImage?, ogType? }
 * @param {object}   options.hero          — see buildHeroSection()
 * @param {Array}    [options.sections]    — content sections (see buildContentSections())
 * @param {object}   [options.artisans]    — artisan grid config; omit for pages without grid
 * @param {string[]} [options.extraCss]    — additional CSS hrefs beyond CORE_CSS
 * @param {object[]} [options.extraJs]     — additional JS: [{ src, defer }]
 *
 * Body data-* attributes (data-svc, data-city) are derived from seo.service.key / seo.city.key
 * for compatibility with existing fixeo-local-flagship-v1.js category detection.
 */
function buildPage(options) {
  if (!options || typeof options !== 'object')
    throw new Error('page-template: options must be an object');

  const { pageType, generator, seo, hero, sections, artisans, artisanPosition, extraCss, extraJs } = options;

  if (!VALID_PAGE_TYPES.has(pageType))
    throw new Error(`page-template: unknown pageType "${pageType}". Valid: ${[...VALID_PAGE_TYPES].join(', ')}`);
  if (!seo)  throw new Error('page-template: seo is required');
  if (!hero) throw new Error('page-template: hero is required');

  checkDuplicateIds(sections);

  const pageRef = seo.canonicalPath || pageType;

  // SEO head (metadata + schema — no LocalBusiness)
  const { metaTags, jsonLd } = buildSeoHead({ pageType, ...seo });

  // Body data-* attributes (fixeo-local-flagship-v1.js category detection)
  const dataSvc  = seo.service && seo.service.key ? ` data-svc="${esc(seo.service.key)}"` : '';
  const dataCity = seo.city    && seo.city.key    ? ` data-city="${esc(seo.city.key)}"` : '';

  // Visible breadcrumbs
  const breadcrumbsHtml = buildVisibleBreadcrumbs(seo.breadcrumbs, pageRef);

  // Hero
  const heroHtml = buildHeroSection(hero, pageRef);

  // Content sections
  const sectionsHtml = buildContentSections(sections || [], pageRef);

  // Artisan grid
  const artisanHtml = buildArtisanSection(artisans, pageRef);

  // Assets
  const cssLinks   = buildCssLinks(extraCss);
  const scriptTags = buildScriptTags(extraJs);

  // Generator meta tag
  const generatorMeta = generator
    ? `\n  <meta name="generator" content="${esc(generator)}">` : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">${generatorMeta}
  ${metaTags}
${cssLinks}
  <link rel="icon" href="/img/favicon.png" type="image/png">
${jsonLd}
</head>
<body class="seo-service-page" data-theme="dark"${dataSvc}${dataCity}>
  <div class="bg-animated seo-bg" aria-hidden="true"></div>
  <a href="#main-content" class="fxlp-skip-link">Aller au contenu principal</a>

  <!-- Global header — populated by fixeo-header-global.js at runtime -->
  <nav class="navbar" role="navigation" aria-label="Navigation principale"></nav>

  <main id="main-content" role="main">

    <!-- Breadcrumbs -->
    <div class="fxlp-wrap">
      ${breadcrumbsHtml}
    </div>

    <!-- Hero -->
    ${heroHtml}

    <hr class="fxlp-divider">

    ${artisanPosition === 'after_hero_marker' && artisanHtml ? `<!-- Artisan grid -->\n    ${artisanHtml}\n\n    <hr class="fxlp-divider">\n\n    ` : ''}<!-- Content sections -->
    ${sectionsHtml}

    ${artisanPosition === 'after_hero_marker' ? '' : artisanHtml ? `<hr class="fxlp-divider">\n\n    <!-- Artisan grid -->\n    ${artisanHtml}` : ''}

  </main>

  <!-- Global footer — populated by fixeo-footer-global.js at runtime -->
  <footer class="fixeo-footer" aria-label="Pied de page"></footer>

${scriptTags}
</body>
</html>`;
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  buildPage,
  // Exported for testing
  buildVisibleBreadcrumbs,
  buildArtisanSection,
  CORE_CSS,
  CORE_JS,
};
