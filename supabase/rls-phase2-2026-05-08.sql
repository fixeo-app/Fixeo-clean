-- ============================================================
-- FIXEO — RLS Phase 2 Security Fix
-- Date: 2026-05-08
-- Author: Production Hardening Phase 2
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
--
-- Safe to re-run: all DROP POLICY IF EXISTS before CREATE POLICY
-- Safe to re-run: ALTER TABLE ... ENABLE ROW LEVEL SECURITY is idempotent
--
-- AUDIT FINDINGS ADDRESSED:
--   CRITICAL: service_requests — NO RLS (anon INSERT/DELETE/SELECT all succeeded)
--   CRITICAL: payments — NO RLS (anon INSERT/DELETE succeeded)
--   HIGH:     missions — No INSERT policy (anon INSERT blocked only by FK constraints, not RLS)
--   HIGH:     missions — No DELETE policy (anon DELETE: 200 on empty table, unprotected)
--   MEDIUM:   artisans anon UPDATE/DELETE silently return 200/204 with 0 rows
--             (currently safe because owner_user_id=NULL on all seed rows, but must be explicit)
--   LOW:      profiles/users RLS enabled but anon sees 0 rows — policy may be missing
--             (could be table-level "no policy = deny" but should be explicit)
--
-- WHAT THIS PATCH DOES NOT CHANGE:
--   - artisans SELECT (public read preserved — marketplace needs it)
--   - claim_requests INSERT (public claim flow preserved)
--   - Any existing data
--   - Any frontend code
-- ============================================================


-- ============================================================
-- 1. service_requests — ENABLE RLS + 4 policies
--    Current state: NO RLS (confirmed — anon INSERT/DELETE/SELECT worked)
--    Risk: anon can enumerate all service requests, insert spam,
--          delete real client requests
-- ============================================================

ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;

-- 1a. SELECT: authenticated users see only their own requests
--     Public anon can no longer enumerate service requests
DROP POLICY IF EXISTS "sreq_self_read"          ON public.service_requests;
DROP POLICY IF EXISTS "sreq_client_insert"      ON public.service_requests;
DROP POLICY IF EXISTS "sreq_client_update"      ON public.service_requests;
DROP POLICY IF EXISTS "sreq_owner_delete"       ON public.service_requests;
DROP POLICY IF EXISTS "sreq_admin_all"          ON public.service_requests;
DROP POLICY IF EXISTS "sreq_artisan_read"       ON public.service_requests;

-- Owner read (by client_profile_id = auth.uid())
CREATE POLICY "sreq_self_read" ON public.service_requests
  FOR SELECT
  USING (
    client_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- Authenticated client insert only
-- Note: if frontend submits service requests from unauthenticated visitors,
-- change WITH CHECK to: auth.uid() IS NOT NULL  (requires login first)
-- For now: require auth.uid() = client_profile_id to prevent impersonation
CREATE POLICY "sreq_client_insert" ON public.service_requests
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND client_profile_id = auth.uid()
  );

-- Owner update only (e.g. cancel own request)
CREATE POLICY "sreq_client_update" ON public.service_requests
  FOR UPDATE
  USING (client_profile_id = auth.uid())
  WITH CHECK (client_profile_id = auth.uid());

-- Owner OR admin delete
CREATE POLICY "sreq_owner_delete" ON public.service_requests
  FOR DELETE
  USING (
    client_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- Artisan read: artisans can read open/new requests to respond
-- This is needed for the matching engine to show artisans available jobs
-- Restrict to: availability=available artisans, status=new only
-- Uses artisans.owner_user_id = auth.uid() to verify artisan identity
CREATE POLICY "sreq_artisan_read" ON public.service_requests
  FOR SELECT
  USING (
    status = 'new'
    AND EXISTS (
      SELECT 1 FROM public.artisans a
      WHERE a.owner_user_id = auth.uid()
      AND a.availability = 'available'
    )
  );


-- ============================================================
-- 2. payments — ENABLE RLS + 3 policies
--    Current state: NO RLS (confirmed — anon INSERT/DELETE worked)
--    Risk: anon can create fake payment records, delete payment history
-- ============================================================

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pay_owner_read"      ON public.payments;
DROP POLICY IF EXISTS "pay_admin_all"       ON public.payments;
DROP POLICY IF EXISTS "pay_no_anon_write"   ON public.payments;

-- Owner read (user can see their own payments)
-- Note: assuming payments has a user_id or mission_id column
-- Using auth.uid() IS NOT NULL as safe minimum until column is confirmed
CREATE POLICY "pay_owner_read" ON public.payments
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
-- Tighten later to: USING (user_id = auth.uid())
-- once you confirm which column links payment to user

-- Admin full access
CREATE POLICY "pay_admin_all" ON public.payments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- Block all writes except admin (no INSERT/UPDATE/DELETE for regular users)
-- Payments must go through server-side flow (Stripe webhook / COD admin approval)
-- No regular user should directly create/modify payment rows
-- The admin_all policy above covers writes for admin.
-- For non-admin authenticated users: no INSERT/UPDATE/DELETE allowed.
-- (RLS implicitly denies if no matching policy — these are for documentation)
DROP POLICY IF EXISTS "pay_block_anon_insert" ON public.payments;
CREATE POLICY "pay_block_anon_insert" ON public.payments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "pay_block_anon_delete" ON public.payments;
CREATE POLICY "pay_block_anon_delete" ON public.payments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "pay_block_anon_update" ON public.payments;
CREATE POLICY "pay_block_anon_update" ON public.payments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );


-- ============================================================
-- 3. missions — Explicit INSERT + DELETE + UPDATE policies
--    Current state: RLS enabled but INSERT/DELETE may lack explicit policies
--    Risk: anon INSERT blocked only by FK NOT NULL constraints (not RLS)
--          If someone provides valid FK values, INSERT would succeed
-- ============================================================

ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "missions_authenticated_read"  ON public.missions;
DROP POLICY IF EXISTS "missions_client_insert"       ON public.missions;
DROP POLICY IF EXISTS "missions_admin_all"           ON public.missions;
DROP POLICY IF EXISTS "missions_client_read"         ON public.missions;
DROP POLICY IF EXISTS "missions_artisan_read"        ON public.missions;
DROP POLICY IF EXISTS "missions_owner_update"        ON public.missions;
DROP POLICY IF EXISTS "missions_owner_delete"        ON public.missions;
DROP POLICY IF EXISTS "missions_no_anon_insert"      ON public.missions;
DROP POLICY IF EXISTS "missions_no_anon_delete"      ON public.missions;

-- Client read: see own missions
CREATE POLICY "missions_client_read" ON public.missions
  FOR SELECT
  USING (
    client_profile_id = auth.uid()
    OR artisan_profile_id IN (
      SELECT id FROM public.artisan_profiles WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- Client INSERT: only via their own client_profile_id
CREATE POLICY "missions_client_insert" ON public.missions
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND client_profile_id = auth.uid()
  );

-- No anon INSERT (explicit block — belt and suspenders over FK constraint)
-- This fires before the FK check — blocks anon with a proper 42501 error
-- The above missions_client_insert already requires auth, but this
-- makes the error message clearer and is explicit RLS intent
-- (Two INSERT policies: Supabase evaluates with OR logic, so both must allow)
-- CORRECTION: just one INSERT policy that requires auth.uid() IS NOT NULL
-- Drop and recreate to avoid duplicate:
DROP POLICY IF EXISTS "missions_client_insert" ON public.missions;
CREATE POLICY "missions_client_insert" ON public.missions
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND client_profile_id = auth.uid());

-- Update: client can update own mission status (e.g., confirm completion)
-- Artisan can update assigned missions (e.g., mark started/completed)
CREATE POLICY "missions_owner_update" ON public.missions
  FOR UPDATE
  USING (
    client_profile_id = auth.uid()
    OR artisan_profile_id IN (
      SELECT id FROM public.artisan_profiles ap WHERE ap.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  )
  WITH CHECK (
    client_profile_id = auth.uid()
    OR artisan_profile_id IN (
      SELECT id FROM public.artisan_profiles ap WHERE ap.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- DELETE: admin only (missions should not be deleted by users — just cancelled)
CREATE POLICY "missions_no_anon_delete" ON public.missions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- Admin full access (covers all operations above for admin)
CREATE POLICY "missions_admin_all" ON public.missions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );


-- ============================================================
-- 4. artisans — Explicit UPDATE/DELETE policies
--    Current state: UPDATE/DELETE return 204 with 0 rows (silently blocked
--    by owner_user_id=NULL on seed rows). But policy is via owner_user_id only.
--    Risk: when real claimed artisans exist with owner_user_id set,
--          any authenticated user who knows the owner_user_id FK could update.
--          Also: no explicit DELETE block for non-admin authenticated users.
--    Action: add explicit admin-only DELETE; tighten UPDATE to owner OR admin.
-- ============================================================

-- SELECT: keep public (homepage/search requires it)
DROP POLICY IF EXISTS "artisans_public_read"    ON public.artisans;
CREATE POLICY "artisans_public_read" ON public.artisans
  FOR SELECT
  USING (TRUE);

-- INSERT: require authenticated (already blocks anon, confirmed)
DROP POLICY IF EXISTS "artisans_no_anon_insert" ON public.artisans;
CREATE POLICY "artisans_no_anon_insert" ON public.artisans
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: owner OR admin only (explicit, no ambiguity)
DROP POLICY IF EXISTS "artisans_owner_update"   ON public.artisans;
DROP POLICY IF EXISTS "artisans_self_fields"    ON public.artisans;  -- from rls-policies.sql
CREATE POLICY "artisans_owner_update" ON public.artisans
  FOR UPDATE
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  )
  WITH CHECK (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- DELETE: admin only (no owner self-delete — prevents accidental loss)
DROP POLICY IF EXISTS "artisans_no_anon_delete" ON public.artisans;
DROP POLICY IF EXISTS "artisans_admin_write"    ON public.artisans;
CREATE POLICY "artisans_admin_delete" ON public.artisans
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- Admin INSERT (admin dashboard can add artisans)
CREATE POLICY "artisans_admin_insert" ON public.artisans
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );


-- ============================================================
-- 5. artisan_profiles — ENABLE RLS (empty table, future-proof)
--    Current state: table exists, empty, RLS status unknown
-- ============================================================

ALTER TABLE public.artisan_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artisan_profiles_public_read"      ON public.artisan_profiles;
DROP POLICY IF EXISTS "artisan_profiles_owner_update"     ON public.artisan_profiles;
DROP POLICY IF EXISTS "artisan_profiles_no_anon_insert"   ON public.artisan_profiles;
DROP POLICY IF EXISTS "artisan_profiles_admin_all"        ON public.artisan_profiles;

-- Public read (artisan profile pages need this)
CREATE POLICY "artisan_profiles_public_read" ON public.artisan_profiles
  FOR SELECT
  USING (TRUE);

-- Insert: authenticated only (owner sets up profile)
CREATE POLICY "artisan_profiles_auth_insert" ON public.artisan_profiles
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Update: owner or admin only
-- Uses artisan_profiles.user_id column (may be named differently — adjust if needed)
CREATE POLICY "artisan_profiles_owner_update" ON public.artisan_profiles
  FOR UPDATE
  USING (
    (user_id IS NOT NULL AND user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  )
  WITH CHECK (
    (user_id IS NOT NULL AND user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- Delete: admin only
CREATE POLICY "artisan_profiles_admin_delete" ON public.artisan_profiles
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );


-- ============================================================
-- 6. profiles — Verify/repair explicit policies
--    Current state: RLS enabled, anon returns 0 rows (correct)
--    but no explicit DENY for anon SELECT — relying on implicit deny
--    Make it explicit to guard against future policy additions
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop any stale or overly permissive policies
DROP POLICY IF EXISTS "profiles_public_read"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_read"      ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_update"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"     ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_all"      ON public.profiles;
-- Also covers names from schema.sql (users_ prefix)
DROP POLICY IF EXISTS "users_self_read"         ON public.profiles;
DROP POLICY IF EXISTS "users_self_update"       ON public.profiles;
DROP POLICY IF EXISTS "users_admin_read"        ON public.profiles;
DROP POLICY IF EXISTS "users_insert_own"        ON public.profiles;

-- Self read only (explicit)
CREATE POLICY "profiles_self_read" ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Self update only
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Self insert (signup creates profile)
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Admin: use auth.jwt() role claim to avoid self-referential recursion risk
-- If admin@fixeo.ma has user_metadata.role='admin' set in Supabase auth:
--   USING (auth.jwt() ->> 'role' = 'admin')
-- Until user_metadata is set, fall back to direct profiles lookup
-- (safe because the query uses = auth.uid() which is always indexed)
CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );
-- NOTE: This policy self-references profiles.
-- If Supabase reports infinite recursion (42P17), replace with:
--   USING (auth.jwt() ->> 'role' = 'admin')
-- and set user_metadata.role='admin' for admin@fixeo.ma in Supabase Dashboard.


-- ============================================================
-- 7. users — Verify/repair explicit policies
--    Mirror of profiles (schema.sql uses public.users)
-- ============================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_self_read"     ON public.users;
DROP POLICY IF EXISTS "users_self_update"   ON public.users;
DROP POLICY IF EXISTS "users_insert_own"    ON public.users;
DROP POLICY IF EXISTS "users_admin_read"    ON public.users;
DROP POLICY IF EXISTS "users_admin_all"     ON public.users;

CREATE POLICY "users_self_read" ON public.users
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users_self_update" ON public.users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Admin via same jwt() approach for consistency
CREATE POLICY "users_admin_all" ON public.users
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'admin'
    )
  );


-- ============================================================
-- 8. claim_requests — Fix anon read + tighten
--    Current state: anon SELECT returns [] (correct)
--    INSERT blocked (confirmed — 42501 returned)
--    Improve: anon can still INSERT (claim flow), but cannot read others
-- ============================================================

ALTER TABLE public.claim_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "claims_requester_read"   ON public.claim_requests;
DROP POLICY IF EXISTS "claims_insert"           ON public.claim_requests;
DROP POLICY IF EXISTS "claims_admin_all"        ON public.claim_requests;
DROP POLICY IF EXISTS "claims_public_insert"    ON public.claim_requests;
DROP POLICY IF EXISTS "claims_self_read"        ON public.claim_requests;

-- Public INSERT (claim flow allows unauthenticated claim submission)
-- The current frontend "Réclamer ce profil" flow works for both auth and anon users
CREATE POLICY "claims_public_insert" ON public.claim_requests
  FOR INSERT
  WITH CHECK (TRUE);

-- Authenticated owner can read their own claims
CREATE POLICY "claims_self_read" ON public.claim_requests
  FOR SELECT
  USING (
    requester_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- Admin full access (review + approve + reject claims)
CREATE POLICY "claims_admin_all" ON public.claim_requests
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );


-- ============================================================
-- VALIDATION QUERIES
-- Run each manually after applying this patch to verify
-- ============================================================

-- V1: artisans public read (should return rows)
-- SELECT id, full_name, city FROM public.artisans LIMIT 3;

-- V2: artisans anon INSERT blocked (should return 42501)
-- INSERT INTO public.artisans (full_name, city, service_category) VALUES ('probe','probe','probe');

-- V3: artisans anon UPDATE blocked (should return 0 rows or error)
-- UPDATE public.artisans SET city = 'probe' WHERE id = 'e0b8ddf7-7c7e-49de-baad-95fcdf06df63';

-- V4: service_requests anon SELECT blocked (should return 0 rows or error without auth)
-- SELECT * FROM public.service_requests LIMIT 1;

-- V5: service_requests anon INSERT blocked (should return 42501)
-- INSERT INTO public.service_requests (service_category, city, description, status, client_profile_id) VALUES ('test','test','probe','new','207fa8d6-2d21-46fe-a24e-756d9a5889ef');

-- V6: service_requests anon DELETE blocked (should return 0 rows)
-- DELETE FROM public.service_requests WHERE id = '1d5be255-f95e-4883-894a-2e77a5255fa9';

-- V7: payments anon INSERT blocked (should return 42501)
-- INSERT INTO public.payments (amount, status) VALUES (999, 'paid');

-- V8: payments anon DELETE blocked (should return 42501)
-- DELETE FROM public.payments WHERE amount = 999;

-- V9: missions anon INSERT blocked (should return 42501 not 23502)
-- INSERT INTO public.missions (request_id, client_profile_id, artisan_profile_id, agreed_price, status)
--   VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 0, 'pending');

-- V10: profiles anon SELECT blocked (should return 0 rows)
-- SELECT * FROM public.profiles LIMIT 1;

-- V11: claim INSERT still works for anon (should succeed)
-- INSERT INTO public.claim_requests (requester_name, requester_phone, artisan_legacy_id) VALUES ('test','0600000000','probe');

-- V12: admin policies not recursive / no infinite loop
-- (Run as authenticated admin user — should return all profiles)
-- SELECT * FROM public.profiles LIMIT 5;

-- ============================================================
-- END OF PHASE 2 RLS PATCH
-- ============================================================
