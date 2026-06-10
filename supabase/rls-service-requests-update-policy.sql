-- =============================================================
-- FIXEO — RLS UPDATE policy for service_requests
-- File: supabase/rls-service-requests-update-policy.sql
-- Created: 2026-06-10
-- Context: dashboard_p0_rls_plan.sql defined SELECT, INSERT, DELETE
--          but omitted a FOR UPDATE policy. When RLS is ON with no
--          UPDATE policy, all UPDATE calls return 0 rows to PostgREST.
--          .single() on 0 rows throws PGRST116:
--          "Cannot coerce the result to a single JSON object"
-- =============================================================

-- VERIFICATION QUERY (run first — read only):
-- Check whether an UPDATE policy exists already:
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'service_requests'
  AND cmd = 'UPDATE';
-- If this returns 0 rows → no UPDATE policy → apply Step 1 below.

-- =============================================================
-- Step 1 — Allow authenticated clients to update their OWN requests
-- Scope: clients can set status='validated' (confirm completion)
--        on rows they own (client_profile_id = auth.uid()).
--
-- ⚠️ REVIEW: This policy uses client_profile_id as the ownership
-- column. Confirmed present in service_requests from the audit:
--   "service_requests: id, client_profile_id, service_category,
--    city, description, status, created_at"
--
-- This allows the client to update ANY column on their own rows.
-- Tighten with WITH CHECK (status IN ('validated')) if you want to
-- restrict which status transitions the client can make.
-- =============================================================

CREATE POLICY "client_own_requests_update"
  ON public.service_requests
  FOR UPDATE
  TO authenticated
  USING     (client_profile_id = auth.uid())
  WITH CHECK (client_profile_id = auth.uid());

-- =============================================================
-- Step 2 (optional tightening) — restrict client to only setting
-- status = 'validated' (the confirm-completion transition):
-- =============================================================
-- DROP POLICY "client_own_requests_update" ON public.service_requests;
-- CREATE POLICY "client_own_requests_update_validated_only"
--   ON public.service_requests
--   FOR UPDATE
--   TO authenticated
--   USING     (client_profile_id = auth.uid())
--   WITH CHECK (client_profile_id = auth.uid()
--               AND status = 'validated');

-- =============================================================
-- Step 3 — Smoke test (run after applying):
-- Paste into Supabase SQL Editor as authenticated client, OR
-- use the Supabase JS client with a valid session token.
--
-- Check row before update:
SELECT id, client_profile_id, status
FROM public.service_requests
WHERE id = '<your-request-uuid>';
-- Expected: status = 'completed'

-- Attempt update:
UPDATE public.service_requests
SET status = 'validated'
WHERE id = '<your-request-uuid>'
  AND client_profile_id = auth.uid()
RETURNING id, status;
-- Expected: 1 row returned, status = 'validated'
-- If 0 rows: policy USING clause blocked the row —
--   verify client_profile_id matches auth.uid() for this row.

-- =============================================================
-- SQL VERIFICATION QUERIES FOR THE REPORTED BUG
-- =============================================================

-- Q1: Does an UPDATE policy exist?
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'service_requests' AND cmd = 'UPDATE';

-- Q2: Does the row exist and match the correct client?
-- Replace UUIDs:
SELECT id, client_profile_id, status
FROM public.service_requests
WHERE id = '4306bb8e-8afe-4535-849a-4a8fa7a9fb7a';

-- Q3: Is RLS enabled on service_requests?
SELECT rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'service_requests';
-- TRUE = RLS is ON → policies apply
-- FALSE = RLS is OFF → UPDATE should work without policies

-- Q4: Full policy list for service_requests:
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'service_requests'
ORDER BY cmd, policyname;
