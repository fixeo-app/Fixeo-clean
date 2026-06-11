-- ============================================================
-- FIXEO — missions RLS v2
-- File: supabase/rls-missions-v2.sql
-- Date: 2026-06-11
-- Apply: Supabase Dashboard → SQL Editor → New query → Run
--
-- WHAT THIS DOES:
--   1. Enables RLS on public.missions (idempotent)
--   2. Drops all stale / conflicting policies
--   3. Creates 6 narrow policies:
--        a. missions_deny_anon          — anon can do nothing
--        b. artisan_select_own_missions — artisan sees own missions only
--        c. artisan_insert_own_missions — artisan can INSERT if artisan_profile_id is theirs
--        d. artisan_update_own_missions — artisan can UPDATE own missions (start/complete)
--        e. admin_all_missions          — admin has full SELECT/INSERT/UPDATE/DELETE
--        f. client_select_own_missions  — client sees missions where client_profile_id = auth.uid()
--
-- DOES NOT:
--   - Reference artisan_profiles table (does not exist)
--   - Use any table other than public.artisans, public.missions, public.users, public.profiles
--   - Modify any other table, index, or constraint
--   - Touch service_requests, profiles, users, or any other table
--
-- SAFE TO RE-RUN: all statements are idempotent (IF NOT EXISTS / DROP IF EXISTS)
-- ============================================================


-- ── Step 1: Enable RLS (idempotent) ─────────────────────────
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;


-- ── Step 2: Drop stale policies (clean slate) ───────────────
-- Drop any previously created policies that may conflict or reference
-- non-existent tables (e.g. artisan_profiles from rls-phase2).
DROP POLICY IF EXISTS "artisan_read_own_missions"     ON public.missions;
DROP POLICY IF EXISTS "missions_authenticated_read"   ON public.missions;
DROP POLICY IF EXISTS "missions_client_insert"        ON public.missions;
DROP POLICY IF EXISTS "missions_admin_all"            ON public.missions;
DROP POLICY IF EXISTS "missions_client_read"          ON public.missions;
DROP POLICY IF EXISTS "missions_artisan_read"         ON public.missions;
DROP POLICY IF EXISTS "missions_owner_update"         ON public.missions;
DROP POLICY IF EXISTS "missions_owner_delete"         ON public.missions;
DROP POLICY IF EXISTS "missions_no_anon_insert"       ON public.missions;
DROP POLICY IF EXISTS "missions_no_anon_delete"       ON public.missions;
DROP POLICY IF EXISTS "artisan_select_own_missions"   ON public.missions;
DROP POLICY IF EXISTS "artisan_insert_own_missions"   ON public.missions;
DROP POLICY IF EXISTS "artisan_update_own_missions"   ON public.missions;
DROP POLICY IF EXISTS "client_select_own_missions"    ON public.missions;
DROP POLICY IF EXISTS "admin_all_missions"            ON public.missions;
DROP POLICY IF EXISTS "missions_deny_anon"            ON public.missions;


-- ── Step 3a: Deny ALL for anon (belt-and-suspenders) ────────
-- Explicit blanket block so anon INSERT/SELECT/UPDATE/DELETE all
-- return 42501 (insufficient_privilege) rather than silently passing.
CREATE POLICY "missions_deny_anon"
  ON public.missions
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);


-- ── Step 3b: Artisan SELECT own missions ────────────────────
-- Artisan can read missions where artisan_profile_id matches an
-- artisans row that belongs to them.
-- Primary:  artisans.owner_user_id = auth.uid()
-- Fallback: artisans.phone_public  = profiles.phone (for unclaimed artisans
--           whose account was linked via phone match — rare but supported)
CREATE POLICY "artisan_select_own_missions"
  ON public.missions
  FOR SELECT
  TO authenticated
  USING (
    artisan_profile_id IN (
      SELECT a.id
      FROM public.artisans a
      WHERE
        a.owner_user_id = auth.uid()
        OR (
          a.phone_public IS NOT NULL
          AND a.phone_public <> ''
          AND a.phone_public = (
            SELECT p.phone
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.phone IS NOT NULL
              AND p.phone <> ''
            LIMIT 1
          )
        )
    )
  );


-- ── Step 3c: Artisan INSERT own missions ────────────────────
-- Artisan can INSERT a mission only if the artisan_profile_id they
-- provide belongs to an artisans row they own.
-- Prevents any authenticated user from inserting missions as another artisan.
CREATE POLICY "artisan_insert_own_missions"
  ON public.missions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND artisan_profile_id IN (
      SELECT a.id
      FROM public.artisans a
      WHERE a.owner_user_id = auth.uid()
    )
  );


-- ── Step 3d: Artisan UPDATE own missions ────────────────────
-- Artisan can UPDATE missions (mark started, completed) for their own rows.
CREATE POLICY "artisan_update_own_missions"
  ON public.missions
  FOR UPDATE
  TO authenticated
  USING (
    artisan_profile_id IN (
      SELECT a.id
      FROM public.artisans a
      WHERE a.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    artisan_profile_id IN (
      SELECT a.id
      FROM public.artisans a
      WHERE a.owner_user_id = auth.uid()
    )
  );


-- ── Step 3e: Admin full access ──────────────────────────────
-- Admin users can SELECT / INSERT / UPDATE / DELETE any mission.
-- Checks both public.users and public.profiles for role = 'admin'
-- to handle accounts created via either registration path.
CREATE POLICY "admin_all_missions"
  ON public.missions
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


-- ── Step 3f: Client SELECT own missions ─────────────────────
-- Client can read missions where client_profile_id = their auth.uid().
-- Used by client dashboard to see the artisan assigned to their request.
CREATE POLICY "client_select_own_missions"
  ON public.missions
  FOR SELECT
  TO authenticated
  USING (
    client_profile_id = auth.uid()
  );


-- ============================================================
-- VERIFICATION QUERIES (run separately after applying)
-- ============================================================

-- V1: Confirm RLS is now enabled (should return: relrowsecurity = true)
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'missions';

-- V2: List all active policies on missions
-- SELECT policyname, cmd, roles, qual
-- FROM pg_policies WHERE tablename = 'missions'
-- ORDER BY policyname;

-- V3: Anon probe — should return 0 rows (previously returned all 13)
-- Run this from a client with only the anon key (no auth token):
-- SELECT id FROM public.missions LIMIT 5;

-- V4: Authenticated artisan probe — should return only Youness's missions (3 rows)
-- (Run as authenticated artisan session, artisan_profile_id = f93c43e8...)
-- SELECT id, artisan_profile_id, request_id, status FROM public.missions;

-- V5: Confirm artisan_insert policy works — artisan can INSERT, others cannot
-- (Test in artisan session: the _doAcceptMission INSERT should still succeed)
-- ============================================================
