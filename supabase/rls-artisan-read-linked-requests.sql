-- RLS: Artisan SELECT on service_requests for their own linked missions
-- Applied: 2026-06-10
-- Replaces: artisan_read_new_requests (status='new' only — too narrow)
-- New policy: artisan can SELECT any service_request linked to one of their missions,
--             regardless of status. Identity resolved via owner_user_id OR phone_public fallback.

-- Drop old narrow policy first (idempotent)
DROP POLICY IF EXISTS "artisan_read_new_requests"        ON public.service_requests;
DROP POLICY IF EXISTS "artisan_read_active_requests"     ON public.service_requests;
DROP POLICY IF EXISTS "artisan_read_own_linked_requests" ON public.service_requests;

CREATE POLICY "artisan_read_own_linked_requests"
  ON public.service_requests
  FOR SELECT
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
  );
