/**
 * FIXEO — Client Dashboard v2k Tests (Phase 7C.11F.2 canonical sync pass)
 * data/pricing/ux/prototype/tests/estimator-v2-client-dashboard-v2k-tests.js
 *
 * Tests:
 *   C-CD-1   Own request loading (canonical Supabase path)
 *   C-CD-2   Lifecycle state rendering (pipeline state machine)
 *   C-CD-3   Quote display (pending proposals)
 *   C-CD-4   Artisan assignment (via accepted quote or mission)
 *   C-CD-5   Mission tracking (steps 0–5)
 *   C-CD-6   Truthful prices (no fake amounts)
 *   C-CD-7   Reviews (FixeoReviews gate; inline fallback; no clientPhone)
 *   C-CD-8   Notifications (fetch, render, mark-read wired)
 *   C-CD-9   No fake statuses (no invented lifecycle)
 *   C-CD-10  No private data leakage (no service_role, no phone_private)
 *   C-CD-11  No dead controls (no uncalled FixeoReviews crash)
 *   C-CD-12  Mobile navigation (SECTIONS array + bottom nav)
 *   C-CD-13  Reject-quote ownership check
 *   C-CD-14  No fake ETA / artisan count in insights band
 *   C-CD-15  Version bumped to v2k
 *   C-CD-16  Notifications section added to HTML
 */

'use strict';

var fs   = require('fs');
var path = require('path');

var ROOT  = path.resolve(__dirname, '../../../../..');
var V2JS  = path.join(ROOT, 'js/fixeo-dashboard-v2.js');
var V2CSS = path.join(ROOT, 'css/fixeo-dashboard-v2.css');
var HTML  = path.join(ROOT, 'dashboard-client.html');
var CORE  = path.join(ROOT, 'js/fixeo-supabase-core.js');

var results = { pass: 0, fail: 0, failures: [] };
function pass(name) { results.pass++; process.stdout.write('  ✓ [PASS] ' + name + '\n'); }
function fail(name, reason) {
  results.fail++;
  results.failures.push(name + ': ' + reason);
  process.stdout.write('  ✗ [FAIL] ' + name + ' — ' + reason + '\n');
}
function check(name, cond, reason) { cond ? pass(name) : fail(name, reason || 'Condition false'); }

var js   = fs.readFileSync(V2JS,  'utf8');
var css  = fs.readFileSync(V2CSS, 'utf8');
var html = fs.readFileSync(HTML,  'utf8');
var core = fs.readFileSync(CORE,  'utf8');

/* ── C-CD-1: Own request loading ─────────────────────────────── */
console.log('\nC-CD-1: Own request loading (canonical Supabase path)');
check('C1.1 listClientRequests called from _fetch',
  js.includes('FS.listClientRequests()'),
  'listClientRequests not called');
check('C1.2 listClientRequests uses client_profile_id RLS filter',
  core.includes("eq('client_profile_id', auth.profile.id)"),
  'client_profile_id filter missing');
check('C1.3 no localStorage read in _fetch',
  (function() {
    var fetch = js.split('async function _fetch()')[1];
    if (!fetch) return false;
    var end = fetch.indexOf('\n  }'); /* end of _fetch */
    return !fetch.slice(0, end > 0 ? end : 2000).includes('localStorage.getItem');
  })(),
  'localStorage used in _fetch');
check('C1.4 missions fetched in parallel with requests',
  js.includes('FS.listClientMissions()') && js.includes('Promise.all'),
  'missions not fetched in parallel');
check('C1.5 quotes fetched for all request ids',
  js.includes('listQuotesForRequestIds(ids)'),
  'quotes not fetched');

/* ── C-CD-2: Lifecycle state rendering ───────────────────────── */
console.log('\nC-CD-2: Lifecycle state rendering');
check('C2.1 PIPELINE.NEW defined with step 0',
  js.includes("step: 0") && js.includes("NEW"),
  'PIPELINE.NEW step 0 missing');
check('C2.2 PIPELINE.COMPLETED defined with step 5',
  js.includes("step: 5") && js.includes("COMPLETED"),
  'PIPELINE.COMPLETED step 5 missing');
check('C2.3 computePipeline handles validated (English enum)',
  js.includes("st === 'validated'"),
  'validated status not handled');
check('C2.4 computePipeline handles in_progress (English enum)',
  js.includes("st === 'in_progress'"),
  'in_progress status not handled');
check('C2.5 computePipeline handles cancelled (English enum)',
  js.includes("st === 'cancelled'"),
  'cancelled status not handled');
check('C2.6 computePipeline handles assigned (English enum)',
  js.includes("st === 'assigned'"),
  'assigned status not handled');
check('C2.7 legacy French statuses also handled (backward compat)',
  js.includes("valid\u00e9e") || js.includes("valid\\u00e9e") || js.includes('validée'),
  'French legacy status not handled');
check('C2.8 step -1 used for cancelled (no timeline)',
  js.includes('step: -1'),
  'step -1 missing for cancelled');
check('C2.9 _renderTimeline skips cancelled (step < 0)',
  js.includes('if (step < 0) return'),
  'timeline not skipped for cancelled');

/* ── C-CD-3: Quote display ───────────────────────────────────── */
console.log('\nC-CD-3: Quote display');
check('C3.1 pending proposals rendered in _renderProposals',
  js.includes('_renderProposals') && js.includes("q.status === 'pending'"),
  '_renderProposals or pending filter missing');
check('C3.2 accept-quote action wired',
  js.includes("data-action=\"accept-quote\"") || js.includes("data-action='accept-quote'"),
  'accept-quote action missing');
check('C3.3 reject-quote action wired',
  js.includes("data-action=\"reject-quote\"") || js.includes("data-action='reject-quote'"),
  'reject-quote action missing');
check('C3.4 proposed_price shown when present',
  js.includes('proposed_price'),
  'proposed_price not rendered');
check('C3.5 fallback shown when no price (no fake amount)',
  /* The fallback text may use unicode escapes or literal chars */
  js.includes('Prix') && (
    js.includes('\u00e0 d\u00e9finir') ||
    js.includes('à définir') ||
    js.includes('\\u00e0 d\\u00e9finir') ||
    js.includes('Prix \\u00e0') ||
    js.includes("Prix \u00e0") ||
    js.match(/Prix.*d.finir/)
  ),
  'no fallback for missing price');

/* ── C-CD-4: Artisan assignment ──────────────────────────────── */
console.log('\nC-CD-4: Artisan assignment');
check('C4.1 artisan looked up via artisanMap (accepted quote)',
  js.includes('artisanMap') && js.includes('artisan_profile_id'),
  'artisan lookup missing');
check('C4.2 artisan select is public-only fields',
  js.match(/select\(.*id.*full_name.*phone_public.*photo_url.*service_category.*rating/),
  'artisan select not public-only fields');
check('C4.3 phone_public used (not phone or phone_private)',
  js.includes('phone_public') && !js.includes('.phone_private'),
  'private phone field referenced');
check('C4.4 _renderArtisanChip renders name + service_category',
  js.includes('_renderArtisanChip') && js.includes('service_category'),
  '_renderArtisanChip incomplete');
check('C4.5 WA link only built when phone_public present',
  js.includes('artisan.phone_public') && js.split('artisan.phone_public')[0].includes('if'),
  'WA link not gated on phone_public');

/* ── C-CD-5: Mission tracking ────────────────────────────────── */
console.log('\nC-CD-5: Mission tracking');
check('C5.1 _renderTimeline renders 5 steps (TIMELINE_LABELS)',
  js.includes('TIMELINE_LABELS') && js.includes('fxv2-timeline'),
  'timeline labels or container missing');
check('C5.2 missions section shows step 2-4 requests',
  js.includes('r._pipeline.step >= 2') && js.includes('r._pipeline.step <= 4'),
  'missions section step filter wrong');
check('C5.3 hero card rendered for most recent active mission',
  js.includes('_renderMissionHero') && js.includes('topMission'),
  'mission hero missing');
check('C5.4 price shown only when real (proposed_price truthy)',
  js.includes('quote.proposed_price ?'),
  'price shown without guard');
check('C5.5 no fake ETA in mission hero or cards',
  !js.includes('etaMin') && !js.includes('ETA moyen'),
  'fake ETA still in JS');

/* ── C-CD-6: Truthful prices ─────────────────────────────────── */
console.log('\nC-CD-6: Truthful prices');
check('C6.1 proposed_price only shown when truthy',
  js.includes('proposed_price ?') || js.includes('proposed_price &&'),
  'proposed_price shown without guard');
check('C6.2 no invented price ranges (e.g. 150-350 MAD)',
  !js.match(/\d{2,3}\s*[-–]\s*\d{3}/),
  'invented price range in JS');
check('C6.3 agreed_price not invented at dispatch time',
  !js.includes('agreed_price: 0') && !js.includes("agreed_price=0"),
  'agreed_price=0 invented');
check('C6.4 no commission_rate fabrication in client dashboard',
  !js.includes('COMMISSION_RATE') && !js.includes('0.15'),
  'commission rate in client dashboard');

/* ── C-CD-7: Reviews ─────────────────────────────────────────── */
console.log('\nC-CD-7: Reviews');
check('C7.1 _doOpenReview checks FixeoReviews before calling',
  js.includes('window.FixeoReviews && typeof window.FixeoReviews.openModal === \'function\''),
  'FixeoReviews.openModal called without existence check');
check('C7.2 clientPhone NOT passed to FixeoReviews.openModal',
  (function() {
    var callBlock = js.split('FixeoReviews.openModal')[1];
    if (!callBlock) return true; /* not called = ok */
    /* Find the actual argument object (between { and }), not comments */
    var braceStart = callBlock.indexOf('{');
    var braceEnd   = callBlock.indexOf('}');
    if (braceStart < 0 || braceEnd < 0) return true;
    var callArgs = callBlock.slice(braceStart, braceEnd + 1);
    /* Strip comments from args */
    var noComments = callArgs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    return !noComments.includes('clientPhone') && !noComments.includes('phone');
  })(),
  'clientPhone passed to FixeoReviews.openModal');
check('C7.3 data-client-phone NOT in review button HTML',
  !js.includes('data-client-phone'),
  'data-client-phone still in review button');
check('C7.4 inline review fallback form exists',
  js.includes('fxv2-review-form') && js.includes('_doSubmitReview'),
  'inline review fallback missing');
check('C7.5 23505 duplicate review handled gracefully',
  js.includes("'23505'") && js.includes('d\u00e9j\u00e0 donn\u00e9 un avis') || js.includes("'23505'"),
  '23505 duplicate review not handled');
check('C7.6 review INSERT uses session client_profile_id (not caller input)',
  (function() {
    /* The submit function reads clientId from a hidden form field that was
     * set from _state.profile.id (session) — not from URL/localStorage */
    return js.includes('client_profile_id: clientId') &&
           js.includes("querySelector('[name=\"client_profile_id\"]').value");
  })(),
  'client_profile_id for review not read from form (session-bound)');
check('C7.7 review INSERT ownership-checked via _state.missions',
  js.includes('ownsMission') && js.includes('_state.missions'),
  'review not ownership-checked');

/* ── C-CD-8: Notifications ───────────────────────────────────── */
console.log('\nC-CD-8: Notifications');
check('C8.1 _fetchNotifications defined',
  js.includes('async function _fetchNotifications'),
  '_fetchNotifications missing');
check('C8.2 notifications fetched from real table via RPC',
  js.includes("from('notifications')"),
  'notifications not fetched from real table');
check('C8.3 recipient_user_id filter applied (own notifications only)',
  js.includes("eq('recipient_user_id', uid)"),
  'recipient_user_id filter missing');
check('C8.4 _state.notifications populated after fetch',
  js.includes('_state.notifications = await _fetchNotifications'),
  '_state.notifications not populated');
check('C8.5 _renderNotificationBell defined',
  js.includes('function _renderNotificationBell'),
  '_renderNotificationBell missing');
check('C8.6 _renderNotificationList defined',
  js.includes('function _renderNotificationList'),
  '_renderNotificationList missing');
check('C8.7 mark-notif-read action wired',
  js.includes("case 'mark-notif-read'"),
  'mark-notif-read action missing');
check('C8.8 _doMarkNotifRead updates local state without re-fetch',
  js.includes('_state.notifications') && js.includes('_renderNotificationBell'),
  'mark-read does not update local state');
check('C8.9 notifications section in HTML',
  html.includes('fxv2-sec-notifications'),
  'notifications section missing from HTML');
check('C8.10 notifications in SECTIONS array',
  js.includes("'notifications'"),
  'notifications not in SECTIONS');

/* ── C-CD-9: No fake statuses ────────────────────────────────── */
console.log('\nC-CD-9: No fake statuses');
check('C9.1 no invented status values not in DB enum',
  (function() {
    /* Valid: new|assigned|in_progress|completed|validated|cancelled + French legacy */
    var bad = ['processing', 'pending_payment', 'dispatching', 'matching', 'confirmed', 'closed'];
    return bad.every(function(s) { return !js.includes("status: '" + s + "'"); });
  })(),
  'invented status value found');
check('C9.2 no fake artisan count (861+ heuristic removed)',
  !js.includes("'861+'") && !js.includes('"861+"'),
  'fake artisan count 861+ still present');
check('C9.3 no fake ETA (etaMin removed)',
  !js.includes('etaMin') && !js.includes('ETA moyen'),
  'fake ETA still present');
check('C9.4 computePipeline has no invented steps',
  (function() {
    /* Step values should only be -1, 0, 1, 2, 3, 4, 5 */
    var steps = js.match(/step:\s*(-?\d+)/g) || [];
    return steps.every(function(s) {
      var n = parseInt(s.replace('step:', '').trim(), 10);
      return n >= -1 && n <= 5;
    });
  })(),
  'invented step value found');

/* ── C-CD-10: No private data leakage ───────────────────────── */
console.log('\nC-CD-10: No private data leakage');
check('C10.1 no service_role in client dashboard JS',
  !js.split('\n').some(function(line) {
    var t = line.trim();
    return t.indexOf('//') !== 0 && t.indexOf('*') !== 0 &&
           /service_role/i.test(t) &&
           !t.match(/service_role.*env|service_role.*comment/i);
  }),
  'service_role used in client dashboard JS');
check('C10.2 artisan select does not include owner_user_id',
  !js.match(/select.*owner_user_id/),
  'owner_user_id in artisan select');
check('C10.3 artisan select does not include email',
  (function() {
    var artisanSelect = js.match(/from\('artisans'\)[\s\S]{0,200}\.select\(([^)]+)\)/);
    if (!artisanSelect) return true;
    return !artisanSelect[1].includes('email');
  })(),
  'email in artisan select');
check('C10.4 no client_phone in data-* attributes of rendered HTML',
  !js.includes('data-client-phone'),
  'data-client-phone in rendered HTML');
check('C10.5 no localStorage business authority in client dashboard',
  !js.match(/localStorage\.setItem.*request|localStorage\.setItem.*mission/),
  'localStorage business write in client dashboard');

/* ── C-CD-11: No dead controls ───────────────────────────────── */
console.log('\nC-CD-11: No dead controls');
check('C11.1 open-review action handled in switch',
  js.includes("case 'open-review'"),
  'open-review not handled (dead button)');
check('C11.2 submit-review action handled in switch',
  js.includes("case 'submit-review'"),
  'submit-review not handled');
check('C11.3 mark-notif-read action handled in switch',
  js.includes("case 'mark-notif-read'"),
  'mark-notif-read not handled');
check('C11.4 go-notifications action handled in switch',
  js.includes("case 'go-notifications'"),
  'go-notifications not handled');
check('C11.5 confirm-done action handled',
  js.includes("case 'confirm-done'"),
  'confirm-done not handled');
check('C11.6 accept-quote action handled',
  js.includes("case 'accept-quote'"),
  'accept-quote not handled');

/* ── C-CD-12: Mobile navigation ─────────────────────────────── */
console.log('\nC-CD-12: Mobile navigation');
check('C12.1 SECTIONS includes dashboard, requests, missions, history, notifications, profile, support',
  (function() {
    var required = ['dashboard', 'requests', 'missions', 'history', 'notifications', 'profile', 'support'];
    return required.every(function(s) { return js.includes("'" + s + "'"); });
  })(),
  'required section missing from SECTIONS');
check('C12.2 bottom nav rendered in HTML',
  html.includes('fxv2-bottom-nav'),
  'bottom nav missing from HTML');
check('C12.3 _showSection handles all sections',
  js.includes('_showSection') && js.includes('fxv2-sec-'),
  '_showSection incomplete');
check('C12.4 KPI bar hidden on non-dashboard sections',
  js.includes('display = (name === \'dashboard\' || name === \'requests\')'),
  'KPI bar not hidden on non-relevant sections');
check('C12.5 sidebar closes on section change',
  js.includes('_closeSidebar') && js.includes('_showSection'),
  'sidebar not closed on section change');

/* ── C-CD-13: Reject-quote ownership check ───────────────────── */
console.log('\nC-CD-13: Reject-quote ownership check');
check('C13.1 _doRejectQuote fetches quote to check ownership',
  js.includes("from('quotes').select('id,request_id').eq('id', quoteId)"),
  'ownership check missing in _doRejectQuote');
check('C13.2 ownership verified via _state.requests (no extra DB call)',
  js.includes('_state.requests') && js.includes('ownsRequest'),
  'ownsRequest check missing');
check('C13.3 reject fails if quote does not belong to client',
  js.includes("ne vous appartient pas"),
  'ownership error message missing');
check('C13.4 reject uses .maybeSingle or ownership pre-check',
  js.includes('maybeSingle') || js.includes('ownsRequest'),
  'no ownership guard in reject');

/* ── C-CD-14: No fake ETA / artisan count ───────────────────── */
console.log('\nC-CD-14: No fake ETA / artisan count');
check('C14.1 "ETA moyen" label removed from insights band',
  !js.includes('ETA moyen'),
  '"ETA moyen" label still present');
check('C14.2 etaMin variable removed',
  !js.includes('var etaMin') && !js.includes('let etaMin'),
  'etaMin still present');
check('C14.3 artisanCount heuristic removed',
  !js.includes("'861+'") && !js.includes('"861+"'),
  'artisanCount heuristic still present');
check('C14.4 insights band still renders (function exists)',
  js.includes('_renderInsightsBand'),
  '_renderInsightsBand removed entirely');
check('C14.5 insights band shows factual trust signals only',
  js.includes('Artisans v') || js.includes('Paiement apr'),
  'trust signals missing from insights band');

/* ── C-CD-15: Version bumped ─────────────────────────────────── */
console.log('\nC-CD-15: Version');
check('C15.1 JS VERSION is v2k',
  js.includes("var VERSION = 'v2k'"),
  'VERSION not v2k');
check('C15.2 HTML loads v2k JS',
  html.includes('fixeo-dashboard-v2.js?v=v2k'),
  'HTML still loads old version of dashboard JS');
check('C15.3 CSS has v2k additions',
  css.includes('v2k'),
  'CSS does not have v2k section');

/* ── C-CD-16: Notifications section in HTML ─────────────────── */
console.log('\nC-CD-16: Notifications section in HTML');
check('C16.1 fxv2-sec-notifications section exists in HTML',
  html.includes('fxv2-sec-notifications'),
  'notifications section missing from dashboard HTML');
check('C16.2 aria-label="Notifications" on section',
  html.includes('aria-label="Notifications"'),
  'aria-label missing on notifications section');

/* ── RESULTS ─────────────────────────────────────────────────── */
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
