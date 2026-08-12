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
  migration.includes("REVOKE EXECUTE ON FUNCTION public.approve_artisan_claim(uuid)         FROM anon") &&
  migration.includes("REVOKE EXECUTE ON FUNCTION public.reject_artisan_claim(uuid, text)    FROM anon"));

t('S6.13: authenticated GRANTED to RPCs (admin check is internal)',
  migration.includes("GRANT  EXECUTE ON FUNCTION public.approve_artisan_claim(uuid)         TO authenticated") &&
  migration.includes("GRANT  EXECUTE ON FUNCTION public.reject_artisan_claim(uuid, text)    TO authenticated"));

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
    var artisanIdIdx = body.indexOf('v_claim.artisan_id');
    var legacyIdx    = body.indexOf('v_claim.artisan_legacy_id');
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
    var idx = _approveBody.indexOf('already_owned_consistent');
    if (idx === -1) return false;
    var block = _approveBody.slice(Math.max(0, idx - 800), idx + 200);
    return !block.includes('onboarding_completed');
  })());

/* Fix 4: Multi-claim first-wins */
t('S15.12: superseded_by_approval status assigned to competing pending claims',
  _approveBody.includes("'superseded_by_approval'"));

t('S15.13: supersede UPDATE targets same artisan with id != p_claim_id',
  _approveBody.includes('id        != p_claim_id') ||
  _approveBody.includes("id != p_claim_id") ||
  _approveBody.includes('id        !='));

t('S15.14: supersede UPDATE only targets pending claims (status = pending guard)',
  (function() {
    var idx = _approveBody.indexOf('superseded_by_approval');
    var block = _approveBody.slice(Math.max(0, idx - 300), idx + 300);
    return block.includes("status     = 'pending'") ||
           block.includes("status = 'pending'");
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
    /* Scan migration for CREATE POLICY on claim_requests with FOR UPDATE/DELETE/ALL to authenticated */
    var idx = migration.indexOf('-- STEP 5');
    var rlsBody = migration.slice(idx);
    /* Should not have FOR UPDATE or FOR DELETE or FOR ALL for authenticated */
    return !rlsBody.match(/CREATE POLICY.*claim_requests[\s\S]{0,200}FOR (UPDATE|DELETE|ALL)[\s\S]{0,200}TO authenticated/m);
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
