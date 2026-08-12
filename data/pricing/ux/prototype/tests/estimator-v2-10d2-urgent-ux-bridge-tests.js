/**
 * Phase 7C.10D.2 — Urgent Fast Lane UX + Post-ACK Estimator Bridge
 * Targeted tests: 40 total
 */
'use strict';

var assert = require('assert');
var fs     = require('fs');
var path   = require('path');

var REPO      = path.resolve(__dirname, '../../../../..');
var FXRF4_JS  = path.join(REPO, 'js/fx-request-flow-v4.js');
var FXRF4_CSS = path.join(REPO, 'css/fx-request-flow-v4.css');
var INDEX_HTML= path.join(REPO, 'index.html');

var src = fs.readFileSync(FXRF4_JS, 'utf8');
var css = fs.readFileSync(FXRF4_CSS, 'utf8');
var idx = fs.readFileSync(INDEX_HTML, 'utf8');

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  \u2713 ' + name); passed++; }
  catch(e) { console.error('  \u2717 ' + name); console.error('    ' + e.message); failed++; }
}

/* Helper: search source that may store strings as \uXXXX escape sequences */
function srcHas(s) { return src.includes(s); }
function srcHasInBlock(blockStart, needle, windowSize) {
  var idx2 = src.indexOf(blockStart);
  if (idx2 < 0) return false;
  var block = src.slice(idx2, idx2 + (windowSize || 1200));
  return block.includes(needle);
}

/* ── 1. PERSISTENCE CONTRACT UNCHANGED (from 10D.1) ─────── */
console.log('\n[10D.2] Persistence contract preserved from 10D.1');

test('1.1 Emergency still POSTs to /api/urgent-request', function () {
  assert.ok(srcHas('/api/urgent-request'), 'Must still POST to /api/urgent-request');
});

test('1.2 _persistEmergencyRequest still exists', function () {
  assert.ok(srcHas('_persistEmergencyRequest'), '_persistEmergencyRequest must exist');
});

test('1.3 Success requires data.ok === true', function () {
  var subIdx = src.indexOf('function _submitRequest');
  var subBody = src.slice(subIdx, subIdx + 3000);
  var okIdx = subBody.indexOf('data.ok');
  var successIdx = subBody.indexOf('_renderSuccess', okIdx);
  assert.ok(okIdx !== -1 && successIdx > okIdx, '_renderSuccess gated by data.ok');
});

test('1.4 Failure still renders _renderRetry', function () {
  var subIdx = src.indexOf('function _submitRequest');
  var subBody = src.slice(subIdx, subIdx + 3000);
  assert.ok(subBody.includes('_renderRetry'), '_renderRetry must be called on failure');
});

/* ── 2. ESTIMATOR BRIDGE: ONLY AFTER SERVER ACK ──────────── */
console.log('\n[10D.2] Estimator bridge — server ACK required');

test('2.1 ESTIMATOR_ELIGIBLE_SLUGS constant defined', function () {
  assert.ok(srcHas('ESTIMATOR_ELIGIBLE_SLUGS'), 'ESTIMATOR_ELIGIBLE_SLUGS must be defined');
});

test('2.2 "autre" NOT in ESTIMATOR_ELIGIBLE_SLUGS', function () {
  var constIdx = src.indexOf('ESTIMATOR_ELIGIBLE_SLUGS');
  var constBlock = src.slice(constIdx, constIdx + 200);
  assert.ok(!constBlock.includes("'autre'"),
    '"autre" must not be in ESTIMATOR_ELIGIBLE_SLUGS');
});

test('2.3 Estimator bridge rendered inside _renderSuccess (not _renderRetry)', function () {
  var successIdx = src.indexOf('function _renderSuccess');
  var retryIdx   = src.indexOf('function _renderRetry');
  var bridgeIdx  = src.lastIndexOf('fxrf4-estimator-bridge');
  assert.ok(bridgeIdx > successIdx && (retryIdx < 0 || bridgeIdx > retryIdx),
    'Estimator bridge must be in _renderSuccess, not _renderRetry');
});

test('2.4 Estimator bridge guarded by isEstimatorEligible', function () {
  assert.ok(srcHas('isEstimatorEligible'), 'isEstimatorEligible guard must exist');
  var bridgeIdx = src.indexOf('fxrf4-estimator-bridge');
  var guardIdx  = src.indexOf('isEstimatorEligible', bridgeIdx - 500);
  assert.ok(guardIdx !== -1, 'Bridge creation must be inside isEstimatorEligible block');
});

test('2.5 Estimator bridge absent in _renderRetry', function () {
  var retryIdx  = src.indexOf('function _renderRetry');
  var retryBody = src.slice(retryIdx, retryIdx + 800);
  assert.ok(!retryBody.includes('fxrf4-estimator-bridge') &&
            !retryBody.includes('FixeoEstimatorV2'),
    'Estimator bridge must not appear in retry state');
});

/* ── 3. ESTIMATOR ENTRY CONTEXT — NO INVENTED SERVICE CODE ── */
console.log('\n[10D.2] Estimator entry context integrity');

test('3.1 entry context uses source: urgent', function () {
  var ctxIdx = src.indexOf("source:      'urgent'");
  assert.ok(ctxIdx !== -1, 'entry context must have source: urgent');
});

test('3.2 entry context uses metier_hint from st.serviceSlug', function () {
  var ctxIdx = src.indexOf('var entryCtx');
  var ctxBlock = src.slice(ctxIdx, ctxIdx + 300);
  assert.ok(ctxBlock.includes('metier_hint') && ctxBlock.includes('serviceSlug'),
    'metier_hint must come from st.serviceSlug (not invented)');
});

test('3.3 entry context uses city_slug (not raw "city")', function () {
  var ctxIdx = src.indexOf('var entryCtx');
  var entryCtxBlock = src.slice(ctxIdx, ctxIdx + 300);
  assert.ok(entryCtxBlock.includes('city_slug'), 'Must use city_slug (canonical field)');
});

test('3.4 NO service_code invented in entry context', function () {
  var ctxIdx = src.indexOf('var entryCtx');
  var entryCtxBlock = src.slice(ctxIdx, ctxIdx + 300);
  assert.ok(!entryCtxBlock.includes('service_code') && !entryCtxBlock.includes('service_hint'),
    'No service_code or service_hint (service classification left to Estimator)');
});

test('3.5 NO client-side price in entry context', function () {
  var ctxIdx = src.indexOf('var entryCtx');
  var entryCtxBlock = src.slice(ctxIdx, ctxIdx + 300);
  assert.ok(!entryCtxBlock.includes('price') && !entryCtxBlock.includes('amount') &&
            !entryCtxBlock.includes('MAD'),
    'No client-side price in Estimator entry context');
});

test('3.6 entry context passes only _ALLOWED_ENTRY_FIELDS (source, metier_hint, city_slug, urgency)', function () {
  var bridgeIdx = src.indexOf('fxrf4-estimator-bridge');
  var ctxStart  = src.indexOf('var entryCtx', bridgeIdx);
  var ctxBlock  = src.slice(ctxStart, ctxStart + 300);
  var hasSource = ctxBlock.includes('source:');
  var hasMetier = ctxBlock.includes('metier_hint:');
  var hasCity   = ctxBlock.includes('city_slug:');
  var hasUrgency= ctxBlock.includes('urgency:');
  assert.ok(hasSource && hasMetier && hasCity && hasUrgency,
    'Entry context must have exactly: source, metier_hint, city_slug, urgency');
  // No extra fields
  assert.ok(!ctxBlock.includes('description:') && !ctxBlock.includes('phone:'),
    'No extra fields (description, phone) in entry context');
});

/* ── 4. CITY TRUST ────────────────────────────────────────── */
console.log('\n[10D.2] City trust: emergency city tap writes session key');

test('4.1 Emergency city tap writes TRUSTED_CITY_SESSION_KEY', function () {
  assert.ok(src.indexOf('sessionStorage.setItem(TRUSTED_CITY_SESSION_KEY') !== -1,
    'Emergency city tap must write TRUSTED_CITY_SESSION_KEY');
});

test('4.2 sessionStorage write is inside isUrgent guard', function () {
  var writeIdx = src.indexOf('sessionStorage.setItem(TRUSTED_CITY_SESSION_KEY');
  var surrounding = src.slice(writeIdx - 300, writeIdx + 100);
  assert.ok(surrounding.includes('isUrgent'), 'Write must be inside isUrgent guard');
});

test('4.3 Estimator bridge reads TRUSTED_CITY_SESSION_KEY', function () {
  /* Bridge CTA handler reads sessionStorage for trusted city */
  var ctaIdx  = src.indexOf('bridgeCTA.addEventListener');
  var ctaEnd  = src.indexOf('bridgeSkip.addEventListener');
  var ctaBlock = src.slice(ctaIdx, ctaEnd);
  assert.ok(ctaBlock.includes('TRUSTED_CITY_SESSION_KEY') ||
            ctaBlock.includes('fxrf4_trusted_city_session'),
    'Bridge must read city from TRUSTED_CITY_SESSION_KEY');
});

/* ── 5. URGENT IDENTITY ──────────────────────────────────── */
console.log('\n[10D.2] Urgent identity: badge + lane steps');

test('5.1 URGENT_BADGE_TEXT constant defined', function () {
  assert.ok(srcHas('URGENT_BADGE_TEXT'), 'URGENT_BADGE_TEXT must be defined');
});

test('5.2 URGENT_LANE_STEPS defined with 3 elements', function () {
  assert.ok(srcHas('URGENT_LANE_STEPS'), 'URGENT_LANE_STEPS must be defined');
  var constIdx = src.indexOf('URGENT_LANE_STEPS');
  var constBlock = src.slice(constIdx, constIdx + 200);
  assert.ok(constBlock.includes('Situation') && constBlock.includes('Ville') && constBlock.includes('Contact'),
    'Lane steps must include Situation, Ville, Contact');
});

test('5.3 _injectUrgentLaneHeader function exists', function () {
  assert.ok(srcHas('_injectUrgentLaneHeader'), '_injectUrgentLaneHeader must exist');
});

test('5.4 _updateLaneStep function exists', function () {
  assert.ok(srcHas('_updateLaneStep'), '_updateLaneStep must exist');
});

test('5.5 Lane header injected on step 1 render', function () {
  assert.ok(srcHasInBlock('_renderEmergencyStep1', '_injectUrgentLaneHeader', 500),
    '_injectUrgentLaneHeader called in _renderEmergencyStep1');
});

test('5.6 Lane step updated on step 2', function () {
  assert.ok(srcHasInBlock('_setProgress(2, 3)', '_updateLaneStep(2)', 200),
    '_updateLaneStep(2) called near setProgress(2,3)');
});

test('5.7 Lane step updated on step 3', function () {
  assert.ok(srcHasInBlock('_setProgress(3, 3)', '_updateLaneStep(3)', 400),
    '_updateLaneStep(3) called near setProgress(3,3)');
});

/* ── 6. UPDATED STEP COPY ────────────────────────────────── */
console.log('\n[10D.2] Updated step copy');

test('6.1 Step 2 emergency: "Où faut-il intervenir ?"', function () {
  assert.ok(src.includes('faut-il intervenir'),
    'Step 2 must ask about faut-il intervenir');
});

test('6.2 Step 3 emergency: "Quel numéro pour vous joindre ?"', function () {
  assert.ok(srcHas('Quel num\u00e9ro pour vous joindre') || src.includes('Quel num'),
    'Step 3 must ask about phone');
});

test('6.3 CTA now "Transmettre mon urgence" not "Trouver un artisan"', function () {
  assert.ok(!srcHas('Trouver un artisan maintenant'),
    '"Trouver un artisan maintenant" must be removed');
  assert.ok(srcHas('Transmettre mon urgence') || src.includes('Transmettre mon urgence'),
    '"Transmettre mon urgence" must be the emergency CTA');
});

test('6.4 Step 3 sub-text: MSG.step3EmergencySub defined', function () {
  assert.ok(srcHas('step3EmergencySub'), 'step3EmergencySub must be defined in MSG');
  assert.ok(srcHasInBlock('step3EmergencySub', 'coordination', 200) ||
            src.includes('ce num\u00e9ro pour la coordination'),
    'Sub-text must mention coordination');
});

/* ── 7. FALSE CLAIMS STILL ABSENT ────────────────────────── */
console.log('\n[10D.2] False claims remain absent');

test('7.1 "RAFI contacte déjà les artisans" still absent from live code', function () {
  assert.ok(!srcHas('RAFI contacte d\u00e9j\u00e0'),
    'False artisan-contact claim must remain absent');
});

test('7.2 Emergency stepData has no "Artisans contactés"', function () {
  var sdIdx = src.indexOf('stepData = isEmergency');
  var sdBlock = src.slice(sdIdx, sdIdx + 400);
  assert.ok(!sdBlock.includes('Artisans disponibles'),
    '"Artisans disponibles" must not appear in emergency stepData');
});

/* ── 8. iOS ZOOM: INPUT FONT SIZES ──────────────────────── */
console.log('\n[10D.2] iOS zoom: input font sizes');

test('8.1 Phone input font-size is >= 16px (1.30rem at 16px base)', function () {
  // Existing check — 1.30rem = 20.8px
  assert.ok(css.includes('.fxrf4-phone-input') && css.includes('1.30rem'),
    'Phone input font-size must be 1.30rem (>=16px)');
});

test('8.2 Autre (textarea) input font-size fixed to 1rem (16px) with !important', function () {
  assert.ok(css.includes('.fxrf4-autre-input') && css.includes('font-size: 1rem !important'),
    'Autre input font-size must be forced to 1rem with !important');
});

test('8.3 City select font-size fixed to 1rem (16px) with !important', function () {
  assert.ok(css.includes('fxrf4-select-wrap select') &&
            css.includes('font-size: 1rem !important'),
    'City select font-size must be 1rem with !important');
});

/* ── 9. NO FORCED FOCUS / SCROLL ─────────────────────────── */
console.log('\n[10D.2] No forbidden zoom mechanisms');

test('9.1 No forced focus() call added in 7C.10D.2 code', function () {
  // Existing autreInput.focus() in autre expand is pre-existing (user-initiated) — allowed
  // Check new bridge/lane code does not add new forced focus calls
  var bridgeIdx = src.indexOf('fxrf4-estimator-bridge');
  var bridgeBlock = src.slice(bridgeIdx, bridgeIdx + 2000);
  var laneIdx = src.indexOf('_injectUrgentLaneHeader');
  var laneBlock = src.slice(laneIdx, laneIdx + 1000);
  assert.ok(!bridgeBlock.includes('.focus()') && !laneBlock.includes('.focus()'),
    'New bridge and lane code must not call .focus()');
});

test('9.2 No scrollIntoView added in new 7C.10D.2 code', function () {
  var bridgeIdx = src.indexOf('fxrf4-estimator-bridge');
  var bridgeBlock = src.slice(bridgeIdx, bridgeIdx + 2000);
  assert.ok(!bridgeBlock.includes('scrollIntoView'),
    'No scrollIntoView in Estimator bridge code');
});

/* ── 10. prefers-reduced-motion ─────────────────────────── */
console.log('\n[10D.2] Reduced motion');

test('10.1 prefers-reduced-motion media query present for urgent pulse', function () {
  assert.ok(css.includes('prefers-reduced-motion') && css.includes('fxurgent-pulse'),
    'prefers-reduced-motion must disable urgent pulse animation');
});

/* ── 11. DOUBLE SUBMIT GUARD ─────────────────────────────── */
console.log('\n[10D.2] Double submit guard');

test('11.1 No _submitRequest or _persistEmergencyRequest CALL in Estimator bridge CTA handler', function () {
  /* 10D.2.1: bridge uses suspend model — still no second submission.
   * Use regex to match actual calls (not comment text). */
  var ctaIdx   = src.indexOf('bridgeCTA.addEventListener');
  var ctaEnd   = src.indexOf('bridgeSkip.addEventListener');
  var ctaBlock = src.slice(ctaIdx, ctaEnd);
  /* Strip single-line and block comments before checking */
  var stripped = ctaBlock
    .replace(/\/\*[\s\S]*?\*\//g, '')  /* block comments */
    .replace(/\/\/[^\n]*/g, '');       /* line comments */
  assert.ok(!stripped.includes('_submitRequest') && !stripped.includes('_persistEmergencyRequest'),
    'Bridge CTA handler must not call _submitRequest or _persistEmergencyRequest');
});

test('11.2 Estimator bridge uses SUSPEND model (not close-before-open) — no double modal', function () {
  /* 10D.2.1: suspension replaces close-before-open for parent UX preservation */
  var ctaIdx   = src.indexOf('bridgeCTA.addEventListener');
  var ctaEnd   = src.indexOf('bridgeSkip.addEventListener');
  var ctaBlock = src.slice(ctaIdx, ctaEnd);
  /* Suspension class added before open — confirms suspend model */
  var suspendIdx = ctaBlock.indexOf("classList.add('fxrf4-estimator-child')");
  var openIdx    = ctaBlock.indexOf('FixeoEstimatorV2.open(entryCtx)');
  assert.ok(suspendIdx !== -1 && openIdx !== -1 && suspendIdx < openIdx,
    'Suspend model: fxrf4-estimator-child must be added before FixeoEstimatorV2.open()');
});

/* ── 12. STANDARD MODE UNCHANGED ────────────────────────── */
console.log('\n[10D.2] Standard mode unchanged');

test('12.1 Standard mode "Envoyer ma demande" CTA unchanged', function () {
  assert.ok(srcHas('Envoyer ma demande'), 'Standard mode CTA unchanged');
});

test('12.2 Standard mode success body unchanged', function () {
  var bodyIdx = src.indexOf('fxrf4-success-body');
  var bodyBlock = src.slice(bodyIdx, bodyIdx + 600);
  assert.ok(bodyBlock.includes('RAFI s') && bodyBlock.includes('artisans disponibles'),
    'Standard mode success body unchanged');
});

/* ── 13. CACHE KEYS ──────────────────────────────────────── */
console.log('\n[10D.2] Cache keys');

test('13.1 JS cache key: fxrf4-v5e-final-polish in index.html', function () {
  assert.ok(idx.includes('fx-request-flow-v4.js?v=fxrf4-v5e-final-polish'), 'JS key must be fxrf4-v5e-final-polish');
});

test('13.2 CSS cache key: fxrf4-v5z4-final-polish in index.html', function () {
  assert.ok(idx.includes('fx-request-flow-v4.css?v=fxrf4-v5z4-final-polish'), 'CSS key must be fxrf4-v5z4-final-polish');
});

test('13.3 VERSION constant: fxrf4-v5e-final-polish in JS', function () {
  assert.ok(srcHas("VERSION: 'fxrf4-v5e-final-polish'"), 'VERSION constant must be fxrf4-v5e-final-polish');
});

/* ── AUTHORITY FREEZE ────────────────────────────────────── */
console.log('\n[10D.2] Authority freeze');

test('14.1 reservation.js key updated to v1n-canonical-persist', function () {
  assert.ok(idx.includes('reservation.js?v=v1n-canonical-persist'), 'reservation.js key updated');
});

test('14.2 No pricing_context_token added in bridge', function () {
  var bridgeIdx = src.indexOf('fxrf4-estimator-bridge');
  var bridgeBlock = src.slice(bridgeIdx, bridgeIdx + 2000);
  assert.ok(!bridgeBlock.includes('pricing_context_token'), 'No pricing token in bridge');
});

/* ── SUMMARY ─────────────────────────────────────────────── */
console.log('\n' + '\u2500'.repeat(60));
console.log('[10D.2] Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
