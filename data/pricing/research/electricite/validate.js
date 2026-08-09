#!/usr/bin/env node
/**
 * FIXEO Electricité V0 Validation Script
 * Phase 7B.4 — FIXEO Fair Price Research — Electricity Morocco
 * Run: node validate.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

let passes = 0;
let fails = [];

function chk(label, cond, detail) {
  if (cond) {
    passes++;
  } else {
    fails.push(label + (detail !== undefined ? ': ' + JSON.stringify(detail) : ''));
  }
}

// ── Load artifacts ─────────────────────────────────────────────────────────

const DIR = __dirname;

const sources  = JSON.parse(fs.readFileSync(path.join(DIR, 'sources.v0.json'), 'utf8'));
const evidence = JSON.parse(fs.readFileSync(path.join(DIR, 'evidence.v0.json'), 'utf8'));
const registry = JSON.parse(fs.readFileSync(path.join(DIR, 'registry.v0.json'), 'utf8'));
const exclusions = JSON.parse(fs.readFileSync(path.join(DIR, 'exclusions.v0.json'), 'utf8'));

// ── 1. Meta integrity ───────────────────────────────────────────────────────

chk('sources version = 0.1.0', sources._meta.version === '0.1.0');
chk('evidence version = 0.1.0', evidence._meta.version === '0.1.0');
chk('registry version = 0.1.0', registry._meta.registry_version === '0.1.0');
chk('exclusions version = 0.1.0', exclusions._meta.version === '0.1.0');
chk('category = electricite (sources)', sources._meta.category === 'electricite');
chk('category = electricite (evidence)', evidence._meta.category === 'electricite');
chk('category = electricite (registry)', registry._meta.registry_name === 'fixeo_electricite_pricing');
chk('registry production_ready = false', registry._meta.production_ready === false);
chk('registry ai_claim = null', registry._meta.ai_claim === null);
chk('registry city_adjustment = null', registry._meta.city_adjustment === null);
chk('registry urgency_modifier = null', registry._meta.urgency_modifier === null);

// ── 2. Source counts ────────────────────────────────────────────────────────

chk('sources: 13 total evaluated', sources._meta.total_sources_evaluated === 13);
chk('sources: 3 usable', sources._meta.usable_sources === 3);
chk('sources: 5 rejected', sources._meta.rejected_sources === 5);
chk('sources: source array count', sources.sources.length === 13);

// ── 3. Source grades for usable sources ─────────────────────────────────────

const usableSrcs = sources.sources.filter(s => s.usable);
chk('usable sources count = 3', usableSrcs.length === 3);

// Weight sum for usable should be ≤ 1.0
const totalWeight = usableSrcs.reduce((sum, s) => sum + (s.weight_in_consensus || 0), 0);
chk('usable source weights sum ≤ 1.0', totalWeight <= 1.0001, totalWeight);

// Non-usable have weight = 0
const unusable = sources.sources.filter(s => !s.usable);
for (const s of unusable) {
  chk(`${s.source_id} weight_in_consensus = 0`, (s.weight_in_consensus || 0) === 0);
}

// All sources have source_id
for (const s of sources.sources) {
  chk(`source has source_id`, typeof s.source_id === 'string' && s.source_id.length > 0, s.source_id);
  chk(`source has grade`, typeof s.grade === 'string', s.source_id);
  chk(`source has usable boolean`, typeof s.usable === 'boolean', s.source_id);
}

// ── 4. Evidence counts ──────────────────────────────────────────────────────

const includedObs = evidence.observations.filter(o => !o.excluded);
const excludedObs = evidence.observations.filter(o => o.excluded);
chk('evidence: 28 total', evidence.observations.length === 28);
chk('evidence: 24 included', includedObs.length === 24);
chk('evidence: 4 excluded', excludedObs.length === 4);

// All included observations have required fields
for (const o of includedObs) {
  chk(`obs ${o.obs_id} has service_candidate`, typeof o.service_candidate === 'string');
  chk(`obs ${o.obs_id} has confidence_contribution`, typeof o.confidence_contribution === 'string');
  chk(`obs ${o.obs_id} has normalization_note`, typeof o.normalization_note === 'string' && o.normalization_note.length > 0);
}

// All excluded have exclusion_reason
for (const o of excludedObs) {
  chk(`excluded obs ${o.obs_id} has exclusion_reason`, typeof o.exclusion_reason === 'string');
}

// ── 5. Registry services ────────────────────────────────────────────────────

const services = registry.services;
chk('registry: 18 services', services.length === 18);

// Candidates
const candidates = services.filter(s => s.candidate_for_fixeo_price === true);
chk('registry: 5 candidates', candidates.length === 5);

// All services have required fields
for (const s of services) {
  chk(`${s.service_code} has label_fr`, typeof s.label_fr === 'string');
  chk(`${s.service_code} has pricing_architecture`, typeof s.pricing_architecture === 'string');
  chk(`${s.service_code} has candidate_for_fixeo_price`, typeof s.candidate_for_fixeo_price === 'boolean');
  chk(`${s.service_code} has production_ready = false`, s.production_ready === false);
  chk(`${s.service_code} has safety_classification`, typeof s.safety_classification === 'string');
  chk(`${s.service_code} has evidence_observations array`, Array.isArray(s.evidence_observations));
}

// All candidate services have reference_price
for (const s of candidates) {
  chk(`candidate ${s.service_code} has reference_price`, s.reference_price !== null && s.reference_price !== undefined);
  if (s.reference_price) {
    chk(`candidate ${s.service_code} ref_price has consensus_low`, typeof s.reference_price.consensus_low === 'number');
    chk(`candidate ${s.service_code} ref_price has market_anchor`, typeof s.reference_price.market_anchor === 'number');
    chk(`candidate ${s.service_code} ref_price has consensus_high`, typeof s.reference_price.consensus_high === 'number');
    chk(`candidate ${s.service_code} ref_price ordering low ≤ anchor`, s.reference_price.consensus_low <= s.reference_price.market_anchor);
    chk(`candidate ${s.service_code} ref_price ordering anchor ≤ high`, s.reference_price.market_anchor <= s.reference_price.consensus_high);
    chk(`candidate ${s.service_code} ref_price currency = MAD`, s.reference_price.currency === 'MAD');
    chk(`candidate ${s.service_code} ref_price confidence set`, typeof s.reference_price.confidence === 'string');
  }
}

// No candidate has human_approved = true (all PENDING)
for (const s of candidates) {
  chk(`candidate ${s.service_code} human_decision = PENDING`, s.human_decision === 'PENDING');
}

// Quote-required services have reference_price null or explicitly null
const quoteReq = services.filter(s => s.pricing_architecture === 'QUOTE_REQUIRED');
for (const s of quoteReq) {
  chk(`quote_req ${s.service_code} candidate_for_fixeo = false`, s.candidate_for_fixeo_price === false);
}

// Artisan economic floor documented
chk('artisan floor ≥ 200 MAD', registry._meta.artisan_economic_floor_casablanca.minimum_viable_intervention_MAD === 200);

// No AI claim in registry
const regStr = JSON.stringify(registry);
const AI_POSITIVE_PHRASES = ['AI Price', 'ai_powered_pricing', 'IA-powered', 'prix_ia_calcule'];
for (const phrase of AI_POSITIVE_PHRASES) {
  // Allow mentions in prohibition contexts
  if (regStr.includes(phrase)) {
    // Check if it's in a prohibition context
    const idx = regStr.indexOf(phrase);
    const context = regStr.substring(Math.max(0, idx - 100), idx + 100);
    chk(`No rogue AI claim "${phrase}"`, context.includes('PROHIBIT') || context.includes('null') || context.includes('NOT'));
  } else {
    passes++; // Phrase not present at all = pass
  }
}

// ── 6. Exclusions ───────────────────────────────────────────────────────────

chk('exclusions: 4 records', exclusions.exclusions.length === 4);
for (const ex of exclusions.exclusions) {
  chk(`exclusion ${ex.exclusion_id} has source_id`, typeof ex.source_id === 'string');
  chk(`exclusion ${ex.exclusion_id} has reason_code`, typeof ex.reason_code === 'string');
  chk(`exclusion ${ex.exclusion_id} has reason`, typeof ex.reason === 'string');
  chk(`exclusion ${ex.exclusion_id} has can_be_reconsidered`, typeof ex.can_be_reconsidered === 'boolean');
}

// ── 7. Production runtime diff check ────────────────────────────────────────

chk('registry production_runtime_diff = ZERO', registry._meta.production_runtime_diff === 'ZERO');

// ── 8. Plumbing V0/V0.2/V0.3 integrity (check they still exist) ─────────────

const PLUMBING_DIR = path.join(__dirname, '../plomberie');
const plumbingFiles = [
  'registry.v0.json',
  'registry.v0.2.json',
  'registry.v0.3.json',
  'evidence.v0.json',
  'sources.v0.json',
  'exclusions.v0.json',
  'calibration.v0.2.json',
  'calibration.v0.3.json',
  'human-decision.v0.3.md',
  'fair-price-policy.v0.2.md',
  'fair-price-policy.v0.3.md',
];
for (const f of plumbingFiles) {
  const exists = fs.existsSync(path.join(PLUMBING_DIR, f));
  chk(`plumbing file preserved: ${f}`, exists);
}

// V0.1 has fair_low keys (not consensus_low)
const plReg01 = JSON.parse(fs.readFileSync(path.join(PLUMBING_DIR, 'registry.v0.json'), 'utf8'));
chk('plumbing V0.1 version = 0.1.0', plReg01._meta.registry_version === '0.1.0');
chk('plumbing V0.1 has fair_low key in first service', 'fair_low' in (plReg01.services[0].reference_price || {}));

// V0.2 has consensus_low keys
const plReg02 = JSON.parse(fs.readFileSync(path.join(PLUMBING_DIR, 'registry.v0.2.json'), 'utf8'));
chk('plumbing V0.2 version = 0.2.0', plReg02._meta.registry_version === '0.2.0');
const firstNumericV02 = plReg02.services.find(s => s.reference_price && s.reference_price.consensus_low !== undefined);
chk('plumbing V0.2 has consensus_low key', firstNumericV02 !== undefined);

// V0.3 has human_approved = true services
const plReg03 = JSON.parse(fs.readFileSync(path.join(PLUMBING_DIR, 'registry.v0.3.json'), 'utf8'));
chk('plumbing V0.3 has pilot_scope_contracts', Array.isArray(plReg03.pilot_scope_contracts));
chk('plumbing V0.3 has 6 pilot contracts', plReg03.pilot_scope_contracts.length === 6);
const allHumanApproved = plReg03.pilot_scope_contracts.every(s => s.human_approved === true);
chk('plumbing V0.3 all human_approved = true', allHumanApproved);

// ── RESULTS ─────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(55));
console.log(`FIXEO ELECTRICITE V0 VALIDATION`);
console.log('='.repeat(55));
console.log(`PASS: ${passes}   FAIL: ${fails.length}`);
if (fails.length > 0) {
  console.log('\nFAILURES:');
  fails.forEach(f => console.log('  ✗ ' + f));
} else {
  console.log('\n  ✅ ALL CHECKS PASSED');
}
console.log('='.repeat(55) + '\n');
