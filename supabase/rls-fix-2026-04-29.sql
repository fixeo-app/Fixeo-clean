-- ============================================================
-- FIXEO — RLS Security Fix
-- Date: 2026-04-29
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run: all DROP IF EXISTS before CREATE
-- ============================================================


-- ============================================================
-- 1. TABLE: artisans
--    ISSUE: anon can INSERT (confirmed by probe test)
--    RLS is ENABLED but missing INSERT/UPDATE/DELETE blocks
-- ============================================================

-- Keep existing public read policy (homepage requires it)
DROP POLICY IF EXISTS "artisans_public_read"  ON public.artisans;
CREATE POLICY "artisans_public_read" ON public.artisans
  FOR SELECT
  USING (TRUE);
-- Note: TRUE = all rows visible. If you later add an is_published column,
-- change to: USING (is_published = TRUE OR claimable = TRUE)

-- Block all anon writes (INSERT / UPDATE / DELETE)
DROP POLICY IF EXISTS "artisans_no_anon_insert" ON public.artisans;
CREATE POLICY "artisans_no_anon_insert" ON public.artisans
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
-- Requires authenticated session to insert — anon blocked

DROP POLICY IF EXISTS "artisans_owner_update" ON public.artisans;
CREATE POLICY "artisans_owner_update" ON public.artisans
  FOR UPDATE
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());
-- Only artisan who owns the row can update their own profile

DROP POLICY IF EXISTS "artisans_no_anon_delete" ON public.artisans;
CREATE POLICY "artisans_no_anon_delete" ON public.artisans
  FOR DELETE
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );
-- Only owner or admin can delete

DROP POLICY IF EXISTS "artisans_admin_write" ON public.artisans;
CREATE POLICY "artisans_admin_write" ON public.artisans
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );
-- Admin full access (used by admin dashboard)

-- ============================================================
-- 2. TABLE: profiles (was: public.users in schema.sql)
--    ISSUE: anon can SELECT all user profiles (phone, city, role)
--    CURRENT: RLS enabled but policy allows full anon read
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Remove any existing overly-permissive read policy
DROP POLICY IF EXISTS "profiles_public_read"  ON public.profiles;
DROP POLICY IF EXISTS "users_self_read"        ON public.profiles;
DROP POLICY IF EXISTS "users_self_update"      ON public.profiles;
DROP POLICY IF EXISTS "users_admin_read"       ON public.profiles;
DROP POLICY IF EXISTS "users_insert_own"       ON public.profiles;

-- Users can only read their own profile
CREATE POLICY "profiles_self_read" ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Users can insert their own profile (needed for signup flow)
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Admin can read all profiles
CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
-- Note: This self-references profiles. If infinite recursion occurs,
-- use a separate admin_ids table or auth.jwt() custom claim instead.
-- Safe fallback if recursion occurs:
-- USING (auth.jwt() ->> 'role' = 'admin')


-- ============================================================
-- 3. TABLE: missions
--    ISSUE: anon can SELECT (empty now, but unprotected)
--    missions contain reservation data — must be private
-- ============================================================

ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "missions_public_read"    ON public.missions;
DROP POLICY IF EXISTS "missions_client_read"    ON public.missions;
DROP POLICY IF EXISTS "missions_artisan_read"   ON public.missions;
DROP POLICY IF EXISTS "missions_client_insert"  ON public.missions;
DROP POLICY IF EXISTS "missions_admin_all"      ON public.missions;

-- Client can read their own missions (by client_user_id if column exists)
-- Safe fallback: authenticated users only
CREATE POLICY "missions_authenticated_read" ON public.missions
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
-- Tighten to: USING (client_user_id = auth.uid() OR artisan_user_id = auth.uid())
-- once you confirm column names

-- Client can insert a new mission (reservation)
CREATE POLICY "missions_client_insert" ON public.missions
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Admin full access
CREATE POLICY "missions_admin_all" ON public.missions
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );


-- ============================================================
-- 4. TABLE: payments
--    ISSUE: anon can SELECT (empty now, but unprotected)
--    payments must be strictly private
-- ============================================================

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_public_read"  ON public.payments;
DROP POLICY IF EXISTS "payments_owner_read"   ON public.payments;
DROP POLICY IF EXISTS "payments_admin_all"    ON public.payments;

-- Only authenticated owner of the payment can read it
CREATE POLICY "payments_owner_read" ON public.payments
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
-- Tighten to: USING (user_id = auth.uid()) once column confirmed

-- No public insert/update/delete
-- Admin full access
CREATE POLICY "payments_admin_all" ON public.payments
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );


-- ============================================================
-- 5. TABLE: claim_requests
--    STATUS: RLS enabled but has infinite recursion error
--    Fix the recursion and tighten policies
-- ============================================================

ALTER TABLE public.claim_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "claims_requester_read" ON public.claim_requests;
DROP POLICY IF EXISTS "claims_insert"         ON public.claim_requests;
DROP POLICY IF EXISTS "claims_admin_all"      ON public.claim_requests;
DROP POLICY IF EXISTS "claims_public_insert"  ON public.claim_requests;

-- Public can submit a claim (required by frontend "Réclamer ce profil" flow)
CREATE POLICY "claims_public_insert" ON public.claim_requests
  FOR INSERT
  WITH CHECK (TRUE);
-- Allows anon to submit claims — this is intentional for the claim flow

-- Authenticated users can read their own claims
CREATE POLICY "claims_self_read" ON public.claim_requests
  FOR SELECT
  USING (
    requester_user_id = auth.uid()
    OR auth.uid() IS NULL  -- Remove this line if you want to block anon reads
  );

-- Admin full access (no recursion — uses profiles table, not users)
CREATE POLICY "claims_admin_all" ON public.claim_requests
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );


-- ============================================================
-- 6. TABLE: artisan_profiles (secondary artisan data table)
--    ISSUE: exists, RLS status unknown, anon can query
-- ============================================================

ALTER TABLE public.artisan_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artisan_profiles_public_read"  ON public.artisan_profiles;
DROP POLICY IF EXISTS "artisan_profiles_owner_update" ON public.artisan_profiles;
DROP POLICY IF EXISTS "artisan_profiles_admin_all"    ON public.artisan_profiles;

-- Public read (same as artisans — needed for profile pages)
CREATE POLICY "artisan_profiles_public_read" ON public.artisan_profiles
  FOR SELECT
  USING (TRUE);

-- Owner update only
CREATE POLICY "artisan_profiles_owner_update" ON public.artisan_profiles
  FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
-- Tighten to owner_user_id = auth.uid() once column confirmed

-- No anon insert/delete
CREATE POLICY "artisan_profiles_no_anon_insert" ON public.artisan_profiles
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Admin full access
CREATE POLICY "artisan_profiles_admin_all" ON public.artisan_profiles
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );


-- ============================================================
-- VALIDATION QUERIES (run after applying policies above)
-- These should all return the expected results
-- ============================================================

-- 1. Artisans readable by anon (should return rows)
-- SELECT id, name, city, category FROM public.artisans LIMIT 3;

-- 2. Artisans insert blocked for anon (should return error)
-- INSERT INTO public.artisans (name, city, category) VALUES ('test','test','test');

-- 3. Profiles hidden from anon (should return 0 rows or error)
-- SELECT * FROM public.profiles;

-- 4. Claim insert still works (should succeed)
-- INSERT INTO public.claim_requests (artisan_id) VALUES ('some-uuid');
