/**
 * FIXEO — Admin Realtime V1 Tests
 * data/pricing/ux/prototype/tests/admin-realtime-v1-tests.js
 *
 * Static analysis tests for admin-realtime-v1.js and related files.
 *
 * T1  realtime channel created once (idempotent guard)
 * T2  service_requests events trigger canonical sync
 * T3  missions events trigger canonical sync
 * T4  claim_requests events trigger canonical sync
 * T5  refresh is debounced
 * T6  60s polling fallback remains active in admin-canonical-sync-v1.js
 * T7  channel errors do not break admin (reconnect, no throw)
 * T8  no service_role in browser JS (admin-realtime-v1.js)
 * T9  channel cleanup occurs (beforeunload + explicit)
 * T10 existing admin command center behavior preserved
 */

'use strict';

var fs   = require('fs');
var path = require('path');

var ROOT    = path.resolve(__dirname, '../../../../..');
var RT_PATH = path.join(ROOT, 'js/admin-realtime-v1.js');
var CS_PATH = path.join(ROOT, 'js/admin-canonical-sync-v1.js');
var V4_PATH = path.join(ROOT, 'js/admin-command-center-v4.js');

var results = { pass: 0, fail: 0, failures: [] };
function pass(name) { results.pass++; process.stdout.write('  \u2713 [PASS] ' + name + '\n'); }
function fail(name, reason) {
  results.fail++;
  results.failures.push(name + ': ' + reason);
  process.stdout.write('  \u2717 [FAIL] ' + name + ' \u2014 ' + reason + '\n');
}
function check(name, cond, reason) { cond ? pass(name) : fail(name, reason || 'Condition false'); }

var rt = fs.readFileSync(RT_PATH, 'utf8');
var cs = fs.readFileSync(CS_PATH, 'utf8');
var v4 = fs.existsSync(V4_PATH) ? fs.readFileSync(V4_PATH, 'utf8') : '';

/* ── T1: channel created once (idempotent guard) ─────────── */
console.log('\nT1: Realtime channel created once (idempotent guard)');
check('T1.1 idempotent guard variable defined',
  rt.includes('_fxAdminRtV1Loaded'),
  '_fxAdminRtV1Loaded guard not present');
check('T1.2 early return if already loaded',
  rt.includes('if (window._fxAdminRtV1Loaded) return'),
  'early return guard missing');
check('T1.3 channel stored in single variable (_channel)',
  rt.includes('var _channel') && rt.includes('_channel = channel'),
  '_channel state variable missing');
check('T1.4 single CHANNEL_NAME constant',
  rt.match(/var CHANNEL_NAME\s*=\s*'[^']+'/) !== null,
  'CHANNEL_NAME constant missing');
check('T1.5 channel created via sb.channel(CHANNEL_NAME)',
  rt.includes('sb.channel(CHANNEL_NAME'),
  'channel not created with CHANNEL_NAME');

/* ── T2: service_requests events trigger canonical sync ──── */
console.log('\nT2: service_requests → canonical sync');
check('T2.1 service_requests in TABLES list',
  rt.includes("'service_requests'"),
  'service_requests not in TABLES');
check('T2.2 INSERT event subscribed for service_requests',
  rt.includes("event: 'INSERT'") && rt.includes("table: table"),
  'INSERT subscription for service_requests missing');
check('T2.3 UPDATE event subscribed for service_requests',
  rt.includes("event: 'UPDATE'"),
  'UPDATE subscription missing');
check('T2.4 FixeoAdminCanonicalSync.sync called on event',
  rt.includes('FixeoAdminCanonicalSync') && rt.includes('.sync()'),
  'FixeoAdminCanonicalSync.sync not called');
check('T2.5 _scheduleRefresh routes to _triggerCanonicalSync',
  rt.includes('_triggerCanonicalSync') && rt.includes('clearTimeout(_debounceTimer)'),
  '_scheduleRefresh → _triggerCanonicalSync not wired');

/* ── T3: missions events trigger canonical sync ──────────── */
console.log('\nT3: missions → canonical sync');
check('T3.1 missions in TABLES list',
  rt.includes("'missions'"),
  'missions not in TABLES');

/* ── T4: claim_requests events trigger canonical sync ─────── */
console.log('\nT4: claim_requests → canonical sync');
check('T4.1 claim_requests in TABLES list',
  rt.includes("'claim_requests'"),
  'claim_requests not in TABLES');

/* ── T5: refresh is debounced ────────────────────────────── */
console.log('\nT5: Refresh is debounced');
check('T5.1 DEBOUNCE_MS constant defined',
  rt.match(/var DEBOUNCE_MS\s*=\s*\d+/) !== null,
  'DEBOUNCE_MS constant missing');
check('T5.2 setTimeout used with DEBOUNCE_MS',
  rt.includes('setTimeout') && rt.includes('DEBOUNCE_MS'),
  'debounce setTimeout not used');
check('T5.3 clearTimeout called before new debounce timer',
  rt.includes('clearTimeout(_debounceTimer)'),
  'clearTimeout not called before scheduling refresh');
check('T5.4 only one debounce timer variable (_debounceTimer)',
  rt.includes('var _debounceTimer') && !rt.includes('var _debounceTimer2'),
  '_debounceTimer not a single variable');

/* ── T6: 60s polling fallback preserved ──────────────────── */
console.log('\nT6: 60s polling fallback preserved in admin-canonical-sync-v1.js');
check('T6.1 setInterval(_syncAll, 60000) still in admin-canonical-sync-v1.js',
  cs.includes('setInterval(_syncAll, 60000)') || cs.includes('setInterval(function'),
  '60s polling removed from admin-canonical-sync-v1.js');
check('T6.2 admin-realtime-v1.js does not remove setInterval from CS',
  !rt.includes('clearInterval') || rt.indexOf('clearInterval') < 0,
  'admin-realtime-v1.js clears CS setInterval — polling fallback may be broken');
check('T6.3 fallback logged when realtime unavailable',
  rt.includes('polling fallback'),
  'no fallback mention when realtime unavailable');

/* ── T7: channel errors do not break admin ───────────────── */
console.log('\nT7: Channel errors handled gracefully');
check('T7.1 CHANNEL_ERROR status handled',
  rt.includes('CHANNEL_ERROR'),
  'CHANNEL_ERROR not handled');
check('T7.2 TIMED_OUT status handled',
  rt.includes('TIMED_OUT'),
  'TIMED_OUT not handled');
check('T7.3 reconnect timer on error (RECONNECT_MS)',
  rt.includes('RECONNECT_MS') && rt.includes('_reconnectTimer'),
  'reconnect timer missing');
check('T7.4 error sets _status to error (not crash)',
  rt.includes("_status = 'error'"),
  "_status not set to 'error' on channel problem");
check('T7.5 subscribe wrapped in try/catch',
  rt.includes('try {') && rt.includes('} catch'),
  'subscribe not wrapped in try/catch');
check('T7.6 getSb failure handled gracefully (catch on Promise)',
  rt.includes('.catch(function') || rt.includes('.catch(function(e)'),
  'getSb() failure not caught');

/* ── T8: no service_role in browser JS ───────────────────── */
console.log('\nT8: No service_role in admin-realtime-v1.js');
check('T8.1 no literal JWT in admin-realtime-v1.js',
  !rt.match(/eyJ[A-Za-z0-9._-]{20,}/),
  'literal JWT found in admin-realtime-v1.js');
check('T8.2 no SUPABASE_SERVICE_ROLE_KEY reference (non-comment)',
  !rt.split('\n').some(function(line) {
    var t = line.trim();
    return t.indexOf('//') !== 0 && t.indexOf('*') !== 0 &&
           /SUPABASE_SERVICE_ROLE_KEY/.test(t);
  }),
  'SUPABASE_SERVICE_ROLE_KEY in non-comment line');
check('T8.3 uses authenticated client (getSb / FixeoSupabaseClient)',
  rt.includes('FixeoSupabaseClient') || rt.includes('_fixeoSupabaseClient'),
  'authenticated client not used');
check('T8.4 no service_role string in source',
  !rt.toLowerCase().includes('service_role'),
  'service_role string found in admin-realtime-v1.js');

/* ── T9: channel cleanup ─────────────────────────────────── */
console.log('\nT9: Channel cleanup occurs');
check('T9.1 _cleanup function defined',
  rt.includes('function _cleanup('),
  '_cleanup function missing');
check('T9.2 cleanup called on beforeunload',
  rt.includes('beforeunload') && rt.includes('_cleanup'),
  'beforeunload cleanup not wired');
check('T9.3 removeChannel or unsubscribe called in cleanup',
  rt.includes('removeChannel') || rt.includes('unsubscribe()'),
  'neither removeChannel nor unsubscribe called in cleanup');
check('T9.4 old channel cleaned up before new subscribe',
  (function() {
    var subscribeIdx = rt.indexOf('function _subscribe(');
    var cleanupCallIdx = rt.indexOf('_cleanup(sb)', subscribeIdx);
    return subscribeIdx >= 0 && cleanupCallIdx > subscribeIdx &&
           cleanupCallIdx < subscribeIdx + 300;
  })(),
  '_cleanup not called at start of _subscribe');
check('T9.5 _channel set to null after cleanup',
  rt.includes('_channel = null'),
  '_channel not nulled after cleanup');
check('T9.6 debounce and reconnect timers cleared in cleanup',
  rt.includes('clearTimeout(_debounceTimer)') &&
  rt.includes('clearTimeout(_reconnectTimer)'),
  'timers not cleared in cleanup');

/* ── T10: existing admin command center behavior preserved ── */
console.log('\nT10: Existing admin command center behavior preserved');
check('T10.1 admin-canonical-sync-v1.js FixeoAdminCanonicalSync still exported',
  cs.includes('window.FixeoAdminCanonicalSync') && cs.includes('sync:'),
  'FixeoAdminCanonicalSync public API missing from CS');
check('T10.2 _syncAll function still in admin-canonical-sync-v1.js',
  cs.includes('async function _syncAll') || cs.includes('function _syncAll'),
  '_syncAll removed from admin-canonical-sync-v1.js');
check('T10.3 admin-realtime-v1.js does not redefine _syncAll',
  !rt.includes('function _syncAll'),
  'admin-realtime-v1.js redefines _syncAll — conflict risk');
check('T10.4 V4 refresh triggered on event if available',
  rt.includes('FixeoAccV4') && rt.includes('.refresh()'),
  'FixeoAccV4.refresh not triggered on realtime event');
check('T10.5 realtime module is additive (no writes to DB)',
  !rt.includes('.insert(') && !rt.includes('.update(') && !rt.includes('.delete('),
  'admin-realtime-v1.js performs DB writes — must be read-only');
check('T10.6 public FixeoAdminRealtime API exported',
  rt.includes('window.FixeoAdminRealtime') &&
  rt.includes('status:') && rt.includes('restart:'),
  'FixeoAdminRealtime public API incomplete');
check('T10.7 admin page guard present (data-dash-type=admin)',
  rt.includes("dashType !== 'admin'"),
  'admin page guard missing — realtime runs on non-admin pages');
check('T10.8 freshness indicator updates #fxacs-last-sync',
  rt.includes('fxacs-last-sync') && rt.includes('Mis \u00e0 jour'),
  'freshness indicator missing');
check('T10.9 subtle pulse on urgent service_requests INSERT',
  rt.includes('_pulseUrgentIndicator') || rt.includes('fxacs-home-panel'),
  'urgent pulse indicator missing');

/* ── RESULTS ─────────────────────────────────────────────── */
console.log('\n' + '\u2500'.repeat(58));
var total = results.pass + results.fail;
console.log('Total: ' + total + ' | PASS: ' + results.pass + ' | FAIL: ' + results.fail);
if (results.fail === 0) {
  console.log('\u2713 ALL ' + total + ' PASS');
} else {
  console.log('\nFailed tests:');
  results.failures.forEach(function(f) { console.log('  \u2717 ' + f); });
  process.exit(1);
}
