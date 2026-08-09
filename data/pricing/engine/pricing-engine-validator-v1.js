'use strict';
/**
 * FIXEO Pricing Engine Validator V1
 * Schema compatibility for all 53 canonical services.
 * Confirms every service can be parsed, has valid refs, model, output type.
 * Does not run live calculations (fixtures handle that).
 *
 * DORMANT — not imported by any production runtime.
 */

const { getEngineData } = require('./pricing-engine-loader-v1');

const SUPPORTED_MODELS = new Set([
  'FIXED','CONDITIONAL_FIXED','UNIT_MULTIPLICATION','UNIT_MULTIPLICATION_WITH_FLOOR',
  'TIME_BASED_SINGLE','TIME_BASED_TEAM','MINIMUM_FLOOR','LABOUR_FIXED_PART_SEPARATE',
  'ADD_ON','DIAGNOSTIC','QUOTE_ONLY'
]);
const SUPPORTED_OUTPUT_TYPES = new Set([
  'FIXEO_PRICE','FIXEO_CALCULATED_PRICE','FIXEO_LABOUR_PRICE_PLUS_PART',
  'FIXEO_DIAGNOSTIC','FIXEO_ADD_ON','FIXEO_ESTIMATE','QUOTE_REQUIRED'
]);
const VALID_QUAL_STATUS = new Set(['OPEN','CONDITIONAL','ADD_ON_ONLY']);

function validateAll() {
  let pass = 0, fail = 0;
  const errors = [];
  const report = { services: {}, summary: {} };

  function ok(svc, msg)  { report.services[svc] = report.services[svc] || []; report.services[svc].push({pass:true,msg}); pass++; }
  function err(svc, msg) { report.services[svc] = report.services[svc] || []; report.services[svc].push({pass:false,msg}); fail++; errors.push(`${svc}: ${msg}`); }
  function check(svc, cond, okMsg, failMsg) { cond ? ok(svc, okMsg) : err(svc, failMsg); }

  const data = getEngineData();
  const { services, formulas, policies, routes, inputs } = data;
  const svcList = Object.values(services);

  // Overall counts
  check('META', svcList.length === 53, `53 services present (${svcList.length})`, `Expected 53, got ${svcList.length}`);

  for (const svc of svcList) {
    const code = svc.canonical_service_code;
    const pm   = svc.price_model || {};

    // Required fields
    check(code, !!code, 'canonical_service_code present', 'MISSING canonical_service_code');
    check(code, !!svc.metier, 'metier present', 'MISSING metier');
    check(code, !!pm.calculation_model, 'calculation_model present', 'MISSING calculation_model');
    check(code, !!pm.commercial_output_type, 'commercial_output_type present', 'MISSING commercial_output_type');

    // Model supported
    check(code, SUPPORTED_MODELS.has(pm.calculation_model),
      `calculation_model '${pm.calculation_model}' supported`,
      `UNSUPPORTED model: ${pm.calculation_model}`);

    // Output type supported
    check(code, SUPPORTED_OUTPUT_TYPES.has(pm.commercial_output_type),
      `output_type '${pm.commercial_output_type}' supported`,
      `UNSUPPORTED output type: ${pm.commercial_output_type}`);

    // Formula ref
    if (pm.formula_id) {
      check(code, !!formulas[pm.formula_id], `formula '${pm.formula_id}' resolves`, `UNRESOLVED formula: ${pm.formula_id}`);
    }

    // Policy refs
    for (const ref of (svc.policy_refs || [])) {
      check(code, !!policies[ref], `policy '${ref}' resolves`, `UNRESOLVED policy: ${ref}`);
    }

    // Route refs in hard exclusions
    const elig = svc.eligibility || {};
    for (const excl of (elig.hard_exclusions || [])) {
      if (excl.route_ref) {
        check(code, !!routes[excl.route_ref], `route_ref '${excl.route_ref}' resolves`, `UNRESOLVED route_ref: ${excl.route_ref}`);
      }
    }

    // Qualification status valid
    if (elig.qualification_status) {
      check(code, VALID_QUAL_STATUS.has(elig.qualification_status),
        `qualification_status '${elig.qualification_status}' valid`,
        `INVALID qualification_status: ${elig.qualification_status}`);
    }

    // Price field present per model
    switch (pm.calculation_model) {
      case 'FIXED':
      case 'CONDITIONAL_FIXED':
      case 'MINIMUM_FLOOR':
        check(code, pm.fixed_amount_mad !== undefined && pm.fixed_amount_mad !== null,
          `fixed_amount_mad present (${pm.fixed_amount_mad})`, 'MISSING fixed_amount_mad');
        break;
      case 'UNIT_MULTIPLICATION':
      case 'UNIT_MULTIPLICATION_WITH_FLOOR':
        check(code, pm.unit_rate_mad !== undefined && pm.unit_rate_mad !== null,
          `unit_rate_mad present (${pm.unit_rate_mad})`, 'MISSING unit_rate_mad');
        break;
      case 'TIME_BASED_SINGLE':
      case 'TIME_BASED_TEAM':
        check(code, pm.unit_rate_mad !== undefined && pm.unit_rate_mad !== null,
          `unit_rate_mad present (${pm.unit_rate_mad})`, 'MISSING unit_rate_mad');
        break;
      case 'LABOUR_FIXED_PART_SEPARATE':
        check(code, pm.labour_amount_mad !== undefined && pm.labour_amount_mad !== null,
          `labour_amount_mad present (${pm.labour_amount_mad})`, 'MISSING labour_amount_mad');
        break;
      case 'DIAGNOSTIC':
        const dp = pm.diagnostic_price_mad || pm.fixed_amount_mad;
        check(code, dp !== undefined && dp !== null, `diagnostic price present (${dp})`, 'MISSING diagnostic price');
        break;
    }

    // production_ready = false
    check(code, svc.production_ready !== true,
      'production_ready = false', 'DANGER: production_ready = true — must remain false');

    // No runtime activation flags
    for (const flag of ['active_in_estimator','active_in_reservation','active_in_pseo','active_in_profiles','active']) {
      if (svc[flag] === true) {
        err(code, `ACTIVATION FLAG ACTIVE: ${flag} = true — must remain false/absent`);
      }
    }

    // FIXEO_ESTIMATE must not appear on approved standardized services
    if (svc.human_decision === 'APPROVED' && pm.commercial_output_type === 'FIXEO_ESTIMATE') {
      err(code, 'FIXEO_ESTIMATE on approved standardized service — FORBIDDEN');
    }
  }

  // All approved prices are integers
  const EXPECTED = {
    'plomberie.diagnostic':180,'plomberie.fuite_simple':250,'plomberie.debouchage_evier':250,
    'plomberie.debouchage_wc_simple':300,'plomberie.robinet_remplacement':250,'plomberie.chasse_eau':300,
    'electricite.diagnostic':200,'electricite.prise_remplacement':220,
    'electricite.interrupteur_remplacement.simple':220,'electricite.interrupteur_remplacement.va_et_vient':250,
    'electricite.luminaire_installation':220,'electricite.disjoncteur_remplacement':250,
    'serrurerie.porte_claquee_ouverture':220,'serrurerie.porte_claquee_blindee.ouverture':350,
    'serrurerie.porte_verrouillee.ouverture':380,'serrurerie.cle_cassee_extraction':220,
    'serrurerie.cylindre_remplacement.standard':280,'serrurerie.serrure_remplacement.standard':400,
  };
  const legMap = {};
  for (const s of svcList) {
    for (const lc of (s.legacy_codes||[])) legMap[lc] = s;
  }
  for (const [code, exp] of Object.entries(EXPECTED)) {
    const s = services[code] || legMap[code];
    if (s) {
      const pm2 = s.price_model || {};
      const actual = pm2.fixed_amount_mad ?? pm2.labour_amount_mad ?? pm2.diagnostic_price_mad ?? pm2.unit_rate_mad;
      check(code||s.canonical_service_code, actual === exp, `price = ${exp} MAD (confirmed)`, `price mismatch: expected ${exp}, got ${actual}`);
    }
  }

  report.summary = { pass, fail, total: pass + fail, errors };
  return report;
}

if (require.main === module) {
  const report = validateAll();
  const { pass, fail, total } = report.summary;
  console.log(`\n FIXEO Engine Validator — 53-Service Schema Compatibility`);
  console.log(`  PASS: ${pass} / FAIL: ${fail} / TOTAL: ${total}`);
  if (fail > 0) {
    console.log('\nFailed:');
    report.summary.errors.forEach(e => console.log(`  ❌ ${e}`));
  } else {
    console.log('\n  ✅ ALL 53 SERVICES PASS SCHEMA COMPATIBILITY');
  }
}

module.exports = { validateAll };
