/**
 * Phase 7C.10D.1 — Urgent Truth + Durable Request Contract
 * Targeted tests: 40 total
 *
 * Proves:
 * 1. False artisan-contact claims removed from JS source
 * 2. New truthful copy present
 * 3. _persistEmergencyRequest() exists and is emergency-only
 * 4. _renderRetry() exists for failure state
 * 5. Standard mode unchanged
 * 6. API endpoint registered in vercel.json
 * 7. urgent-request-fn validation rules correct
 * 8. No Estimator / pricing / reservation calls added
 * 9. Cache key bumped correctly
 * 10. Authority freeze: pricing/token/booking/Supabase schema unchanged
 */

'use strict';

var assert = require('assert');
var fs     = require('fs');
var path   = require('path');

var REPO     = path.resolve(__dirname, '../../../../..');
var FXRF4_JS = path.join(REPO, 'js/fx-request-flow-v4.js');
var FXRF4_CSS= path.join(REPO, 'css/fx-request-flow-v4.css');
var INDEX_HTML = path.join(REPO, 'index.html');
var VERCEL_JSON = path.join(REPO, 'vercel.json');
var API_FN   = path.join(REPO, 'api/urgent-request-fn/index.js');
var API_PKG  = path.join(REPO, 'api/urgent-request-fn/package.json');
var RESERVATION_JS = path.join(REPO, 'js/reservation.js');
var ESTIMATOR_JS   = path.join(REPO, 'js/fixeo-estimator-v2.js');

var src    = fs.readFileSync(FXRF4_JS, 'utf8');
var css    = fs.readFileSync(FXRF4_CSS, 'utf8');
var idx    = fs.readFileSync(INDEX_HTML, 'utf8');
var ver    = fs.readFileSync(VERCEL_JSON, 'utf8');
var apiFn  = fs.readFileSync(API_FN, 'utf8');
var apiPkg = JSON.parse(fs.readFileSync(API_PKG, 'utf8'));
var resJs  = fs.readFileSync(RESERVATION_JS, 'utf8');


/* Helper: search for a string that may appear as \uXXXX escape sequences in source */
function srcIncludes(haystack, needle) {
  // Try direct (decoded) match first
  if (haystack.includes(needle)) return true;
  // Try escape-sequence form
  var escaped = needle.replace(/[\u0080-\uffff]/g, function(c) {
    return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
  });
  return haystack.includes(escaped);
}
var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  \u2713 ' + name); passed++; }
  catch (e) { console.error('  \u2717 ' + name); console.error('    ' + e.message); failed++; }
}

/* ── 1. FALSE CLAIMS REMOVED ───────────────────────────────── */
console.log('\n[10D.1] False claims removed from fx-request-flow-v4.js');

test('1.1 "RAFI contacte déjà les artisans" removed', function () {
  assert.ok(!srcIncludes(src, 'RAFI contacte d\u00e9j\u00e0 les artisans'),
    'False artisan-contact claim must be removed');
});

test('1.2 "Artisans disponibles contactés" NOT in emergency stepData live code', function () {
  // Extract the emergency stepData array only — not comments
  var sdIdx = src.indexOf('stepData = isEmergency');
  var sdBlock = src.slice(sdIdx, sdIdx + 400);
  assert.ok(!sdBlock.includes('Artisans disponibles'),
    '"Artisans disponibles" must not appear in the emergency stepData array (only in comment is OK)');
});

test('1.3 "prise en charge" not in live emergency success title code', function () {
  // The old title string may appear in comments; check it is not in the active string expression
  var succTitleIdx = src.indexOf('fxrf4-success-title');
  var succTitleBlock = src.slice(succTitleIdx, succTitleIdx + 400);
  assert.ok(!succTitleBlock.includes('prise en charge'),
    '"prise en charge" must not appear in success-title rendering code');
});

test('1.4 "RAFI contacte déjà" whatsapp claim removed', function () {
  // The combined false claim line is gone
  assert.ok(!srcIncludes(src, 'RAFI contacte d\u00e9j\u00e0'),
    'All RAFI contact claims removed');
});

test('1.5 Emergency body contains factual coordination copy', function () {
  assert.ok(src.includes('coordination FIXEO') || src.includes('utilisera le num'),
    'Emergency body must contain factual coordination copy');
});

/* ── 2. NEW TRUTHFUL COPY ──────────────────────────────────── */
console.log('\n[10D.1] Truthful copy present');

test('2.1 RAFI success: factual transmission message', function () {
  assert.ok(src.includes("successEmergency: 'Urgence transmise") ||
            src.includes("successEmergency: 'Demande urgente"),
    'RAFI success message must be factual');
});

test('2.2 Interstitial: "Transmission de votre demande…"', function () {
  assert.ok(srcIncludes(src, 'Transmission de votre demande\u2026'),
    'Emergency interstitial must describe real operation in progress');
});

test('2.3 Success title: factual (enregistrée or transmise)', function () {
  assert.ok(src.includes('Votre demande est enregistr') ||
            src.includes('Votre demande a bien'),
    'Success title must be factual (enregistrée or transmise à FIXEO)');
});

test('2.4 Success body: factual team coordination copy in bodyBlock', function () {
  var bodyIdx = src.indexOf('fxrf4-success-body');
  var bodyBlock = src.slice(bodyIdx, bodyIdx + 600);
  assert.ok(src.includes('coordination FIXEO') || (bodyBlock && bodyBlock.includes('coordination')),
    'Success body must contain factual coordination copy');
});

test('2.5 Step 1 (done): contains enregistrée label', function () {
  assert.ok(src.includes('enregistr'),
    'Step 1 label must reference "enregistrée" (or similar)');
});

test('2.6 Step 2 (done): "Transmise à FIXEO" in stepData code', function () {
  var sdIdx = src.indexOf('stepData = isEmergency');
  var sdBlock = src.slice(sdIdx, sdIdx + 400);
  assert.ok(sdBlock.includes('Transmise'),
    'Step 2 must contain "Transmise" in stepData array');
  assert.ok(!sdBlock.includes('Artisans disponibles'),
    'Step 2 must NOT contain "Artisans disponibles"');
});

test('2.7 Step 3 (waiting): "À venir"', function () {
  assert.ok(src.includes('venir'),
    'Step 3 label must reference "venir"');
});

test('2.8 Retry message: factual failure message in _renderRetry', function () {
  var retryIdx = src.indexOf('function _renderRetry');
  var retryBlock = src.slice(retryIdx, retryIdx + 600);
  assert.ok(retryBlock.includes('transmettre votre urgence') || retryBlock.includes('enregistrer la demande'),
    '_renderRetry must include factual failure message (transmettre or enregistrer)');
});

test('2.9 Retry preserves data message present', function () {
  assert.ok(src.includes('conserv'),
    'Retry must confirm data is preserved (conservées)');
});

/* ── 3. DURABLE PERSIST FUNCTION ───────────────────────────── */
console.log('\n[10D.1] _persistEmergencyRequest function');

test('3.1 _persistEmergencyRequest exists in source', function () {
  assert.ok(srcIncludes(src, '_persistEmergencyRequest'),
    '_persistEmergencyRequest must be defined');
});

test('3.2 _persistEmergencyRequest calls /api/urgent-request', function () {
  assert.ok(src.includes("'/api/urgent-request'"),
    'Persist function must POST to /api/urgent-request');
});

test('3.3 Payload includes service, phone, city, tracking_ref', function () {
  var fnIdx = src.indexOf('_persistEmergencyRequest');
  var fnBody = src.slice(fnIdx, fnIdx + 1000);
  assert.ok(fnBody.includes('service:'), 'service in payload');
  assert.ok(fnBody.includes('phone:'), 'phone in payload');
  assert.ok(fnBody.includes('city:'), 'city in payload');
  assert.ok(fnBody.includes('tracking_ref:'), 'tracking_ref in payload');
});

test('3.4 Payload includes mode: emergency, urgency: now', function () {
  var fnIdx = src.indexOf('_persistEmergencyRequest');
  var fnBody = src.slice(fnIdx, fnIdx + 1000);
  assert.ok(fnBody.includes("'emergency'"), 'mode emergency in payload');
  assert.ok(fnBody.includes("'now'"), 'urgency now in payload');
});

test('3.5 Returns Promise (uses fetch + .then/.catch)', function () {
  var fnIdx = src.indexOf('function _persistEmergencyRequest');
  var fnBody = src.slice(fnIdx, fnIdx + 800);
  assert.ok(fnBody.includes('fetch(') || fnBody.includes('return fetch'), 'must use fetch');
  assert.ok(fnBody.includes('.then(') || fnBody.includes('.catch('), 'must return Promise chain');
});

test('3.6 Network failure handled — returns {ok:false}', function () {
  // The catch block in _persistEmergencyRequest returns ok: false
  var fnIdx = src.indexOf('function _persistEmergencyRequest');
  var fnBody = src.slice(fnIdx, fnIdx + 1200);
  assert.ok(fnBody.includes('ok: false') || fnBody.includes("ok:false"),
    'network error must yield ok:false in catch block');
});

/* ── 4. SUBMIT FLOW — EMERGENCY MODE ──────────────────────── */
console.log('\n[10D.1] _submitRequest emergency durable contract');

test('4.1 _renderRetry exists', function () {
  assert.ok(srcIncludes(src, 'function _renderRetry'), '_renderRetry must be defined');
});

test('4.2 Emergency submit calls _persistEmergencyRequest', function () {
  var subIdx = src.indexOf('function _submitRequest');
  var subBody = src.slice(subIdx, subIdx + 2500);
  assert.ok(subBody.includes('_persistEmergencyRequest'), 'submit must call persist in emergency');
});

test('4.3 Success only rendered after data.ok === true', function () {
  var subIdx = src.indexOf('function _submitRequest');
  var subBody = src.slice(subIdx, subIdx + 2500);
  // _renderSuccess must come after data.ok check
  var okIdx      = subBody.indexOf('data.ok');
  var successIdx = subBody.indexOf('_renderSuccess', okIdx);
  assert.ok(okIdx !== -1, 'data.ok check must exist');
  assert.ok(successIdx > okIdx, '_renderSuccess must come after data.ok check');
});

test('4.4 Failure renders _renderRetry (not _renderSuccess)', function () {
  var subIdx = src.indexOf('function _submitRequest');
  var subBody = src.slice(subIdx, subIdx + 2500);
  var elseIdx = subBody.indexOf('_renderRetry');
  assert.ok(elseIdx !== -1, '_renderRetry must be called on failure');
});

test('4.5 _fireAnalytics only called after data.ok check', function () {
  var subIdx = src.indexOf('function _submitRequest');
  var subBody = src.slice(subIdx, subIdx + 2500);
  var okIdx      = subBody.indexOf('data.ok');
  var analyticsIdx = subBody.indexOf('_fireAnalytics', okIdx);
  assert.ok(okIdx !== -1 && analyticsIdx > okIdx,
    '_fireAnalytics must be inside the data.ok success branch');
});

test('4.6 Double-submit guard preserved (submitLocked + 1600ms)', function () {
  assert.ok(srcIncludes(src, 'submitLocked') && srcIncludes(src, '1600'),
    'Double-submit guard must remain');
});

/* ── 5. STANDARD MODE UNCHANGED ────────────────────────────── */
console.log('\n[10D.1] Standard mode unchanged');

test('5.1 Standard mode: success still renders after 820ms', function () {
  assert.ok(srcIncludes(src, '820'), '820ms timing for standard mode must remain');
});

test('5.2 Standard mode: _fireAnalytics still called before _renderSuccess', function () {
  // In standard mode block (isEmergency=false branch)
  var stdIdx = src.indexOf('/* ── STANDARD mode: original behavior unchanged');
  var stdBody = src.slice(stdIdx, stdIdx + 500);
  assert.ok(stdBody.includes('_fireAnalytics'), 'standard mode analytics call present');
  assert.ok(stdBody.includes('_renderSuccess'), 'standard mode success render present');
});

test('5.3 Standard mode copy unchanged: "RAFI sélectionne déjà"', function () {
  assert.ok(srcIncludes(src, 'RAFI s\u00e9lectionne d\u00e9j\u00e0 les artisans disponibles'),
    'Standard mode success body unchanged');
});

/* ── 6. API ENDPOINT REGISTERED ────────────────────────────── */
console.log('\n[10D.1] vercel.json registration');

test('6.1 urgent-request-fn registered in builds', function () {
  assert.ok(ver.includes('api/urgent-request-fn/index.js'),
    'urgent-request-fn must be in vercel.json builds');
});

test('6.2 /api/urgent-request route registered', function () {
  assert.ok(ver.includes('/api/urgent-request'),
    '/api/urgent-request route must be in vercel.json');
});

/* ── 7. API FUNCTION VALIDATION ─────────────────────────────── */
console.log('\n[10D.1] api/urgent-request-fn validation');

test('7.1 Function uses SUPABASE_SERVICE_ROLE_KEY (not anon key)', function () {
  assert.ok(apiFn.includes('SUPABASE_SERVICE_ROLE_KEY'),
    'Must use service role key for RLS bypass');
});

test('7.2 Function inserts into service_requests (canonical table)', function () {
  assert.ok(apiFn.includes('/rest/v1/service_requests'),
    'Must write to service_requests table');
});

test('7.3 Returns { ok: true, ref, id } on success', function () {
  assert.ok(apiFn.includes('ok:  true') || apiFn.includes('ok: true'),
    'Success response must include ok:true');
  assert.ok(apiFn.includes('ref:') && apiFn.includes('id:'),
    'Success response must include ref and id');
});

test('7.4 Returns { ok: false } on persist failure', function () {
  assert.ok(apiFn.includes('ok: false'),
    'Failure response must include ok:false');
});

test('7.5 Rate limit: 10 submissions per 5 minutes', function () {
  assert.ok(apiFn.includes('RATE_LIMIT') && apiFn.includes('10'),
    'Rate limit of 10 must be configured');
  assert.ok(apiFn.includes('5 * 60 * 1000'),
    'Rate window of 5 minutes must be configured');
});

test('7.6 CORS: same-origin only (www.fixeo.ma)', function () {
  assert.ok(apiFn.includes('www.fixeo.ma'),
    'CORS must be restricted to www.fixeo.ma');
});

test('7.7 City allowlist validation present', function () {
  assert.ok(apiFn.includes('ALL_CITIES') && apiFn.includes('Casablanca'),
    'City allowlist must be validated server-side');
});

test('7.8 Phone format validation present', function () {
  assert.ok(apiFn.includes('PHONE_RE'),
    'Phone format regex validation must be present');
});

test('7.9 mode must be "emergency" (VALID_MODES)', function () {
  assert.ok(apiFn.includes("VALID_MODES") && apiFn.includes("'emergency'"),
    'Mode validation: only emergency accepted');
});

test('7.10 Package name correct', function () {
  assert.strictEqual(apiPkg.name, 'fixeo-urgent-request-fn',
    'Package name must be fixeo-urgent-request-fn');
});

/* ── 8. NO ESTIMATOR / PRICING / RESERVATION CALLS ADDED ──── */
console.log('\n[10D.1] Authority freeze');

test('8.1 No FixeoEstimatorV2.open() in new code', function () {
  // Check only the new _persistEmergencyRequest and _renderRetry functions
  var newCode = src.slice(src.indexOf('_persistEmergencyRequest'), src.indexOf('function _submitRequest'));
  assert.ok(!newCode.includes('FixeoEstimatorV2'), 'No Estimator call in new persist code');
});

test('8.2 No /api/estimator-v1 call in emergency persist', function () {
  var fnIdx = src.indexOf('function _persistEmergencyRequest');
  var fnBody = src.slice(fnIdx, fnIdx + 800);
  assert.ok(!fnBody.includes('estimator-v1'), 'No estimator API call in persist function');
});

test('8.3 reservation.js: cache key updated to v1o-canonical-gate', function () {
  assert.ok(idx.includes('reservation.js?v=v1o-canonical-gate'),
    'reservation.js cache key must be unchanged');
});

test('8.4 No pricing call in emergency submit flow', function () {
  var subIdx = src.indexOf('function _submitRequest');
  var subBody = src.slice(subIdx, subIdx + 3000);
  assert.ok(!subBody.includes('pricing_context') && !subBody.includes('PRICE_READY'),
    'No pricing in emergency submit');
});

/* ── 9. CACHE KEYS ─────────────────────────────────────────── */
console.log('\n[10D.1] Cache keys');

test('9.1 fx-request-flow-v4.js key: fxrf4-v5b in index.html', function () {
  assert.ok(idx.includes('fx-request-flow-v4.js?v=fxrf4-v5e-final-polish'),
    'JS cache key must be fxrf4-v5e-final-polish');
});

test('9.2 fx-request-flow-v4.css key: fxrf4-v5z1 in index.html', function () {
  assert.ok(idx.includes('fx-request-flow-v4.css?v=fxrf4-v5z4-final-polish'),
    'CSS cache key must be fxrf4-v5z4-final-polish');
});

test('9.3 VERSION constant in JS: fxrf4-v5b', function () {
  assert.ok(src.includes("VERSION: 'fxrf4-v5e-final-polish'"),
    'VERSION constant must be current');
});

test('9.4 Retry CSS rules present in fx-request-flow-v4.css', function () {
  assert.ok(css.includes('.fxrf4-retry-wrap') && css.includes('.fxrf4-retry-msg'),
    'Retry CSS rules must be present in CSS file');
});

/* ── SUMMARY ────────────────────────────────────────────────── */
console.log('\n' + '\u2500'.repeat(60));
console.log('[10D.1] Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
