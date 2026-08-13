-- ============================================================
-- FIXEO Phase 7C.11F.6 — Missions INSERT Column Hardening
-- supabase/7c11f6-missions-insert-column-hardening.sql
--
-- ⚠️  APPLY AFTER 7c11f6-missions-privilege-hardening.sql (already live).
-- ⚠️  APPLY BEFORE 7c11f6-financial-settlement.sql.
--
-- PROBLEM
-- ───────
-- PostgreSQL privilege model: when a role holds table-level INSERT,
-- column-level REVOKE INSERT has no effect. The prior hardening
-- (7c11f6-missions-privilege-hardening.sql) preserved authenticated
-- table-level INSERT for the browser mission-creation fallback paths,
-- then attempted REVOKE INSERT(commission_amount) — which is a no-op
-- under table-level INSERT. This means authenticated could currently
-- supply final_price or commission_amount in an INSERT payload.
--
-- SOLUTION
-- ────────
-- Replace authenticated table-level INSERT with explicit column-level
-- INSERT grants covering only the exact columns used by all three
-- confirmed browser INSERT paths:
--
--   Path 1 — fixeo-supabase-core.js maybeCreateMissionFallback (client):
--     request_id, client_profile_id, artisan_profile_id, agreed_price, status
--
--   Path 2 — fixeo-artisan-dashboard-v2.js missionInsert (artisan):
--     request_id, artisan_profile_id, client_profile_id, agreed_price, status
--
--   Path 3 — fixeo-dispatch-engine.js dispatch (admin browser):
--     request_id, artisan_profile_id, client_profile_id, status, agreed_price
--
--   Union of all three: request_id, client_profile_id, artisan_profile_id,
--                       agreed_price, status
--
-- CONFIRMED ABSENT FROM ALL INSERT PATHS:
--   final_price       — never in any browser INSERT payload
--   commission_amount — never in any browser INSERT payload (DB default/trigger)
--
-- POST-HARDENING PRIVILEGE MATRIX (INSERT dimension):
--
--   Role          | Table INSERT | Column INSERT (exact)
--   ──────────────|──────────────|───────────────────────────────────────────
--   anon          | ✗ (revoked)  | ✗
--   authenticated | ✗ (revoked)  | request_id, client_profile_id,
--                 |              | artisan_profile_id, agreed_price, status
--   service_role  | ✓ (bypasses) | all (RLS bypass)
--
-- RLS: NOT CHANGED. UPDATE/DELETE/SELECT grants: NOT CHANGED.
-- Zero schema changes. Zero data mutations.
-- ============================================================

BEGIN;

-- ── STEP 1: Revoke table-level INSERT from authenticated ─────
-- This is the critical change. Column-level grants replace it.
-- anon INSERT was already revoked by prior hardening — idempotent here.

REVOKE INSERT ON TABLE public.missions FROM authenticated;
REVOKE INSERT ON TABLE public.missions FROM anon;

DO $$
BEGIN
  RAISE NOTICE 'Step 1: authenticated + anon table-level INSERT on missions REVOKED.';
END $$;

-- ── STEP 2: Grant exact column-level INSERT to authenticated ─
-- Covers the union of all three confirmed browser INSERT paths.
-- commission_amount and final_price are intentionally excluded.
-- commission_amount is set by the DB trigger (BEFORE INSERT).
-- final_price is admin-only (settlement endpoint, service_role).

GRANT INSERT (
  request_id,
  client_profile_id,
  artisan_profile_id,
  agreed_price,
  status
) ON TABLE public.missions TO authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Step 2: authenticated column INSERT granted for:';
  RAISE NOTICE '        request_id, client_profile_id, artisan_profile_id,';
  RAISE NOTICE '        agreed_price, status.';
  RAISE NOTICE '        final_price: NOT granted.';
  RAISE NOTICE '        commission_amount: NOT granted (set by DB trigger).';
END $$;

-- ── STEP 3: Confirm anon retains no DML ─────────────────────
-- Belt-and-suspenders — already revoked by prior hardening.

REVOKE INSERT ON TABLE public.missions FROM anon;
REVOKE UPDATE ON TABLE public.missions FROM anon;
REVOKE DELETE ON TABLE public.missions FROM anon;

DO $$
BEGIN
  RAISE NOTICE 'Step 3: anon INSERT/UPDATE/DELETE on missions confirmed REVOKED.';
END $$;

-- ── STEP 4: Confirm authenticated UPDATE(status) preserved ───
-- Prior hardening granted UPDATE(status) — re-assert idempotently.

GRANT UPDATE (status) ON TABLE public.missions TO authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Step 4: authenticated UPDATE(status) confirmed GRANTED.';
END $$;

-- ── STEP 5: Confirm authenticated SELECT preserved ───────────

GRANT SELECT ON TABLE public.missions TO authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Step 5: authenticated SELECT confirmed GRANTED.';
END $$;

COMMIT;

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'INSERT column hardening COMMITTED.';
  RAISE NOTICE 'Next: run 7c11f6-missions-insert-column-hardening-verify.sql';
  RAISE NOTICE 'Confirm all checks PASS before applying financial migration.';
  RAISE NOTICE '============================================================';
END $$;
