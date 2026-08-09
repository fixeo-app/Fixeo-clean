#!/usr/bin/env node
'use strict';
/**
 * FIXEO Pricing Engine CLI V1
 * Developer/test-only. NOT a production endpoint.
 *
 * Usage:
 *   node pricing-engine-cli-v1.js <service_code> '<inputs_json>'
 *   node pricing-engine-cli-v1.js --validate
 *   node pricing-engine-cli-v1.js --bench
 *
 * Examples:
 *   node pricing-engine-cli-v1.js plomberie.fuite_simple '{}'
 *   node pricing-engine-cli-v1.js CLIM-003 '{"ac_count":2}'
 *   node pricing-engine-cli-v1.js NET-002 '{"hours":3,"worker_count":2}'
 *   node pricing-engine-cli-v1.js PEIN-002 '{"painted_m2":25}'
 *   node pricing-engine-cli-v1.js MENU_002 '{"hinge_count":3}'
 *   node pricing-engine-cli-v1.js BRIC-002 '{"hours":2}'
 */

const { evaluateFixeoPrice } = require('./pricing-engine-core-v1');
const { validateAll } = require('./pricing-engine-validator-v1');
const { getEngineData } = require('./pricing-engine-loader-v1');

const args = process.argv.slice(2);

if (args[0] === '--validate') {
  const report = validateAll();
  const { pass, fail, total } = report.summary;
  console.log(`\n Schema Compatibility: ${pass} PASS / ${fail} FAIL / ${total} TOTAL`);
  if (fail > 0) report.summary.errors.forEach(e => console.log('  ❌', e));
  else console.log('  ✅ All 53 services pass schema compatibility');
  process.exit(fail > 0 ? 1 : 0);
}

if (args[0] === '--bench') {
  const { resetEngineData } = require('./pricing-engine-loader-v1');
  const t0 = Date.now();
  resetEngineData();
  getEngineData();
  const loadMs = Date.now() - t0;
  const cases = [
    ['plomberie.fuite_simple',{}],['CLIM-003',{ac_count:2}],['NET-002',{hours:3,worker_count:2}],
    ['PEIN-002',{painted_m2:25}],['MENU_002',{hinge_count:1}],['BRIC-002',{hours:2}]
  ];
  const t1 = process.hrtime.bigint();
  for (let i=0;i<1000;i++) { const [sc,inp]=cases[i%cases.length]; evaluateFixeoPrice({service_code:sc,inputs:inp}); }
  const t2 = process.hrtime.bigint();
  const total = Number(t2-t1)/1e6;
  console.log(`Registry load: ${loadMs}ms | 1000 evals: ${total.toFixed(1)}ms total | ${(total/1000).toFixed(3)}ms avg`);
  process.exit(0);
}

if (args[0] === '--list') {
  const data = getEngineData();
  const svcs = Object.keys(data.services).sort();
  console.log(`\n${svcs.length} canonical services:\n`);
  svcs.forEach(c => {
    const s = data.services[c];
    const pm = s.price_model || {};
    const price = pm.fixed_amount_mad || pm.labour_amount_mad || pm.unit_rate_mad || pm.diagnostic_price_mad;
    console.log(`  ${c.padEnd(60)} ${pm.calculation_model} @ ${price} MAD/${pm.unit||'flat'}`);
  });
  process.exit(0);
}

if (args.length < 1) {
  console.log(`
FIXEO Pricing Engine CLI V1 — DORMANT / DEVELOPER ONLY

Usage:
  node pricing-engine-cli-v1.js <service_code> '<inputs_json>'
  node pricing-engine-cli-v1.js --validate
  node pricing-engine-cli-v1.js --bench
  node pricing-engine-cli-v1.js --list

This is NOT a production endpoint. Engine version: 1.0.0-dormant
  `);
  process.exit(0);
}

const service_code = args[0];
let inputs = {};
if (args[1]) {
  try {
    inputs = JSON.parse(args[1]);
  } catch(e) {
    console.error('Invalid JSON inputs:', e.message);
    process.exit(1);
  }
}

const result = evaluateFixeoPrice({ service_code, inputs });

if (result.ok) {
  console.log('\n✅ ELIGIBLE\n');
  const p = result.pricing;
  console.log(`  Service:    ${result.service_code} (v${result.service_version})`);
  console.log(`  Model:      ${p.calculation_model}`);
  console.log(`  Output:     ${p.commercial_output_type}`);
  console.log(`  Final:      ${p.final_amount_mad} MAD`);
  if (p.minimum_floor_mad) console.log(`  Floor:      ${p.minimum_floor_mad} MAD (applied, NON_ADDITIVE)`);
  if (p.variable_part_separate) console.log(`  Parts:      Separately disclosed and approved`);
  if (p.diagnostic_price_mad) {
    console.log(`  Diagnostic: ${p.diagnostic_price_mad} MAD`);
    console.log(`  Absorption: ${p.absorption_eligible_if_followup ? 'eligible if qualifying follow-up booked' : 'no absorption'}`);
  }
  if (p.add_on_amount_mad) console.log(`  Add-on:     ${p.add_on_amount_mad} MAD`);
  console.log(`\n  Trace: ${result.calculation_trace.formula_id}`);
  result.calculation_trace.steps.forEach(s => console.log(`    → ${s}`));
  if (result.policies_applied.length > 0) console.log(`\n  Policies: ${result.policies_applied.join(', ')}`);
  console.log(`\n  Provenance: ${result.provenance.maturity} | production_ready=${result.provenance.production_ready}`);
} else if (result.error) {
  console.log('\n❌ ERROR\n');
  console.log(`  Code:    ${result.error.code}`);
  console.log(`  Message: ${result.error.message}`);
  if (result.error.field) console.log(`  Field:   ${result.error.field}`);
} else {
  console.log('\n⛔ INELIGIBLE\n');
  const q = result.qualification;
  console.log(`  Status:  ${q.status}`);
  console.log(`  Reason:  ${q.reason}`);
  if (result.routing) {
    console.log(`  Route:   ${result.routing.route_ref} → ${result.routing.target_metier || result.routing.target_external}`);
  }
}

console.log('');
