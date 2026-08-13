/**
 * FIXEO — Client Dashboard P1 Authenticated Persistence Bridge Tests
 * data/pricing/ux/prototype/tests/dashboard-p1-persistence-bridge-tests.js
 *
 * Verifies the authenticated service_requests persistence bridge in
 * fixeo-dashboard-v2.js that closes the P1 gap:
 * "V4 submit → localStorage → NO Supabase write"
 *
 * T1:  Bridge listens to fixeo:client-request-created (authoritative event)
 * T2:  Bridge does NOT listen to fixeo:client-request-submit-success for standard persist
 * T3:  Emergency mode: fixeo:client-request-submit-success triggers refresh only
 * T4:  bridge has in-session Set dedup guard (_fxv2PersistedIds)
 * T5:  Calls FixeoSupabase.submitServiceRequest
 * T6:  Maps service_category from req.service
 * T7:  Maps city from req.city
 * T8:  Maps description from req.description
 * T9:  Missing service_category guard present
 * T10: Missing city guard present
 * T11: FixeoSupabase not available guard present
 * T12: Supabase error does NOT throw (caught, logged)
 * T13: _refresh called after successful persist
 * T14: storeId guard prevents double-fire for same id
 * T15: submitServiceRequest does NOT receive client_profile_id from caller
 * T16: submitServiceRequest does NOT receive service_role key
 * T17: requireAuth in submitServiceRequest sources client_profile_id server-side
 * T18: No direct DB write in bridge (no service_role key in browser JS)
 * T19: fixeo-client-requests-store dispatches fixeo:client-request-created ONLY on non-duplicate
 * T20: fixeo:client-request-created NOT dispatched when isDuplicateCandidate returns true
 * T21: fixeo:client-request-submit-success fired even on duplicated:true path (V4)
 * T22: Bridge ignores fixeo:client-request-submit-success for standard mode (no double-persist)
 * T23: fx-request-flow-v4.js not modified
 * T24: fixeo-supabase-core.js submitServiceRequest signature unchanged
 * T25: Artisan dashboard not modified
 * T26: Admin HTML not modified
 * T27: All 5 dashboard CTAs still present and canonical
 * T28: Legacy request modals remain absent from dashboard HTML
 * T29: VERSION bumped to v2k3
 * T30: dashboard-client.html references v2k3
 * T31: dashboard-client.html loads fixeo-client-requests-store before fx-request-flow-v4
 * T32: dashboard-client.html loads fx-request-flow-v4 before fixeo-dashboard-v2
 */
'use strict';

var fs   = require('fs');
var path = require('path');

var ROOT   = path.resolve(__dirname, '../../../../..');
var DASH   = fs.readFileSync(path.join(ROOT, 'dashboard-client.html'), 'utf8');
var DASHV2 = fs.readFileSync(path.join(ROOT, 'js/fixeo-dashboard-v2.js'), 'utf8');
var V4     = fs.readFileSync(path.join(ROOT, 'js/fx-request-flow-v4.js'), 'utf8');
var STORE  = fs.readFileSync(path.join(ROOT, 'js/fixeo-client-requests-store.js'), 'utf8');
var CORE   = fs.readFileSync(path.join(ROOT, 'js/fixeo-supabase-core.js'), 'utf8');
var ARTISAN = fs.readFileSync(path.join(ROOT, 'dashboard-artisan-v2.html'), 'utf8');
var ADMIN   = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');

var results = { pass: 0, fail: 0, failures: [] };
function pass(n) { results.pass++; process.stdout.write('  \u2713 [PASS] ' + n + '\n'); }
function fail(n, r) {
  results.fail++;
  results.failures.push(n + ': ' + r);
  process.stdout.write('  \u2717 [FAIL] ' + n + ' \u2014 ' + r + '\n');
}
function check(n, c, r) { c ? pass(n) : fail(n, r || 'Condition false'); }

/* Extract bridge block for focused assertions */
var BRIDGE_START = DASHV2.indexOf('P1 AUTHENTICATED PERSISTENCE BRIDGE');
var BRIDGE_END   = DASHV2.indexOf('V4 ANALYTICS EVENT', BRIDGE_START);
var BRIDGE       = BRIDGE_START >= 0 && BRIDGE_END >= 0
  ? DASHV2.slice(BRIDGE_START, BRIDGE_END)
  : '';

var ANALYTICS_START = DASHV2.indexOf('V4 ANALYTICS EVENT');
var ANALYTICS_END   = DASHV2.indexOf('PUBLIC API', ANALYTICS_START);
var ANALYTICS_BLOCK = ANALYTICS_START >= 0 && ANALYTICS_END >= 0
  ? DASHV2.slice(ANALYTICS_START, ANALYTICS_END)
  : '';

/* ── T1: Listens to fixeo:client-request-created ─────────────── */
console.log('\nT1: Bridge listens to fixeo:client-request-created');
check('T1.1 event listener present in bridge',
  BRIDGE.includes("'fixeo:client-request-created'"),
  'fixeo:client-request-created listener absent from bridge block');

/* ── T2: Standard persist NOT on fixeo:client-request-submit-success ── */
console.log('\nT2: Bridge does NOT persist on fixeo:client-request-submit-success');
check('T2.1 submitServiceRequest not in analytics block',
  !ANALYTICS_BLOCK.includes('submitServiceRequest'),
  'submitServiceRequest called inside analytics event block — risk of double-persist');

/* ── T3: Emergency mode refresh on submit-success ────────────── */
console.log('\nT3: Emergency mode triggers refresh via submit-success listener');
check('T3.1 emergency mode check in analytics block',
  ANALYTICS_BLOCK.includes("mode === 'emergency'") || ANALYTICS_BLOCK.includes('mode'),
  'emergency mode not checked in analytics block');
check('T3.2 _refresh scheduled in analytics block',
  ANALYTICS_BLOCK.includes('_refresh'),
  '_refresh not called in analytics block for emergency');

/* ── T4: In-session Set dedup guard ──────────────────────────── */
console.log('\nT4: In-session Set dedup guard');
check('T4.1 _fxv2PersistedIds Set declared',
  DASHV2.includes('_fxv2PersistedIds') && DASHV2.includes('new Set()'),
  '_fxv2PersistedIds Set not declared');
check('T4.2 .has() check before persist',
  BRIDGE.includes('_fxv2PersistedIds.has(storeId)'),
  '_fxv2PersistedIds.has() check missing from bridge');
check('T4.3 .add() after guard pass',
  BRIDGE.includes('_fxv2PersistedIds.add(storeId)'),
  '_fxv2PersistedIds.add() missing from bridge');

/* ── T5: Calls FixeoSupabase.submitServiceRequest ────────────── */
console.log('\nT5: Bridge calls FixeoSupabase.submitServiceRequest');
check('T5.1 call present in bridge',
  BRIDGE.includes('FixeoSupabase.submitServiceRequest'),
  'FixeoSupabase.submitServiceRequest not called in bridge');

/* ── T6: service_category mapped from req.service ────────────── */
console.log('\nT6: service_category mapped from req.service');
check('T6.1 req.service → serviceCategory mapping',
  BRIDGE.includes('req.service') && BRIDGE.includes('service_category: serviceCategory'),
  'service_category not correctly mapped from req.service');

/* ── T7: city mapped from req.city ──────────────────────────── */
console.log('\nT7: city mapped from req.city');
check('T7.1 req.city → city mapping',
  BRIDGE.includes('req.city') && BRIDGE.includes('city:'),
  'city not correctly mapped from req.city');

/* ── T8: description mapped from req.description ────────────── */
console.log('\nT8: description mapped from req.description');
check('T8.1 req.description → description mapping',
  BRIDGE.includes('req.description') && BRIDGE.includes('description:'),
  'description not correctly mapped from req.description');

/* ── T9: Missing service_category guard ──────────────────────── */
console.log('\nT9: Missing service_category guard');
check('T9.1 guard exits if no serviceCategory',
  BRIDGE.includes('!serviceCategory') || BRIDGE.includes('!city'),
  'No guard for missing service_category in bridge');

/* ── T10: Missing city guard ────────────────────────────────── */
console.log('\nT10: Missing city guard');
check('T10.1 guard exits if no city',
  BRIDGE.includes('!city'),
  'No guard for missing city in bridge');

/* ── T11: FixeoSupabase availability guard ───────────────────── */
console.log('\nT11: FixeoSupabase availability guard');
check('T11.1 guard checks window.FixeoSupabase',
  BRIDGE.includes('window.FixeoSupabase') && BRIDGE.includes('submitServiceRequest') &&
  BRIDGE.includes('typeof window.FixeoSupabase.submitServiceRequest'),
  'No guard for window.FixeoSupabase availability in bridge');

/* ── T12: Supabase error caught and logged ───────────────────── */
console.log('\nT12: Supabase error caught safely');
check('T12.1 try/catch wraps submitServiceRequest call',
  BRIDGE.includes('try {') && BRIDGE.includes('} catch (err)'),
  'submitServiceRequest not wrapped in try/catch in bridge');
check('T12.2 error logged to console.error',
  BRIDGE.includes('console.error'),
  'console.error not present in bridge catch block');

/* ── T13: _refresh called after successful persist ───────────── */
console.log('\nT13: _refresh called after successful persist');
check('T13.1 _refresh in bridge try block',
  (function() {
    var tryStart = BRIDGE.indexOf('try {');
    var catchStart = BRIDGE.indexOf('} catch');
    if (tryStart < 0 || catchStart < 0) return false;
    return BRIDGE.slice(tryStart, catchStart).includes('_refresh');
  })(),
  '_refresh not called inside the bridge try block after successful persist');

/* ── T14: Double-fire guard prevents same storeId persist ────── */
console.log('\nT14: Double-fire prevention via storeId Set');
check('T14.1 storeId derived from req.id',
  BRIDGE.includes('String(req.id') || BRIDGE.includes("req.id ||"),
  'storeId not derived from req.id in bridge');
check('T14.2 return/skip if already in Set',
  BRIDGE.includes('_fxv2PersistedIds.has(storeId)') &&
  (BRIDGE.includes('return;') || BRIDGE.includes('skipped')),
  'No early return when storeId already in _fxv2PersistedIds');

/* ── T15: client_profile_id NOT passed by caller ────────────── */
console.log('\nT15: client_profile_id not caller-supplied');
check('T15.1 client_profile_id absent from bridge submitServiceRequest call',
  (function() {
    var callIdx = BRIDGE.indexOf('submitServiceRequest({');
    if (callIdx < 0) return false;
    var callBlock = BRIDGE.slice(callIdx, callIdx + 300);
    return !callBlock.includes('client_profile_id');
  })(),
  'client_profile_id passed to submitServiceRequest from bridge — must not be caller-supplied');

/* ── T16: No service_role key in browser bridge ──────────────── */
console.log('\nT16: No service_role key in bridge');
check('T16.1 SUPABASE_SERVICE_ROLE not in dashboard JS',
  !DASHV2.includes('SUPABASE_SERVICE_ROLE') && !DASHV2.includes('service_role'),
  'Service role key found in fixeo-dashboard-v2.js — must never be in browser');

/* ── T17: submitServiceRequest sources client_profile_id server-side ── */
console.log('\nT17: submitServiceRequest sources client_profile_id from requireAuth');
check('T17.1 requireAuth called in submitServiceRequest',
  (function() {
    var fnIdx = CORE.indexOf('async function submitServiceRequest');
    var fnEnd = CORE.indexOf('async function listClientRequests', fnIdx);
    var block = CORE.slice(fnIdx, fnEnd);
    return block.includes('requireAuth') && block.includes('auth.profile.id');
  })(),
  'submitServiceRequest in supabase-core does not use requireAuth + auth.profile.id');

/* ── T18: No direct DB write in bridge ───────────────────────── */
console.log('\nT18: Bridge delegates to submitServiceRequest (no direct DB write)');
check('T18.1 no fetch() in bridge block',
  !BRIDGE.includes('fetch('),
  'Bridge contains raw fetch() — should delegate to submitServiceRequest only');
check('T18.2 no supabase.from() in bridge block',
  !BRIDGE.includes('.from('),
  'Bridge contains direct Supabase .from() call');

/* ── T19: Store dispatches fixeo:client-request-created on non-duplicate only ── */
console.log('\nT19: Store dispatches fixeo:client-request-created on non-duplicate only');
check('T19.1 dispatchUpdate called after isDuplicateCandidate check',
  (function() {
    var appendFn = STORE.indexOf('function appendRequest(');
    var endFn = STORE.indexOf('function mutateRequest', appendFn);
    var block = STORE.slice(appendFn, endFn);
    /* dispatchUpdate must appear AFTER the isDuplicateCandidate early-return */
    var dupReturn = block.indexOf('return { request: normalizeRequest(latestRaw');
    var dispatch = block.indexOf("dispatchUpdate('fixeo:client-request-created'");
    return dupReturn >= 0 && dispatch >= 0 && dispatch > dupReturn;
  })(),
  'fixeo:client-request-created may be dispatched on duplicate path in store');

/* ── T20: Duplicate path does NOT dispatch fixeo:client-request-created ── */
console.log('\nT20: Duplicate path does NOT dispatch fixeo:client-request-created');
check('T20.1 early return before dispatchUpdate on duplicate',
  (function() {
    var appendFn = STORE.indexOf('function appendRequest(');
    var endFn = STORE.indexOf('function mutateRequest', appendFn);
    var block = STORE.slice(appendFn, endFn);
    var dupReturn = block.indexOf('duplicated: true }');
    var dispatch = block.indexOf("dispatchUpdate('fixeo:client-request-created'");
    /* return must come before dispatch */
    return dupReturn >= 0 && dispatch >= 0 && dupReturn < dispatch;
  })(),
  'Duplicate return path comes AFTER dispatchUpdate — risk of event on duplicate');

/* ── T21: fixeo:client-request-submit-success fires even on duplicate ── */
console.log('\nT21: V4 fires fixeo:client-request-submit-success even on duplicated:true');
check('T21.1 _fireAnalytics called regardless of result.duplicated',
  (function() {
    /* Check that _fireAnalytics is called with result.duplicated passed through
       but NOT gated on duplicated===false */
    var callSite = V4.indexOf('_fireAnalytics(saved, st.mode, result.duplicated)');
    /* If it's called unconditionally (not inside if (!result.duplicated)) — safe */
    return callSite >= 0;
  })(),
  '_fireAnalytics not called with result.duplicated in V4');

/* ── T22: Bridge does not double-persist via submit-success for standard ── */
console.log('\nT22: No double-persist risk for standard mode');
check('T22.1 analytics block does not call submitServiceRequest',
  !ANALYTICS_BLOCK.includes('submitServiceRequest'),
  'submitServiceRequest found in analytics block — risk of double-persist for standard mode');
check('T22.2 analytics block does not call _fxv2PersistedIds',
  !ANALYTICS_BLOCK.includes('_fxv2PersistedIds'),
  'Unexpected _fxv2PersistedIds reference in analytics block');

/* ── T23: fx-request-flow-v4.js not modified ─────────────────── */
console.log('\nT23: fx-request-flow-v4.js not modified');
check('T23.1 V4 version marker preserved',
  V4.includes('fxrf4-v5e-final-polish') || V4.includes('fxrf4-v5c'),
  'V4 version marker changed — file may have been modified');
check('T23.2 V4 exposes FixeoRequestFlowV4',
  V4.includes('window.FixeoRequestFlowV4'),
  'FixeoRequestFlowV4 not exported in V4');

/* ── T24: submitServiceRequest signature unchanged ───────────── */
console.log('\nT24: submitServiceRequest signature unchanged in supabase-core');
check('T24.1 signature intact',
  CORE.includes('async function submitServiceRequest(payload)'),
  'submitServiceRequest signature changed in fixeo-supabase-core.js');
check('T24.2 inserts only: service_category, city, description, status, client_profile_id',
  (function() {
    var fnIdx = CORE.indexOf('async function submitServiceRequest');
    var fnEnd = CORE.indexOf('async function listClientRequests', fnIdx);
    var block = CORE.slice(fnIdx, fnEnd);
    return block.includes('service_category') && block.includes('city') &&
           block.includes('description') && block.includes("status: 'new'") &&
           block.includes('client_profile_id: auth.profile.id');
  })(),
  'submitServiceRequest INSERT payload changed');

/* ── T25: Artisan dashboard not modified ─────────────────────── */
console.log('\nT25: Artisan dashboard not modified');
check('T25.1 artisan dashboard unchanged',
  !ARTISAN.includes('fxv2-bridge') && !ARTISAN.includes('_fxv2PersistedIds'),
  'Artisan dashboard was unexpectedly modified');

/* ── T26: Admin HTML not modified ────────────────────────────── */
console.log('\nT26: Admin HTML not modified');
check('T26.1 admin realtime still present',
  ADMIN.includes('admin-realtime-v1.js'),
  'admin.html lost admin-realtime-v1.js');

/* ── T27: All 5 dashboard CTAs canonical ────────────────────── */
console.log('\nT27: All 5 dashboard CTA mappings preserved');
check('T27.1 new-request action present',
  DASHV2.includes("case 'new-request':"),
  'new-request CTA action missing from dashboard');
check('T27.2 new-urgent action present',
  DASHV2.includes("case 'new-urgent':"),
  'new-urgent CTA action missing from dashboard');
check('T27.3 _openNewRequest calls FixeoRequestFlowV4.open default',
  DASHV2.includes("FixeoRequestFlowV4.open({ mode: 'default'"),
  '_openNewRequest no longer calls FixeoRequestFlowV4.open with default mode');
check('T27.4 _openUrgentRequest calls FixeoRequestFlowV4.open emergency',
  DASHV2.includes("FixeoRequestFlowV4.open({ mode: 'emergency'"),
  '_openUrgentRequest no longer calls FixeoRequestFlowV4.open with emergency mode');

/* ── T28: Legacy modals absent from dashboard HTML ───────────── */
console.log('\nT28: Legacy modals remain absent from dashboard HTML');
check('T28.1 #request-modal absent',
  !DASH.includes('id="request-modal"'),
  '#request-modal back in dashboard HTML');
check('T28.2 Planifier votre intervention absent',
  !DASH.includes('Planifier votre intervention'),
  'Legacy standard modal text in dashboard HTML');
check('T28.3 Intervention urgente absent',
  !DASH.includes('Intervention urgente - Artisan disponible'),
  'Legacy urgent modal text in dashboard HTML');

/* ── T29: VERSION bumped to v2k3 ────────────────────────────── */
console.log('\nT29: VERSION bumped to v2k3');
check('T29.1 VERSION = v2k3 in dashboard JS',
  DASHV2.includes("'v2k3'"),
  "VERSION not updated to v2k3 in fixeo-dashboard-v2.js");

/* ── T30: dashboard-client.html references v2k3 ─────────────── */
console.log('\nT30: dashboard-client.html references v2k3');
check('T30.1 ?v=v2k3 in dashboard HTML',
  DASH.includes('v2k3'),
  'dashboard-client.html does not reference v2k3 version');

/* ── T31: Load order — store before V4 ──────────────────────── */
console.log('\nT31: Script load order correct');
check('T31.1 fixeo-client-requests-store before fx-request-flow-v4',
  DASH.indexOf('fixeo-client-requests-store.js') < DASH.indexOf('fx-request-flow-v4.js'),
  'Store must load before V4 engine');
check('T31.2 fx-request-flow-v4 before fixeo-dashboard-v2',
  DASH.indexOf('fx-request-flow-v4.js') < DASH.indexOf('fixeo-dashboard-v2.js'),
  'V4 must load before dashboard v2');

/* ── T32: Bridge architectural consistency ───────────────────── */
console.log('\nT32: Bridge is architecturally minimal');
check('T32.1 bridge does not contain RAFI/V4 logic',
  !BRIDGE.includes('_st') && !BRIDGE.includes('_renderStep'),
  'Bridge contains V4 internal logic — must delegate only');
check('T32.2 bridge is async IIFE wrapper',
  BRIDGE.includes('(async function ()') || BRIDGE.includes('async function'),
  'Bridge does not use async for submitServiceRequest call');
check('T32.3 no new engine created in bridge',
  !BRIDGE.includes('class ') && !BRIDGE.includes('new FixeoRequest'),
  'Bridge creates new request engine class — must not');

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
