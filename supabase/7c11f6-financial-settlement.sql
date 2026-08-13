-- ============================================================
-- FIXEO Phase 7C.11F.6 — Financial Settlement Migration
-- supabase/7c11f6-financial-settlement.sql  (v2 — trigger-aware)
--
-- ⚠️  PREREQUISITE (1): 7c11f6-missions-privilege-hardening.sql
--     MUST have been applied and verified (all 12 checks PASS).
-- ⚠️  PREREQUISITE (2): 7c11f6-missions-insert-column-hardening.sql
--     MUST have been applied and verified (all 16 checks PASS).
--     This replaces authenticated table-level INSERT with column-level
--     INSERT grants, ensuring final_price cannot be supplied by browser.
--
-- PURPOSE
-- ───────
-- 1. Add missions.final_price (admin-confirmed intervention price).
-- 2. Correct the commission trigger so it uses final_price when settled,
--    agreed_price when not yet settled, and 0 as safe fallback when
--    both are NULL (artisan dispatch path).
-- 3. Revoke any write access on final_price from anon / authenticated.
--
-- PRODUCTION SCHEMA FACTS (confirmed live 2026-08-13):
--   missions contains 0 rows — no historical data to preserve.
--   missions.commission_amount: NUMERIC NOT NULL DEFAULT 0  (exists)
--   missions.agreed_price:      NUMERIC(10,2) nullable      (exists)
--   missions.final_price:       MISSING — to be added here
--   trigger trg_set_commission_amount: BEFORE INSERT OR UPDATE
--   function set_commission_amount():  always uses agreed_price * 0.15
--
-- CANONICAL COMMISSION CONTRACT (post-migration):
--   Phase 1 (provisional): commission = round(agreed_price * 0.15, 2)
--     → trigger fires on INSERT or UPDATE when final_price IS NULL
--   Phase 2 (settled):     commission = round(final_price  * 0.15, 2)
--     → trigger fires on UPDATE when final_price IS NOT NULL
--   Fallback:              commission = 0 (agreed_price NULL, not yet settled)
--   artisan_net: derived server-side only — NOT stored
--
-- INSERT PATHS:
--   fixeo-artisan-dashboard-v2.js: agreed_price=null → commission=0 (correct)
--   fixeo-supabase-core.js:        agreed_price=Number(proposed_price||0)
--     → commission = round(0 * 0.15, 2) = 0 when no price yet (correct)
--
-- SETTLEMENT ENDPOINT CHANGE:
--   api/admin-settle-mission-fn PATCHes final_price ONLY.
--   The trigger then computes commission_amount = round(final_price*0.15,2).
--   This eliminates the endpoint↔trigger conflict entirely.
--   commission_amount is never stale or overwritten with wrong value.
--
-- COLUMNS ADDED:
--   missions.final_price  NUMERIC(10,2) nullable (admin settlement price)
--
-- COLUMNS NOT ADDED:
--   artisan_net         — derived server-side, never stored
--   service_requests.final_price — not required by canonical architecture
--
-- COLUMNS NOT CHANGED:
--   commission_amount   — schema unchanged (NOT NULL DEFAULT 0)
--                         semantics upgraded via trigger replacement
--   agreed_price        — unchanged
--
-- COMMISSION RATE: 0.15 (15%) — canonical across all admin JS files.
--
-- ADDITIVE ONLY. Idempotent. Zero data mutation. Zero data loss.
-- ============================================================

BEGIN;

-- ── STEP 1: Add final_price column if missing ───────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'missions'
      AND column_name  = 'final_price'
  ) THEN
    ALTER TABLE public.missions
      ADD COLUMN final_price NUMERIC(10,2) DEFAULT NULL;
    RAISE NOTICE 'Step 1: missions.final_price added (NUMERIC(10,2) nullable).';
  ELSE
    RAISE NOTICE 'Step 1: missions.final_price already exists — skipped.';
  END IF;
END $$;

-- ── STEP 2: Add CHECK constraint on final_price ─────────────
-- final_price must be positive when set; NULL means not yet settled.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t     ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname  = 'public'
      AND t.relname  = 'missions'
      AND c.contype  = 'c'
      AND c.conname  = 'missions_final_price_check'
  ) THEN
    ALTER TABLE public.missions
      ADD CONSTRAINT missions_final_price_check
      CHECK (final_price IS NULL OR final_price > 0);
    RAISE NOTICE 'Step 2: CHECK missions_final_price_check added.';
  ELSE
    RAISE NOTICE 'Step 2: missions_final_price_check already exists — skipped.';
  END IF;
END $$;

-- ── STEP 3: Replace commission trigger function ─────────────
-- Old behaviour: commission_amount = round(agreed_price * 0.15, 2) always.
-- Problem:       agreed_price=NULL causes NULL commission violating NOT NULL.
--                Settlement PATCH of final_price also triggers this, overwriting
--                commission_amount with agreed_price-based value (wrong).
--
-- New behaviour:
--   IF NEW.final_price IS NOT NULL
--     → settled phase: commission = round(final_price * 0.15, 2)
--   ELSIF NEW.agreed_price IS NOT NULL
--     → provisional phase: commission = round(agreed_price * 0.15, 2)
--   ELSE
--     → unknown price: commission = 0 (safe fallback, preserves NOT NULL)
--
-- This is idempotent (CREATE OR REPLACE). Trigger itself is unchanged.
-- Both INSERT and UPDATE paths are covered. Rate remains canonical 15%.

CREATE OR REPLACE FUNCTION public.set_commission_amount()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.final_price IS NOT NULL THEN
    -- Settled phase: commission based on admin-confirmed final price
    NEW.commission_amount := ROUND((NEW.final_price * 0.15)::numeric, 2);
  ELSIF NEW.agreed_price IS NOT NULL THEN
    -- Provisional phase: commission based on agreed/quoted price
    NEW.commission_amount := ROUND((NEW.agreed_price * 0.15)::numeric, 2);
  ELSE
    -- Unknown price (artisan dispatch insert, agreed_price=NULL, not settled)
    -- Preserve NOT NULL constraint with canonical zero
    NEW.commission_amount := 0;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE 'Step 3: set_commission_amount() replaced with final_price-aware version.';
  RAISE NOTICE '        Trigger trg_set_commission_amount (BEFORE INSERT OR UPDATE) unchanged.';
  RAISE NOTICE '        Rate: 15%%. artisan_net: derived server-side only, not stored.';
END $$;

-- ── STEP 4: Revoke write access on final_price ──────────────
-- Belt-and-suspenders after privilege hardening (which revoked broad UPDATE).
-- These REVOKEs are idempotent — no error if grant does not exist.

DO $$
BEGIN
  EXECUTE 'REVOKE UPDATE (final_price) ON TABLE public.missions FROM anon';
  RAISE NOTICE 'Step 4a: anon UPDATE(final_price) revoked.';
EXCEPTION WHEN undefined_object OR invalid_grant_operation THEN
  RAISE NOTICE 'Step 4a: anon UPDATE(final_price) — no grant found (expected after hardening).';
END $$;

DO $$
BEGIN
  EXECUTE 'REVOKE UPDATE (final_price) ON TABLE public.missions FROM authenticated';
  RAISE NOTICE 'Step 4b: authenticated UPDATE(final_price) revoked.';
EXCEPTION WHEN undefined_object OR invalid_grant_operation THEN
  RAISE NOTICE 'Step 4b: authenticated UPDATE(final_price) — no grant found (expected after hardening).';
END $$;

DO $$
BEGIN
  RAISE NOTICE '---';
  RAISE NOTICE 'Step 4 complete. final_price is WRITE-RESTRICTED.';
  RAISE NOTICE '  Write authority: service_role (settlement endpoint) only.';
  RAISE NOTICE '  Browser INSERT is column-restricted (insert-column-hardening applied).';
  RAISE NOTICE '  anon: no DML. authenticated: UPDATE(status) + column INSERT only.';
  RAISE NOTICE '  final_price: not in authenticated column INSERT grants.';
  RAISE NOTICE '  Column-level REVOKE INSERT(final_price) omitted — superseded by';
  RAISE NOTICE '  7c11f6-missions-insert-column-hardening.sql table-level REVOKE.';
END $$;

COMMIT;

-- ── POST-MIGRATION SPOT CHECK (READ-ONLY, outside transaction) ──
-- Returns immediately-verifiable rows confirming the migration.

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default,
  numeric_precision,
  numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'missions'
  AND column_name  IN ('final_price', 'commission_amount', 'agreed_price')
ORDER BY column_name;

SELECT
  conname                          AS constraint_name,
  pg_get_constraintdef(oid)        AS definition
FROM pg_constraint
WHERE conrelid = 'public.missions'::regclass
  AND contype  = 'c'
  AND conname  IN ('missions_final_price_check')
ORDER BY conname;

SELECT
  p.proname                        AS function_name,
  pg_get_functiondef(p.oid)        AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'set_commission_amount';
