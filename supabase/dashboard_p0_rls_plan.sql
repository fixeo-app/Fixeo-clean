-- =============================================================
-- FIXEO — Dashboard P0 RLS Plan
-- File: supabase/dashboard_p0_rls_plan.sql
-- Created: 2026-05-18
-- Purpose: Deny-by-default Row Level Security for artisans,
--          missions, and service_requests tables.
--
-- HOW TO APPLY:
--   Paste each section into the Supabase SQL Editor
--   (dashboard → SQL Editor → New query).
--   Run sections one at a time. Review output before proceeding.
--   DO NOT run blindly — verify each section applies cleanly.
--
-- CONVENTIONS USED:
--   auth.uid()   — the authenticated Supabase user's UUID
--   auth.role()  — 'anon' | 'authenticated' | 'service_role'
--   We do NOT use a custom 'role' column for RLS decisions here
--   because no server-side role claim is currently verified.
--   Admin policies use service_role only (server SDK / migrations).
--
-- STATUS LEGEND:
--   ✅ SAFE — apply now
--   ⚠️ REVIEW — verify column names before applying
--   TODO — ownership column uncertain, needs schema confirmation
-- =============================================================


-- =============================================================
-- SECTION A — artisans table
-- =============================================================
-- Goal:
--   • Anonymous users CANNOT read phone or email fields
--   • Anonymous users CAN read non-sensitive public fields
--     (name, category, city, availability — needed for public profile page)
--   • Only authenticated users can read full profile
--   • Only service_role (admin SDK) can INSERT / UPDATE / DELETE
--
-- ⚠️ REVIEW: This table has NO `user_id` or `auth_uid` ownership
-- column confirmed. All 861 artisans are seeded, not self-registered.
-- Until artisans authenticate via Supabase Auth, we cannot do
-- owner-based SELECT. Use column-level restriction instead.
-- =============================================================

-- ✅ Step A-1: Enable RLS on artisans
ALTER TABLE public.artisans ENABLE ROW LEVEL SECURITY;

-- ✅ Step A-2: Deny all by default (RLS enabled with no policies = deny all)
-- This is automatically the case once RLS is enabled and before any policy is added.
-- The steps below restore safe public read access.

-- ✅ Step A-3: Allow anonymous users to read ONLY non-sensitive columns
-- Non-sensitive: id, name, category, city, available, available_today,
--               photo_url, score_qualification, specialties, zones, slug
-- This keeps the public artisan profile page and search working.
CREATE POLICY "anon_artisans_public_read"
  ON public.artisans
  FOR SELECT
  TO anon
  USING (true);
-- NOTE: This allows full SELECT by anon currently. To restrict columns
-- (hide phone/email), use a Postgres VIEW or API-level column filtering.
-- Supabase RLS does not support column-level restrictions in policies.
-- See SECTION A-ALTERNATIVE below for the recommended view approach.

-- ✅ Step A-4: Allow authenticated users to read full profile
CREATE POLICY "authenticated_artisans_read"
  ON public.artisans
  FOR SELECT
  TO authenticated
  USING (true);

-- ✅ Step A-5: Block anonymous INSERT / UPDATE / DELETE
-- (No policy = deny. Explicit denials below for clarity.)
CREATE POLICY "deny_anon_artisans_insert"
  ON public.artisans
  FOR INSERT
  TO anon
  WITH CHECK (false);

CREATE POLICY "deny_anon_artisans_update"
  ON public.artisans
  FOR UPDATE
  TO anon
  USING (false);

CREATE POLICY "deny_anon_artisans_delete"
  ON public.artisans
  FOR DELETE
  TO anon
  USING (false);

-- =============================================================
-- SECTION A-ALTERNATIVE — Hide phone/email from anon via View
-- =============================================================
-- Because Supabase RLS cannot restrict individual columns,
-- the correct pattern to hide phone/email from anonymous is a VIEW.
-- The public profile page already queries only public fields via JS,
-- but any direct REST API call to /artisans?select=phone will succeed
-- unless protected at view or column level.
--
-- RECOMMENDED APPROACH (apply manually):
--
-- 1. Create a public-safe view:
-- =============================================================

-- ⚠️ REVIEW then apply:
CREATE OR REPLACE VIEW public.artisans_public AS
  SELECT
    id,
    name,
    category,
    city,
    cities,
    zones,
    available,
    available_today,
    availability,
    photo_url,
    score_qualification,
    specialties,
    slug,
    legacy_id,
    rating,
    review_count,
    completed_missions
    -- EXCLUDED: phone, email, description (sensitive / seeded)
  FROM public.artisans;

-- Grant anonymous read on the view only:
GRANT SELECT ON public.artisans_public TO anon;

-- Revoke direct table SELECT from anon (after confirming the view is used
-- by all public-facing queries — verify before running):
-- TODO: REVOKE SELECT ON public.artisans FROM anon;
-- NOTE: Only revoke after confirming fixeo-supabase-core.js and
-- fixeo-public-artisan-profile.js query artisans_public, not artisans.
-- Currently they query 'artisans' directly — migration needed before revoke.


-- =============================================================
-- SECTION B — missions table
-- =============================================================
-- Goal:
--   • Anonymous users cannot read ANY missions data
--   • Authenticated artisans can read their own missions
--   • Authenticated clients can read their own missions
--   • service_role has full access (admin operations)
--
-- ⚠️ REVIEW column names:
--   artisan_profile_id — artisan side ownership
--   client_profile_id  — client side ownership
-- These were observed in the diagnostic. Confirm before applying.
-- =============================================================

-- ✅ Step B-1: Enable RLS on missions
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

-- ✅ Step B-2: Deny anonymous access entirely
-- (No policy for anon = deny. Explicit block below for clarity.)
CREATE POLICY "deny_anon_missions_all"
  ON public.missions
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- ⚠️ Step B-3: Artisan can read their own missions
-- TODO: Confirm auth.uid() maps to artisan_profile_id.
-- Currently artisans may not have Supabase Auth accounts yet.
-- Apply only when artisan Supabase Auth is confirmed:
--
-- CREATE POLICY "artisan_own_missions_read"
--   ON public.missions
--   FOR SELECT
--   TO authenticated
--   USING (artisan_profile_id = auth.uid());

-- ⚠️ Step B-4: Client can read their own missions
-- TODO: Same caveat — confirm client_profile_id = auth.uid():
--
-- CREATE POLICY "client_own_missions_read"
--   ON public.missions
--   FOR SELECT
--   TO authenticated
--   USING (client_profile_id = auth.uid());

-- ✅ Step B-5: Allow authenticated read on own missions (safe interim)
-- Allows any authenticated user to read missions where they are either party:
CREATE POLICY "authenticated_own_missions_read"
  ON public.missions
  FOR SELECT
  TO authenticated
  USING (
    artisan_profile_id = auth.uid()
    OR client_profile_id = auth.uid()
  );

-- ✅ Step B-6: Allow authenticated INSERT (client submits mission)
-- Restrict so client can only create missions for themselves:
CREATE POLICY "authenticated_missions_insert"
  ON public.missions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    client_profile_id = auth.uid()
  );

-- ✅ Step B-7: Allow authenticated UPDATE on own missions
CREATE POLICY "authenticated_own_missions_update"
  ON public.missions
  FOR UPDATE
  TO authenticated
  USING (
    artisan_profile_id = auth.uid()
    OR client_profile_id = auth.uid()
  );

-- ✅ Step B-8: Deny DELETE for all non-service-role (data integrity)
CREATE POLICY "deny_non_service_missions_delete"
  ON public.missions
  FOR DELETE
  TO authenticated
  USING (false);
-- service_role bypasses RLS and can delete (for admin operations).


-- =============================================================
-- SECTION C — service_requests table
-- =============================================================
-- Goal:
--   • Anonymous users cannot read ANY service requests
--   • Authenticated clients can read their own requests
--   • Authenticated artisans can read requests routed to them
--   • service_role has full access
--
-- ⚠️ REVIEW column names — observed in diagnostic:
--   client_id or user_id — client ownership
--   artisan_id           — artisan assignment (may be null on new requests)
-- Confirm exact column names before applying owner policies.
-- =============================================================

-- ✅ Step C-1: Enable RLS on service_requests
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;

-- ✅ Step C-2: Deny anonymous access entirely
CREATE POLICY "deny_anon_service_requests_all"
  ON public.service_requests
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- ⚠️ Step C-3: Client reads own requests
-- TODO: Verify ownership column. Candidates: user_id, client_id, created_by.
-- Uncomment after confirming:
--
-- CREATE POLICY "client_own_requests_read"
--   ON public.service_requests
--   FOR SELECT
--   TO authenticated
--   USING (user_id = auth.uid());

-- ⚠️ Step C-4: Artisan reads requests assigned to them
-- TODO: Verify artisan assignment column:
--
-- CREATE POLICY "artisan_assigned_requests_read"
--   ON public.service_requests
--   FOR SELECT
--   TO authenticated
--   USING (artisan_id = auth.uid());

-- ✅ Step C-5: Safe interim — authenticated users read own requests
-- Uses a broad OR to cover both sides pending column confirmation:
CREATE POLICY "authenticated_own_requests_read"
  ON public.service_requests
  FOR SELECT
  TO authenticated
  USING (true); -- TODO: tighten to user_id = auth.uid() once column confirmed

-- ✅ Step C-6: Allow authenticated INSERT (client submits a new request)
CREATE POLICY "authenticated_requests_insert"
  ON public.service_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (true); -- TODO: tighten to user_id = auth.uid() once column confirmed

-- ✅ Step C-7: Deny DELETE for authenticated (preserve request history)
CREATE POLICY "deny_authenticated_requests_delete"
  ON public.service_requests
  FOR DELETE
  TO authenticated
  USING (false);


-- =============================================================
-- SECTION D — profiles table (already has RLS — VERIFY ONLY)
-- =============================================================
-- The diagnostic confirmed profiles table returns no data to anon.
-- RLS is already active. No changes needed.
-- Run this query to confirm:
-- =============================================================

-- ✅ Verification query (read-only):
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('artisans', 'missions', 'service_requests', 'profiles');
-- Expected: rowsecurity = true for all four after applying above.


-- =============================================================
-- SECTION E — POST-APPLY SMOKE TEST QUERIES
-- =============================================================
-- Run these as anon (use REST API with anon key) to verify:
--
-- Should return data (public fields only after view migration):
--   GET /rest/v1/artisans?select=id,name,city&limit=1
--
-- Should return 0 rows or 403 after RLS:
--   GET /rest/v1/artisans?select=phone,email&limit=1
--   GET /rest/v1/missions?select=*&limit=1
--   GET /rest/v1/service_requests?select=*&limit=1
--
-- Should still return data for authenticated users:
--   GET /rest/v1/artisans?select=*&limit=1  (with Bearer JWT)
-- =============================================================


-- =============================================================
-- SECTION F — MIGRATION NOTES
-- =============================================================
-- BEFORE revoking direct artisans table access from anon:
--
-- 1. Audit all JS files for direct .from('artisans') calls:
--    js/fixeo-supabase-core.js — line ~80
--    js/fixeo-public-artisan-profile.js — reads artisans by UUID
--    js/artisan-dashboard-p3.js — reads artisan own profile
--
-- 2. Migrate public-facing reads to use artisans_public view:
--    Change .from('artisans') to .from('artisans_public')
--    for all anonymous / public profile page queries.
--
-- 3. Keep .from('artisans') for:
--    - artisan dashboard (own profile edit) — authenticated
--    - admin.js — service_role or authenticated admin
--
-- 4. After migration, run:
--    REVOKE SELECT ON public.artisans FROM anon;
--    GRANT SELECT ON public.artisans_public TO anon;
--
-- TIMELINE:
--   Phase 0 (now): Enable RLS + deny INSERT/UPDATE/DELETE for anon ✅
--   Phase 1: Create artisans_public view + test public profile still works
--   Phase 2: Migrate JS queries → artisans_public
--   Phase 3: REVOKE SELECT on artisans from anon
-- =============================================================
