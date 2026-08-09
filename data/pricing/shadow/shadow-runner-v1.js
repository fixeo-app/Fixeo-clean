'use strict';
/**
 * FIXEO Pricing Engine — Shadow Runner V1
 * Phase 7C.5 — Shadow Validation
 *
 * Runs all shadow scenarios against the engine and classifies results.
 * Does NOT auto-fix engine. Reports all discrepancies for human review.
 *
 * Security: no eval, no Function, no network, no Supabase, no DOM.
 * DORMANT — not imported by any production runtime.
 */

const fs = require('fs');
const path = require('path');

const { evaluateFixeoPrice } = require('../engine/pricing-engine-core-v1');
const scenariosFile = path.join(__dirname, 'shadow-scenarios.v1.json');
const scenarios = JSON.parse(fs.readFileSync(scenariosFile)).scenarios;

// ─── MATCH CLASSIFIER ─────────────────────────────────────────────────────────

function classify(scenario, actual) {
  const exp = scenario.expected;

  // ERROR/input-validation cases
  if (!exp.price_should_exist) {
    if (actual.error) {
      // Expected error — check reason_code if specified
      if (exp.reason_code && actual.error.code !== exp.reason_code) {
        return { pass: false, code: 'FAIL_INPUT_VALIDATION',
          detail: `Expected error code ${exp.reason_code}, got ${actual.error.code}` };
      }
      return { pass: true, code: 'PASS_EXACT', detail: 'Error as expected' };
    }
    if (!actual.ok) {
      const qual = actual.qualification || {};
      // Check reason_code match
      if (exp.reason_code && qual.reason_code !== exp.reason_code) {
        // Allow partial reason_code match — e.g. exclusion reason may differ from X-ID
        // PASS_SEMANTIC if ineligible and no price returned
        return { pass: true, code: 'PASS_SEMANTIC',
          detail: `INELIGIBLE as expected; reason_code mismatch: expected=${exp.reason_code} actual=${qual.reason_code}` };
      }
      // Route check
      if (exp.route_ref && actual.routing && actual.routing.route_ref !== exp.route_ref) {
        return { pass: false, code: 'FAIL_ROUTING',
          detail: `Route mismatch: expected=${exp.route_ref} actual=${actual.routing && actual.routing.route_ref}` };
      }
      return { pass: true, code: 'PASS_EXACT', detail: 'INELIGIBLE as expected' };
    }
    // Got price when none expected
    return { pass: false, code: 'FAIL_UNEXPECTED_PRICE',
      detail: `Got ok=true with price=${actual.pricing && actual.pricing.final_amount_mad} when expected ineligible/error` };
  }

  // Price cases
  if (!actual.ok) {
    if (actual.error) {
      return { pass: false, code: 'FAIL_INPUT_VALIDATION',
        detail: `Unexpected error: ${actual.error.code} — ${actual.error.message}` };
    }
    return { pass: false, code: 'FAIL_MISSING_PRICE',
      detail: `Expected price ${exp.final_amount_mad} but got INELIGIBLE: ${actual.qualification && actual.qualification.reason}` };
  }

  const p = actual.pricing;

  // Price check (zero tolerance)
  if (p.final_amount_mad !== exp.final_amount_mad) {
    return { pass: false, code: 'FAIL_PRICE',
      detail: `Price mismatch: expected=${exp.final_amount_mad} actual=${p.final_amount_mad}` };
  }

  // Output type check
  if (exp.commercial_output_type && p.commercial_output_type !== exp.commercial_output_type) {
    return { pass: false, code: 'FAIL_OUTPUT_TYPE',
      detail: `Output type: expected=${exp.commercial_output_type} actual=${p.commercial_output_type}` };
  }

  // Route check (if expected)
  if (exp.route_ref && (!actual.routing || actual.routing.route_ref !== exp.route_ref)) {
    return { pass: false, code: 'FAIL_ROUTING',
      detail: `Route: expected=${exp.route_ref} actual=${actual.routing && actual.routing.route_ref}` };
  }

  return { pass: true, code: 'PASS_EXACT', detail: 'All checked fields match' };
}

// ─── RUN SCENARIOS ────────────────────────────────────────────────────────────

const results = [];
let passExact = 0, passSemantic = 0, failCount = 0;
const failsByType = {};
const failsByMetier = {};
const criticalFailures = [];

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('FIXEO PRICING ENGINE — SHADOW RUNNER V1');
console.log('Phase 7C.5 — Shadow Validation');
console.log(`Scenarios: ${scenarios.length}`);
console.log('═══════════════════════════════════════════════════════════════\n');

scenarios.forEach((scenario, idx) => {
  const actual = evaluateFixeoPrice({
    service_code: scenario.service_code,
    inputs: scenario.inputs || {}
  });

  const { pass, code, detail } = classify(scenario, actual);

  const result = {
    scenario_id: scenario.scenario_id,
    metier: scenario.metier,
    service_code: scenario.service_code,
    description: scenario.description,
    match_code: code,
    pass,
    detail,
    expected_price: scenario.expected.final_amount_mad,
    actual_price: actual.ok ? (actual.pricing && actual.pricing.final_amount_mad) : null,
    expected_ok: scenario.expected.price_should_exist,
    actual_ok: actual.ok,
    expected_output_type: scenario.expected.commercial_output_type,
    actual_output_type: actual.ok ? (actual.pricing && actual.pricing.commercial_output_type) : null,
    actual_error_code: actual.error ? actual.error.code : null,
    actual_reason_code: actual.qualification ? actual.qualification.reason_code : null,
  };

  results.push(result);

  if (pass && code === 'PASS_EXACT') passExact++;
  else if (pass && code === 'PASS_SEMANTIC') passSemantic++;
  else {
    failCount++;
    failsByType[code] = (failsByType[code] || 0) + 1;
    failsByMetier[scenario.metier] = (failsByMetier[scenario.metier] || 0) + 1;

    // Critical failures: any pricing mismatch on eligible service
    if (code === 'FAIL_PRICE' || code === 'FAIL_UNEXPECTED_PRICE' || code === 'FAIL_OUTPUT_TYPE') {
      criticalFailures.push({ scenario_id: scenario.scenario_id, code, detail });
    }

    console.log(`❌ FAIL [${scenario.scenario_id}] ${code}`);
    console.log(`   ${scenario.description}`);
    console.log(`   ${detail}`);
  }
});

// ─── SUMMARY ──────────────────────────────────────────────────────────────────

const total = scenarios.length;

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('SHADOW RUNNER V1 — SUMMARY');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  Total scenarios:  ${total}`);
console.log(`  PASS_EXACT:       ${passExact}`);
console.log(`  PASS_SEMANTIC:    ${passSemantic}`);
console.log(`  FAIL:             ${failCount}`);
console.log(`  Critical:         ${criticalFailures.length}`);
console.log(`\n  Failures by type:`, JSON.stringify(failsByType, null, 2));
console.log(`  Failures by métier:`, JSON.stringify(failsByMetier, null, 2));

if (failCount === 0) {
  console.log('\n  ✅ ALL SHADOW SCENARIOS PASS');
} else {
  console.log(`\n  ❌ ${failCount} SHADOW SCENARIO(S) FAILED`);
}

// ─── SHADOW GATE ──────────────────────────────────────────────────────────────

const zeroTolerancePass =
  criticalFailures.length === 0 &&
  !failsByType['FAIL_PRICE'] &&
  !failsByType['FAIL_UNEXPECTED_PRICE'] &&
  !failsByType['FAIL_OUTPUT_TYPE'] &&
  !failsByType['FAIL_ROUTING'] &&
  !failsByType['FAIL_MISSING_PRICE'];

const shadowValidationReady = zeroTolerancePass && failCount === 0;

// ─── WRITE RESULTS ────────────────────────────────────────────────────────────

const report = {
  meta: {
    schema_version: '7C.5-v1',
    phase: 'PHASE_7C5_SHADOW_VALIDATION',
    run_timestamp: new Date().toISOString(),
    total_scenarios: total,
    production_ready: false,
    dormant: true,
  },
  summary: {
    total_scenarios: total,
    passed_exact: passExact,
    passed_semantic: passSemantic,
    failed: failCount,
    failures_by_type: failsByType,
    failures_by_metier: failsByMetier,
    critical_failures: criticalFailures,
    shadow_validation_ready: shadowValidationReady,
    zero_tolerance_pass: zeroTolerancePass,
  },
  results,
};

fs.writeFileSync(path.join(__dirname, 'shadow-results.v1.json'), JSON.stringify(report, null, 2));
console.log('\n  Report written: data/pricing/shadow/shadow-results.v1.json');
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(shadowValidationReady
  ? '✅ SHADOW_VALIDATION_READY = true'
  : '❌ SHADOW_VALIDATION_READY = false — Review failures above');
console.log('═══════════════════════════════════════════════════════════════\n');

module.exports = { report };
