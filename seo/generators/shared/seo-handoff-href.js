'use strict';
/**
 * seo-handoff-href.js — Canonical SEO→Product Handoff URL Builder
 * ================================================================
 * Version: v1
 *
 * Builds the canonical fx_* handoff URL consumed by fixeo-seo-handoff-v1.js
 * (fsh-v3+) when an SEO page CTA leads to the FIXEO homepage.
 *
 * TWO ACCEPTED CONTRACTS (as of Task 2.7):
 *
 *   Service×City (local intent):
 *     /?fx_service=plombier&fx_city=casablanca&fx_source=seo#hero-quick-search
 *
 *   Service Hub (national intent):
 *     /?fx_service=plombier&fx_source=seo#hero-quick-search
 *
 * Both share the same structure — the only difference is whether citySlug
 * is present. This module provides a single canonical builder for both.
 *
 * DESIGN RULES:
 *   - fx_* namespace only (no ?service=, no ?city=, no RAFI params)
 *   - serviceSlug required
 *   - citySlug optional — when absent, fx_city is omitted (NOT set to empty)
 *   - source allowlisted ('seo' only at V3 launch)
 *   - canonical V3 slugs only (never display labels)
 *   - deterministic query parameter order: fx_service, [fx_city], fx_source
 *   - anchor: #hero-quick-search (fixed — matches homepage CTA target)
 *   - no arbitrary URL/redirect params
 *   - no PII fields
 *
 * API:
 *   buildSeoHandoffHref({ serviceSlug, citySlug?, source? })
 *   → string
 *
 * VALIDATION:
 *   - serviceSlug: required, string, min 2 chars, alphanumeric+hyphen only
 *   - citySlug: optional, string, min 2 chars, alphanumeric+hyphen only
 *   - source: optional, defaults to 'seo', must be in ALLOWED_SOURCES
 *   Throws TypeError for invalid inputs.
 *
 * FILE: seo/generators/shared/seo-handoff-href.js
 */

// ── Allowed sources ───────────────────────────────────────────────────────

/** Allowlist of valid fx_source values. */
const ALLOWED_SOURCES = Object.freeze(['seo']);

/** Fixed anchor for the homepage CTA target (fxrf4 hero section). */
const ANCHOR = '#hero-quick-search';

// ── Slug validation ───────────────────────────────────────────────────────

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

/**
 * Validate a canonical V3 slug (service or city).
 * Must be lowercase alphanumeric + hyphens, min 1 char.
 * @param {string} slug
 * @param {string} field - field name for error message
 */
function validateSlug(slug, field) {
  if (typeof slug !== 'string' || !slug.trim()) {
    throw new TypeError(`seo-handoff-href: "${field}" must be a non-empty string`);
  }
  if (slug.length < 2) {
    throw new TypeError(`seo-handoff-href: "${field}" is too short (min 2 chars): ${JSON.stringify(slug)}`);
  }
  if (!SLUG_RE.test(slug)) {
    throw new TypeError(
      `seo-handoff-href: "${field}" must be a canonical slug (lowercase alphanumeric + hyphens): ${JSON.stringify(slug)}`
    );
  }
}

// ── Main builder ──────────────────────────────────────────────────────────

/**
 * Build the canonical SEO→product handoff URL.
 *
 * @param {object} opts
 * @param {string}  opts.serviceSlug  - V3 canonical service slug (e.g. 'plombier')
 * @param {string} [opts.citySlug]    - V3 canonical city slug (e.g. 'casablanca') — optional
 * @param {string} [opts.source]      - defaults to 'seo' — must be in ALLOWED_SOURCES
 * @returns {string} — full handoff URL with query params and anchor
 *
 * @example
 *   buildSeoHandoffHref({ serviceSlug: 'plombier', citySlug: 'casablanca' })
 *   // → '/?fx_service=plombier&fx_city=casablanca&fx_source=seo#hero-quick-search'
 *
 *   buildSeoHandoffHref({ serviceSlug: 'plombier' })
 *   // → '/?fx_service=plombier&fx_source=seo#hero-quick-search'
 */
function buildSeoHandoffHref(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new TypeError('seo-handoff-href: opts must be a plain object');
  }

  const { serviceSlug, citySlug, source = 'seo' } = opts;

  // Validate serviceSlug (required)
  validateSlug(serviceSlug, 'serviceSlug');

  // Validate citySlug if provided
  if (citySlug !== undefined && citySlug !== null) {
    validateSlug(citySlug, 'citySlug');
  }

  // Validate source
  if (!ALLOWED_SOURCES.includes(source)) {
    throw new TypeError(
      `seo-handoff-href: source "${source}" is not allowed. Allowed: ${ALLOWED_SOURCES.join(', ')}`
    );
  }

  // Build deterministic query string: fx_service, [fx_city], fx_source
  const params = new URLSearchParams();
  params.set('fx_service', serviceSlug);
  if (citySlug) {
    params.set('fx_city', citySlug);
  }
  params.set('fx_source', source);

  return '/?' + params.toString() + ANCHOR;
}

// ── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  buildSeoHandoffHref,
  ALLOWED_SOURCES,
  ANCHOR,
};
