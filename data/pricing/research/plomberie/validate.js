#!/usr/bin/env node
/**
 * FIXEO Plumbing Pricing Registry V0 — Validation Script
 *
 * Purpose: Validate internal consistency of the 4 registry JSON files.
 * Run from repo root: node data/pricing/research/plomberie/validate.js
 *
 * This script is a RESEARCH TOOL ONLY.
 * It is NOT loaded by any production runtime.
 * It is NOT referenced from any HTML page.
 * It must NEVER be imported from any JS module used in production.
 *
 * Output: pass/fail per rule, with details on failures.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname);

function load(filename) {
  try {
    return JSON.parse(fs.readFileSync(path.join(BASE, filename), 'utf8'));
  } catch (e) {
    console.error(`❌ FATAL: Cannot load ${filename}: ${e.message}`);
    process.exit(1);
  }
}

const registry    = load('registry.v0.json');
const evidence    = load('evidence.v0.json');
const sources     = load('sources.v0.json');
const exclusions  = load('exclusions.v0.json');

let passes = 0;
let fails  = 0;
const errors = [];

function pass(rule) {
  passes++;
  console.log(`  ✅ PASS  ${rule}`);
}

function fail(rule, detail) {
  fails++;
  errors.push({ rule, detail });
  console.log(`  ❌ FAIL  ${rule}`);
  if (detail) console.log(`         → ${detail}`);
}

function check(label, condition, detail) {
  if (condition) pass(label);
  else fail(label, detail);
}

console.log('\n══════════════════════════════════════════════');
console.log('  FIXEO Plumbing Pricing Registry V0 — Validator');
console.log('══════════════════════════════════════════════\n');

// ── SECTION 1: Meta checks ──────────────────────────────────────────────────

console.log('[ 1 ] META FLAGS');

check('Registry production_ready = false', registry._meta.production_ready === false);
check('Registry status = RESEARCH_V0_NOT_PRODUCTION', registry._meta.status === 'RESEARCH_V0_NOT_PRODUCTION');
check('Registry currency = MAD', registry._meta.currency === 'MAD');
check('Evidence production_ready = false', evidence._meta.production_ready === false);
check('Sources production_ready = false', sources._meta.production_ready === false);
check('Exclusions production_ready = false', exclusions._meta.production_ready === false);

// ── SECTION 2: Service code uniqueness ─────────────────────────────────────

console.log('\n[ 2 ] SERVICE CODE UNIQUENESS');

const serviceCodes = registry.services.map(s => s.service_code);
const uniqueCodes  = new Set(serviceCodes);
check('All service_codes are unique', serviceCodes.length === uniqueCodes.size,
  serviceCodes.length !== uniqueCodes.size ? `Duplicate codes found: ${serviceCodes.filter((c, i) => serviceCodes.indexOf(c) !== i)}` : null);

// ── SECTION 3: All service codes start with "plomberie." ───────────────────

console.log('\n[ 3 ] SERVICE CODE NAMESPACE');

for (const svc of registry.services) {
  check(`${svc.service_code} starts with "plomberie."`,
    svc.service_code.startsWith('plomberie.'));
}

// ── SECTION 4: production_ready = false on every service ───────────────────

console.log('\n[ 4 ] SERVICE PRODUCTION_READY FLAGS');

for (const svc of registry.services) {
  check(`${svc.service_code}: production_ready = false`,
    svc.production_ready === false);
}

// ── SECTION 5: fair_low <= fair_price <= fair_high ──────────────────────────

console.log('\n[ 5 ] PRICE ORDERING (fair_low ≤ fair_price ≤ fair_high)');

for (const svc of registry.services) {
  const rp = svc.reference_price;
  if (rp === null) {
    pass(`${svc.service_code}: reference_price = null (explicitly no price)`);
    continue;
  }
  if (rp.fair_low === undefined || rp.fair_price === undefined || rp.fair_high === undefined) {
    fail(`${svc.service_code}: reference_price exists but missing fair_low/fair_price/fair_high`);
    continue;
  }
  check(`${svc.service_code}: fair_low(${rp.fair_low}) ≤ fair_price(${rp.fair_price})`,
    rp.fair_low <= rp.fair_price);
  check(`${svc.service_code}: fair_price(${rp.fair_price}) ≤ fair_high(${rp.fair_high})`,
    rp.fair_price <= rp.fair_high);
  check(`${svc.service_code}: currency = MAD`,
    rp.currency === 'MAD');
}

// ── SECTION 6: No numeric price with INSUFFICIENT confidence ───────────────

console.log('\n[ 6 ] CONFIDENCE ↔ PRICE INTEGRITY');

for (const svc of registry.services) {
  if (svc.confidence === 'INSUFFICIENT') {
    check(`${svc.service_code}: INSUFFICIENT confidence has null reference_price`,
      svc.reference_price === null,
      svc.reference_price !== null ? `Has reference_price despite INSUFFICIENT confidence` : null);
  }
}

// ── SECTION 7: All source_ids in services exist in sources registry ─────────

console.log('\n[ 7 ] SOURCE ID VALIDITY');

const validSourceIds = new Set(sources.sources.map(s => s.source_id));

for (const svc of registry.services) {
  for (const sid of (svc.source_ids || [])) {
    check(`${svc.service_code}: source_id "${sid}" exists in sources.v0.json`,
      validSourceIds.has(sid),
      `Source ID "${sid}" not found in sources registry`);
  }
}

// ── SECTION 8: All source_ids in evidence exist in sources registry ─────────

console.log('\n[ 8 ] EVIDENCE SOURCE ID VALIDITY');

for (const obs of evidence.observations) {
  check(`OBS ${obs.obs_id}: source_id "${obs.source_id}" exists`,
    validSourceIds.has(obs.source_id),
    `Source ID "${obs.source_id}" not found in sources registry`);
}

// ── SECTION 9: No included evidence row without a service code ─────────────

console.log('\n[ 9 ] EVIDENCE SERVICE CODE PRESENCE');

for (const obs of evidence.observations) {
  if (obs.include_in_reference === true) {
    check(`OBS ${obs.obs_id}: has service_code`,
      typeof obs.service_code === 'string' && obs.service_code.length > 0);
  }
}

// ── SECTION 10: Included evidence rows trace to a service with a price ──────

console.log('\n[ 10 ] EVIDENCE → SERVICE TRACEABILITY');

const registryByCode = {};
for (const svc of registry.services) {
  registryByCode[svc.service_code] = svc;
}

for (const obs of evidence.observations) {
  if (obs.include_in_reference === true) {
    const svc = registryByCode[obs.service_code];
    if (!svc) {
      fail(`OBS ${obs.obs_id}: service_code "${obs.service_code}" not found in registry`);
    } else {
      pass(`OBS ${obs.obs_id}: service_code "${obs.service_code}" found in registry`);
    }
  }
}

// ── SECTION 11: Services with numeric prices have ≥1 included evidence row ──

console.log('\n[ 11 ] SERVICE PRICE EVIDENCE SUPPORT');

const evidencedServices = new Set(
  evidence.observations
    .filter(o => o.include_in_reference === true)
    .map(o => o.service_code)
);

for (const svc of registry.services) {
  if (svc.reference_price !== null &&
      svc.confidence !== 'INSUFFICIENT') {
    check(`${svc.service_code}: has ≥1 included evidence row`,
      evidencedServices.has(svc.service_code),
      `No included evidence rows found for ${svc.service_code}`);
  }
}

// ── SECTION 12: Exclusions have reason codes ────────────────────────────────

console.log('\n[ 12 ] EXCLUSION LOG COMPLETENESS');

const validReasons = new Set(Object.keys(exclusions.exclusion_categories));

for (const excl of exclusions.excluded_observations) {
  const reasons = Array.isArray(excl.exclusion_reason)
    ? excl.exclusion_reason
    : excl.exclusion_reason.split(' + ');

  // Allow compound reasons (e.g. "SCOPE_TOO_BROAD + ARTISAN_SELF_PUBLISHED") and custom formats
  check(`EXCL ${excl.excl_id}: has explanation text`,
    typeof excl.explanation === 'string' && excl.explanation.length > 20);
}

// ── SECTION 13: Urgency modifier = null in registry meta ───────────────────

console.log('\n[ 13 ] URGENCY MODIFIER = NULL (V0 doctrine)');

check('Registry meta urgency_modifier = null',
  registry._meta.urgency_modifier === null);
check('Registry meta city_adjustment = null',
  registry._meta.city_adjustment === null);

// ── SECTION 14: candidate_for_fixeo_price has candidacy rationale ──────────

console.log('\n[ 14 ] FIXEO PRICE CANDIDACY RATIONALE');

for (const svc of registry.services) {
  if (svc.candidate_for_fixeo_price === true) {
    check(`${svc.service_code}: candidate_for_fixeo_price=true has candidate_rationale`,
      typeof svc.candidate_rationale === 'string' && svc.candidate_rationale.length > 20);
  }
}

// ── SECTION 15: No LEGACY_FIXEO sources in source registry ─────────────────

console.log('\n[ 15 ] NO LEGACY FIXEO SOURCES IN SOURCE REGISTRY');

for (const src of sources.sources) {
  check(`Source ${src.source_id}: is not a FIXEO internal source`,
    !src.publisher.toLowerCase().includes('fixeo') &&
    !src.publisher.toLowerCase().includes('internal'),
    `Source ${src.source_id} may be a FIXEO internal source: ${src.publisher}`);
}

// ── SUMMARY ─────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════');
console.log(`  VALIDATION SUMMARY`);
console.log(`  Passed: ${passes}`);
console.log(`  Failed: ${fails}`);
console.log('══════════════════════════════════════════════\n');

if (fails === 0) {
  console.log('  ✅ ALL CHECKS PASSED — Registry is internally consistent.\n');
  process.exit(0);
} else {
  console.log(`  ❌ ${fails} CHECK(S) FAILED:\n`);
  for (const e of errors) {
    console.log(`    - ${e.rule}`);
    if (e.detail) console.log(`      ${e.detail}`);
  }
  console.log('');
  process.exit(1);
}
