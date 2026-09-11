/**
 * content-guard.js — FIXEO SEO V3 Product Truth Enforcement
 * ==========================================================
 * Runs at V3 generator build time. Throws a hard error (not a warning)
 * if any banned product-truth claim is found in generated output fields.
 *
 * Policy basis: Phase 0 Audit (2026-09-10) + Q2 + Q11 human decisions.
 *
 * MATCHING RULES
 * - Case-insensitive substring match on the full lowercased text.
 * - Exact phrase matching only — no broad regex patterns.
 * - Generic words ("disponible", "disponibilité", "qualifié") in isolation
 *   are NOT banned. Only the full prohibited claim is banned.
 * - Apostrophe normalisation: both ASCII ' (U+0027) and Unicode '
 *   (U+2019) are normalised before matching so "dans l'heure" and
 *   "dans l'heure" are equivalent.
 *
 * EXTENDING
 * - Add new terms to BANNED_TERMS only. Do not change the check() logic.
 * - Each entry is a lowercase string. The scanner lowercases input before
 *   comparing, so entries must themselves be lowercase.
 *
 * USAGE
 *   const { check, BANNED_TERMS } = require('./content-guard');
 *   check(myText, 'meta_desc', 'plombier-casablanca');  // throws on violation
 *
 * @module content-guard
 */

'use strict';

// ---------------------------------------------------------------------------
// Banned terms — canonical lowercase, apostrophes normalised to ASCII '
// ---------------------------------------------------------------------------
const BANNED_TERMS = [
  // Artisan credential claims
  "artisan vérifié",
  "artisans vérifiés",
  "artisan qualifié",
  "artisan certifié",

  // Profession-specific credential claims
  "électricien certifié",
  "électricien qualifié",
  "plombier qualifié",
  "serrurier qualifié",

  // Immediate / guaranteed availability claims
  "disponible immédiatement",
  "disponible maintenant",
  "dans l'heure",          // ASCII apostrophe form stored here; normaliser handles Unicode form

  // Round-the-clock availability claims
  "24h/7",
  "24h/24",
  "7j/7",

  // Free service / cost claims
  "devis gratuit",
  "intervention gratuite",

  // Instant connection claims
  "connecte instantanément",
  "mise en relation instantanée",

  // Guaranteed price claims
  "tarif garanti",
  "prix fixe",
  "prix garanti",

  // Guaranteed service level claims
  "disponibilité garantie",
  "réponse garantie",
  "intervention garantie",
];

// Freeze the list so generators cannot mutate it accidentally at runtime.
Object.freeze(BANNED_TERMS);

// ---------------------------------------------------------------------------
// Normalise text before comparison
// ---------------------------------------------------------------------------
/**
 * Normalise apostrophes and lowercase the input for consistent matching.
 * Converts Unicode right single quotation mark (U+2019) → ASCII apostrophe.
 * @param {string} s
 * @returns {string}
 */
function _normalise(s) {
  return String(s == null ? '' : s)
    .replace(/\u2019/g, "'")   // RIGHT SINGLE QUOTATION MARK → ASCII apostrophe
    .replace(/\u2018/g, "'")   // LEFT  SINGLE QUOTATION MARK → ASCII apostrophe
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan a text value for banned product-truth claims.
 *
 * @param {string} text    - The text to scan (title, description, body, etc.)
 * @param {string} field   - Human-readable field name for error messages.
 * @param {string} pageId  - Page identifier for error messages (e.g. "plombier-casablanca").
 * @throws {Error} Hard error if any banned term is found.
 */
function check(text, field, pageId) {
  const normalised = _normalise(text);
  for (const term of BANNED_TERMS) {
    // term is already lowercase with normalised apostrophes
    if (normalised.includes(term)) {
      throw new Error(
        `[content-guard] BANNED TERM "${term}" found in field "${field}" of page "${pageId}". ` +
        `Context: "...${_excerpt(normalised, term)}..."`
      );
    }
  }
}

/**
 * Scan multiple fields at once. Throws on the first violation found.
 *
 * @param {Object} fields  - { fieldName: textValue } map.
 * @param {string} pageId  - Page identifier for error messages.
 * @throws {Error} Hard error if any banned term is found in any field.
 */
function checkFields(fields, pageId) {
  for (const [fieldName, value] of Object.entries(fields)) {
    if (typeof value === 'string') {
      check(value, fieldName, pageId);
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Return a short excerpt of text centred around the matched term.
 * @param {string} text
 * @param {string} term
 * @returns {string}
 */
function _excerpt(text, term) {
  const idx = text.indexOf(term);
  if (idx === -1) return text.slice(0, 80);
  const start = Math.max(0, idx - 30);
  const end   = Math.min(text.length, idx + term.length + 30);
  return text.slice(start, end);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = { check, checkFields, BANNED_TERMS };
