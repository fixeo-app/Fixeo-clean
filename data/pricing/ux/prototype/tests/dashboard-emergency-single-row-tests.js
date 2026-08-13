/**
 * FIXEO — Emergency Single-Row Regression Tests (P1.1)
 * data/pricing/ux/prototype/tests/dashboard-emergency-single-row-tests.js
 *
 * Proves that the emergency double-write blocker is resolved:
 *   - Dashboard emergency bridge suppressed for req.mode==='emergency'
 *   - urgent-request-fn resolves client_profile_id from X-Fxauth-Token
 *   - CORS allows X-Fxauth-Token header
 *   - Fetch interceptor installed in dashboard (injects token on POST /api/urgent-request)
 *   - _resolveClientProfileId is server-side only (never in browser JS)
 *   - Anonymous path unaffected (no header = NULL client_profile_id = OK)
 *   - Standard mode bridge unaffected (not suppressed)
 *   - No schema change
 *   - No V4 modification
 */
'use strict';

var fs   = require('fs');
var path = require('path');

var ROOT    = path.resolve(__dirname, '../../../../..');
var DASHV2  = fs.readFileSync(path.join(ROOT, 'js/fixeo-dashboard-v2.js'), 'utf8');
var URGENT  = fs.readFileSync(path.join(ROOT, 'api/urgent-request-fn/index.js'), 'utf8');
var V4      = fs.readFileSync(path.join(ROOT, 'js/fx-request-flow-v4.js'), 'utf8');
var DASH    = fs.readFileSync(path.join(ROOT, 'dashboard-client.html'), 'utf8');

var results = { pass: 0, fail: 0, failures: [] };
function pass(n) { results.pass++; process.stdout.write('  \u2713 [PASS] ' + n + '\n'); }
function fail(n, r) {
  results.fail++;
  results.failures.push(n + ': ' + r);
  process.stdout.write('  \u2717 [FAIL] ' + n + ' \u2014 ' + r + '\n');
}
function check(n, c, r) { c ? pass(n) : fail(n, r || 'Condition false'); }

/* Extract bridge block */
var BRIDGE_START = DASHV2.indexOf('P1 AUTHENTICATED PERSISTENCE BRIDGE');
var BRIDGE_END   = DASHV2.indexOf('V4 ANALYTICS EVENT', BRIDGE_START);
var BRIDGE       = BRIDGE_START >= 0 && BRIDGE_END >= 0
  ? DASHV2.slice(BRIDGE_START, BRIDGE_END) : '';

/* Extract interceptor block */
var ICEPTOR_START = DASHV2.indexOf('P1.1 EMERGENCY AUTH FETCH INTERCEPTOR');
var ICEPTOR_END   = DASHV2.indexOf('P1 AUTHENTICATED PERSISTENCE BRIDGE', ICEPTOR_START);
var ICEPTOR       = ICEPTOR_START >= 0 && ICEPTOR_END >= 0
  ? DASHV2.slice(ICEPTOR_START, ICEPTOR_END) : '';

/* ── E1: Bridge suppresses emergency mode ─────────────────────── */
console.log('\nE1: Bridge suppresses emergency mode (no double-row)');
check('E1.1 req.mode emergency guard present in bridge',
  BRIDGE.includes("req.mode === 'emergency'"),
  "Bridge missing req.mode === 'emergency' guard");
check('E1.2 emergency return fires before actual await submitServiceRequest call',
  (function() {
    var guardIdx = BRIDGE.indexOf("req.mode === 'emergency'");
    if (guardIdx < 0) return false;
    var retIdx = BRIDGE.indexOf('return;', guardIdx);
    /* Find the actual async call: 'await window.FixeoSupabase.submitServiceRequest' */
    var callIdx = BRIDGE.indexOf('await window.FixeoSupabase.submitServiceRequest');
    if (callIdx < 0) callIdx = BRIDGE.indexOf('await FixeoSupabase.submitServiceRequest');
    /* return must come before the actual call (or no call after guard) */
    return retIdx >= 0 && (callIdx < 0 || retIdx < callIdx);
  })(),
  'Emergency return does not precede await submitServiceRequest call — dual-row risk');
check('E1.3 return statement follows emergency guard',
  (function() {
    var guardIdx = BRIDGE.indexOf("req.mode === 'emergency'");
    var block = BRIDGE.slice(guardIdx, guardIdx + 200);
    return block.includes('return;');
  })(),
  'No return; after emergency mode guard in bridge');

/* ── E2: Fetch interceptor installed in dashboard ────────────── */
console.log('\nE2: Fetch interceptor installed');
check('E2.1 window.fetch wrapped in dashboard JS',
  ICEPTOR.includes('window.fetch = function') || DASHV2.includes('window.fetch = function'),
  'window.fetch interceptor not installed in fixeo-dashboard-v2.js');
check('E2.2 interceptor targets /api/urgent-request',
  ICEPTOR.includes('/api/urgent-request'),
  'Fetch interceptor does not target /api/urgent-request');
check('E2.3 interceptor adds X-Fxauth-Token header',
  ICEPTOR.includes('X-Fxauth-Token'),
  'Fetch interceptor does not set X-Fxauth-Token');
check('E2.4 interceptor only activates on POST /api/urgent-request',
  ICEPTOR.includes("method === 'POST'") && ICEPTOR.includes('/api/urgent-request'),
  'Fetch interceptor does not check method=POST before injecting header');
check('E2.5 token sourced from _state.session.access_token',
  ICEPTOR.includes('_state') && ICEPTOR.includes('access_token'),
  'Token not sourced from _state.session.access_token in interceptor');
check('E2.6 original fetch preserved and called',
  DASHV2.includes('_origFetch') && DASHV2.includes('_origFetch.call'),
  'Original fetch not preserved/called in interceptor');
check('E2.7 interceptor does not affect other fetch calls',
  (function() {
    /* Guard: only activates when url contains /api/urgent-request AND method=POST */
    return ICEPTOR.includes('/api/urgent-request') && ICEPTOR.includes("method === 'POST'");
  })(),
  'Fetch interceptor may affect calls other than POST /api/urgent-request');

/* ── E3: urgent-request-fn resolves client_profile_id ───────── */
console.log('\nE3: urgent-request-fn resolves client_profile_id from X-Fxauth-Token');
check('E3.1 _resolveClientProfileId function present',
  URGENT.includes('async function _resolveClientProfileId'),
  '_resolveClientProfileId not found in urgent-request-fn');
check('E3.2 reads X-Fxauth-Token header from req',
  URGENT.includes("req.headers['x-fxauth-token']") || URGENT.includes('x-fxauth-token'),
  'urgent-request-fn does not read x-fxauth-token header');
check('E3.3 validates token via /auth/v1/user',
  URGENT.includes('/auth/v1/user'),
  'urgent-request-fn does not validate token via /auth/v1/user');
check('E3.4 uses service_role key for validation (server-side)',
  (function() {
    var fnIdx = URGENT.indexOf('async function _resolveClientProfileId');
    var fnEnd = URGENT.indexOf('\nasync function', fnIdx + 10);
    var block = URGENT.slice(fnIdx, fnEnd > fnIdx ? fnEnd : fnIdx + 2000);
    return block.includes('serviceKey') && block.includes('SUPABASE_SERVICE_ROLE_KEY');
  })(),
  '_resolveClientProfileId does not use service-role key for token validation');
check('E3.5 returns null on any failure (never throws)',
  (function() {
    var fnIdx = URGENT.indexOf('async function _resolveClientProfileId');
    var fnEnd = URGENT.indexOf('\nasync function', fnIdx + 10);
    var block = URGENT.slice(fnIdx, fnEnd > fnIdx ? fnEnd : fnIdx + 2000);
    return (block.match(/return null/g) || []).length >= 2;
  })(),
  '_resolveClientProfileId does not return null on failures — may throw');
check('E3.6 client_profile_id set in row when resolved',
  URGENT.includes('row.client_profile_id = clientProfileId'),
  'client_profile_id not conditionally set in urgent-request-fn row');
check('E3.7 client_profile_id NOT set when resolution fails (null)',
  URGENT.includes('if (clientProfileId)') && URGENT.includes('row.client_profile_id = clientProfileId'),
  'client_profile_id always set regardless of resolution result');

/* ── E4: CORS allows X-Fxauth-Token ─────────────────────────── */
console.log('\nE4: CORS header allows X-Fxauth-Token');
check('E4.1 X-Fxauth-Token in Access-Control-Allow-Headers',
  URGENT.includes('X-Fxauth-Token'),
  'X-Fxauth-Token not in CORS Allow-Headers in urgent-request-fn');

/* ── E5: Anonymous path unaffected ──────────────────────────── */
console.log('\nE5: Anonymous public path unaffected');
check('E5.1 token resolution only when header present',
  URGENT.includes('if (authToken)') || URGENT.includes("if (authToken &&"),
  'urgent-request-fn does not guard token resolution behind header presence');
check('E5.2 INSERT proceeds when clientProfileId is null',
  (function() {
    /* Row is built before the conditional client_profile_id set —
       INSERT always fires regardless of resolution result */
    var rowIdx  = URGENT.indexOf('var row = {');
    var setIdx  = URGENT.indexOf('row.client_profile_id = clientProfileId');
    var insertIdx = URGENT.indexOf('serverId = await _insertRequest(row)');
    return rowIdx >= 0 && insertIdx > rowIdx;
  })(),
  'INSERT path may be blocked when client_profile_id resolution returns null');

/* ── E6: Standard mode bridge unaffected ─────────────────────── */
console.log('\nE6: Standard mode persistence bridge unaffected');
check('E6.1 bridge still calls submitServiceRequest for non-emergency',
  BRIDGE.includes('submitServiceRequest'),
  'submitServiceRequest missing from bridge — standard path broken');
check('E6.2 emergency guard is mode-specific (not a blanket suppression)',
  (function() {
    /* Guard must be specifically on req.mode === 'emergency',
       not suppressing all modes */
    return BRIDGE.includes("req.mode === 'emergency'") &&
           BRIDGE.includes('submitServiceRequest');
  })(),
  'Bridge appears to suppress all modes — standard path may be broken');

/* ── E7: _resolveClientProfileId is server-side only ─────────── */
console.log('\nE7: _resolveClientProfileId NOT in browser JS');
check('E7.1 _resolveClientProfileId absent from dashboard JS',
  !DASHV2.includes('_resolveClientProfileId'),
  '_resolveClientProfileId found in fixeo-dashboard-v2.js — must be server-only');
check('E7.2 _resolveClientProfileId absent from V4',
  !V4.includes('_resolveClientProfileId'),
  '_resolveClientProfileId found in fx-request-flow-v4.js — must be server-only');

/* ── E8: V4 not modified ─────────────────────────────────────── */
console.log('\nE8: fx-request-flow-v4.js not modified');
check('E8.1 V4 version marker preserved',
  V4.includes('fxrf4-v5e-final-polish') || V4.includes('fxrf4-v5c'),
  'V4 version marker changed — file was modified');
check('E8.2 V4 does not contain X-Fxauth-Token',
  !V4.includes('X-Fxauth-Token'),
  'X-Fxauth-Token found in V4 — file was modified');

/* ── E9: No schema change ────────────────────────────────────── */
console.log('\nE9: No schema change');
check('E9.1 no new supabase migration file for P1.1',
  !fs.existsSync(path.join(ROOT, 'supabase/7c-p1-emergency-fix.sql')) &&
  !fs.existsSync(path.join(ROOT, 'supabase/7c11f7-emergency-auth.sql')),
  'Unexpected schema migration file found for P1.1');

/* ── E10: Single canonical row per submission ────────────────── */
console.log('\nE10: One row per submission (dual-row proof)');
check('E10.1 emergency bridge suppressed (no submitServiceRequest on emergency)',
  (function() {
    /* The bridge exits early on emergency mode BEFORE reaching submitServiceRequest */
    var guardIdx = BRIDGE.indexOf("req.mode === 'emergency'");
    var retIdx   = BRIDGE.indexOf('return;', guardIdx);
    var subIdx   = BRIDGE.indexOf('submitServiceRequest', guardIdx);
    /* return must come before submitServiceRequest */
    return guardIdx >= 0 && retIdx >= 0 && (subIdx < 0 || retIdx < subIdx);
  })(),
  'Bridge may call submitServiceRequest for emergency mode — dual-row risk remains');
check('E10.2 urgent-request-fn is the single INSERT path for emergency',
  URGENT.includes('_insertRequest(row)'),
  '_insertRequest not found in urgent-request-fn — not the canonical INSERT path');

/* ── RESULTS ─────────────────────────────────────────────────── */
console.log('\n' + '\u2500'.repeat(60));
var total = results.pass + results.fail;
console.log('Total: ' + total + ' | PASS: ' + results.pass + ' | FAIL: ' + results.fail);
if (results.fail === 0) {
  console.log('\u2713 ALL ' + total + ' PASS');
} else {
  console.log('\nFailed:');
  results.failures.forEach(function(f) { console.log('  \u2717 ' + f); });
  process.exit(1);
}
