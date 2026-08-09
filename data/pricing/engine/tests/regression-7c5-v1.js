'use strict';
/**
 * FIXEO Pricing Engine — Phase 7C.5 Regression Tests
 *
 * Explicitly protects every fix made during Phase 7C.5 shadow validation:
 *   A. BRIC-010 / BRIC-020 calculation model (FIXED → UNIT_MULTIPLICATION)
 *   B. Hard exclusion trigger evaluation (parseTrigger DSL)
 *   C. Zero-quantity rejection (NEGATIVE_QUANTITY for val === 0)
 *   D. mcb_defect_confirmed type (string enum, not boolean)
 *
 * DORMANT — not imported by any production runtime.
 * No eval, no Function, no network, no Supabase.
 */

const { evaluateFixeoPrice } = require('../pricing-engine-core-v1');

let pass = 0, fail = 0;
const failures = [];

function ok(condition, label) {
  if (condition) { pass++; process.stdout.write('  \u2705 ' + label + '\n'); }
  else           { fail++; failures.push(label); process.stdout.write('  \u274c FAIL: ' + label + '\n'); }
}
function expectOk(result, expectedPrice, label) {
  if (!result.ok) {
    fail++; failures.push(label + ' [engine error: ' + (result.error && result.error.code) + ']');
    process.stdout.write('  \u274c FAIL: ' + label + ' — engine error: ' + (result.error && result.error.code) + '\n');
  } else if (result.pricing.final_amount_mad !== expectedPrice) {
    fail++; failures.push(label + ' [got ' + result.pricing.final_amount_mad + ', expected ' + expectedPrice + ']');
    process.stdout.write('  \u274c FAIL: ' + label + ' — got ' + result.pricing.final_amount_mad + ', expected ' + expectedPrice + '\n');
  } else {
    pass++;
    process.stdout.write('  \u2705 ' + label + '\n');
  }
}
function expectErrorCode(result, expectedCode, label) {
  var code = result.error && result.error.code;
  if (result.ok) {
    fail++; failures.push(label + ' [expected error ' + expectedCode + ', got price ' + result.pricing.final_amount_mad + ']');
    process.stdout.write('  \u274c FAIL: ' + label + ' — expected error ' + expectedCode + ', got price\n');
  } else if (code !== expectedCode) {
    fail++; failures.push(label + ' [got ' + code + ', expected ' + expectedCode + ']');
    process.stdout.write('  \u274c FAIL: ' + label + ' — error mismatch: got ' + code + ', expected ' + expectedCode + '\n');
  } else {
    pass++;
    process.stdout.write('  \u2705 ' + label + '\n');
  }
}
function expectNotOk(result, label) {
  if (!result.ok) { pass++; process.stdout.write('  \u2705 ' + label + '\n'); }
  else { fail++; failures.push(label + ' [expected not ok, got price ' + result.pricing.final_amount_mad + ']');
    process.stdout.write('  \u274c FAIL: ' + label + '\n'); }
}
function section(title) {
  process.stdout.write('\n[' + title + ']\n');
}

console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
console.log('FIXEO PRICING ENGINE \u2014 PHASE 7C.5 REGRESSION TESTS');
console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

// ─── A. BRIC-010 — montage_meuble ─────────────────────────────────────────────
section('A. BRIC-010 montage_meuble — UNIT_MULTIPLICATION (Phase 7C.5 fix)');

// Was FIXED (200 MAD regardless of item_count). Now UNIT_MULTIPLICATION: item_count × 200.
expectOk(
  evaluateFixeoPrice({ service_code: 'bricolage.montage_meuble', inputs: { item_count: 1 } }),
  200, 'BRIC-010 x1 item → 200 MAD'
);
expectOk(
  evaluateFixeoPrice({ service_code: 'bricolage.montage_meuble', inputs: { item_count: 2 } }),
  400, 'BRIC-010 x2 items → 400 MAD [REGRESSION: was 200 MAD with FIXED model]'
);
expectOk(
  evaluateFixeoPrice({ service_code: 'bricolage.montage_meuble', inputs: { item_count: 3 } }),
  600, 'BRIC-010 x3 items → 600 MAD'
);
expectOk(
  evaluateFixeoPrice({ service_code: 'bricolage.montage_meuble', inputs: { item_count: 5 } }),
  1000, 'BRIC-010 x5 items → 1000 MAD (floor 200 non-additive, 1000 > 200)'
);
// Missing item_count
expectErrorCode(
  evaluateFixeoPrice({ service_code: 'bricolage.montage_meuble', inputs: {} }),
  'MISSING_REQUIRED_INPUT', 'BRIC-010 no item_count → MISSING_REQUIRED_INPUT'
);
// Zero → NEGATIVE_QUANTITY (Phase 7C.5 zero-qty fix)
expectErrorCode(
  evaluateFixeoPrice({ service_code: 'bricolage.montage_meuble', inputs: { item_count: 0 } }),
  'NEGATIVE_QUANTITY', 'BRIC-010 item_count=0 → NEGATIVE_QUANTITY [REGRESSION: was accepted]'
);
expectErrorCode(
  evaluateFixeoPrice({ service_code: 'bricolage.montage_meuble', inputs: { item_count: -1 } }),
  'NEGATIVE_QUANTITY', 'BRIC-010 item_count=-1 → NEGATIVE_QUANTITY'
);
// Commercial output type
var ra5 = evaluateFixeoPrice({ service_code: 'bricolage.montage_meuble', inputs: { item_count: 1 } });
ok(ra5.ok && ra5.pricing.calculation_model === 'UNIT_MULTIPLICATION',
  'BRIC-010: calculation_model = UNIT_MULTIPLICATION (not FIXED)');

// ─── B. BRIC-020 — fixation_accrochage ────────────────────────────────────────
section('B. BRIC-020 fixation_accrochage — UNIT_MULTIPLICATION (Phase 7C.5 fix)');

expectOk(
  evaluateFixeoPrice({ service_code: 'bricolage.fixation_accrochage', inputs: { item_count: 1 } }),
  200, 'BRIC-020 x1 item → 200 MAD'
);
expectOk(
  evaluateFixeoPrice({ service_code: 'bricolage.fixation_accrochage', inputs: { item_count: 2 } }),
  400, 'BRIC-020 x2 items → 400 MAD [REGRESSION: was 200 MAD with FIXED model]'
);
expectOk(
  evaluateFixeoPrice({ service_code: 'bricolage.fixation_accrochage', inputs: { item_count: 4 } }),
  800, 'BRIC-020 x4 items → 800 MAD'
);
expectErrorCode(
  evaluateFixeoPrice({ service_code: 'bricolage.fixation_accrochage', inputs: { item_count: 0 } }),
  'NEGATIVE_QUANTITY', 'BRIC-020 item_count=0 → NEGATIVE_QUANTITY [REGRESSION: was accepted]'
);
expectErrorCode(
  evaluateFixeoPrice({ service_code: 'bricolage.fixation_accrochage', inputs: {} }),
  'MISSING_REQUIRED_INPUT', 'BRIC-020 no item_count → MISSING_REQUIRED_INPUT'
);
var rb5 = evaluateFixeoPrice({ service_code: 'bricolage.fixation_accrochage', inputs: { item_count: 1 } });
ok(rb5.ok && rb5.pricing.calculation_model === 'UNIT_MULTIPLICATION',
  'BRIC-020: calculation_model = UNIT_MULTIPLICATION (not FIXED)');

// ─── C. HARD EXCLUSION TRIGGER EVALUATION ─────────────────────────────────────
section('C. Hard exclusion trigger evaluation — parseTrigger DSL (Phase 7C.5 fix)');

// C1: Safety exclusion — burning_smell fires STOP_SAFETY on disjoncteur
// Service: electricite.disjoncteur_remplacement
// Required inputs also: mcb_defect_confirmed (string), distributor_equipment_involved (bool)
var rc1 = evaluateFixeoPrice({
  service_code: 'electricite.disjoncteur_remplacement',
  inputs: { mcb_defect_confirmed: 'physically_broken', distributor_equipment_involved: false, burning_smell: true }
});
ok(!rc1.ok, 'disjoncteur + burning_smell=true → not ok (STOP_SAFETY)');
ok(!rc1.ok && rc1.qualification && rc1.qualification.status === 'STOP_SAFETY',
  'disjoncteur + burning_smell=true → qualification.status = STOP_SAFETY [REGRESSION: was phantom price before parseTrigger fix]');

// C2: Scorch marks — same exclusion
var rc2 = evaluateFixeoPrice({
  service_code: 'electricite.disjoncteur_remplacement',
  inputs: { mcb_defect_confirmed: 'physically_broken', distributor_equipment_involved: false, scorch_marks: true }
});
ok(!rc2.ok, 'disjoncteur + scorch_marks=true → not ok');
ok(!rc2.ok && rc2.qualification && rc2.qualification.status === 'STOP_SAFETY',
  'disjoncteur + scorch_marks=true → STOP_SAFETY [REGRESSION: was phantom price before fix]');

// C3: No false positive — safe inputs → price returned
var rc3 = evaluateFixeoPrice({
  service_code: 'electricite.disjoncteur_remplacement',
  inputs: { mcb_defect_confirmed: 'physically_broken', distributor_equipment_involved: false, burning_smell: false, scorch_marks: false }
});
ok(rc3.ok, 'disjoncteur + burning_smell=false + scorch_marks=false → price returned (no false positive)');
ok(rc3.ok && rc3.pricing.final_amount_mad === 250,
  'disjoncteur eligible → 250 MAD [approved V0.3 price]');

// C4: Requalify exclusion — multi_split on climatisation installation
// Service: climatisation.installation.standard
// Required: ac_count, ac_capacity_btu, installation_height_m (<=2.5). Exclusion: multi_split=true → QUOTE_REQUIRED
var rc4 = evaluateFixeoPrice({
  service_code: 'climatisation.installation.standard',
  inputs: { ac_count: 1, ac_capacity_btu: 9000, installation_height_m: 2.5, multi_split: true }
});
ok(!rc4.ok, 'climatisation.installation.standard + multi_split=true → not ok (QUOTE_REQUIRED)');
ok(!rc4.ok && rc4.qualification && (rc4.qualification.status === 'QUOTE_REQUIRED' || rc4.qualification.status === 'INELIGIBLE'),
  'climatisation.installation.standard + multi_split=true → QUOTE_REQUIRED or INELIGIBLE [REGRESSION: was phantom price before parseTrigger fix]');

// C5: No false positive for multi_split=false
var rc5 = evaluateFixeoPrice({
  service_code: 'climatisation.installation.standard',
  inputs: { ac_count: 1, ac_capacity_btu: 9000, installation_height_m: 2.5, multi_split: false }
});
ok(rc5.ok, 'climatisation.installation.standard + multi_split=false + height=2.5 → price returned (no false positive)');
ok(rc5.ok && rc5.pricing.final_amount_mad === 1000, 'climatisation.installation.standard eligible → 1000 MAD');

// ─── D. ZERO-QUANTITY REJECTION ────────────────────────────────────────────────
section('D. Zero-quantity rejection — NEGATIVE_QUANTITY for val=0 (Phase 7C.5 fix)');

// D1: ac_count = 0
expectErrorCode(
  evaluateFixeoPrice({ service_code: 'climatisation.entretien_annuel', inputs: { ac_count: 0 } }),
  'NEGATIVE_QUANTITY', 'climatisation.entretien_annuel ac_count=0 → NEGATIVE_QUANTITY [REGRESSION: was accepted]'
);

// D2: hours = 0
expectErrorCode(
  evaluateFixeoPrice({ service_code: 'bricolage.horaire', inputs: { hours: 0 } }),
  'NEGATIVE_QUANTITY', 'bricolage.horaire hours=0 → NEGATIVE_QUANTITY [REGRESSION: was accepted]'
);

// D3: worker_count = 0
expectErrorCode(
  evaluateFixeoPrice({ service_code: 'nettoyage.menage_standard', inputs: { hours: 2, worker_count: 0 } }),
  'NEGATIVE_QUANTITY', 'nettoyage.menage_standard worker_count=0 → NEGATIVE_QUANTITY [REGRESSION: was accepted]'
);

// D4: painted_m2 = 0
expectErrorCode(
  evaluateFixeoPrice({ service_code: 'peinture.mur_interieur.labour_only', inputs: { painted_m2: 0 } }),
  'NEGATIVE_QUANTITY', 'peinture.mur_interieur.labour_only painted_m2=0 → NEGATIVE_QUANTITY'
);

// D5: item_count = 0 for BRIC-010/020 already covered in A/B above

// D6: Positive quantities still work (no regression in valid path)
expectOk(
  evaluateFixeoPrice({ service_code: 'climatisation.entretien_annuel', inputs: { ac_count: 1 } }),
  300, 'climatisation.entretien_annuel ac_count=1 → 300 MAD (positive quantity valid)'
);
expectOk(
  evaluateFixeoPrice({ service_code: 'bricolage.horaire', inputs: { hours: 1 } }),
  300, 'bricolage.horaire hours=1 → 300 MAD (min_billing=2, 2x150=300)'
);

// ─── E. MCB_DEFECT_CONFIRMED TYPE ─────────────────────────────────────────────
section('E. mcb_defect_confirmed — string enum type (Phase 7C.5 fix)');

// E1: Boolean true → INVALID_INPUT_TYPE (regression: was accepted as boolean before fix)
var re1 = evaluateFixeoPrice({
  service_code: 'electricite.disjoncteur_remplacement',
  inputs: { mcb_defect_confirmed: true, distributor_equipment_involved: false }
});
ok(!re1.ok && re1.error && re1.error.code === 'INVALID_INPUT_TYPE',
  'mcb_defect_confirmed=true (boolean) → INVALID_INPUT_TYPE [REGRESSION: was accepted as boolean]');

// E2: Valid string 'physically_broken' → no type error
var re2 = evaluateFixeoPrice({
  service_code: 'electricite.disjoncteur_remplacement',
  inputs: { mcb_defect_confirmed: 'physically_broken', distributor_equipment_involved: false, burning_smell: false }
});
ok(re2.ok || (re2.error && re2.error.code !== 'INVALID_INPUT_TYPE'),
  "mcb_defect_confirmed='physically_broken' → no INVALID_INPUT_TYPE (string accepted)");

// E3: Valid string 'trips_repeatedly' → INELIGIBLE (condition requires 'physically_broken') but NOT INVALID_INPUT_TYPE
var re3 = evaluateFixeoPrice({
  service_code: 'electricite.disjoncteur_remplacement',
  inputs: { mcb_defect_confirmed: 'trips_repeatedly', distributor_equipment_involved: false, burning_smell: false }
});
// trips_repeatedly is a valid enum string but condition requires physically_broken → INELIGIBLE (not a type error)
ok(!re3.ok && (re3.qualification || re3.error) && (!re3.error || re3.error.code !== 'INVALID_INPUT_TYPE'),
  "mcb_defect_confirmed='trips_repeatedly' → INELIGIBLE/not INVALID_INPUT_TYPE (string type accepted; condition fails)");

// E4: Boolean false → INVALID_INPUT_TYPE (same as true)
var re4 = evaluateFixeoPrice({
  service_code: 'electricite.disjoncteur_remplacement',
  inputs: { mcb_defect_confirmed: false, distributor_equipment_involved: false }
});
ok(!re4.ok && re4.error && re4.error.code === 'INVALID_INPUT_TYPE',
  'mcb_defect_confirmed=false (boolean) → INVALID_INPUT_TYPE [boolean never valid]');

// ─── F. APPROVED PRICE INVARIANCE ─────────────────────────────────────────────
section('F. Approved price invariance — V0.3 prices unchanged after Phase 7C.5 corrections');

expectOk(
  evaluateFixeoPrice({ service_code: 'plomberie.diagnostic', inputs: {} }),
  180, 'plomberie.diagnostic → 180 MAD (V0.3 approved)'
);
expectOk(
  evaluateFixeoPrice({ service_code: 'serrurerie.porte_claquee_ouverture', inputs: {} }),
  220, 'serrurerie.porte_claquee_ouverture → 220 MAD (V0.3 approved)'
);
expectOk(
  evaluateFixeoPrice({ service_code: 'climatisation.diagnostic', inputs: {} }),
  250, 'climatisation.diagnostic → 250 MAD (V0.3 approved)'
);
expectOk(
  evaluateFixeoPrice({ service_code: 'peinture.mur_interieur.all_in', inputs: { painted_m2: 15 } }),
  975, 'peinture.mur_interieur.all_in 15m2 → 975 MAD (15x65=975 >floor 800)'
);
expectOk(
  evaluateFixeoPrice({ service_code: 'peinture.mur_interieur.all_in', inputs: { painted_m2: 10 } }),
  800, 'peinture.mur_interieur.all_in 10m2 → 800 MAD (10x65=650 <floor 800 → floor applies)'
);
expectOk(
  evaluateFixeoPrice({ service_code: 'bricolage.horaire', inputs: { hours: 2 } }),
  300, 'bricolage.horaire 2hr → 300 MAD (min_billing=2, 2x150)'
);
expectOk(
  evaluateFixeoPrice({ service_code: 'nettoyage.menage_standard', inputs: { hours: 1, worker_count: 1 } }),
  200, 'nettoyage.menage_standard 1w x 1h → 200 MAD (1x1x65=65 <floor 200)'
);
expectOk(
  evaluateFixeoPrice({ service_code: 'menuiserie.reglage_porte.sans_rabotage', inputs: { security_door: false, frame_condition: 'SOUND' } }),
  300, 'menuiserie.reglage_porte.sans_rabotage → 300 MAD (V0.3 approved, floor=300)'
);
// BRIC-010 x1 still 200 MAD after model fix
expectOk(
  evaluateFixeoPrice({ service_code: 'bricolage.montage_meuble', inputs: { item_count: 1 } }),
  200, 'bricolage.montage_meuble x1 → 200 MAD (unchanged approved unit rate)'
);
expectOk(
  evaluateFixeoPrice({ service_code: 'bricolage.fixation_accrochage', inputs: { item_count: 1 } }),
  200, 'bricolage.fixation_accrochage x1 → 200 MAD (unchanged approved unit rate)'
);

// ─── G. PROVENANCE INVARIANCE ─────────────────────────────────────────────────
section('G. Provenance invariance — production_ready=false on all corrected services');

var provServices = [
  'bricolage.montage_meuble',
  'bricolage.fixation_accrochage',
  'electricite.disjoncteur_remplacement',
  'climatisation.entretien_annuel',
  'peinture.mur_interieur.all_in',
];
provServices.forEach(function(code) {
  var inputs = {};
  if (code === 'electricite.disjoncteur_remplacement') {
    inputs = { mcb_defect_confirmed: 'physically_broken', distributor_equipment_involved: false, burning_smell: false };
  } else if (code === 'bricolage.montage_meuble' || code === 'bricolage.fixation_accrochage') {
    inputs = { item_count: 1 };
  } else if (code === 'climatisation.entretien_annuel') {
    inputs = { ac_count: 1 };
  } else if (code === 'peinture.mur_interieur.all_in') {
    inputs = { painted_m2: 15 };
  }
  var r = evaluateFixeoPrice({ service_code: code, inputs: inputs });
  ok(r.ok && r.provenance && r.provenance.production_ready === false,
    code + ': production_ready = false (not activated by 7C.5 corrections)');
});

// ─── SUMMARY ──────────────────────────────────────────────────────────────────
var SEP = '\u2550'.repeat(63);
var total = pass + fail;
console.log('\n' + SEP);
console.log('REGRESSION 7C.5 \u2014 RESULT');
console.log('  PASS: ' + pass + ' / FAIL: ' + fail + ' / TOTAL: ' + total);
if (fail > 0) {
  console.log('\n  FAILURES:');
  failures.forEach(function(f) { console.log('    \u274c ' + f); });
}
console.log('\n  Status: ' + (fail === 0 ? '\u2705 ALL REGRESSION TESTS PASS' : '\u274c ' + fail + ' REGRESSION TEST(S) FAILED'));
console.log(SEP + '\n');

module.exports = { pass: pass, fail: fail, failures: failures };
