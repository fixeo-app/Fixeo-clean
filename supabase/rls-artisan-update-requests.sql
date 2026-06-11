-- ═══════════════════════════════════════════════════════════════
-- FIXEO — artisan_update_assigned_requests RLS policy
-- File: supabase/rls-artisan-update-requests.sql
-- Date: 2026-06-11
-- ─────────────────────────────────────────────────────────────
-- WHY THIS FILE EXISTS:
--   fixeo-artisan-dashboard-v2.js calls:
--     UPDATE service_requests SET status = 'in_progress'   (_doStartMission)
--     UPDATE service_requests SET status = 'completed'     (_doCompleteMission)
--   Without an UPDATE policy for authenticated artisans, these calls
--   return 0 rows and throw:
--     "Mise à jour bloquée (droits insuffisants ou demande introuvable)"
--
-- IDENTITY RESOLUTION (mirrors artisan_read_own_linked_requests):
--   artisan identity = artisans WHERE owner_user_id = auth.uid()
--                      OR artisans.phone_public = profiles.phone
--   request linkage  = via missions.artisan_profile_id → missions.request_id
--
-- SCOPE: UPDATE only. Artisan may only update requests linked to
--        their own missions. USING and WITH CHECK are identical to
--        prevent row-level escaping.
--
-- SAFE TO RE-RUN: DROP IF EXISTS makes this idempotent.
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Drop if exists (idempotent)
DROP POLICY IF EXISTS "artisan_update_assigned_requests" ON public.service_requests;

-- Step 2: Create UPDATE policy
CREATE POLICY "artisan_update_assigned_requests"
  ON public.service_requests
  FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT m.request_id
      FROM   public.missions m
      WHERE  m.artisan_profile_id IN (
        SELECT a.id
        FROM   public.artisans a
        WHERE  a.owner_user_id = auth.uid()
        OR     a.phone_public  = (
          SELECT p.phone
          FROM   public.profiles p
          WHERE  p.id = auth.uid()
          LIMIT  1
        )
      )
    )
  )
  WITH CHECK (
    id IN (
      SELECT m.request_id
      FROM   public.missions m
      WHERE  m.artisan_profile_id IN (
        SELECT a.id
        FROM   public.artisans a
        WHERE  a.owner_user_id = auth.uid()
        OR     a.phone_public  = (
          SELECT p.phone
          FROM   public.profiles p
          WHERE  p.id = auth.uid()
          LIMIT  1
        )
      )
    )
  );

-- ─────────────────────────────────────────────────────────────
-- VERIFICATION QUERY (run after applying):
-- ─────────────────────────────────────────────────────────────
-- SELECT policyname, cmd, qual
-- FROM   pg_policies
-- WHERE  tablename = 'service_requests'
-- AND    policyname = 'artisan_update_assigned_requests';
-- → Must return 1 row with cmd = 'UPDATE'
-- ═══════════════════════════════════════════════════════════════
