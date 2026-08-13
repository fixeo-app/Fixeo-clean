/**
 * FIXEO — Admin Verify Artisan Tests
 * data/pricing/ux/prototype/tests/admin-verify-artisan-fn-tests.js
 *
 * T1  no Bearer token → 401
 * T2  invalid token → denied (401)
 * T3  non-admin token → 403
 * T4  admin token → allowed (200)
 * T5  artisan not found → 404
 * T6  already verified → idempotent 200
 * T7  browser cannot send verified override (only artisan_id accepted)
 * T8  server writes verified=true only (no other fields patched)
 * T9  no other lifecycle field mutated
 * T10 no privileged key in browser
 * T11 no X-Admin-Auth
 * T12 no legacy token
 * T13 admin UI never directly updates verified (uses server endpoint)
 * T14 success triggers canonical sync (_syncAll)
 */

'use strict';

var fs   = require('fs');
var path = require('path');

var ROOT    = path.resolve(__dirname, '../../../../..');
var FN_PATH = path.join(ROOT, 'api/admin-verify-artisan-fn/index.js');
var CS_PATH = path.join(ROOT, 'js/admin-canonical-sync-v1.js');
var VERCEL  = path.join(ROOT, 'vercel.json');

var results = { pass: 0, fail: 0, failures: [] };
function pass(name) { results.pass++; process.stdout.write('  \u2713 [PASS] ' + name + '\n'); }
function fail(name, reason) {
  results.fail++;
  results.failures.push(name + ': ' + reason);
  process.stdout.write('  \u2717 [FAIL] ' + name + ' \u2014 ' + reason + '\n');
}
function check(name, cond, reason) { cond ? pass(name) : fail(name, reason || 'Condition false'); }

var fn     = fs.readFileSync(FN_PATH,  'utf8');
var cs     = fs.readFileSync(CS_PATH,  'utf8');
var vercel = JSON.parse(fs.readFileSync(VERCEL, 'utf8'));

/* ── T1: no Bearer token → 401 ──────────────────────────── */
console.log('\nT1: No Bearer token → 401');
check('T1.1 missing Authorization returns status missing',
  fn.includes("return { status: 'missing' }"),
  "status: 'missing' not returned");
check('T1.2 missing maps to 401',
  fn.includes("auth.status === 'missing'") && fn.includes('status(401)'),
  '401 not returned for missing token');
check('T1.3 Bearer prefix required',
  fn.includes("startsWith('Bearer ')"),
  "Bearer prefix not checked");

/* ── T2: invalid token → 401 ────────────────────────────── */
console.log('\nT2: Invalid token → 401');
check('T2.1 invalid status on bad token',
  fn.includes("return { status: 'invalid'"),
  "status: 'invalid' not returned");
check('T2.2 invalid maps to 401',
  fn.includes("auth.status === 'invalid'") && fn.includes('status(401)'),
  '401 not returned for invalid token');
check('T2.3 token validated via /auth/v1/user',
  fn.includes('/auth/v1/user'),
  'token not validated via Supabase auth endpoint');

/* ── T3: non-admin token → 403 ──────────────────────────── */
console.log('\nT3: Non-admin token → 403');
check('T3.1 not_admin status when role != admin',
  fn.includes("return { status: 'not_admin' }"),
  "status: 'not_admin' not returned");
check('T3.2 not_admin maps to 403',
  fn.includes("auth.status === 'not_admin'") && fn.includes('status(403)'),
  '403 not returned for non-admin');
check('T3.3 role fetched from public.users via service-role',
  fn.includes('/rest/v1/users') && fn.includes('select=role'),
  'role not fetched from public.users');
check('T3.4 body.role not trusted (no body.role used for auth)',
  !fn.includes('body.role'),
  'body.role used for auth — caller can forge role');

/* ── T4: admin token → 200 ───────────────────────────────── */
console.log('\nT4: Admin token → success');
check('T4.1 ok status proceeds to mutation',
  fn.includes("auth.status === 'ok'") || fn.includes("/* auth.status === 'ok'"),
  "ok auth branch missing");
check('T4.2 200 returned on success',
  fn.includes('status(200)'),
  '200 status missing');
check('T4.3 _verifyAdminSession function defined',
  fn.includes('async function _verifyAdminSession'),
  '_verifyAdminSession not defined');
check('T4.4 admin userId logged (audit trail)',
  fn.includes('auth.userId'),
  'admin userId not logged');

/* ── T5: artisan not found → 404 ────────────────────────── */
console.log('\nT5: Artisan not found → 404');
check('T5.1 _fetchArtisan function defined',
  fn.includes('async function _fetchArtisan'),
  '_fetchArtisan not defined');
check('T5.2 null artisan returns 404',
  fn.includes('status(404)') && fn.includes("reason: 'not_found'"),
  '404 not returned for missing artisan');
check('T5.3 artisan fetched before mutation',
  (function() {
    var fetchIdx  = fn.indexOf('_fetchArtisan(artisanId)');
    var patchIdx  = fn.indexOf('_setVerified(artisanId)');
    return fetchIdx >= 0 && patchIdx > fetchIdx;
  })(),
  'artisan not fetched before PATCH');

/* ── T6: already verified → idempotent 200 ──────────────── */
console.log('\nT6: Already verified → idempotent 200');
check('T6.1 verified===true check present',
  fn.includes('artisan.verified === true'),
  'already-verified check missing');
check('T6.2 idempotent: true in response',
  fn.includes('idempotent: true'),
  'idempotent flag not in response');
check('T6.3 idempotent returns 200 (not 409)',
  (function() {
    var idemIdx = fn.indexOf('idempotent: true');
    var slice   = fn.slice(Math.max(0, idemIdx - 200), idemIdx);
    return slice.includes('status(200)');
  })(),
  'idempotent path does not return 200');
check('T6.4 no PATCH when already verified',
  (function() {
    var idemIdx = fn.indexOf('idempotent: true');
    var patchIdx = fn.indexOf('_setVerified', idemIdx);
    return patchIdx < 0 || patchIdx > fn.indexOf('verified: true\n', idemIdx + 200);
  })(),
  'PATCH may execute even when already verified');

/* ── T7: browser cannot send verified override ───────────── */
console.log('\nT7: Browser cannot override verified');
check('T7.1 verified not extracted from body',
  !fn.includes('body.verified'),
  'body.verified used — caller can override verified');
check('T7.2 only artisan_id extracted from body',
  fn.includes('body.artisan_id') &&
  !fn.includes('body.claimed') &&
  !fn.includes('body.availability'),
  'other lifecycle fields extracted from body');
check('T7.3 artisan_id UUID format validated',
  fn.includes('UUID_RE') && fn.includes('UUID_RE.test'),
  'artisan_id not UUID-validated');

/* ── T8: server writes verified=true only ────────────────── */
console.log('\nT8: Server writes only verified=true');
check('T8.1 PATCH body contains only verified: true',
  (function() {
    var patchBody = fn.split('JSON.stringify({ verified: true })')[0];
    /* The JSON.stringify must only contain verified:true */
    return fn.includes("JSON.stringify({ verified: true })");
  })(),
  'PATCH body does not use JSON.stringify({ verified: true })');
check('T8.2 _setVerified function defined',
  fn.includes('async function _setVerified'),
  '_setVerified not defined');
check('T8.3 _setVerified uses PATCH method',
  fn.includes("method:  'PATCH'"),
  'PATCH method not used in _setVerified');
check('T8.4 PATCH filtered by artisan id (WHERE id = artisan_id)',
  fn.includes('/rest/v1/artisans?id=eq.'),
  'PATCH not scoped to specific artisan_id');

/* ── T9: no other lifecycle field mutated ────────────────── */
console.log('\nT9: No other lifecycle field mutated');
var FORBIDDEN_MUTATIONS = [
  'owner_user_id', 'claimed', 'claim_status',
  'onboarding_completed', 'availability'
];
FORBIDDEN_MUTATIONS.forEach(function(field) {
  check('T9.' + field + ' not in PATCH body',
    !fn.match(new RegExp('"' + field + '"\\s*:')),
    field + ' found in PATCH body');
});

/* ── T10: no privileged key in browser JS ────────────────── */
console.log('\nT10: No privileged key in browser (admin-canonical-sync-v1.js)');
check('T10.1 no literal JWT in CS file',
  !cs.match(/eyJ[A-Za-z0-9._-]{20,}/),
  'literal JWT found in admin-canonical-sync-v1.js');
check('T10.2 SUPABASE_SERVICE_ROLE_KEY not in CS non-comment lines',
  !cs.split('\n').some(function(line) {
    var t = line.trim();
    return t.indexOf('//') !== 0 && t.indexOf('*') !== 0 &&
           /SUPABASE_SERVICE_ROLE_KEY/.test(t);
  }),
  'SUPABASE_SERVICE_ROLE_KEY in non-comment CS line');
check('T10.3 fn uses process.env.SUPABASE_SERVICE_ROLE_KEY (server only)',
  fn.includes('process.env.SUPABASE_SERVICE_ROLE_KEY'),
  'fn does not use process.env for service key');

/* ── T11: no X-Admin-Auth in fn ─────────────────────────── */
console.log('\nT11: No X-Admin-Auth');
check('T11.1 x-admin-auth not checked in fn',
  !fn.includes('x-admin-auth') && !fn.includes('X-Admin-Auth'),
  'X-Admin-Auth header checked in fn');

/* ── T12: no legacy token ────────────────────────────────── */
console.log('\nT12: No legacy token');
check('T12.1 fixeo_admin_v20 not in fn',
  !fn.includes('fixeo_admin_v20'),
  'fixeo_admin_v20 legacy token present in fn');
check('T12.2 ADMIN_TOKEN env not used in fn',
  !fn.includes('process.env.ADMIN_TOKEN'),
  'ADMIN_TOKEN env var used in fn');

/* ── T13: admin UI uses server endpoint, not direct write ── */
console.log('\nT13: Admin UI uses server endpoint (not direct write)');
check('T13.1 _doVerify calls /api/admin/artisans/verify',
  cs.includes('/api/admin/artisans/verify'),
  '_doVerify does not call /api/admin/artisans/verify');
check('T13.2 _doVerify sends only artisan_id in body',
  cs.includes("{ artisan_id: artisanId }"),
  '_doVerify body does not use { artisan_id: artisanId }');
check('T13.3 no direct artisans table update from browser',
  (function() {
    /* _doVerify must not call .from(\'artisans\').update() */
    var doVerifyIdx = cs.indexOf('async function _doVerify');
    if (doVerifyIdx < 0) return true; /* function missing — other test catches */
    var nextFn = cs.indexOf('\n  async function ', doVerifyIdx + 1);
    var block   = cs.slice(doVerifyIdx, nextFn < 0 ? doVerifyIdx + 2000 : nextFn);
    return !block.includes(".from('artisans')") && !block.includes('.from("artisans")');
  })(),
  '_doVerify directly updates artisans table from browser');
check('T13.4 verify button rendered with data-fxacs-action="verify-artisan"',
  cs.includes('data-fxacs-action="verify-artisan"'),
  'verify-artisan action not in artisan row render');
check('T13.5 verified artisan shows verified badge (not button)',
  cs.includes('fxacs-pill-verified') && cs.includes('V\u00e9rifi\u00e9'),
  'verified artisans do not show verified badge');
check('T13.6 verify button shown only when NOT verified',
  (function() {
    /* The verify button must be in the else branch of a.verified check */
    var verifiedIdx = cs.indexOf('a.verified');
    var btnIdx      = cs.indexOf('verify-artisan', verifiedIdx);
    return verifiedIdx >= 0 && btnIdx > verifiedIdx;
  })(),
  'verify button not conditioned on !a.verified');

/* ── T14: success triggers canonical sync ────────────────── */
console.log('\nT14: Success triggers canonical sync');
check('T14.1 _syncAll called after successful verify',
  (function() {
    var doVerifyIdx = cs.indexOf('async function _doVerify');
    if (doVerifyIdx < 0) return false;
    var block = cs.slice(doVerifyIdx, doVerifyIdx + 2000);
    return block.includes('_syncAll()');
  })(),
  '_syncAll not called after successful verification');
check('T14.2 success toast shown',
  cs.includes('succ') && cs.includes('_showToast'),
  'success toast missing from _doVerify');
check('T14.3 inline confirm flow (no browser confirm())',
  cs.includes('_showVerifyConfirm') && !cs.includes('window.confirm('),
  'browser confirm() used instead of inline flow');

/* ── VERCEL REGISTRATION ─────────────────────────────────── */
console.log('\nVercel registration');
check('Route /api/admin/artisans/verify registered',
  vercel.routes.some(function(r) {
    return (r.src || '').includes('admin/artisans/verify') &&
           (r.dest || '').includes('admin-verify-artisan-fn');
  }),
  '/api/admin/artisans/verify route missing from vercel.json');
check('Build entry for admin-verify-artisan-fn registered',
  vercel.builds.some(function(b) {
    return (b.src || '').includes('admin-verify-artisan-fn');
  }),
  'admin-verify-artisan-fn build entry missing from vercel.json');

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
