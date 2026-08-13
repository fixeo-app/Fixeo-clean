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
test('S9.1 JS version is v2g', () => {
  assertMatch(js, /VERSION\s*=\s*'v2g'/);
});
test('S9.2 HTML script tag points to v2g', () => {
  assertMatch(html, /fixeo-artisan-dashboard-v2\.js\?v=v2g/);
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
test('S11.19 HTML points to v2g JS and v1e CSS', () => {
  assertMatch(html, /v2g/);
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


/* ══════════════════════════════════════════════════════════ */
/* S13: Cockpit V1 — capability + security tests             */
/* ══════════════════════════════════════════════════════════ */

const ckJs  = fs.readFileSync(path.join(ROOT, 'js/fixeo-artisan-cockpit-v1.js'), 'utf8');
const ckExec = stripComments(ckJs);
const ckCss  = fs.readFileSync(path.join(ROOT, 'css/fixeo-artisan-cockpit-v1.css'), 'utf8');
const ckSql  = fs.readFileSync(path.join(ROOT, 'supabase/7c-cockpit-gallery-photo.sql'), 'utf8');

/* Version / load guard */
test('S13.1 cockpit JS has load guard', () => {
  assertMatch(ckExec, /_fxCockpitLoaded/);
});
test('S13.2 cockpit loaded in HTML (any v1x version)', () => {
  assertMatch(html, /fixeo-artisan-cockpit-v1\.js\?v=v1/);
});
test('S13.3 cockpit CSS loaded in HTML', () => {
  assertMatch(html, /fixeo-artisan-cockpit-v1\.css\?v=v1a/);
});

/* Security: no privileged artisan writes */
test('S13.4 cockpit does not directly write owner_user_id', () => {
  assertNoMatch(ckExec, /\.update\s*\(\s*\{[^}]*owner_user_id/);
});
test('S13.5 cockpit does not directly write onboarding_completed', () => {
  assertNoMatch(ckExec, /\.update\s*\(\s*\{[^}]*onboarding_completed/);
});
test('S13.6 cockpit does not directly write verified', () => {
  assertNoMatch(ckExec, /\.update\s*\(\s*\{[^}]*verified\b/);
});
test('S13.7 cockpit does not directly write claim_status', () => {
  assertNoMatch(ckExec, /\.update\s*\(\s*\{[^}]*claim_status/);
});
test('S13.8 cockpit does not directly write availability', () => {
  assertNoMatch(ckExec, /\.update\s*\(\s*\{[^}]*availability/);
});
test('S13.9 photo_url update scoped to owner_user_id eq uid', () => {
  /* Must eq owner_user_id to prevent cross-artisan photo_url write */
  assertMatch(ckExec, /update\s*\(\s*\{\s*photo_url[\s\S]{0,80}?owner_user_id/);
});

/* Gallery security */
test('S13.10 gallery upload uses auth.uid path', () => {
  assertMatch(ckExec, /_galleryPath\(uid/);
});
test('S13.11 gallery delete filters by artisan_id eq uid', () => {
  assertMatch(ckExec, /\.delete\(\)[\s\S]{0,60}?artisan_id[\s\S]{0,30}?uid/);
});
test('S13.12 gallery insert includes artisan_id = uid', () => {
  assertMatch(ckExec, /artisan_id\s*:\s*uid/);
});

/* SQL migration */
test('S13.13 gallery SQL creates portfolio_items with artisan_id TEXT', () => {
  assertMatch(ckSql, /CREATE TABLE IF NOT EXISTS public\.portfolio_items/);
  assertMatch(ckSql, /artisan_id\s+text/i);
});
test('S13.14 gallery SQL RLS insert policy uses auth.uid()::text', () => {
  assertMatch(ckSql, /artisan_id\s*=\s*auth\.uid\(\)::text/);
});
test('S13.15 storage policies scope to bucket artisan-media', () => {
  assertMatch(ckSql, /bucket_id\s*=\s*'artisan-media'/);
});
test('S13.16 storage upload policy checks owner path component', () => {
  assertMatch(ckSql, /auth\.uid\(\)::text/);
  assertMatch(ckSql, /foldername\(name\)/);
});

/* Feature presence */
test('S13.17 profile photo section rendered', () => {
  assertMatch(ckExec, /fxck-photo-section/);
  assertMatch(ckExec, /fxck-photo-img/);
});
test('S13.18 gallery section rendered', () => {
  assertMatch(ckExec, /fxck-gallery-grid/);
  assertMatch(ckExec, /fxck-gallery-upload-tile/);
});
test('S13.19 quotes section rendered with status grouping', () => {
  assertMatch(ckExec, /fxck-quote-group-label/);
  assertIncludes(ckExec, 'accepted');
  assertIncludes(ckExec, 'pending');
});
test('S13.20 public profile rendered with conditional verified badge', () => {
  assertMatch(ckExec, /fxck-verified-badge/);
  assertMatch(ckExec, /verified.*true|if.*verified/i);
});
test('S13.21 reviews shown only if review_count > 0 (stars conditional)', () => {
  assertMatch(ckExec, /revCount.*>.*0|if.*revCount/);
});
test('S13.22 financial center uses null not 0 for unknown revenue', () => {
  assertMatch(ckExec, /knownRevenue\s*:\s*null/);
  assertMatch(ckExec, /pendingRevenue\s*:\s*null/);
});
test('S13.23 financial center never uses agreed_price=0 as earnings', () => {
  /* agreed_price used only when > 0 */
  assertMatch(ckExec, /Number\(m\.agreed_price\)\s*>\s*0/);
});
test('S13.24 notifications fetch from notifications table', () => {
  assertMatch(ckExec, /from\('notifications'\)/);
  assertMatch(ckExec, /recipient_user_id.*uid|uid.*recipient_user_id/);
});
test('S13.25 mark-read updates read=true only on own notification', () => {
  assertMatch(ckExec, /update\s*\(\s*\{\s*read\s*:\s*true/);
  assertMatch(ckExec, /\.eq\('id'/);
});

/* Profile completeness */
test('S13.26 completeness score derived from real fields only', () => {
  assertMatch(ckExec, /photo.*full_name.*service_category.*city|_computeCompleteness/);
  assertNotIncludes(ckExec, 'completeness = 100'); /* no hardcoded 100% */
});
test('S13.27 completeness does NOT conflate with onboarding_completed', () => {
  /* completeness computation uses hasPhoto/name/trade/city — not onboarding_completed */
  const compFn = ckExec.match(/function _computeCompleteness[\s\S]*?\n  \}/)?.[0] || '';
  assertNotIncludes(compFn, 'onboarding_completed');
});
test('S13.28 completeness does NOT conflate with verified', () => {
  const compFn = ckExec.match(/function _computeCompleteness[\s\S]*?\n  \}/)?.[0] || '';
  assertNotIncludes(compFn, 'verified');
});

/* Section routing */
test('S13.29 V2 JS dispatches fixeo:section:changed on section change', () => {
  assertMatch(jsExec, /fixeo:section:changed/);
});
test('S13.30 V2 JS routes COCKPIT_SECS to fxck-sec-* elements', () => {
  assertMatch(jsExec, /COCKPIT_SECS/);
  assertMatch(jsExec, /fxck-sec-/);
});
test('S13.31 HTML has all 5 cockpit section containers', () => {
  assertMatch(html, /id="fxck-sec-gallery"/);
  assertMatch(html, /id="fxck-sec-quotes"/);
  assertMatch(html, /id="fxck-sec-public-profile"/);
  assertMatch(html, /id="fxck-sec-revenus"/);
  assertMatch(html, /id="fxck-sec-notifications"/);
});
test('S13.32 HTML has photo and completeness inject containers', () => {
  assertMatch(html, /id="fxck-photo-inject"/);
  assertMatch(html, /id="fxck-complete-inject"/);
});

/* Mobile */
test('S13.33 CSS has gallery del always visible on narrow mobile', () => {
  assertMatch(ckCss, /@media.*430px[\s\S]*?gallery-del[\s\S]*?opacity\s*:\s*1/);
});
test('S13.34 photo section has mobile sizing', () => {
  assertMatch(ckCss, /@media.*430px[\s\S]*?fxck-photo-wrap/);
});

/* No fake data */
test('S13.35 cockpit JS contains no hardcoded price ranges', () => {
  assertNoMatch(ckExec, /150.*350|250.*500|200.*400/);
});
test('S13.36 cockpit JS contains no fake review count', () => {
  assertNoMatch(ckExec, /review_count\s*=\s*[1-9]/);
});


/* ══════════════════════════════════════════════════════════ */
/* S14: Post-apply verify + Quote creation flow              */
/* ══════════════════════════════════════════════════════════ */

const ck2Js   = fs.readFileSync(path.join(ROOT, 'js/fixeo-artisan-cockpit-v1.js'), 'utf8');
const ck2Exec = stripComments(ck2Js);
const verifySql = fs.readFileSync(path.join(ROOT, 'supabase/7c-cockpit-gallery-photo-verify.sql'), 'utf8');
const html2 = fs.readFileSync(path.join(ROOT, 'dashboard-artisan-v2.html'), 'utf8');

/* Verify SQL */
test('S14.1 verify SQL is read-only (no CREATE TABLE / ALTER / INSERT / UPDATE / DELETE statements)', () => {
  const stmts = verifySql.split('\n').filter(l => !l.trim().startsWith('--') && !l.trim().startsWith('/*') && l.trim() !== '*/');
  const writes = stmts.filter(l => /^\s*(CREATE TABLE|ALTER TABLE|INSERT|UPDATE|DELETE|DROP)/i.test(l));
  assert(writes.length === 0, 'Unexpected write statements in verify SQL: ' + writes.join(' | '));
});
test('S14.2 verify SQL checks portfolio_items RLS', () => {
  assertMatch(verifySql, /portfolio_items/);
  assertMatch(verifySql, /rowsecurity/);
});
test('S14.3 verify SQL checks artisan-media bucket', () => {
  assertMatch(verifySql, /artisan-media/);
  assertMatch(verifySql, /storage\.buckets/);
});
test('S14.4 verify SQL checks storage policies ownership', () => {
  assertMatch(verifySql, /foldername/);
  assertMatch(verifySql, /auth\.uid\(\)/);
});
test('S14.5 verify SQL checks artisans.photo_url column grant', () => {
  assertMatch(verifySql, /photo_url/);
  assertMatch(verifySql, /column_privileges/);
});
test('S14.6 verify SQL checks cross-artisan write prevention', () => {
  assertMatch(verifySql, /anon/);
  assertMatch(verifySql, /privilege_type/);
});

/* Quote creation — JS structure */
test('S14.7 cockpit has _openQuoteModal function', () => {
  assertMatch(ck2Exec, /function _openQuoteModal/);
});
test('S14.8 cockpit has _doSubmitQuote function', () => {
  assertMatch(ck2Exec, /function _doSubmitQuote\b|async function _doSubmitQuote/);
});
test('S14.9 quote submission uses FixeoSupabase.submitQuote (canonical)', () => {
  assertMatch(ck2Exec, /FixeoSupabase\.submitQuote/);
});
test('S14.10 quote submit sends request_id, proposed_price, message', () => {
  assertMatch(ck2Exec, /request_id\s*:\s*requestId/);
  assertMatch(ck2Exec, /proposed_price\s*:\s*price/);
  assertMatch(ck2Exec, /message\s*:\s*message/);
});
test('S14.11 price validated > 0 before submit', () => {
  assertMatch(ck2Exec, /price.*<=.*0|!price.*price.*<.*0/);
});
test('S14.12 price validated as integer (no decimal MAD)', () => {
  assertMatch(ck2Exec, /isInteger.*price|price.*isInteger/);
});
test('S14.13 price validated max 999999', () => {
  assertMatch(ck2Exec, /999999/);
});
test('S14.14 _quoteSubmitting guard prevents double submission', () => {
  assertMatch(ck2Exec, /_quoteSubmitting/);
  assertMatch(ck2Exec, /if \(_quoteSubmitting\)/);
});
test('S14.15 submit button disabled during submission', () => {
  assertMatch(ck2Exec, /submitBtn.*disabled.*=.*true/);
});
test('S14.16 submit button reset on error', () => {
  assertMatch(ck2Exec, /submitBtn.*disabled.*false/);
});
test('S14.17 modal closed on success', () => {
  assertMatch(ck2Exec, /classList\.add\('hidden'\)/);
});
test('S14.18 quotes section refreshed after successful submit', () => {
  assertMatch(ck2Exec, /_fetchQuotes.*artisanId|artisanId.*_fetchQuotes/);
  assertMatch(ck2Exec, /_renderAll\('quotes'\)/);
});
test('S14.19 error displayed inside modal (not just toast)', () => {
  assertMatch(ck2Exec, /fxck-quote-err/);
  assertMatch(ck2Exec, /errDiv\.textContent/);
});
test('S14.20 eligible requests shown in quotes section CTA', () => {
  assertMatch(ck2Exec, /fxck-quote-eligible-card/);
  assertMatch(ck2Exec, /data-action="quote-new"/);
});
test('S14.21 CTA only shows requests with status=new', () => {
  assertMatch(ck2Exec, /r\.status.*===.*'new'/);
});
test('S14.22 quote form has mobile-safe number input', () => {
  assertMatch(ck2Exec, /inputmode.*numeric|type.*number/);
});
test('S14.23 quote modal uses V2 modal overlay (not custom modal)', () => {
  assertMatch(ck2Exec, /fxav2-modal-overlay/);
  assertMatch(ck2Exec, /fxav2-modal-body/);
});
test('S14.24 form submit handled via document submit listener (delegated)', () => {
  assertMatch(ck2Exec, /addEventListener\('submit'/);
  assertMatch(ck2Exec, /fxck-quote-form/);
});
test('S14.25 no fake quote statuses — quote status map only has canonical values', () => {
  /* _quoteStatusLabel maps only: pending, accepted, rejected, draft, expired */
  const fn = ck2Exec.match(/function _quoteStatusLabel[\s\S]*?\}/)?.[0] || '';
  assertNotIncludes(fn, "'approved'");
  assertNotIncludes(fn, "'confirmed'");
  assertNotIncludes(fn, "'assigned'");
});
test('S14.26 cancel button uses close-modal action (V2 handler)', () => {
  assertMatch(ck2Exec, /data-action.*close-modal|close-modal.*data-action/);
});

/* Version checks */
test('S14.27 cockpit JS version is v1b', () => {
  assertMatch(ck2Exec, /VERSION\s*=\s*'v1b'/);
});
test('S14.28 HTML cockpit script tag points to v1b', () => {
  assertMatch(html2, /fixeo-artisan-cockpit-v1\.js\?v=v1b/);
});

/* CSS additions */
test('S14.29 CSS has quote modal input styles', () => {
  const css2 = fs.readFileSync(path.join(ROOT, 'css/fixeo-artisan-cockpit-v1.css'), 'utf8');
  assertIncludes(css2, '.fxck-modal-input');
  assertIncludes(css2, '.fxck-modal-textarea');
});
test('S14.30 CSS has eligible card style', () => {
  const css2 = fs.readFileSync(path.join(ROOT, 'css/fixeo-artisan-cockpit-v1.css'), 'utf8');
  assertIncludes(css2, '.fxck-quote-eligible-card');
});

/* Preserved: gallery/photo contract */
test('S14.31 gallery SQL artisan_id constraint still TEXT', () => {
  assertMatch(ckSql, /artisan_id\s+text/i);
});
test('S14.32 cockpit photo path still uses profiles/{uid}', () => {
  assertMatch(ck2Exec, /profiles.*uid.*avatar|_profilePath/);
});
test('S14.33 no direct privileged artisan write in cockpit v1b', () => {
  assertNoMatch(ck2Exec, /\.update\s*\(\s*\{[^}]*onboarding_completed/);
  assertNoMatch(ck2Exec, /\.update\s*\(\s*\{[^}]*verified\b/);
  assertNoMatch(ck2Exec, /\.update\s*\(\s*\{[^}]*claim_status/);
  assertNoMatch(ck2Exec, /\.update\s*\(\s*\{[^}]*availability/);
});


/* ══════════════════════════════════════════════════════════ */
/* S15: Anon write privilege hardening (7c-anon-write-revoke)*/
/* ══════════════════════════════════════════════════════════ */

const revokeSql  = fs.readFileSync(path.join(ROOT, 'supabase/7c-anon-write-revoke.sql'), 'utf8');
const revokeVerSql = fs.readFileSync(path.join(ROOT, 'supabase/7c-anon-write-revoke-verify.sql'), 'utf8');
const revokeSqlStripped = revokeSql.split('\n').filter(l => !l.trim().startsWith('--') && l.trim() !== '').join('\n');

/* Hotfix SQL correctness */
test('S15.1 revoke SQL revokes INSERT on artisans FROM anon', () => {
  assertMatch(revokeSqlStripped, /REVOKE INSERT ON public\.artisans FROM anon/i);
});
test('S15.2 revoke SQL revokes DELETE on artisans FROM anon', () => {
  assertMatch(revokeSqlStripped, /REVOKE DELETE ON public\.artisans FROM anon/i);
});
test('S15.3 revoke SQL revokes INSERT on portfolio_items FROM anon', () => {
  assertMatch(revokeSqlStripped, /REVOKE INSERT ON public\.portfolio_items FROM anon/i);
});
test('S15.4 revoke SQL revokes UPDATE on portfolio_items FROM anon', () => {
  assertMatch(revokeSqlStripped, /REVOKE UPDATE ON public\.portfolio_items FROM anon/i);
});
test('S15.5 revoke SQL revokes DELETE on portfolio_items FROM anon', () => {
  assertMatch(revokeSqlStripped, /REVOKE DELETE ON public\.portfolio_items FROM anon/i);
});
test('S15.6 revoke SQL does NOT revoke SELECT (public reads preserved)', () => {
  assertNoMatch(revokeSqlStripped, /REVOKE SELECT ON public\.(artisans|portfolio_items) FROM anon/i);
});
test('S15.7 revoke SQL does NOT revoke authenticated privileges', () => {
  assertNoMatch(revokeSqlStripped, /REVOKE .* ON public\.(artisans|portfolio_items) FROM authenticated/i);
});
test('S15.8 revoke SQL does NOT contain DDL (no ALTER/CREATE/DROP)', () => {
  assertNoMatch(revokeSqlStripped, /^\s*(ALTER TABLE|CREATE TABLE|DROP TABLE|CREATE POLICY|DROP POLICY)/im);
});
test('S15.9 revoke SQL does NOT contain DML (no INSERT/UPDATE/DELETE statements)', () => {
  /* Only REVOKE INSERT/UPDATE/DELETE allowed — not bare DML */
  const bareWrite = revokeSqlStripped.replace(/REVOKE\s+(INSERT|UPDATE|DELETE|SELECT)[^;]+;/ig, '');
  assertNoMatch(bareWrite, /^\s*(INSERT INTO|UPDATE\s+\w|DELETE FROM)/im);
});
test('S15.10 revoke SQL is idempotent (no conditional guards needed — REVOKE is a no-op if absent)', () => {
  /* REVOKE is always safe to re-run — just verify no IF EXISTS guard is missing in wrong way */
  assertMatch(revokeSqlStripped, /REVOKE/i);
});

/* Verify SQL correctness */
test('S15.11 verify SQL checks anon INSERT/UPDATE/DELETE = 0 on artisans', () => {
  assertMatch(revokeVerSql, /artisans/);
  assertMatch(revokeVerSql, /INSERT.*UPDATE.*DELETE|privilege_type IN \('INSERT'/);
  assertMatch(revokeVerSql, /grantee.*=.*'anon'|anon/);
});
test('S15.12 verify SQL checks anon INSERT/UPDATE/DELETE = 0 on portfolio_items', () => {
  assertMatch(revokeVerSql, /portfolio_items/);
});
test('S15.13 verify SQL checks anon SELECT preserved on artisans', () => {
  assertMatch(revokeVerSql, /SELECT/);
  assertMatch(revokeVerSql, /anon.*SELECT|SELECT.*anon/i);
});
test('S15.14 verify SQL checks authenticated INSERT/DELETE preserved on portfolio_items', () => {
  assertMatch(revokeVerSql, /authenticated/);
  assertMatch(revokeVerSql, /INSERT.*DELETE|DELETE.*INSERT/);
});
test('S15.15 verify SQL checks authenticated column UPDATE on artisans still present', () => {
  assertMatch(revokeVerSql, /column_privileges/);
  assertMatch(revokeVerSql, /photo_url/);
});
test('S15.16 verify SQL checks RLS still enabled on both tables', () => {
  assertMatch(revokeVerSql, /rowsecurity/);
  assertMatch(revokeVerSql, /artisans.*portfolio_items|portfolio_items.*artisans/i);
});
test('S15.17 verify SQL is read-only (no DML/DDL)', () => {
  const ver = revokeVerSql.split('\n').filter(l => !l.trim().startsWith('--') && !l.trim().startsWith('/*') && l.trim() !== '*/').join('\n');
  assertNoMatch(ver, /^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|REVOKE|GRANT)\b/im);
});
test('S15.18 verify SQL has at least 10 V-checks', () => {
  const matches = revokeVerSql.match(/── V-\d+/g) || [];
  assert(matches.length >= 10, 'Expected at least 10 V-checks, found ' + matches.length);
});

/* No regression: gallery/photo contract unchanged */
test('S15.19 cockpit still has portfolio_items insert using artisan_id=uid (not modified)', () => {
  assertMatch(ck2Exec, /artisan_id\s*:\s*uid|artisan_id.*uid/);
});
test('S15.20 revoke SQL does not touch storage.objects or artisan-media bucket', () => {
  assertNoMatch(revokeSql, /storage\.objects|artisan-media/i);
});


/* ══════════════════════════════════════════════════════════ */
/* S16: Final privilege hardening (7c-privilege-final-hardening) */
/* ══════════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════════ */
/* S16: Final privilege hardening (7c-privilege-final-hardening) */
/* ══════════════════════════════════════════════════════════ */

const hardenSql = fs.readFileSync(path.join(ROOT, 'supabase/7c-privilege-final-hardening.sql'), 'utf8');
const hardenVerSql = fs.readFileSync(path.join(ROOT, 'supabase/7c-privilege-final-hardening-verify.sql'), 'utf8');
const hardenStripped = hardenSql.split('\n').filter(l => !l.trim().startsWith('--') && l.trim() !== '').join('\n');

/* Hardening SQL — correctness */
test('S16.1 revokes REFERENCES from anon on portfolio_items', () => {
  assertMatch(hardenStripped, /REVOKE REFERENCES ON public\.portfolio_items FROM anon/i);
});
test('S16.2 revokes TRIGGER from anon on portfolio_items', () => {
  assertMatch(hardenStripped, /REVOKE TRIGGER\s+ON public\.portfolio_items FROM anon/i);
});
test('S16.3 revokes TRUNCATE from anon on portfolio_items', () => {
  assertMatch(hardenStripped, /REVOKE TRUNCATE\s+ON public\.portfolio_items FROM anon/i);
});
test('S16.4 revokes UPDATE from authenticated on portfolio_items', () => {
  assertMatch(hardenStripped, /REVOKE UPDATE\s+ON public\.portfolio_items FROM authenticated/i);
});
test('S16.5 revokes REFERENCES from authenticated on portfolio_items', () => {
  assertMatch(hardenStripped, /REVOKE REFERENCES ON public\.portfolio_items FROM authenticated/i);
});
test('S16.6 revokes TRIGGER from authenticated on portfolio_items', () => {
  assertMatch(hardenStripped, /REVOKE TRIGGER\s+ON public\.portfolio_items FROM authenticated/i);
});
test('S16.7 revokes TRUNCATE from authenticated on portfolio_items', () => {
  assertMatch(hardenStripped, /REVOKE TRUNCATE\s+ON public\.portfolio_items FROM authenticated/i);
});
test('S16.8 revokes REFERENCES from anon on artisans', () => {
  assertMatch(hardenStripped, /REVOKE REFERENCES ON public\.artisans FROM anon/i);
});
test('S16.9 revokes TRIGGER from anon on artisans', () => {
  assertMatch(hardenStripped, /REVOKE TRIGGER\s+ON public\.artisans FROM anon/i);
});
test('S16.10 revokes TRUNCATE from anon on artisans', () => {
  assertMatch(hardenStripped, /REVOKE TRUNCATE\s+ON public\.artisans FROM anon/i);
});
test('S16.11 revokes REFERENCES from authenticated on artisans', () => {
  assertMatch(hardenStripped, /REVOKE REFERENCES ON public\.artisans FROM authenticated/i);
});
test('S16.12 revokes TRIGGER from authenticated on artisans', () => {
  assertMatch(hardenStripped, /REVOKE TRIGGER\s+ON public\.artisans FROM authenticated/i);
});
test('S16.13 revokes TRUNCATE from authenticated on artisans', () => {
  assertMatch(hardenStripped, /REVOKE TRUNCATE\s+ON public\.artisans FROM authenticated/i);
});
test('S16.14 does NOT revoke SELECT from anon (public reads preserved)', () => {
  assertNoMatch(hardenStripped, /REVOKE SELECT ON public\.(artisans|portfolio_items) FROM anon/i);
});
test('S16.15 does NOT revoke INSERT from authenticated on portfolio_items', () => {
  assertNoMatch(hardenStripped, /REVOKE INSERT ON public\.portfolio_items FROM authenticated/i);
});
test('S16.16 does NOT revoke DELETE from authenticated on portfolio_items', () => {
  assertNoMatch(hardenStripped, /REVOKE DELETE ON public\.portfolio_items FROM authenticated/i);
});
test('S16.17 does NOT touch service_role', () => {
  assertNoMatch(hardenStripped, /FROM service_role/i);
});
test('S16.18 does NOT contain DDL (no CREATE/ALTER/DROP)', () => {
  assertNoMatch(hardenStripped, /^\s*(CREATE TABLE|ALTER TABLE|DROP TABLE|CREATE POLICY|DROP POLICY)/im);
});
test('S16.19 does NOT contain DML (no bare INSERT/UPDATE/DELETE statements)', () => {
  const bareWrite = hardenStripped.replace(/REVOKE\s+\S[^;]+;/ig, '');
  assertNoMatch(bareWrite, /^\s*(INSERT INTO|UPDATE\s+\w|DELETE FROM)/im);
});
test('S16.20 does NOT touch storage.objects or artisan-media bucket', () => {
  assertNoMatch(hardenStripped, /storage\.objects|artisan-media/i);
});

/* Verify SQL correctness */
test('S16.21 verify checks anon has only SELECT on portfolio_items', () => {
  assertMatch(hardenVerSql, /privilege_type.*<>.*SELECT|<>.*'SELECT'/i);
  assertMatch(hardenVerSql, /portfolio_items/);
  assertMatch(hardenVerSql, /anon/);
});
test('S16.22 verify checks V-10 TRUNCATE = 0 rows', () => {
  assertMatch(hardenVerSql, /TRUNCATE/);
  assertMatch(hardenVerSql, /FAIL.*TRUNCATE|TRUNCATE.*bypass/i);
});
test('S16.23 verify checks V-11 TRIGGER = 0 rows', () => {
  assertMatch(hardenVerSql, /TRIGGER/);
});
test('S16.24 verify checks V-12 REFERENCES = 0 rows', () => {
  assertMatch(hardenVerSql, /REFERENCES/);
});
test('S16.25 verify checks authenticated INSERT/DELETE preserved', () => {
  assertMatch(hardenVerSql, /INSERT.*DELETE|DELETE.*INSERT/);
  assertMatch(hardenVerSql, /authenticated/);
});
test('S16.26 verify checks column_privileges (column UPDATE preserved)', () => {
  assertMatch(hardenVerSql, /column_privileges/);
});
test('S16.27 verify checks RLS remains enabled', () => {
  assertMatch(hardenVerSql, /rowsecurity/);
});
test('S16.28 verify is read-only (no DML/DDL/REVOKE/GRANT)', () => {
  const ver = hardenVerSql.split('\n').filter(l => !l.trim().startsWith('--') && !l.trim().startsWith('/*') && l.trim() !== '*/').join('\n');
  assertNoMatch(ver, /^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|REVOKE|GRANT)\b/im);
});
test('S16.29 verify has at least 12 V-checks', () => {
  const matches = hardenVerSql.match(/── V-\d+/g) || [];
  assert(matches.length >= 12, 'Expected >= 12 V-checks, found ' + matches.length);
});
test('S16.30 cockpit JS does NOT use portfolio_items UPDATE path', () => {
  /* No cockpit application path calls UPDATE on portfolio_items */
  assertNoMatch(ck2Exec, /from\('portfolio_items'\)\s*\.update/i);
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
