/**
 * Artisan Dashboard V2 — Functional Product Pass Tests
 * estimator-v2-dashboard-v2-functional-tests.js
 *
 * Sections:
 *  S1:  agreed_price=null (not 0) at mission INSERT
 *  S2:  Availability uses update_artisan_availability RPC
 *  S3:  Onboarding completion uses complete_artisan_onboarding RPC
 *  S4:  Profile edit — allowed fields only, no privileged writes
 *  S5:  onboarding_completed in SELECT
 *  S6:  phone_public not used as primary phone in profile section
 *  S7:  Mission status mirrored on missions table
 *  S8:  Modal action listener covers both main + overlay
 *  S9:  Version bump
 *  S10: Security invariants — no direct privileged writes
 */

'use strict';
let _pass = 0, _fail = 0;
const results = [];
function test(label, fn) {
  try { fn(); _pass++; results.push({ status: 'PASS', label }); }
  catch(e) { _fail++; results.push({ status: 'FAIL', label, error: e.message }); }
}
function assert(c, m)        { if (!c) throw new Error(m || 'Assertion failed'); }
function assertIncludes(s, sub, m) { assert(String(s).includes(sub), m || `Expected: ${sub}`); }
function assertNotIncludes(s, sub, m) { assert(!String(s).includes(sub), m || `Must NOT include: ${sub}`); }
function assertMatch(s, re, m) { assert(re.test(String(s)), m || `Pattern not found: ${re}`); }
function assertNoMatch(s, re, m) { assert(!re.test(String(s)), m || `Must not match: ${re}`); }

const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../../../..');
const js  = fs.readFileSync(path.join(ROOT, 'js/fixeo-artisan-dashboard-v2.js'), 'utf8');
const html= fs.readFileSync(path.join(ROOT, 'dashboard-artisan-v2.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css/fixeo-artisan-dashboard-v2.css'), 'utf8');
const stripComments = s => s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const jsExec = stripComments(js);

/* ══════════════════════════════════════════════════════════ */
/* S1: agreed_price = null (not 0) at mission INSERT         */
/* ══════════════════════════════════════════════════════════ */
test('S1.1 agreed_price:null in mission INSERT (7C.11F.1B)', () => {
  assertMatch(jsExec, /agreed_price\s*:\s*null/);
});
test('S1.2 agreed_price:0 removed from INSERT', () => {
  // Extract the INSERT block only
  const insertBlock = jsExec.match(/\.from\('missions'\)\.insert\(\{[\s\S]*?\}\)/)?.[0] || '';
  assertNotIncludes(insertBlock, 'agreed_price:       0');
  assertNotIncludes(insertBlock, 'agreed_price: 0');
});
test('S1.3 commission_amount:0 removed from INSERT', () => {
  const insertBlock = jsExec.match(/\.from\('missions'\)\.insert\(\{[\s\S]*?\}\)/)?.[0] || '';
  assertNotIncludes(insertBlock, 'commission_amount');
});

/* ══════════════════════════════════════════════════════════ */
/* S2: Availability uses update_artisan_availability RPC     */
/* ══════════════════════════════════════════════════════════ */
test('S2.1 _doSetAvailability function defined', () => {
  assertMatch(jsExec, /function _doSetAvailability/);
});
test('S2.2 update_artisan_availability RPC called', () => {
  assertMatch(jsExec, /rpc\('update_artisan_availability'/);
});
test('S2.3 p_status parameter passed to RPC', () => {
  assertMatch(jsExec, /rpc\('update_artisan_availability',\s*\{\s*p_status/);
});
test('S2.4 no direct availability update on artisans table', () => {
  // Should not do .from('artisans').update({availability
  const artisansUpdates = [...jsExec.matchAll(/\.from\('artisans'\)\.update\(\{([\s\S]*?)\}\)/g)].map(m => m[1]);
  artisansUpdates.forEach(function(clause) {
    assertNotIncludes(clause, 'availability');
  });
});
test('S2.5 set-available action wired to _doSetAvailability', () => {
  assertMatch(jsExec, /case 'set-available'.*_doSetAvailability\('available'/);
});
test('S2.6 set-unavailable action wired to _doSetAvailability', () => {
  assertMatch(jsExec, /case 'set-unavailable'.*_doSetAvailability\('unavailable'/);
});
test('S2.7 availability toggle rendered in profile header', () => {
  assertMatch(jsExec, /data-action="set-available"/);
  assertMatch(jsExec, /data-action="set-unavailable"/);
});
test('S2.8 onboarding_required error handled in availability RPC response', () => {
  const availFn = jsExec.match(/function _doSetAvailability[\s\S]*?^  \}/m)?.[0] || '';
  assertIncludes(availFn, 'onboarding_required');
});

/* ══════════════════════════════════════════════════════════ */
/* S3: Onboarding completion uses complete_artisan_onboarding */
/* ══════════════════════════════════════════════════════════ */
test('S3.1 _doCompleteOnboarding function defined', () => {
  assertMatch(jsExec, /function _doCompleteOnboarding/);
});
test('S3.2 complete_artisan_onboarding RPC called', () => {
  assertMatch(jsExec, /rpc\('complete_artisan_onboarding'\)/);
});
test('S3.3 complete-onboarding action wired', () => {
  assertMatch(jsExec, /case 'complete-onboarding'.*_doCompleteOnboarding/);
});
test('S3.4 onboarding CTA rendered when !onboarding_completed', () => {
  assertMatch(jsExec, /data-action="complete-onboarding"/);
  assertMatch(jsExec, /!onboarded/);
});
test('S3.5 no direct write to onboarding_completed in executable JS', () => {
  assertNoMatch(jsExec, /onboarding_completed\s*:\s*true/);
});
test('S3.6 profile_incomplete reason handled in onboarding RPC response', () => {
  assertIncludes(jsExec, 'profile_incomplete');
});

/* ══════════════════════════════════════════════════════════ */
/* S4: Profile edit — allowed fields only                    */
/* ══════════════════════════════════════════════════════════ */
test('S4.1 _doSaveProfile function defined', () => {
  assertMatch(jsExec, /function _doSaveProfile/);
});
test('S4.2 full_name in profile patch', () => {
  assertMatch(jsExec, /patch\.full_name/);
});
test('S4.3 service_category in profile patch', () => {
  assertMatch(jsExec, /patch\.service_category/);
});
test('S4.4 city in profile patch', () => {
  assertMatch(jsExec, /patch\.city/);
});
test('S4.5 description in profile patch', () => {
  assertMatch(jsExec, /patch\.description/);
});
test('S4.6 work_zone in profile patch', () => {
  assertMatch(jsExec, /patch\.work_zone/);
});
test('S4.7 owner_user_id NOT in profile patch', () => {
  const saveFn = jsExec.match(/function _doSaveProfile[\s\S]*?^  \}/m)?.[0] || '';
  assertNoMatch(saveFn, /patch\.owner_user_id/);
});
test('S4.8 onboarding_completed NOT in profile patch', () => {
  const saveFn = jsExec.match(/function _doSaveProfile[\s\S]*?^  \}/m)?.[0] || '';
  assertNoMatch(saveFn, /patch\.onboarding_completed/);
});
test('S4.9 verified NOT in profile patch', () => {
  const saveFn = jsExec.match(/function _doSaveProfile[\s\S]*?^  \}/m)?.[0] || '';
  assertNoMatch(saveFn, /patch\.verified/);
});
test('S4.10 claimed NOT in profile patch', () => {
  const saveFn = jsExec.match(/function _doSaveProfile[\s\S]*?^  \}/m)?.[0] || '';
  assertNoMatch(saveFn, /patch\.claimed/);
});
test('S4.11 claim_status NOT in profile patch', () => {
  const saveFn = jsExec.match(/function _doSaveProfile[\s\S]*?^  \}/m)?.[0] || '';
  assertNoMatch(saveFn, /patch\.claim_status/);
});
test('S4.12 availability NOT in profile patch (must use RPC)', () => {
  const saveFn = jsExec.match(/function _doSaveProfile[\s\S]*?^  \}/m)?.[0] || '';
  assertNoMatch(saveFn, /patch\.availability/);
});
test('S4.13 edit-profile action opens modal', () => {
  assertMatch(jsExec, /case 'edit-profile'.*_openProfileEditModal/);
});
test('S4.14 save-profile action dispatches _doSaveProfile', () => {
  assertMatch(jsExec, /case 'save-profile'/);
  assertMatch(jsExec, /_doSaveProfile\(fd,/);
});
test('S4.15 close-modal action wired', () => {
  assertMatch(jsExec, /case 'close-modal'.*_closeModal/);
});

/* ══════════════════════════════════════════════════════════ */
/* S5: onboarding_completed in SELECT                        */
/* ══════════════════════════════════════════════════════════ */
test('S5.1 onboarding_completed included in artisans SELECT', () => {
  // SELECT is a multiline string concatenation — search full JS source for the column name
  // adjacent to other artisan SELECT columns
  assertMatch(js, /onboarding_completed/);  // in file
  assertMatch(js, /\.select\([\s\S]{0,300}?onboarding_completed/);  // within ~300 chars of .select(
});

/* ══════════════════════════════════════════════════════════ */
/* S6: phone_public not primary phone source in profile      */
/* ══════════════════════════════════════════════════════════ */
test('S6.1 phone_public NOT used as primary phone in _renderProfileSection executable code', () => {
  // Extract _renderProfileSection
  const fnBlock = jsExec.match(/function _renderProfileSection[\s\S]*?(?=\n  function )/)?.[0] || '';
  // phone_public can appear in comments but not as a primary source
  const execBlock = fnBlock.replace(/\/\/[^\n]*/g, '');
  assertNoMatch(execBlock, /ap\.phone_public/);
});

/* ══════════════════════════════════════════════════════════ */
/* S7: Mission status mirrored on missions table             */
/* ══════════════════════════════════════════════════════════ */
test('S7.1 _doStartMission updates missions table status', () => {
  const fn = jsExec.match(/function _doStartMission[\s\S]*?^  \}/m)?.[0] || '';
  assertMatch(fn, /\.from\('missions'\)\.update/);
});
test('S7.2 _doCompleteMission updates missions table status', () => {
  const fn = jsExec.match(/function _doCompleteMission[\s\S]*?^  \}/m)?.[0] || '';
  assertMatch(fn, /\.from\('missions'\)\.update/);
});

/* ══════════════════════════════════════════════════════════ */
/* S8: Modal action listener covers overlay                  */
/* ══════════════════════════════════════════════════════════ */
test('S8.1 _handleAction shared handler defined', () => {
  assertMatch(jsExec, /function _handleAction/);
});
test('S8.2 overlay addEventListener with _handleAction', () => {
  assertMatch(jsExec, /overlay.*addEventListener\('click', _handleAction\)/);
});
test('S8.3 main addEventListener with _handleAction', () => {
  assertMatch(jsExec, /main.*addEventListener\('click', _handleAction\)/);
});

/* ══════════════════════════════════════════════════════════ */
/* S9: Version bump                                          */
/* ══════════════════════════════════════════════════════════ */
test('S9.1 JS version is v2f', () => {
  assertMatch(js, /VERSION\s*=\s*'v2f'/);
});
test('S9.2 HTML script tag points to v2f', () => {
  assertMatch(html, /fixeo-artisan-dashboard-v2\.js\?v=v2f/);
});
test('S9.3 CSS version is v1e', () => {
  assertMatch(html, /fixeo-artisan-dashboard-v2\.css\?v=v1e/);
});

/* ══════════════════════════════════════════════════════════ */
/* S10: Security invariants                                  */
/* ══════════════════════════════════════════════════════════ */
test('S10.1 no direct write of onboarding_completed:true in executable JS', () => {
  assertNoMatch(jsExec, /onboarding_completed\s*:\s*true/);
});
test('S10.2 no direct write of verified:true in executable JS', () => {
  assertNoMatch(jsExec, /verified\s*:\s*true/);
});
test('S10.3 no direct write of availability on artisans (use RPC)', () => {
  // All artisans UPDATE patches must NOT contain availability
  const updates = [...jsExec.matchAll(/\.from\('artisans'\)\.update\(\{([\s\S]*?)\}\)/g)].map(m => m[1]);
  updates.forEach(function(u) { assertNotIncludes(u, 'availability'); });
});
test('S10.4 phone_public not written anywhere in executable JS', () => {
  assertNoMatch(jsExec, /phone_public\s*:/);
});
test('S10.5 CSS has availability row styles', () => {
  assertIncludes(css, '.fxa-avail-row');
  assertIncludes(css, '.fxa-avail-on');
  assertIncludes(css, '.fxa-avail-off');
});
test('S10.6 CSS has onboarding CTA styles', () => {
  assertIncludes(css, '.fxa-onboarding-cta');
});
test('S10.7 CSS has small button variant', () => {
  assertIncludes(css, '.fxa-btn-sm');
});


/* ══════════════════════════════════════════════════════════ */
/* S11: v2f product-complete additions                       */
/* ══════════════════════════════════════════════════════════ */

// const js2 (reuse js from top scope)  = js;
// const jsExec (reuse jsExec from top scope) = jsExec;

test('S11.1 dead claim_requests query removed from executable JS', () => {
  // The async _renderNoProfile function used to query claim_requests — removed
  assertNotIncludes(jsExec, "from('claim_requests')");
});
test('S11.2 _actionInFlight guard defined', () => {
  assertMatch(jsExec, /var _actionInFlight/);
});
test('S11.3 _actionInFlight checked in _handleAction', () => {
  assertMatch(jsExec, /if \(_actionInFlight && !navAction\)/);
});
test('S11.4 _actionInFlight set to true in _btnBusy', () => {
  const busyFn = jsExec.match(/function _btnBusy[\s\S]*?\}/)?.[0] || '';
  assertIncludes(busyFn, '_actionInFlight = true');
});
test('S11.5 _actionInFlight cleared in _btnReset', () => {
  const resetFn = jsExec.match(/function _btnReset[\s\S]*?\}/)?.[0] || '';
  assertIncludes(resetFn, '_actionInFlight = false');
});
test('S11.6 fetchError state tracked in _state', () => {
  assertMatch(jsExec, /fetchError\s*:/);
});
test('S11.7 _fetch clears fetchError at start', () => {
  assertMatch(jsExec, /_state\.fetchError\s*=\s*null/);
});
test('S11.8 session validity check inside _fetch', () => {
  assertMatch(jsExec, /getSession[\s\S]{0,200}?freshSession/i);
});
test('S11.9 _renderDashboard shows fetchError state when set', () => {
  assertIncludes(jsExec, 'fetchError');
  assertMatch(jsExec, /window\.location\.reload/);
});
test('S11.10 no-profile state shows registration link, not dead claim query', () => {
  assertMatch(jsExec, /onboarding-artisan\.html/);
  assertNotIncludes(jsExec, "from('claim_requests')");
});
test('S11.11 onboarding not-yet-complete shows dominant CTA on dashboard', () => {
  assertMatch(jsExec, /onboarding_completed.*dominant|dominant.*onboarding|fxa-onboarding-cta--full/);
});
test('S11.12 revenue KPI is null (not fabricated 0)', () => {
  assertMatch(jsExec, /var revenue\s*=\s*null/);
});
test('S11.13 revenue display uses — not 0', () => {
  assertMatch(jsExec, /revenue.*'—'|'—'.*revenue/);
  assertNoMatch(jsExec, /revenue.*' MAD'.*0|0.*' MAD'.*revenue/);
});
test('S11.14 availability banner on dashboard when not available', () => {
  assertMatch(jsExec, /avail !== 'available'/);
  assertIncludes(jsExec, 'fxa-avail-row--banner');
});
test('S11.15 active missions shown BEFORE new requests on dashboard (priority)', () => {
  const dashFn = jsExec.match(/function _renderDashboard[\s\S]*?(?=\n  function )/)?.[0] || '';
  const posMission = dashFn.indexOf('Mission en cours');
  const posOpen    = dashFn.indexOf('Nouvelles demandes');
  assert(posMission > 0 && posOpen > 0 && posMission < posOpen,
    'Active missions must be rendered before new requests');
});
test('S11.16 CSS has no-profile styles', () => {
  assertIncludes(css, '.fxa-no-profile');
  assertIncludes(css, '.fxa-no-profile-title');
});
test('S11.17 CSS has onboarding-cta--full variant', () => {
  const css2 = fs.readFileSync(path.join(ROOT, 'css/fixeo-artisan-dashboard-v2.css'), 'utf8');  // reused
  assertIncludes(css2, '.fxa-onboarding-cta--full');
});
test('S11.18 CSS has avail-row--banner variant', () => {
  const css2 = fs.readFileSync(path.join(ROOT, 'css/fixeo-artisan-dashboard-v2.css'), 'utf8');  // reused
  assertIncludes(css2, '.fxa-avail-row--banner');
});
test('S11.19 HTML points to v2f JS and v1e CSS', () => {
  assertMatch(html, /v2f/);
  assertMatch(html, /v1e/);
});
test('S11.20 in-flight guard exempts navigation actions', () => {
  assertMatch(jsExec, /navAction.*go-available|go-available.*navAction/);
  assertMatch(jsExec, /navAction.*close-modal|close-modal.*navAction/);
});


/* ══════════════════════════════════════════════════════════ */
/* S12: P2 cleanup — legacy removal + bell + revenue         */
/* ══════════════════════════════════════════════════════════ */

test('S12.1 fixeo-claim-system.js not in active script tag in dashboard HTML', () => {
  // Comment mentions it as removed — ensure no <script src=...> tag
  assertNoMatch(html, /<script[^>]*fixeo-claim-system\.js/);
});
test('S12.2 fixeo-artisan-dashboard-v3.js not loaded in dashboard HTML', () => {
  assertNotIncludes(html, 'fixeo-artisan-dashboard-v3.js');
});
test('S12.3 fixeo-artisan-dispatch-v1.js not loaded in dashboard HTML', () => {
  assertNotIncludes(html, 'fixeo-artisan-dispatch-v1.js');
});
test('S12.4 price range chips not injected by V2 JS', () => {
  assertNotIncludes(jsExec, 'priceRange');
  assertNotIncludes(jsExec, 'fxadv3-price-chip');
});
test('S12.5 commission estimates not injected by V2 JS', () => {
  assertNotIncludes(jsExec, 'commission-chip');
  assertNotIncludes(jsExec, 'commStr');
});
test('S12.6 bell button present in HTML with ID fxav2-bell', () => {
  assertMatch(html, /id="fxav2-bell"/);
});
test('S12.7 bell badge present with ID fxav2-bell-badge', () => {
  assertMatch(html, /id="fxav2-bell-badge"/);
});
test('S12.8 bell badge wired via fixeo:notifications:updated event', () => {
  assertMatch(html, /fixeo:notifications:updated/);
  assertMatch(html, /fxav2-bell-badge/);
});
test('S12.9 notification backend scripts retained (real notifications table)', () => {
  assertMatch(html, /fixeo-notifications-real-v1\.js/);
  assertMatch(html, /fixeo-notification-engine\.js/);
  assertMatch(html, /fixeo-notification-center-v1\.js/);
});
test('S12.10 revenue stays null (agreed_price not used for earnings)', () => {
  assertMatch(jsExec, /var revenue\s*=\s*null/);
  assertNoMatch(jsExec, /agreed_price.*revenue|revenue.*agreed_price/);
});
test('S12.11 no href="#" dead links in dashboard HTML', () => {
  assertNoMatch(html, /href="#(?!")/);
});
test('S12.12 no javascript:void in dashboard HTML', () => {
  assertNotIncludes(html, 'javascript:void');
});
test('S12.13 localStorage in V2 JS is logout-only (no identity/role authority)', () => {
  const lsLines = jsExec.split('\n').filter(l => l.includes('localStorage') && !l.includes('Clear') && !l.includes('clear'));
  // Any remaining localStorage usage should only be the clear calls in logout
  assert(lsLines.length === 0, 'Unexpected localStorage usage in V2 JS: ' + lsLines.join(' | '));
});
test('S12.14 no direct privileged artisan writes in V2 JS', () => {
  // update({ owner_user_id / verified / claim_status / claimed / onboarding_completed
  assertNoMatch(jsExec, /\.update\s*\(\s*\{[^}]*owner_user_id/);
  assertNoMatch(jsExec, /\.update\s*\(\s*\{[^}]*verified/);
  assertNoMatch(jsExec, /\.update\s*\(\s*\{[^}]*claim_status/);
  assertNoMatch(jsExec, /\.update\s*\(\s*\{[^}]*onboarding_completed/);
});

/* ── Summary ─────────────────────────────────────────────── */
console.log('\n══ Dashboard V2 Functional Pass Tests ══');
results.forEach(r => {
  const icon = r.status === 'PASS' ? '✓' : '✗';
  console.log(`  ${icon} [${r.status}] ${r.label}${r.status === 'FAIL' ? ' — ' + r.error : ''}`);
});
console.log(`\n  Total: ${_pass+_fail} | PASS: ${_pass} | FAIL: ${_fail}`);
if (_fail > 0) { console.error(`\n  ✗ ${_fail} FAILED`); process.exit(1); }
else { console.log(`\n  ✓ ALL ${_pass} PASS`); process.exit(0); }
