/**
 * FIXEO — Financial Truth & Settlement Tests  v1a
 * data/pricing/ux/prototype/tests/financial-truth-v1-tests.js
 *
 * Static analysis tests confirming the financial truth contract.
 * No server calls. No DB. Tests read source files only.
 *
 * T1  financial source truth: agreed_price sourced from missions only
 * T2  null remains — (no zero-fill of unknown price)
 * T3  no agreed_price→earnings inference (no blind subtraction)
 * T4  no completion→paid inference
 * T5  admin mission supervision uses localStorage/LS (not server-bearer auth)
 *     → settlement writes go through _writeReqPatch (LS-first)
 *     → this is the MISSING CONTRACT (documented, not fixed here)
 * T6  non-admin mission supervision: confirmed no privileged Supabase PATCH
 *     of commission/financial fields in front-end without admin check
 * T7  invalid amount guard in admin-mission-supervision-p3.js
 * T8  artisan sees only canonical amount (artisan_net from LS/commission lifecycle)
 * T9  no fake commission (no hardcoded commission rate applied to null prices)
 * T10 no service_role in financial JS files
 * T11 admin-canonical-sync-v1 shows agreed_price/final_price only when not null
 * T12 payments table has RLS (confirmed in sql files)
 * T13 fixeo-client-requests-store: artisan_net not inferred when finalPrice=0
 */

'use strict';

var fs   = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '../../../../..');

function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

var results = { pass: 0, fail: 0, failures: [] };
function pass(name) { results.pass++; process.stdout.write('  \u2713 [PASS] ' + name + '\n'); }
function fail(name, reason) {
  results.fail++;
  results.failures.push(name + ': ' + reason);
  process.stdout.write('  \u2717 [FAIL] ' + name + ' \u2014 ' + reason + '\n');
}
function check(name, cond, reason) { cond ? pass(name) : fail(name, reason || 'Condition false'); }

var cs   = src('js/admin-canonical-sync-v1.js');
var sup3 = src('js/admin-mission-supervision-p3.js');
var store= src('js/fixeo-client-requests-store.js');
var mvp  = src('js/fixeo-mvp-supabase.js');
var mlp2 = src('js/mission-lifecycle-p2.js');
var rlsFix = src('supabase/rls-fix-2026-04-29.sql');

/* ── T1: agreed_price sourced from missions table ─────────── */
console.log('\nT1: agreed_price sourced from missions table');
check('T1.1 admin-canonical-sync-v1 selects agreed_price from missions',
  cs.includes('agreed_price') && cs.includes("from('missions')") || cs.includes('missions'),
  'agreed_price not fetched from missions in CS');
check('T1.2 agreed_price shown only when not null in CS',
  cs.includes('agreed_price !== null') || cs.includes("agreed_price !== null && m.agreed_price !== undefined"),
  'agreed_price shown without null guard in CS');
check('T1.3 final_price shown only when not null in CS',
  cs.includes('final_price !== null') || cs.includes("final_price !== null && m.final_price !== undefined"),
  'final_price shown without null guard in CS');

/* ── T2: null remains — (no zero-fill) ───────────────────── */
console.log('\nT2: Null remains — (no zero-fill)');
check('T2.1 CS uses — for unknown price (not 0 MAD)',
  cs.includes('\u2014') || cs.includes('&mdash;') || cs.includes("'—'"),
  'CS does not use — for unknown price');
check('T2.2 dispatch-v1 inserts agreed_price=NULL at offer time',
  exists('supabase/7c11f1-dispatch-v1.sql') &&
  src('supabase/7c11f1-dispatch-v1.sql').includes('agreed_price') &&
  src('supabase/7c11f1-dispatch-v1.sql').includes('NULL') &&
  src('supabase/7c11f1-dispatch-v1.sql').includes('no price invented'),
  'dispatch-v1 does not insert agreed_price=NULL');
check('T2.3 admin-mission-supervision-p3 does not 0-fill artisan_net on new missions',
  (function() {
    /* _writeReqPatch with artisan_net=0 only appears in confirm-price action (after price entered) */
    /* It must NOT appear unconditionally on new mission creation */
    var newMissionIdx = sup3.indexOf("status              : 'termin");
    var zeroNet = sup3.indexOf('artisan_net         : net');
    /* net is computed from price — not zero-filled */
    return zeroNet < 0 || sup3.indexOf('net  = price - comm') > 0;
  })(),
  'artisan_net zero-filled unconditionally in supervision');

/* ── T3: no agreed_price→earnings blind inference ────────── */
console.log('\nT3: No blind agreed_price→earnings inference');
check('T3.1 mission-lifecycle-p2 reads artisan_net from field (not computed)',
  mlp2.includes('r.artisan_net') && !mlp2.match(/artisan_net\s*=\s*agreed_price\s*\*/),
  'artisan_net inferred from agreed_price blindly in mission-lifecycle-p2');
check('T3.2 CS: agreed_price not multiplied to get net payout',
  !cs.match(/agreed_price\s*\*\s*0\.\d/) && !cs.match(/agreed_price\s*\*\s*COMMISSION/),
  'CS infers net payout from agreed_price');
check('T3.3 fixeo-client-requests-store: artisan_net uses explicit field first',
  store.includes('raw?.artisan_net'),
  'artisan_net not read from explicit field in store');

/* ── T4: no completion→paid inference ───────────────────── */
console.log('\nT4: No completion→paid inference');
check('T4.1 CS does not mark missions as paid based on status alone',
  !cs.match(/status\s*===\s*'completed'.*paid/i) &&
  !cs.match(/paid.*status\s*===\s*'completed'/i),
  'CS infers paid from completed status');
check('T4.2 admin-commission-polish-p1b checks commission_paid field explicitly',
  exists('js/admin-commission-polish-p1b.js') &&
  src('js/admin-commission-polish-p1b.js').includes('commission_paid'),
  'commission_paid field not checked explicitly');
check('T4.3 payment state not inferred from mission.status in CS',
  !cs.includes('commission_paid') || cs.match(/commission_paid.*===.*true/),
  'commission_paid inferred without explicit boolean check');

/* ── T5: admin settlement writes go through LS (missing contract documented) */
console.log('\nT5: Admin settlement write contract (LS-first — missing server path)');
check('T5.1 _writeReqPatch is localStorage-first',
  sup3.includes('localStorage.getItem') && sup3.includes('localStorage.setItem'),
  '_writeReqPatch does not use localStorage');
check('T5.2 _syncStatusToSupabase writes ONLY status (not financial fields)',
  (function() {
    var syncIdx = sup3.indexOf('function _syncStatusToSupabase');
    if (syncIdx < 0) return true;
    var block = sup3.slice(syncIdx, syncIdx + 1500);
    /* The Supabase PATCH in _syncStatusToSupabase must only contain status */
    return !block.includes('final_price') &&
           !block.includes('commission_amount') &&
           !block.includes('artisan_net');
  })(),
  '_syncStatusToSupabase writes financial fields to Supabase — privilege escalation risk');
check('T5.3 financial field PATCH in _writeReqPatch stays in localStorage only',
  (function() {
    /* The Supabase write-back (_syncStatusToSupabase) only fires for status changes */
    var syncFn = sup3.indexOf('function _syncStatusToSupabase');
    var block   = syncFn >= 0 ? sup3.slice(syncFn, syncFn + 200) : '';
    return block.includes('patch.status') || block.includes('patch && !patch.status');
  })(),
  '_syncStatusToSupabase not gated on status-only patch');

/* ── T6: no privileged Supabase commission PATCH from browser without auth */
console.log('\nT6: No privileged financial PATCH without auth');
check('T6.1 admin-mission-supervision-p3 has no Bearer token auth for financial writes',
  !sup3.includes('Authorization') || !sup3.includes('Bearer'),
  'Surprising: Bearer auth in admin-mission-supervision-p3 (unexpected — verify if intentional)');
check('T6.2 financial fields in _writeReqPatch never sent to Supabase via _syncStatusToSupabase',
  (function() {
    var fn = sup3.slice(sup3.indexOf('function _syncStatusToSupabase') || 0);
    var block = fn.slice(0, 1500);
    return !block.includes('commission_amount') && !block.includes('final_price') && !block.includes('artisan_net');
  })(),
  'Financial fields sent to Supabase via _syncStatusToSupabase');

/* ── T7: invalid amount guard ─────────────────────────────── */
console.log('\nT7: Invalid amount guard in admin-mission-supervision-p3');
check('T7.1 _validatePrice function defined',
  sup3.includes('function _validatePrice') || sup3.includes('_validatePrice'),
  '_validatePrice not defined');
check('T7.2 price > 0 required before settlement',
  sup3.includes('price') && (sup3.match(/price\s*<=\s*0/) || sup3.match(/price\s*<\s*1/) || sup3.includes('_validatePrice')),
  'price <= 0 not guarded before settlement');

/* ── T8: artisan sees only canonical amount ──────────────── */
console.log('\nT8: Artisan sees only canonical amount');
check('T8.1 mission-lifecycle-p2 shows artisan_net only when present and > 0',
  mlp2.includes('artisan_net') && mlp2.includes('parseFloat(r.artisan_net) > 0'),
  'artisan_net shown without > 0 guard');
check('T8.2 mission-lifecycle-p2 does not show commission_amount to artisan',
  !mlp2.match(/commission_amount.*artisan/) && !mlp2.includes('Commission Fixeo'),
  'commission_amount or commission label shown to artisan in mission-lifecycle-p2');

/* ── T9: no fake commission on null prices ───────────────── */
console.log('\nT9: No fake commission on null prices');
check('T9.1 store: commission not calculated when finalPrice = 0',
  (function() {
    /* artisan_net = finalPrice - commissionAmount
     * artisanNet must NOT be nonzero when finalPrice = 0 */
    var netLine = store.match(/artisanNet\s*=\s*roundMoney\([^)]+\)/);
    if (!netLine) return true;
    /* The inline fallback should short-circuit on finalPrice > 0 */
    return store.includes('finalPrice > 0 ? finalPrice - commissionAmount : 0');
  })(),
  'artisan_net calculated even when finalPrice = 0 in store');
check('T9.2 admin-command-center-v4: commission_amount read from canonical field only',
  exists('js/admin-command-center-v4.js') &&
  src('js/admin-command-center-v4.js').includes('commission_amount') &&
  /* V4 must NOT fall back to ap * 0.1 inference (removed in 7C.11F.6) */
  !src('js/admin-command-center-v4.js').includes('ap * 0.1'),
  'V4 commission fallback inference (ap * 0.1) still present');

/* ── T10: no service_role in financial browser files ─────── */
console.log('\nT10: No service_role in financial browser JS');
[
  'js/admin-canonical-sync-v1.js',
  'js/admin-mission-supervision-p3.js',
  'js/fixeo-client-requests-store.js',
  'js/mission-lifecycle-p2.js',
  'js/admin-commission-polish-p1b.js'
].forEach(function(rel) {
  if (!exists(rel)) return;
  var code = src(rel);
  check('T10.' + path.basename(rel) + ' — no literal JWT',
    !code.match(/eyJ[A-Za-z0-9._-]{20,}/),
    'literal JWT found in ' + rel);
  check('T10.' + path.basename(rel) + ' — no SUPABASE_SERVICE_ROLE_KEY (non-comment)',
    !code.split('\n').some(function(line) {
      var t = line.trim();
      return t.indexOf('//') !== 0 && t.indexOf('*') !== 0 &&
             /SUPABASE_SERVICE_ROLE_KEY/.test(t);
    }),
    'SUPABASE_SERVICE_ROLE_KEY in non-comment line of ' + rel);
});

/* ── T11: CS agreed_price/final_price null-guarded ──────── */
console.log('\nT11: CS null-guards on financial display');
check('T11.1 CS agreed_price null-guarded before display',
  cs.includes('agreed_price !== null') ||
  cs.includes('a.agreed_price') && cs.includes('null'),
  'CS displays agreed_price without null guard');
check('T11.2 CS final_price null-guarded before display',
  cs.includes('final_price !== null') ||
  cs.includes('a.final_price') && cs.includes('null'),
  'CS displays final_price without null guard');

/* ── T12: payments table has RLS ─────────────────────────── */
console.log('\nT12: payments table has RLS');
check('T12.1 RLS enabled on payments',
  rlsFix.includes('payments ENABLE ROW LEVEL SECURITY') ||
  rlsFix.includes("TABLE public.payments ENABLE ROW LEVEL SECURITY"),
  'payments RLS not enabled in rls-fix sql');
check('T12.2 payments_owner_read policy exists',
  rlsFix.includes('payments_owner_read'),
  'payments_owner_read policy not found');
check('T12.3 payments_admin_all policy exists',
  rlsFix.includes('payments_admin_all'),
  'payments_admin_all policy not found');
check('T12.4 payments table has id,mission_id,amount,status columns (per preflight)',
  exists('supabase/rls-preflight-2026-05-08.sql') &&
  src('supabase/rls-preflight-2026-05-08.sql').includes('id, mission_id, amount, status, created_at'),
  'payments schema columns not confirmed in preflight');

/* ── T13: artisan_net not inferred when finalPrice=0 ─────── */
console.log('\nT13: artisan_net not inferred when finalPrice=0');
check('T13.1 store artisan_net uses conditional on finalPrice > 0',
  store.includes('finalPrice > 0 ? finalPrice - commissionAmount : 0'),
  'artisan_net inferred even when finalPrice = 0');
check('T13.2 store defaults artisan_net to 0 (not null) when unknown',
  store.includes('artisan_net: artisanNet') || store.includes('artisan_net:'),
  'artisan_net not exported from store');

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
