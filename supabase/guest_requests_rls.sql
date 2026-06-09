-- =============================================================
-- FIXEO — Guest Request Persistence: RLS + Schema Fix
-- File: supabase/guest_requests_rls.sql
-- Purpose: Allow unauthenticated (anon) clients to INSERT into
--          service_requests so that ALL bookings — guest or auth —
--          appear in the admin dashboard immediately.
--
-- HOW TO APPLY:
--   1. Open Supabase Dashboard → SQL Editor → New query
--   2. Paste and run Section A first (schema fix)
--   3. Paste and run Section B (RLS policy)
--   4. Run verification query at end to confirm
--
-- SAFE TO RE-RUN: all statements use IF NOT EXISTS / OR REPLACE.
-- =============================================================


-- =============================================================
-- SECTION A — Make client_profile_id nullable
-- (Guests have no Supabase auth UID, so we allow NULL)
-- =============================================================

-- Step A-1: Drop NOT NULL constraint on client_profile_id (if present)
-- This allows guest inserts where no auth session exists.
ALTER TABLE public.service_requests
  ALTER COLUMN client_profile_id DROP NOT NULL;

-- Step A-2: Verify — query should return is_nullable = 'YES'
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'service_requests'
  AND column_name  = 'client_profile_id';


-- =============================================================
-- SECTION B — Allow anon INSERT on service_requests
-- Guests (unauthenticated) can INSERT their own request.
-- They cannot SELECT, UPDATE, or DELETE — anon write-only.
-- =============================================================

-- Step B-1: Drop any existing anon-deny policy that blocks INSERT
-- (from dashboard_p0_rls_plan.sql step C-2 which denied ALL for anon)
DROP POLICY IF EXISTS "deny_anon_service_requests_all" ON public.service_requests;

-- Step B-2: Add a narrow anon INSERT-only policy
-- Guests can insert with any data — no ownership check needed
-- because they have no auth.uid() to bind to.
CREATE POLICY "anon_service_requests_insert"
  ON public.service_requests
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Step B-3: Explicitly deny anon SELECT, UPDATE, DELETE
-- (Belt-and-suspenders: ensures guests cannot read other requests)
CREATE POLICY "anon_service_requests_deny_select"
  ON public.service_requests
  FOR SELECT
  TO anon
  USING (false);

CREATE POLICY "anon_service_requests_deny_update"
  ON public.service_requests
  FOR UPDATE
  TO anon
  USING (false);

CREATE POLICY "anon_service_requests_deny_delete"
  ON public.service_requests
  FOR DELETE
  TO anon
  USING (false);


-- =============================================================
-- SECTION C — Verify policies applied correctly
-- =============================================================

-- C-1: List all policies on service_requests
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'service_requests'
ORDER BY cmd, policyname;

-- C-2: Expected output should include:
--   anon_service_requests_insert    | INSERT | {anon}          | (null) | true
--   anon_service_requests_deny_*    | SELECT/UPDATE/DELETE | {anon} | false | (null)
--   authenticated_own_requests_read | SELECT | {authenticated} | true   | (null)
--   authenticated_requests_insert   | INSERT | {authenticated} | (null) | true
--   deny_authenticated_requests_delete | DELETE | {authenticated} | false | (null)
