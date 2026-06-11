-- ============================================================
-- FIXEO — Audit probe row cleanup
-- File: supabase/cleanup-probe-rows.sql
-- Date: 2026-06-11
-- Apply: Supabase Dashboard → SQL Editor → New query
--        Must be run as admin (authenticated session, role=admin)
--        Anon DELETE is blocked by RLS — these rows are permanent
--        until removed by an admin session.
--
-- WHAT: Deletes 2 probe rows inserted during the 2026-06-11
--       certification audit. They have no operational value
--       and pollute the admin dashboard.
--
-- SAFE: Deletes ONLY rows matching specific description values
--       used exclusively during the audit. No real booking data
--       uses these descriptions.
-- ============================================================


-- ── Step 1: PREVIEW — confirm rows before deleting ──────────
-- Run this first. Both rows should appear.
SELECT
  id,
  description,
  service_category,
  city,
  status,
  client_profile_id,
  created_at
FROM public.service_requests
WHERE description IN (
  'rls-audit-probe',
  'probe-v2-select-test'
)
ORDER BY created_at ASC;

-- Expected output (2 rows):
--   5594f2b4 | rls-audit-probe      | test     | test | new | null | 2026-06-11T10:04:09
--   1744265e | probe-v2-select-test | Plomberie| Test | new | null | 2026-06-11T10:16:03


-- ── Step 2: DELETE probe rows ────────────────────────────────
-- Only removes rows with audit probe description values.
-- All real bookings have meaningful descriptions — never these.
DELETE FROM public.service_requests
WHERE description IN (
  'rls-audit-probe',
  'probe-v2-select-test'
);

-- Expected: DELETE 2


-- ── Step 3: Verify — confirm 0 probe rows remain ────────────
SELECT COUNT(*)
FROM public.service_requests
WHERE description IN (
  'rls-audit-probe',
  'probe-v2-select-test'
);
-- Expected: 0
-- ============================================================
