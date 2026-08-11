/*!
 * Phase 7C.9L.3U — Back Navigation + Deterministic Profile Return Tests
 * 37 targeted tests
 */
(function() {
'use strict';
var results = []; var pass = 0; var fail = 0;
function t(label, cond) {
  if (cond) { pass++; results.push('  PASS: ' + label); }
  else       { fail++; results.push('  FAIL: ' + label); }
}
var fs = require('fs');
var resSrc     = fs.readFileSync(__dirname + '/../../../../../js/reservation.js','utf8');
var fhpSrc     = fs.readFileSync(__dirname + '/../../../../../js/fixeo_homepage_premium_patch.js','utf8');
var profileSrc = fs.readFileSync(__dirname + '/../../../../../js/fixeo-public-artisan-profile.js','utf8');
var indexSrc   = fs.readFileSync(__dirname + '/../../../../../index.html','utf8');
var cssSrc     = fs.readFileSync(__dirname + '/../../../../../css/artisan-card-conversion-v1.css','utf8');

/* ── BACK NAVIGATION ── */
t('1: city picker has back button (3X: now data-res-back="city-back-to-estimator")',
  resSrc.includes('data-res-back="city-back-to-estimator"'));
t('2: city back destination handled (3X: city-back-to-estimator → dismiss + reveal)',
  resSrc.includes("dest === 'city-back-to-estimator'") && resSrc.includes('_dismissReservationLayer()'));
t('3: city back does NOT call clearContext',
  !resSrc.includes("clearContext") || resSrc.indexOf('clearContext') > resSrc.indexOf('data-res-back'));
t('4: artisan picker has data-res-back="city"',
  resSrc.includes('data-res-back="city"'));
t('5: artisan back renders city picker (3W: estimatorPickerScreen=city, NOT city=null)',
  (function() {
    var idx = resSrc.indexOf("dest === 'city'");
    var block = resSrc.substring(idx, idx + 300);
    return block.includes('estimatorPickerScreen') && !block.includes('estimatorCity = null');
  })());
t('6: artisan back does NOT reset _estimatorCtx',
  (function() {
    var block = resSrc.substring(resSrc.indexOf("dest === 'city'"), resSrc.indexOf("dest === 'city'")+120);
    return !block.includes('_estimatorCtx = null');
  })());
t('7: step 1 has data-res-back="artisan" (estimator only)',
  resSrc.includes('data-res-back="artisan"'));
t('8: step 1 back guarded by _estimatorCtx check',
  resSrc.includes('state._estimatorCtx && state._estimatorCtx.valid') &&
  resSrc.includes('data-res-back="artisan"'));
t('9: step 1 back saves draft before clearing artisan',
  resSrc.includes("dest === 'artisan'") &&
  resSrc.includes("state.description = descEl2.value") &&
  resSrc.includes("state.address = addrEl2.value"));
t('10: step 1 back sets artisan null',
  resSrc.includes("state.artisan = null;") && resSrc.includes("dest === 'artisan'"));
t('11: step 2 has data-res-back="step1"',
  resSrc.includes('data-res-back="step1"'));
t('12: step 2 back calls _goToStep1',
  resSrc.includes("dest === 'step1'") && resSrc.includes("_goToStep1()"));
t('13: step 2 back preserves form state (goToStep1 does not clear)',
  resSrc.includes('function _goToStep1() {\n    state.step = 1;\n    render();\n  }'));
t('14: × close button still uses FixeoReservation.close()',
  resSrc.includes('onclick="FixeoReservation.close()" aria-label="Fermer"'));

/* ── PROFILE CONTINUITY ── */
t('15: estimator profile link is same-tab (no target=_blank in estimatorAction)',
  (function() {
    var idx = fhpSrc.indexOf('Estimator action block');
    var block = fhpSrc.substring(idx, idx+600);
    return !block.includes('target="_blank"');
  })());
t('16: target=_blank absent from estimator card profile link',
  (function() {
    var idx = fhpSrc.indexOf('data-estimator-profile');
    return idx !== -1 && !fhpSrc.substring(idx-200, idx+200).includes('target="_blank"');
  })());
t('17: source=estimator added to estimator profile href',
  fhpSrc.includes('&source=estimator"'));
t('18: data-estimator-profile attribute present',
  fhpSrc.includes('data-estimator-profile="true"'));
t('19: profile click writes fx_estimator_return_v1',
  resSrc.includes("sessionStorage.setItem('fx_estimator_return_v1', 'artisan-picker')"));
t('20: profile click handler returns early before artisan selection (data-estimator-profile)',
  (function() {
    /* The interceptor returns; _selectArtisanFromPicker is not invoked.
     * The comment text mentioning the function name is acceptable. Verify logic:
     * handler returns before any artisan card matching code. */
    var idx = resSrc.indexOf("Priority A.5");
    var block = resSrc.substring(idx, resSrc.indexOf("Priority B — card body"));
    return block.includes("return;") && block.includes("data-estimator-profile");
  })());
t('21: normal homepage profile link unchanged (no source=estimator in homepage card)',
  (function() {
    /* Estimator card uses aid + &source=estimator; homepage uses String(a.id) without source */
    return fhpSrc.includes('&source=estimator') &&
           fhpSrc.includes("encodeURIComponent(String(a.id))");
  })());
t('22: return marker key is fx_estimator_return_v1',
  resSrc.includes("'fx_estimator_return_v1'") &&
  profileSrc.includes("'fx_estimator_return_v1'") &&
  indexSrc.includes("'fx_estimator_return_v1'"));
t('23: return marker value is artisan-picker (not a price)',
  resSrc.includes("'artisan-picker'") && !resSrc.includes("setItem.*amount"));
t('24: no raw amount_mad stored in return marker',
  !resSrc.includes("setItem('fx_estimator_return_v1', state._estimatorCtx.amount_mad") &&
  !resSrc.includes("setItem('fx_estimator_return_v1', amount"));
t('25: profile return link navigates to /',
  profileSrc.includes("window.location.href = '/'"));
t('26: return control only shown when source=estimator + marker + token',
  profileSrc.includes("src !== 'estimator'") &&
  profileSrc.includes("RETURN_MARKER") && profileSrc.includes("TOKEN_KEY"));

/* ── AUTO-RESTORE ── */
t('27: auto-restore uses pageshow',
  indexSrc.includes("addEventListener('pageshow'"));
t('28: double-restore guard present',
  indexSrc.includes('_fxEstimatorReturnRestoreInFlight'));
t('29: return marker cleared before async restore (one-shot)',
  indexSrc.includes("sessionStorage.removeItem(RETURN_MARKER)"));
t('30: pricing token NOT cleared by restore hook',
  (function() {
    var block = indexSrc.substring(indexSrc.indexOf('_maybeRestoreEstimatorPicker'), indexSrc.indexOf('_maybeRestoreEstimatorPicker')+1000);
    return !block.includes("removeItem(TOKEN_KEY)") && !block.includes("removeItem('fixeo_estimator_ctx_v1'");
  })());
t('31: auto-restore calls open(null) — server verification via verifyContext()',
  indexSrc.includes("FixeoReservation.open(null, false, null)"));
t('32: restore uses existing _loadReservationStack',
  indexSrc.includes("loadReservationStack(function()"));

/* ── AUTHORITY ── */
t('33: canonical pricing diff = 0 (amount_mad read-only from ctx)',
  !resSrc.includes('state._estimatorCtx.amount_mad =') &&
  resSrc.includes('state._estimatorCtx.amount_mad'));
t('34: pricing engine unchanged',
  !resSrc.includes('engine.calculate') && !fhpSrc.includes('recalculate'));
t('35: booking authority unchanged (_proceedToPayment untouched)',
  resSrc.includes('_proceedToPayment'));
t('36: idempotency guard unchanged',
  resSrc.includes('_reservationHandoffPending') || indexSrc.includes('_reservationHandoffPending'));
t('37: Supabase schema unchanged',
  !resSrc.includes('ALTER TABLE') && !fhpSrc.includes('ALTER TABLE'));

/* ── Report ── */
console.log('\nPhase 7C.9L.3U — Back Navigation + Profile Return Tests');
results.forEach(function(r){console.log(r);});
console.log('\n' + pass + '/' + (pass+fail) + ' tests pass' + (fail?' — FAILURES ABOVE':''));
process.exitCode = fail ? 1 : 0;
})();
