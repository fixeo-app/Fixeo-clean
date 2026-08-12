-- ════════════════════════════════════════════════════════════
-- 7C.12A.1 — Artisan Claim Security Rollback
-- supabase/7c12a1-artisan-claim-security-rollback.sql
--
-- Drops 7C.12A.1 objects.
-- Does NOT restore the unsafe stale RLS policies.
-- Does NOT reintroduce browser owner_user_id writes.
-- Does NOT touch artisan ownership data.
-- Does NOT touch 7C.11 dispatch RPCs.
--
-- TRANSACTION ATOMICITY: wrapped in BEGIN/COMMIT.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- Drop RPCs
DROP FUNCTION IF EXISTS public.approve_artisan_claim(uuid);
DROP FUNCTION IF EXISTS public.reject_artisan_claim(uuid, text);

-- Drop 7C.12A.1 RLS policies
DROP POLICY IF EXISTS "claim_requests_authenticated_insert" ON public.claim_requests;
DROP POLICY IF EXISTS "claim_requests_own_select"           ON public.claim_requests;

-- Verify 7C.11 RPCs still present
DO $$
DECLARE v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='dispatch_request_v1';
  IF v_count=0 THEN
    RAISE EXCEPTION 'Rollback FAIL: dispatch_request_v1 missing after rollback';
  END IF;
  RAISE NOTICE 'Rollback verify: dispatch_request_v1 intact ✓';

  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('approve_artisan_claim','reject_artisan_claim');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Rollback FAIL: claim RPCs still present after DROP';
  END IF;
  RAISE NOTICE 'Rollback verify: 7C.12A.1 claim RPCs removed ✓';
END $$;

COMMIT;
