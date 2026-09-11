'use strict';
/**
 * v3-legacy-removal.js — V3 Legacy Runtime Asset Removal
 * =======================================================
 * Version: v1
 *
 * Provides deterministic removal of the fixeo-local-flagship-v1.js <script>
 * tag from V3 generator output.
 *
 * WHY THIS EXISTS:
 *   fixeo-local-flagship-v1.js is in CORE_JS (page-template.js), because it
 *   serves the runtime artisan grid for all LEGACY SEO pages. V3 generators
 *   server-render artisan cards (or omit them entirely, for hubs) and must
 *   NOT have that content overwritten at runtime by this legacy script.
 *
 *   Both service-city-v3.js and service-hub-v3.js previously duplicated the
 *   same removal logic, with a subtle difference in leading whitespace handling.
 *   This module provides a single canonical implementation.
 *
 * STRATEGY:
 *   1. Find the CORE_JS entry for fixeo-local-flagship-v1.js
 *   2. Derive the exact <script> tag string using page-template's own data
 *      (version-safe: any bump to CORE_JS automatically reflected here)
 *   3. The page-template buildScriptTags() emits:
 *        "  <script src="..." defer></script>"  (2 leading spaces + newline)
 *      We match this exactly using a line-start pattern that handles whitespace.
 *   4. Remove by exact replacement — no broad regex, no string surgery
 *   5. Fail loudly if the script cannot be identified in CORE_JS (tests catch this)
 *
 * GUARANTEE:
 *   - Only removes the exact tag derived from CORE_JS
 *   - Does not touch any other script tag
 *   - Does not modify CSS links (fixeo-local-flagship-v1.css is intentionally kept)
 *   - Returns explicit { removed: boolean, warning: string|null }
 *   - If the tag is absent from HTML (already removed, or version changed),
 *     removed=false + warning is set — caller decides how to handle
 *
 * API:
 *   const { removeFlagshipScript, FLAGSHIP_SCRIPT_TAG } = require('./v3-legacy-removal');
 *
 *   removeFlagshipScript(html)
 *   → { html: string, removed: boolean, warning: string|null }
 *
 *   FLAGSHIP_SCRIPT_TAG: string|null  — the exact tag string (for tests)
 *
 * FILE: seo/generators/shared/v3-legacy-removal.js
 */

const { CORE_JS } = require('./page-template');

// ── Derive the exact script tag from CORE_JS ──────────────────────────────
//
// page-template's buildScriptTags() uses this template per entry:
//   defer:  `  <script src="${esc(s.src)}" defer></script>`
//   sync:   `  <script src="${esc(s.src)}"></script>`
// (2 leading spaces, as part of the HTML indentation in the <body> block)
//
// We MUST replicate the leading spaces to match the actual emitted HTML.
// The previous hub implementation used no leading spaces, which caused
// a substring-match removal that left behind orphaned whitespace.

const _FLAGSHIP_ENTRY = CORE_JS.find(s =>
  s && s.src && s.src.includes('/js/fixeo-local-flagship-v1.js')
);

/**
 * The exact <script> tag string that page-template.js emits for
 * fixeo-local-flagship-v1.js. null if the entry is not found in CORE_JS.
 *
 * Shape matches buildScriptTags() exactly (2 leading spaces).
 */
const FLAGSHIP_SCRIPT_TAG = _FLAGSHIP_ENTRY
  ? (_FLAGSHIP_ENTRY.defer
      ? `  <script src="${_FLAGSHIP_ENTRY.src}" defer></script>`
      : `  <script src="${_FLAGSHIP_ENTRY.src}"></script>`)
  : null;

// ── Removal function ──────────────────────────────────────────────────────

/**
 * Remove the fixeo-local-flagship-v1.js <script> tag from V3 page HTML.
 *
 * Uses exact string replacement of the tag derived from CORE_JS.
 * Removes the trailing newline as well to avoid leaving blank lines.
 *
 * @param {string} html - Full HTML string from buildPage()
 * @returns {{ html: string, removed: boolean, warning: string|null }}
 */
function removeFlagshipScript(html) {
  if (!FLAGSHIP_SCRIPT_TAG) {
    return {
      html,
      removed: false,
      warning: 'fixeo-local-flagship-v1.js not found in CORE_JS — cannot remove (version changed?)',
    };
  }

  if (!html.includes(FLAGSHIP_SCRIPT_TAG)) {
    return {
      html,
      removed: false,
      warning: 'flagship script tag not found in HTML — may already be absent or CORE_JS version changed',
    };
  }

  // Remove the tag. Also consume the trailing newline to avoid blank line.
  const tagWithNewline = FLAGSHIP_SCRIPT_TAG + '\n';
  const cleaned = html.includes(tagWithNewline)
    ? html.replace(tagWithNewline, '')
    : html.replace(FLAGSHIP_SCRIPT_TAG, '');

  return { html: cleaned, removed: true, warning: null };
}

// ── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  removeFlagshipScript,
  FLAGSHIP_SCRIPT_TAG,
};
