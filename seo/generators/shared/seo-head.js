'use strict';
/**
 * seo-head.js — FIXEO SEO V3 Canonical Metadata + Schema Foundation
 * Version: seo-head-v1a — 2026-09-10
 *
 * Returns deterministic, escaped strings suitable for injection into
 * server-generated / static HTML pages.
 *
 * Exports:
 *   buildSeoHead(options) → { metaTags: string, jsonLd: string }
 *
 * Consumed later by: service-hub, service×city, problem×city generators.
 * NOT wired into legacy generators yet (those integrations = separate tasks).
 *
 * Design rules:
 *   - ZERO LocalBusiness schema (see Phase 1 decision, 2026-09-10)
 *   - Schema: Organization + Service + BreadcrumbList only
 *   - canonical origin = https://www.fixeo.ma (canonical across 650+ pages)
 *   - robots decisions are passed in — not made here
 *   - all text values pass content-guard before output
 *   - no fake priceRange / AggregateRating / Offer / geo fabrication
 *   - no guaranteed availability / instant / certified artisan claims
 */

const { check } = require('./content-guard');

// ── Constants ────────────────────────────────────────────────────────────────

const ORIGIN          = 'https://www.fixeo.ma';
const LOGO_URL        = `${ORIGIN}/img/logo.png`;
const DEFAULT_IMAGE   = LOGO_URL;
const TWITTER_CARD    = 'summary';

/** FIXEO Organization block — stable across all V3 pages */
const ORGANIZATION_LD = {
  '@context':  'https://schema.org',
  '@type':     'Organization',
  '@id':       `${ORIGIN}/#organization`,
  'name':      'FIXEO',
  'legalName': 'FIXEO SARLAU',
  'url':       `${ORIGIN}/`,
  'logo':      LOGO_URL,
};

// ── HTML escape ───────────────────────────────────────────────────────────────

/**
 * Escape text for use inside HTML attribute values (double-quoted).
 * Covers the characters that matter in attribute context.
 */
function escAttr(raw) {
  if (typeof raw !== 'string') throw new TypeError(`escAttr: expected string, got ${typeof raw}`);
  return raw
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── JSON-LD serialization ─────────────────────────────────────────────────────

/**
 * Serialize a JSON-LD object to a safe <script> block.
 * Guards against </script> injection inside the JSON payload.
 */
function jsonLdBlock(obj) {
  const json = JSON.stringify(obj, null, 2)
    // Prevent </script> injection by escaping the forward slash after <
    .replace(/<\//g, '<\\/');
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

// ── Input validation ──────────────────────────────────────────────────────────

const VALID_PAGE_TYPES  = new Set(['service-hub', 'service-city', 'problem-city', 'price', 'generic']);
const VALID_ROBOTS      = new Set(['index,follow', 'noindex,follow', 'noindex,nofollow']);

function assertString(val, name) {
  if (typeof val !== 'string' || !val.trim())
    throw new Error(`seo-head: "${name}" must be a non-empty string`);
}

function assertCanonicalPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/'))
    throw new Error(`seo-head: canonicalPath must be a string starting with "/", got: ${JSON.stringify(path)}`);
  if (/[?#]/.test(path))
    throw new Error(`seo-head: canonicalPath must not contain query or hash: ${path}`);
  if (path.endsWith('.html'))
    throw new Error(`seo-head: canonicalPath must not end with .html: ${path}`);
}

// ── Content-guard wrapper ─────────────────────────────────────────────────────

/**
 * Run content-guard on a value; throws if a banned phrase is present.
 * field/page labels are only used in the error message.
 */
function guard(value, field, pageRef) {
  if (typeof value !== 'string') return;
  check(value, field, pageRef || 'seo-head');
}

// ── Breadcrumb builder ────────────────────────────────────────────────────────

/**
 * breadcrumbs: Array of { name: string, path: string }
 * path is a canonical path starting with '/'; last item may be null (no item URL per spec).
 */
function buildBreadcrumbLd(breadcrumbs, pageRef) {
  if (!Array.isArray(breadcrumbs) || breadcrumbs.length === 0)
    throw new Error(`seo-head: breadcrumbs must be a non-empty array`);

  const items = breadcrumbs.map((crumb, idx) => {
    assertString(crumb.name, `breadcrumbs[${idx}].name`);
    guard(crumb.name, `breadcrumb[${idx}]`, pageRef);
    const entry = {
      '@type':    'ListItem',
      'position': idx + 1,
      'name':     crumb.name,
    };
    // Last crumb: item URL is optional (omit per Google recommendation if no canonical for it)
    if (crumb.path) {
      assertCanonicalPath(crumb.path);
      entry['item'] = `${ORIGIN}${crumb.path}`;
    }
    return entry;
  });

  return {
    '@context':       'https://schema.org',
    '@type':          'BreadcrumbList',
    'itemListElement': items,
  };
}

// ── Service JSON-LD builder ───────────────────────────────────────────────────

/**
 * Build a Service JSON-LD block for service-city and problem-city pages.
 * The provider is always the FIXEO Organization — never LocalBusiness.
 *
 * options.service: { key, label }  — from services.json
 * options.city:    { key, label }  — from cities.json (optional for hubs)
 */
function buildServiceLd(options, canonicalUrl, pageRef) {
  const { service, city } = options;
  if (!service || !service.label) throw new Error('seo-head: service.label required for Service schema');

  guard(service.label, 'service.label', pageRef);

  const ld = {
    '@context':    'https://schema.org',
    '@type':       'Service',
    '@id':         `${canonicalUrl}#service`,
    'name':        service.label,
    'serviceType': service.label,
    'provider': {
      '@type': 'Organization',
      '@id':   `${ORIGIN}/#organization`,
      'name':  'FIXEO',
      'url':   `${ORIGIN}/`,
    },
  };

  if (city && city.label) {
    guard(city.label, 'city.label', pageRef);
    ld['areaServed'] = {
      '@type':              'City',
      'name':               city.label,
      'containedInPlace': {
        '@type': 'Country',
        'name':  'Maroc',
      },
    };
  }

  return ld;
}

// ── Main API ──────────────────────────────────────────────────────────────────

/**
 * buildSeoHead(options) → { metaTags: string, jsonLd: string }
 *
 * @param {object}   options
 * @param {string}   options.pageType        — 'service-hub' | 'service-city' | 'problem-city' | 'price' | 'generic'
 * @param {string}   options.title           — <title> content (raw; will be escaped)
 * @param {string}   options.description     — meta description (raw; will be escaped)
 * @param {string}   options.canonicalPath   — absolute path starting with '/', no query/hash, no .html
 * @param {string}   [options.robots]        — 'index,follow' | 'noindex,follow' | 'noindex,nofollow'
 *                                             defaults to 'index,follow'
 * @param {object}   [options.service]       — { key, label } — required for service-city / problem-city
 * @param {object}   [options.city]          — { key, label } — optional; enables areaServed in Service LD
 * @param {Array}    options.breadcrumbs     — [{ name, path }] — required; last item path may be null
 * @param {string}   [options.ogImage]       — absolute URL; defaults to FIXEO logo
 * @param {string}   [options.ogType]        — 'website' (default) | 'article'
 *
 * Returns:
 *   metaTags  — HTML string: <title> + all <meta> + <link rel="canonical"> + OG/Twitter tags
 *   jsonLd    — HTML string: one or more <script type="application/ld+json"> blocks
 */
function buildSeoHead(options) {
  if (!options || typeof options !== 'object')
    throw new Error('seo-head: options must be an object');

  const {
    pageType,
    title,
    description,
    canonicalPath,
    robots    = 'index,follow',
    service,
    city,
    breadcrumbs,
    ogImage   = DEFAULT_IMAGE,
    ogType    = 'website',
  } = options;

  // ── Validate required inputs ───────────────────────────────────────────────
  if (!VALID_PAGE_TYPES.has(pageType))
    throw new Error(`seo-head: unknown pageType "${pageType}". Valid: ${[...VALID_PAGE_TYPES].join(', ')}`);

  assertString(title,       'title');
  assertString(description, 'description');
  assertCanonicalPath(canonicalPath);

  if (!VALID_ROBOTS.has(robots))
    throw new Error(`seo-head: invalid robots value "${robots}". Valid: ${[...VALID_ROBOTS].join(', ')}`);

  const pageRef = canonicalPath;

  // ── Content-guard all text inputs ─────────────────────────────────────────
  guard(title,       'title',       pageRef);
  guard(description, 'description', pageRef);

  // ── Build canonical URL ────────────────────────────────────────────────────
  const canonicalUrl = `${ORIGIN}${canonicalPath}`;

  // ── Build <meta> + <title> + <link canonical> ─────────────────────────────
  const metaLines = [
    `<title>${escAttr(title)}</title>`,
    `<meta name="description" content="${escAttr(description)}">`,
    `<link rel="canonical" href="${escAttr(canonicalUrl)}">`,
    `<meta name="robots" content="${escAttr(robots)}">`,
    // Open Graph
    `<meta property="og:type" content="${escAttr(ogType)}">`,
    `<meta property="og:title" content="${escAttr(title)}">`,
    `<meta property="og:description" content="${escAttr(description)}">`,
    `<meta property="og:url" content="${escAttr(canonicalUrl)}">`,
    `<meta property="og:image" content="${escAttr(ogImage)}">`,
    `<meta property="og:site_name" content="Fixeo">`,
    `<meta property="og:locale" content="fr_MA">`,
    // Twitter
    `<meta name="twitter:card" content="${escAttr(TWITTER_CARD)}">`,
    `<meta name="twitter:title" content="${escAttr(title)}">`,
    `<meta name="twitter:description" content="${escAttr(description)}">`,
  ].join('\n  ');

  // ── Build JSON-LD blocks ───────────────────────────────────────────────────
  const ldBlocks = [];

  // 1. Organization (always)
  ldBlocks.push(jsonLdBlock(ORGANIZATION_LD));

  // 2. Service (for service-hub, service-city, problem-city, price)
  const needsService = ['service-hub', 'service-city', 'problem-city', 'price'].includes(pageType);
  if (needsService) {
    if (!service || !service.label)
      throw new Error(`seo-head: pageType "${pageType}" requires options.service.label`);
    ldBlocks.push(jsonLdBlock(buildServiceLd({ service, city }, canonicalUrl, pageRef)));
  }

  // 3. BreadcrumbList (always)
  if (!breadcrumbs || !Array.isArray(breadcrumbs) || breadcrumbs.length === 0)
    throw new Error('seo-head: breadcrumbs are required and must be a non-empty array');
  ldBlocks.push(jsonLdBlock(buildBreadcrumbLd(breadcrumbs, pageRef)));

  return {
    metaTags: metaLines,
    jsonLd:   ldBlocks.join('\n'),
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  buildSeoHead,
  // Exported for testing
  escAttr,
  ORIGIN,
  ORGANIZATION_LD,
};
