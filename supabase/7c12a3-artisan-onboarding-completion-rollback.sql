-- ════════════════════════════════════════════════════════════════════════════
-- 7C.12A.3 — Rollback
-- File: 7c12a3-artisan-onboarding-completion-rollback.sql
-- Run ONLY if 7C.12A.3 migration must be undone.
-- ════════════════════════════════════════════════════════════════════════════
--
-- ROLLBACK SCOPE:
--   - DROP complete_artisan_onboarding() RPC
--   - Does NOT touch 7C.12A.2 (register_new_artisan, update_artisan_availability,
--     REVOKE/GRANT on artisans table, column grants, RLS policies)
--   - Does NOT touch 7C.12A.1 (approve/reject_artisan_claim)
--   - Does NOT revert onboarding_completed=true rows (data stays; no rollback of data)
--
-- SIDE EFFECTS:
--   After rollback: no artisan can self-complete onboarding via RPC.
--   Artisans who completed onboarding (onboarding_completed=true) retain that state
--   but availability cannot be changed to 'available' via update_artisan_availability()
--   because its onboarding gate will reject them if we re-drop completed state.
--   NOTE: only revert if this is a genuine rollback need — data cannot be un-written.
--
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- Safety check: warn if any artisans completed onboarding (data not reverted)
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.artisans
  WHERE onboarding_completed = true;
  IF v_count > 0 THEN
    RAISE NOTICE 'ROLLBACK WARN: % artisan(s) have onboarding_completed=true. '
      'Data rows are NOT reverted by this rollback. '
      'They will remain dispatch-eligible until manually updated by admin.', v_count;
  END IF;
END $$;

-- Drop complete_artisan_onboarding RPC
DROP FUNCTION IF EXISTS public.complete_artisan_onboarding();

COMMIT;
