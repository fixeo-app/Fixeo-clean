/**
 * FIXEO Admin Canonical Sync V1 — Test Suite
 * data/pricing/ux/prototype/tests/admin-canonical-sync-v1-tests.js
 *
 * Tests:
 *   S-ACS-1  Claim queue correctness
 *   S-ACS-2  Artisan lifecycle state distinction (4 separate states)
 *   S-ACS-3  Financial truthfulness (no fake price, no 0 fill)
 *   S-ACS-4  No dead controls / no fake metrics
 *   S-ACS-5  Security — no direct artisan privileged writes
 *   S-ACS-6  Request/mission lifecycle states match canonical schema
 *   S-ACS-7  Quote visibility
 *   S-ACS-8  Admin home priority queue
 *   S-ACS-9  Source file integrity
 */

'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '../../../../..');
var JS_FILE  = path.join(ROOT, 'js/admin-canonical-sync-v1.js');
var CSS_FILE = path.join(ROOT, 'css/admin-canonical-sync-v1.css');
var HTML_FILE = path.join(ROOT, 'admin.html');

var results = { pass: 0, fail: 0, failures: [] };

function pass(name) { results.pass++; process.stdout.write('  ✓ [PASS] ' + name + '\n'); }
function fail(name, reason) {
  results.fail++;
  results.failures.push(name + ': ' + reason);
  process.stdout.write('  ✗ [FAIL] ' + name + ' — ' + reason + '\n');
}
function check(name, condition, reason) { condition ? pass(name) : fail(name, reason || 'Condition false'); }

var js  = fs.readFileSync(JS_FILE,  'utf8');
var css = fs.readFileSync(CSS_FILE, 'utf8');
var html = fs.readFileSync(HTML_FILE, 'utf8');

/* ── S-ACS-1: Claim queue ──────────────────────────────────── */
console.log('\nS-ACS-1: Claim queue');
check('A1.1 fetches claim_requests from Supabase',
  js.includes("from('claim_requests')"),
  'claim_requests fetch missing');
check('A1.2 filters pending claims',
  js.includes("c.status === 'pending'"),
  'pending filter missing');
check('A1.3 approve via FixeoRepository.approveClaimRequest',
  js.includes('FixeoRepository.approveClaimRequest'),
  'approveClaimRequest call missing');
check('A1.4 reject via FixeoRepository.rejectClaimRequest',
  js.includes('FixeoRepository.rejectClaimRequest'),
  'rejectClaimRequest call missing');
check('A1.5 approve_artisan_claim RPC referenced in repository',
  fs.readFileSync(path.join(ROOT, 'js/fixeo-repository.js'), 'utf8').includes("'approve_artisan_claim'"),
  'approve_artisan_claim RPC not in repository');
check('A1.6 reject_artisan_claim RPC referenced in repository',
  fs.readFileSync(path.join(ROOT, 'js/fixeo-repository.js'), 'utf8').includes("'reject_artisan_claim'"),
  'reject_artisan_claim RPC not in repository');
check('A1.7 approve action uses confirm() before proceeding',
  js.includes("confirm('Approuver ce claim"),
  'confirm guard missing on approve');

/* ── S-ACS-2: Lifecycle state distinction ──────────────────── */
console.log('\nS-ACS-2: Artisan lifecycle state distinction');
check('A2.1 claim/ownership state rendered separately',
  js.includes('owner_user_id') && js.includes('claim_status'),
  'claim ownership state missing');
check('A2.2 onboarding_completed rendered separately',
  js.includes('onboarding_completed'),
  'onboarding_completed state missing');
check('A2.3 availability rendered separately',
  js.includes("availability === 'available'"),
  'availability state missing');
check('A2.4 verified rendered separately',
  js.includes('a.verified'),
  'verified state missing');
check('A2.5 four distinct pill classes exist',
  css.includes('fxacs-pill-claim-ok') &&
  css.includes('fxacs-pill-onboard') &&
  css.includes('fxacs-pill-avail') &&
  css.includes('fxacs-pill-verified'),
  'not all four pill classes present');
check('A2.6 _artisanOperational requires all 3: owner_user_id + onboarding + available',
  js.includes('owner_user_id && a.onboarding_completed && a.availability'),
  '_artisanOperational missing correct triple-gate');
check('A2.7 CLAIM APPROVED ≠ ONBOARDING COMPLETED (not conflated)',
  !js.match(/claim.*onboarding_completed\s*=\s*true/) &&
  !js.match(/onboarding_completed.*claimed\s*=\s*true/),
  'states are conflated');

/* ── S-ACS-3: Financial truthfulness ───────────────────────── */
console.log('\nS-ACS-3: Financial truthfulness');
check('A3.1 agreed_price only shown when not null',
  js.includes('agreed_price !== null') && js.includes('agreed_price !== undefined'),
  'agreed_price null guard missing');
check('A3.2 final_price only shown when not null',
  js.includes('final_price !== null') && js.includes('final_price !== undefined'),
  'final_price null guard missing');
check('A3.3 no fake 0 MAD for unknown price',
  !js.match(/agreed_price\s*[^!]=\s*0\b/) &&
  !js.match(/finalPrice\s*=\s*'0\s*MAD'/),
  'fake 0 MAD present');
check('A3.4 no invented commission calculation',
  !js.match(/commission\s*=\s*[0-9]+\s*\*/) &&
  !js.match(/commission.*MAD/),
  'invented commission present');
check('A3.5 revenue KPI not fabricated',
  !js.match(/revenue\s*=\s*[0-9]+/) &&
  !js.match(/totalRevenue\s*=\s*[0-9]+/),
  'fake revenue present');

/* ── S-ACS-4: No dead controls / no fake metrics ───────────── */
console.log('\nS-ACS-4: No dead controls / no fake metrics');
check('A4.1 subscription KPI not invented',
  !js.match(/abonnements\s*=\s*[0-9]+/i),
  'fake subscription count');
check('A4.2 no hardcoded artisan count',
  !js.match(/artisans\.length\s*=\s*[0-9]+/),
  'hardcoded artisan count');
check('A4.3 no fake artisan data inserted',
  !js.includes('FAKE') && !js.includes('placeholder_artisan'),
  'fake placeholder data present');
check('A4.4 all buttons have real data-fxacs-action handlers',
  js.includes('data-fxacs-action') && js.includes('_handleAction'),
  'action buttons without handler');

/* ── S-ACS-5: Security ─────────────────────────────────────── */
console.log('\nS-ACS-5: Security');
check('A5.1 no direct artisan UPDATE with privileged fields',
  !js.match(/\.update\(.*owner_user_id/) &&
  !js.match(/\.update\(.*onboarding_completed/) &&
  !js.match(/\.update\(.*claim_status/) &&
  !js.match(/\.update\(.*verified\b/),
  'direct privileged field update found');
check('A5.2 no service_role key in browser JS',
  /* Comment-only mentions are OK (as warnings/docs); actual key usage is not.
     We check that no string literal 'service_role' appears outside comment lines. */
  !js.split('\n').some(function(line) {
    var trimmed = line.trim();
    return trimmed.indexOf('//') !== 0 && trimmed.indexOf('*') !== 0 &&
           /service_role/i.test(trimmed) &&
           !trimmed.match(/Never uses service_role/);
  }),
  'service_role key used (not just documented)');
check('A5.3 no p_artisan_id in any RPC call from this file',
  !js.match(/p_artisan_id/),
  'p_artisan_id in RPC call');
check('A5.4 no client_phone exposed',
  !js.match(/client_phone/),
  'client_phone exposed');
check('A5.5 approveClaimRequest goes through FixeoRepository (not direct Supabase)',
  js.includes('FixeoRepository.approveClaimRequest') &&
  !js.match(/\.rpc\(\s*['"]approve_artisan_claim/),
  'direct RPC call bypasses repository');

/* ── S-ACS-6: Request/Mission lifecycle states ─────────────── */
console.log('\nS-ACS-6: Request/mission lifecycle states');
var canonicalRequestStates = ['new', 'pending', 'assigned', 'offered', 'in_progress', 'completed', 'validated', 'cancelled'];
var canonicalMissionStates = ['sent', 'offered', 'pending', 'accepted', 'in_progress', 'completed', 'validated', 'cancelled'];
canonicalRequestStates.forEach(function(s) {
  check('A6.R.' + s + ' request status handled',
    js.includes("'" + s + "'"),
    'request status "' + s + '" not handled');
});
canonicalMissionStates.forEach(function(s) {
  check('A6.M.' + s + ' mission status handled',
    js.includes("'" + s + "'"),
    'mission status "' + s + '" not handled');
});
check('A6.1 no invented lifecycle states',
  !js.match(/'failed'/) && !js.match(/'timeout'/) && !js.match(/'blocked'/),
  'invented lifecycle states present');

/* ── S-ACS-7: Quote visibility ─────────────────────────────── */
console.log('\nS-ACS-7: Quote visibility');
check('A7.1 fetches quotes from Supabase',
  js.includes("from('quotes')"),
  'quotes fetch missing');
check('A7.2 artisan_id shown per quote',
  js.includes('q.artisan_id'),
  'artisan_id per quote missing');
check('A7.3 request_id shown per quote',
  js.includes('q.request_id'),
  'request_id per quote missing');
check('A7.4 price only shown when present',
  js.includes('q.price ?'),
  'quote price null guard missing');

/* ── S-ACS-8: Admin home priority queue ────────────────────── */
console.log('\nS-ACS-8: Admin home priority queue');
check('A8.1 pending claims count in home panel',
  js.includes('pendingClaims.length') && js.includes('pendingClaims'),
  'pending claims count missing');
check('A8.2 unassigned requests count in home panel',
  js.includes('unassigned') && js.includes('unassigned.length'),
  'unassigned requests missing');
check('A8.3 active missions count in home panel',
  js.includes('activeMissions') && js.includes('activeMissions.length'),
  'active missions missing');
check('A8.4 non-operational artisans count in home panel',
  js.includes('notOperational') && js.includes('notOperational.length'),
  'non-operational artisans missing');
check('A8.5 ok state shown when no actions needed',
  js.includes('Aucune action urgente'),
  'ok state missing');
check('A8.6 auto-refresh every 60s',
  js.includes('setInterval(_syncAll, 60000)'),
  '60s auto-refresh missing');

/* ── S-ACS-9: Source file integrity ────────────────────────── */
console.log('\nS-ACS-9: Source file integrity');
check('A9.1 idempotency guard',
  js.includes('_fxAcsV1Loaded'),
  'idempotency guard missing');
check('A9.2 admin.html loads canonical sync CSS',
  html.includes('admin-canonical-sync-v1.css'),
  'CSS not loaded in admin.html');
check('A9.3 admin.html loads canonical sync JS',
  html.includes('admin-canonical-sync-v1.js'),
  'JS not loaded in admin.html');
check('A9.4 data-dash-type=admin on body in admin.html',
  html.includes('data-dash-type="admin"'),
  'data-dash-type not set — init guard will block');
check('A9.5 CSS has all lifecycle pill classes',
  css.includes('fxacs-pill-claim-ok') &&
  css.includes('fxacs-pill-onboard-no') &&
  css.includes('fxacs-pill-avail-no') &&
  css.includes('fxacs-pill-unverified'),
  'not all pill classes in CSS');
check('A9.6 JS version token set',
  js.includes("VERSION = 'v1a'"),
  'VERSION token missing');
check('A9.7 public API exported',
  js.includes('window.FixeoAdminCanonicalSync'),
  'public API not exported');
check('A9.8 no console.log leaking in production (only LOG prefixed)',
  !js.match(/console\.log\s*\(\s*['"]/),
  'raw console.log without LOG prefix found');

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
