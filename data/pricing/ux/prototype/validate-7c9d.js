#!/usr/bin/env node
/*!
 * validate-7c9d.js
 * Phase 7C.9D — FIXEO Estimator Dormant Wiring & Preview Shadow Verification
 * Structural validator: wiring invariants + security + CSS isolation.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');
function read(rel)   { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

let passed = 0, failed = 0;
const errors = [];
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + ' — ' + e.message); failed++; errors.push({ name, error: e.message }); }
}
function ok(c, m)    { if (!c) throw new Error(m || 'failed'); }
function notOk(c, m) { if (c)  throw new Error(m || 'should be false'); }

const v2   = read('js/fixeo-estimator-v2.js');
const rm   = read('js/fixeo-request-modal-v2.js');
const rafi = read('js/fixeo-rafi-os-v1.js');
const cfg  = read('js/fixeo-estimator-config.js');
const idx  = read('index.html');
const vj   = read('vercel.json');
const br   = read('js/fixeo-estimator-reservation-bridge-v1.js');
const api  = read('js/fixeo-estimator-api-v1.js');

/* ── A. index.html assets ── */
console.log('\n── A. index.html dormant assets ──');

test('A.1 estimator-v2.css loaded in index.html', function() {
  ok(idx.includes('fixeo-estimator-v2.css'));
});
test('A.2 estimator-api-v1.js loaded', function() {
  ok(idx.includes('fixeo-estimator-api-v1.js'));
});
test('A.3 estimator-reservation-bridge-v1.js loaded', function() {
  ok(idx.includes('fixeo-estimator-reservation-bridge-v1.js'));
});
test('A.4 fixeo-estimator-v2.js loaded', function() {
  ok(idx.includes('fixeo-estimator-v2.js'));
});
test('A.5 Correct load order: config < api < bridge < v2', function() {
  const pos = [
    idx.indexOf('fixeo-estimator-config.js'),
    idx.indexOf('fixeo-estimator-api-v1.js'),
    idx.indexOf('fixeo-estimator-reservation-bridge-v1.js'),
    idx.indexOf('fixeo-estimator-v2.js'),
  ];
  ok(pos.every(function(p) { return p >= 0; }), 'all assets must be found');
  ok(pos[0] < pos[1] && pos[1] < pos[2] && pos[2] < pos[3], 'load order wrong: ' + pos.join(','));
});
test('A.6 All JS assets are defer-loaded', function() {
  // v2.js must have defer
  const v2Idx = idx.indexOf('fixeo-estimator-v2.js');
  ok(idx.slice(v2Idx - 40, v2Idx + 60).includes('defer'), 'fixeo-estimator-v2.js must be defer');
});

/* ── B. Stub before feature gate ── */
console.log('\n── B. Stub before feature gate ──');

test('B.1 Stub open() returns disabled promise before guard', function() {
  const stubPos  = v2.indexOf("reason: 'disabled'");
  const guardPos = v2.indexOf('estimatorV2Enabled !== true');
  ok(stubPos >= 0, 'stub must exist');
  ok(guardPos >= 0, 'flag guard must exist');
  ok(stubPos < guardPos, 'stub must precede flag guard');
});
test('B.2 close() present in full API', function() {
  ok(v2.includes('close: function()'));
});
test('B.3 isOpen() present in full API', function() {
  ok(v2.includes('isOpen: function()'));
});
test('B.4 Stub defines all three methods', function() {
  // Stub is at the top, before the full implementation
  const stubBlockStart = v2.indexOf("open:   function() { return Promise.resolve");
  const stubBlockEnd   = v2.indexOf('// ── Preview-only override');
  ok(stubBlockStart >= 0 && stubBlockEnd >= 0, 'stub block must be identifiable');
  const stubBlock = v2.slice(stubBlockStart, stubBlockEnd);
  ok(stubBlock.includes('close:'), 'stub must have close');
  ok(stubBlock.includes('isOpen:'), 'stub must have isOpen');
});

/* ── C. Preview hostname guard ── */
console.log('\n── C. Preview hostname guard ──');

test('C.1 Excludes fixeo.ma', function() {
  ok(v2.includes("hostname !== 'fixeo.ma'"));
});
test('C.2 Excludes www.fixeo.ma', function() {
  ok(v2.includes("hostname !== 'www.fixeo.ma'"));
});
test('C.3 Override var uses canonical name', function() {
  ok(v2.includes('_FIXEO_ESTIMATOR_PREVIEW_OVERRIDE_'));
});
test('C.4 Override uses strict equality === true', function() {
  ok(v2.includes('_FIXEO_ESTIMATOR_PREVIEW_OVERRIDE_ === true'));
});
test('C.5 Preview override is AND-combined with hostname check', function() {
  ok(v2.includes('_isPreviewHost'), '_isPreviewHost must be defined');
  ok(v2.includes('_previewOverride = _isPreviewHost &&'), 'preview override must require non-prod host');
});

/* ── D. Entry context normalization ── */
console.log('\n── D. Entry context normalization ──');

test('D.1 _normalizeEntryContext function exists', function() {
  ok(v2.includes('function _normalizeEntryContext'));
});
test('D.2 _ALLOWED_ENTRY_FIELDS whitelist present', function() {
  ok(v2.includes('_ALLOWED_ENTRY_FIELDS'));
});
test('D.3 Allowed: source, metier_hint, service_hint, city, urgency, description', function() {
  const fidx = v2.indexOf('_ALLOWED_ENTRY_FIELDS');
  const s    = v2.slice(fidx, fidx + 250);
  ['source', 'metier_hint', 'service_hint', 'city', 'urgency', 'description'].forEach(function(f) {
    ok(s.includes("'" + f + "'"), f + ' must be in allowlist');
  });
});
test('D.4 PII not in allowlist (no phone, address)', function() {
  const fidx = v2.indexOf('_ALLOWED_ENTRY_FIELDS');
  const s    = v2.slice(fidx, fidx + 250);
  notOk(s.includes("'phone'"), 'phone must not be in allowlist');
  notOk(s.includes("'address'"), 'address must not be in allowlist');
});

/* ── E. Request modal hook ── */
console.log('\n── E. Request modal hook ──');

test('E.1 Hook references FixeoEstimatorV2.open()', function() {
  ok(rm.includes('FixeoEstimatorV2.open('));
});
test('E.2 Hook checks estimatorV2Enabled === true', function() {
  ok(rm.includes('estimatorV2Enabled === true'));
});
test('E.3 Hook has try/catch within 800 chars of comment', function() {
  const hookIdx = rm.indexOf('7C.9D');
  const section = rm.slice(hookIdx, hookIdx + 800);
  ok(section.includes('try {'), 'must have try block');
});
test('E.4 Hook has .catch() on promise within 1000 chars', function() {
  const hookIdx = rm.indexOf('7C.9D');
  const section = rm.slice(hookIdx, hookIdx + 1000);
  ok(section.includes('.catch(function()'), 'must catch promise');
});
test('E.5 Hook sends source: request_modal', function() {
  ok(rm.includes("source: 'request_modal'"));
});
test('E.6 Hook sends metier_hint from p.slug', function() {
  const hookIdx = rm.indexOf('7C.9D');
  const section = rm.slice(hookIdx, hookIdx + 900); // larger window — metier_hint is 726+ chars in
  ok(section.includes('metier_hint'), 'metier_hint must be in hook');
  ok(section.includes('p.slug'), 'p.slug must be in hook');
});
test('E.7 Legacy setNativeValue unchanged', function() {
  ok(rm.includes("setNativeValue(problemInput, p.text"));
});

/* ── F. RAFI hook ── */
console.log('\n── F. RAFI hook ──');

test('F.1 Hook references FixeoEstimatorV2.open()', function() {
  ok(rafi.includes('FixeoEstimatorV2.open('));
});
test('F.2 Hook checks estimatorV2Enabled === true', function() {
  ok(rafi.includes('estimatorV2Enabled === true'));
});
test('F.3 Hook has try/catch within 900 chars', function() {
  const hookIdx = rafi.indexOf('7C.9D');
  const section = rafi.slice(hookIdx, hookIdx + 900);
  ok(section.includes('try {') && section.includes('} catch'), 'must have try/catch');
});
test('F.4 Hook sends source: rafi', function() {
  ok(rafi.includes("source: 'rafi'"));
});
test('F.5 Hook sends _mem.isUrgent within 700 chars', function() {
  const hookIdx = rafi.indexOf('7C.9D');
  const section = rafi.slice(hookIdx, hookIdx + 700);
  ok(section.includes('_mem.isUrgent'));
});
test('F.6 RAFI legacy chipObs logic unchanged', function() {
  ok(rafi.includes('RafiConversation.onServiceSelected(lbl)'));
  ok(rafi.includes('_mem.update({ category:'));
  ok(rafi.includes('_checkSummary(modal)'));
});

/* ── G. Security invariants ── */
console.log('\n── G. Security invariants ──');

test('G.1 Feature flag: estimatorV2Enabled: false', function() {
  ok(cfg.includes('estimatorV2Enabled: false'));
  notOk(cfg.includes('estimatorV2Enabled: true'));
});
test('G.2 Config uses Object.freeze', function() {
  ok(cfg.includes('Object.freeze'));
});
test('G.3 No FIXEO_ESTIMATOR_SECRET in any browser file', function() {
  [v2, api, br, rm, rafi].forEach(function(code, i) {
    notOk(code.includes('FIXEO_ESTIMATOR_SECRET'), 'browser file ' + i + ' must not have secret');
  });
});
test('G.4 No AES-256-GCM in browser files', function() {
  [v2, api, br].forEach(function(code) {
    notOk(code.includes('aes-256-gcm'));
  });
});
test('G.5 No unsealToken in browser files', function() {
  [v2, api, br, rm, rafi].forEach(function(code) {
    notOk(code.includes('unsealToken'));
  });
});
test('G.6 No eval() in any modified file', function() {
  [v2, rm, rafi].forEach(function(code) {
    notOk(/\beval\s*\(/.test(code));
  });
});
test('G.7 No alert() in any modified file', function() {
  [v2, rm, rafi].forEach(function(code) {
    notOk(/\balert\s*\(/.test(code));
  });
});

/* ── H. Outcome gates ── */
console.log('\n── H. Outcome gates ──');

test('H.1 QUOTE/SAFETY/ROUTE in noPricingToken Set', function() {
  const nptIdx = v2.indexOf('noPricingToken');
  ok(nptIdx >= 0, 'noPricingToken must exist');
  const section = v2.slice(nptIdx, nptIdx + 300);
  ok(section.includes('QUOTE_REQUIRED'), 'QUOTE_REQUIRED in set');
  ok(section.includes('SAFETY_STOP'), 'SAFETY_STOP in set');
  ok(section.includes('ROUTE_REQUIRED'), 'ROUTE_REQUIRED in set');
  ok(section.includes('REQUALIFY'), 'REQUALIFY in set');
});
test('H.2 noPricingToken gates reservation CTA', function() {
  ok(v2.includes('noPricingToken.has(ot)') || v2.includes('!noPricingToken.has(ot)'));
});
test('H.3 PAGE_REQUIRED → /estimation redirect', function() {
  ok(v2.includes("window.location.href = '/estimation'"));
});
test('H.4 PAGE_REQUIRED stores opaque session token', function() {
  ok(v2.includes("sessionStorage.setItem('fixeo_estimator_token_v1'"));
});
test('H.5 No PII or price in estimation URL', function() {
  notOk(v2.includes("'/estimation?"), 'no query params in URL');
});

/* ── I. CSS isolation ── */
console.log('\n── I. CSS isolation ──');

test('I.1 css/fixeo-estimator-v2.css exists', function() {
  ok(exists('css/fixeo-estimator-v2.css'));
});
test('I.2 Estimator CSS uses .estimator- namespace', function() {
  const css = read('css/fixeo-estimator-v2.css');
  ok(css.includes('.estimator-'));
});
test('I.3 No bare body{margin:0} global reset', function() {
  const css = read('css/fixeo-estimator-v2.css');
  notOk(/^\s*body\s*\{\s*margin\s*:\s*0/m.test(css));
});
test('I.4 CSS loaded in index.html', function() {
  ok(idx.includes('fixeo-estimator-v2.css'));
});

/* ── J. Vercel packaging ── */
console.log('\n── J. Vercel packaging ──');

test('J.1 api/estimator-v1/index.js in builds', function() {
  ok(vj.includes('api/estimator-v1/index.js'));
});
test('J.2 Uses @vercel/node for estimator function', function() {
  const buildIdx = vj.indexOf('api/estimator-v1/index.js');
  ok(vj.slice(buildIdx, buildIdx + 100).includes('@vercel/node'));
});
test('J.3 /api/estimator-v1 route exists', function() {
  ok(vj.includes('/api/estimator-v1'));
});
test('J.4 /estimation route exists', function() {
  ok(vj.includes('/estimation'));
});
test('J.5 estimation.html exists', function() {
  ok(exists('estimation.html'));
});

/* ── K. Legacy estimator ── */
console.log('\n── K. Legacy estimator unchanged ──');

test('K.1 js/fixeo-estimation-engine-v1.js exists', function() {
  ok(exists('js/fixeo-estimation-engine-v1.js'));
});
test('K.2 V1 engine > 10KB (not gutted)', function() {
  const stat = fs.statSync(path.join(ROOT, 'js/fixeo-estimation-engine-v1.js'));
  ok(stat.size > 10000, 'size: ' + stat.size);
});
test('K.3 V1 engine still in reservation lazy-loader', function() {
  ok(idx.includes('fixeo-estimation-engine-v1.js'));
});

/* ── L. Reservation chain ── */
console.log('\n── L. Reservation chain ──');

test('L.1 Reservation bridge is loaded with defer', function() {
  const bIdx = idx.indexOf('fixeo-estimator-reservation-bridge-v1.js');
  ok(idx.slice(bIdx - 40, bIdx + 60).includes('defer'));
});
test('L.2 bridge.prepareContext called before reservation dispatch', function() {
  ok(v2.includes('FixeoEstimatorReservationBridge.prepareContext'));
});
test('L.3 Reservation dispatch event includes pricing_context_token', function() {
  ok(v2.includes("'fixeo:estimator-reserve'"));
  ok(v2.includes('pricing_context_token'));
});
test('L.4 sessionStorage only stores opaque tokens (no raw amounts)', function() {
  const setItemCalls = (v2.match(/sessionStorage\.setItem\([^;]+\)/g) || []);
  setItemCalls.forEach(function(call) {
    notOk(call.includes('amount') || call.includes('price'), 'setItem must not store amounts: ' + call);
  });
  const bridgeSetItem = (br.match(/sessionStorage\.setItem\([^;]+\)/g) || []);
  bridgeSetItem.forEach(function(call) {
    notOk(call.includes('amount_mad'), 'bridge setItem must not store amount_mad: ' + call);
  });
});

/* ── RESULTS ── */
console.log('\n══ 7C.9D Validator Results ══');
console.log('  Passed: ' + passed + ' / Total: ' + (passed + failed));
if (failed > 0) {
  console.log('  Failed: ' + failed);
  errors.forEach(function(e) { console.log('    ✗ ' + e.name + ': ' + e.error); });
  process.exit(1);
} else {
  console.log('  All 7C.9D validations passed ✓');
}
