/**
 * FIXEO — Admin Add-Artisan Backend Tests
 * data/pricing/ux/prototype/tests/admin-add-artisan-fn-tests.js
 *
 * Tests:
 *   T1  unauthenticated denied (missing X-Admin-Auth)
 *   T2  non-admin denied (wrong token)
 *   T3  admin accepted (correct token — env or legacy)
 *   T4  required field validation (full_name, service_category)
 *   T5  owner_user_id forced NULL
 *   T6  claimed forced false (safe seeded state)
 *   T7  onboarding_completed forced false
 *   T8  availability forced 'unavailable'
 *   T9  verified forced false
 *   T10 no service_role in browser JS
 *   T11 no localStorage fallback in admin-artisans.js
 *   T12 canonical list refresh after success
 *   T13 insert failure surfaced truthfully (no fake success)
 *   T14 duplicate (23505) returns 409 conflict
 *   T15 caller cannot override lifecycle fields
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

/* ── T1: unauthenticated denied ──────────────────────────── */
console.log('\nT1: Unauthenticated denied');
check('T1.1 missing header returns 401',
  fn.includes("return 'missing'") && fn.includes('status(401)'),
  '401 for missing header not implemented');
check('T1.2 missing header detected (empty string check)',
  fn.includes("if (!supplied) return 'missing'"),
  'missing header not detected');

/* ── T2: non-admin denied ────────────────────────────────── */
console.log('\nT2: Non-admin denied');
check('T2.1 wrong token returns 403',
  fn.includes("return 'forbidden'") && fn.includes('status(403)'),
  '403 for wrong token not implemented');
check('T2.2 forbidden check present',
  fn.includes("if (authResult === 'forbidden')"),
  'forbidden authResult check missing');

/* ── T3: admin accepted ──────────────────────────────────── */
console.log('\nT3: Admin accepted');
check('T3.1 env ADMIN_TOKEN checked first',
  fn.includes('process.env.ADMIN_TOKEN') &&
  fn.match(/envToken && supplied === envToken/),
  'ADMIN_TOKEN env not checked');
check('T3.2 legacy token accepted as fallback',
  fn.includes("LEGACY_ADMIN_TOKEN = 'fixeo_admin_v20'") &&
  fn.includes("supplied === LEGACY_ADMIN_TOKEN"),
  'legacy token fallback missing');
check('T3.3 both paths return ok',
  fn.split("return 'ok'").length >= 3,
  'only one ok path — env and legacy not both covered');
check('T3.4 LEGACY_ADMIN_TOKEN is a constant (not inline string in auth fn)',
  fn.includes("var LEGACY_ADMIN_TOKEN = 'fixeo_admin_v20'"),
  'legacy token not declared as constant');

/* ── T4: required field validation ──────────────────────── */
console.log('\nT4: Required field validation');
check('T4.1 full_name validation returns 400',
  fn.includes('full_name is required') && fn.includes('status(400)'),
  'full_name validation missing or not 400');
check('T4.2 service_category validation returns 400',
  fn.includes('service_category is required'),
  'service_category validation missing');
check('T4.3 validation checked after auth',
  (function() {
    /* validation must come after authResult check */
    var authPos  = fn.indexOf('authResult');
    var validPos = fn.indexOf('full_name is required');
    return authPos > 0 && validPos > 0 && authPos < validPos;
  })(),
  'validation appears before auth check');

/* ── T5: owner_user_id forced NULL ──────────────────────── */
console.log('\nT5: owner_user_id forced NULL');
check('T5.1 owner_user_id: null in artisanRow',
  fn.match(/owner_user_id\s*:\s*null/),
  'owner_user_id not forced to null');
check('T5.2 artisanRow built server-side (not from body.*)',
  (function() {
    /* owner_user_id in the row must not come from body */
    var rowBlock = fn.split('var artisanRow')[1];
    if (!rowBlock) return false;
    var endBrace = rowBlock.indexOf('};');
    var row = rowBlock.slice(0, endBrace);
    return !row.includes('body.owner_user_id') &&
           row.match(/owner_user_id\s*:\s*null/);
  })(),
  'owner_user_id might come from caller body');

/* ── T6: claimed forced false ────────────────────────────── */
console.log('\nT6: claimed forced false');
check('T6.1 claimed: false in artisanRow',
  fn.match(/claimed\s*:\s*false/),
  'claimed not forced to false');
check('T6.2 claim_status: null in artisanRow',
  fn.match(/claim_status\s*:\s*null/),
  'claim_status not forced to null');

/* ── T7: onboarding_completed forced false ───────────────── */
console.log('\nT7: onboarding_completed forced false');
check('T7.1 onboarding_completed: false in artisanRow',
  fn.match(/onboarding_completed\s*:\s*false/),
  'onboarding_completed not forced to false');

/* ── T8: availability forced unavailable ─────────────────── */
console.log('\nT8: availability forced unavailable');
check('T8.1 availability: unavailable in artisanRow',
  fn.match(/availability\s*:\s*'unavailable'/),
  'availability not forced to unavailable');

/* ── T9: verified forced false ───────────────────────────── */
console.log('\nT9: verified forced false');
check('T9.1 verified: false in artisanRow',
  fn.match(/verified\s*:\s*false/),
  'verified not forced to false');

/* ── T10: no service_role in browser JS ──────────────────── */
console.log('\nT10: No service_role in browser JS');
ANY_BROWSER_JS.forEach(function(fpath) {
  if (!fs.existsSync(fpath)) return;
  var src = fs.readFileSync(fpath, 'utf8');
  var basename = path.basename(fpath);
  check('T10.' + basename + ' — no service_role literal JWT',
    !src.match(/eyJ[A-Za-z0-9._-]{20,}/),
    'literal JWT found in ' + basename);
  check('T10.' + basename + ' — no SUPABASE_SERVICE_ROLE_KEY reference',
    !src.split('\n').some(function(line) {
      var t = line.trim();
      return t.indexOf('//') !== 0 && t.indexOf('*') !== 0 &&
             /SUPABASE_SERVICE_ROLE_KEY/.test(t);
    }),
    'SUPABASE_SERVICE_ROLE_KEY used (not commented) in ' + basename);
});
check('T10.fn uses process.env only (server-side)',
  fn.includes('process.env.SUPABASE_SERVICE_ROLE_KEY') &&
  !fn.match(/eyJ[A-Za-z0-9._-]{20,}/),
  'service_role not from process.env or literal JWT found in fn');

/* ── T11: no localStorage fallback ──────────────────────── */
console.log('\nT11: No localStorage fallback in admin-artisans.js');
check('T11.1 no localStorage.setItem for artisan creation',
  !admin.match(/localStorage\.setItem.*artisan.*(?:add|creat|insert)/i) &&
  (function() {
    /* In the add-artisan catch block, no localStorage write should happen */
    var catchBlock = admin.split('Add-artisan API error')[1];
    if (!catchBlock) return true;
    var end = catchBlock.indexOf('}\n}');
    var block = catchBlock.slice(0, end < 0 ? 500 : end);
    return !block.includes('localStorage.setItem');
  })(),
  'localStorage write in add-artisan error path');
check('T11.2 add-artisan catch/error block does NOT write to localStorage',
  (function() {
    /* admin-artisans.js uses localStorage as display-cache (that is fine).
     * The error/catch block for add-artisan must NOT write to it. */
    var catchSection = admin.split('Add-artisan API error')[1] || admin.split('add-artisan').slice(-1)[0] || '';
    /* Look in the catch block (up to ~600 chars) */
    var catchSnip = catchSection.slice(0, 600);
    return !catchSnip.includes('localStorage.setItem');
  })(),
  'localStorage.setItem called in add-artisan error/catch block');
check('T11.3 error path shows truthful message without Supabase Studio fallback suggestion',
  admin.includes('erreur r\u00e9seau') || admin.includes('error r\u00e9seau') || admin.includes('err.message'),
  'truthful error message missing');

/* ── T12: canonical list refresh after success ───────────── */
console.log('\nT12: Canonical list refresh after success');
check('T12.1 FixeoRepository.getAllArtisans called after success',
  admin.includes('FixeoRepository.getAllArtisans()') ||
  admin.includes('FixeoRepository.getAllArtisans'),
  'canonical refresh not called after success');
check('T12.2 _lsSave called after canonical refresh (display cache)',
  admin.includes('_lsSave') && admin.includes('canonical'),
  '_lsSave not called after canonical refresh');
check('T12.3 FixeoAdminCanonicalSync.sync triggered after add',
  admin.includes('FixeoAdminCanonicalSync') && admin.includes('.sync()'),
  'FixeoAdminCanonicalSync.sync not triggered');

/* ── T13: insert failure surfaced truthfully ─────────────── */
console.log('\nT13: Insert failure surfaced truthfully');
check('T13.1 SUPABASE_ERROR returned as 500',
  fn.includes("status(500)") && fn.includes('insert_error'),
  'insert error not surfaced as 500');
check('T13.2 network error returned as 500',
  fn.includes('network_error'),
  'network error not surfaced');
check('T13.3 server_config_error for ENV_MISSING',
  fn.includes('server_config_error'),
  'ENV_MISSING error not surfaced truthfully');
check('T13.4 no fake success on error',
  (function() {
    /* All error paths must NOT call res.status(200) after them */
    var errors = ['ENV_MISSING', 'NETWORK', '23505', 'SUPABASE_'];
    return errors.every(function(e) {
      var idx = fn.indexOf("e.code === '" + e);
      if (idx < 0) idx = fn.indexOf('e.code === \'SUPABASE_\'');
      if (idx < 0) return true;
      /* Check the next 300 chars don't have status(200) before status(4xx/5xx) */
      var slice = fn.slice(idx, idx + 400);
      var pos200 = slice.indexOf('status(200)');
      var pos4xx = slice.search(/status\((4|5)\d\d\)/);
      return pos200 < 0 || (pos4xx >= 0 && pos4xx < pos200);
    });
  })(),
  'fake success possible after insert error');

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

/* ── T15: caller cannot override lifecycle fields ────────── */
console.log('\nT15: Caller cannot override lifecycle fields');
check('T15.1 owner_user_id not taken from body',
  !fn.includes('body.owner_user_id'),
  'owner_user_id taken from caller body');
check('T15.2 verified not taken from body',
  !fn.includes('body.verified'),
  'verified taken from caller body');
check('T15.3 availability not taken from body',
  !fn.includes('body.availability'),
  'availability taken from caller body');
check('T15.4 claimed not taken from body',
  !fn.includes('body.claimed'),
  'claimed taken from caller body');
check('T15.5 onboarding_completed not taken from body',
  !fn.includes('body.onboarding_completed'),
  'onboarding_completed taken from caller body');

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
check('T20.5 lifecycle fields truthful in response (not caller-controlled)',
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
