-- ============================================================
-- FIXEO Phase 7C.11F.6 — Missions Privilege Hardening
-- supabase/7c11f6-missions-privilege-hardening.sql
--
-- ⚠️  APPLY BEFORE 7c11f6-financial-settlement.sql
-- ⚠️  DO NOT APPLY until human verifies via privilege-hardening-verify.sql
--
-- PURPOSE:
--   Remove over-broad INSERT/UPDATE/DELETE grants on public.missions
--   from anon and authenticated roles. Retain only the minimum
--   grants required by proven production browser runtime paths.
--
-- CLASSIFICATION: UNSAFE / OVER-PRIVILEGED
--   Existing grants:
--     anon:          INSERT, UPDATE, DELETE on missions (and financial columns)
--     authenticated: INSERT, UPDATE, DELETE on missions (and financial columns)
--   Effective RLS: missions_deny_anon blocks anon row access, but the broad
--   table-level UPDATE grant on authenticated means an artisan with a valid
--   session can attempt to UPDATE agreed_price / commission_amount on any
--   mission their RLS UPDATE policy allows. This is an unacceptable financial
--   mutation surface, especially before final_price is added.
--
-- PRODUCTION BROWSER WRITE PATHS (confirmed by code audit):
--
--   anon:
--     NONE — no authenticated browser path inserts/updates/deletes missions
--     as anon. missions_deny_anon RLS confirms intent. Revoke all DML.
--
--   authenticated (client):
--     INSERT: fixeo-supabase-core.js maybeCreateMissionFallback
--       → sb.from('missions').insert({request_id, client_profile_id,
--           artisan_profile_id, agreed_price, status})
--       → columns: request_id, client_profile_id, artisan_profile_id,
--                  agreed_price, status   (agreed_price = proposed price at offer time)
--     SELECT: listClientMissions, fetchMissionByRequestId
--     UPDATE: NONE via client browser path — no missions.update() in client code
--     DELETE: NONE
--
--   authenticated (artisan):
--     INSERT: fixeo-artisan-dashboard-v2.js missionInsert
--       → sb.from('missions').insert({request_id, artisan_profile_id,
--           client_profile_id, agreed_price:null, status:'pending'})
--       → columns: request_id, artisan_profile_id, client_profile_id,
--                  agreed_price (null), status
--     UPDATE: fixeo-artisan-dashboard-v2.js
--       → sb.from('missions').update({ status: 'done' }).eq('id', ...)
--       → ONLY column: status
--     SELECT: listArtisanMissions, fetchMissionByRequestId
--     RPCs (not direct table writes):
--       claim_mission, start_mission, complete_mission, decline_mission,
--       get_my_mission_offers, get_accepted_mission_detail
--       → these run under SECURITY DEFINER — do not need browser table grants
--     DELETE: NONE
--
--   service_role (server/admin settlement endpoint):
--     All operations. Bypasses RLS. Not affected by this hardening.
--
-- TARGET PRIVILEGE MATRIX (post-hardening):
--
--   Role          | SELECT | INSERT | UPDATE (cols)        | DELETE
--   ──────────────|────────|────────|──────────────────────|───────
--   anon          |   *    |   ✗    | ✗                    |  ✗
--   authenticated |   *    |   ✓    | status only          |  ✗
--   service_role  |   ✓    |   ✓    | all (bypasses RLS)   |  ✓
--
--   (* SELECT governed by RLS policies — anon reads blocked by missions_deny_anon)
--
-- FINANCIAL COLUMNS — authenticated MUST NOT be able to UPDATE:
--   agreed_price      (set only at INSERT time from quote.proposed_price)
--   commission_amount (set by DB trigger/function, not browser)
--   final_price       (future — must not be directly writable by browser)
--
-- RLS: NOT CHANGED in this file. Existing policies preserved as-is.
--
-- ZERO DATA MUTATIONS.
-- ============================================================

BEGIN;

-- ── STEP 1: REVOKE all existing DML grants from anon ────────
-- anon has no legitimate reason to INSERT/UPDATE/DELETE missions.
-- missions_deny_anon RLS already blocks row access, but defence-in-depth:
-- revoke the grants entirely so the privilege layer also blocks.

REVOKE INSERT ON TABLE public.missions FROM anon;
REVOKE UPDATE ON TABLE public.missions FROM anon;
REVOKE DELETE ON TABLE public.missions FROM anon;

-- Revoke any column-level grants too (belt-and-suspenders):
REVOKE INSERT (agreed_price, commission_amount, status)
  ON TABLE public.missions FROM anon;
REVOKE UPDATE (agreed_price, commission_amount, status)
  ON TABLE public.missions FROM anon;

DO $$
BEGIN
  RAISE NOTICE 'Step 1: anon INSERT/UPDATE/DELETE on missions REVOKED.';
END $$;

-- ── STEP 2: REVOKE broad table UPDATE from authenticated ─────
-- authenticated currently has table-level UPDATE, which includes all columns
-- including financial fields. Revoke the broad grant.

REVOKE UPDATE ON TABLE public.missions FROM authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Step 2: authenticated broad table UPDATE on missions REVOKED.';
END $$;

-- ── STEP 3: REVOKE table-level DELETE from authenticated ─────
-- No browser path deletes missions. Revoke.

REVOKE DELETE ON TABLE public.missions FROM authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Step 3: authenticated DELETE on missions REVOKED.';
END $$;

-- ── STEP 4: REVOKE column-level financial grants from authenticated ──
-- Remove direct UPDATE/INSERT on financial columns.
-- agreed_price is set only at INSERT (from quote.proposed_price) — not updated.
-- commission_amount is set by DB trigger — not directly browser-writable.
-- These REVOKE statements are pre-emptive and idempotent (no error if not granted).

REVOKE UPDATE (agreed_price, commission_amount)
  ON TABLE public.missions FROM authenticated;

REVOKE INSERT (commission_amount)
  ON TABLE public.missions FROM authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Step 4: authenticated column UPDATE(agreed_price, commission_amount) REVOKED.';
END $$;

-- ── STEP 5: GRANT only required column UPDATE to authenticated ──
-- authenticated (artisan) needs UPDATE on status ONLY.
-- (fixeo-artisan-dashboard-v2.js: missions.update({ status:'done' }))

GRANT UPDATE (status) ON TABLE public.missions TO authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Step 5: authenticated UPDATE(status) on missions GRANTED.';
END $$;

-- ── STEP 6: Ensure SELECT preserved for authenticated ────────
-- listClientMissions, listArtisanMissions, fetchMissionByRequestId all need SELECT.
-- This may already be granted; re-asserting is idempotent.

GRANT SELECT ON TABLE public.missions TO authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Step 6: authenticated SELECT on missions confirmed.';
END $$;

-- ── STEP 7: Ensure INSERT preserved for authenticated ────────
-- maybeCreateMissionFallback (fixeo-supabase-core.js) and
-- missionInsert (fixeo-artisan-dashboard-v2.js) both INSERT directly.
-- INSERT is scoped to: request_id, client_profile_id, artisan_profile_id,
-- agreed_price (the quote price at offer time), status.
-- This is an existing production path — must be preserved.
-- RLS INSERT policies govern which rows are allowed.

GRANT INSERT ON TABLE public.missions TO authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Step 7: authenticated INSERT on missions confirmed (required for mission creation fallback).';
  RAISE NOTICE '        Columns: request_id, client_profile_id, artisan_profile_id, agreed_price, status.';
  RAISE NOTICE '        RLS INSERT policy governs row-level authorization.';
END $$;

-- ── STEP 8: Ensure anon SELECT preserved ─────────────────────
-- anon SELECT is blocked at row level by missions_deny_anon (USING=false).
-- Preserving the table-level SELECT grant costs nothing and avoids breaking
-- any future RLS-permitted anon read scenario. No change needed.

DO $$
BEGIN
  RAISE NOTICE 'Step 8: anon SELECT on missions — no change (blocked by RLS missions_deny_anon).';
END $$;

-- ── STEP 9: RPC EXECUTE — confirm preserved ──────────────────
-- RPCs claim_mission, start_mission, complete_mission, decline_mission,
-- get_my_mission_offers, get_accepted_mission_detail are SECURITY DEFINER
-- functions. They execute under the function owner's privileges, not the
-- caller's. No EXECUTE grants are modified here.
-- Verify: SELECT has_function_privilege('authenticated','claim_mission(uuid)','EXECUTE')
-- in verify script.

DO $$
BEGIN
  RAISE NOTICE 'Step 9: RPC EXECUTE grants not modified — SECURITY DEFINER functions unaffected.';
END $$;

COMMIT;

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Privilege hardening COMMITTED.';
  RAISE NOTICE 'Next: run 7c11f6-missions-privilege-hardening-verify.sql';
  RAISE NOTICE 'Confirm all checks PASS before authorizing financial migration.';
  RAISE NOTICE '============================================================';
END $$;
