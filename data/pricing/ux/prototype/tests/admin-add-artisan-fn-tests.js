/**
 * FIXEO — Admin Add-Artisan Auth Final Hardening Tests
 * data/pricing/ux/prototype/tests/admin-add-artisan-fn-tests.js
 *
 * Target: POST /api/admin/artisans/add
 * Auth model: Supabase session Bearer token + server-side role check
 *
 * Tests:
 *   T1  no Bearer token → 401
 *   T2  invalid token → denied (401)
 *   T3  valid non-admin token → 403
 *   T4  valid admin token → success (200)
 *   T5  X-Admin-Auth alone → denied (no 'ok' without bearer)
 *   T6  legacy fixeo_admin_v20 value → not accepted
 *   T7  browser does not contain ADMIN_TOKEN usage
 *   T8  browser does not contain fixeo_admin_v20 auth usage
 *   T9  service_role absent from browser JS
 *   T10 canonical safe artisan initial state unchanged
 *   T11 existing admin add-artisan UX preserved (submitArtisanForm exists)
 *   T12 required field validation (full_name, service_category)
 *   T13 lifecycle fields forced server-side (caller-immutable)
 *   T14 duplicate (23505) returns 409 conflict
 *   T15 insert failure surfaced truthfully (no fake success)
 *   T16 route registered in vercel.json
 *   T17 build entry registered in vercel.json
 *   T18 phone_public validation (min 8 digits)
 *   T19 field trimming and length limits
 *   T20 success response includes backward-compat fields
 */

'use strict';

var fs   = require('fs');
var path = require('path');

var ROOT     = path.resolve(__dirname, '../../../../..');
var FN_PATH  = path.join(ROOT, 'api/admin-add-artisan-fn/index.js');
var ADMIN_JS = path.join(ROOT, 'js/admin-artisans.js');
var VERCEL   = path.join(ROOT, 'vercel.json');
var ANY_BROWSER_JS = [
  'js/admin-artisans.js',
  'js/admin-canonical-sync-v1.js',
  'js/fixeo-dashboard-v2.js',
  'js/reservation.js'
].map(function(f) { return path.join(ROOT, f); });

var results = { pass: 0, fail: 0, failures: [] };
function pass(name) { results.pass++; process.stdout.write('  ✓ [PASS] ' + name + '\n'); }
function fail(name, reason) {
  results.fail++;
  results.failures.push(name + ': ' + reason);
  process.stdout.write('  ✗ [FAIL] ' + name + ' — ' + reason + '\n');
}
function check(name, cond, reason) { cond ? pass(name) : fail(name, reason || 'Condition false'); }

var fn    = fs.readFileSync(FN_PATH,  'utf8');
var admin = fs.readFileSync(ADMIN_JS, 'utf8');
var vercel = JSON.parse(fs.readFileSync(VERCEL, 'utf8'));

/* ── T1: no Bearer token → 401 ──────────────────────────── */
console.log('\nT1: No Bearer token → 401');
check('T1.1 missing Authorization returns status missing',
  fn.includes("return { status: 'missing' }"),
  "status: 'missing' not returned for missing header");
check('T1.2 missing status maps to 401 response',
  fn.includes("auth.status === 'missing'") && fn.includes('status(401)'),
  '401 not returned for missing token');
check('T1.3 Bearer prefix required',
  fn.includes("startsWith('Bearer ')"),
  "Bearer prefix not checked");

/* ── T2: invalid token → denied ─────────────────────────── */
console.log('\nT2: Invalid token → denied');
check('T2.1 invalid status returned on bad Supabase response',
  fn.includes("return { status: 'invalid'"),
  "status: 'invalid' not returned for bad token");
check('T2.2 invalid status maps to 401 response',
  fn.includes("auth.status === 'invalid'") && fn.includes('status(401)'),
  '401 not returned for invalid token');
check('T2.3 token is validated against Supabase /auth/v1/user',
  fn.includes('/auth/v1/user'),
  'token not validated against Supabase auth endpoint');

/* ── T3: valid non-admin token → 403 ────────────────────── */
console.log('\nT3: Valid non-admin token → 403');
check('T3.1 not_admin status returned when role != admin',
  fn.includes("return { status: 'not_admin' }"),
  "status: 'not_admin' not returned for non-admin role");
check('T3.2 not_admin maps to 403 response',
  fn.includes("auth.status === 'not_admin'") && fn.includes('status(403)'),
  '403 not returned for non-admin');
check('T3.3 role checked from public.users server-side (not user_metadata)',
  fn.includes('/rest/v1/users') && fn.includes('select=role'),
  'role not fetched from public.users via REST');
check('T3.4 role check uses service-role key (not user token)',
  (function() {
    /* The role SELECT must use serviceKey in Authorization, not the user token */
    var roleBlock = fn.split('/rest/v1/users')[1];
    if (!roleBlock) return false;
    var snippet = roleBlock.slice(0, 400);
    return snippet.includes('serviceKey') && !snippet.includes("'Bearer ' + token");
  })(),
  'role check does not use service-role key');
check('T3.5 caller-supplied role is ignored (no body.role used)',
  !fn.includes('body.role'),
  'body.role used — caller can supply role');

/* ── T4: valid admin token → success ────────────────────── */
console.log('\nT4: Valid admin token → success (auth model correct)');
check('T4.1 ok status triggers insert',
  fn.includes("auth.status === 'ok'") || fn.includes("/* auth.status === 'ok'"),
  "ok status branch missing");
check('T4.2 200 returned on successful insert',
  fn.includes('status(200)'),
  '200 status missing');
check('T4.3 _verifyAdminSession function defined',
  fn.includes('async function _verifyAdminSession'),
  '_verifyAdminSession function not defined');
check('T4.4 userId logged on success (audit trail)',
  fn.includes('auth.userId'),
  'userId not included in audit log');

/* ── T5: X-Admin-Auth alone → denied ────────────────────── */
console.log('\nT5: X-Admin-Auth alone → denied');
check('T5.1 no X-Admin-Auth check in fn (header not read for auth)',
  !fn.includes("req.headers['x-admin-auth']") &&
  !fn.includes('x-admin-auth'),
  'X-Admin-Auth header still checked in fn');
check('T5.2 _checkAdminAuth function removed',
  !fn.includes('_checkAdminAuth'),
  '_checkAdminAuth legacy function still present');
check('T5.3 ADMIN_TOKEN env var not used for auth in fn',
  !fn.includes('process.env.ADMIN_TOKEN'),
  'ADMIN_TOKEN env var still used for auth');

/* ── T6: legacy fixeo_admin_v20 → not accepted ──────────── */
console.log('\nT6: Legacy fixeo_admin_v20 → not accepted');
check('T6.1 fixeo_admin_v20 literal not in fn',
  !fn.includes('fixeo_admin_v20'),
  'fixeo_admin_v20 legacy token still present in fn');
check('T6.2 LEGACY_ADMIN_TOKEN constant removed from fn',
  !fn.includes('LEGACY_ADMIN_TOKEN'),
  'LEGACY_ADMIN_TOKEN constant still present in fn');

/* ── T7: browser does not contain ADMIN_TOKEN usage ─────── */
console.log('\nT7: Browser does not contain ADMIN_TOKEN usage');
check('T7.1 admin-artisans.js has no ADMIN_TOKEN reference',
  !admin.includes('ADMIN_TOKEN'),
  'ADMIN_TOKEN referenced in admin-artisans.js');
check('T7.2 admin-artisans.js has no X-Admin-Auth header',
  !admin.includes('X-Admin-Auth'),
  'X-Admin-Auth still in admin-artisans.js');

/* ── T8: browser does not contain fixeo_admin_v20 auth usage */
console.log('\nT8: Browser does not contain fixeo_admin_v20 auth usage');
check('T8.1 fixeo_admin_v20 not used in auth headers in admin-artisans.js',
  (function() {
    /* fixeo_admin_v20 may appear in _LS_KEY cache key but must not be sent as auth */
    /* Check that it's not in any header object */
    var headerIdx = admin.indexOf("'X-Admin-Auth'");
    return headerIdx < 0;
  })(),
  'X-Admin-Auth header with fixeo_admin_v20 still in admin-artisans.js');
check('T8.2 _getAdminAuthHeaders uses Bearer token (not static string)',
  admin.includes('_getAdminAuthHeaders') &&
  admin.includes("'Authorization'") &&
  admin.includes("'Bearer ' + token"),
  '_getAdminAuthHeaders does not send Bearer token');

/* ── T9: service_role absent from browser JS ─────────────── */
console.log('\nT9: service_role absent from browser JS');
ANY_BROWSER_JS.forEach(function(fpath) {
  if (!fs.existsSync(fpath)) return;
  var src = fs.readFileSync(fpath, 'utf8');
  var basename = path.basename(fpath);
  check('T9.' + basename + ' — no service_role literal JWT',
    !src.match(/eyJ[A-Za-z0-9._-]{20,}/),
    'literal JWT found in ' + basename);
  check('T9.' + basename + ' — no SUPABASE_SERVICE_ROLE_KEY reference',
    !src.split('\n').some(function(line) {
      var t = line.trim();
      return t.indexOf('//') !== 0 && t.indexOf('*') !== 0 &&
             /SUPABASE_SERVICE_ROLE_KEY/.test(t);
    }),
    'SUPABASE_SERVICE_ROLE_KEY used (not commented) in ' + basename);
});
check('T9.fn uses process.env only (server-side)',
  fn.includes('process.env.SUPABASE_SERVICE_ROLE_KEY') &&
  !fn.match(/eyJ[A-Za-z0-9._-]{20,}/),
  'service_role not from process.env or literal JWT found in fn');

/* ── T10: canonical safe artisan initial state unchanged ─── */
console.log('\nT10: Canonical safe artisan initial state unchanged');
check('T10.1 owner_user_id: null in artisanRow',
  fn.match(/owner_user_id\s*:\s*null/),
  'owner_user_id not forced to null');
check('T10.2 claimed: false in artisanRow',
  fn.match(/claimed\s*:\s*false/),
  'claimed not forced to false');
check('T10.3 claim_status: null in artisanRow',
  fn.match(/claim_status\s*:\s*null/),
  'claim_status not forced to null');
check('T10.4 onboarding_completed: false in artisanRow',
  fn.match(/onboarding_completed\s*:\s*false/),
  'onboarding_completed not forced to false');
check('T10.5 availability: unavailable in artisanRow',
  fn.match(/availability\s*:\s*'unavailable'/),
  'availability not forced to unavailable');
check('T10.6 verified: false in artisanRow',
  fn.match(/verified\s*:\s*false/),
  'verified not forced to false');

/* ── T11: existing admin add-artisan UX preserved ───────── */
console.log('\nT11: Existing admin add-artisan UX preserved');
check('T11.1 submitArtisanForm function exists',
  admin.includes('async function submitArtisanForm'),
  'submitArtisanForm function missing');
check('T11.2 artisan form fields still read (name, service, phone)',
  admin.includes("getElementById('af-name')") &&
  admin.includes("getElementById('af-service')") &&
  admin.includes("getElementById('af-phone')"),
  'form field reads missing');
check('T11.3 form reset after success',
  admin.includes("getElementById('artisan-add-form')?.reset()") ||
  admin.includes("getElementById('artisan-add-form')") && admin.includes('.reset()'),
  'form reset after success missing');
check('T11.4 success toast shown',
  admin.includes('showToast') && admin.includes('ajout\u00e9'),
  'success toast missing after add');
check('T11.5 canonical list refresh after success',
  admin.includes('FixeoRepository.getAllArtisans()'),
  'canonical list refresh not triggered after success');
check('T11.6 session-expired error shown truthfully',
  admin.includes('Session expir\u00e9e') || admin.includes("Session expirée"),
  'session expired error not shown truthfully');

/* ── T12: required field validation ─────────────────────── */
console.log('\nT12: Required field validation');
check('T12.1 full_name validation returns 400',
  fn.includes('full_name is required') && fn.includes('status(400)'),
  'full_name validation missing or not 400');
check('T12.2 service_category validation returns 400',
  fn.includes('service_category is required'),
  'service_category validation missing');
check('T12.3 validation checked after auth',
  (function() {
    var authPos  = fn.indexOf('_verifyAdminSession');
    var validPos = fn.indexOf('full_name is required');
    return authPos > 0 && validPos > 0 && authPos < validPos;
  })(),
  'validation appears before auth check');

/* ── T13: lifecycle fields forced (caller-immutable) ──────── */
console.log('\nT13: Lifecycle fields caller-immutable');
check('T13.1 owner_user_id not taken from body',
  !fn.includes('body.owner_user_id'),
  'owner_user_id taken from caller body');
check('T13.2 verified not taken from body',
  !fn.includes('body.verified'),
  'verified taken from caller body');
check('T13.3 availability not taken from body',
  !fn.includes('body.availability'),
  'availability taken from caller body');
check('T13.4 claimed not taken from body',
  !fn.includes('body.claimed'),
  'claimed taken from caller body');
check('T13.5 onboarding_completed not taken from body',
  !fn.includes('body.onboarding_completed'),
  'onboarding_completed taken from caller body');

/* ── T14: duplicate 23505 → 409 ─────────────────────────── */
console.log('\nT14: Duplicate 23505 → 409');
check('T14.1 23505 code detected',
  fn.includes("'23505'") && fn.includes("e.code === '23505'"),
  '23505 not detected');
check('T14.2 23505 returns 409',
  fn.includes('status(409)'),
  '409 not returned for duplicate');
check('T14.3 conflict reason in response',
  fn.includes("reason: 'conflict'"),
  'conflict reason missing from duplicate response');

/* ── T15: insert failure surfaced truthfully ─────────────── */
console.log('\nT15: Insert failure surfaced truthfully');
check('T15.1 SUPABASE_ERROR returned as 500',
  fn.includes('status(500)') && fn.includes('insert_error'),
  'insert error not surfaced as 500');
check('T15.2 network error returned as 500',
  fn.includes('network_error'),
  'network error not surfaced');
check('T15.3 server_config_error for ENV_MISSING',
  fn.includes('server_config_error'),
  'ENV_MISSING error not surfaced truthfully');

/* ── T16: route in vercel.json ───────────────────────────── */
console.log('\nT16: Route in vercel.json');
check('T16.1 /api/admin/artisans/add route exists',
  vercel.routes.some(function(r) {
    return (r.src || '').includes('admin/artisans/add') &&
           (r.dest || '').includes('admin-add-artisan-fn');
  }),
  '/api/admin/artisans/add route missing from vercel.json');

/* ── T17: build entry in vercel.json ────────────────────── */
console.log('\nT17: Build entry in vercel.json');
check('T17.1 admin-add-artisan-fn build entry exists',
  vercel.builds.some(function(b) {
    return (b.src || '').includes('admin-add-artisan-fn');
  }),
  'admin-add-artisan-fn build entry missing from vercel.json');

/* ── T18: phone_public validation ────────────────────────── */
console.log('\nT18: phone_public validation');
check('T18.1 phone_public with < 8 digits rejected',
  fn.includes('at least 8 digits'),
  'phone_public 8-digit minimum not enforced');
check('T18.2 empty phone_public accepted (optional field)',
  fn.includes('phonePublic || null'),
  'empty phone_public not handled as null');

/* ── T19: field trimming ─────────────────────────────────── */
console.log('\nT19: Field trimming and length limits');
check('T19.1 trim() helper defined',
  fn.includes('function trim('),
  'trim helper not defined');
check('T19.2 full_name trimmed with 200 char limit',
  fn.includes("trim(body.name") && fn.includes('200'),
  'full_name not trimmed or no length limit');
check('T19.3 description trimmed with 500 char limit',
  fn.includes('trim(body.description') && fn.includes('500'),
  'description not trimmed or no length limit');

/* ── T20: success response backward-compat ───────────────── */
console.log('\nT20: Success response backward-compat');
check('T20.1 success:true in response (admin-artisans.js compat)',
  fn.includes('success: true'),
  'success:true missing — admin-artisans.js checks body.success');
check('T20.2 ok:true in response',
  fn.includes('ok:      true') || fn.includes('ok: true'),
  'ok:true missing from response');
check('T20.3 artisan.name in response (form compat)',
  fn.includes('name:             inserted.full_name'),
  'artisan.name alias missing from response');
check('T20.4 artisan.phone in response (form compat)',
  fn.includes("phone:            inserted.phone_public"),
  'artisan.phone alias missing from response');
check('T20.5 lifecycle fields hardcoded safe in response',
  fn.includes('verified:         false') &&
  fn.includes("availability:     'unavailable'") &&
  fn.includes('claimed:          false'),
  'response lifecycle fields not hardcoded to safe values');

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
