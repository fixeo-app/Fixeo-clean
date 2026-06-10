-- ============================================================
-- RLS SELECT policy: artisan_read_own_missions
-- Table: public.missions
-- Applied: 2026-06-10
-- ============================================================
-- Allows an authenticated user to SELECT missions where
-- missions.artisan_profile_id matches an artisan row they own.
-- Ownership check (OR):
--   1. artisans.owner_user_id = auth.uid()     (direct link)
--   2. artisans.phone_public  = profiles.phone (phone fallback)
-- ============================================================

-- Step 1: ensure RLS is enabled (idempotent)
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

-- Step 2: drop if exists (idempotent re-run safety)
DROP POLICY IF EXISTS "artisan_read_own_missions" ON public.missions;

-- Step 3: create policy
CREATE POLICY "artisan_read_own_missions"
  ON public.missions
  FOR SELECT
  TO authenticated
  USING (
    artisan_profile_id IN (
      SELECT a.id
      FROM public.artisans a
      WHERE
        a.owner_user_id = auth.uid()
        OR a.phone_public = (
          SELECT p.phone
          FROM public.profiles p
          WHERE p.id = auth.uid()
          LIMIT 1
        )
    )
  );

-- ============================================================
-- Verification query (run after applying policy):
-- Should return 2 rows for artisan_profile_id=f93c43e8...
-- when executed as the artisan's authenticated session.
-- ============================================================
-- SELECT id, artisan_profile_id, status, request_id
-- FROM public.missions
-- WHERE artisan_profile_id = 'f93c43e8-469d-4bef-9db0-2f5e534c988f';
