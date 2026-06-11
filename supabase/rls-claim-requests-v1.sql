-- ============================================================
-- FIXEO — claim_requests RLS v1
-- File: supabase/rls-claim-requests-v1.sql
-- Date: 2026-06-11
-- Apply: Supabase Dashboard → SQL Editor → New query → Run
--
-- WHY:
--   claim_requests currently has RLS that blocks all anon INSERT.
--   Authenticated users also cannot INSERT (HTTP 401 confirmed).
--   This blocks artisans from submitting claims after logging in.
--
-- WHAT THIS DOES:
--   1. Enables RLS (idempotent)
--   2. Drops stale/conflicting policies
--   3. Creates 4 policies:
--        a. deny_anon_claim_requests      — anon blocked for ALL
--        b. authenticated_claim_insert    — authenticated user INSERT own claim
--        c. authenticated_own_claim_read  — authenticated user reads own claims
--        d. admin_all_claim_requests      — admin full access (SELECT/INSERT/UPDATE/DELETE)
--
-- DOES NOT touch: artisans, missions, service_requests, profiles, users
-- SAFE TO RE-RUN: all DROP IF EXISTS / CREATE
-- ============================================================


-- Step 1: Enable RLS (idempotent)
ALTER TABLE public.claim_requests ENABLE ROW LEVEL SECURITY;


-- Step 2: Drop stale policies
DROP POLICY IF EXISTS "deny_anon_claim_requests"      ON public.claim_requests;
DROP POLICY IF EXISTS "authenticated_claim_insert"    ON public.claim_requests;
DROP POLICY IF EXISTS "authenticated_own_claim_read"  ON public.claim_requests;
DROP POLICY IF EXISTS "admin_all_claim_requests"      ON public.claim_requests;
DROP POLICY IF EXISTS "claim_requests_anon_deny"      ON public.claim_requests;
DROP POLICY IF EXISTS "claim_requests_insert"         ON public.claim_requests;
DROP POLICY IF EXISTS "claim_requests_read"           ON public.claim_requests;


-- Step 3a: Deny ALL for anon
CREATE POLICY "deny_anon_claim_requests"
  ON public.claim_requests
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);


-- Step 3b: Authenticated user can INSERT their own claim
-- WITH CHECK ensures requester_user_id = their own auth.uid()
-- Prevents one user from submitting a claim on behalf of another
CREATE POLICY "authenticated_claim_insert"
  ON public.claim_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requester_user_id = auth.uid()
  );


-- Step 3c: Authenticated user can SELECT their own claims
-- Artisan can check the status of their own pending claim
CREATE POLICY "authenticated_own_claim_read"
  ON public.claim_requests
  FOR SELECT
  TO authenticated
  USING (
    requester_user_id = auth.uid()
  );


-- Step 3d: Admin full access — SELECT / INSERT / UPDATE / DELETE
-- Admin needs to read all pending claims and approve/reject them.
-- Checks both users.role and profiles.role (dual-table admin pattern).
CREATE POLICY "admin_all_claim_requests"
  ON public.claim_requests
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
-- VERIFICATION QUERIES (run after applying)
-- ============================================================

-- V1: Confirm RLS enabled
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'claim_requests';
-- → relrowsecurity = true

-- V2: List all 4 policies
SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'claim_requests'
ORDER BY policyname;
-- Expected:
--   admin_all_claim_requests       | ALL    | {authenticated}
--   authenticated_claim_insert     | INSERT | {authenticated}
--   authenticated_own_claim_read   | SELECT | {authenticated}
--   deny_anon_claim_requests       | ALL    | {anon}

-- V3: Anon INSERT blocked
-- POST /rest/v1/claim_requests {"artisan_legacy_id":"test","status":"pending"}
-- → HTTP 401 (42501) ✅

-- V4: Authenticated user INSERT with own requester_user_id
-- (Run as authenticated artisan session)
-- POST /rest/v1/claim_requests
-- {"artisan_legacy_id":"<uuid>","requester_user_id":"<auth.uid()>",
--  "requester_name":"Test","requester_phone":"0600000000",
--  "onboarding_data":"{}","status":"pending"}
-- → HTTP 201 ✅

-- V5: Admin can SELECT all (run as admin session)
-- GET /rest/v1/claim_requests?select=id,status
-- → All rows visible ✅
-- ============================================================
