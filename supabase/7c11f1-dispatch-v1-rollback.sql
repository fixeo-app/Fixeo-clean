-- ════════════════════════════════════════════════════════════
-- 7C.11F.1 — Dispatch V1 Rollback
-- supabase/7c11f1-dispatch-v1-rollback.sql
--
-- Drops ONLY 11F.1 objects.
-- Does NOT touch 11C/11E RPCs, indexes, or columns.
-- Does NOT drop missions_one_offer_per_request or other 11C indexes.
-- ════════════════════════════════════════════════════════════

-- Drop the 11F.1 dispatch RPC only
DROP FUNCTION IF EXISTS public.dispatch_request_v1(uuid);

-- Verify 11C/11E RPCs are still present after rollback
DO $$
DECLARE v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('claim_mission','decline_mission','start_mission',
                      'complete_mission','get_accepted_mission_detail',
                      'get_my_mission_offers');
  RAISE NOTICE 'Rollback complete. 11C/11E RPCs remaining: % (expect 6)', v_count;
END $$;
