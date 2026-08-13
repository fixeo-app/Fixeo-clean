/**
 * FIXEO Phase 7C.11F.2 — dispatch_request_v1 Wiring Tests
 * data/pricing/ux/prototype/tests/estimator-v2-11f2-dispatch-wiring-tests.js
 *
 * Tests:
 *   S-11F2-1  _callDispatch helper integrity (create-request-fn)
 *   S-11F2-2  _callDispatch helper integrity (urgent-request-fn)
 *   S-11F2-3  Dispatch wired after INSERT success
 *   S-11F2-4  Dispatch NOT called when INSERT fails
 *   S-11F2-5  Correct request_id passed to dispatch
 *   S-11F2-6  service_role stays server-side
 *   S-11F2-7  No manual mission creation added
 *   S-11F2-8  Dispatch failure surfaced truthfully
 *   S-11F2-9  Idempotency / duplicate protection
 *   S-11F2-10 Frontend response contract preserved
 *   S-11F2-11 Replayed path does NOT dispatch again
 */

'use strict';

var fs   = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '../../../../..');
var CR   = path.join(ROOT, 'api/create-request-fn/index.js');
var UR   = path.join(ROOT, 'api/urgent-request-fn/index.js');
var RES  = path.join(ROOT, 'js/reservation.js');
var FXRF = path.join(ROOT, 'js/fx-request-flow-v4.js');

var results = { pass: 0, fail: 0, failures: [] };
function pass(name) { results.pass++; process.stdout.write('  ✓ [PASS] ' + name + '\n'); }
function fail(name, reason) {
  results.fail++;
  results.failures.push(name + ': ' + reason);
  process.stdout.write('  ✗ [FAIL] ' + name + ' — ' + reason + '\n');
}
function check(name, cond, reason) { cond ? pass(name) : fail(name, reason || 'Condition false'); }

var cr  = fs.readFileSync(CR, 'utf8');
var ur  = fs.readFileSync(UR, 'utf8');
var res = fs.readFileSync(RES, 'utf8');
var fxrf = fs.existsSync(FXRF) ? fs.readFileSync(FXRF, 'utf8') : '';

/* ── S-11F2-1: _callDispatch in create-request-fn ──────── */
console.log('\nS-11F2-1: _callDispatch in create-request-fn');
check('C1.1 _callDispatch function defined',
  cr.includes('async function _callDispatch'),
  '_callDispatch not defined');
check('C1.2 calls /rest/v1/rpc/dispatch_request_v1',
  cr.includes('/rest/v1/rpc/dispatch_request_v1'),
  'RPC endpoint missing');
check('C1.3 sends p_request_id in body',
  cr.includes('p_request_id'),
  'p_request_id not passed');
check('C1.4 uses SUPABASE_SERVICE_ROLE_KEY (env var, not literal)',
  cr.includes('process.env.SUPABASE_SERVICE_ROLE_KEY') &&
  !cr.match(/['"](eyJ[A-Za-z0-9._-]{40,})['"]/),  /* no literal JWT */
  'service_role key not from env or literal key found');
check('C1.5 returns ok + dispatched + dispatch_result',
  cr.match(/ok:\s*!!\(result && result\.ok\)/) &&
  cr.includes('dispatch_result'),
  'dispatch result fields missing');
check('C1.6 handles network error without throw',
  cr.includes('dispatch_error: \'NETWORK:'),
  'network error not handled');
check('C1.7 ENV_MISSING returns ok:false without fetch call',
  cr.includes("dispatch_error: 'ENV_MISSING'"),
  'ENV_MISSING not handled');

/* ── S-11F2-2: _callDispatch in urgent-request-fn ──────── */
console.log('\nS-11F2-2: _callDispatch in urgent-request-fn');
check('C2.1 _callDispatch defined in urgent-request-fn',
  ur.includes('async function _callDispatch'),
  '_callDispatch not defined in urgent-request-fn');
check('C2.2 calls /rest/v1/rpc/dispatch_request_v1',
  ur.includes('/rest/v1/rpc/dispatch_request_v1'),
  'RPC endpoint missing in urgent-request-fn');
check('C2.3 uses process.env for service key',
  ur.includes('process.env.SUPABASE_SERVICE_ROLE_KEY'),
  'service_role not from env in urgent-request-fn');
check('C2.4 same p_request_id param name',
  ur.includes('p_request_id'),
  'p_request_id missing in urgent-request-fn dispatch call');

/* ── S-11F2-3: Dispatch wired after INSERT success ──────── */
console.log('\nS-11F2-3: Dispatch wired after INSERT success');
check('C3.1 create-request: _callDispatch called with insertedId',
  cr.includes('_callDispatch(insertedId)'),
  '_callDispatch not called with insertedId');
check('C3.2 urgent-request: _callDispatch called with serverId',
  ur.includes('_callDispatch(serverId)'),
  '_callDispatch not called with serverId');
check('C3.3 create-request: dispatch after Step 5 (new insert success)',
  (function() {
    /* _callDispatch must appear AFTER the insertedId assignment */
    var afterInsert = cr.split('_callDispatch(insertedId)')[0];
    return afterInsert.includes('insertedId = insertResult.id');
  })(),
  'dispatch appears before INSERT success');
check('C3.4 urgent-request: dispatch gated on serverId truthy',
  ur.includes('if (serverId)') &&
  (function() {
    /* _callDispatch(serverId) must appear inside the if (serverId) block */
    var ifBlock = ur.split('if (serverId)')[1];
    return ifBlock && ifBlock.indexOf('_callDispatch(serverId)') < 300;
  })(),
  'dispatch not gated on serverId');

/* ── S-11F2-4: Dispatch NOT called when INSERT fails ─────── */
console.log('\nS-11F2-4: Dispatch not called when INSERT fails');
check('C4.1 create-request: error return paths return before dispatch call',
  (function() {
    /* All error returns (UNIQUE_VIOLATION, ENV_MISSING, other) happen
     * before the _callDispatch call. Verify dispatch is NOT in the catch block. */
    var catchBlock = cr.split('} catch (insertErr) {')[1];
    if (!catchBlock) return false;
    /* Take only the catch block up to the next statement after it */
    var endOfCatch = catchBlock.indexOf('\n  /* Step 5');
    if (endOfCatch < 0) return false;
    var catchOnly = catchBlock.slice(0, endOfCatch);
    return !catchOnly.includes('_callDispatch');
  })(),
  'dispatch called inside INSERT catch block');
check('C4.2 urgent-request: dispatch gated on serverId (null on INSERT fail)',
  ur.includes('if (serverId)'),
  'no serverId guard before dispatch in urgent-request');

/* ── S-11F2-5: Correct request_id passed ───────────────── */
console.log('\nS-11F2-5: Correct request_id passed');
check('C5.1 create-request passes insertedId (the DB-generated uuid)',
  cr.includes('_callDispatch(insertedId)') &&
  cr.includes('insertedId = insertResult.id'),
  'wrong id passed to dispatch in create-request');
check('C5.2 urgent-request passes serverId (the DB-generated uuid)',
  ur.includes('_callDispatch(serverId)') &&
  ur.includes("serverId = await _insertRequest(row)"),
  'wrong id passed to dispatch in urgent-request');
check('C5.3 no caller-supplied id passed to dispatch',
  !cr.match(/_callDispatch\s*\(\s*body\./) &&
  !ur.match(/_callDispatch\s*\(\s*body\./),
  'caller-supplied body field passed to dispatch');

/* ── S-11F2-6: service_role server-side only ────────────── */
console.log('\nS-11F2-6: service_role server-side only');
check('C6.1 SUPABASE_SERVICE_ROLE_KEY only in server env (process.env)',
  cr.includes('process.env.SUPABASE_SERVICE_ROLE_KEY') &&
  ur.includes('process.env.SUPABASE_SERVICE_ROLE_KEY'),
  'service_role not from process.env');
check('C6.2 no service_role key literal in create-request-fn',
  !cr.match(/eyJ[A-Za-z0-9._-]{20,}/),
  'literal JWT found in create-request-fn');
check('C6.3 no service_role key literal in urgent-request-fn',
  !ur.match(/eyJ[A-Za-z0-9._-]{20,}/),
  'literal JWT found in urgent-request-fn');
check('C6.4 no service_role key usage in browser JS (reservation.js)',
  /* Comments mentioning service_role are fine (docs).
   * Actual use/assignment is not. Check non-comment lines only. */
  !res.split('\n').some(function(line) {
    var t = line.trim();
    return t.indexOf('//') !== 0 && t.indexOf('*') !== 0 &&
           /service_role/i.test(t) &&
           !t.match(/service_role.*JWT|service_role.*secret|service_role.*key.*env/i);
  }),
  'service_role key used (not just documented) in reservation.js');
check('C6.5 no service_role key in browser JS (fx-request-flow-v4.js)',
  !fxrf.match(/service_role/i),
  'service_role referenced in fx-request-flow-v4.js');

/* ── S-11F2-7: No manual mission creation ───────────────── */
console.log('\nS-11F2-7: No manual mission creation');
check('C7.1 create-request-fn: no missions INSERT',
  !cr.match(/from\s*\(\s*['"]missions['"]\s*\)/) &&
  !cr.match(/into\s+missions/) &&
  !cr.match(/\.insert.*missions/),
  'manual mission creation in create-request-fn');
check('C7.2 urgent-request-fn: no missions INSERT',
  !ur.match(/from\s*\(\s*['"]missions['"]\s*\)/) &&
  !ur.match(/into\s+missions/) &&
  !ur.match(/\.insert.*missions/),
  'manual mission creation in urgent-request-fn');
check('C7.3 dispatch delegated entirely to dispatch_request_v1 RPC',
  /* "missions" may appear in comments only — check no code-level reference */
  cr.includes('dispatch_request_v1') &&
  !cr.split('\n').some(function(line) {
    var t = line.trim();
    return t.indexOf('//') !== 0 && t.indexOf('*') !== 0 &&
           /\bmissions\b/.test(t) &&
           (t.includes('.from') || t.includes('.insert') || t.includes('INTO') || t.includes('SELECT'));
  }),
  'missions table touched in code (not just comment) in create-request-fn');

/* ── S-11F2-8: Dispatch failure surfaced truthfully ─────── */
console.log('\nS-11F2-8: Dispatch failure surfaced truthfully');
check('C8.1 dispatch failure logged (console.warn)',
  cr.includes('dispatch failed') && ur.includes('dispatch failed'),
  'dispatch failure not logged');
check('C8.2 dispatch failure does NOT cause 5xx response',
  (function() {
    /* After dispatch failure log, response is still 200 with ok:true + id */
    var afterWarn = cr.split('dispatch failed')[1];
    /* The next res.status call should be 200 */
    var next200 = afterWarn.indexOf('res.status(200)');
    var next5xx = afterWarn.search(/res\.status\((5\d\d|4\d\d)\)/);
    return next200 >= 0 && (next5xx < 0 || next200 < next5xx);
  })(),
  'dispatch failure causes non-200 response');
check('C8.3 dispatch_ok:false included in response when dispatch fails',
  cr.includes('dispatch_ok:') && cr.includes('dispatch_reason:'),
  'dispatch_ok/dispatch_reason not in response');
check('C8.4 request stays persisted regardless of dispatch outcome',
  cr.includes('dispatch_attempted: true') &&
  !cr.match(/dispatch.*ok.*false.*return/),  /* no early return on dispatch fail */
  'request not persisted on dispatch failure');

/* ── S-11F2-9: Idempotency / duplicate protection ──────── */
console.log('\nS-11F2-9: Idempotency / duplicate protection');
check('C9.1 replayed path returns before dispatch (no second dispatch)',
  (function() {
    /* On UNIQUE_VIOLATION, handler returns immediately after res.status(200).json
     * — _callDispatch is NOT called on the replay path */
    var replayBlock = cr.split('replayed: true')[0];
    /* replayBlock should NOT contain _callDispatch */
    var afterViolation = replayBlock.split('UNIQUE_VIOLATION')[1] || '';
    return !afterViolation.includes('_callDispatch');
  })(),
  '_callDispatch called on replay path (potential duplicate dispatch)');
check('C9.2 idempotency key required and validated',
  cr.includes('IDEM_KEY_RE.test(idempotencyKey)'),
  'idempotency key not validated');
check('C9.3 dispatch_request_v1 has own 23505 guard (documented)',
  cr.includes('23505') || cr.includes('idempotent'),
  'no mention of dispatch_request_v1 idempotency');

/* ── S-11F2-10: Frontend contract preserved ─────────────── */
console.log('\nS-11F2-10: Frontend contract preserved');
check('C10.1 create-request response still includes ok:true',
  cr.includes('ok:              true') || cr.includes("ok:       true") || cr.includes('ok: true'),
  'ok:true missing from create-request response');
check('C10.2 create-request response still includes id',
  cr.includes('id:              insertedId') || cr.includes('id:       insertedId'),
  'id field missing from create-request response');
check('C10.3 create-request response still includes ref',
  cr.includes('ref:             _makeRef') || cr.includes('ref:      _makeRef'),
  'ref field missing from create-request response');
check('C10.4 create-request response still includes replayed',
  cr.includes('replayed:        false') || cr.includes('replayed: false'),
  'replayed field missing from create-request response');
check('C10.5 reservation.js only checks body.ok and body.id (no dispatch check)',
  res.includes('body.ok') && res.includes('body.id') &&
  !res.includes('body.dispatch'),
  'reservation.js expects dispatch fields (would break on old response)');
check('C10.6 urgent-request response backward-compatible (ok, ref, id)',
  ur.includes('ok:              true') && ur.includes('ref:') && ur.includes('id:'),
  'urgent-request response missing backward-compat fields');
check('C10.7 dispatch fields additive — not required by frontend',
  !res.includes('dispatch_ok') && !res.includes('dispatch_attempted') &&
  !fxrf.includes('dispatch_ok'),
  'frontend requires dispatch fields (breaking dependency)');

/* ── S-11F2-11: Replayed path does not dispatch again ──── */
console.log('\nS-11F2-11: Replayed path does not dispatch again');
check('C11.1 replayed: true response returned before _callDispatch',
  (function() {
    /* Find position of replayed:true return vs _callDispatch */
    var replayedPos = cr.indexOf("replayed: true");
    var dispatchPos = cr.indexOf("_callDispatch(insertedId)");
    /* replayed return must come before dispatch call */
    return replayedPos > 0 && dispatchPos > 0 && replayedPos < dispatchPos;
  })(),
  'dispatch called before or at same position as replayed return');
check('C11.2 replayed return uses early return pattern',
  cr.includes("replayed: true,") &&
  cr.split("replayed: true")[0].split('\n').slice(-5).join('').includes('return'),
  'replayed path does not return early');

/* ── RESULTS ─────────────────────────────────────────────── */
console.log('\n' + '─'.repeat(58));
var total = results.pass + results.fail;
console.log('Total: ' + total + ' | PASS: ' + results.pass + ' | FAIL: ' + results.fail);
if (results.fail === 0) {
  console.log('✓ ALL ' + total + ' PASS');
} else {
  console.log('\nFailed tests:');
  results.failures.forEach(function(f) { console.log('  ✗ ' + f); });
  process.exit(1);
}
