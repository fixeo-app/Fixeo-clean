/**
 * publishability.js — FIXEO SEO V3 Equity-Aware Publishability Policy
 * ====================================================================
 * Determines whether a city × service combination should be published,
 * preserved, flagged for review, or blocked.
 *
 * POLICY (approved 2026-09-10):
 *
 * A — EXISTING / PRESERVED SEO URLs
 *   URLs already generated and indexed (present in `preserved_urls` set)
 *   carry existing SEO equity and must NOT be automatically destroyed by
 *   artisan count alone.
 *   - count >= 1  → status: "preserve"  (retain page as-is)
 *   - count === 0 → status: "review"    (flag for human decision; do NOT
 *                                        auto-retire, redirect, or noindex)
 *
 * B — NEW / FUTURE SEO COMBINATIONS
 *   Any combination NOT in the preserved set.
 *   - city.publishable !== true → status: "block"
 *   - count === 0               → status: "block"
 *   - count >= 1 and < NEW_THRESHOLD → status: "block"
 *   - count >= NEW_THRESHOLD    → status: "publish"
 *   NEW_THRESHOLD = 3  (approved 2026-09-10)
 *
 * CASES:
 *   Unknown city or service               → block ("unknown-input")
 *   city.publishable = false              → block ("city-not-publishable")
 *   New combination, count < 3            → block ("below-new-threshold")
 *   New combination, count >= 3           → publish
 *   Existing URL, count >= 1              → preserve
 *   Existing URL, count === 0             → review ("zero-artisan-existing")
 *
 * TEMARA/TÉMARA ALIAS NOTE:
 *   The Supabase DB stores some artisan rows as "Temara" (no accent) while
 *   the canonical label is "Témara" (accented). The live ilike query does
 *   not match across this accent boundary, so artisan-counts.json reflects
 *   the live count (temara × most services = low/zero). Publishability
 *   decisions for temara are made on those live counts, not on a corrected
 *   hypothetical. See seo/docs/phase1-qa-report.md Task 1.7 for details.
 *   A future city-alias layer will resolve this without DB mutation.
 *
 * API:
 *   const { decide, runMatrix, NEW_THRESHOLD } = require('./publishability');
 *
 *   decide(citySlug, serviceKey, artisanCount, isPreserved, cities, services)
 *   → { publishable: boolean, status: string, reason: string }
 *
 *   runMatrix(cities, services, counts, preservedSet)
 *   → array of { citySlug, serviceKey, count, publishable, status, reason }
 *
 * @module publishability
 */

'use strict';

// ---------------------------------------------------------------------------
// Policy constants
// ---------------------------------------------------------------------------

/** Minimum artisan count required to publish a NEW (non-preserved) page. */
const NEW_THRESHOLD = 3;

/** Status values */
const STATUS = {
  PUBLISH:  'publish',   // New combination meets all criteria — publish
  PRESERVE: 'preserve',  // Existing URL with artisans — retain SEO equity
  REVIEW:   'review',    // Existing URL with zero artisans — human review required
  BLOCK:    'block',     // Should not be published / indexable
};

Object.freeze(STATUS);

// ---------------------------------------------------------------------------
// Core decision function
// ---------------------------------------------------------------------------

/**
 * Decide publishability for a single city × service combination.
 *
 * @param {string}  citySlug     - Canonical city slug (e.g. "casablanca")
 * @param {string}  serviceKey   - Canonical service key (e.g. "plombier")
 * @param {number}  artisanCount - Count from artisan-counts.json (>= 0)
 * @param {boolean} isPreserved  - True if this combination has an existing SEO URL
 * @param {Object}  citiesData   - Parsed cities.json (slug → city object)
 * @param {Object}  servicesData - Parsed services.json (key → service object)
 * @returns {{ publishable: boolean, status: string, reason: string }}
 */
function decide(citySlug, serviceKey, artisanCount, isPreserved, citiesData, servicesData) {
  // --- Guard: unknown city ---
  if (!citiesData[citySlug] || citySlug === '_meta') {
    return {
      publishable: false,
      status: STATUS.BLOCK,
      reason: `unknown-city: "${citySlug}" not found in cities.json`,
    };
  }

  // --- Guard: unknown service ---
  if (!servicesData[serviceKey] || serviceKey === '_meta') {
    return {
      publishable: false,
      status: STATUS.BLOCK,
      reason: `unknown-service: "${serviceKey}" not found in services.json`,
    };
  }

  const city = citiesData[citySlug];
  const count = artisanCount;

  // --- Existing / preserved SEO URL ---
  if (isPreserved) {
    if (count === 0) {
      return {
        publishable: false,     // Do NOT index a zero-artisan page
        status: STATUS.REVIEW,  // But do NOT auto-retire — flag for human decision
        reason: `zero-artisan-existing: preserved URL ${citySlug}/${serviceKey} has 0 artisans — human review required before noindex or redirect`,
      };
    }
    // count >= 1: preserve SEO equity
    return {
      publishable: true,
      status: STATUS.PRESERVE,
      reason: `existing-url: count=${count} >= 1; SEO equity preserved`,
    };
  }

  // --- New / future combination ---

  // City must be explicitly publishable
  if (!city.publishable) {
    return {
      publishable: false,
      status: STATUS.BLOCK,
      reason: `city-not-publishable: ${citySlug}.publishable is false or absent`,
    };
  }

  // Must meet new-page threshold
  if (count < NEW_THRESHOLD) {
    return {
      publishable: false,
      status: STATUS.BLOCK,
      reason: `below-new-threshold: count=${count} < NEW_THRESHOLD=${NEW_THRESHOLD} for new combination ${citySlug}/${serviceKey}`,
    };
  }

  return {
    publishable: true,
    status: STATUS.PUBLISH,
    reason: `new-combination: count=${count} >= NEW_THRESHOLD=${NEW_THRESHOLD} and city.publishable=true`,
  };
}

// ---------------------------------------------------------------------------
// Matrix runner
// ---------------------------------------------------------------------------

/**
 * Run the publishability policy across all city × service combinations.
 *
 * @param {Object}  citiesData   - Parsed cities.json
 * @param {Object}  servicesData - Parsed services.json
 * @param {Object}  countsData   - Parsed artisan-counts.json
 * @param {Set}     preservedSet - Set of "<citySlug>/<serviceKey>" strings for existing URLs
 * @returns {Array<{ citySlug, serviceKey, count, publishable, status, reason }>}
 */
function runMatrix(citiesData, servicesData, countsData, preservedSet) {
  const results = [];

  const citySlugs   = Object.keys(citiesData).filter(k => k !== '_meta');
  const serviceKeys = Object.keys(servicesData).filter(k => k !== '_meta');

  for (const citySlug of citySlugs) {
    for (const serviceKey of serviceKeys) {
      const count      = (countsData[citySlug] && countsData[citySlug][serviceKey]) || 0;
      const isPreserved = preservedSet.has(`${citySlug}/${serviceKey}`);
      const result = decide(citySlug, serviceKey, count, isPreserved, citiesData, servicesData);
      results.push({ citySlug, serviceKey, count, ...result });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Preserved URL builder
// ---------------------------------------------------------------------------

/**
 * Build the set of preserved city × service URL keys from the existing
 * generated HTML files in the repository root.
 *
 * Naming convention: `{canonicalRouteKey}-{citySlug}.html`
 * The canonicalRouteKey maps to a serviceKey via services.json.
 *
 * @param {Object} servicesData - Parsed services.json
 * @param {string[]} existingFiles - List of HTML filenames (without path)
 * @returns {Set<string>} Set of "citySlug/serviceKey" strings
 */
function buildPreservedSet(servicesData, existingFiles) {
  // Build reverse map: canonicalRouteKey → serviceKey
  const routeToKey = {};
  for (const [key, svc] of Object.entries(servicesData)) {
    if (key === '_meta') continue;
    const routeKey = svc.canonicalRouteKey || key;
    routeToKey[routeKey] = key;
  }

  // Sort route keys by length descending so longer prefixes (e.g. "climatisation")
  // are tried before shorter ones — prevents greedy mis-split on hyphenated city
  // slugs like "beni-mellal" or "el-jadida".
  const routeKeys = Object.keys(routeToKey).sort((a, b) => b.length - a.length);

  const preserved = new Set();

  for (const filename of existingFiles) {
    if (!filename.endsWith('.html')) continue;
    const base = filename.slice(0, -5); // strip .html
    let matched = false;
    for (const routeKey of routeKeys) {
      const prefix = routeKey + '-';
      if (base.startsWith(prefix)) {
        const citySlug   = base.slice(prefix.length);
        const serviceKey = routeToKey[routeKey];
        if (citySlug && serviceKey) {
          preserved.add(`${citySlug}/${serviceKey}`);
          matched = true;
          break;
        }
      }
    }
    // If no route key matched, the file is not a canonical service×city page — skip.
    void matched;
  }

  return preserved;
}

// ---------------------------------------------------------------------------
// Threshold simulation helper
// ---------------------------------------------------------------------------

/**
 * Simulate publishability for NEW combinations under a given threshold.
 * Does not affect existing/preserved URL logic.
 *
 * @param {Array}  matrixResults - Output of runMatrix()
 * @param {number} threshold     - Hypothetical NEW_THRESHOLD to simulate
 * @returns {{ publish: number, block: number, cells: Array }}
 */
function simulateThreshold(matrixResults, threshold) {
  let publish = 0, block = 0;
  const cells = [];

  for (const row of matrixResults) {
    if (row.status === STATUS.PRESERVE || row.status === STATUS.REVIEW) {
      // Existing URLs not affected by threshold simulation
      cells.push({ ...row, _sim_status: row.status });
      continue;
    }
    // New combination
    const wouldPublish = row.count >= threshold;
    if (wouldPublish) publish++; else block++;
    cells.push({ ...row, _sim_status: wouldPublish ? STATUS.PUBLISH : STATUS.BLOCK });
  }

  return { publish, block, cells };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  NEW_THRESHOLD,
  STATUS,
  decide,
  runMatrix,
  buildPreservedSet,
  simulateThreshold,
};
