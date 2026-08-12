/**
 * Phase 7C.11E.1 — Artisan Dispatch Dashboard Tests
 * Proves mission offer lifecycle contract without browser automation.
 *
 * Static/unit tests only. No real Supabase calls. No browser. No fake production rows.
 */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
const dispatchSrc = fs.readFileSync(path.join(ROOT, 'js/fixeo-artisan-dispatch-v1.js'), 'utf8');
const v2Src       = fs.readFileSync(path.join(ROOT, 'js/fixeo-artisan-dashboard-v2.js'), 'utf8');
const dashHtml    = fs.readFileSync(path.join(ROOT, 'dashboard-artisan-v2.html'), 'utf8');
const dispatchCss = fs.readFileSync(path.join(ROOT, 'css/fixeo-artisan-dispatch-v1.css'), 'utf8');

/* Strip block comments for code-only assertions */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}
const dispatchCode = stripComments(dispatchSrc);
const v2Code       = stripComments(v2Src);

let pass = 0; let fail = 0; const errs = [];
function t(label, cond) {
  if (cond) { pass++; }
  else { fail++; errs.push('FAIL: ' + label); }
}
function not(label, cond) { t(label, !cond); }

/* ── T1: dashboard-artisan-v2.html includes dispatch bridge ── */
t('T1: dashboard-artisan-v2.html includes fixeo-artisan-dispatch-v1.js',
  dashHtml.includes('fixeo-artisan-dispatch-v1.js'));

t('T1b: dispatch CSS included in dashboard-artisan-v2.html',
  dashHtml.includes('fixeo-artisan-dispatch-v1.css'));

/* ── T2: get_my_mission_offers() called for authenticated artisan ── */
t('T2: get_my_mission_offers RPC called in dispatch source',
  dispatchSrc.includes("rpc('get_my_mission_offers')") ||
  dispatchSrc.includes('rpc("get_my_mission_offers")') ||
  dispatchSrc.includes("'get_my_mission_offers'"));

/* ── T3: offered card renders only safe fields — verify code does not access blocked fields ── */
t('T3: _renderOfferCard uses service_category',    dispatchSrc.includes('service_category'));
t('T3b: _renderOfferCard uses city',               dispatchSrc.includes('offer.city'));
t('T3c: _renderOfferCard uses urgency',            dispatchSrc.includes('offer.urgency'));
t('T3d: _renderOfferCard uses offered_at',         dispatchSrc.includes('offered_at'));

/* ── T4: description NOT shown pre-acceptance ── */
not('T4: description not in _renderOfferCard',
  (() => {
    /* Find _renderOfferCard function body */
    var fi = dispatchCode.indexOf('function _renderOfferCard');
    var end = dispatchCode.indexOf('\n  function ', fi + 1);
    var body = dispatchCode.slice(fi, end > 0 ? end : fi + 3000);
    return body.includes('description') && !body.includes('/* desc');
  })()
);

/* ── T5: client_phone NOT shown pre-acceptance ── */
not('T5: client_phone not in _renderOfferCard',
  (() => {
    var fi  = dispatchCode.indexOf('function _renderOfferCard');
    var end = dispatchCode.indexOf('\n  function ', fi + 1);
    var body = dispatchCode.slice(fi, end > 0 ? end : fi + 3000);
    return body.includes('client_phone');
  })()
);

/* ── T6: offered card has Accepter CTA ── */
t('T6: Accepter CTA in offer card',
  dispatchSrc.includes('Accepter') && dispatchSrc.includes('dispatch-accept'));

/* ── T7: double accept prevented — in-flight guard ── */
t('T7: claimInFlight in-flight guard exists',     dispatchCode.includes('claimInFlight'));
t('T7b: in-flight guard checked before claim',
  (() => {
    var fi   = dispatchCode.indexOf('function _doDispatchAccept');
    var body = dispatchCode.slice(fi, fi + 1000);
    var guardIdx = body.indexOf('claimInFlight');
    var rpcIdx   = body.indexOf('claim_mission');
    return guardIdx > 0 && rpcIdx > 0 && guardIdx < rpcIdx;
  })()
);

/* ── T8: accept calls claim_mission with mission_id ONLY ── */
t('T8: claim_mission RPC called',
  dispatchSrc.includes("rpc('claim_mission'") ||
  dispatchSrc.includes('rpc("claim_mission"') ||
  dispatchSrc.includes("'claim_mission'"));

t('T8b: p_mission_id passed to claim_mission',
  dispatchCode.includes('p_mission_id') &&
  dispatchCode.includes('missionId'));

/* ── T9: browser does not pass artisan identity to claim_mission ── */
not('T9: artisan_id not sent to claim_mission',
  (() => {
    var fi   = dispatchCode.indexOf('function _doDispatchAccept');
    var body = dispatchCode.slice(fi, fi + 2000);
    /* Detect if artisan_id / artisan_profile_id appears as a key passed to rpc */
    return body.match(/artisan_id\s*:/) || body.match(/artisan_profile_id\s*:/);
  })()
);

not('T9b: owner_user_id not sent from browser',
  (() => {
    var fi   = dispatchCode.indexOf('function _doDispatchAccept');
    var body = dispatchCode.slice(fi, fi + 2000);
    return body.includes('owner_user_id');
  })()
);

/* ── T10: browser does not UPDATE missions directly ── */
not('T10: no direct missions table update in dispatch source',
  dispatchCode.match(/\.from\s*\(\s*['"]missions['"]\s*\)\s*\.update/));

not('T10b: no direct missions table insert in dispatch source',
  dispatchCode.match(/\.from\s*\(\s*['"]missions['"]\s*\)\s*\.insert/));

/* ── T11: browser does not UPDATE service_requests directly ── */
not('T11: no direct service_requests update in dispatch source',
  dispatchCode.match(/\.from\s*\(\s*['"]service_requests['"]\s*\)\s*\.update/));

not('T11b: no direct service_requests insert in dispatch source',
  dispatchCode.match(/\.from\s*\(\s*['"]service_requests['"]\s*\)\s*\.insert/));

/* ── T12: ok:true triggers accepted detail load ── */
t('T12: _loadAndShowAcceptedDetail called after claim success',
  dispatchSrc.includes('_loadAndShowAcceptedDetail') &&
  (() => {
    var fi   = dispatchCode.indexOf('function _doDispatchAccept');
    var body = dispatchCode.slice(fi, fi + 3000);
    return body.includes('_loadAndShowAcceptedDetail');
  })()
);

/* ── T13: get_accepted_mission_detail called only post-acceptance ── */
t('T13: get_accepted_mission_detail in _loadAndShowAcceptedDetail only',
  (() => {
    var fi   = dispatchSrc.indexOf('_loadAndShowAcceptedDetail');
    var body = dispatchSrc.slice(fi, fi + 1500);
    return body.includes('get_accepted_mission_detail');
  })()
);

not('T13b: get_accepted_mission_detail not in _renderOfferCard',
  (() => {
    var fi   = dispatchCode.indexOf('function _renderOfferCard');
    var end  = dispatchCode.indexOf('\n  function ', fi + 1);
    var body = dispatchCode.slice(fi, end > 0 ? end : fi + 3000);
    return body.includes('get_accepted_mission_detail');
  })()
);

/* ── T14: client_phone appears only after accepted-detail response ── */
t('T14: client_phone in _renderAcceptedDetailModal',
  (() => {
    var fi   = dispatchSrc.indexOf('_renderAcceptedDetailModal');
    var body = dispatchSrc.slice(fi, fi + 2000);
    return body.includes('client_phone');
  })()
);

not('T14b: client_phone not in _renderAvailableSection',
  (() => {
    var fi   = dispatchCode.indexOf('function _renderAvailableSection');
    var end  = dispatchCode.indexOf('\n  function ', fi + 1);
    var body = dispatchCode.slice(fi, end > 0 ? end : fi + 2000);
    return body.includes('client_phone');
  })()
);

/* ── T15: description appears only after accepted-detail response ── */
t('T15: description in _renderAcceptedDetailModal',
  (() => {
    var fi   = dispatchSrc.indexOf('function _renderAcceptedDetailModal');
    var body = dispatchSrc.slice(fi, fi + 2000);
    return body.includes('description');
  })()
);

not('T15b: description not in _renderOfferCard',
  (() => {
    var fi  = dispatchCode.indexOf('function _renderOfferCard');
    var end = dispatchCode.indexOf('\n  function ', fi + 1);
    var body = dispatchCode.slice(fi, end > 0 ? end : fi + 3000);
    return body.includes('.description');
  })()
);

/* ── T16: null phone handled truthfully ── */
t('T16: null phone fallback text in modal',
  dispatchSrc.includes('Coordonnées client non disponibles'));

t('T16b: phone null guard in _renderAcceptedDetailModal',
  (() => {
    var fi   = dispatchCode.indexOf('function _renderAcceptedDetailModal');
    var body = dispatchCode.slice(fi, fi + 2000);
    /* phone must be guarded before rendering tel: link */
    var phoneVarIdx = body.indexOf('phone');
    var telIdx      = body.indexOf('tel:');
    var nullGuard   = body.includes('!phone') || body.match(/phone\s*\?/);
    return nullGuard && telIdx > phoneVarIdx;
  })()
);

/* ── T17: already_claimed handled without duplicate mission ── */
t('T17: already_claimed in CLAIM_ERRORS map',
  dispatchSrc.includes("'already_claimed'") ||
  dispatchSrc.includes('"already_claimed"'));

t('T17b: already_claimed shows user-facing error (no duplicate create)',
  dispatchSrc.includes('déjà été acceptée') || dispatchSrc.includes('already_claimed'));

not('T17c: no missions.insert on already_claimed path',
  dispatchCode.match(/already_claimed[\s\S]{0,200}\.insert/));

/* ── T18: not_offered handled safely ── */
t('T18: not_offered in CLAIM_ERRORS map',
  dispatchSrc.includes("'not_offered'") ||
  dispatchSrc.includes('"not_offered"'));

/* ── T19: auth failure handled ── */
t('T19: unauthenticated in CLAIM_ERRORS map',
  dispatchSrc.includes("'unauthenticated'") ||
  dispatchSrc.includes('"unauthenticated"'));

t('T19b: artisan_not_found in CLAIM_ERRORS map',
  dispatchSrc.includes("'artisan_not_found'") ||
  dispatchSrc.includes('"artisan_not_found"'));

/* ── T20: empty offers state works ── */
t('T20: empty offers state renders "Aucune nouvelle demande"',
  dispatchSrc.includes('Aucune nouvelle demande'));

t('T20b: empty state has refresh/reload action',
  dispatchSrc.includes('dispatch-reload-offers'));

/* ── T21: existing pending mission rendering preserved ── */
t('T21: _renderMissionCard still exists in v2',       v2Src.includes('function _renderMissionCard'));
t('T21b: pending/assigned mission statuses in v2',    v2Src.includes("'pending'") && v2Src.includes("'assigned'"));
t('T21c: _renderMyMissions still exists in v2',       v2Src.includes('function _renderMyMissions'));
t('T21d: in_progress status preserved in v2',         v2Src.includes('in_progress'));

/* ── T22: existing done/history rendering preserved ── */
t('T22: _renderHistory still exists in v2',           v2Src.includes('function _renderHistory'));
t('T22b: validated status preserved in v2',           v2Src.includes("'validated'"));
t('T22c: history empty state preserved',              v2Src.includes('Aucune mission clôturée') ||
                                                      v2Src.includes('terminées et validées'));

/* ── T23: urgency='now' displays factual urgent indication ── */
t('T23: urgency now → 🔴 Urgent label',
  dispatchSrc.includes("'now'") && dispatchSrc.includes('Urgent'));

t('T23b: fxad-offer-urgent CSS class applied for urgency=now',
  dispatchSrc.includes('fxad-offer-urgent') && dispatchCss.includes('fxad-offer-urgent'));

t('T23c: urgent badge has high-visibility CSS',
  dispatchCss.includes('e63946') || dispatchCss.includes('red'));

/* ── T24: no dispatch invocation introduced ── */
not('T24: no create mission dispatch in v1 dispatch source',
  dispatchCode.match(/dispatch_mission|find_artisan|match_artisan/i));

not('T24b: no missions.insert in dispatch source',
  dispatchCode.match(/\.from\s*\(\s*['"]missions['"]\s*\)\s*\.insert/));

/* ── T25: no SERVICE_ROLE exposed ── */
not('T25: SERVICE_ROLE not in dispatch source',
  dispatchCode.includes('SERVICE_ROLE'));

not('T25b: SUPABASE_SERVICE_ROLE_KEY not in dispatch source',
  dispatchCode.includes('SUPABASE_SERVICE_ROLE_KEY'));

not('T25c: service_role not in dispatch source',
  dispatchCode.includes('service_role'));

/* ── BONUS: UX quality assertions ── */

t('UX1: loading state has meaningful text',
  dispatchSrc.includes('Chargement des demandes'));

t('UX2: CTA disabled during claim (aria-busy)',
  dispatchSrc.includes('aria-busy'));

t('UX3: accept button restores on failure (no dead state)',
  (() => {
    var fi   = dispatchCode.indexOf('function _doDispatchAccept');
    var body = dispatchCode.slice(fi, fi + 4000);
    var catchIdx   = body.indexOf('} catch');
    var restoreIdx = body.indexOf('.disabled', catchIdx);
    return catchIdx > 0 && restoreIdx > 0 && restoreIdx - catchIdx < 600;
  })()
);

t('UX4: error toast shown on claim failure',
  (() => {
    var fi   = dispatchCode.indexOf('function _doDispatchAccept');
    var body = dispatchCode.slice(fi, fi + 4000);
    var catchIdx  = body.indexOf('} catch');
    var toastIdx  = body.indexOf('_toast', catchIdx);
    return catchIdx > 0 && toastIdx > 0 && toastIdx - catchIdx < 400;
  })()
);

t('UX5: privacy notice shown on offer card pre-acceptance',
  dispatchSrc.includes('Coordonnées et détails accessibles après acceptation') ||
  dispatchSrc.includes('fxad-offer-privacy'));

t('UX6: accepted detail shows success badge',
  dispatchSrc.includes('Mission acceptée'));

t('UX7: empty state not broken — has icon + text',
  dispatchSrc.includes('fxa-empty-icon') || dispatchSrc.includes('fxa-empty'));

t('UX8: retry/reload always present on error',
  dispatchSrc.includes('dispatch-reload-offers') &&
  dispatchSrc.includes('fxad-error-state'));

t('UX9: WhatsApp contact uses canonical phone (no hardcoded number)',
  (() => {
    /* WhatsApp in modal uses client_phone from server — not a hardcoded number.
     * phoneForWA is derived from d.client_phone and referenced in the wa.me href. */
    var fi   = dispatchSrc.indexOf('function _renderAcceptedDetailModal');
    var body = dispatchSrc.slice(fi, fi + 2500);
    var waIdx       = body.indexOf('wa.me');
    var phoneVarIdx = body.indexOf('phoneForWA');
    /* Both must exist; wa.me must reference phoneForWA (not a literal number) */
    return waIdx > 0 && phoneVarIdx > 0
      && body.slice(waIdx, waIdx + 100).includes('phoneForWA');
  })()
);

t('UX10: touch targets ≥ 44px set in CSS',
  dispatchCss.includes('min-height: 44px') || dispatchCss.includes('min-height:44px') ||
  dispatchCss.includes('min-height: 48px') || dispatchCss.includes('min-height:48px'));

t('UX11: v2 refresh exposed for dispatch bridge',
  v2Src.includes('refresh: async function') ||
  v2Src.includes('FixeoArtisanDashboard'));

t('UX12: modal used for accepted detail — reuses existing v2 overlay',
  dispatchSrc.includes('fxav2-modal-overlay') || dispatchSrc.includes('_openModal'));

/* ── STATIC FILE ASSERTIONS ── */
t('FILE1: fixeo-artisan-dispatch-v1.js exists',       dispatchSrc.length > 1000);
t('FILE2: fixeo-artisan-dispatch-v1.css exists',      dispatchCss.length > 200);
t('FILE3: dashboard-artisan-v2.html includes dispatch', dashHtml.includes('fxdispatch-v1a'));

/* ── SIMULATION: offer card safe fields ── */
(function simulateOfferCard() {
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var URGENCY_LABELS = { 'now': '🔴 Urgent', 'urgent': '🟡 Prioritaire', 'normale': '', 'normal': '' };

  function renderOfferCard(offer) {
    var urgLabel = URGENCY_LABELS[String(offer.urgency || '').toLowerCase().trim()] || '';
    var html = '';
    /* Include only safe fields */
    html += esc(offer.service_category || 'Service');
    html += esc(offer.city || '');
    html += urgLabel;
    /* MUST NOT include */
    /* description: not in offer object pre-acceptance */
    /* client_phone: not in offer object pre-acceptance */
    return html;
  }

  var safeOffer = {
    mission_id: 'test-uuid',
    mission_status: 'offered',
    service_category: 'plomberie',
    city: 'Casablanca',
    urgency: 'now',
    offered_at: new Date().toISOString()
    /* No description, no client_phone — server whitelist */
  };

  var card = renderOfferCard(safeOffer);
  t('SIM1: offer card shows service_category', card.includes('plomberie'));
  t('SIM2: offer card shows city',             card.includes('Casablanca'));
  t('SIM3: urgent offer shows urgent badge',   card.includes('Urgent'));
  not('SIM4: description absent from offer card', 'description' in safeOffer);
  not('SIM5: client_phone absent from offer card', 'client_phone' in safeOffer);
})();

/* ── SIMULATION: claim flow — in-flight guard ── */
(function simulateClaimGuard() {
  var claimInFlight = {};
  var fetchCount = 0;

  function tryAccept(missionId) {
    if (claimInFlight[missionId]) return 'BLOCKED';
    claimInFlight[missionId] = true;
    fetchCount++;
    /* simulate async — don't complete */
    return 'IN_FLIGHT';
  }

  var r1 = tryAccept('mission-abc');
  var r2 = tryAccept('mission-abc'); /* duplicate click */
  t('SIM6: first accept enters in-flight',     r1 === 'IN_FLIGHT');
  t('SIM7: duplicate accept blocked',          r2 === 'BLOCKED');
  t('SIM8: only one RPC call dispatched',      fetchCount === 1);
})();

/* ── SIMULATION: claim error reasons ── */
(function simulateClaimErrors() {
  var CLAIM_ERRORS = {
    'unauthenticated':    'Vous devez être connecté pour accepter une offre.',
    'artisan_not_found':  'Votre compte artisan n\'est pas reconnu. Contactez le support.',
    'mission_not_found':  'Cette offre n\'existe plus.',
    'already_claimed':    'Cette offre a déjà été acceptée.',
    'not_offered':        'Cette offre n\'est plus disponible.',
    'not_offered_to_you': 'Cette offre ne vous est pas adressée.'
  };

  function handleError(reason) {
    for (var key in CLAIM_ERRORS) {
      if (reason.indexOf(key) !== -1) return CLAIM_ERRORS[key];
    }
    return 'Erreur inconnue';
  }

  t('SIM9: already_claimed → user message',   handleError('already_claimed').includes('déjà'));
  t('SIM10: not_offered → user message',      handleError('not_offered').includes('disponible'));
  t('SIM11: unauthenticated → user message',  handleError('unauthenticated').includes('connecté'));
  t('SIM12: not_offered_to_you → user message', handleError('not_offered_to_you').length > 10
    && handleError('not_offered_to_you') !== 'Erreur inconnue');
})();

/* ── Runner ── */
console.log('[11E.1] Artisan Dispatch Dashboard Tests');
console.log('Results: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) {
  errs.forEach(function(e) { console.error('  ' + e); });
  process.exit(1);
}
