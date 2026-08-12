-- ════════════════════════════════════════════════════════════
-- 7C.12A.1 — Artisan Claim Security Rollback
-- supabase/7c12a1-artisan-claim-security-rollback.sql
--
-- Reverses 7C.12A.1 objects.
--
-- WHAT THIS ROLLBACK DOES:
--   1. Drops approve_artisan_claim() RPC
--   2. Drops reject_artisan_claim() RPC
--   3. Drops 7C.12A.1 RLS policies
--   4. Restores sync_artisan_claim() trigger function from schema.sql baseline
--   5. Restores claim_approval_sync trigger on claim_requests
--
-- WHAT THIS ROLLBACK NEVER DOES:
--   - Never rewrites artisan ownership data (owner_user_id)
--   - Never reverses approved claims (claim_status stays 'approved')
--   - Never touches missions, service_requests, or dispatch RPCs
--   - Never touches 7C.11 RPCs (dispatch_request_v1, claim_mission, etc.)
--
-- HARD STOP: rollback verifies dispatch_request_v1 intact after execution.
--
-- WARNING: Restoring sync_artisan_claim() re-introduces the
-- onboarding_completed defect. Only roll back if the RPCs are unusable.
-- Prefer forward-fix over rollback in production.
--
-- TRANSACTION ATOMICITY: wrapped in BEGIN/COMMIT.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- Drop 7C.12A.1 RPCs
DROP FUNCTION IF EXISTS public.approve_artisan_claim(uuid);
DROP FUNCTION IF EXISTS public.reject_artisan_claim(uuid, text);

-- Drop 7C.12A.1 RLS policies
DROP POLICY IF EXISTS "claim_requests_authenticated_insert" ON public.claim_requests;
DROP POLICY IF EXISTS "claim_requests_own_select"           ON public.claim_requests;

-- Restore sync_artisan_claim() function from schema.sql baseline
-- NOTE: This re-introduces the onboarding_completed defect.
-- Only restore if the RPCs are critically broken and rollback is required.
CREATE OR REPLACE FUNCTION public.sync_artisan_claim()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    UPDATE public.artisans
    SET
      claimed              = TRUE,
      claim_status         = 'approved',
      owner_user_id        = NEW.requester_user_id,
      onboarding_completed = (NEW.onboarding_data IS NOT NULL AND NEW.onboarding_data <> '{}'),
      verified             = TRUE,
      updated_at           = NOW()
    WHERE id = NEW.artisan_id OR legacy_id = NEW.artisan_legacy_id;
  END IF;

  IF NEW.status = 'rejected' AND OLD.status <> 'rejected' THEN
    UPDATE public.artisans
    SET claim_status = 'rejected', updated_at = NOW()
    WHERE id = NEW.artisan_id OR legacy_id = NEW.artisan_legacy_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Restore trigger
DROP TRIGGER IF EXISTS claim_approval_sync ON public.claim_requests;
CREATE TRIGGER claim_approval_sync
  AFTER UPDATE ON public.claim_requests
  FOR EACH ROW EXECUTE FUNCTION public.sync_artisan_claim();

-- Verify 7C.11 RPCs still intact
DO $$
DECLARE v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='dispatch_request_v1';
  IF v_count=0 THEN
    RAISE EXCEPTION 'Rollback HARD STOP: dispatch_request_v1 missing after rollback';
  END IF;
  RAISE NOTICE 'Rollback verify: dispatch_request_v1 intact ✓';

  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('approve_artisan_claim','reject_artisan_claim');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Rollback HARD STOP: claim RPCs still present after DROP';
  END IF;
  RAISE NOTICE 'Rollback verify: 7C.12A.1 claim RPCs removed ✓';

  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='sync_artisan_claim';
  IF v_count=0 THEN
    RAISE EXCEPTION 'Rollback HARD STOP: sync_artisan_claim not restored';
  END IF;
  RAISE NOTICE 'Rollback verify: sync_artisan_claim() restored ✓';

  RAISE NOTICE 'Rollback verify: COMPLETE — WARNING: onboarding_completed defect re-introduced by rollback';
END $$;

COMMIT;
