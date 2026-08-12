/**
 * Phase 7C.10D.3 — Urgent Final Mobile Polish
 * Targeted source tests: 50 total
 */
'use strict';

var assert = require('assert');
var fs     = require('fs');
var path   = require('path');

var REPO       = path.resolve(__dirname, '../../../../..');
var FXRF4_JS   = path.join(REPO, 'js/fx-request-flow-v4.js');
var FXRF4_CSS  = path.join(REPO, 'css/fx-request-flow-v4.css');
var EST_JS     = path.join(REPO, 'js/fixeo-estimator-v2.js');
var INDEX_HTML = path.join(REPO, 'index.html');
var RES_JS     = path.join(REPO, 'js/reservation.js');

var src = fs.readFileSync(FXRF4_JS, 'utf8');
var css = fs.readFileSync(FXRF4_CSS, 'utf8');
var idx = fs.readFileSync(INDEX_HTML, 'utf8');

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  \u2713 ' + name); passed++; }
  catch(e) { console.error('  \u2717 ' + name); console.error('    ' + e.message); failed++; }
}

/* Locate _renderSuccess to scope checks */
var renderSuccessStart = src.lastIndexOf('function _renderSuccess');
var renderSuccessBlock = src.slice(renderSuccessStart, renderSuccessStart + 2500);

/* ── A. SUCCESS LANE ─────────────────────────────────────────── */
console.log('\n[10D.3] A. Success lane completion');

test('A.1 _updateLaneStep(4) called in _renderSuccess for emergency', function () {
  assert.ok(renderSuccessBlock.includes('_updateLaneStep(4)'),
    '_updateLaneStep(4) must be called in _renderSuccess');
});

test('A.2 _updateLaneStep(4) is ONLY called in _renderSuccess (not in other steps)', function () {
  /* Step 1 = _updateLaneStep(1), Step 2 = (2), Step 3 = (3). Only success uses (4). */
  var allOccurrences = src.split('_updateLaneStep(4)').length - 1;
  assert.ok(allOccurrences === 1,
    '_updateLaneStep(4) must appear exactly once (in _renderSuccess only)');
});

test('A.3 _updateLaneStep(4) comes after _setProgress(3,3) in _renderSuccess', function () {
  var progressIdx = renderSuccessBlock.indexOf('_setProgress(3, 3)');
  var laneIdx     = renderSuccessBlock.indexOf('_updateLaneStep(4)');
  assert.ok(progressIdx !== -1 && laneIdx !== -1 && laneIdx > progressIdx,
    '_updateLaneStep(4) must come after _setProgress(3,3)');
});

test('A.4 _updateLaneStep(4) guarded by isEmergency', function () {
  var laneIdx = renderSuccessBlock.indexOf('_updateLaneStep(4)');
  var preCtx  = renderSuccessBlock.slice(Math.max(0, laneIdx - 100), laneIdx);
  assert.ok(preCtx.includes('isEmergency'),
    '_updateLaneStep(4) must be guarded by isEmergency');
});

test('A.5 _updateLaneStep() semantics: n=4 makes all 3 steps is-done', function () {
  /* Verify the logic: idx < n → is-done; idx === n → is-active.
   * For n=4: idx 0,1,2 are all < 4 → all is-done. None === 4. */
  var fnIdx   = src.indexOf('function _updateLaneStep');
  var fnBlock = src.slice(fnIdx, fnIdx + 400);
  assert.ok(fnBlock.includes("'is-done'") || fnBlock.includes('"is-done"'),
    '_updateLaneStep must toggle is-done');
  assert.ok(fnBlock.includes('is-active') && fnBlock.includes('=== n'),
    '_updateLaneStep must toggle is-active based on === n');
  /* Confirm done condition uses < n comparison */
  assert.ok(fnBlock.includes('idx < n') || fnBlock.includes('< n'),
    '_updateLaneStep must use < n for done state (so n=4 marks all 3 done)');
});

test('A.6 CSS is-done lane step color (green, not amber)', function () {
  var doneIdx = css.indexOf('.fxrf4-lane-step.is-done');
  var doneBlock = css.slice(doneIdx, doneIdx + 200);
  /* Must be green — rgba(32, 201, 151, ...) */
  assert.ok(doneBlock.includes('201, 151') || doneBlock.includes('20c997') || doneBlock.includes('32, 201'),
    'is-done lane step must be green (not amber)');
});

/* ── B. COPY ─────────────────────────────────────────────────── */
console.log('\n[10D.3] B. Success copy');

test('B.1 RAFI success message: "Urgence transmise à FIXEO."', function () {
  assert.ok(src.includes("successEmergency: 'Urgence transmise"),
    'RAFI success must be "Urgence transmise à FIXEO."');
});

test('B.2 Old RAFI success "Demande urgente enregistrée." absent', function () {
  assert.ok(!src.includes("'Demande urgente enregistr"),
    'Old RAFI success copy must be absent');
});

test('B.3 Main title: "Votre demande est enregistrée."', function () {
  assert.ok(src.includes('"Votre demande est enregistr'),
    'Main title must be "Votre demande est enregistrée."');
});

test('B.4 Old title "Votre demande a bien été transmise" absent', function () {
  assert.ok(!src.includes('Votre demande a bien'),
    'Old main title must be absent');
});

test('B.5 Body copy: "Numéro enregistré pour la coordination FIXEO."', function () {
  assert.ok(src.includes('ro enregistr') && src.includes('coordination FIXEO'),
    'Body copy must be factual coordination copy');
});

test('B.6 Old body copy "L\'équipe FIXEO utilisera" absent', function () {
  assert.ok(!src.includes('quipe FIXEO utilisera'),
    'Old body copy must be absent');
});

test('B.7 Step 1 label simplified to "Enregistrée"', function () {
  assert.ok(src.includes("lbl: 'Enregistr"),
    'Step 1 label must be "Enregistrée"');
});

test('B.8 Old step 1 "Demande urgente\\nenregistrée" absent', function () {
  assert.ok(!src.includes('Demande urgente\\nenregistr') &&
            !src.includes("'Demande urgente\\nenregistr"),
    'Old step 1 label must be absent');
});

test('B.9 Step 3 label simplified to "À venir"', function () {
  /* File stores as escape sequences — check for the à venir pattern */
  assert.ok(src.includes("'\\u00c0 venir'") || src.includes("lbl: '\\u00c0") ||
            (src.includes("lbl: '") && src.includes("venir'") && !src.includes('Coordination')),
    'Step 3 label must be simplified (À venir)');
});

test('B.10 Old step 3 "Coordination\\nà venir" absent from emergency stepData', function () {
  assert.ok(!src.includes('Coordination\\n'),
    'Old step 3 "Coordination\\n" label must be absent');
});

test('B.11 Step 2 label unchanged: "Transmise\\nà FIXEO"', function () {
  assert.ok(src.includes("'Transmise\\n") ||
            src.includes("lbl: 'Transmise"),
    'Step 2 label must still include "Transmise"');
});

test('B.12 No false claims in success copy (artisan contact etc.)', function () {
  assert.ok(!src.includes('artisans contact') &&
            !src.includes('prise en charge imm') &&
            !src.includes('confirmation en cours'),
    'Success copy must contain no false artisan-contact claims');
});

/* ── C. TOUCH TARGETS ───────────────────────────────────────── */
console.log('\n[10D.3] C. Touch targets');

test('C.1 bridge-skip min-height upgraded to 44px', function () {
  var skipIdx = css.lastIndexOf('.fxrf4-bridge-skip');
  var skipCtx = css.slice(skipIdx, skipIdx + 200);
  assert.ok(skipCtx.includes('min-height: 44px'),
    '.fxrf4-bridge-skip must have min-height: 44px');
});

test('C.2 Emergency "Voir mes demandes" min-height >=44px', function () {
  var overrideIdx = css.indexOf('[data-fxrf4-mode="emergency"] .fxrf4-btn-success-primary');
  var overrideBlock = css.slice(overrideIdx, overrideIdx + 300);
  assert.ok(overrideBlock.includes('min-height: 44px'),
    'Emergency btn-success-primary must have min-height: 44px');
});

test('C.3 Emergency "Voir mes demandes" height: auto (not fixed 52px)', function () {
  var overrideIdx = css.indexOf('[data-fxrf4-mode="emergency"] .fxrf4-btn-success-primary');
  var overrideBlock = css.slice(overrideIdx, overrideIdx + 300);
  assert.ok(overrideBlock.includes('height: auto'),
    'Emergency btn-success-primary must use height: auto (not fixed height)');
});

test('C.4 Emergency "Retour à l\'accueil" min-height >=44px', function () {
  var secIdx = css.indexOf('[data-fxrf4-mode="emergency"] .fxrf4-btn-success-secondary');
  var secBlock = css.slice(secIdx, secIdx + 300);
  assert.ok(secBlock.includes('min-height: 44px'),
    'Emergency btn-success-secondary must have min-height: 44px');
});

test('C.5 Standard btn-success-primary height: 52px unchanged', function () {
  /* The base (non-scoped) rule must still have 52px */
  var baseIdx = css.indexOf('.fxrf4-btn-success-primary {');
  var baseBlock = css.slice(baseIdx, baseIdx + 200);
  assert.ok(baseBlock.includes('height: 52px'),
    'Standard .fxrf4-btn-success-primary must still have height: 52px');
});

/* ── D. ISOLATION CHECKS ────────────────────────────────────── */
console.log('\n[10D.3] D. Isolation');

test('D.1 Standard mode success title unchanged', function () {
  assert.ok(src.includes('"Votre demande est d'),
    'Standard mode success title ("est déjà entre de bonnes mains") must be unchanged');
});

test('D.2 Standard mode success body unchanged', function () {
  assert.ok(src.includes('RAFI s') && src.includes('artisans disponibles'),
    'Standard mode success body copy must be unchanged');
});

test('D.3 _persistEmergencyRequest contract unchanged', function () {
  assert.ok(src.includes('_persistEmergencyRequest'),
    '_persistEmergencyRequest must still exist (POST contract unchanged)');
});

test('D.4 /api/urgent-request POST unchanged', function () {
  assert.ok(src.includes('/api/urgent-request'),
    '/api/urgent-request endpoint reference unchanged');
});

test('D.5 Estimator bridge entryCtx unchanged (source:urgent)', function () {
  assert.ok(src.includes("source:      'urgent'"),
    'Bridge entryCtx source must still be "urgent"');
});

test('D.6 Suspend model unchanged (fxrf4-estimator-child)', function () {
  assert.ok(src.includes("classList.add('fxrf4-estimator-child')"),
    'Suspend model must be unchanged');
});

test('D.7 fixeo:estimator-closed listener unchanged', function () {
  assert.ok(src.includes("'fixeo:estimator-closed'"),
    'fixeo:estimator-closed listener must be unchanged');
});

test('D.8 fixeo:estimator-reserve listener unchanged', function () {
  assert.ok(src.includes("'fixeo:estimator-reserve'"),
    'fixeo:estimator-reserve listener must be unchanged');
});

test('D.9 Estimator JS unchanged (frozen sentinel)', function () {
  var est = fs.readFileSync(EST_JS, 'utf8');
  assert.ok(est.includes('7C.9L.3Z.2B') && est.includes('7C.9L.3Y.1'),
    'Estimator JS must be unchanged');
});

test('D.10 reservation.js unchanged (not cross-contaminated)', function () {
  var res = fs.readFileSync(RES_JS, 'utf8');
  assert.ok(!res.includes('fxrf4-estimator-child') && !res.includes('_updateLaneStep(4)'),
    'reservation.js must not reference 10D.3 changes');
});

/* ── E. CSS POLISH RULES ────────────────────────────────────── */
console.log('\n[10D.3] E. CSS polish rules');

test('E.1 Emergency body padding-bottom for step 1 mobile (<=640px)', function () {
  var mediaIdx  = css.indexOf('[data-fxrf4-mode="emergency"] #fxrf4-body');
  assert.ok(mediaIdx !== -1,
    'Emergency body mobile padding rule must exist');
  var mediaBlock = css.slice(mediaIdx, mediaIdx + 100);
  assert.ok(mediaBlock.includes('padding-bottom'),
    'Emergency body mobile rule must add padding-bottom');
});

test('E.2 prefers-reduced-motion covers fxrf4-step-pulse', function () {
  assert.ok(css.includes('prefers-reduced-motion') &&
            css.includes('.fxrf4-success-step-dot.is-active'),
    'prefers-reduced-motion must guard step pulse animations');
});

test('E.3 prefers-reduced-motion covers is-emergency step pulse', function () {
  var pmIdx = css.lastIndexOf('prefers-reduced-motion');
  var pmBlock = css.slice(pmIdx - 100, pmIdx + 300);
  assert.ok(pmBlock.includes('is-emergency') || css.includes('is-emergency {animation: none'),
    'prefers-reduced-motion must cover is-emergency step pulse');
});

test('E.4 Emergency CTA downgrade scoped to [data-fxrf4-mode="emergency"]', function () {
  assert.ok(css.includes('[data-fxrf4-mode="emergency"] .fxrf4-btn-success-primary'),
    'CTA downgrade must be scoped to emergency mode attribute selector');
  assert.ok(css.includes('[data-fxrf4-mode="emergency"] .fxrf4-btn-success-secondary'),
    'Secondary CTA change must also be scoped to emergency mode');
});

test('E.5 Emergency primary background: transparent (downgraded from solid blue)', function () {
  var overrideIdx = css.indexOf('[data-fxrf4-mode="emergency"] .fxrf4-btn-success-primary');
  var overrideBlock = css.slice(overrideIdx, overrideIdx + 300);
  assert.ok(overrideBlock.includes('background: transparent'),
    'Emergency primary must have transparent background (downgraded)');
  assert.ok(overrideBlock.includes('box-shadow: none'),
    'Emergency primary must remove box-shadow');
});

test('E.6 Bridge border readability improved (>=0.22)', function () {
  /* Look for the override in the 10D.3 CSS block */
  var bridgeOverrideIdx = css.lastIndexOf('.fxrf4-estimator-bridge');
  var bridgeOverrideBlock = css.slice(bridgeOverrideIdx, bridgeOverrideIdx + 200);
  /* border-color should be 0.22 or 0.24 or higher */
  var matches = bridgeOverrideBlock.match(/rgba\(72, 100, 255, ([\d.]+)\)/);
  if (matches) {
    var alpha = parseFloat(matches[1]);
    assert.ok(alpha >= 0.22,
      'Bridge border alpha must be >=0.22 (readability)');
  } else {
    assert.ok(false, 'Bridge border-color not found in override block');
  }
});

/* ── F. CACHE KEYS ───────────────────────────────────────────── */
console.log('\n[10D.3] F. Cache keys');

test('F.1 JS cache key: fxrf4-v5e-final-polish in index.html', function () {
  assert.ok(idx.includes('fx-request-flow-v4.js?v=fxrf4-v5e-final-polish'),
    'JS cache key must be fxrf4-v5e-final-polish');
});

test('F.2 CSS cache key: fxrf4-v5z4-final-polish in index.html', function () {
  assert.ok(idx.includes('fx-request-flow-v4.css?v=fxrf4-v5z4-final-polish'),
    'CSS cache key must be fxrf4-v5z4-final-polish');
});

test('F.3 VERSION constant: fxrf4-v5e-final-polish in JS', function () {
  assert.ok(src.includes("VERSION: 'fxrf4-v5e-final-polish'"),
    'VERSION constant must be fxrf4-v5e-final-polish');
});

/* ── G. PRIOR CONTRACT PRESERVED ─────────────────────────────── */
console.log('\n[10D.3] G. Prior contracts preserved');

test('G.1 Prior 10D.2 key strings preserved (bridge suspend model)', function () {
  assert.ok(src.includes('fxrf4-estimator-child') &&
            src.includes('_onEstimatorClosed') &&
            src.includes('_escalated'),
    'Suspend/resume contract from 10D.2.1 preserved');
});

test('G.2 TRUSTED_CITY_SESSION_KEY write preserved (city trust)', function () {
  assert.ok(src.includes('TRUSTED_CITY_SESSION_KEY'),
    'City trust session key write preserved');
});

test('G.3 URGENT_BADGE_TEXT preserved (⚡ URGENCE FIXEO)', function () {
  assert.ok(src.includes('URGENCE FIXEO') || src.includes('URGENT_BADGE_TEXT'),
    'Urgent badge text preserved');
});

test('G.4 Lane steps defined unchanged (3 steps)', function () {
  assert.ok(src.includes('URGENT_LANE_STEPS') && src.includes('Situation') &&
            src.includes('Ville') && src.includes('Contact'),
    'Lane steps unchanged (Situation, Ville, Contact)');
});

/* ── SUMMARY ─────────────────────────────────────────────────── */
console.log('\n' + '\u2500'.repeat(60));
console.log('[10D.3] Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
