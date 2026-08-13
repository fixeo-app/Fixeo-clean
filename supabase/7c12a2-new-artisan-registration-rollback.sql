-- ════════════════════════════════════════════════════════════
-- 7C.12A.2 — Rollback: New Artisan Canonical Registration (v2)
-- supabase/7c12a2-new-artisan-registration-rollback.sql
--
-- SAFETY CONTRACT:
--   This rollback is HARD-STOPPED if any self-registered artisans exist.
--   Self-registered artisans (owner_user_id IS NOT NULL AND legacy_id IS NULL)
--   were created by register_new_artisan(). Removing the RPC and index
--   while their rows exist would orphan live registrations.
--
--   Do NOT run this rollback if real artisans have self-registered.
--
-- WHAT THIS ROLLBACK DOES:
--   1. Verifies no self-registered artisans exist (HARD STOP if any found)
--   2. Drops update_artisan_availability() RPC
--   3. Drops register_new_artisan() RPC
--   4. Drops artisans_owner_user_id_unique partial index
--   5. Restores table-level UPDATE grant to authenticated
--   6. Revokes column-specific grants (they become redundant once table-level restored)
--   7. Restores artisans_owner_update to pre-7C.12A.2 form (no column restriction)
--
-- WHAT THIS ROLLBACK DOES NOT TOUCH:
--   - 7C.12A.1 RPCs (approve_artisan_claim, reject_artisan_claim)
--   - claim_requests table or RLS
--   - dispatch_request_v1
--   - Any existing seeded artisan data
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ── HARD STOP: self-registered artisans exist ────────────────
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.artisans
  WHERE owner_user_id IS NOT NULL;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'ROLLBACK HARD STOP: % artisan(s) with owner_user_id IS NOT NULL found. '
      'Dropping the registration RPC and index would orphan live self-registered artisans. '
      'Aborting rollback.', v_count;
  END IF;

  RAISE NOTICE 'ROLLBACK: No self-registered artisans found — safe to proceed.';
END $$;

-- ── Drop RPCs ────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.update_artisan_availability(text);
DROP FUNCTION IF EXISTS public.register_new_artisan(text, text, text, text, text);
RAISE NOTICE 'ROLLBACK: RPCs dropped.';

-- ── Drop unique index ────────────────────────────────────────
DROP INDEX IF EXISTS public.artisans_owner_user_id_unique;
RAISE NOTICE 'ROLLBACK: artisans_owner_user_id_unique index dropped.';

-- ── Restore table-level UPDATE grant ─────────────────────────
GRANT UPDATE ON public.artisans TO authenticated;
RAISE NOTICE 'ROLLBACK: Table-level UPDATE on artisans restored to authenticated.';

-- ── Revoke column-specific grants (now superseded by table-level) ─
REVOKE UPDATE (full_name, service_category, city, description, work_zone)
  ON public.artisans FROM authenticated;
RAISE NOTICE 'ROLLBACK: Column-specific grants revoked (superseded by table-level).';

-- ── Restore artisans_owner_update to pre-7C.12A.2 form ───────
DROP POLICY IF EXISTS "artisans_owner_update" ON public.artisans;
CREATE POLICY "artisans_owner_update" ON public.artisans
  FOR UPDATE
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());
RAISE NOTICE 'ROLLBACK: artisans_owner_update policy restored (unrestricted columns — pre-7C.12A.2 state).';

COMMIT;
