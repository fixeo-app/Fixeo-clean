-- ============================================================
-- FIXEO Phase 7C.11F.6 — Financial Settlement Migration
-- supabase/7c11f6-financial-settlement.sql
--
-- ⚠️  DO NOT RUN UNTIL PREFLIGHT CONFIRMS SCENARIO B.
-- ⚠️  If preflight returns SCENARIO A, skip this file entirely.
--
-- PURPOSE: Add canonical financial settlement columns to missions.
--
-- ADDITIVE ONLY. Idempotent. Zero data loss.
--
-- COLUMNS ADDED (if missing):
--   missions.final_price       NUMERIC(10,2) nullable — admin-confirmed intervention amount
--   missions.commission_amount NUMERIC(10,2) nullable — FIXEO commission (15% of final_price)
--
-- COLUMNS NOT ADDED (derivable, no stored redundancy):
--   artisan_net — computed server-side as final_price - commission_amount
--                 No stored column. Prevents double-truth.
--
-- COMMISSION RATE: 0.15 (15%) — canonical across 5 authoritative JS files:
--   admin-mission-supervision-p3.js, admin-control-center-p1.js,
--   fixeo-client-requests-store.js, admin.js, admin-analytics-real-v1.js
--
-- SETTLEMENT ELIGIBILITY: missions with status IN ('terminée','validée')
--   — same contract as existing commission lifecycle.
--
-- AFTER THIS MIGRATION:
--   Run 7c11f6-financial-settlement-verify.sql to confirm.
--   Then authorize deployment of api/admin-settle-mission-fn/index.js.
-- ============================================================

BEGIN;

-- ── STEP 1: Add final_price if missing ─────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='missions' AND column_name='final_price'
  ) THEN
    ALTER TABLE public.missions ADD COLUMN final_price NUMERIC(10,2) DEFAULT NULL;
    RAISE NOTICE 'Step 1: missions.final_price added (NUMERIC(10,2) nullable)';
  ELSE
    RAISE NOTICE 'Step 1: missions.final_price already exists — skipped';
  END IF;
END $$;

-- ── STEP 2: Add commission_amount if missing ────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='missions' AND column_name='commission_amount'
  ) THEN
    ALTER TABLE public.missions ADD COLUMN commission_amount NUMERIC(10,2) DEFAULT NULL;
    RAISE NOTICE 'Step 2: missions.commission_amount added (NUMERIC(10,2) nullable)';
  ELSE
    RAISE NOTICE 'Step 2: missions.commission_amount already exists — skipped';
  END IF;
END $$;

-- ── STEP 3: Add CHECK constraints (skip if column pre-existed with its own constraint) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname='public' AND t.relname='missions' AND c.contype='c'
      AND c.conname='missions_final_price_check'
  ) THEN
    ALTER TABLE public.missions
      ADD CONSTRAINT missions_final_price_check
      CHECK (final_price IS NULL OR final_price > 0);
    RAISE NOTICE 'Step 3a: CHECK constraint missions_final_price_check added';
  ELSE
    RAISE NOTICE 'Step 3a: missions_final_price_check already exists — skipped';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname='public' AND t.relname='missions' AND c.contype='c'
      AND c.conname='missions_commission_amount_check'
  ) THEN
    ALTER TABLE public.missions
      ADD CONSTRAINT missions_commission_amount_check
      CHECK (commission_amount IS NULL OR commission_amount > 0);
    RAISE NOTICE 'Step 3b: CHECK constraint missions_commission_amount_check added';
  ELSE
    RAISE NOTICE 'Step 3b: missions_commission_amount_check already exists — skipped';
  END IF;
END $$;

-- ── STEP 4: Explicit privilege guard for final_price ────────
-- PREREQUISITE: 7c11f6-missions-privilege-hardening.sql MUST have been
-- applied before this migration. That file revoked broad UPDATE from
-- authenticated and column UPDATE on agreed_price/commission_amount.
--
-- This step ensures final_price also cannot be directly updated by
-- anon or authenticated browsers. It is belt-and-suspenders: if hardening
-- was applied correctly, these REVOKE statements are no-ops (idempotent).
-- If hardening was NOT applied, this prevents the new column from being
-- silently writable.

DO $$
BEGIN
  -- Revoke any inherited/default UPDATE on final_price for anon
  EXECUTE 'REVOKE UPDATE (final_price) ON TABLE public.missions FROM anon';
  RAISE NOTICE 'Step 4a: anon UPDATE(final_price) revoked.';
EXCEPTION WHEN undefined_object THEN
  RAISE NOTICE 'Step 4a: anon UPDATE(final_price) — no grant found (expected after hardening).';
END $$;

DO $$
BEGIN
  -- Revoke any inherited/default UPDATE on final_price for authenticated
  EXECUTE 'REVOKE UPDATE (final_price) ON TABLE public.missions FROM authenticated';
  RAISE NOTICE 'Step 4b: authenticated UPDATE(final_price) revoked.';
EXCEPTION WHEN undefined_object THEN
  RAISE NOTICE 'Step 4b: authenticated UPDATE(final_price) — no grant found (expected after hardening).';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'Step 4c: final_price is WRITE-RESTRICTED.';
  RAISE NOTICE '         Only service_role (settlement endpoint server-side) can write it.';
  RAISE NOTICE '         Commission rate: 15%% (canonical FIXEO rate).';
  RAISE NOTICE '         artisan_net: derived server-side only, not stored.';
END $$;

COMMIT;

-- ── POST-MIGRATION SPOT CHECK ─────────────────────────────
SELECT
  column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='missions'
  AND column_name IN ('final_price','commission_amount')
ORDER BY column_name;

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.missions'::regclass
  AND contype = 'c'
  AND conname IN ('missions_final_price_check','missions_commission_amount_check');
