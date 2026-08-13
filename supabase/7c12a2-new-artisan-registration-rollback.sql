-- ════════════════════════════════════════════════════════════
-- 7C.12A.2 — New Artisan Canonical Registration ROLLBACK
-- supabase/7c12a2-new-artisan-registration-rollback.sql
--
-- Run ONLY if 7c12a2-new-artisan-registration.sql must be reverted.
-- HARD STOP if self-registered artisans exist (would lose real data).
-- READ STATE before undoing.
-- ════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_count integer;
BEGIN
  -- ── SAFETY HARD STOP ──────────────────────────────────────
  -- If any artisan rows were created by register_new_artisan
  -- (they have owner_user_id set, claim_status='approved', and were
  -- NOT pre-existing seeded rows — seeded rows have owner_user_id IS NULL),
  -- rolling back would delete real user-owned artisan rows.
  -- This is ONLY safe if the migration was applied but no new artisans registered yet.

  SELECT COUNT(*) INTO v_count FROM public.artisans
  WHERE owner_user_id IS NOT NULL
    AND claim_status = 'approved'
    AND onboarding_completed = false;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'ROLLBACK HARD STOP: % self-registered artisan(s) exist with owner_user_id set. '
      'Rolling back would destroy real user data. '
      'Manual remediation required before rollback.', v_count;
  END IF;

  RAISE NOTICE 'Rollback safety check PASSED: no self-registered artisans found';
END $$;

-- ── DROP register_new_artisan RPC ─────────────────────────
DROP FUNCTION IF EXISTS public.register_new_artisan(text, text, text, text, text);
-- Note: also drop 4-arg signature if browser called without description
DROP FUNCTION IF EXISTS public.register_new_artisan(text, text, text, text);
DROP FUNCTION IF EXISTS public.register_new_artisan(text, text, text);

-- ── DROP partial unique index ─────────────────────────────
DROP INDEX IF EXISTS public.artisans_owner_user_id_unique;

-- ── No RLS policy changes to revert (Step 3 made no changes) ──

COMMIT;
