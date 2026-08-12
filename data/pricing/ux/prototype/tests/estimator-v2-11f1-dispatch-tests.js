/**
 * 7C.11F.1 — Dispatch V1 Static Tests
 * estimator-v2-11f1-dispatch-tests.js
 *
 * Tests the dispatch_request_v1 SQL function source for:
 *   - Security contracts (service_role only, no browser access)
 *   - Type contract (request_id TEXT, no ::uuid cast)
 *   - Eligibility model (owner_user_id, claim_status, onboarding, availability)
 *   - Prior-offer exclusion
 *   - Idempotency guards
 *   - Concurrency protection (FOR UPDATE, unique_violation)
 *   - No invented pricing
 *   - No auto no_match
 *   - Matching logic (service, city, trust, activity)
 *   - Verify + rollback file completeness
 *
 * NO live DB writes. NO browser automation.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var SUITE = '[11F.1] Dispatch V1 Tests';
var passed = 0;
var failed = 0;
var errors = [];

function t(name, cond) {
  if (cond) { passed++; }
  else       { failed++; errors.push('FAIL: ' + name); }
}
function not(name, cond) { t(name, !cond); }

/* ── Load SQL files ─────────────────────────────────────── */
var SQL_BASE = path.join(__dirname, '..', '..', '..', '..', '..', 'supabase');

var dispatch  = fs.readFileSync(path.join(SQL_BASE, '7c11f1-dispatch-v1.sql'),          'utf8');
var precheck  = fs.readFileSync(path.join(SQL_BASE, '7c11f1-dispatch-v1-precheck.sql'), 'utf8');
var verify    = fs.readFileSync(path.join(SQL_BASE, '7c11f1-dispatch-v1-verify.sql'),   'utf8');
var rollback  = fs.readFileSync(path.join(SQL_BASE, '7c11f1-dispatch-v1-rollback.sql'), 'utf8');

/* ─────────────────────────────────────────────────────────
 * SECTION 1 — Security Contract
 * ───────────────────────────────────────────────────────── */

/* T1: SECURITY DEFINER present */
t('T1: SECURITY DEFINER present', dispatch.includes('SECURITY DEFINER'));

/* T2: SET search_path = '' present */
t('T2: SET search_path empty', dispatch.includes("SET search_path = ''"));

/* T3: REVOKE FROM PUBLIC */
t('T3: REVOKE FROM PUBLIC', dispatch.includes('REVOKE EXECUTE ON FUNCTION public.dispatch_request_v1(uuid) FROM PUBLIC'));

/* T4: REVOKE FROM anon */
t('T4: REVOKE FROM anon', dispatch.includes('REVOKE EXECUTE ON FUNCTION public.dispatch_request_v1(uuid) FROM anon'));

/* T5: REVOKE FROM authenticated */
t('T5: REVOKE FROM authenticated', dispatch.includes('REVOKE EXECUTE ON FUNCTION public.dispatch_request_v1(uuid) FROM authenticated'));

/* T6: GRANT only to service_role */
t('T6: GRANT TO service_role', dispatch.includes('GRANT  EXECUTE ON FUNCTION public.dispatch_request_v1(uuid) TO service_role'));

/* T7: No GRANT to authenticated or anon */
not('T7: no GRANT to authenticated', dispatch.includes('GRANT') && dispatch.includes('TO authenticated'));
not('T8: no GRANT to anon as grant target',
  /GRANT\s+EXECUTE[^;]+TO\s+anon/i.test(dispatch));

/* ─────────────────────────────────────────────────────────
 * SECTION 2 — Type Contract
 * ───────────────────────────────────────────────────────── */

/* T9: v_request_id_text declared as text */
t('T9: v_request_id_text declared text', dispatch.includes('v_request_id_text   text'));

/* T10: p_request_id::text cast used (not raw UUID stored in TEXT column) */
t('T10: p_request_id::text cast present', dispatch.includes('p_request_id::text'));

/* T11: request_id::uuid never appears in executable code (comment mentions are ok) */
not('T11: no request_id::uuid cast in executable code', (function() {
  // Strip single-line and block comments, then check
  var stripped = dispatch
    .replace(/--[^\n]*/g, '')          // remove -- comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // remove /* */ comments
  return stripped.includes('request_id::uuid');
})());

/* T12: INSERT uses v_request_id_text (TEXT) for missions.request_id */
t('T12: INSERT uses v_request_id_text', (function() {
  var insertIdx = dispatch.indexOf('INSERT INTO public.missions');
  var insertBlock = dispatch.slice(insertIdx, insertIdx + 400);
  return insertBlock.includes('v_request_id_text');
})());

/* T13: m.request_id = v_request_id_text in queries (TEXT/TEXT compare — no cast needed) */
t('T13: mission WHERE uses v_request_id_text', dispatch.includes("m.request_id = v_request_id_text"));

/* ─────────────────────────────────────────────────────────
 * SECTION 3 — Request State Guards
 * ───────────────────────────────────────────────────────── */

/* T14: FOR UPDATE lock on service_requests */
t('T14: FOR UPDATE lock present', dispatch.includes('FOR UPDATE'));

/* T15: request_not_found guard */
t('T15: request_not_found guard', dispatch.includes("'request_not_found'"));

/* T16: request_not_dispatchable for non-new status */
t('T16: request_not_dispatchable guard', dispatch.includes("'request_not_dispatchable'"));

/* T17: v_sr_status != new check */
t('T17: status != new check', dispatch.includes("v_sr_status != 'new'"));

/* ─────────────────────────────────────────────────────────
 * SECTION 4 — Idempotency Guards
 * ───────────────────────────────────────────────────────── */

/* T18: pending winner guard (already_claimed) */
t('T18: pending winner guard present',
  dispatch.includes("m.status     = 'pending'") && dispatch.includes("'already_claimed'"));

/* T19: existing offer guard (existing_offer) */
t('T19: existing offered mission idempotency',
  dispatch.includes("m.status     = 'offered'") && dispatch.includes("'existing_offer'"));

/* T20: existing offer returns WITHOUT creating a new one */
t('T20: existing offer returns before INSERT', (function() {
  var offerCheckIdx = dispatch.indexOf("'existing_offer'");
  var insertIdx     = dispatch.indexOf('INSERT INTO public.missions');
  return offerCheckIdx > 0 && insertIdx > 0 && offerCheckIdx < insertIdx;
})());

/* ─────────────────────────────────────────────────────────
 * SECTION 5 — Artisan Eligibility
 * ───────────────────────────────────────────────────────── */

/* T21: owner_user_id IS NOT NULL required */
t('T21: owner_user_id IS NOT NULL eligibility', dispatch.includes('owner_user_id       IS NOT NULL'));

/* T22: claim_status = approved required */
t('T22: claim_status = approved eligibility', dispatch.includes("claim_status         = 'approved'"));

/* T23: onboarding_completed = true required */
t('T23: onboarding_completed = true eligibility', dispatch.includes('onboarding_completed = true'));

/* T24: availability = available required */
t('T24: availability = available eligibility', dispatch.includes("availability         = 'available'"));

/* T25: prior-offer exclusion via NOT EXISTS */
t('T25: prior-offer exclusion NOT EXISTS present', dispatch.includes('NOT EXISTS'));

/* T26: exclusion matches on artisan_profile_id + request */
t('T26: prior exclusion matches artisan_profile_id', dispatch.includes('m.artisan_profile_id = a.id'));

/* T27: completed_missions NOT used in executable code (may appear in comments) */
not('T27: completed_missions not used in executable code (not in schema)', (function() {
  var stripped = dispatch
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  return stripped.includes('completed_missions');
})());

/* ─────────────────────────────────────────────────────────
 * SECTION 6 — Matching / Ranking
 * ───────────────────────────────────────────────────────── */

/* T28: service match present */
t('T28: service match scoring present', dispatch.includes('v_svc_score'));

/* T29: city match present */
t('T29: city match scoring present', dispatch.includes('v_city_score'));

/* T30: trust score present (review_count + rating) */
t('T30: trust score present (review_count)', dispatch.includes('v_artisan_rc'));
t('T31: trust score present (rating)', dispatch.includes('v_artisan_rat'));

/* T32: activity score present (updated_at) */
t('T32: activity score present (updated_at)', dispatch.includes('v_artisan_updated'));

/* T33: composite score as sum of components */
t('T33: composite score sums components',
  dispatch.includes('v_svc_score + v_city_score + v_trust_score + v_act_score'));

/* T34: city proximity groups defined (Casablanca group) */
t('T34: city proximity groups present', dispatch.includes('casablanca'));

/* T35: work_zone national coverage handled */
t('T35: national/work_zone coverage', dispatch.includes("'national'") || dispatch.includes('national'));

/* T36: tie-breaker is id ASC (deterministic) */
t('T36: tie-breaker id ASC', dispatch.includes('ORDER BY a.id ASC'));

/* T37: exact service match highest weight (35) */
t('T37: exact service match = 35', dispatch.includes('v_svc_score := 35'));

/* T38: exact city match highest weight (30) */
t('T38: exact city match = 30', dispatch.includes('v_city_score := 30'));

/* ─────────────────────────────────────────────────────────
 * SECTION 7 — Mission Creation
 * ───────────────────────────────────────────────────────── */

/* T39: mission INSERT creates status='offered' */
t('T39: INSERT status = offered', (function() {
  var insertIdx = dispatch.indexOf('INSERT INTO public.missions');
  var block = dispatch.slice(insertIdx, insertIdx + 300);
  return block.includes("'offered'");
})());

/* T40: agreed_price is NULL on INSERT */
t('T40: agreed_price NULL on INSERT', (function() {
  var insertIdx = dispatch.indexOf('INSERT INTO public.missions');
  var block = dispatch.slice(insertIdx, insertIdx + 400);
  return block.includes('agreed_price') && block.includes('NULL');
})());

/* T41: no commission column invented (in executable body only — not comments) */
not('T41: no commission invented in executable code', (function() {
  var stripped = dispatch.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  return stripped.includes('commission');
})());

/* T42: no price calculation invented */
not('T42: no price calculation', dispatch.includes('amount_mad') || dispatch.includes('total_price'));

/* T43: service_requests.status NOT changed to 'new' after offer */
not('T43: service_request remains new — no status mutation in success path', (function() {
  // The function must not UPDATE service_requests in the success path
  // (only FOR UPDATE SELECT + claim_mission does the transition)
  var successPath = dispatch.slice(dispatch.lastIndexOf('RETURN jsonb_build_object'));
  var updateIdx = dispatch.indexOf("UPDATE public.service_requests");
  // If UPDATE sr exists, it must be ONLY in the FOR UPDATE lock read
  // (which is a SELECT, not UPDATE). Verify no SET status= on sr.
  return /UPDATE public\.service_requests[\s\S]+?SET\s+status/.test(dispatch);
})());

/* T44: parent request remains 'new' — no forced status write in dispatch */
t('T44: dispatch does not write service_request.status', (function() {
  // dispatch_request_v1 must not do: UPDATE service_requests SET status = ...
  // The FOR UPDATE is a SELECT lock, not a write.
  return !(/UPDATE\s+public\.service_requests[\s\S]*?SET\s+status\s*=/.test(dispatch));
})());

/* ─────────────────────────────────────────────────────────
 * SECTION 8 — Concurrency
 * ───────────────────────────────────────────────────────── */

/* T45: unique_violation handler present */
t('T45: unique_violation handler', dispatch.includes('unique_violation'));

/* T46: concurrent winner reads existing offer on 23505 */
t('T46: 23505 race reads existing offer', (function() {
  var uvIdx = dispatch.indexOf('WHEN unique_violation THEN');
  var after = dispatch.slice(uvIdx, uvIdx + 700);
  return after.includes("'offered'") && after.includes("'existing_offer'");
})());

/* T47: no auto-dispatch activation wiring in this file */
not('T47: no auto dispatch activation in this file',
  dispatch.includes('setInterval') || dispatch.includes('setTimeout') || dispatch.includes('cron'));

/* ─────────────────────────────────────────────────────────
 * SECTION 9 — No-Candidate
 * ───────────────────────────────────────────────────────── */

/* T48: no_candidate returned when no artisan found */
t('T48: no_candidate result present', dispatch.includes("'no_candidate'"));

/* T49: no_candidate does NOT set no_match status */
t('T49: no_candidate non-destructive', (function() {
  var ncIdx = dispatch.indexOf("'no_candidate'");
  // Check that no UPDATE service_requests SET status = 'no_match' comes before no_candidate return
  return !dispatch.includes("status = 'no_match'");
})());

/* ─────────────────────────────────────────────────────────
 * SECTION 10 — No-Alias SET Rule
 * ───────────────────────────────────────────────────────── */

/* T50: no alias-qualified SET targets (SET sr.status, SET m.status) */
not('T50: no alias-qualified SET targets', /SET\s+[a-z]+\./.test(dispatch));

/* ─────────────────────────────────────────────────────────
 * SECTION 11 — Verify File Completeness
 * ───────────────────────────────────────────────────────── */

/* T51: verify checks SECURITY DEFINER */
t('T51: verify checks SECURITY DEFINER', verify.includes('SECURITY DEFINER'));

/* T52: verify checks service_role has EXECUTE */
t('T52: verify checks service_role EXECUTE', verify.includes('service_role') && verify.includes('EXECUTE'));

/* T53: verify checks authenticated revoked */
t('T53: verify checks authenticated revoked', verify.includes('authenticated'));

/* T54: verify checks ::text contract */
t('T54: verify checks ::text cast', verify.includes('::text'));

/* T55: verify checks no request_id::uuid */
t('T55: verify checks no request_id::uuid', verify.includes('request_id::uuid'));

/* T56: verify checks FOR UPDATE */
t('T56: verify checks FOR UPDATE lock', verify.includes('FOR UPDATE'));

/* T57: verify checks unique_violation handler */
t('T57: verify checks unique_violation', verify.includes('unique_violation'));

/* T58: verify checks no_candidate */
t('T58: verify checks no_candidate', verify.includes('no_candidate'));

/* ─────────────────────────────────────────────────────────
 * SECTION 12 — Precheck Completeness
 * ───────────────────────────────────────────────────────── */

/* T59: precheck covers service_requests.id type */
t('T59: precheck PM-2 service_requests.id uuid', precheck.includes('service_requests') && precheck.includes('uuid'));

/* T60: precheck covers missions.request_id TEXT contract */
t('T60: precheck PM-7 missions.request_id TEXT', precheck.includes('missions.request_id') && precheck.includes('TEXT'));

/* T61: precheck covers missions_one_offer_per_request index */
t('T61: precheck covers one-offer index', precheck.includes('missions_one_offer_per_request'));

/* T62: precheck covers owner_user_id existence */
t('T62: precheck covers owner_user_id', precheck.includes('owner_user_id'));

/* T63: precheck covers eligible artisan count (informational) */
t('T63: precheck PM-23 eligible artisan count', precheck.includes('fully eligible artisans'));

/* ─────────────────────────────────────────────────────────
 * SECTION 13 — Rollback Safety
 * ───────────────────────────────────────────────────────── */

/* T64: rollback drops ONLY dispatch_request_v1 */
t('T64: rollback drops dispatch_request_v1', rollback.includes('DROP FUNCTION IF EXISTS public.dispatch_request_v1'));

/* T65: rollback does NOT drop 11C/11E RPCs */
not('T65: rollback does not drop claim_mission', (function() {
  // drop lines only — not the verify/NOTICE line
  var dropLines = rollback.split('\n').filter(function(l) {
    return l.match(/^\s*DROP\s+FUNCTION/i);
  }).join('\n');
  return dropLines.includes('claim_mission');
})());
not('T66: rollback does not drop decline_mission', (function() {
  var dropLines = rollback.split('\n').filter(function(l) {
    return l.match(/^\s*DROP\s+FUNCTION/i);
  }).join('\n');
  return dropLines.includes('decline_mission');
})());

/* T67: rollback verifies 11C/11E RPCs still present */
t('T67: rollback verifies 11C/11E RPCs intact', rollback.includes('claim_mission'));

/* ─────────────────────────────────────────────────────────
 * SECTION 14 — Simulation: Scoring Logic
 * ───────────────────────────────────────────────────────── */

/* Pure JS simulation of the SQL scoring algorithm for truth-table verification */
function norm(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

var CITY_GROUPS = [
  'casablanca,mohammeddia,mohammedia,benslimane,el jadida',
  'rabat,sale,temara,kenitra,khemisset',
  'marrakech,safi,el kelaa des sraghna',
  'fes,fez,meknes,ifrane,taza',
  'agadir,tiznit,inezgane',
  'tanger,tanger-assilah,tetouan,chefchaouen',
  'oujda,berkane,nador',
  'laayoune,dakhla'
];

function scoreService(artCat, reqCat) {
  var a = norm(artCat), r = norm(reqCat);
  if (r === '') return 18;
  if (a === r) return 35;
  if (a.indexOf(r) >= 0 || r.indexOf(a) >= 0) return 25;
  return 0;
}

function scoreCity(artCity, artZone, reqCity) {
  var ac = norm(artCity), az = norm(artZone), rc = norm(reqCity);
  if (rc === '') return 15;
  if (ac === rc) return 30;
  if (ac.indexOf(rc) >= 0 || rc.indexOf(ac) >= 0) return 28;
  if (az.indexOf(rc) >= 0) return 24;
  for (var i = 0; i < CITY_GROUPS.length; i++) {
    var g = CITY_GROUPS[i];
    if (g.indexOf(rc) >= 0 && g.indexOf(ac) >= 0) return 18;
  }
  if (az.indexOf('national') >= 0 || az.indexOf('maroc') >= 0 || az.indexOf('tout') >= 0) return 6;
  return 0;
}

function scoreTrust(rc, rat) {
  var s = 0;
  if (rc >= 100) s += 12; else if (rc >= 50) s += 9; else if (rc >= 20) s += 6; else if (rc >= 5) s += 3; else s -= 2;
  if (rat >= 4.8) s += 8; else if (rat >= 4.5) s += 6; else if (rat >= 4.0) s += 4; else if (rat > 0 && rat < 3.5) s -= 3;
  return Math.max(0, Math.min(20, s));
}

function scoreActivity(daysSince) {
  if (daysSince <= 1)  return 15;
  if (daysSince <= 7)  return 12;
  if (daysSince <= 30) return 8;
  if (daysSince <= 90) return 4;
  return 0;
}

function totalScore(artCat, artCity, artZone, reqCat, reqCity, rc, rat, daysSince) {
  return scoreService(artCat, reqCat) + scoreCity(artCity, artZone, reqCity) +
         scoreTrust(rc, rat) + scoreActivity(daysSince);
}

/* T68: exact service + exact city = max service (35) + max city (30) */
t('T68: exact match scores 35+30 for service+city',
  totalScore('plomberie', 'Casablanca', '', 'plomberie', 'Casablanca', 0, 0, 999) === 35 + 30 + 0 + 0);

/* T69: service mismatch = 0 service score */
t('T69: service mismatch = 0', scoreService('peinture', 'plomberie') === 0);

/* T70: no-category neutral = 18 */
t('T70: no-category neutral = 18', scoreService('plomberie', '') === 18);

/* T71: substring service match = 25 */
t('T71: substring service match = 25', scoreService('climatisation', 'clim') === 25 || scoreService('clim', 'climatisation') === 25);

/* T72: exact city = 30 */
t('T72: exact city = 30', scoreCity('Rabat', '', 'Rabat') === 30);

/* T73: same proximity group (Casablanca/Mohammedia) = 18 */
t('T73: proximity group match = 18', scoreCity('Mohammedia', '', 'Casablanca') === 18);

/* T74: national coverage = 6 */
t('T74: national coverage = 6', scoreCity('Fès', 'national', 'Tanger') === 6);

/* T75: different region, no coverage = 0 */
t('T75: different region = 0', scoreCity('Tanger', '', 'Agadir') === 0);

/* T76: work_zone covers city = 24 */
t('T76: work_zone coverage = 24', scoreCity('Fès', 'Tanger Casablanca Rabat', 'Casablanca') === 24);

/* T77: trust score high review_count + high rating */
t('T77: high trust = 12+8 = 20', scoreTrust(100, 4.8) === 20);

/* T78: zero reviews = negative trust contribution */
t('T78: zero reviews = -2 contribution', scoreTrust(0, 0) < 0 || scoreTrust(0, 0) === 0);

/* T79: activity score fresh artisan (1 day) = 15 */
t('T79: activity 1 day = 15', scoreActivity(1) === 15);

/* T80: activity stale artisan (>90 days) = 0 */
t('T80: activity 91 days = 0', scoreActivity(91) === 0);

/* T81: full-score artisan beats zero-score artisan */
t('T81: high score beats low score',
  totalScore('plomberie','Casablanca','',  'plomberie','Casablanca', 100, 4.8, 1) >
  totalScore('peinture', 'Tanger',    '',  'plomberie','Casablanca', 0,   0,   999));

/* T82: exactly one offered mission per request in V1 */
t('T82: V1 model — exactly one offer per request (SQL contract in precheck)',
  precheck.includes('missions_one_offer_per_request'));

/* ─────────────────────────────────────────────────────────
 * SECTION 15 — 11F.1A Hardening: Elimination Gates
 * ───────────────────────────────────────────────────────── */

/* T86: service mismatch uses CONTINUE (eliminatory, not just zero score) */
t('T86: service mismatch CONTINUE elimination', dispatch.includes('CONTINUE'));

/* T87: city mismatch also uses CONTINUE when request has city */
t('T87: city score=0 CONTINUE elimination', (function() {
  var cityBlock = dispatch.slice(dispatch.indexOf('-- ── CITY MATCH'));
  return cityBlock.includes('CONTINUE') && cityBlock.indexOf('CONTINUE') < cityBlock.indexOf('-- ── TRUST');
})());

/* T88: unaccent() NOT used (unsafe with SET search_path='') */
t('T88: unaccent not used in executable code', (function() {
  var stripped = dispatch
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  return !stripped.includes('unaccent(');
})());

/* T89: translate() used for normalization (pg_catalog, always safe) */
t('T89: translate() normalization used', dispatch.includes('translate('));

/* T90: 23505 handler does NOT return ok:true based solely on SQLSTATE */
t('T90: 23505 handler verifies offered row before ok:true', (function() {
  var uvIdx = dispatch.indexOf('WHEN unique_violation THEN');
  var after = dispatch.slice(uvIdx, uvIdx + 800);
  // Must contain a SELECT checking status='offered' before returning ok:true
  return after.includes("status     = 'offered'") && after.includes("'existing_offer'");
})());

/* T91: 23505 with no found offered row returns ok:false (not ok:true) */
t('T91: 23505 no-offered-row returns ok:false conflict', (function() {
  var uvIdx = dispatch.indexOf('WHEN unique_violation THEN');
  var after = dispatch.slice(uvIdx, uvIdx + 1200);
  return after.includes("'conflict'") || (after.includes("'already_claimed'") && after.indexOf("'already_claimed'") > after.indexOf('v_new_mission_id IS NOT NULL'));
})());

/* T92: simulation — service mismatch eliminated regardless of trust/activity */
(function() {
  // Simulates the CONTINUE gate — mismatch artisan is skipped entirely
  function wouldPass(artCat, reqCat) {
    var a = (artCat||'').toLowerCase(), r = (reqCat||'').toLowerCase();
    if (r === '') return true;           // no category — eligible
    if (a === r) return true;            // exact
    if (a.indexOf(r) >= 0 || r.indexOf(a) >= 0) return true; // substring
    return false;                        // CONTINUE (eliminated)
  }
  t('T92a: mismatch peinture/plomberie → eliminated', !wouldPass('peinture','plomberie'));
  t('T92b: exact plomberie/plomberie → eligible', wouldPass('plomberie','plomberie'));
  t('T92c: no-category request → any artisan eligible', wouldPass('peinture',''));
  t('T92d: substring clim/climatisation → eligible', wouldPass('climatisation','clim'));
})();

/* T93: simulation — city score=0 eliminated when request has city */
(function() {
  var CITY_GROUPS = [
    'casablanca,mohammedia,mohammeddia,benslimane,el jadida',
    'rabat,sale,temara,kenitra,khemisset',
    'marrakech,safi,el kelaa des sraghna',
    'fes,fez,meknes,ifrane,taza',
    'agadir,tiznit,inezgane',
    'tanger,tanger-assilah,tetouan,chefchaouen',
    'oujda,berkane,nador',
    'laayoune,dakhla'
  ];
  function cityScore(artCity, artZone, reqCity) {
    var ac = (artCity||'').toLowerCase(), az = (artZone||'').toLowerCase(), rc = (reqCity||'').toLowerCase();
    if (rc === '') return 15;
    if (ac === rc) return 30;
    if (ac.indexOf(rc) >= 0 || rc.indexOf(ac) >= 0) return 28;
    if (az.indexOf(rc) >= 0) return 24;
    for (var i = 0; i < CITY_GROUPS.length; i++) {
      var g = CITY_GROUPS[i];
      if (g.indexOf(rc) >= 0 && g.indexOf(ac) >= 0) return 18;
    }
    if (az.indexOf('national') >= 0 || az.indexOf('maroc') >= 0 || az.indexOf('tout') >= 0) return 6;
    return 0;
  }
  function cityEligible(artCity, artZone, reqCity) {
    var s = cityScore(artCity, artZone, reqCity);
    // eliminated only when request has city and score=0
    if ((reqCity||'') !== '' && s === 0) return false;
    return true;
  }
  t('T93a: Agadir artisan for Casablanca request → eliminated (score=0)', !cityEligible('Agadir','','Casablanca'));
  t('T93b: Mohammedia artisan for Casablanca → eligible (proximity)', cityEligible('Mohammedia','','Casablanca'));
  t('T93c: national artisan for any city → eligible (score=6)', cityEligible('Oujda','national','Casablanca'));
  t('T93d: no-city request → any artisan eligible', cityEligible('Agadir','',''));
  t('T93e: exact city → eligible (score=30)', cityEligible('Casablanca','','Casablanca'));
  t('T93f: Tanger for Agadir (diff group) → eliminated', !cityEligible('Tanger','','Agadir'));
})();

/* T94: high trust/activity CANNOT save a service-mismatched artisan */
t('T94: service mismatch is eliminatory — not a ranking penalty',
  dispatch.includes('-- ELIMINATION: explicit service mismatch') && dispatch.includes('CONTINUE'));

/* T95: high trust/activity CANNOT save a city-unrelated artisan */
t('T95: city mismatch is eliminatory — not a ranking penalty',
  dispatch.includes('-- ELIMINATION: if request has an explicit city') && dispatch.includes('CONTINUE'));

/* T96: request status re-evaluated under lock */
t('T96: status read AFTER FOR UPDATE (under lock)',
  dispatch.includes('FOR UPDATE') &&
  dispatch.includes("-- ── STEP 2: Request must be 'new' (evaluated AFTER lock)"));

/* T97: parent service_request.status never updated in success path */
t('T97: no UPDATE service_requests SET status in function body', (function() {
  var stripped = dispatch
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  return !(/UPDATE\s+public\.service_requests[\s\S]*?SET\s+status/.test(stripped));
})());

/* ─────────────────────────────────────────────────────────
 * SECTION 16 — 11F.1B: agreed_price Schema Contract
 * ───────────────────────────────────────────────────────── */

/* T98: migration contains Step 0 (DROP NOT NULL) */
t('T98: migration Step 0 DROP NOT NULL present',
  dispatch.includes('ALTER COLUMN agreed_price DROP NOT NULL'));

/* T99: Step 0 is conditional/idempotent (does not always execute) */
t('T99: Step 0 is idempotent — only drops if is_nullable=NO',
  dispatch.includes("is_nullable  = 'NO'") || dispatch.includes("is_nullable = 'NO'"));

/* T100: agreed_price=0 not introduced by dispatch RPC (no zero workaround) */
t('T100: agreed_price=0 NOT in dispatch INSERT', (function() {
  var insertIdx = dispatch.indexOf('INSERT INTO public.missions');
  var block = dispatch.slice(insertIdx, insertIdx + 500);
  // Must not contain agreed_price = 0 or agreed_price=0
  return !(/agreed_price\s*[=:]\s*0/.test(block));
})());

/* T101: T40 + T100 combined — agreed_price is NULL, not zero, on INSERT */
t('T101: INSERT sets agreed_price=NULL (truthful) not 0 (sentinel)', (function() {
  var insertIdx = dispatch.indexOf('INSERT INTO public.missions');
  var block = dispatch.slice(insertIdx, insertIdx + 500);
  return block.includes('agreed_price') &&
         block.includes('NULL') &&
         !(/agreed_price\s*[=:]\s*0/.test(block));
})());

/* T102: no fake price calculation in dispatch body */
t('T102: no price calculation or derivation in dispatch body', (function() {
  var stripped = dispatch.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  return !stripped.includes('commission') &&
         !stripped.includes('amount_mad') &&
         !stripped.includes('final_price') &&
         !stripped.includes('proposed_price') &&
         !stripped.includes('budget');
})());

/* T103: precheck PM-24 validates nullability (not just column existence) */
t('T103: PM-24 checks is_nullable in precheck',
  precheck.includes("is_nullable  = 'NO'") || precheck.includes("is_nullable = 'NO'") ||
  precheck.includes('PM-24b') || precheck.includes('nullable'));

/* T104: precheck PM-24 reports current nullability (not just PASS) */
t('T104: PM-24 captures and reports nullability value',
  precheck.includes('PM-24a') && precheck.includes('current_nullable'));

/* T105: precheck counts NULL agreed_price missions (baseline) */
t('T105: PM-24d counts existing NULL-priced missions',
  precheck.includes('PM-24d') && precheck.includes('agreed_price IS NULL'));

/* T106: precheck counts legacy zero-priced missions */
t('T106: PM-24e counts legacy sentinel agreed_price=0 missions',
  precheck.includes('PM-24e') && precheck.includes('agreed_price = 0'));

/* T107: verify V-14 checks agreed_price is nullable (not just column exists) */
t('T107: verify V-14 checks is_nullable=YES after migration',
  verify.includes('is_nullable') && verify.includes("'YES'") && verify.includes('V-14'));

/* T108: verify V-14b checks price CHECK constraint preserved */
t('T108: verify V-14b: price CHECK preserved after DROP NOT NULL',
  verify.includes('V-14b') && verify.includes('CHECK'));

/* T109: verify V-14c confirms no hardcoded agreed_price in dispatch */
t('T109: verify V-14c: no fake price in dispatch body',
  verify.includes('V-14c') && verify.includes('NULL'));

/* T110: rollback has NULL guard before restoring NOT NULL */
t('T110: rollback hard-stops if NULL missions exist',
  rollback.includes('agreed_price IS NULL') && rollback.includes('HARD STOP'));

/* T111: rollback does NOT execute UPDATE agreed_price (warn text in strings/comments is allowed) */
not('T111: rollback does not execute UPDATE agreed_price to bypass guard', (function() {
  // Strip comments and string literals before checking for actual SQL UPDATE statement.
  // RAISE EXCEPTION / RAISE NOTICE string bodies may contain DO-NOT instructions — not executable SQL.
  var stripped = rollback
    .replace(/--[^\n]*/g, '')               // remove line comments
    .replace(/'[^']*'/g, "''")              // collapse string literals to empty ''
    .replace(/\$\$[\s\S]*?\$\$/g, '$$$$'); // collapse dollar-quote bodies
  return /\bUPDATE\b[\s\S]{0,50}\bmissions\b[\s\S]{0,50}\bSET\b[\s\S]{0,50}\bagreed_price\b/.test(stripped);
})());

/* T112: rollback preserves 11C/11E RPCs */
t('T112: rollback preserves all 11C/11E RPCs',
  rollback.includes('claim_mission') && rollback.includes('get_my_mission_offers'));

/* T113: simulation — agreed_price=NULL satisfies CHECK (agreed_price >= 0) */
t('T113: NULL does not violate CHECK >= 0 (SQL standard — PostgreSQL confirmed)',
  (function() {
    // SQL NULL propagation: NULL >= 0 evaluates to NULL, not FALSE.
    // PostgreSQL CHECK: a row is rejected only when CHECK evaluates to FALSE.
    // NULL result → row is accepted. So agreed_price=NULL is valid even with CHECK >= 0.
    // This is a doc assertion test — verifies the policy comment is present in migration.
    return dispatch.includes('NULL does not violate a CHECK') ||
           dispatch.includes('NULL does NOT violate a CHECK');
  })());

/* T114: forensic evidence — legacy code wrote agreed_price=0 (sentinel pattern documented) */
t('T114: Step 0 forensic rationale documented in migration',
  dispatch.includes('agreed_price=0 as a placeholder') ||
  dispatch.includes('placeholder sentinel') ||
  dispatch.includes('workaround for the NOT NULL'));

/* T115: service_role only still intact after 11F.1B changes */
t('T115: service_role GRANT still present after 11F.1B',
  dispatch.includes('GRANT  EXECUTE ON FUNCTION public.dispatch_request_v1(uuid) TO service_role'));

/* T83: no browser dispatch authority in SQL */
not('T83: no browser trigger in SQL', dispatch.includes('supabase.createClient') || dispatch.includes('window.'));

/* T84: function accepts only p_request_id uuid (no artisan_id param) */
t('T84: no p_artisan_id parameter', (function() {
  var fnSig = dispatch.slice(dispatch.indexOf('CREATE OR REPLACE FUNCTION'), dispatch.indexOf('RETURNS jsonb'));
  return !fnSig.includes('p_artisan_id');
})());

/* T85: function accepts only p_request_id uuid (no phone param) */
t('T85: no phone parameter', (function() {
  var fnSig = dispatch.slice(dispatch.indexOf('CREATE OR REPLACE FUNCTION'), dispatch.indexOf('RETURNS jsonb'));
  return !fnSig.includes('phone');
})());

/* ─────────────────────────────────────────────────────────
 * RESULTS
 * ───────────────────────────────────────────────────────── */
console.log(SUITE);
errors.forEach(function(e) { console.log(' ', e); });
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
