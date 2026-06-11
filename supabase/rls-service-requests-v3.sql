-- ============================================================
-- FIXEO — service_requests RLS v3
-- File: supabase/rls-service-requests-v3.sql
-- Date: 2026-06-11
-- Apply: Supabase Dashboard → SQL Editor → New query → Run
--
-- ── WHY THIS FILE EXISTS ────────────────────────────────────
-- dashboard_p0_rls_plan.sql (Step C-5) created:
--   CREATE POLICY "authenticated_own_requests_read"
--     FOR SELECT TO authenticated USING(true);   ← WIDE OPEN
--
-- This gives EVERY authenticated user (client, artisan, admin)
-- SELECT access to ALL service_requests rows — across all clients.
-- Any logged-in artisan can enumerate every booking description,
-- city, and client_profile_id in the database.
--
-- The anon SELECT gap reported in the 2026-06-11 certification
-- audit was a FALSE POSITIVE (probe rows reflected back at INSERT
-- time). Anon SELECT is already blocked by:
--   anon_service_requests_deny_select USING(false)
--
-- This file fixes the authenticated SELECT policy and hardens
-- INSERT ownership binding. anon INSERT is preserved for the
-- guest booking flow.
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────
-- Step 1: DROP the wide-open authenticated SELECT policy
-- Step 2: DROP the unbound authenticated INSERT policy
-- Step 3: CREATE narrow client SELECT (own rows only)
-- Step 4: CREATE explicit admin ALL policy
-- Step 5: CREATE narrow authenticated INSERT (ownership bound)
-- (artisan SELECT, artisan UPDATE, client UPDATE policies are NOT
--  touched — they are correct and remain in place)
-- (anon INSERT, anon deny SELECT/UPDATE/DELETE are NOT touched)
--
-- ── POLICIES THAT REMAIN UNCHANGED (DO NOT DROP) ────────────
--   anon_service_requests_insert         (guest booking — keep)
--   anon_service_requests_deny_select    (keep)
--   anon_service_requests_deny_update    (keep)
--   anon_service_requests_deny_delete    (keep)
--   artisan_read_own_linked_requests     (keep)
--   client_own_requests_update           (keep)
--   artisan_update_assigned_requests     (keep)
--   deny_authenticated_requests_delete   (keep)
--
-- ── SAFE TO RE-RUN: idempotent DROP IF EXISTS ───────────────
-- ============================================================


-- ── Step 1: Drop the wide-open authenticated SELECT policy ──
-- This is the root cause: USING(true) lets any authenticated
-- user read all rows regardless of ownership.
DROP POLICY IF EXISTS "authenticated_own_requests_read" ON public.service_requests;


-- ── Step 2: Drop the unbound authenticated INSERT policy ────
-- WITH CHECK(true) allows inserting with any client_profile_id.
-- Replaced below with an ownership-bound version.
DROP POLICY IF EXISTS "authenticated_requests_insert"   ON public.service_requests;


-- ── Step 3: Drop any existing admin policy (idempotent) ─────
DROP POLICY IF EXISTS "admin_all_service_requests"      ON public.service_requests;
DROP POLICY IF EXISTS "sreq_admin_all"                  ON public.service_requests;


-- ── Step 4: DROP stale policies from rls-phase2 (if applied) ─
-- rls-phase2-2026-05-08.sql created sreq_self_read and sreq_client_insert
-- which may conflict. Drop them idempotently.
DROP POLICY IF EXISTS "sreq_self_read"                  ON public.service_requests;
DROP POLICY IF EXISTS "sreq_client_insert"              ON public.service_requests;
DROP POLICY IF EXISTS "sreq_artisan_read"               ON public.service_requests;


-- ============================================================
-- STEP 5: CREATE admin full access
-- Admin can SELECT / INSERT / UPDATE / DELETE all rows.
-- Checks both public.users and public.profiles for role='admin'
-- (same dual-table pattern as admin_all_missions).
-- ============================================================
CREATE POLICY "admin_all_service_requests"
  ON public.service_requests
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );


-- ============================================================
-- STEP 6: CREATE client SELECT own requests only
-- Client can read only rows where client_profile_id = their UID.
-- Replaces USING(true) with a proper ownership filter.
-- Does NOT conflict with artisan_read_own_linked_requests
-- (that policy remains and uses a missions-join USING clause).
-- OR logic: a row is visible if EITHER policy passes —
-- so artisans see their linked requests, clients see their own,
-- admins see all (via admin_all_service_requests above).
-- ============================================================
CREATE POLICY "client_own_requests_read"
  ON public.service_requests
  FOR SELECT
  TO authenticated
  USING (
    client_profile_id = auth.uid()
  );


-- ============================================================
-- STEP 7: CREATE authenticated INSERT — ownership bound
-- Authenticated clients can INSERT only if they set
-- client_profile_id = their own auth.uid().
-- Prevents one client from impersonating another.
-- Guest (anon) INSERT is handled by anon_service_requests_insert
-- and is NOT affected by this policy.
-- ============================================================
CREATE POLICY "client_own_requests_insert"
  ON public.service_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    client_profile_id = auth.uid()
  );


-- ============================================================
-- VERIFICATION QUERIES
-- Run these AFTER applying the above. All must pass.
-- ============================================================

-- V1: List all active policies on service_requests
-- Expected: 9 policies total (4 anon + 5 authenticated)
SELECT
  policyname,
  cmd,
  roles,
  qual AS using_expr,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'service_requests'
ORDER BY roles, cmd, policyname;

-- Expected policy list:
--   anon_service_requests_deny_delete    | DELETE | {anon}          | false
--   anon_service_requests_deny_select    | SELECT | {anon}          | false
--   anon_service_requests_deny_update    | UPDATE | {anon}          | false
--   anon_service_requests_insert         | INSERT | {anon}          | (null) | true
--   admin_all_service_requests           | ALL    | {authenticated} | (admin check)
--   artisan_read_own_linked_requests     | SELECT | {authenticated} | (missions join)
--   artisan_update_assigned_requests     | UPDATE | {authenticated} | (artisan check)
--   client_own_requests_insert           | INSERT | {authenticated} | (null) | client_profile_id=auth.uid()
--   client_own_requests_read             | SELECT | {authenticated} | client_profile_id=auth.uid()
--   client_own_requests_update           | UPDATE | {authenticated} | client_profile_id=auth.uid()
--   deny_authenticated_requests_delete   | DELETE | {authenticated} | false


-- V2: Confirm wide-open policy is gone
-- Must return 0 rows
SELECT policyname FROM pg_policies
WHERE tablename = 'service_requests'
  AND policyname = 'authenticated_own_requests_read';
-- → 0 rows

-- V3: Confirm admin policy present
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'service_requests'
  AND policyname = 'admin_all_service_requests';
-- → 1 row, cmd = ALL

-- V4: Confirm anon INSERT still works (guest booking)
-- Run from a REST client with only the anon key:
-- POST /rest/v1/service_requests
-- {"service_category":"Test","city":"Test","description":"v3-verify","status":"new"}
-- Expected: HTTP 201

-- V5: Confirm anon SELECT still blocked
-- GET /rest/v1/service_requests?select=id
-- Expected: HTTP 200, body = []

-- V6: Confirm authenticated client reads ONLY own rows
-- (Run as a client session)
-- GET /rest/v1/service_requests?select=id,client_profile_id
-- All returned rows must have client_profile_id = <your auth.uid()>

-- V7: Clean up any V4 test rows inserted during verification
-- DELETE FROM public.service_requests WHERE description = 'v3-verify';
-- (Must be run as admin session — anon DELETE is blocked)
-- ============================================================
