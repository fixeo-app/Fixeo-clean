-- ════════════════════════════════════════════════════════════
-- 7C.12A.1 — Artisan Claim Security Rollback (Hardened)
-- supabase/7c12a1-artisan-claim-security-rollback.sql
--
-- WHAT THIS ROLLBACK DOES:
--   1. Drops approve_artisan_claim() RPC
--   2. Drops reject_artisan_claim() RPC
--   3. Drops 7C.12A.1 canonical RLS policies
--   4. Restores sync_artisan_claim() trigger function (schema.sql baseline)
--   5. Restores claim_approval_sync trigger on claim_requests
--   6. Restores rls-claim-requests-v1.sql policy set (last known production state)
--
-- WHAT THIS ROLLBACK NEVER DOES:
--   - Never rewrites artisan ownership data (owner_user_id)
--   - Never reverses approved claims (claim_status stays 'approved')
--   - Never touches missions, service_requests, or dispatch RPCs
--   - Never touches 7C.11 RPCs
--
-- HARD STOP: verifies dispatch_request_v1 intact after rollback.
--
-- WARNING: Restoring sync_artisan_claim() re-introduces:
--   - onboarding_completed defect (auto-true from JSONB)
--   - verified=TRUE auto-set at approval
--   - admin_all_claim_requests FOR ALL policy (browser direct UPDATE re-enabled)
-- Only roll back if the 7C.12A.1 RPCs are critically broken.
-- Prefer forward-fix over rollback in production.
--
-- TRANSACTION ATOMICITY: wrapped in BEGIN/COMMIT.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- Drop 7C.12A.1 RPCs and helper
DROP FUNCTION IF EXISTS public.approve_artisan_claim(uuid);
DROP FUNCTION IF EXISTS public.reject_artisan_claim(uuid, text);
DROP FUNCTION IF EXISTS public._supersede_competing_claims(uuid, uuid, text);

-- ── Restore claims_status_check to baseline (3 values only) ──
-- HARD STOP if the extended constraint is not present:
-- we only reverse what we know we changed.
DO $$
DECLARE v_con_def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_con_def
  FROM pg_constraint c
  JOIN pg_class r ON r.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = r.relnamespace
  WHERE n.nspname='public' AND r.relname='claim_requests'
    AND c.conname='claims_status_check'
  LIMIT 1;

  IF v_con_def IS NULL THEN
    RAISE EXCEPTION 'Rollback HARD STOP: claims_status_check not found — cannot restore safely';
  END IF;

  IF v_con_def NOT ILIKE '%superseded_by_approval%' THEN
    RAISE NOTICE 'Rollback: claims_status_check does not contain superseded_by_approval — already at baseline, no change';
  ELSE
    -- Check for any superseded rows that would violate the restored constraint
    IF EXISTS (SELECT 1 FROM public.claim_requests WHERE status = 'superseded_by_approval') THEN
      RAISE EXCEPTION 'Rollback HARD STOP: % rows with status=superseded_by_approval exist — cannot restore 3-value CHECK constraint without data loss. Manually re-status those rows first.',
        (SELECT COUNT(*) FROM public.claim_requests WHERE status = 'superseded_by_approval');
    END IF;
    ALTER TABLE public.claim_requests DROP CONSTRAINT claims_status_check;
    ALTER TABLE public.claim_requests ADD CONSTRAINT claims_status_check
      CHECK (status IN ('pending', 'approved', 'rejected'));
    RAISE NOTICE 'Rollback: claims_status_check restored to 3-value baseline';
  END IF;
END $$;

-- Drop 7C.12A.1 canonical RLS policies
DROP POLICY IF EXISTS "7c12a1_deny_anon_all"    ON public.claim_requests;
DROP POLICY IF EXISTS "7c12a1_auth_insert_own"  ON public.claim_requests;
DROP POLICY IF EXISTS "7c12a1_auth_select"      ON public.claim_requests;

-- Restore sync_artisan_claim() function (schema.sql baseline)
-- NOTE: re-introduces onboarding_completed and verified=TRUE defects.
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

-- Restore claim_approval_sync trigger
DROP TRIGGER IF EXISTS claim_approval_sync ON public.claim_requests;
CREATE TRIGGER claim_approval_sync
  AFTER UPDATE ON public.claim_requests
  FOR EACH ROW EXECUTE FUNCTION public.sync_artisan_claim();

-- Restore rls-claim-requests-v1.sql policy set (last known production baseline)
-- NOTE: restores admin_all_claim_requests FOR ALL — browser direct UPDATE re-enabled.
ALTER TABLE public.claim_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_anon_claim_requests"     ON public.claim_requests;
DROP POLICY IF EXISTS "authenticated_claim_insert"   ON public.claim_requests;
DROP POLICY IF EXISTS "authenticated_own_claim_read" ON public.claim_requests;
DROP POLICY IF EXISTS "admin_all_claim_requests"     ON public.claim_requests;

CREATE POLICY "deny_anon_claim_requests"
  ON public.claim_requests
  FOR ALL TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "authenticated_claim_insert"
  ON public.claim_requests
  FOR INSERT TO authenticated
  WITH CHECK (requester_user_id = auth.uid());

CREATE POLICY "authenticated_own_claim_read"
  ON public.claim_requests
  FOR SELECT TO authenticated
  USING (requester_user_id = auth.uid());

CREATE POLICY "admin_all_claim_requests"
  ON public.claim_requests
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Verify integrity after rollback
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
  WHERE n.nspname='public' AND p.proname IN ('approve_artisan_claim','reject_artisan_claim','_supersede_competing_claims');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Rollback HARD STOP: 7C.12A.1 RPCs/helpers still present after DROP';
  END IF;
  RAISE NOTICE 'Rollback verify: 7C.12A.1 claim RPCs + helper removed ✓';

  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='sync_artisan_claim';
  IF v_count=0 THEN
    RAISE EXCEPTION 'Rollback HARD STOP: sync_artisan_claim not restored';
  END IF;
  RAISE NOTICE 'Rollback verify: sync_artisan_claim() restored ✓';

  SELECT COUNT(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='claim_requests'
    AND policyname IN ('7c12a1_deny_anon_all','7c12a1_auth_insert_own','7c12a1_auth_select');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Rollback HARD STOP: 7C.12A.1 canonical policies still present after DROP';
  END IF;
  RAISE NOTICE 'Rollback verify: 7C.12A.1 canonical policies removed ✓';

  RAISE NOTICE 'Rollback COMPLETE — WARNINGS:';
  RAISE NOTICE '  1. onboarding_completed defect re-introduced (auto-true from JSONB)';
  RAISE NOTICE '  2. verified=TRUE auto-set at approval re-introduced';
  RAISE NOTICE '  3. admin_all_claim_requests FOR ALL policy restored (browser direct UPDATE possible)';
END $$;

COMMIT;
