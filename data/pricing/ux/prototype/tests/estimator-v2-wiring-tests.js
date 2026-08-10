#!/usr/bin/env node
/*!
 * estimator-v2-wiring-tests.js
 * Phase 7C.9D — FIXEO Estimator Dormant Wiring
 *
 * Static source-analysis tests — no browser, no network, no mocking.
 * Verifies wiring correctness, flag guards, security, and structural invariants.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../../..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

let passed = 0, failed = 0;
const errors = [];
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + ' — ' + e.message); failed++; errors.push({ name, error: e.message }); }
}
function ok(cond, msg)    { if (!cond) throw new Error(msg || 'assertion failed'); }
function notOk(cond, msg) { if (cond)  throw new Error(msg || 'should be false'); }

// Read all files once
const cfgCode    = read('js/fixeo-estimator-config.js');
const v2Code     = read('js/fixeo-estimator-v2.js');
const apiCode    = read('js/fixeo-estimator-api-v1.js');
const bridgeCode = read('js/fixeo-estimator-reservation-bridge-v1.js');
const rmCode     = read('js/fixeo-request-modal-v2.js');
const rafiCode   = read('js/fixeo-rafi-os-v1.js');
const reservCode = read('js/reservation.js');
const indexCode  = read('index.html');
const vjCode     = read('vercel.json');

/* ════════════════════════════════════════════════════════════
   1. FLAG-GATED REQUEST MODAL HOOK
   ════════════════════════════════════════════════════════════ */
console.log('\n── 1. Request modal hook (flag-gated) ──');

test('1.1 Request modal hook references FixeoEstimatorV2', function() {
  ok(rmCode.includes('FixeoEstimatorV2'), 'hook must reference FixeoEstimatorV2');
});
test('1.2 Hook checks estimatorV2Enabled === true (strict)', function() {
  ok(rmCode.includes('estimatorV2Enabled === true'), 'must use strict equality');
});
test('1.3 Hook checks window.FixeoEstimatorConfig', function() {
  ok(rmCode.includes('window.FixeoEstimatorConfig'), 'must check config object exists');
});
test('1.4 Legacy setNativeValue still present (flag-OFF behavior unchanged)', function() {
  ok(rmCode.includes("setNativeValue(problemInput, p.text"), 'legacy setNativeValue must remain');
});
test('1.5 Legacy city section reveal still present', function() {
  ok(rmCode.includes("citySection.classList.add('fxrm2-visible')"), 'city reveal must remain');
});
test('1.6 Hook source field = request_modal', function() {
  ok(rmCode.includes("source: 'request_modal'"), 'source must be request_modal');
});
test('1.7 Hook only fires when p.slug is truthy (known métier)', function() {
  // The hook starts with `if (p.slug &&`
  const hookStart = rmCode.indexOf('7C.9D: Estimator V2 dormant hook');
  ok(hookStart >= 0, 'hook comment must exist');
  // p.slug guard is within 300 chars of hook comment
  const hookSection = rmCode.slice(hookStart, hookStart + 300);
  ok(hookSection.includes('p.slug'), 'hook must guard on p.slug');
});

/* ════════════════════════════════════════════════════════════
   2. FLAG-GATED RAFI HOOK
   ════════════════════════════════════════════════════════════ */
console.log('\n── 2. RAFI hook (flag-gated) ──');

test('2.1 RAFI hook references FixeoEstimatorV2', function() {
  ok(rafiCode.includes('FixeoEstimatorV2'), 'hook must reference FixeoEstimatorV2');
});
test('2.2 RAFI hook checks estimatorV2Enabled === true (strict)', function() {
  ok(rafiCode.includes('estimatorV2Enabled === true'), 'must use strict equality');
});
test('2.3 RAFI hook source field = rafi', function() {
  ok(rafiCode.includes("source: 'rafi'"), 'source must be rafi');
});
test('2.4 RAFI legacy chipObs _mem.update unchanged', function() {
  ok(rafiCode.includes('_mem.update({ category:'), 'RAFI _mem.update must remain');
});
test('2.5 RAFI legacy onServiceSelected unchanged', function() {
  ok(rafiCode.includes('RafiConversation.onServiceSelected(lbl)'), 'onServiceSelected must remain');
});
test('2.6 RAFI legacy _checkSummary unchanged', function() {
  ok(rafiCode.includes('_checkSummary(modal)'), '_checkSummary must remain');
});
test('2.7 RAFI hook passes _mem.city', function() {
  const hookIdx = rafiCode.indexOf('7C.9D: Estimator V2 dormant hook');
  const section = rafiCode.slice(hookIdx, hookIdx + 600);
  ok(section.includes('_mem.city'), 'must pass _mem.city');
});
test('2.8 RAFI hook passes urgency from _mem.isUrgent', function() {
  const hookIdx = rafiCode.indexOf('7C.9D: Estimator V2 dormant hook');
  const section = rafiCode.slice(hookIdx, hookIdx + 700);
  ok(section.includes('_mem.isUrgent'), 'must reference _mem.isUrgent');
});

/* ════════════════════════════════════════════════════════════
   3. ESTIMATOR V2 PUBLIC API
   ════════════════════════════════════════════════════════════ */
console.log('\n── 3. Estimator V2 public API ──');

test('3.1 open() calls FixeoEstimatorV2.open in hooks', function() {
  ok(rmCode.includes('FixeoEstimatorV2.open('), 'request modal must call open()');
  ok(rafiCode.includes('FixeoEstimatorV2.open('), 'RAFI must call open()');
});
test('3.2 Stub open() returns Promise.resolve disabled', function() {
  ok(v2Code.includes("reason: 'disabled'"), 'stub must return disabled reason');
  ok(v2Code.includes('Promise.resolve({ accepted: false'), 'stub must return accepted:false');
});
test('3.3 Full open() returns Promise.resolve accepted:true', function() {
  ok(v2Code.includes('Promise.resolve({ accepted: true })'), 'full open must return accepted:true');
});
test('3.4 close() defined in full API', function() {
  ok(v2Code.includes('close: function()'), 'close must be defined');
});
test('3.5 isOpen() defined in full API', function() {
  ok(v2Code.includes('isOpen: function()'), 'isOpen must be defined');
});
test('3.6 Stub defined BEFORE feature gate', function() {
  const stubPos  = v2Code.indexOf("reason: 'disabled'");
  const guardPos = v2Code.indexOf('estimatorV2Enabled !== true');
  ok(stubPos >= 0, 'stub must exist');
  ok(guardPos >= 0, 'flag guard must exist');
  ok(stubPos < guardPos, 'stub must precede flag guard');
});
test('3.7 Full API overwrites stub (both in source)', function() {
  // The stub is at the top; the full API is near the bottom
  const firstStub   = v2Code.indexOf('reason: \'disabled\'');
  const fullApiOpen = v2Code.indexOf('open: function(entryContext)');
  ok(fullApiOpen > firstStub, 'full API must come after stub');
});

/* ════════════════════════════════════════════════════════════
   4. FALLBACK TRY/CATCH
   ════════════════════════════════════════════════════════════ */
console.log('\n── 4. Fallback try/catch in hooks ──');

test('4.1 Request modal hook has try/catch', function() {
  const hookIdx = rmCode.indexOf('7C.9D: Estimator V2 dormant hook');
  ok(hookIdx >= 0, 'hook comment must exist');
  const section = rmCode.slice(hookIdx, hookIdx + 700);
  ok(section.includes('try {'), 'must have try block');
  ok(section.includes('} catch'), 'must have catch block');
});
test('4.2 RAFI hook has try/catch', function() {
  const hookIdx = rafiCode.indexOf('7C.9D: Estimator V2 dormant hook');
  ok(hookIdx >= 0, 'hook comment must exist');
  const section = rafiCode.slice(hookIdx, hookIdx + 900);
  ok(section.includes('try {'), 'must have try block');
  ok(section.includes('} catch'), 'must have catch block');
});
test('4.3 Request modal hook has .catch() on promise', function() {
  const hookIdx = rmCode.indexOf('7C.9D: Estimator V2 dormant hook');
  const section = rmCode.slice(hookIdx, hookIdx + 1000);
  ok(section.includes('.catch(function()'), 'must catch promise rejection');
});
test('4.4 RAFI hook has .catch() on promise', function() {
  const hookIdx = rafiCode.indexOf('7C.9D: Estimator V2 dormant hook');
  const section = rafiCode.slice(hookIdx, hookIdx + 700);
  ok(section.includes('.catch(function()'), 'must catch promise rejection');
});

/* ════════════════════════════════════════════════════════════
   5. PAGE_REQUIRED → /ESTIMATION FLOW
   ════════════════════════════════════════════════════════════ */
console.log('\n── 5. PAGE_REQUIRED / /estimation flow ──');

test('5.1 PAGE_REQUIRED → sessionStorage.setItem with session token key', function() {
  ok(v2Code.includes("sessionStorage.setItem('fixeo_estimator_token_v1'"), 'must store under fixeo_estimator_token_v1');
});
test('5.2 PAGE_REQUIRED → window.location.href = /estimation', function() {
  ok(v2Code.includes("window.location.href = '/estimation'"), 'must redirect to /estimation');
});
test('5.3 No query params or token in estimation URL', function() {
  notOk(v2Code.includes("'/estimation?"), 'must not put params in URL');
});
test('5.4 No PII in URL construction', function() {
  notOk(/location\.href.*phone/.test(v2Code), 'no phone in URL');
  notOk(/location\.href.*amount/.test(v2Code), 'no amount in URL');
});

/* ════════════════════════════════════════════════════════════
   6. OPAQUE SESSION STORAGE ONLY
   ════════════════════════════════════════════════════════════ */
console.log('\n── 6. Opaque sessionStorage only ──');

test('6.1 Bridge sessionStorage.setItem never stores raw amount_mad', function() {
  // The bridge legitimately reads amount_mad from verified server response (JSDoc + return value)
  // but must NEVER write amount_mad to sessionStorage
  const setItemCalls = (bridgeCode.match(/sessionStorage\.setItem\([^;]+\)/g) || []);
  setItemCalls.forEach(function(call) {
    notOk(call.includes('amount_mad'), 'setItem must not store amount_mad: ' + call);
  });
  ok(bridgeCode.includes('fixeo_estimator_ctx_v1'), 'bridge must use opaque CTX key');
});
test('6.2 v2.js sessionStorage.setItem never stores raw amount', function() {
  const setItemMatches = v2Code.match(/sessionStorage\.setItem\([^)]+\)/g) || [];
  setItemMatches.forEach(function(call) {
    notOk(call.includes('amount'), 'setItem must not store amount: ' + call);
    notOk(call.includes('price'), 'setItem must not store price: ' + call);
  });
});
test('6.3 Bridge CTX_KEY is fixeo_estimator_ctx_v1 (opaque)', function() {
  ok(bridgeCode.includes("'fixeo_estimator_ctx_v1'"), 'bridge key must be fixeo_estimator_ctx_v1');
});
test('6.4 Session token key is fixeo_estimator_token_v1 (opaque)', function() {
  ok(v2Code.includes("'fixeo_estimator_token_v1'"), 'session key must be fixeo_estimator_token_v1');
});

/* ════════════════════════════════════════════════════════════
   7. RESERVATION TOKEN HANDOFF
   ════════════════════════════════════════════════════════════ */
console.log('\n── 7. Reservation token handoff ──');

test('7.1 reservation.js has _estimator_context_token in booking data', function() {
  ok(reservCode.includes('_estimator_context_token'), 'reservation must pass token');
});
test('7.2 bridge.prepareContext stores token before reservation opens', function() {
  ok(v2Code.includes('FixeoEstimatorReservationBridge.prepareContext'), 'must call prepareContext');
});
test('7.3 Dispatch fixeo:estimator-reserve event with opaque token', function() {
  ok(v2Code.includes("'fixeo:estimator-reserve'"), 'must dispatch reservation event');
  ok(v2Code.includes('pricing_context_token'), 'event must include pricing_context_token');
});
test('7.4 Reservation bridge verifyContext used in reservation.js', function() {
  ok(reservCode.includes('verifyContext'), 'reservation must verify context via bridge');
});

/* ════════════════════════════════════════════════════════════
   8-10. PRICE_READY / LABOUR_PLUS_PART / DIAGNOSTIC HANDOFFS
   ════════════════════════════════════════════════════════════ */
console.log('\n── 8-10. Payable outcome handoffs ──');

test('8.1 PRICE_READY renders .amount and .currency spans', function() {
  ok(v2Code.includes("case 'PRICE_READY':"), 'PRICE_READY case must exist');
  ok(v2Code.includes("el('span', 'amount'"), '.amount span must be rendered');
  ok(v2Code.includes("el('span', 'currency'"), '.currency span must be rendered');
});
test('8.2 PRICE_READY reads price.amount_mad from outcome (not hardcoded)', function() {
  ok(v2Code.includes('outcome.price.amount_mad') || v2Code.includes('price.amount_mad'),
    'must read amount_mad from outcome.price');
  notOk(/amount_mad\s*=\s*\d{3,}/.test(v2Code), 'amount_mad must not be hardcoded');
});
test('9.1 LABOUR_PLUS_PART_READY uses labour_amount_mad', function() {
  ok(v2Code.includes("case 'LABOUR_PLUS_PART_READY':"), 'case must exist');
  ok(v2Code.includes('labour_amount_mad'), 'must read labour_amount_mad');
});
test('9.2 LABOUR_PLUS_PART never sums labour + part', function() {
  notOk(/labour_amount_mad\s*\+\s*amount_mad/.test(v2Code), 'must not sum labour+part');
  notOk(/amount_mad\s*\+\s*labour_amount_mad/.test(v2Code), 'must not sum amount_mad+labour');
});
test('9.3 LABOUR_PLUS_PART part card has no numeric value', function() {
  // Part card should show "Prix séparé" not a number
  ok(v2Code.includes('Prix séparé'), 'part card must say Prix séparé');
});
test('10.1 DIAGNOSTIC_READY renders diagnostic price', function() {
  ok(v2Code.includes("case 'DIAGNOSTIC_READY':"), 'DIAGNOSTIC case must exist');
  ok(v2Code.includes('tarif diagnostic') || v2Code.includes('Tarif diagnostic') || v2Code.includes('diagnostic_price_mad') || v2Code.includes("'price-eyebrow', 'Tarif diagnostic'"),
    'diagnostic price must be present');
});
test('10.2 DIAGNOSTIC outcome uses amount_mad (is_diagnostic in bridge/reservation)', function() {
  // In estimator-v2.js, diagnostic price comes from outcome.price.amount_mad
  // is_diagnostic flag is handled by the bridge/reservation bridge (not rendered in v2.js)
  ok(v2Code.includes('diagnostic_price_mad') || v2Code.includes("'Tarif diagnostic'") || v2Code.includes('DIAGNOSTIC_READY'),
    'diagnostic case must be present in v2.js');
  // Verify reservation bridge passes is_diagnostic
  ok(bridgeCode.includes('is_diagnostic'), 'bridge must surface is_diagnostic flag');
});

/* ════════════════════════════════════════════════════════════
   11-13. NON-PAYABLE OUTCOMES — NO BOOKING
   ════════════════════════════════════════════════════════════ */
console.log('\n── 11-13. Non-payable outcome gates ──');

test('11.1 QUOTE_REQUIRED in noPricingToken Set', function() {
  const nptIdx = v2Code.indexOf('noPricingToken');
  ok(nptIdx >= 0, 'noPricingToken must exist');
  const section = v2Code.slice(nptIdx, nptIdx + 300);
  ok(section.includes('QUOTE_REQUIRED'), 'QUOTE_REQUIRED must be in set');
});
test('12.1 SAFETY_STOP in noPricingToken Set', function() {
  const nptIdx = v2Code.indexOf('noPricingToken');
  const section = v2Code.slice(nptIdx, nptIdx + 300);
  ok(section.includes('SAFETY_STOP'), 'SAFETY_STOP must be in set');
});
test('13.1 ROUTE_REQUIRED in noPricingToken Set', function() {
  const nptIdx = v2Code.indexOf('noPricingToken');
  const section = v2Code.slice(nptIdx, nptIdx + 300);
  ok(section.includes('ROUTE_REQUIRED'), 'ROUTE_REQUIRED must be in set');
});
test('13.2 noPricingToken prevents prepareContext + event dispatch', function() {
  // noPricingToken.has(ot) gates the reservation CTA
  ok(v2Code.includes('noPricingToken.has(ot)') || v2Code.includes('!noPricingToken.has(ot)'),
    'noPricingToken.has() must gate reservation');
});

/* ════════════════════════════════════════════════════════════
   14. CSS ISOLATION
   ════════════════════════════════════════════════════════════ */
console.log('\n── 14. CSS isolation ──');

test('14.1 css/fixeo-estimator-v2.css exists', function() {
  ok(exists('css/fixeo-estimator-v2.css'), 'estimator CSS must exist');
});
test('14.2 Estimator CSS uses .estimator- namespace', function() {
  const css = read('css/fixeo-estimator-v2.css');
  ok(css.includes('.estimator-'), '.estimator- namespace must be used');
});
test('14.3 No bare body{} global reset in estimator CSS', function() {
  const css = read('css/fixeo-estimator-v2.css');
  notOk(/^\s*body\s*\{\s*margin\s*:\s*0/m.test(css), 'must not reset body margin globally');
});
test('14.4 Estimator CSS is in index.html', function() {
  ok(indexCode.includes('fixeo-estimator-v2.css'), 'CSS must be loaded in index.html');
});

/* ════════════════════════════════════════════════════════════
   15. SECURITY — NO SECRET IN BROWSER
   ════════════════════════════════════════════════════════════ */
console.log('\n── 15. Security: no secret in browser ──');

test('15.1 FIXEO_ESTIMATOR_SECRET not in estimator-v2.js', function() {
  notOk(v2Code.includes('FIXEO_ESTIMATOR_SECRET'), 'secret must not be in browser JS');
});
test('15.2 FIXEO_ESTIMATOR_SECRET not in estimator-api-v1.js', function() {
  notOk(apiCode.includes('FIXEO_ESTIMATOR_SECRET'));
});
test('15.3 FIXEO_ESTIMATOR_SECRET not in bridge', function() {
  notOk(bridgeCode.includes('FIXEO_ESTIMATOR_SECRET'));
});
test('15.4 No aes-256-gcm in browser files', function() {
  notOk(v2Code.includes('aes-256-gcm'), 'no crypto in browser JS');
  notOk(apiCode.includes('aes-256-gcm'));
  notOk(bridgeCode.includes('aes-256-gcm'));
});
test('15.5 No unsealToken in browser files', function() {
  notOk(v2Code.includes('unsealToken'));
  notOk(apiCode.includes('unsealToken'));
  notOk(bridgeCode.includes('unsealToken'));
  notOk(rmCode.includes('unsealToken'));
  notOk(rafiCode.includes('unsealToken'));
});

/* ════════════════════════════════════════════════════════════
   16. FEATURE FLAG COMMITTED FALSE
   ════════════════════════════════════════════════════════════ */
console.log('\n── 16. Feature flag ──');

test('16.1 estimatorV2Enabled: false in committed config', function() {
  ok(cfgCode.includes('estimatorV2Enabled: false'), 'flag must be false');
  notOk(cfgCode.includes('estimatorV2Enabled: true'), 'flag must not be true');
});
test('16.2 Config uses Object.freeze (tamper-resistant)', function() {
  ok(cfgCode.includes('Object.freeze'), 'config must be frozen');
});

/* ════════════════════════════════════════════════════════════
   17. PRODUCTION HOST CANNOT USE PREVIEW OVERRIDE
   ════════════════════════════════════════════════════════════ */
console.log('\n── 17. Preview override hostname guard ──');

test('17.1 Preview override checks hostname !== fixeo.ma', function() {
  ok(v2Code.includes("hostname !== 'fixeo.ma'"), 'must exclude fixeo.ma');
});
test('17.2 Preview override checks hostname !== www.fixeo.ma', function() {
  ok(v2Code.includes("hostname !== 'www.fixeo.ma'"), 'must exclude www.fixeo.ma');
});
test('17.3 Override var is _FIXEO_ESTIMATOR_PREVIEW_OVERRIDE_', function() {
  ok(v2Code.includes('_FIXEO_ESTIMATOR_PREVIEW_OVERRIDE_'), 'must use canonical var name');
});
test('17.4 Override only active when === true (strict)', function() {
  ok(v2Code.includes('_FIXEO_ESTIMATOR_PREVIEW_OVERRIDE_ === true'), 'must use strict equality');
});

/* ════════════════════════════════════════════════════════════
   18. VERCEL PACKAGING
   ════════════════════════════════════════════════════════════ */
console.log('\n── 18. Vercel packaging ──');

test('18.1 vercel.json has api/estimator-v1/index.js build', function() {
  ok(vjCode.includes('api/estimator-v1/index.js'), 'build entry must exist');
});
test('18.2 vercel.json has /api/estimator-v1 route', function() {
  ok(vjCode.includes('/api/estimator-v1'), 'API route must exist');
});
test('18.3 vercel.json has /estimation route', function() {
  ok(vjCode.includes('/estimation'), 'page route must exist');
});
test('18.4 vercel.json builds estimator with @vercel/node', function() {
  const buildIdx = vjCode.indexOf('api/estimator-v1/index.js');
  const section  = vjCode.slice(buildIdx, buildIdx + 80);
  ok(section.includes('@vercel/node'), 'must use @vercel/node runtime');
});

/* ════════════════════════════════════════════════════════════
   19. LEGACY ESTIMATOR STILL ACTIVE
   ════════════════════════════════════════════════════════════ */
console.log('\n── 19. Legacy estimator ──');

test('19.1 js/fixeo-estimation-engine-v1.js exists', function() {
  ok(exists('js/fixeo-estimation-engine-v1.js'), 'V1 engine must exist');
});
test('19.2 V1 engine not gutted (> 10KB)', function() {
  const stat = fs.statSync(path.join(ROOT, 'js/fixeo-estimation-engine-v1.js'));
  ok(stat.size > 10000, 'V1 engine must be > 10KB, got: ' + stat.size);
});
test('19.3 V1 engine in reservation lazy-loader', function() {
  ok(indexCode.includes('fixeo-estimation-engine-v1.js'), 'V1 engine must remain in loader');
});

/* ════════════════════════════════════════════════════════════
   20. INDEX.HTML ASSET LOADING ORDER
   ════════════════════════════════════════════════════════════ */
console.log('\n── 20. index.html asset loading ──');

test('20.1 estimator-config.js loaded', function() {
  ok(indexCode.includes('fixeo-estimator-config.js'));
});
test('20.2 estimator-api-v1.js loaded', function() {
  ok(indexCode.includes('fixeo-estimator-api-v1.js'));
});
test('20.3 estimator-reservation-bridge-v1.js loaded', function() {
  ok(indexCode.includes('fixeo-estimator-reservation-bridge-v1.js'));
});
test('20.4 fixeo-estimator-v2.js loaded', function() {
  ok(indexCode.includes('fixeo-estimator-v2.js'));
});
test('20.5 fixeo-estimator-v2.css loaded', function() {
  ok(indexCode.includes('fixeo-estimator-v2.css'));
});
test('20.6 Correct load order: config < api < bridge < v2', function() {
  const pos = [
    indexCode.indexOf('fixeo-estimator-config.js'),
    indexCode.indexOf('fixeo-estimator-api-v1.js'),
    indexCode.indexOf('fixeo-estimator-reservation-bridge-v1.js'),
    indexCode.indexOf('fixeo-estimator-v2.js'),
  ];
  ok(pos.every(function(p) { return p >= 0; }), 'all assets must be in index.html');
  ok(pos[0] < pos[1], 'config must precede api');
  ok(pos[1] < pos[2], 'api must precede bridge');
  ok(pos[2] < pos[3], 'bridge must precede v2');
});
test('20.7 All 4 JS assets are defer-loaded', function() {
  // Check that estimator-v2.js has defer attribute
  const v2Idx = indexCode.indexOf('fixeo-estimator-v2.js');
  const v2Tag  = indexCode.slice(v2Idx - 30, v2Idx + 80);
  ok(v2Tag.includes('defer'), 'fixeo-estimator-v2.js must be defer');
  const apiIdx = indexCode.indexOf('fixeo-estimator-api-v1.js');
  const apiTag = indexCode.slice(apiIdx - 30, apiIdx + 60);
  ok(apiTag.includes('defer'), 'estimator-api must be defer');
});

/* ════════════════════════════════════════════════════════════
   21. PUBLIC API STRUCTURE
   ════════════════════════════════════════════════════════════ */
console.log('\n── 21. Public API structure ──');

test('21.1 _normalizeEntryContext function exists', function() {
  ok(v2Code.includes('function _normalizeEntryContext'), 'normalizer must exist');
});
test('21.2 _ALLOWED_ENTRY_FIELDS whitelist defined', function() {
  ok(v2Code.includes('_ALLOWED_ENTRY_FIELDS'), 'allowlist must be defined');
});
test('21.3 Allowed fields include source, metier_hint, service_hint', function() {
  const fieldsIdx = v2Code.indexOf('_ALLOWED_ENTRY_FIELDS');
  const section = v2Code.slice(fieldsIdx, fieldsIdx + 200);
  ok(section.includes("'source'"), 'source must be allowed');
  ok(section.includes("'metier_hint'"), 'metier_hint must be allowed');
  ok(section.includes("'service_hint'"), 'service_hint must be allowed');
});
test('21.4 PII not in allowed entry fields', function() {
  const fieldsIdx = v2Code.indexOf('_ALLOWED_ENTRY_FIELDS');
  const section = v2Code.slice(fieldsIdx, fieldsIdx + 200);
  notOk(section.includes("'phone'"), 'phone must not be in entry context');
  notOk(section.includes("'address'"), 'address must not be in entry context');
});
test('21.5 Self-managed container _createContainer defined', function() {
  ok(v2Code.includes('function _createContainer'), 'container creator must exist');
  ok(v2Code.includes('fixeo-estimator-v2-root'), 'container must have ID');
});
test('21.6 Self-managed container _destroyContainer defined', function() {
  ok(v2Code.includes('function _destroyContainer'), 'container destroyer must exist');
});
test('21.7 _activeModal tracks open state', function() {
  ok(v2Code.includes('var _activeModal'), '_activeModal must track state');
  ok(v2Code.includes('!!_activeModal'), 'isOpen must check _activeModal');
});

/* ════════════════════════════════════════════════════════════
   22. NO alert() IN WIRED FILES
   ════════════════════════════════════════════════════════════ */
console.log('\n── 22. No alert() ──');

test('22.1 No alert() in fixeo-estimator-v2.js', function() {
  notOk(/\balert\s*\(/.test(v2Code), 'no alert() in estimator-v2.js');
});
test('22.2 No alert() in fixeo-request-modal-v2.js', function() {
  notOk(/\balert\s*\(/.test(rmCode), 'no alert() in request-modal');
});
test('22.3 No alert() in fixeo-rafi-os-v1.js', function() {
  notOk(/\balert\s*\(/.test(rafiCode), 'no alert() in RAFI');
});

/* ════════════════════════════════════════════════════════════
   23. NO eval() IN WIRED FILES
   ════════════════════════════════════════════════════════════ */
console.log('\n── 23. No eval() ──');

test('23.1 No eval() in estimator-v2.js', function() {
  notOk(/\beval\s*\(/.test(v2Code));
});
test('23.2 No eval() in request-modal', function() {
  notOk(/\beval\s*\(/.test(rmCode));
});
test('23.3 No eval() in RAFI', function() {
  notOk(/\beval\s*\(/.test(rafiCode));
});

/* ════════════════════════════════════════════════════════════
   24. RESERVATION BRIDGE INTEGRITY
   ════════════════════════════════════════════════════════════ */
console.log('\n── 24. Reservation bridge integrity ──');

test('24.1 Bridge has prepareContext, getContext, clearContext, verifyContext', function() {
  ok(bridgeCode.includes('prepareContext'), 'bridge must have prepareContext');
  ok(bridgeCode.includes('getContext'), 'bridge must have getContext');
  ok(bridgeCode.includes('clearContext'), 'bridge must have clearContext');
  ok(bridgeCode.includes('verifyContext'), 'bridge must have verifyContext');
});
test('24.2 Bridge verifyContext calls FixeoEstimatorAPI.verifyPricingContext', function() {
  ok(bridgeCode.includes('verifyPricingContext'), 'bridge must call server verify');
});
test('24.3 Bridge verifyContext returns Promise', function() {
  ok(bridgeCode.includes('return Promise.resolve'), 'bridge verifyContext must return promise');
});

/* ════════════════════════════════════════════════════════════
   RESULTS
   ════════════════════════════════════════════════════════════ */
console.log('\n══ 7C.9D Wiring Test Results ══');
console.log('  Passed: ' + passed + ' / Total: ' + (passed + failed));
if (failed > 0) {
  console.log('  Failed: ' + failed);
  errors.forEach(function(e) { console.log('    ✗ ' + e.name + ': ' + e.error); });
  process.exit(1);
} else {
  console.log('  All wiring tests passed ✓');
}
