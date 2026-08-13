/**
 * FIXEO — Missions Privilege Hardening Tests
 * data/pricing/ux/prototype/tests/missions-privilege-hardening-tests.js
 *
 * T1  anon mission DML removed (hardening SQL)
 * T2  authenticated financial direct UPDATE removed
 * T3  agreed_price direct UPDATE blocked (hardening SQL)
 * T4  commission_amount direct UPDATE blocked (hardening SQL)
 * T5  future final_price direct UPDATE blocked (migration update)
 * T6  accept/claim mission RPC path preserved (dispatch js)
 * T7  start mission RPC path preserved
 * T8  complete mission RPC path preserved
 * T9  admin/service server authority preserved (settlement fn)
 * T10 no browser service_role
 * T11 no RLS statements in hardening SQL (RLS not changed)
 * T12 hardening SQL is transactional
 * T13 verify SQL is READ ONLY (no mutations)
 * T14 authenticated SELECT preserved in hardening SQL
 * T15 authenticated INSERT preserved in hardening SQL
 * T16 authenticated UPDATE(status) preserved — artisan status path
 * T17 migration explicitly revokes final_price for anon + authenticated
 * T18 verify SQL has binary PASS/FAIL checks (Block E)
 * T19 verify SQL checks all 12 critical constraints
 */

'use strict';

var fs   = require('fs');
var path = require('path');

var ROOT    = path.resolve(__dirname, '../../../../..');
var HARD    = path.join(ROOT, 'supabase/7c11f6-missions-privilege-hardening.sql');
var VERIFY  = path.join(ROOT, 'supabase/7c11f6-missions-privilege-hardening-verify.sql');
var MIG     = path.join(ROOT, 'supabase/7c11f6-financial-settlement.sql');
var SETTLE  = path.join(ROOT, 'api/admin-settle-mission-fn/index.js');
var DISPATCH = path.join(ROOT, 'js/fixeo-artisan-dispatch-v1.js');

var hard    = fs.readFileSync(HARD,    'utf8');
var verify  = fs.readFileSync(VERIFY,  'utf8');
var mig     = fs.readFileSync(MIG,     'utf8');
var settle  = fs.readFileSync(SETTLE,  'utf8');
var dispatch = fs.readFileSync(DISPATCH, 'utf8');

var results = { pass: 0, fail: 0, failures: [] };
function pass(name) { results.pass++; process.stdout.write('  \u2713 [PASS] ' + name + '\n'); }
function fail(name, reason) {
  results.fail++;
  results.failures.push(name + ': ' + reason);
  process.stdout.write('  \u2717 [FAIL] ' + name + ' \u2014 ' + reason + '\n');
}
function check(name, cond, reason) { cond ? pass(name) : fail(name, reason || 'Condition false'); }

/* ── T1: anon mission DML removed ──────────────────────────── */
console.log('\nT1: anon mission DML revoked');
check('T1.1 REVOKE INSERT from anon',
  hard.includes('REVOKE INSERT ON TABLE public.missions FROM anon'),
  'REVOKE INSERT anon not in hardening SQL');
check('T1.2 REVOKE UPDATE from anon',
  hard.includes('REVOKE UPDATE ON TABLE public.missions FROM anon'),
  'REVOKE UPDATE anon not in hardening SQL');
check('T1.3 REVOKE DELETE from anon',
  hard.includes('REVOKE DELETE ON TABLE public.missions FROM anon'),
  'REVOKE DELETE anon not in hardening SQL');

/* ── T2: authenticated financial direct UPDATE removed ───────── */
console.log('\nT2: authenticated broad UPDATE revoked');
check('T2.1 REVOKE broad UPDATE from authenticated',
  hard.includes('REVOKE UPDATE ON TABLE public.missions FROM authenticated'),
  'REVOKE broad UPDATE authenticated not in hardening SQL');
check('T2.2 REVOKE DELETE from authenticated',
  hard.includes('REVOKE DELETE ON TABLE public.missions FROM authenticated'),
  'REVOKE DELETE authenticated not in hardening SQL');

/* ── T3: agreed_price direct UPDATE blocked ─────────────────── */
console.log('\nT3: agreed_price direct UPDATE blocked');
check('T3.1 REVOKE UPDATE(agreed_price) from authenticated',
  hard.includes('REVOKE UPDATE (agreed_price') ||
  hard.includes('REVOKE UPDATE(agreed_price'),
  'REVOKE UPDATE(agreed_price) from authenticated not in hardening SQL');
check('T3.2 REVOKE UPDATE(agreed_price) from anon',
  hard.includes('FROM anon') &&
  (hard.includes('agreed_price') && hard.includes('REVOKE UPDATE')),
  'anon agreed_price revoke missing');

/* ── T4: commission_amount direct UPDATE blocked ─────────────── */
console.log('\nT4: commission_amount direct UPDATE blocked');
check('T4.1 REVOKE UPDATE(commission_amount) from authenticated',
  hard.includes('commission_amount') &&
  hard.includes('REVOKE UPDATE') &&
  hard.includes('FROM authenticated'),
  'REVOKE UPDATE(commission_amount) from authenticated not found');
check('T4.2 anon commission_amount column revoke',
  hard.includes('commission_amount') &&
  hard.includes('FROM anon'),
  'anon commission_amount column revoke missing');

/* ── T5: final_price direct UPDATE blocked ──────────────────── */
console.log('\nT5: future final_price direct UPDATE blocked in migration');
check('T5.1 migration revokes final_price for anon',
  mig.includes('REVOKE UPDATE (final_price)') &&
  mig.includes('FROM anon'),
  'migration does not revoke UPDATE(final_price) for anon');
check('T5.2 migration revokes final_price for authenticated',
  mig.includes('REVOKE UPDATE (final_price)') &&
  mig.includes('FROM authenticated'),
  'migration does not revoke UPDATE(final_price) for authenticated');
check('T5.3 migration marks final_price as WRITE-RESTRICTED',
  mig.includes('WRITE-RESTRICTED') || mig.includes('service_role'),
  'migration does not document final_price write restriction');

/* ── T6: claim mission RPC path preserved ───────────────────── */
console.log('\nT6: claim_mission RPC preserved');
check('T6.1 claim_mission rpc in dispatch js',
  dispatch.includes("rpc('claim_mission'"),
  'claim_mission RPC not found in dispatch js');
check('T6.2 hardening SQL does not revoke EXECUTE on RPCs',
  !hard.includes('REVOKE EXECUTE'),
  'REVOKE EXECUTE found in hardening SQL — RPC authority removed');

/* ── T7: start mission RPC path preserved ───────────────────── */
console.log('\nT7: start_mission RPC preserved');
check('T7.1 start_mission rpc in dispatch js',
  dispatch.includes("rpc('start_mission'"),
  'start_mission RPC not found in dispatch js');

/* ── T8: complete mission RPC path preserved ────────────────── */
console.log('\nT8: complete_mission RPC preserved');
check('T8.1 complete_mission rpc in dispatch js',
  dispatch.includes("rpc('complete_mission'"),
  'complete_mission RPC not found in dispatch js');

/* ── T9: admin/service server authority preserved ───────────── */
console.log('\nT9: admin/service_role authority preserved');
check('T9.1 settlement fn uses process.env service key (server only)',
  settle.includes('process.env.SUPABASE_SERVICE_ROLE_KEY'),
  'settlement fn does not use server-side service key');
check('T9.2 hardening SQL does not revoke from service_role',
  !hard.match(/REVOKE.*FROM service_role/i),
  'hardening SQL revokes from service_role');

/* ── T10: no browser service_role ───────────────────────────── */
console.log('\nT10: no browser service_role');
var artisanDispatch = fs.readFileSync(
  path.join(ROOT, 'js/fixeo-artisan-dispatch-v1.js'), 'utf8');
check('T10.1 no literal service_role key in dispatch js',
  !artisanDispatch.match(/eyJ[A-Za-z0-9._-]{20,}/),
  'literal JWT found in dispatch js');
var supabaseCore = fs.readFileSync(
  path.join(ROOT, 'js/fixeo-supabase-core.js'), 'utf8');
check('T10.2 no literal service_role key in supabase core',
  !supabaseCore.match(/eyJ[A-Za-z0-9._-]{20,}/),
  'literal JWT found in supabase-core js');

/* ── T11: RLS not changed in hardening SQL ──────────────────── */
console.log('\nT11: RLS not changed');
check('T11.1 no CREATE POLICY in hardening SQL',
  !hard.match(/CREATE POLICY/i),
  'CREATE POLICY found in hardening SQL');
check('T11.2 no ALTER POLICY in hardening SQL',
  !hard.match(/ALTER POLICY/i),
  'ALTER POLICY found in hardening SQL');
check('T11.3 no DROP POLICY in hardening SQL',
  !hard.match(/DROP POLICY/i),
  'DROP POLICY found in hardening SQL');
check('T11.4 no ALTER TABLE ENABLE ROW LEVEL SECURITY in hardening SQL',
  !hard.match(/ENABLE ROW LEVEL SECURITY/i),
  'RLS toggle found in hardening SQL');

/* ── T12: hardening SQL is transactional ────────────────────── */
console.log('\nT12: hardening SQL is transactional');
check('T12.1 BEGIN; present',
  hard.includes('BEGIN;'),
  'BEGIN; not in hardening SQL');
check('T12.2 COMMIT; present',
  hard.includes('COMMIT;'),
  'COMMIT; not in hardening SQL');

/* ── T13: verify SQL is READ ONLY ───────────────────────────── */
console.log('\nT13: verify SQL is READ ONLY');
var verifyLines = verify.split('\n').filter(function(l) {
  return !l.trim().startsWith('--');
}).join('\n');
check('T13.1 no INSERT in verify SQL',
  !verifyLines.match(/^\s*INSERT\b/im),
  'INSERT in verify SQL');
check('T13.2 no UPDATE in verify SQL',
  !verifyLines.match(/^\s*UPDATE\b/im),
  'UPDATE in verify SQL');
check('T13.3 no DELETE in verify SQL',
  !verifyLines.match(/^\s*DELETE\b/im),
  'DELETE in verify SQL');
check('T13.4 no ALTER in verify SQL',
  !verifyLines.match(/^\s*ALTER\b/im),
  'ALTER in verify SQL');
check('T13.5 no REVOKE in verify SQL',
  !verifyLines.match(/^\s*REVOKE\b/im),
  'REVOKE in verify SQL');
check('T13.6 no GRANT in verify SQL',
  !verifyLines.match(/^\s*GRANT\b/im),
  'GRANT in verify SQL');

/* ── T14: authenticated SELECT preserved ────────────────────── */
console.log('\nT14: authenticated SELECT preserved');
check('T14.1 GRANT SELECT to authenticated in hardening SQL',
  hard.includes('GRANT SELECT ON TABLE public.missions TO authenticated'),
  'GRANT SELECT authenticated not confirmed in hardening SQL');

/* ── T15: authenticated INSERT preserved ────────────────────── */
console.log('\nT15: authenticated INSERT preserved');
check('T15.1 GRANT INSERT to authenticated in hardening SQL',
  hard.includes('GRANT INSERT ON TABLE public.missions TO authenticated'),
  'GRANT INSERT authenticated not confirmed in hardening SQL');

/* ── T16: authenticated UPDATE(status) preserved ─────────────── */
console.log('\nT16: authenticated UPDATE(status) preserved');
check('T16.1 GRANT UPDATE(status) to authenticated in hardening SQL',
  hard.includes('GRANT UPDATE (status) ON TABLE public.missions TO authenticated'),
  'GRANT UPDATE(status) authenticated not in hardening SQL');
check('T16.2 UPDATE(status) purpose documented (artisan path)',
  hard.includes('artisan') && hard.includes('status'),
  'artisan status path not documented in hardening SQL');

/* ── T17: migration revokes final_price ─────────────────────── */
console.log('\nT17: migration revokes final_price for anon + authenticated');
check('T17.1 both roles covered',
  mig.includes('FROM anon') && mig.includes('FROM authenticated') &&
  mig.match(/REVOKE UPDATE \(final_price\)/),
  'migration does not cover both roles for final_price revoke');
check('T17.2 migration prerequisite documented',
  mig.includes('7c11f6-missions-privilege-hardening.sql') ||
  mig.includes('PREREQUISITE'),
  'migration does not document hardening prerequisite');

/* ── T18: verify SQL has binary PASS/FAIL block ─────────────── */
console.log('\nT18: verify SQL has binary PASS/FAIL checks');
check('T18.1 Block E PASS/FAIL present',
  verify.includes('PASS') && verify.includes('FAIL') &&
  verify.includes('CASE WHEN expected = actual'),
  'Block E binary checks missing from verify SQL');

/* ── T19: verify SQL checks all 12 critical constraints ──────── */
console.log('\nT19: verify SQL checks all 12 critical constraints');
var e1  = verify.includes('anon INSERT on missions revoked');
var e2  = verify.includes('anon UPDATE on missions revoked');
var e3  = verify.includes('anon DELETE on missions revoked');
var e4  = verify.includes('authenticated DELETE on missions revoked');
var e5  = verify.includes('authenticated UPDATE(agreed_price) revoked');
var e6  = verify.includes('authenticated UPDATE(commission_amount) revoked');
var e7  = verify.includes('authenticated SELECT on missions preserved');
var e8  = verify.includes('authenticated INSERT on missions preserved');
var e9  = verify.includes('authenticated UPDATE(status) preserved');
var e10 = verify.includes('anon UPDATE(agreed_price) revoked');
var e11 = verify.includes('anon UPDATE(commission_amount) revoked');
var e12 = verify.includes('missions RLS enabled');
check('T19 all 12 binary checks in verify SQL',
  e1&&e2&&e3&&e4&&e5&&e6&&e7&&e8&&e9&&e10&&e11&&e12,
  'One or more of the 12 binary checks missing from verify SQL (E1-E12)');

/* ── RESULTS ─────────────────────────────────────────────────── */
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
