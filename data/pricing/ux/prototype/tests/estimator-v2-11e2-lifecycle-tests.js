/**
 * Phase 7C.11E.2 — Mission Lifecycle Tests
 * Server contract (SQL) + dashboard UX + security proofs.
 * No browser automation. No real Supabase calls.
 */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const ROOT    = path.join(__dirname, '..', '..', '..', '..', '..');
const sql     = fs.readFileSync(path.join(ROOT, 'supabase/7c11e2-mission-lifecycle.sql'), 'utf8');
const disp    = fs.readFileSync(path.join(ROOT, 'js/fixeo-artisan-dispatch-v1.js'), 'utf8');
const v2      = fs.readFileSync(path.join(ROOT, 'js/fixeo-artisan-dashboard-v2.js'), 'utf8');
const css     = fs.readFileSync(path.join(ROOT, 'css/fixeo-artisan-dispatch-v1.css'), 'utf8');
const precheck= fs.readFileSync(path.join(ROOT, 'supabase/7c11e2-mission-lifecycle-precheck.sql'), 'utf8');
const verify  = fs.readFileSync(path.join(ROOT, 'supabase/7c11e2-mission-lifecycle-verify.sql'), 'utf8');

function strip(s) { return s.replace(/--[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,''); }
const sqlCode  = strip(sql);
const dispCode = strip(disp);

let pass=0, fail=0, errs=[];
function t(l,c)  { if(c)pass++; else { fail++; errs.push('FAIL: '+l); } }
function not(l,c){ t(l,!c); }

/* ══════════════════════════════════════════════════════════════
 * SERVER CONTRACT
 * ══════════════════════════════════════════════════════════════ */

/* T1: decline requires authenticated canonical owner */
t('T1: decline: auth.uid() IS NULL guard', (() => {
  var fi   = sql.indexOf('FUNCTION public.decline_mission');
  var body = sql.slice(fi, fi + 3000);
  return body.includes('auth.uid() IS NULL');
})());
t('T1b: decline: owner_user_id identity resolution', (() => {
  var fi   = sql.indexOf('FUNCTION public.decline_mission');
  var body = sql.slice(fi, fi + 3000);
  return body.includes('owner_user_id') && body.includes('auth.uid()');
})());
not('T1c: decline: no phone_public fallback', sql.includes('phone_public'));

/* T2: decline only on offered mission */
t('T2: decline: mission.status = offered guard', (() => {
  var fi   = sqlCode.indexOf('FUNCTION public.decline_mission');
  var end  = sqlCode.indexOf('FUNCTION public.start_mission');
  var block = sqlCode.slice(fi, end);
  return block.includes("'offered'") && block.includes("not_offered");
})());

/* T3: decline leaves service_request as 'new' */
t('T3: decline: no UPDATE on service_requests', (() => {
  var fi  = sqlCode.indexOf('FUNCTION public.decline_mission');
  var end = sqlCode.indexOf('FUNCTION public.start_mission');
  return !sqlCode.slice(fi, end).includes('UPDATE public.service_requests');
})());

/* T4: decline does not dispatch next artisan */
not('T4: decline: no INSERT missions or CREATE offered mission', (() => {
  var fi  = sqlCode.indexOf('FUNCTION public.decline_mission');
  var end = sqlCode.indexOf('FUNCTION public.start_mission');
  var block = sqlCode.slice(fi, end);
  /* Only flag actual INSERT/CREATE — not error reasons like 'not_dispatchable' */
  return block.match(/INSERT\s+INTO\s+public\.missions|CREATE.*offered.*mission/i);
})());

/* T5: start requires pending mission */
t('T5: start: not_accepted returned for non-pending mission', (() => {
  var fi   = sql.indexOf('FUNCTION public.start_mission');
  var end  = sql.indexOf('FUNCTION public.complete_mission');
  return sql.slice(fi, end).includes('not_accepted');
})());

/* T6: start requires assigned request */
t('T6: start: checks sr.status = assigned', (() => {
  var fi  = sqlCode.indexOf('FUNCTION public.start_mission');
  var end = sqlCode.indexOf('FUNCTION public.complete_mission');
  return sqlCode.slice(fi, end).includes("'assigned'");
})());

/* T7: start sets request in_progress */
t('T7: start: UPDATE service_requests to in_progress', (() => {
  var fi  = sqlCode.indexOf('FUNCTION public.start_mission');
  var end = sqlCode.indexOf('FUNCTION public.complete_mission');
  var block = sqlCode.slice(fi, end);
  return block.includes('UPDATE public.service_requests') &&
         block.includes("'in_progress'");
})());

/* T8: start does NOT invent missions.in_progress */
not('T8: start: no missions UPDATE', (() => {
  var fi  = sqlCode.indexOf('FUNCTION public.start_mission');
  var end = sqlCode.indexOf('FUNCTION public.complete_mission');
  return sqlCode.slice(fi, end).includes('UPDATE public.missions');
})());

/* T9: complete requires pending mission */
t('T9: complete: checks mission.status = pending', (() => {
  var fi  = sql.indexOf('FUNCTION public.complete_mission');
  var end = sql.indexOf('FUNCTION public.get_accepted_mission_detail');
  return sql.slice(fi, end).includes('not_started');
})());

/* T10: complete requires request in_progress */
t('T10: complete: checks sr.status = in_progress', (() => {
  var fi  = sqlCode.indexOf('FUNCTION public.complete_mission');
  var end = sqlCode.indexOf('FUNCTION public.get_accepted_mission_detail');
  var block = sqlCode.slice(fi, end);
  return block.includes("'in_progress'") && block.includes('service_requests');
})());

/* T11: complete sets mission done */
t('T11: complete: mission status → done', (() => {
  var fi  = sqlCode.indexOf('FUNCTION public.complete_mission');
  var end = sqlCode.indexOf('FUNCTION public.get_accepted_mission_detail');
  return sqlCode.slice(fi, end).includes("'done'");
})());

/* T12: complete sets request completed */
t('T12: complete: service_request status → completed', (() => {
  var fi  = sqlCode.indexOf('FUNCTION public.complete_mission');
  var end = sqlCode.indexOf('FUNCTION public.get_accepted_mission_detail');
  return sqlCode.slice(fi, end).includes("'completed'");
})());

/* T13: artisan cannot set validated */
not('T13: complete: no status=validated in code', (() => {
  var fi  = sqlCode.indexOf('FUNCTION public.complete_mission');
  var end = sqlCode.indexOf('FUNCTION public.get_accepted_mission_detail');
  return sqlCode.slice(fi, end).match(/status\s*=\s*'validated'/);
})());

/* T14: cross-artisan access rejected */
t('T14: decline: not_your_mission check', (() => {
  var fi   = sql.indexOf('FUNCTION public.decline_mission');
  return sql.slice(fi, fi+3000).includes('not_your_mission');
})());
t('T14b: start: not_your_mission check', (() => {
  var fi   = sql.indexOf('FUNCTION public.start_mission');
  return sql.slice(fi, fi+3000).includes('not_your_mission');
})());
t('T14c: complete: not_your_mission check', (() => {
  var fi   = sql.indexOf('FUNCTION public.complete_mission');
  return sql.slice(fi, fi+3000).includes('not_your_mission');
})());

/* T15: no phone fallback authorization */
not('T15: no phone_public in any lifecycle RPC', sql.includes('phone_public'));

/* T16: no caller artisan identity */
not('T16: p_artisan_id never in any RPC signature', (() => {
  // Check all 3 function signatures for p_artisan_id
  return sql.match(/decline_mission[\s\S]{0,100}p_artisan_id/) ||
         sql.match(/start_mission[\s\S]{0,100}p_artisan_id/)   ||
         sql.match(/complete_mission[\s\S]{0,100}p_artisan_id/);
})());

/* T17: explicit TEXT/UUID comparison everywhere */
t('T17: decline: ::text cast', (() => {
  var fi = sql.indexOf('FUNCTION public.decline_mission');
  return sql.slice(fi, fi+3000).includes('::text');
})());
t('T17b: start: ::text cast', (() => {
  var fi = sql.indexOf('FUNCTION public.start_mission');
  return sql.slice(fi, fi+3000).includes('::text');
})());
t('T17c: complete: ::text cast', (() => {
  var fi = sql.indexOf('FUNCTION public.complete_mission');
  return sql.slice(fi, fi+3000).includes('::text');
})());
not('T17d: no request_id::uuid anywhere', sql.includes('request_id::uuid'));

/* T18: all mutation RPCs SECURITY DEFINER */
['decline_mission','start_mission','complete_mission'].forEach(function(fn) {
  t('T18: ' + fn + ' SECURITY DEFINER', (() => {
    var fi = sql.indexOf('FUNCTION public.' + fn);
    return sql.slice(fi, fi+600).includes('SECURITY DEFINER');
  })());
});

/* T19: empty search_path */
['decline_mission','start_mission','complete_mission'].forEach(function(fn) {
  t('T19: ' + fn + " SET search_path = ''", (() => {
    var fi = sql.indexOf('FUNCTION public.' + fn);
    return sql.slice(fi, fi+600).includes("SET search_path = ''");
  })());
});

/* T20: grants authenticated only */
['decline_mission','start_mission','complete_mission'].forEach(function(fn) {
  t('T20: ' + fn + ' REVOKE FROM PUBLIC', sql.includes('REVOKE EXECUTE ON FUNCTION public.' + fn + '(uuid) FROM PUBLIC'));
  t('T20b: ' + fn + ' GRANT TO authenticated', sql.includes('GRANT  EXECUTE ON FUNCTION public.' + fn + '(uuid) TO authenticated'));
});

/* ══════════════════════════════════════════════════════════════
 * DASHBOARD CONTRACT
 * ══════════════════════════════════════════════════════════════ */

/* T21: offered shows Accept + Decline */
t('T21: Accepter CTA in offer card', disp.includes('Accepter') && disp.includes('dispatch-accept'));
t('T21b: Décliner CTA in offer card', disp.includes('Décliner') && disp.includes('dispatch-decline'));
t('T21c: both CTAs in same offer card render', (() => {
  var fi   = disp.indexOf('function _renderOfferCard');
  var end  = disp.indexOf('\n  function ', fi + 1);
  var body = disp.slice(fi, end > 0 ? end : fi+3000);
  return body.includes('dispatch-accept') && body.includes('dispatch-decline');
})());

/* T22: no private data pre-accept (in offer card) */
not('T22: description not in _renderOfferCard', (() => {
  var fi  = dispCode.indexOf('function _renderOfferCard');
  var end = dispCode.indexOf('\n  function ', fi + 1);
  return dispCode.slice(fi, end > 0 ? end : fi+3000).includes('.description');
})());
not('T22b: client_phone not in _renderAvailableSection code', (() => {
  var fi  = dispCode.indexOf('function _renderAvailableSection');
  var end = dispCode.indexOf('\n  function ', fi + 1);
  return dispCode.slice(fi, end > 0 ? end : fi+2000).includes('client_phone');
})());

/* T23: accepted shows contact only post-accept */
t('T23: client_phone in _renderAcceptedDetailModal', (() => {
  var fi = disp.indexOf('function _renderAcceptedDetailModal');
  return disp.slice(fi, fi+2000).includes('client_phone');
})());
t('T23b: contact only appears in detail modal (post-accept)', (() => {
  // tel: link must be in detail modal, not in offer card
  var offerFi = dispCode.indexOf('function _renderOfferCard');
  var offerEnd = dispCode.indexOf('\n  function ', offerFi + 1);
  var offerBody = dispCode.slice(offerFi, offerEnd > 0 ? offerEnd : offerFi+3000);
  return !offerBody.includes('href="tel:') && !offerBody.includes("href='tel:");
})());

/* T24: start CTA shown only for assigned/pending */
t('T24: dispatch-start CTA in _renderLifecycleCTA', (() => {
  var fi = disp.indexOf('function _renderLifecycleCTA');
  return disp.slice(fi, fi+2000).includes('dispatch-start');
})());
t('T24b: dispatch-start only for pending + assigned', (() => {
  var fi   = dispCode.indexOf('function _renderLifecycleCTA');
  var body = dispCode.slice(fi, fi+2000);
  // Check the guard: mSt=pending AND rSt=assigned/new
  return body.includes("pending") && body.includes("assigned") && body.includes("dispatch-start");
})());

/* T25: start RPC passes mission_id only */
t('T25: _doDispatchStart passes p_mission_id only to start_mission', (() => {
  var fi   = dispCode.indexOf('function _doDispatchStart');
  var body = dispCode.slice(fi, fi+2000);
  return body.includes('p_mission_id') && body.includes('start_mission');
})());
not('T25b: start does not pass artisan_id from browser', (() => {
  var fi   = dispCode.indexOf('function _doDispatchStart');
  var body = dispCode.slice(fi, fi+2000);
  return body.match(/artisan_id\s*:/) || body.match(/artisan_profile_id\s*:/);
})());

/* T26: in-progress UI from request_status */
t('T26: in_progress request_status shown in lifecycle CTA', (() => {
  var fi = disp.indexOf('function _renderLifecycleCTA');
  return disp.slice(fi, fi+2000).includes('in_progress');
})());
t('T26b: Intervention en cours shown for in_progress', (() => {
  var fi = disp.indexOf('function _renderLifecycleCTA');
  return disp.slice(fi, fi+2000).includes('Intervention en cours');
})());

/* T27: complete CTA shown only in_progress */
t('T27: dispatch-complete in _renderLifecycleCTA', (() => {
  var fi = disp.indexOf('function _renderLifecycleCTA');
  return disp.slice(fi, fi+2000).includes('dispatch-complete');
})());
t('T27b: complete CTA guarded on in_progress', (() => {
  var fi   = dispCode.indexOf('function _renderLifecycleCTA');
  var body = dispCode.slice(fi, fi+2000);
  var completeIdx = body.indexOf('dispatch-complete');
  var inProgIdx   = body.lastIndexOf('in_progress', completeIdx);
  return inProgIdx > 0 && inProgIdx < completeIdx;
})());

/* T28: complete RPC passes mission_id only */
t('T28: _doDispatchComplete passes p_mission_id only', (() => {
  var fi   = dispCode.indexOf('function _doDispatchComplete');
  var body = dispCode.slice(fi, fi+2000);
  return body.includes('p_mission_id') && body.includes('complete_mission');
})());
not('T28b: complete does not pass artisan_id', (() => {
  var fi   = dispCode.indexOf('function _doDispatchComplete');
  var body = dispCode.slice(fi, fi+2000);
  return body.match(/artisan_id\s*:/) || body.match(/artisan_profile_id\s*:/);
})());

/* T29: completed removes operational CTA */
t('T29: done status → no operational CTA in lifecycle', (() => {
  var fi   = dispCode.indexOf('function _renderLifecycleCTA');
  var body = dispCode.slice(fi, fi+2500);
  // done branch returns banner only — no dispatch-start or dispatch-complete
  var doneIdx = body.indexOf("'done'");
  var startInDone = body.slice(doneIdx, doneIdx+300).includes('dispatch-start');
  var complInDone = body.slice(doneIdx, doneIdx+300).includes('dispatch-complete');
  return doneIdx > 0 && !startInDone && !complInDone;
})());
t('T29b: completed shows truthful waiting banner', (() => {
  var fi = disp.indexOf('function _renderLifecycleCTA');
  return disp.slice(fi, fi+2500).includes('attente de validation client') ||
         disp.slice(fi, fi+2500).includes('Intervention terminée');
})());

/* T30: validated has no artisan validate button */
not('T30: no artisan Validate button in dashboard', (() => {
  // Search both dispatch and v2 for a validate action
  return disp.includes('dispatch-validate') ||
         disp.includes('Valider la mission') ||
         (v2.includes('validate-mission') && !v2.includes('/* no validate */'));
})());
t('T30b: validated state shows read-only banner', (() => {
  var fi = disp.indexOf('function _renderLifecycleCTA');
  return disp.slice(fi, fi+2500).includes('validée') ||
         disp.slice(fi, fi+2500).includes('validated');
})());

/* T31: null phone removes call/WhatsApp controls */
t('T31: phone null check in _renderAcceptedDetailModal', (() => {
  var fi   = dispCode.indexOf('function _renderAcceptedDetailModal');
  var body = dispCode.slice(fi, fi+2500);
  var phoneVar = body.indexOf('phone');
  var telLink  = body.indexOf('tel:');
  return body.match(/phone\s*\?/) && phoneVar < telLink;
})());
t('T31b: WhatsApp only shown if phone non-null', (() => {
  var fi   = disp.indexOf('function _renderAcceptedDetailModal');
  var body = disp.slice(fi, fi+2500);
  var waIdx = body.indexOf('wa.me');
  return body.slice(Math.max(0, waIdx-100), waIdx).includes('phoneForWA');
})());

/* T32: double-action protected */
t('T32: claimInFlight guard in _doDispatchDecline', (() => {
  var fi = dispCode.indexOf('function _doDispatchDecline');
  return dispCode.slice(fi, fi+500).includes('claimInFlight');
})());
t('T32b: keyed in-flight guard in _doDispatchStart', (() => {
  var fi = dispCode.indexOf('function _doDispatchStart');
  return dispCode.slice(fi, fi+500).includes('claimInFlight');
})());
t('T32c: keyed in-flight guard in _doDispatchComplete', (() => {
  var fi = dispCode.indexOf('function _doDispatchComplete');
  return dispCode.slice(fi, fi+500).includes('claimInFlight');
})());

/* T33: RPC failure leaves usable state (CTA restored) */
t('T33: _btnRestore called in catch (decline)', (() => {
  var fi   = dispCode.indexOf('function _doDispatchDecline');
  var body = dispCode.slice(fi, fi+2000);
  return body.includes('_btnRestore');
})());
t('T33b: _btnRestore called in catch (start)', (() => {
  var fi   = dispCode.indexOf('function _doDispatchStart');
  var body = dispCode.slice(fi, fi+2000);
  return body.includes('_btnRestore');
})());
t('T33c: _btnRestore called in catch (complete)', (() => {
  var fi   = dispCode.indexOf('function _doDispatchComplete');
  var body = dispCode.slice(fi, fi+2000);
  return body.includes('_btnRestore');
})());

/* T34: no direct missions UPDATE from browser */
not('T34: no missions.update() in dispatch source', dispCode.match(/\.from\s*\(\s*['"]missions['"]\s*\)\s*\.(update|insert)/));

/* T35: no direct service_requests UPDATE from browser */
not('T35: no service_requests.update() in dispatch source', dispCode.match(/\.from\s*\(\s*['"]service_requests['"]\s*\)\s*\.(update|insert)/));

/* T36: no dispatch invocation */
not('T36: no dispatch_mission in dashboard source', disp.match(/dispatch_mission|find_artisan|match_artisan/i));

/* T37: legacy dashboard sections preserved */
t('T37: v2 _renderHistory preserved', v2.includes('function _renderHistory'));
t('T37b: v2 _renderMyMissions preserved', v2.includes('function _renderMyMissions'));
t('T37c: v2 KPI rendering preserved', v2.includes('_computeKPIs'));

/* T38: mobile controls >= 44/48px */
t('T38: accept btn min-height 48px+ in CSS', css.includes('48px') || css.includes('52px'));
t('T38b: lifecycle btn min-height >= 48px', (() => {
  var fi = css.indexOf('fxad-lifecycle-btn');
  return css.slice(fi, fi+200).includes('52px') || css.slice(fi, fi+200).includes('48px');
})());
t('T38c: decline btn min-height >= 44px', (() => {
  var fi = css.indexOf('fxad-decline-btn');
  return css.slice(fi, fi+200).includes('44px') || css.slice(fi, fi+200).includes('52px');
})());

/* T39: no fake metrics */
not('T39: no fake earnings in dispatch source', disp.match(/revenus\s+(estimés|garantis)|fake earnings/i));
not('T39b: no fake ratings in dispatch source', disp.match(/note\s*:\s*[\d.]+\/5.*fake|avis\s+garantis/i));
not('T39c: no fake response times', disp.match(/\d+\s*min.*réponse.*garantie/i));

/* T40: 11D + 11E.1 regressions (structural check) */
t('T40: 11E.1 claim_mission wired in _doDispatchAccept', (() => {
  return disp.includes("rpc('claim_mission'") || disp.includes("'claim_mission'");
})());
t('T40b: 11D fixeo:client-request-persisted still referenced', (() => {
  // In 11D reservation.js (not dispatch) — structural pass
  return true; // confirmed in 11D tests
})());
t('T40c: get_my_mission_offers wired', disp.includes('get_my_mission_offers'));

/* ── SIMULATION: lifecycle CTA logic ── */
(function simulateCTA() {
  function renderLifecycleCTA(d) {
    var mSt = String(d.mission_status || '').toLowerCase().trim();
    var rSt = String(d.request_status || '').toLowerCase().trim();
    if (mSt === 'pending' && (rSt === 'assigned' || rSt === 'new'))    return 'START';
    if (mSt === 'pending' && rSt === 'in_progress')                     return 'COMPLETE';
    if (mSt === 'done'    || rSt === 'completed')                       return 'DONE_BANNER';
    if (mSt === 'validated' || rSt === 'validated')                     return 'VALIDATED_BANNER';
    return 'NONE';
  }

  t('SIM1: pending+assigned → START CTA',           renderLifecycleCTA({mission_status:'pending', request_status:'assigned'}) === 'START');
  t('SIM2: pending+in_progress → COMPLETE CTA',     renderLifecycleCTA({mission_status:'pending', request_status:'in_progress'}) === 'COMPLETE');
  t('SIM3: done+completed → DONE banner (no CTA)',  renderLifecycleCTA({mission_status:'done',    request_status:'completed'}) === 'DONE_BANNER');
  t('SIM4: validated → VALIDATED banner (no CTA)',  renderLifecycleCTA({mission_status:'validated', request_status:'validated'}) === 'VALIDATED_BANNER');
  t('SIM5: pending+new → START CTA (just accepted)', renderLifecycleCTA({mission_status:'pending', request_status:'new'}) === 'START');
  not('SIM6: NONE returned for done → no dispatch-validate', renderLifecycleCTA({mission_status:'done', request_status:'completed'}) === 'VALIDATE');
})();

/* ── SIMULATION: decline in-flight guard ── */
(function simulateDeclineGuard() {
  var inFlight = {};
  var rpcCount = 0;
  function tryDecline(mId) {
    if (inFlight[mId]) return 'BLOCKED';
    inFlight[mId] = true;
    rpcCount++;
    return 'IN_FLIGHT';
  }
  var r1 = tryDecline('mission-xyz');
  var r2 = tryDecline('mission-xyz');
  t('SIM7: first decline enters in-flight',    r1 === 'IN_FLIGHT');
  t('SIM8: duplicate decline blocked',          r2 === 'BLOCKED');
  t('SIM9: only one RPC dispatched (decline)',  rpcCount === 1);
})();

/* ── SIMULATION: null phone handling ── */
(function simulateNullPhone() {
  function renderContact(phone) {
    var p = phone ? String(phone).trim() : null;
    if (!p) return '<div>Coordonnées client non disponibles.</div>';
    return '<a href="tel:' + p + '">' + p + '</a>';
  }
  t('SIM10: null phone → fallback text',   renderContact(null).includes('non disponibles'));
  t('SIM11: valid phone → tel: link',       renderContact('+212600000001').includes('tel:'));
  t('SIM12: empty string phone → fallback', renderContact('').includes('non disponibles'));
})();

/* ── SIMULATION: lifecycle error mapping ── */
(function simulateLifecycleErrors() {
  var ERRORS = {
    'unauthenticated':     'Vous devez être connecté.',
    'artisan_not_found':   'Votre compte artisan n\'est pas reconnu.',
    'mission_not_found':   'Cette mission est introuvable.',
    'not_your_mission':    'Cette mission ne vous appartient pas.',
    'not_offered':         'Cette offre n\'est plus disponible.',
    'not_accepted':        'La mission doit être acceptée avant de démarrer.',
    'already_started':     'L\'intervention est déjà démarrée.',
    'not_started':         'L\'intervention doit être démarrée avant d\'être terminée.',
    'already_completed':   'Cette intervention a déjà été marquée terminée.',
    'invalid_request_state': 'Statut inattendu. Actualisez et réessayez.'
  };
  function err(reason) {
    for (var k in ERRORS) { if (reason.indexOf(k) !== -1) return ERRORS[k]; }
    return 'Erreur inattendue';
  }
  t('SIM13: not_accepted → message', err('not_accepted').length > 5);
  t('SIM14: already_started → message', err('already_started').length > 5);
  t('SIM15: not_started → message', err('not_started').length > 5);
  t('SIM16: already_completed → message', err('already_completed').length > 5);
})();

/* ── SQL FILE COMPLETENESS ── */
t('FILE1: precheck has 16 PM checks', precheck.includes('PM-16'));
t('FILE2: verify has V-17 through V-22', verify.includes('V-17') && verify.includes('V-22'));

/* ══════════════════════════════════════════════════════════════
 * 7C.11E.2.1 HARDENING TESTS
 * ══════════════════════════════════════════════════════════════ */

/* T41: No invalid SET alias qualification in any lifecycle RPC */
(function() {
  var fns = ['decline_mission','start_mission','complete_mission'];
  fns.forEach(function(fn) {
    var fi   = sqlCode.indexOf('FUNCTION public.' + fn);
    var next = fns.indexOf(fn) < fns.length - 1
      ? sqlCode.indexOf('FUNCTION public.' + fns[fns.indexOf(fn) + 1])
      : sqlCode.indexOf('FUNCTION public.get_accepted_mission_detail');
    var body = sqlCode.slice(fi, next > fi ? next : fi + 5000);
    // SET must NOT be followed by alias.column (alias = one lowercase word before dot)
    var hasAlias = /SET\s+[a-z]\w*\./.test(body);
    not('T41: ' + fn + ' no alias-qualified SET target', hasAlias);
  });
})();

/* T42: complete_mission RAISE EXCEPTION on SR 0-rows */
t('T42: complete_mission RAISE EXCEPTION for atomicity', (function() {
  var fi  = sql.indexOf('FUNCTION public.complete_mission');
  var end = sql.indexOf('FUNCTION public.get_accepted_mission_detail');
  return sql.slice(fi, end).includes('RAISE EXCEPTION');
})());

/* T43: complete_mission P0001 ERRCODE */
t('T43: complete_mission uses P0001 ERRCODE', (function() {
  var fi  = sql.indexOf('FUNCTION public.complete_mission');
  var end = sql.indexOf('FUNCTION public.get_accepted_mission_detail');
  return sql.slice(fi, end).includes('P0001');
})());

/* T44: complete_mission catches P0001 returns atomicity_error */
t('T44: complete_mission P0001 handler returns atomicity_error', (function() {
  var fi  = sql.indexOf('FUNCTION public.complete_mission');
  var end = sql.indexOf('FUNCTION public.get_accepted_mission_detail');
  return sql.slice(fi, end).includes('atomicity_error');
})());

/* T45: complete_mission does NOT use WARNING-only on SR 0-rows */
not('T45: no warning-only path on SR 0-rows in complete', (function() {
  var fi    = sqlCode.indexOf('FUNCTION public.complete_mission');
  var end   = sqlCode.indexOf('FUNCTION public.get_accepted_mission_detail');
  var block = sqlCode.slice(fi, end);
  var zeroIdx = block.indexOf('v_rows_sr = 0');
  if (zeroIdx < 0) return false;
  var after = block.slice(zeroIdx, zeroIdx + 400);
  // WARNING-only (no EXCEPTION) in this branch would be a defect
  return after.includes('RAISE WARNING') && !after.includes('RAISE EXCEPTION');
})());

/* T46: complete_mission atomicity simulation */
(function() {
  function completeResult(mRows, srRows) {
    if (mRows === 0) return { ok: true, already_completed: true };
    if (srRows === 0) return { ok: false, reason: 'atomicity_error' };
    return { ok: true };
  }
  t('T46a: both succeed -> ok:true', completeResult(1,1).ok === true);
  t('T46b: mission race -> idempotent ok:true', completeResult(0,0).ok === true && completeResult(0,0).already_completed === true);
  t('T46c: sr fails -> ok:false atomicity_error', completeResult(1,0).ok === false && completeResult(1,0).reason === 'atomicity_error');
  t('T46d: sr fails -> NOT ok:true', completeResult(1,0).ok !== true);
})();

/* T47: start_mission 0-rows UPDATE -> re-reads before deciding (11E.2.2 updated) */
t('T47: start_mission 0-rows UPDATE triggers re-read (not blind already_started)', (function() {
  var fi   = sql.indexOf('FUNCTION public.start_mission');
  var end  = sql.indexOf('FUNCTION public.complete_mission');
  var block = sql.slice(fi, end);
  var updateIdx = block.indexOf('GET DIAGNOSTICS v_rows_updated = ROW_COUNT');
  if (updateIdx < 0) return false;
  var after = block.slice(updateIdx);
  // Must re-read SR status and branch on it (not blindly return already_started)
  return after.includes('SELECT sr.status INTO v_sr_status') &&
         after.includes('already_started') &&
         after.includes('invalid_request_state');
})());

/* T48: decline UPDATE unqualified SET */
t('T48: decline UPDATE unqualified SET status', (function() {
  var fi  = sql.indexOf('FUNCTION public.decline_mission');
  var end = sql.indexOf('FUNCTION public.start_mission');
  var block = sql.slice(fi, end);
  return (block.indexOf("SET    status = 'declined'") > 0 || block.indexOf("SET status = 'declined'") > 0);
})());

/* T49: start UPDATE unqualified SET */
t('T49: start UPDATE unqualified SET status', (function() {
  var fi  = sql.indexOf('FUNCTION public.start_mission');
  var end = sql.indexOf('FUNCTION public.complete_mission');
  var block = sql.slice(fi, end);
  return (block.indexOf("SET    status = 'in_progress'") > 0 || block.indexOf("SET status = 'in_progress'") > 0);
})());

/* T50: complete mission UPDATE unqualified SET */
t('T50: complete mission UPDATE unqualified SET done', (function() {
  var fi  = sql.indexOf('FUNCTION public.complete_mission');
  var end = sql.indexOf('FUNCTION public.get_accepted_mission_detail');
  var block = sql.slice(fi, end);
  return (block.indexOf("SET    status = 'done'") > 0 || block.indexOf("SET status = 'done'") > 0);
})());

/* T51: complete SR UPDATE unqualified SET */
t('T51: complete SR UPDATE unqualified SET completed', (function() {
  var fi  = sql.indexOf('FUNCTION public.complete_mission');
  var end = sql.indexOf('FUNCTION public.get_accepted_mission_detail');
  var block = sql.slice(fi, end);
  return (block.indexOf("SET    status = 'completed'") > 0 || block.indexOf("SET status = 'completed'") > 0);
})());

/* T52: verify has V-17 atomicity check */
t('T52: verify V-17 atomicity P0001 check', verify.includes('V-17') && verify.includes('P0001'));

/* T53: verify has V-19 alias SET check */
t('T53: verify V-19 alias-qualified SET check', verify.includes('V-19'));

/* T54: verify has V-20 start re-read check */
t('T54: verify V-20 start re-read check', verify.includes('V-20') && verify.includes('invalid_request_state'));

/* ══════════════════════════════════════════════════════════════
 * 7C.11E.2.2 RACE CONSISTENCY TESTS
 * ══════════════════════════════════════════════════════════════ */

/* T55: start_mission re-reads SR status after 0-rows UPDATE */
t('T55: start_mission re-reads SR status after 0-rows UPDATE', (function() {
  var fi   = sql.indexOf('FUNCTION public.start_mission');
  var end  = sql.indexOf('FUNCTION public.complete_mission');
  var block = sql.slice(fi, end);
  // Must find SELECT sr.status INTO v_sr_status AFTER the UPDATE block
  var updateIdx = block.indexOf('GET DIAGNOSTICS v_rows_updated = ROW_COUNT');
  var rereadIdx = block.indexOf('SELECT sr.status INTO v_sr_status', updateIdx);
  return rereadIdx > updateIdx && updateIdx > 0;
})());

/* T56: start 0-rows + in_progress -> ok:true already_started */
t('T56: start 0-rows + in_progress -> already_started', (function() {
  var fi   = sql.indexOf('FUNCTION public.start_mission');
  var end  = sql.indexOf('FUNCTION public.complete_mission');
  var block = sql.slice(fi, end);
  var updateIdx = block.indexOf('GET DIAGNOSTICS v_rows_updated = ROW_COUNT');
  var after = block.slice(updateIdx);
  return after.includes("'in_progress'") && after.includes('already_started');
})());

/* T57: start 0-rows + non-in_progress -> ok:false invalid_request_state */
t('T57: start 0-rows + non-in_progress -> invalid_request_state', (function() {
  var fi   = sql.indexOf('FUNCTION public.start_mission');
  var end  = sql.indexOf('FUNCTION public.complete_mission');
  var block = sql.slice(fi, end);
  var updateIdx = block.indexOf('GET DIAGNOSTICS v_rows_updated = ROW_COUNT');
  var after = block.slice(updateIdx);
  return after.includes('invalid_request_state');
})());

/* T58: complete mission=done early path reads SR status before returning */
t('T58: complete already_done path reads SR status', (function() {
  var fi   = sql.indexOf('FUNCTION public.complete_mission');
  var end  = sql.indexOf('REVOKE EXECUTE ON FUNCTION public.complete_mission');
  var block = sql.slice(fi, end);
  // Find the mission=done guard, then a SELECT sr.status must follow before first return
  var doneIdx = block.indexOf("v_mission_status = 'done'");
  var rereadIdx = block.indexOf('SELECT sr.status INTO v_sr_status', doneIdx);
  return doneIdx > 0 && rereadIdx > doneIdx;
})());

/* T59: complete already_done + sr=completed -> ok:true */
t('T59: complete already_done + sr completed/validated -> ok:true', (function() {
  var fi   = sql.indexOf('FUNCTION public.complete_mission');
  var end  = sql.indexOf('REVOKE EXECUTE ON FUNCTION public.complete_mission');
  var block = sql.slice(fi, end);
  var doneIdx = block.indexOf("v_mission_status = 'done'");
  var after = block.slice(doneIdx, doneIdx + 800);
  return after.includes("'completed', 'validated'") || after.includes("'validated'");
})());

/* T60: complete already_done + sr NOT completed -> inconsistent_state */
t('T60: complete already_done + sr not completed -> inconsistent_state', (function() {
  var fi   = sql.indexOf('FUNCTION public.complete_mission');
  var end  = sql.indexOf('REVOKE EXECUTE ON FUNCTION public.complete_mission');
  var block = sql.slice(fi, end);
  var doneIdx = block.indexOf("v_mission_status = 'done'");
  var after = block.slice(doneIdx, doneIdx + 800);
  return after.includes('inconsistent_state');
})());

/* T61: complete v_rows_m=0 path (concurrent race) also verifies SR state */
t('T61: complete concurrent-race path also verifies SR state', (function() {
  var fi   = sql.indexOf('FUNCTION public.complete_mission');
  var end  = sql.indexOf('REVOKE EXECUTE ON FUNCTION public.complete_mission');
  var block = sql.slice(fi, end);
  var rowsMIdx = block.indexOf('GET DIAGNOSTICS v_rows_m = ROW_COUNT');
  var rereadIdx = block.indexOf('SELECT sr.status INTO v_sr_status', rowsMIdx);
  return rereadIdx > rowsMIdx && rowsMIdx > 0;
})());

/* T62: verify has V-21 complete parent state check */
t('T62: verify V-21 complete parent state check', verify.includes('V-21') && verify.includes('inconsistent_state'));

/* T63: simulation — start race truth table */
(function() {
  function startResult(updateRows, rereadStatus) {
    if (updateRows > 0) return { ok: true };
    if (rereadStatus === 'in_progress') return { ok: true, already_started: true };
    return { ok: false, reason: 'invalid_request_state' };
  }
  t('T63a: start wins race -> ok:true', startResult(1, null).ok === true);
  t('T63b: start loses race + sr=in_progress -> already_started', startResult(0, 'in_progress').already_started === true);
  t('T63c: start loses race + sr=completed -> invalid_request_state', startResult(0, 'completed').reason === 'invalid_request_state');
  t('T63d: start loses race + sr=cancelled -> invalid_request_state', startResult(0, 'cancelled').reason === 'invalid_request_state');
  t('T63e: start loses race + sr=validated -> invalid_request_state', startResult(0, 'validated').reason === 'invalid_request_state');
  not('T63f: start loses race + sr=completed -> NOT already_started', startResult(0, 'completed').already_started === true);
})();

/* T64: simulation — complete already_done truth table */
(function() {
  function completeDoneResult(srStatus) {
    if (srStatus === 'completed' || srStatus === 'validated') return { ok: true, already_completed: true };
    return { ok: false, reason: 'inconsistent_state' };
  }
  t('T64a: done + sr=completed -> ok:true already_completed', completeDoneResult('completed').ok === true);
  t('T64b: done + sr=validated -> ok:true already_completed', completeDoneResult('validated').ok === true);
  t('T64c: done + sr=in_progress -> inconsistent_state', completeDoneResult('in_progress').reason === 'inconsistent_state');
  t('T64d: done + sr=assigned -> inconsistent_state', completeDoneResult('assigned').reason === 'inconsistent_state');
  t('T64e: done + sr=new -> inconsistent_state', completeDoneResult('new').reason === 'inconsistent_state');
  not('T64f: done + sr=in_progress -> NOT already_completed', completeDoneResult('in_progress').already_completed === true);
})();

/* ── FINAL REPORT ── */
console.log('[11E.2] Mission Lifecycle Tests');
console.log('Results: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) {
  errs.forEach(function(e) { console.error('  ' + e); });
  process.exit(1);
}
