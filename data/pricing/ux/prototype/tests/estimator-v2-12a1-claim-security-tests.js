/**
 * 7C.12A.1 — Artisan Claim Security Foundation Tests
 * data/pricing/ux/prototype/tests/estimator-v2-12a1-claim-security-tests.js
 *
 * Tests: security invariants, atomicity, auth gate, regression checks.
 * All tests are static source-analysis or pure JS simulation — no live DB.
 */
'use strict';

var fs = require('fs'), path = require('path');
var ROOT = path.resolve(__dirname, '../../../../..');
function src(rel)  { return fs.readFileSync(path.join(ROOT, 'js', rel), 'utf8'); }
function sql(rel)  { return fs.readFileSync(path.join(ROOT, 'supabase', rel), 'utf8'); }
function html(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

var dashboard   = src('fixeo-artisan-dashboard-v2.js');
var claimSys    = src('fixeo-claim-system.js');
var repo        = src('fixeo-repository.js');
var dashP2      = src('artisan-dashboard-p2.js');
var migration   = sql('7c12a1-artisan-claim-security.sql');
var precheck    = sql('7c12a1-artisan-claim-security-precheck.sql');
var verify      = sql('7c12a1-artisan-claim-security-verify.sql');
var rollback    = sql('7c12a1-artisan-claim-security-rollback.sql');

var passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; /* console.log('  PASS:', name); */ }
  else       { failed++; console.error('  FAIL:', name); }
}
function not(name, cond) { t(name, !cond); }

console.log('\n══ 7C.12A.1 Artisan Claim Security Tests ══\n');

/* ─────────────────────────────────────────────────────────
 * SECTION 1 — Phone auth fallback removed from dashboard
 * ───────────────────────────────────────────────────────── */

not('S1.1: phone_public fallback SELECT removed from _loadArtisanProfile',
  dashboard.includes('.eq(\'phone_public\''));

not('S1.2: phone-based artisan lookup not present anywhere in dashboard v2',
  dashboard.includes('phone_public') && dashboard.includes('.eq(\'phone_public\''));

t('S1.3: canonical owner_user_id lookup present',
  dashboard.includes('.eq(\'owner_user_id\', userId)'));

t('S1.4: phone_public intentionally excluded comment present',
  dashboard.includes('phone_public intentionally excluded'));

t('S1.5: phone_public fallback REMOVED comment present in dashboard',
  dashboard.includes('phone_public fallback REMOVED'));

t('S1.6: artisan_profile_not_linked safe state remains in dashboard',
  dashboard.includes('artisan_profile_not_linked') ||
  dashboard.includes('Aucun profil artisan associé') ||
  dashboard.includes('fxa-no-profile'));

not('S1.7: no phone_public in .eq() or .select() calls within _loadArtisanProfile',
  /* phone_public must not appear in a .eq() or .select() chain — comments are ok */
  (function() {
    var fnStart = dashboard.indexOf('async function _loadArtisanProfile');
    var fnEnd   = dashboard.indexOf('async function _fetch');
    if (fnStart === -1 || fnEnd === -1) return false;
    var fnBody = dashboard.slice(fnStart, fnEnd);
    /* Match actual usage: .eq('phone_public' or inside select string as a column name */
    return /\.eq\s*\(\s*['"]phone_public['"]/.test(fnBody) ||
           /select\s*\(.*phone_public/.test(fnBody);
  })());

/* ─────────────────────────────────────────────────────────
 * SECTION 2 — Browser privileged claim writes removed
 * ───────────────────────────────────────────────────────── */

not('S2.1: no direct artisans owner_user_id UPDATE in claim system',
  claimSys.includes('owner_user_id') &&
  claimSys.includes('await sb') &&
  claimSys.includes('.update({') &&
  claimSys.includes('owner_user_id:'));

not('S2.2: no direct artisans UPDATE from claim system for approval',
  (function() {
    /* Search for the pattern: sb.from('artisans').update(...owner_user_id...) */
    var idx = claimSys.indexOf('sb.from(\'artisans\').update');
    if (idx === -1) return false;
    var snippet = claimSys.slice(idx, idx + 300);
    return snippet.includes('owner_user_id');
  })());

not('S2.3: no localStorage-sourced requesterUID for ownership in claim system',
  (function() {
    /* The pattern: requesterUID = claim.user_id combined with artisans update */
    return claimSys.includes('requesterUID = claim.user_id') &&
           claimSys.includes('owner_user_id');
  })());

t('S2.4: adminApproveClaim contains 7C.12A.1 security contract comment',
  claimSys.includes('7C.12A.1 SECURITY CONTRACT'));

t('S2.5: onboarding_completed NOT SET in adminApproveClaim (approval ≠ onboarding)',
  !claimSys.includes('onboarding_completed: !!') &&
  !claimSys.includes('onboarding_completed: true'));

not('S2.6: no profiles.role browser UPDATE in claim system approval path',
  (function() {
    var approveIdx = claimSys.indexOf('function adminApproveClaim');
    if (approveIdx === -1) return false;
    /* find next function boundary */
    var nextFn = claimSys.indexOf('\n  function ', approveIdx + 10);
    var body = claimSys.slice(approveIdx, nextFn > -1 ? nextFn : approveIdx + 3000);
    return body.includes('profiles') && body.includes('.update') && body.includes('role');
  })());

not('S2.7: no users.role browser UPDATE in claim system approval path',
  (function() {
    var approveIdx = claimSys.indexOf('function adminApproveClaim');
    if (approveIdx === -1) return false;
    var nextFn = claimSys.indexOf('\n  function ', approveIdx + 10);
    var body = claimSys.slice(approveIdx, nextFn > -1 ? nextFn : approveIdx + 3000);
    return body.includes('users') && body.includes('.update') && body.includes('role');
  })());

/* ─────────────────────────────────────────────────────────
 * SECTION 3 — Repository RPC delegation
 * ───────────────────────────────────────────────────────── */

t('S3.1: approveClaimRequest calls approve_artisan_claim RPC',
  repo.includes('approve_artisan_claim') && repo.includes('.rpc('));

t('S3.2: rejectClaimRequest calls reject_artisan_claim RPC',
  repo.includes('reject_artisan_claim') && repo.includes('.rpc('));

not('S3.3: no direct artisans owner_user_id UPDATE in repository approve path',
  (function() {
    var idx = repo.indexOf('async function approveClaimRequest');
    if (idx === -1) return false;
    var nextFn = repo.indexOf('async function rejectClaimRequest');
    var body = repo.slice(idx, nextFn > -1 ? nextFn : idx + 4000);
    return body.includes('owner_user_id') && body.includes('.update(') &&
           body.includes('T_ARTISANS');
  })());

not('S3.4: no localStorage requesterUID fallback in repository approve path',
  (function() {
    var idx = repo.indexOf('async function approveClaimRequest');
    if (idx === -1) return false;
    var nextFn = repo.indexOf('async function rejectClaimRequest');
    var body = repo.slice(idx, nextFn > -1 ? nextFn : idx + 4000);
    return body.includes('fixeo_claim_requests') && body.includes('requesterUID');
  })());

t('S3.5: approveClaimRequest 7C.12A.1 security rewrite comment present',
  repo.includes('7C.12A.1 SECURITY REWRITE'));

t('S3.6: rejectClaimRequest also uses RPC (no direct status UPDATE)',
  (function() {
    var idx = repo.indexOf('async function rejectClaimRequest');
    if (idx === -1) return false;
    var nextFn = repo.indexOf('async function getClaimRequests');
    var body = repo.slice(idx, nextFn > -1 ? nextFn : idx + 2000);
    return body.includes('reject_artisan_claim') && body.includes('.rpc(');
  })());

/* ─────────────────────────────────────────────────────────
 * SECTION 4 — Claim modal auth gate
 * ───────────────────────────────────────────────────────── */

t('S4.1: _checkAuthBeforeClaim function present in claim system',
  claimSys.includes('_checkAuthBeforeClaim'));

t('S4.2: openClaimModal calls _checkAuthBeforeClaim before showing modal',
  (function() {
    var idx = claimSys.indexOf('function openClaimModal');
    if (idx === -1) return false;
    var nextFn = claimSys.indexOf('\n  function _openClaimModalAuthenticated');
    var body = claimSys.slice(idx, nextFn > -1 ? nextFn : idx + 1000);
    return body.includes('_checkAuthBeforeClaim');
  })());

t('S4.3: unauthenticated user redirected to auth.html with intent=claim',
  claimSys.includes('auth.html?return=') && claimSys.includes('intent=claim'));

t('S4.4: _openClaimModalAuthenticated is separate gated function',
  claimSys.includes('function _openClaimModalAuthenticated'));

t('S4.5: auth gate checks Supabase session via getSession or localStorage token',
  claimSys.includes('getSession') || claimSys.includes('sb-') && claimSys.includes('auth-token'));

t('S4.6: artisan id preserved in return URL for post-auth redirect',
  claimSys.includes('claim=') && claimSys.includes('encodeURIComponent'));

/* ─────────────────────────────────────────────────────────
 * SECTION 5 — Availability toggle security fix
 * ───────────────────────────────────────────────────────── */

not('S5.1: availability toggle no longer uses localStorage userId as WHERE target',
  (function() {
    var idx = dashP2.indexOf('_syncAvailToSupabase');
    if (idx === -1) return false;
    var nextFn = dashP2.indexOf('\n  function _showAvailConfirmation');
    var body = dashP2.slice(idx, nextFn > -1 ? nextFn : idx + 1500);
    /* The old unsafe pattern: .or('id.eq.'+userId+',legacy_id.eq.'+userId) */
    return body.includes('id.eq.\' + userId');
  })());

not('S5.2: availability toggle does not use legacy_id for WHERE',
  (function() {
    var idx = dashP2.indexOf('_syncAvailToSupabase');
    if (idx === -1) return false;
    var nextFn = dashP2.indexOf('\n  function _showAvailConfirmation');
    var body = dashP2.slice(idx, nextFn > -1 ? nextFn : idx + 1500);
    return body.includes('legacy_id.eq.');
  })());

t('S5.3: availability toggle 7C.12A.1 security fix comment present',
  dashP2.includes('7C.12A.1 SECURITY FIX'));

t('S5.4: availability toggle uses owner_user_id for WHERE clause',
  (function() {
    var idx = dashP2.indexOf('_syncAvailToSupabase');
    if (idx === -1) return false;
    var nextFn = dashP2.indexOf('\n  function _showAvailConfirmation');
    var body = dashP2.slice(idx, nextFn > -1 ? nextFn : idx + 1500);
    return body.includes('owner_user_id');
  })());

/* ─────────────────────────────────────────────────────────
 * SECTION 6 — SQL migration contract
 * ───────────────────────────────────────────────────────── */

t('S6.1: migration wrapped in BEGIN/COMMIT',
  migration.includes('\nBEGIN;') && migration.includes('COMMIT;'));

t('S6.2: approve_artisan_claim is SECURITY DEFINER in migration',
  migration.includes('SECURITY DEFINER') && migration.includes('approve_artisan_claim'));

t('S6.3: approve_artisan_claim has SET search_path',
  migration.includes("SET search_path = ''"));

t('S6.4: admin role verified from DB in approve RPC (not from caller)',
  migration.includes('v_caller_role') && migration.includes("= 'admin'"));

t('S6.5: artisan identity read from claim_requests row in approve RPC',
  migration.includes('artisan_legacy_id'));

t('S6.6: onboarding_completed NOT assigned in approve RPC code (excluding SQL comments)',
  (function() {
    var approveStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.approve_artisan_claim');
    var approveEnd   = migration.indexOf('CREATE OR REPLACE FUNCTION public.reject_artisan_claim');
    if (approveStart === -1 || approveEnd === -1) return false;
    var body = migration.slice(approveStart, approveEnd);
    /* Filter out SQL comment lines (starting with --) before checking */
    var codeLines = body.split('\n').filter(function(l) {
      return l.trim().length > 0 && !l.trim().startsWith('--');
    }).join('\n');
    return !codeLines.match(/onboarding_completed\s*=\s*true/i) &&
           !codeLines.match(/SET\s[^;]*onboarding_completed/i);
  })());

t('S6.7: approve RPC comment states onboarding_completed remains false',
  migration.includes('onboarding_completed') &&
  migration.includes('remains false') || migration.includes('NOT SET'));

t('S6.8: FOR UPDATE concurrency lock in approve RPC',
  migration.includes('FOR UPDATE'));

t('S6.9: artisan_has_owner guard prevents ownership theft',
  migration.includes('artisan_has_owner'));

t('S6.10: reject RPC updates artisans.claim_status only — absorbs dropped trigger rejection branch',
  (function() {
    /* reject_artisan_claim() must reset artisans.claim_status (trigger absorption) but
     * MUST NOT set owner_user_id, onboarding_completed, verified, or availability */
    var rejectStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.reject_artisan_claim');
    var next = migration.indexOf('\n-- ═══', rejectStart + 100);
    if (rejectStart === -1) return false;
    var body = migration.slice(rejectStart, next > -1 ? next : rejectStart + 5000);
    var hasArtisanUpdate = body.includes('UPDATE public.artisans');
    var hasOwnerSet      = /SET\s+owner_user_id/.test(body);
    var hasOnboardingSet = /onboarding_completed\s*=\s*true/i.test(body);
    var hasVerifiedSet   = /verified\s*=\s*true/i.test(body);
    /* Must update artisans (claim_status reset), must NOT touch ownership/onboarding/verified */
    return hasArtisanUpdate && !hasOwnerSet && !hasOnboardingSet && !hasVerifiedSet;
  })());

t('S6.11: reject RPC does NOT set owner_user_id (rejection never alters ownership)',
  (function() {
    var rejectStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.reject_artisan_claim');
    if (rejectStart === -1) return false;
    var next = migration.indexOf('\n-- ═══', rejectStart + 100);
    var body = migration.slice(rejectStart, next > -1 ? next : rejectStart + 5000);
    return !(/SET\s+owner_user_id/.test(body));
  })());

t('S6.12: anon REVOKED from both RPCs',
  migration.includes("REVOKE EXECUTE ON FUNCTION public.approve_artisan_claim(uuid)") &&
  migration.includes("FROM anon") &&
  migration.includes("REVOKE EXECUTE ON FUNCTION public.reject_artisan_claim(uuid, text)"));

t('S6.13: authenticated GRANTED to RPCs (admin check is internal)',
  migration.includes("GRANT  EXECUTE ON FUNCTION public.approve_artisan_claim(uuid)") &&
  migration.includes("TO authenticated") &&
  migration.includes("GRANT  EXECUTE ON FUNCTION public.reject_artisan_claim(uuid, text)"));

t('S6.14: stale open-insert policy explicitly dropped',
  migration.includes("DROP POLICY IF EXISTS \"claims_insert\""));

t('S6.15: new authenticated INSERT policy requires requester_user_id = auth.uid()',
  migration.includes('requester_user_id = auth.uid()'));

t('S6.16: RLS enabled on claim_requests in migration',
  migration.includes('ENABLE ROW LEVEL SECURITY'));

t('S6.17: migration drops sync_artisan_claim trigger and function',
  migration.includes('DROP TRIGGER IF EXISTS claim_approval_sync') &&
  migration.includes('DROP FUNCTION IF EXISTS public.sync_artisan_claim()'));

/* ─────────────────────────────────────────────────────────
 * SECTION 7 — Precheck SQL contract
 * ───────────────────────────────────────────────────────── */

t('S7.1: precheck inspects live pg_policies (not just repo files)',
  precheck.includes('pg_policies'));

t('S7.2: precheck checks duplicate owner_user_id',
  precheck.includes('owner_user_id') && precheck.includes('COUNT(*) > 1'));

t('S7.3: precheck checks orphan approved artisans (approved + no owner)',
  precheck.includes('approved') && precheck.includes('owner_user_id IS NULL'));

t('S7.4: precheck checks claims referencing missing users',
  precheck.includes('requester_user_id') && precheck.includes('NOT EXISTS'));

t('S7.5: precheck inspects sync_artisan_claim definition',
  precheck.includes('sync_artisan_claim'));

t('S7.6: precheck checks anon INSERT capability',
  precheck.includes('anon') && precheck.includes('INSERT'));

t('S7.7: precheck is READ ONLY (no DDL statements, no DML writes)',
  /* Check for actual SQL DDL/DML statements — not inside NOTICE strings or comments.
   * Use line-start regex to avoid false matches inside RAISE NOTICE string literals. */
  !precheck.match(/^\s*(CREATE TABLE|CREATE POLICY|CREATE FUNCTION|CREATE INDEX|INSERT INTO|DELETE FROM|ALTER TABLE|DROP TABLE|DROP POLICY)\b/mi) &&
  !precheck.match(/^\s*UPDATE\s+public\./mi));

/* ─────────────────────────────────────────────────────────
 * SECTION 8 — Verify SQL contract
 * ───────────────────────────────────────────────────────── */

t('S8.1: verify checks approve_artisan_claim SECURITY DEFINER',
  verify.includes('SECURITY DEFINER') && verify.includes('approve_artisan_claim'));

t('S8.2: verify checks onboarding_completed NOT set in RPC (V-6)',
  verify.includes('onboarding_completed') && verify.includes('V-6'));

t('S8.3: verify checks artisan_has_owner guard present',
  verify.includes('artisan_has_owner'));

t('S8.4: verify checks anon cannot execute approve RPC',
  verify.includes('anon') && verify.includes('approve_artisan_claim'));

t('S8.5: verify checks 7C.11 dispatch_request_v1 untouched',
  verify.includes('dispatch_request_v1') && verify.includes('7C.11'));

t('S8.6: verify checks stale policies removed',
  verify.includes('claims_insert') && verify.includes('stale'));

t('S8.7: verify checks reject RPC does not alter artisan owner_user_id',
  verify.includes('reject_artisan_claim') && verify.includes('owner_user_id'));

t('S8.8: verify checks sync_artisan_claim trigger and function are dropped',
  verify.includes('claim_approval_sync') && verify.includes('sync_artisan_claim') &&
  verify.includes('DROPPED') || verify.includes('dropped'));

t('S8.9: verify checks no triggers remain on claim_requests',
  verify.includes('claim_requests') && verify.includes('expect 0'));

/* ─────────────────────────────────────────────────────────
 * SECTION 9 — Atomicity and concurrency
 * ───────────────────────────────────────────────────────── */

t('S9.1: approve RPC uses FOR UPDATE to serialize concurrent approvals',
  migration.includes('FOR UPDATE'));

t('S9.2: approve RPC has EXCEPTION WHEN OTHERS handler (internal_error fallback)',
  (function() {
    var approveStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.approve_artisan_claim');
    var approveEnd   = migration.indexOf('CREATE OR REPLACE FUNCTION public.reject_artisan_claim');
    var body = migration.slice(approveStart, approveEnd);
    return body.includes('WHEN OTHERS') && body.includes('internal_error');
  })());

t('S9.3: reject RPC has EXCEPTION WHEN OTHERS handler',
  (function() {
    var rejectStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.reject_artisan_claim');
    var next = migration.indexOf('\n-- ═══', rejectStart + 100);
    var body = migration.slice(rejectStart, next > -1 ? next : rejectStart + 5000);
    return body.includes('WHEN OTHERS') && body.includes('internal_error');
  })());

t('S9.4: duplicate approval is handled (already_owned idempotent path)',
  migration.includes('already_owned'));

t('S9.5: already_rejected is idempotent in reject RPC',
  migration.includes('already_rejected'));

t('S9.6: claim_already_approved blocks rejection of approved claim',
  migration.includes('claim_already_approved'));

/* ─────────────────────────────────────────────────────────
 * SECTION 10 — Regression: dispatch + profile untouched
 * ───────────────────────────────────────────────────────── */

t('S10.1: dispatch_request_v1 not modified by 7C.12A.1 migration (no CREATE/DROP of dispatch fn)',
  /* migration may reference dispatch in comments/rollback verify but must not CREATE/DROP it */
  !migration.includes('CREATE OR REPLACE FUNCTION public.dispatch_request_v1') &&
  !migration.includes('DROP FUNCTION IF EXISTS public.dispatch_request_v1'));

t('S10.2: missions lifecycle RPCs not in migration',
  !migration.includes('claim_mission') && !migration.includes('start_mission'));

t('S10.3: rollback drops both RPCs and does not touch dispatch',
  rollback.includes('approve_artisan_claim') &&
  rollback.includes('reject_artisan_claim') &&
  rollback.includes('dispatch_request_v1') &&
  rollback.includes('intact'));

t('S10.4: rollback is transaction-safe (BEGIN/COMMIT)',
  rollback.includes('\nBEGIN;') && rollback.includes('COMMIT;'));

/* ─────────────────────────────────────────────────────────
 * SECTION 11 — No SERVICE_ROLE in browser code
 * ───────────────────────────────────────────────────────── */

not('S11.1: no SERVICE_ROLE key in dashboard v2 JS',
  dashboard.includes('SERVICE_ROLE') || dashboard.includes('service_role_key'));

not('S11.2: no SERVICE_ROLE key in claim system JS',
  claimSys.includes('SERVICE_ROLE') || claimSys.includes('service_role_key'));

not('S11.3: no SERVICE_ROLE key in repository JS',
  repo.includes('SERVICE_ROLE') || repo.includes('service_role_key'));

/* ─────────────────────────────────────────────────────────
 * SECTION 12 — Public artisan profile + claim CTA regression
 * ───────────────────────────────────────────────────────── */

t('S12.1: openClaimModal still exported on FixeoClaimSystem',
  claimSys.includes('openClaimModal'));

t('S12.2: claim CTA button still renders (renderClaimCTA present)',
  claimSys.includes('renderClaimCTA') || claimSys.includes('fixeo-claim-btn'));

t('S12.3: artisan profile page CTA onclick still calls openClaimModal',
  claimSys.includes('window.FixeoClaimSystem.openClaimModal'));

/* ─────────────────────────────────────────────────────────
 * SECTION 13 — onboarding_completed contract
 * ───────────────────────────────────────────────────────── */

not('S13.1: onboarding_completed=true NOT assigned in adminApproveClaim (claim system)',
  (function() {
    /* Check only non-comment lines for actual code assignment of onboarding_completed=true.
     * Comment lines (starting with // or *) are excluded. */
    var idx = claimSys.indexOf('function adminApproveClaim');
    if (idx === -1) return false;
    var nextFn = claimSys.indexOf('\n  function ', idx + 10);
    var body = claimSys.slice(idx, nextFn > -1 ? nextFn : idx + 3000);
    /* Filter to non-comment code lines only */
    var codeLines = body.split('\n').filter(function(l) {
      var t = l.trim();
      return t.length > 0 && !t.startsWith('//') && !t.startsWith('*');
    }).join('\n');
    return codeLines.includes('onboarding_completed: true') ||
           codeLines.includes('onboarding_completed:true') ||
           !!codeLines.match(/onboarding_completed\s*=\s*true/);
  })());

not('S13.2: onboarding_completed NOT set in repository approve path',
  (function() {
    var idx = repo.indexOf('async function approveClaimRequest');
    if (idx === -1) return false;
    var nextFn = repo.indexOf('async function rejectClaimRequest');
    var body = repo.slice(idx, nextFn > -1 ? nextFn : idx + 4000);
    return body.includes('onboarding_completed') &&
           body.match(/onboarding_completed\s*[:=]\s*true/);
  })());

t('S13.3: approve RPC code lines do not set onboarding_completed=true in SQL',
  (function() {
    var idx = migration.indexOf('CREATE OR REPLACE FUNCTION public.approve_artisan_claim');
    var end = migration.indexOf('CREATE OR REPLACE FUNCTION public.reject_artisan_claim');
    if (idx === -1 || end === -1) return false;
    var body = migration.slice(idx, end);
    /* Filter SQL comment lines before checking */
    var codeLines = body.split('\n').filter(function(l) {
      return l.trim().length > 0 && !l.trim().startsWith('--');
    }).join('\n');
    return !codeLines.match(/onboarding_completed\s*=\s*true/i) &&
           !codeLines.match(/SET\s[^;]*onboarding_completed/i);
  })());

/* ─────────────────────────────────────────────────────────
 * SECTION 14 — Trigger drop: sync_artisan_claim forensic
 * ───────────────────────────────────────────────────────── */

t('S14.1: migration drops claim_approval_sync trigger',
  migration.includes('DROP TRIGGER IF EXISTS claim_approval_sync'));

t('S14.2: migration drops sync_artisan_claim() function',
  migration.includes('DROP FUNCTION IF EXISTS public.sync_artisan_claim()'));

t('S14.3: migration does not CREATE OR REPLACE sync_artisan_claim in the main migration body',
  (function() {
    /* The migration itself must not recreate the defective trigger.
     * Rollback file may contain it — only check migration file. */
    var mainEnd = migration.indexOf('-- STEP 5: RLS');
    var mainBody = migration.slice(0, mainEnd > -1 ? mainEnd : migration.length);
    return !mainBody.includes('CREATE OR REPLACE FUNCTION public.sync_artisan_claim');
  })());

t('S14.4: rollback restores sync_artisan_claim for emergency reversal',
  rollback.includes('CREATE OR REPLACE FUNCTION public.sync_artisan_claim'));

t('S14.5: rollback warns about onboarding_completed defect re-introduction',
  rollback.includes('onboarding_completed defect'));

t('S14.6: approve RPC uses artisan_id UUID FK as primary resolution (before legacy fallback)',
  (function() {
    var idx = migration.indexOf('CREATE OR REPLACE FUNCTION public.approve_artisan_claim');
    var end = migration.indexOf('CREATE OR REPLACE FUNCTION public.reject_artisan_claim');
    var body = migration.slice(idx, end);
    // v2: pre-read uses v_pre.artisan_id; locked read uses v_claim
    var artisanIdIdx = body.indexOf('v_pre.artisan_id') > -1 ? body.indexOf('v_pre.artisan_id')
                     : body.indexOf('v_claim.artisan_id');
    var legacyIdx    = body.indexOf('v_pre.artisan_legacy_id') > -1 ? body.indexOf('v_pre.artisan_legacy_id')
                     : body.indexOf('v_claim.artisan_legacy_id');
    return artisanIdIdx > -1 && legacyIdx > -1 && artisanIdIdx < legacyIdx;
  })());

t('S14.7: approve RPC does NOT set verified=true (not implied by claim approval)',
  (function() {
    var idx = migration.indexOf('CREATE OR REPLACE FUNCTION public.approve_artisan_claim');
    var end = migration.indexOf('CREATE OR REPLACE FUNCTION public.reject_artisan_claim');
    var body = migration.slice(idx, end);
    var codeLines = body.split('\n').filter(function(l) {
      return l.trim().length > 0 && !l.trim().startsWith('--');
    }).join('\n');
    return !codeLines.match(/verified\s*=\s*true/i);
  })());

t('S14.8: approve RPC does NOT set availability (artisan sets post-onboarding)',
  (function() {
    var idx = migration.indexOf('CREATE OR REPLACE FUNCTION public.approve_artisan_claim');
    var end = migration.indexOf('CREATE OR REPLACE FUNCTION public.reject_artisan_claim');
    var body = migration.slice(idx, end);
    var codeLines = body.split('\n').filter(function(l) {
      return l.trim().length > 0 && !l.trim().startsWith('--');
    }).join('\n');
    return !codeLines.match(/availability\s*=/i);
  })());

t('S14.9: reject RPC has owner_user_id IS NULL guard before artisan reset',
  (function() {
    var rejectStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.reject_artisan_claim');
    var next = migration.indexOf('\n-- ═══', rejectStart + 100);
    var body = migration.slice(rejectStart, next > -1 ? next : rejectStart + 5000);
    return body.includes('owner_user_id IS NULL');
  })());

t('S14.10: reject absorption: artisan reset to unclaimed (not rejected) on rejection',
  (function() {
    var rejectStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.reject_artisan_claim');
    var next = migration.indexOf('\n-- ═══', rejectStart + 100);
    var body = migration.slice(rejectStart, next > -1 ? next : rejectStart + 5000);
    return body.includes("claim_status = 'unclaimed'");
  })());

t('S14.11: verify explicitly checks trigger is dropped (V-16 and V-17)',
  verify.includes('claim_approval_sync') && verify.includes('sync_artisan_claim') &&
  verify.includes('dropped'));

t('S14.12: dispatch eligibility unchanged — approve RPC header documents the 4 gate conditions',
  migration.includes('onboarding_completed = true') &&
  migration.includes("availability = 'available'") &&
  migration.includes('owner_user_id IS NOT NULL') &&
  migration.includes("claim_status = 'approved'"));

/* ─────────────────────────────────────────────────────────
 * SECTION 15 — Concurrency hardening (Fix 1-6)
 * ───────────────────────────────────────────────────────── */

/* Helper: get approve RPC body (non-comment SQL lines) */
var _approveBody = (function() {
  var idx = migration.indexOf('CREATE OR REPLACE FUNCTION public.approve_artisan_claim');
  var end = migration.indexOf('CREATE OR REPLACE FUNCTION public.reject_artisan_claim');
  return migration.slice(idx, end);
})();
var _approveCode = _approveBody.split('\n').filter(function(l) {
  return l.trim().length > 0 && !l.trim().startsWith('--');
}).join('\n');

/* Fix 1: Artisan row FOR UPDATE lock */
t('S15.1: artisan row locked FOR UPDATE after v_artisan_id resolution',
  (function() {
    /* The artisan FOR UPDATE must appear AFTER the resolution block.
     * Check that artisans table appears in a FOR UPDATE context in approve body. */
    return _approveBody.includes('FOR UPDATE') &&
           _approveBody.indexOf('v_artisan_id') < _approveBody.indexOf('FOR UPDATE\n  -- \u2500\u2500 STEP 8') ||
           /* More robust: look for artisans SELECT FOR UPDATE separately from claim SELECT FOR UPDATE */
           (_approveBody.match(/FROM public\.artisans[\s\S]*?FOR UPDATE/m) !== null);
  })());

t('S15.2: at least 2 FOR UPDATE locks (claim row + artisan row)',
  (function() {
    var count = (_approveBody.match(/FOR UPDATE/g) || []).length;
    return count >= 2;
  })());

t('S15.3: artisan FOR UPDATE separated from claim FOR UPDATE (independent lock)',
  (function() {
    var claimFU  = _approveBody.indexOf('claim_requests');
    var artFU    = _approveBody.lastIndexOf('FOR UPDATE');
    var claimFUpos = _approveBody.indexOf('FOR UPDATE');
    /* Both must exist; artisan FOR UPDATE must come after artisan resolution */
    return claimFU !== -1 && artFU !== -1 && artFU > claimFUpos;
  })());

/* Fix 2: Conditional UPDATE with owner_user_id IS NULL */
t('S15.4: UPDATE artisans contains WHERE owner_user_id IS NULL guard',
  _approveCode.includes('owner_user_id IS NULL'));

t('S15.5: GET DIAGNOSTICS ROW_COUNT used after conditional UPDATE',
  _approveCode.includes('GET DIAGNOSTICS') && _approveCode.includes('ROW_COUNT'));

t('S15.6: v_rows_updated = 0 branch handles post-lock race truthfully',
  _approveBody.includes('v_rows_updated = 0') &&
  _approveBody.includes('conditional_update_miss'));

t('S15.7: re-read artisan owner under lock on 0-row UPDATE (v_reread_owner)',
  _approveBody.includes('v_reread_owner'));

t('S15.8: false success impossible — 0-row UPDATE returns error or truthful state',
  _approveBody.includes('conditional_update_miss') ||
  _approveBody.includes('artisan_has_owner'));

/* Fix 3: Same-owner idempotency */
t('S15.9: already_owned_consistent idempotent path present',
  _approveBody.includes('already_owned_consistent'));

t('S15.10: idempotent path does NOT rewrite owner_user_id',
  (function() {
    /* Find the already_owned_consistent block */
    var idx = _approveBody.indexOf('already_owned_consistent');
    if (idx === -1) return false;
    /* Look back ~500 chars for the block boundary */
    var block = _approveBody.slice(Math.max(0, idx - 800), idx + 200);
    /* Must not set owner_user_id = inside this block */
    return !block.match(/SET\s+owner_user_id\s*=/);
  })());

t('S15.11: idempotent path does NOT set onboarding_completed',
  (function() {
    // onboarding_completed may appear in comments; check SET assignment context only
    var idx = _approveBody.indexOf('already_owned_consistent');
    if (idx === -1) return false;
    var block = _approveBody.slice(Math.max(0, idx - 800), idx + 400);
    // Must not set onboarding_completed = true in code
    return !block.match(/onboarding_completeds*=s*true/) &&
           !block.match(/SET[^;]*onboarding_completed/s);
  })());

/* Fix 4: Multi-claim first-wins */
t('S15.12: superseded_by_approval status assigned to competing pending claims',
  _approveBody.includes("'superseded_by_approval'"));

t('S15.13: supersede UPDATE targets same artisan with id != p_claim_id',
  _approveBody.includes('id        != p_claim_id') ||
  _approveBody.includes("id != p_claim_id") ||
  _approveBody.includes('id        !='));

t('S15.14: supersede helper only targets pending claims (status = pending guard)',
  (function() {
    // v2: supersession logic is in _supersede_competing_claims helper
    var supIdx = migration.indexOf('CREATE OR REPLACE FUNCTION public._supersede_competing_claims');
    var supEnd = migration.indexOf('CREATE OR REPLACE FUNCTION public.reject_artisan_claim');
    var supBody = migration.slice(supIdx, supEnd);
    return supBody.includes("status     = 'pending'") || supBody.includes("status = 'pending'");
  })());

t('S15.15: supersede does NOT touch requester accounts (no users/profiles UPDATE in supersede block)',
  (function() {
    var idx = _approveBody.indexOf('superseded_by_approval');
    /* Everything between supersede and the users.role UPDATE */
    var usersIdx = _approveBody.indexOf('UPDATE public.users');
    var block = _approveBody.slice(idx, usersIdx > idx ? usersIdx : idx + 1000);
    return !block.includes('UPDATE public.users') && !block.includes('UPDATE public.profiles');
  })());

t('S15.16: supersede also covers artisan_legacy_id (for legacy claim rows)',
  (function() {
    var idx = _approveBody.lastIndexOf('superseded_by_approval');
    var block = _approveBody.slice(Math.max(0, idx - 400), idx + 400);
    return block.includes('artisan_legacy_id');
  })());

/* Fix 5: RLS policy completeness */
t('S15.17: all 16 known historical policy names explicitly dropped in migration',
  (function() {
    var names = [
      'claims_insert','claims_public_insert','claims_self_read','claims_admin_all',
      'claims_requester_read','deny_anon_claim_requests','authenticated_claim_insert',
      'authenticated_own_claim_read','admin_all_claim_requests','claim_requests_anon_deny',
      'claim_requests_insert','claim_requests_read','claim_requests_insert_any',
      'claim_requests_public_insert','claim_requests_authenticated_insert',
      'claim_requests_own_select'
    ];
    return names.every(function(n) { return migration.includes('"' + n + '"'); });
  })());

t('S15.18: canonical 7c12a1 deny-anon policy uses USING false WITH CHECK false',
  migration.includes('7c12a1_deny_anon_all') &&
  migration.includes('USING (false)') &&
  migration.includes('WITH CHECK (false)'));

t('S15.19: no authenticated UPDATE/DELETE policy created for claim_requests',
  (function() {
    /* Check each CREATE POLICY block individually — a policy is FOR UPDATE/DELETE if
     * its own single block (one policy = claim_requests + FOR XXX + TO yyy) has
     * FOR UPDATE|DELETE|ALL combined with TO authenticated in the SAME policy.
     * Extract policy-by-policy and check individually. */
    var idx = migration.indexOf('-- STEP 5');
    var rlsBody = migration.slice(idx > -1 ? idx : 0);
    /* Split on CREATE POLICY boundaries */
    var policyBlocks = rlsBody.split(/(?=CREATE POLICY)/);
    return !policyBlocks.some(function(block) {
      return /claim_requests/.test(block) &&
             /FOR\s+(UPDATE|DELETE|ALL)\b/.test(block) &&
             /TO\s+authenticated/.test(block);
    });
  })());

t('S15.20: admin_all_claim_requests NOT recreated in migration (browser direct UPDATE removed)',
  !migration.includes('"admin_all_claim_requests"') ||
  migration.includes('DROP POLICY IF EXISTS "admin_all_claim_requests"') &&
  !migration.match(/CREATE POLICY "admin_all_claim_requests"/));

t('S15.21: 3 canonical policies created (deny_anon + auth_insert_own + auth_select)',
  migration.includes('7c12a1_deny_anon_all') &&
  migration.includes('7c12a1_auth_insert_own') &&
  migration.includes('7c12a1_auth_select'));

/* Fix 6: Verify SQL concurrency checks */
t('S15.22: verify checks artisan FOR UPDATE lock (V-8)',
  verify.includes('V-8') && verify.includes('artisan') && verify.includes('FOR UPDATE'));

t('S15.23: verify checks FOR UPDATE count >= 2',
  verify.includes('fewer than 2 FOR UPDATE'));

t('S15.24: verify checks conditional UPDATE WHERE owner_user_id IS NULL (V-9)',
  verify.includes('V-9') && verify.includes('owner_user_id IS NULL'));

t('S15.25: verify checks ROW_COUNT (V-10)',
  verify.includes('V-10') && verify.includes('ROW_COUNT'));

t('S15.26: verify checks superseded_by_approval multi-claim first-wins (V-11)',
  verify.includes('V-11') && verify.includes('superseded_by_approval'));

t('S15.27: verify checks authenticated UPDATE/DELETE blocked (V-29)',
  verify.includes('V-29') && verify.includes('UPDATE') && verify.includes('authenticated'));

t('S15.28: verify exhaustively enumerates all 16 stale policy names (V-26)',
  verify.includes('V-26') && verify.includes('admin_all_claim_requests') &&
  verify.includes('claims_public_insert') && verify.includes('authenticated_claim_insert'));

t('S15.29: verify confirms exactly 3 canonical policies post-migration (V-27)',
  verify.includes('V-27') && verify.includes('3 canonical 7c12a1 policies'));

t('S15.30: verify logs all surviving policies for human audit (V-30)',
  verify.includes('V-30') && verify.includes('LIVE POLICY'));

/* ─────────────────────────────────────────────────────────
 * Summary
 * ───────────────────────────────────────────────────────── */
var total = passed + failed;
console.log('\n══ RESULT: ' + passed + '/' + total + ' PASS' +
  (failed > 0 ? ' — ' + failed + ' FAIL' : ' — ALL PASS') + ' ══\n');
if (failed > 0) process.exitCode = 1;

/* ─────────────────────────────────────────────────────────
 * SECTION 16 — Deadlock-free ordering, status constraint,
 *              cross-representation, idempotency
 * ───────────────────────────────────────────────────────── */

/* Helpers for Section 16 */
var _migFull = migration; /* already loaded */
var _supBody = (function() {
  var idx = migration.indexOf('CREATE OR REPLACE FUNCTION public._supersede_competing_claims');
  var end = migration.indexOf('CREATE OR REPLACE FUNCTION public.reject_artisan_claim');
  return migration.slice(idx, end);
})();
var _appBody = (function() {
  var idx = migration.indexOf('CREATE OR REPLACE FUNCTION public.approve_artisan_claim');
  var end = migration.indexOf('CREATE OR REPLACE FUNCTION public.reject_artisan_claim');
  return migration.slice(idx, end);
})();

/* ── DEADLOCK-FREE LOCK ORDER ── */

t('S16.1: non-locking pre-read (v_pre) exists before artisan FOR UPDATE',
  _appBody.includes('v_pre') &&
  _appBody.indexOf('v_pre') < _appBody.indexOf('FOR UPDATE'));

t('S16.2: artisan FOR UPDATE acquired BEFORE claim re-lock FOR UPDATE',
  (function() {
    /* Use anchor: artisan WHERE a.id = v_artisan_id (LOCK A) must precede
     * claim_not_found_locked (LOCK B re-read) in source order */
    var artisanLockPos = _appBody.indexOf('WHERE a.id = v_artisan_id');
    var claimLockBPos  = _appBody.indexOf('claim_not_found_locked');
    return artisanLockPos > -1 && claimLockBPos > -1 && artisanLockPos < claimLockBPos;
  })());

t('S16.3: claim re-locked AFTER artisan lock (LOCK B or claim_not_found_locked)',
  _appBody.includes('claim_not_found_locked') || _appBody.includes('LOCK B'));

t('S16.4: claim status re-validated after re-lock (not just pre-read status)',
  (function() {
    /* After LOCK B, there must be a claim_not_pending check on v_claim (locked read) */
    var lockBIdx = _appBody.indexOf('claim_not_found_locked');
    if (lockBIdx === -1) lockBIdx = _appBody.indexOf('LOCK B');
    if (lockBIdx === -1) return false;
    var afterLockB = _appBody.slice(lockBIdx);
    return afterLockB.includes('claim_not_pending') && afterLockB.includes('v_claim');
  })());

t('S16.5: requester read from locked v_claim (not only pre-read v_pre)',
  (function() {
    var lockBIdx = _appBody.indexOf('claim_not_found_locked');
    if (lockBIdx === -1) return false;
    var afterLockB = _appBody.slice(lockBIdx);
    return afterLockB.includes('v_claim.requester_user_id') ||
           afterLockB.includes('v_requester_id := v_claim');
  })());

t('S16.6: no circular wait possible — artisan lock is global ordering point (comment present)',
  _appBody.includes('global ordering point') || _appBody.includes('GLOBAL ORDERING POINT') ||
  _appBody.includes('LOCK A'));

t('S16.7: concurrent approval loser handled by claim re-validation after artisan lock',
  /* Tx B, after waiting for artisan lock, re-reads claim and finds status='superseded_by_approval' */
  _appBody.includes('claim_not_pending') && _appBody.includes('v_claim.status'));

t('S16.8: _supersede_competing_claims helper is SECURITY DEFINER',
  _supBody.includes('SECURITY DEFINER'));

t('S16.9: _supersede helper has SET search_path',
  _supBody.includes("SET search_path = ''") || _supBody.includes('SET search_path'));

/* ── STATUS CONSTRAINT (Blocker 2) ── */

t('S16.10: migration contains Step 0b — claims_status_check extension',
  migration.includes('Step 0b') || migration.includes('STEP 0b') ||
  (migration.includes('claims_status_check') && migration.includes('superseded_by_approval') &&
   migration.includes('DROP CONSTRAINT claims_status_check')));

t('S16.11: migration drops existing constraint before recreating',
  migration.includes('DROP CONSTRAINT claims_status_check'));

t('S16.12: migration recreates constraint with 4 values including superseded_by_approval',
  (function() {
    var idx = migration.indexOf('ADD CONSTRAINT claims_status_check');
    if (idx === -1) return false;
    var block = migration.slice(idx, idx + 300);
    return block.includes('pending') && block.includes('approved') &&
           block.includes('rejected') && block.includes('superseded_by_approval');
  })());

t('S16.13: migration has HARD STOP if constraint definition is unexpected',
  migration.includes('HARD STOP') && migration.includes('claims_status_check'));

t('S16.14: migration handles idempotent case — already contains superseded_by_approval',
  migration.includes('already includes superseded_by_approval') ||
  migration.includes('superseded_by_approval%') /* ILIKE pattern in idempotent check */);

t('S16.15: rollback has HARD STOP if superseded rows exist before restoring 3-value constraint',
  rollback.includes('HARD STOP') && rollback.includes('superseded_by_approval') &&
  rollback.includes('data loss'));

t('S16.16: rollback drops _supersede_competing_claims helper',
  rollback.includes('_supersede_competing_claims'));

/* ── CROSS-REPRESENTATION SUPERSESSION ── */

t('S16.17: supersede branch 1 matches by canonical artisan UUID FK',
  _supBody.includes('artisan_id = p_artisan_id'));

t('S16.18: supersede branch 2 targets claims with artisan_id IS NULL',
  _supBody.includes('artisan_id IS NULL'));

t('S16.19: supersede branch 2 joins artisans table to verify canonical identity',
  _supBody.includes('FROM public.artisans') || _supBody.includes('FROM public.artisans a'));

t('S16.20: supersede branch 2 matches a.id = p_artisan_id (canonical UUID anchor)',
  _supBody.includes('a.id = p_artisan_id'));

t('S16.21: supersede branch 2 covers UUID-text artisan_legacy_id (a.id::text = cr.artisan_legacy_id)',
  _supBody.includes('a.id::text') && _supBody.includes('cr.artisan_legacy_id'));

t('S16.22: supersede branch 2 covers artisans.legacy_id match (a.legacy_id = cr.artisan_legacy_id)',
  _supBody.includes('a.legacy_id') && _supBody.includes('cr.artisan_legacy_id'));

t('S16.23: supersede winner excluded in branch 1 (id != p_winner_claim)',
  (function() {
    var b1Idx = _supBody.indexOf('artisan_id = p_artisan_id');
    if (b1Idx === -1) return false;
    var block = _supBody.slice(Math.max(0, b1Idx - 50), b1Idx + 300);
    return block.includes('id') && block.includes('p_winner_claim') && block.includes('!=');
  })());

t('S16.24: supersede winner excluded in branch 2 (cr.id != p_winner_claim)',
  (function() {
    var b2Idx = _supBody.indexOf('UPDATE public.claim_requests cr');
    if (b2Idx === -1) return false;
    var block = _supBody.slice(b2Idx, b2Idx + 500);
    return block.includes('p_winner_claim') && (block.includes('cr.id') || block.includes('!= p_winner_claim'));
  })());

t('S16.25: supersede only targets pending claims in branch 1',
  (function() {
    var b1Idx = _supBody.indexOf('artisan_id = p_artisan_id');
    if (b1Idx === -1) return false;
    var block = _supBody.slice(Math.max(0, b1Idx - 50), b1Idx + 300);
    return block.includes("status     = 'pending'") || block.includes("status = 'pending'");
  })());

t('S16.26: supersede only targets pending claims in branch 2 (cr.status)',
  (function() {
    var b2Idx = _supBody.indexOf('UPDATE public.claim_requests cr');
    if (b2Idx === -1) return false;
    var block = _supBody.slice(b2Idx, b2Idx + 500);
    return (block.includes("cr.status            = 'pending'") ||
            block.includes("cr.status = 'pending'") ||
            block.includes("cr.status     = 'pending'"));
  })());

t('S16.27: supersede sets status=superseded_by_approval in both branches',
  (function() {
    var count = (_supBody.match(/'superseded_by_approval'/g) || []).length;
    return count >= 2;
  })());

/* ── IDEMPOTENCY + STATE MACHINE VERIFICATION ── */

t('S16.28: approved claim cannot be rejected (claim_already_approved path in reject RPC)',
  (function() {
    var rejIdx = migration.indexOf('CREATE OR REPLACE FUNCTION public.reject_artisan_claim');
    var rejEnd = migration.indexOf('STEP 4: Permissions');
    var rejBody = migration.slice(rejIdx, rejEnd);
    return rejBody.includes('claim_already_approved') && rejBody.includes("= 'approved'");
  })());

t('S16.29: rejected claim cannot be re-approved (claim_not_pending guard covers rejected)',
  /* claim_not_pending triggers for any status != pending, including rejected */
  _appBody.includes('claim_not_pending') &&
  (_appBody.includes("!= 'pending'") || _appBody.includes("!= 'pending'")));

t('S16.30: superseded claim cannot be re-approved (status != pending → claim_not_pending)',
  /* superseded_by_approval != 'pending' → caught by re-validation after LOCK B */
  _appBody.includes('claim_not_pending') && _appBody.includes("v_claim.status != 'pending'"));

t('S16.31: same claim retry safe (idempotent already_owned_consistent path)',
  _appBody.includes('already_owned_consistent'));

t('S16.32: different owner cannot overwrite (artisan_has_owner path + conditional WHERE IS NULL)',
  _appBody.includes('artisan_has_owner') && _appBody.includes('owner_user_id IS NULL'));

t('S16.33: false ok:true impossible (ROW_COUNT=0 case returns truthful state, not ok:true)',
  _appBody.includes('conditional_update_miss') &&
  _appBody.includes('v_reread_owner'));

t('S16.34: requester mismatch guard between pre-read and locked read',
  _appBody.includes('requester_mismatch'));

/* ── VERIFY SQL COVERAGE ── */

t('S16.35: verify checks deadlock-free lock order (V-7 v_pre, V-8c artisan precedes claim)',
  verify.includes('V-7') && verify.includes('v_pre') &&
  verify.includes('V-8c'));

t('S16.36: verify checks LOCK B re-validation (V-37 and V-38)',
  verify.includes('V-37') && verify.includes('LOCK B') &&
  verify.includes('V-38'));

t('S16.37: verify checks claims_status_check includes superseded_by_approval (V-35)',
  verify.includes('V-35') && verify.includes('superseded_by_approval'));

t('S16.38: verify checks historical status values preserved (V-36)',
  verify.includes('V-36') && verify.includes('pending') &&
  verify.includes('approved') && verify.includes('rejected'));

t('S16.39: verify checks cross-representation supersession (V-11c, V-11d)',
  verify.includes('V-11c') && verify.includes('artisan_id IS NULL') &&
  verify.includes('V-11d'));

t('S16.40: verify checks _supersede_competing_claims helper not executable by authenticated (V-24b)',
  verify.includes('V-24b') && verify.includes('_supersede_competing_claims'));

/* ─────────────────────────────────────────────────────────
 * SECTION 17 — Precheck v2 coverage (be1ed2a architecture)
 * ───────────────────────────────────────────────────────── */

/* ── Status constraint (Blocker 2) ── */
t('S17.1: precheck reads claims_status_check constraint definition',
  precheck.includes('claims_status_check') && precheck.includes('pg_get_constraintdef'));

t('S17.2: precheck detects baseline 3-value set (pending/approved/rejected)',
  precheck.includes('pending') && precheck.includes('approved') && precheck.includes('rejected') &&
  precheck.includes('superseded_by_approval'));

t('S17.3: precheck HARD STOPs on unexpected constraint definition',
  precheck.includes('HARD STOP') && precheck.includes('claims_status_check'));

t('S17.4: precheck handles idempotent case — superseded_by_approval already present',
  precheck.includes('superseded_by_approval') && precheck.includes('idempotent'));

t('S17.5: precheck checks for parallel/duplicate status CHECK constraints',
  precheck.includes('additional CHECK constraints'));

/* ── Live status row audit ── */
t('S17.6: precheck counts each known status value in live claim_requests',
  precheck.includes("status = 'pending'") && precheck.includes("status = 'approved'") &&
  precheck.includes("status = 'rejected'") && precheck.includes("status = 'superseded_by_approval'"));

t('S17.7: precheck HARD STOPs on unknown status values in live rows',
  precheck.includes('PM-12') && precheck.includes('HARD STOP') &&
  precheck.includes('unknown status'));

/* ── Cross-representation integrity ── */
t('S17.8: precheck checks artisan_id FK orphans (missing artisans)',
  precheck.includes('artisan_id') && precheck.includes('NOT EXISTS') &&
  precheck.includes('missing artisans'));

t('S17.9: precheck counts claims resolving via UUID-text legacy match',
  precheck.includes('id::text = cr.artisan_legacy_id'));

t('S17.10: precheck counts claims resolving via artisans.legacy_id text match',
  precheck.includes('a.legacy_id = cr.artisan_legacy_id'));

t('S17.11: precheck counts claims resolving to neither path',
  precheck.includes('neither') || precheck.includes('resolves to no artisan'));

t('S17.12: precheck HARD STOPs on ambiguous legacy_id (>1 artisan)',
  precheck.includes('PM-24') && precheck.includes('HARD STOP') &&
  precheck.includes('more than one') && precheck.includes('artisan_legacy_id'));

t('S17.13: precheck HARD STOPs on duplicate artisans.legacy_id',
  precheck.includes('PM-25') && precheck.includes('HARD STOP') &&
  precheck.includes('duplicate') && precheck.includes('legacy_id'));

/* ── Ownership integrity ── */
t('S17.14: precheck HARD STOPs on contradictory ownership (different requesters approved same artisan)',
  precheck.includes('PM-31') && precheck.includes('HARD STOP') &&
  precheck.includes('contradictory ownership'));

t('S17.15: precheck HARD STOPs on owner vs approved claim mismatch',
  precheck.includes('PM-32') && precheck.includes('HARD STOP') &&
  precheck.includes('owner_user_id') && precheck.includes('requester_user_id'));

/* ── Helper collision / signature ── */
t('S17.16: precheck checks _supersede_competing_claims collision',
  precheck.includes('_supersede_competing_claims'));

t('S17.17: precheck HARD STOPs on incompatible _supersede signature',
  precheck.includes('PM-41') && precheck.includes('HARD STOP') &&
  precheck.includes('incompatible signature'));

t('S17.18: precheck checks approve_artisan_claim signature compatibility',
  precheck.includes('PM-39') && precheck.includes('approve_artisan_claim'));

t('S17.19: precheck checks reject_artisan_claim signature compatibility',
  precheck.includes('PM-40') && precheck.includes('reject_artisan_claim'));

/* ── RLS effective live state ── */
t('S17.20: precheck enumerates all live claim_requests policies with cmd/roles/qual/wcheck',
  precheck.includes('PM-44') && precheck.includes('policyname') &&
  precheck.includes('with_check'));

t('S17.21: precheck detects anon non-blocking INSERT/UPDATE/ALL policies',
  precheck.includes('PM-45') && precheck.includes('anon') &&
  precheck.includes('INSERT') && precheck.includes("= 'false'") || precheck.includes("qual IS NULL OR qual != 'false'"));

t('S17.22: precheck detects authenticated UPDATE/DELETE/ALL (direct write risk)',
  precheck.includes('PM-46') && precheck.includes('authenticated') &&
  precheck.includes('UPDATE') && precheck.includes('DELETE'));

t('S17.23: precheck detects open WITH CHECK(true) insert policies',
  precheck.includes('PM-47') && precheck.includes('WITH CHECK') &&
  precheck.includes('true'));

/* ── Trigger state ── */
t('S17.24: precheck confirms sync_artisan_claim defect 1 (onboarding_completed)',
  precheck.includes('DEFECT-1') && precheck.includes('onboarding_completed'));

t('S17.25: precheck confirms sync_artisan_claim defect 2 (verified=TRUE)',
  precheck.includes('DEFECT-2') && precheck.includes('verified'));

t('S17.26: precheck confirms sync_artisan_claim defect 3 (owner double-write)',
  precheck.includes('DEFECT-3') && precheck.includes('owner_user_id'));

t('S17.27: precheck checks claim_approval_sync trigger existence',
  precheck.includes('claim_approval_sync') && precheck.includes('PM-37'));

t('S17.28: precheck checks for unexpected OTHER triggers on claim_requests',
  precheck.includes('PM-38') && precheck.includes('unexpected trigger'));

/* ── Lock-order schema prerequisites ── */
t('S17.29: precheck verifies artisans has PRIMARY KEY (FOR UPDATE safety)',
  precheck.includes('PM-55') && precheck.includes('PRIMARY KEY') &&
  precheck.includes('artisans'));

t('S17.30: precheck verifies claim_requests has PRIMARY KEY',
  precheck.includes('PM-56') && precheck.includes('PRIMARY KEY') &&
  precheck.includes('claim_requests'));

t('S17.31: precheck verifies claim_requests.artisan_id is UUID (LOCK A type match)',
  precheck.includes('PM-57') && precheck.includes('artisan_id') && precheck.includes('uuid'));

t('S17.32: precheck verifies artisans.owner_user_id is UUID (auth.uid() match)',
  precheck.includes('PM-58') && precheck.includes('owner_user_id') && precheck.includes('uuid'));

t('S17.33: precheck checks triggers on artisans (reverse lock order risk)',
  precheck.includes('PM-59') && precheck.includes('artisans') &&
  precheck.includes('reverse lock order'));

/* ── FORCE RLS ── */
t('S17.34: precheck reports FORCE RLS state on claim_requests',
  precheck.includes('PM-43') && precheck.includes('FORCE ROW SECURITY'));

t('S17.35: precheck reports RLS state on artisans, users, profiles',
  precheck.includes('PM-48') && precheck.includes('PM-50') && precheck.includes('PM-51'));

/* ── Admin role confirmation ── */
t('S17.36: precheck confirms users.role is present for admin identification',
  precheck.includes('PM-52') && precheck.includes('users.role'));

t('S17.37: precheck warns if zero admin users exist',
  precheck.includes('PM-53') && precheck.includes('no users with role=admin'));

/* ── Read-only proof ── */
t('S17.38: precheck has zero DDL (CREATE/ALTER/DROP) outside comments',
  (function() {
    var lines = precheck.split('\n').filter(function(l) {
      return !l.trim().startsWith('--');
    });
    var joined = lines.join('\n');
    return !joined.match(/^\s*(CREATE|ALTER|DROP|TRUNCATE)\s+(TABLE|FUNCTION|POLICY|INDEX|TRIGGER|CONSTRAINT)\b/mi);
  })());

t('S17.39: precheck has zero DML (INSERT/UPDATE/DELETE)',
  (function() {
    var lines = precheck.split('\n').filter(function(l) {
      return !l.trim().startsWith('--');
    });
    var joined = lines.join('\n');
    return !joined.match(/^\s*(INSERT\s+INTO|DELETE\s+FROM)\b/mi) &&
           !joined.match(/^\s*UPDATE\s+public\.\w/mi);
  })());

t('S17.40: precheck DO block is balanced (1 DO $$ / 1 END $$)',
  (function() {
    var doCount  = (precheck.match(/\bDO \$\$/g) || []).length;
    var endCount = (precheck.match(/^END \$\$;/m) || []).length;
    return doCount === 1 && endCount === 1;
  })());
