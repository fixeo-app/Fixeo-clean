-- ════════════════════════════════════════════════════════════
-- 7C.11F.1 — Dispatch V1 Rollback
-- supabase/7c11f1-dispatch-v1-rollback.sql
-- Revision: 7C.11F.1C — transaction-safe rollback
--
-- Drops ONLY 11F.1 objects.
-- Does NOT touch 11C/11E RPCs, indexes, or columns.
-- Does NOT drop missions_one_offer_per_request or other 11C indexes.
--
-- TRANSACTION ATOMICITY (7C.11F.1C):
--   Wrapped in BEGIN/COMMIT so that:
--   - dispatch RPC drop and agreed_price SET NOT NULL are atomic.
--   - If SET NOT NULL fails (NULL rows exist), the entire rollback
--     transaction aborts — the dispatch RPC is NOT left permanently dropped.
--   - Either the full rollback succeeds, or the production state is unchanged.
--
-- STEP 0 ROLLBACK — agreed_price NOT NULL restore:
--   SAFETY CONSTRAINT: SET NOT NULL will fail if any mission row has
--   agreed_price IS NULL (i.e., any offered mission was created).
--   If 11F.1 dispatch was activated and created NULL-priced offers,
--   those rows must be manually resolved BEFORE running this rollback.
--   DO NOT attempt to UPDATE agreed_price on real mission rows.
--   If null rows exist: the transaction will abort (HARD STOP — no partial state).
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ── STEP 1: Safety check — abort if NULL agreed_price rows exist ──────
DO $$
DECLARE
  v_null_count integer;
BEGIN
  SELECT COUNT(*) INTO v_null_count
  FROM public.missions
  WHERE agreed_price IS NULL;

  IF v_null_count > 0 THEN
    -- HARD STOP: RAISE EXCEPTION aborts the entire BEGIN/COMMIT block.
    -- The dispatch RPC will NOT be dropped, and SET NOT NULL will NOT run.
    -- Production state is fully preserved.
    RAISE EXCEPTION
      'Rollback HARD STOP: % mission row(s) have agreed_price IS NULL. '
      'Dispatch was activated and created offered missions. '
      'Cannot restore NOT NULL without harming real mission data. '
      'Resolve NULL rows manually (ops decision) before retrying rollback. '
      'DO NOT run UPDATE missions SET agreed_price to work around this guard.',
      v_null_count;
  END IF;

  RAISE NOTICE 'Step 1: zero NULL agreed_price rows confirmed — safe to proceed';
END $$;

-- ── STEP 2: Drop the 11F.1 dispatch RPC ──────────────────────────────
DROP FUNCTION IF EXISTS public.dispatch_request_v1(uuid);

-- ── STEP 3: Restore agreed_price NOT NULL (Step 0 reverse) ───────────
DO $$
DECLARE
  v_current_nullable text;
BEGIN
  SELECT is_nullable INTO v_current_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'missions' AND column_name = 'agreed_price';

  IF v_current_nullable = 'NO' THEN
    RAISE NOTICE 'Step 3: agreed_price already NOT NULL — no change needed';
    RETURN;
  END IF;

  -- Zero null rows confirmed in Step 1 — safe to restore
  ALTER TABLE public.missions ALTER COLUMN agreed_price SET NOT NULL;
  RAISE NOTICE 'Step 3: agreed_price NOT NULL restored';
END $$;

-- ── STEP 4: Verify 11C/11E RPCs still present after rollback ─────────
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

  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'dispatch_request_v1';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Rollback FAIL: dispatch_request_v1 still exists after DROP';
  END IF;
  RAISE NOTICE 'Rollback verify: dispatch_request_v1 dropped ✓';
END $$;

COMMIT;
