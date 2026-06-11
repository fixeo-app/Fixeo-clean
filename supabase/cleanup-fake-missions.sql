-- ============================================================
-- FIXEO — Fake/test missions cleanup
-- File: supabase/cleanup-fake-missions.sql
-- Date: 2026-06-11
-- Apply: Supabase Dashboard → SQL Editor → New query
--
-- WHAT: Removes missions rows whose request_id is NOT a valid UUID.
--   These are test/probe rows inserted during development.
--   Real production missions always have a proper UUID request_id.
--
-- SAFE: Zero risk of deleting real data — the UUID regex is exact.
--   Real UUID rows are NEVER touched.
--
-- HOW TO USE:
--   Step 1 — Run PREVIEW query. Review output. Confirm these are test rows.
--   Step 2 — Run DELETE query only after visual confirmation.
-- ============================================================


-- ============================================================
-- STEP 1: PREVIEW — review before deleting
-- Run this first. All listed rows should be test/probe data.
-- ============================================================
SELECT
  id,
  request_id,
  artisan_profile_id,
  status,
  created_at
FROM public.missions
WHERE request_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ORDER BY created_at ASC;

-- Expected output (11 rows as of 2026-06-11):
--   v2c1e-probe-anon               | None    | nouvelle
--   v2c1e-probe-anon2              | None    | pending
--   v2c1e-probe-anon3              | None    | nouvelle
--   v2c1e-count-test-1778470519209 | None    | nouvelle
--   v2c1f-preflight-1778470976200  | None    | nouvelle
--   1778471011634                  | e0b8ddf7| validée
--   v2c1e-vis-test-1778470528039   | e0b8ddf7| nouvelle
--   definitive-test-1778470547713  | e0b8ddf7| nouvelle
--   1778708746577                  | 73034487| nouvelle
--   test-anon-rls                  | None    | pending
--   anon-rls-insert-final          | None    | nouvelle
-- ============================================================


-- ============================================================
-- STEP 2: SAFETY CHECK — confirm real UUID rows are preserved
-- Should return exactly 3 rows (Youness El Alaoui's missions).
-- ============================================================
SELECT
  id,
  request_id,
  artisan_profile_id,
  status
FROM public.missions
WHERE request_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ORDER BY created_at ASC;

-- Expected output (3 rows):
--   a1ee1391-243e-489b-8a7e-5b83cecff13e | f93c43e8... | pending
--   b1cf18ba-5d53-44d7-ac55-42c4434a4899 | f93c43e8... | pending
--   9d30d61c-6d8c-4010-98e8-184434648942 | f93c43e8... | pending
-- ============================================================


-- ============================================================
-- STEP 3: DELETE — only run after reviewing Step 1 output
-- Deletes ONLY rows with non-UUID request_id.
-- Real production rows (UUID request_ids) are untouched.
-- ============================================================
DELETE FROM public.missions
WHERE request_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- After running: verify only 3 real rows remain:
-- SELECT id, request_id, status FROM public.missions;
-- ============================================================
