-- ════════════════════════════════════════════════════════════
-- 7C.11E.2 — Rollback
-- supabase/7c11e2-mission-lifecycle-rollback.sql
--
-- Safe to run after 7C.11E.2 applies.
-- Reverts to 7C.11C state (removes 11E.2 RPCs, restores original detail).
--
-- SAFETY: no data rows are altered.
-- Rollback restores 7C.11C RPC versions by re-applying block 9
-- from 7c11c-dispatch-foundation.sql.
--
-- DO NOT run if 7C.11F (dispatch activation) has been applied.
-- ════════════════════════════════════════════════════════════

-- Drop 11E.2-only RPCs
DROP FUNCTION IF EXISTS public.decline_mission(uuid);
DROP FUNCTION IF EXISTS public.start_mission(uuid);
DROP FUNCTION IF EXISTS public.complete_mission(uuid);

-- Restore 7C.11C version of get_accepted_mission_detail
-- (without request_status field)
CREATE OR REPLACE FUNCTION public.get_accepted_mission_detail(
  p_mission_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_artisan_id     uuid;
  v_mission_status text;
  v_artisan_match  uuid;
  v_result         jsonb;
BEGIN

  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT a.id INTO v_artisan_id
  FROM   public.artisans a
  WHERE  a.owner_user_id = auth.uid()
  LIMIT  1;

  IF v_artisan_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'artisan_not_found');
  END IF;

  SELECT m.status, m.artisan_profile_id
  INTO   v_mission_status, v_artisan_match
  FROM   public.missions m
  WHERE  m.id = p_mission_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'mission_not_found');
  END IF;

  IF v_artisan_match != v_artisan_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_your_mission');
  END IF;

  IF v_mission_status NOT IN ('pending','done','validated') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_accepted_yet');
  END IF;

  SELECT jsonb_build_object(
    'ok',               true,
    'mission_id',       m.id,
    'mission_status',   m.status,
    'accepted_at',      m.accepted_at,
    'agreed_price',     m.agreed_price,
    'service_category', sr.service_category,
    'city',             sr.city,
    'urgency',          sr.urgency,
    'description',      sr.description,
    'client_phone',     sr.client_phone
  )
  INTO v_result
  FROM   public.missions         m
  JOIN   public.service_requests sr ON m.request_id = sr.id::text
  WHERE  m.id = p_mission_id;

  RETURN v_result;

END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_accepted_mission_detail(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_accepted_mission_detail(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_accepted_mission_detail(uuid) TO authenticated;
