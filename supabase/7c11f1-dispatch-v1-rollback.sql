-- ════════════════════════════════════════════════════════════
-- 7C.11F.1 — Dispatch V1 Rollback
-- supabase/7c11f1-dispatch-v1-rollback.sql
-- Revision: 7C.11F.1B — includes Step 0 (agreed_price) rollback
--
-- Drops ONLY 11F.1 objects.
-- Does NOT touch 11C/11E RPCs, indexes, or columns.
-- Does NOT drop missions_one_offer_per_request or other 11C indexes.
--
-- STEP 0 ROLLBACK — agreed_price NOT NULL restore:
--   SAFETY CONSTRAINT: this step WILL FAIL if any mission row has
--   agreed_price IS NULL (i.e., any offered mission was created).
--   If 11F.1 dispatch was activated and created NULL-priced offers,
--   those rows must be manually resolved BEFORE running this rollback.
--   DO NOT attempt to UPDATE agreed_price on real mission rows.
--   If null rows exist: HARD STOP — do not restore NOT NULL.
-- ════════════════════════════════════════════════════════════

-- ── STEP 1: Drop the 11F.1 dispatch RPC ──────────────────────────────
DROP FUNCTION IF EXISTS public.dispatch_request_v1(uuid);

-- ── STEP 2: Rollback agreed_price NOT NULL (Step 0 reverse) ──────────
DO $$
DECLARE
  v_null_count integer;
  v_current_nullable text;
BEGIN
  -- Check current nullability
  SELECT is_nullable INTO v_current_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'missions' AND column_name = 'agreed_price';

  IF v_current_nullable = 'NO' THEN
    RAISE NOTICE 'Step 0 rollback: agreed_price already NOT NULL — no action needed';
    RETURN;
  END IF;

  -- SAFETY: count missions with NULL agreed_price
  SELECT COUNT(*) INTO v_null_count
  FROM public.missions
  WHERE agreed_price IS NULL;

  IF v_null_count > 0 THEN
    -- HARD STOP: cannot restore NOT NULL while NULL rows exist.
    -- This means dispatch was activated and created offered missions.
    -- Manual ops resolution required before rollback.
    RAISE EXCEPTION
      'Step 0 rollback HARD STOP: % mission row(s) have agreed_price IS NULL. '
      'Cannot restore NOT NULL constraint without deleting/updating real mission data. '
      'Resolve NULL rows manually (ops decision) before retrying rollback. '
      'DO NOT run UPDATE missions SET agreed_price=0 — that fabricates a price.',
      v_null_count;
  END IF;

  -- Zero null rows — safe to restore NOT NULL
  ALTER TABLE public.missions ALTER COLUMN agreed_price SET NOT NULL;
  RAISE NOTICE 'Step 0 rollback: agreed_price NOT NULL restored (zero null rows confirmed)';
END $$;

-- ── STEP 3: Verify 11C/11E RPCs still present after rollback ─────────
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

  -- Confirm dispatch RPC is gone
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'dispatch_request_v1';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Rollback FAIL: dispatch_request_v1 still exists after DROP';
  END IF;
  RAISE NOTICE 'Rollback verify: dispatch_request_v1 dropped ✓';
END $$;
