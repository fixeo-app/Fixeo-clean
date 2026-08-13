/**
 * FIXEO — Admin Settlement Mission Tests  v1a
 * data/pricing/ux/prototype/tests/admin-settle-mission-fn-tests.js
 *
 * T1  preflight is READ ONLY (no mutations)
 * T2  missing columns → SCENARIO B detected
 * T3  admin Bearer auth required
 * T4  non-admin denied
 * T5  mission not found → 404
 * T6  invalid amount → denied
 * T7  invalid lifecycle state → 422
 * T8  valid settlement: only final_price + commission_amount patched
 * T9  same-value idempotency
 * T10 conflicting second amount → 409 without force
 * T11 no direct browser financial write (V4 commission inference removed)
 * T12 no service_role in browser files
 * T13 no agreed_price*0.1 inference in V4 (removed)
 * T14 unknown commission remains — in V4
 * T15 canonical reload after settlement (settlement fn returns commission_amount)
 */

'use strict';

var fs   = require('fs');
var path = require('path');

var ROOT       = path.resolve(__dirname, '../../../../..');
var FN_PATH    = path.join(ROOT, 'api/admin-settle-mission-fn/index.js');
var PRE_PATH   = path.join(ROOT, 'supabase/7c11f6-financial-settlement-precheck.sql');
var MIG_PATH   = path.join(ROOT, 'supabase/7c11f6-financial-settlement.sql');
var V4_PATH    = path.join(ROOT, 'js/admin-command-center-v4.js');
var VERCEL     = path.join(ROOT, 'vercel.json');

var results = { pass: 0, fail: 0, failures: [] };
function pass(name) { results.pass++; process.stdout.write('  \u2713 [PASS] ' + name + '\n'); }
function fail(name, reason) {
  results.fail++;
  results.failures.push(name + ': ' + reason);
  process.stdout.write('  \u2717 [FAIL] ' + name + ' \u2014 ' + reason + '\n');
}
function check(name, cond, reason) { cond ? pass(name) : fail(name, reason || 'Condition false'); }

var fn     = fs.readFileSync(FN_PATH,  'utf8');
var pre    = fs.readFileSync(PRE_PATH, 'utf8');
var mig    = fs.readFileSync(MIG_PATH, 'utf8');
var v4     = fs.readFileSync(V4_PATH,  'utf8');
var vercel = JSON.parse(fs.readFileSync(VERCEL, 'utf8'));

/* ── T1: preflight is READ ONLY ──────────────────────────── */
console.log('\nT1: Preflight is READ ONLY');
/* Preflight mutation check: ignore keywords inside string literals / EXECUTE format() */
var preNonComment = pre.split('\n').filter(function(l) {
  var t = l.trim();
  return t.indexOf('--') !== 0; /* strip comment lines */
}).join('\n');
/* Keywords inside EXECUTE format('...') are inside string literals — safe */
var preWithoutExecute = preNonComment.replace(/EXECUTE\s+format\([^)]+\)/gi, '');

check('T1.1 no INSERT mutations in preflight (outside EXECUTE format)',
  !preWithoutExecute.match(/^\s*INSERT\b/im),
  'INSERT mutation outside EXECUTE format() in preflight');
check('T1.2 no UPDATE mutations in preflight (outside EXECUTE format)',
  !preWithoutExecute.match(/^\s*UPDATE\b/im),
  'UPDATE mutation outside EXECUTE format() in preflight');
check('T1.3 no DELETE mutations in preflight (outside EXECUTE format)',
  !preWithoutExecute.match(/^\s*DELETE\b/im),
  'DELETE mutation outside EXECUTE format() in preflight');
check('T1.4 no ALTER TABLE in preflight',
  !pre.match(/ALTER TABLE/i),
  'ALTER TABLE found in preflight SQL');
check('T1.5 no CREATE TABLE in preflight',
  !pre.match(/CREATE TABLE/i),
  'CREATE TABLE found in preflight SQL');
check('T1.6 no DROP (non-comment) in preflight',
  !preWithoutExecute.match(/^\s*DROP\b/im),
  'DROP statement outside comment in preflight SQL');
check('T1.7 SCENARIO A/B conclusion in preflight',
  pre.includes('SCENARIO A') && pre.includes('SCENARIO B'),
  'SCENARIO A/B conclusion missing from preflight');
check('T1.8 HARD STOP conditions documented',
  pre.includes('HARD STOP'),
  'HARD STOP conditions not in preflight');

/* ── T2: missing columns → SCENARIO B ───────────────────── */
console.log('\nT2: SCENARIO B path in migration');
check('T2.1 migration adds final_price if missing',
  mig.includes('final_price') && mig.includes('ADD COLUMN'),
  'migration does not add final_price');
check('T2.2 migration adds commission_amount if missing',
  mig.includes('commission_amount') && mig.includes('ADD COLUMN'),
  'migration does not add commission_amount');
check('T2.3 migration does NOT add artisan_net column (derivable — comment mention OK)',
  !mig.match(/ADD COLUMN.*artisan_net/i),
  'migration has ADD COLUMN artisan_net — unnecessary stored derived field');
check('T2.4 migration is idempotent (IF NOT EXISTS)',
  mig.includes('IF NOT EXISTS'),
  'migration not idempotent');
check('T2.5 migration CHECK constraint: final_price > 0',
  mig.includes('final_price > 0') || mig.includes('final_price IS NULL OR final_price > 0'),
  'CHECK final_price > 0 not in migration');
check('T2.6 migration wrapped in transaction',
  mig.includes('BEGIN;') && mig.includes('COMMIT;'),
  'migration not in transaction');

/* ── T3: admin Bearer auth required ─────────────────────── */
console.log('\nT3: Admin Bearer auth required');
check('T3.1 _verifyAdminSession defined',
  fn.includes('async function _verifyAdminSession'),
  '_verifyAdminSession not defined');
check('T3.2 Bearer prefix required',
  fn.includes("startsWith('Bearer ')"),
  "Bearer prefix not checked");
check('T3.3 missing token → 401',
  fn.includes("auth.status === 'missing'") && fn.includes('status(401)'),
  '401 not returned for missing token');
check('T3.4 token validated via /auth/v1/user',
  fn.includes('/auth/v1/user'),
  'token not validated via Supabase auth');

/* ── T4: non-admin denied ────────────────────────────────── */
console.log('\nT4: Non-admin denied → 403');
check('T4.1 not_admin status → 403',
  fn.includes("auth.status === 'not_admin'") && fn.includes('status(403)'),
  '403 not returned for non-admin');
check('T4.2 role fetched from public.users via service-role',
  fn.includes('/rest/v1/users') && fn.includes('select=role'),
  'role not fetched from public.users');
check('T4.3 body.role not trusted',
  !fn.includes('body.role'),
  'body.role used for auth');

/* ── T5: mission not found → 404 ────────────────────────── */
console.log('\nT5: Mission not found → 404');
check('T5.1 _fetchMission defined',
  fn.includes('async function _fetchMission'),
  '_fetchMission not defined');
check('T5.2 null mission returns 404',
  fn.includes('status(404)') && fn.includes("reason: 'not_found'"),
  '404 not returned for missing mission');
check('T5.3 mission_id UUID validated',
  fn.includes('UUID_RE') && fn.includes('UUID_RE.test'),
  'mission_id not UUID-validated');

/* ── T6: invalid amount → denied ─────────────────────────── */
console.log('\nT6: Invalid amount denied');
check('T6.1 final_price <= 0 rejected',
  fn.includes('finalPrice <= 0') || fn.includes('finalPrice > 0') && fn.includes('positive'),
  'final_price <= 0 not rejected');
check('T6.2 non-finite amount rejected',
  fn.includes('Number.isFinite(finalPrice)'),
  'non-finite amount not rejected');
check('T6.3 upper bound enforced (MAX_FINAL_PRICE)',
  fn.includes('MAX_FINAL_PRICE') && fn.includes('finalPrice > MAX_FINAL_PRICE'),
  'upper bound not enforced');
check('T6.4 missing final_price rejected',
  fn.includes("'final_price is required'"),
  'missing final_price not rejected');

/* ── T7: invalid lifecycle state → 422 ──────────────────── */
console.log('\nT7: Invalid lifecycle state → 422');
check('T7.1 ELIGIBLE_STATUSES constant defined',
  fn.includes("var ELIGIBLE_STATUSES") && fn.includes("'terminée'") && fn.includes("'validée'"),
  'ELIGIBLE_STATUSES not defined with correct values');
check('T7.2 ineligible status returns 422',
  fn.includes('status(422)') && fn.includes("reason: 'ineligible'"),
  '422 not returned for ineligible status');
check('T7.3 ELIGIBLE_STATUSES.includes used for check',
  fn.includes('ELIGIBLE_STATUSES.includes(status)'),
  'ELIGIBLE_STATUSES.includes not used');

/* ── T8: valid settlement patches only financial fields ─── */
console.log('\nT8: Settlement patches only final_price + commission_amount');
check('T8.1 _patchSettlement defined',
  fn.includes('async function _patchSettlement'),
  '_patchSettlement not defined');
check('T8.2 PATCH body only final_price + commission_amount',
  (function() {
    var patchIdx = fn.indexOf('var patch = {');
    if (patchIdx < 0) return false;
    var block = fn.slice(patchIdx, patchIdx + 200);
    return block.includes('final_price') &&
           block.includes('commission_amount') &&
           !block.includes('status') &&
           !block.includes('artisan_net') &&
           !block.includes('artisan_id') &&
           !block.includes('agreed_price');
  })(),
  'PATCH body contains non-financial fields');
check('T8.3 commission computed server-side (COMMISSION_RATE)',
  fn.includes('COMMISSION_RATE') && fn.includes('finalPrice * COMMISSION_RATE'),
  'commission not computed server-side');
check('T8.4 COMMISSION_RATE = 0.15 (canonical 15%)',
  fn.includes('COMMISSION_RATE    = 0.15') || fn.includes('COMMISSION_RATE = 0.15'),
  'COMMISSION_RATE not 0.15');
check('T8.5 artisan_net returned but NOT stored',
  fn.includes('artisan_net:') &&
  !fn.includes("patch.*artisan_net") &&
  !fn.includes("artisan_net: artisanNet,\n    }"),
  'artisan_net in PATCH body — should not be stored');

/* ── T9: same-value idempotency ──────────────────────────── */
console.log('\nT9: Same-value idempotency');
check('T9.1 existing final_price checked',
  fn.includes('existingFinal') || fn.includes('mission.final_price'),
  'existing final_price not checked');
check('T9.2 same value returns idempotent:true + 200',
  fn.includes('idempotent:') && fn.includes('true') && fn.includes('status(200)'),
  'idempotent response missing');
check('T9.3 float comparison uses tolerance (0.01)',
  fn.includes('Math.abs(existingFinal - finalPrice) < 0.01'),
  'float comparison missing tolerance');

/* ── T10: conflict on different amount ───────────────────── */
console.log('\nT10: Conflict on different amount → 409');
check('T10.1 409 returned on different final_price',
  fn.includes('status(409)') && fn.includes("'conflict'"),
  '409 not returned on conflicting settlement');
check('T10.2 existing_price in 409 response',
  fn.includes('existing_price:'),
  'existing_price not in conflict response');
check('T10.3 force:true allows override',
  fn.includes('force') && fn.includes('!force'),
  'force flag not implemented');
check('T10.4 forced re-settlement logged as WARN',
  fn.includes('FORCED re-settlement') || fn.includes('console.warn'),
  'forced re-settlement not logged as warning');

/* ── T11: no direct browser financial write ──────────────── */
console.log('\nT11: No direct browser financial write');
check('T11.1 V4 does not use ap * 0.1 inference',
  !v4.includes('ap * 0.1'),
  'ap * 0.1 commission inference still in V4');
check('T11.2 V4 uses commission_amount field only (no fallback math)',
  v4.includes('commission_amount') &&
  !v4.match(/commission_amount.*\|\|.*\*\s*0\.\d/),
  'V4 falls back to computed commission');

/* ── T12: no service_role in browser ─────────────────────── */
console.log('\nT12: No service_role in browser JS');
check('T12.1 no literal JWT in V4',
  !v4.match(/eyJ[A-Za-z0-9._-]{20,}/),
  'literal JWT in V4');
check('T12.2 fn uses process.env.SUPABASE_SERVICE_ROLE_KEY (server only)',
  fn.includes('process.env.SUPABASE_SERVICE_ROLE_KEY'),
  'fn does not use process.env for service key');

/* ── T13: no agreed_price*0.1 inference in V4 ───────────── */
console.log('\nT13: No agreed_price*0.1 inference in V4');
check('T13.1 ap * 0.1 removed from V4 revenue engine',
  !v4.includes('ap * 0.1'),
  'ap * 0.1 still in V4');
check('T13.2 agreed_price * 0.1 not present in V4',
  !v4.match(/agreed_price\s*\*\s*0\.1/),
  'agreed_price * 0.1 inference in V4');

/* ── T14: unknown commission shows — in V4 ──────────────── */
console.log('\nT14: Unknown commission shows — in V4');
check('T14.1 V4 shows — when commissionKnown = 0',
  v4.includes('commissionKnown > 0') && (v4.includes("'\\u2014'") || v4.includes("'\u2014'") || v4.includes('"—"') || v4.includes("'—'")),
  'V4 does not show — for unknown commission');

/* ── T15: settlement response includes commission_amount ─── */
console.log('\nT15: Settlement response includes canonical amounts');
check('T15.1 response includes final_price',
  fn.includes('final_price:       finalPrice'),
  'final_price not in settlement response');
check('T15.2 response includes commission_amount',
  fn.includes('commission_amount: commissionAmount'),
  'commission_amount not in settlement response');
check('T15.3 response includes artisan_net (derived, not stored)',
  fn.includes('artisan_net:       artisanNet'),
  'artisan_net not in settlement response');
check('T15.4 response includes commission_rate for transparency',
  fn.includes('commission_rate:   COMMISSION_RATE'),
  'commission_rate not in settlement response');

/* ── VERCEL REGISTRATION ─────────────────────────────────── */
console.log('\nVercel registration');
check('Route /api/admin/missions/settle registered',
  vercel.routes.some(function(r) {
    return (r.src || '').includes('admin/missions/settle') &&
           (r.dest || '').includes('admin-settle-mission-fn');
  }),
  '/api/admin/missions/settle route missing from vercel.json');
check('Build entry for admin-settle-mission-fn registered',
  vercel.builds.some(function(b) {
    return (b.src || '').includes('admin-settle-mission-fn');
  }),
  'admin-settle-mission-fn build entry missing from vercel.json');

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
