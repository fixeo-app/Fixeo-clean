-- ============================================================
-- FIXEO — 7C.11C Dispatch Data Foundation
-- File: supabase/7c11c-dispatch-foundation-precheck.sql
-- Purpose: READ-ONLY pre-migration safety checks
-- Run ALL checks. Record all outputs.
-- Do NOT proceed to the forward migration until every
-- STOP condition below is confirmed clear (0 rows / expected).
-- NO data writes anywhere in this file.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- PM-1  Baseline row counts
-- Record both integers before the forward migration runs.
-- After migration: both must be identical (zero-data-loss assertion).
-- ════════════════════════════════════════════════════════════
SELECT
  (SELECT COUNT(*) FROM public.missions)         AS missions_baseline,
  (SELECT COUNT(*) FROM public.service_requests) AS sr_baseline;


-- ════════════════════════════════════════════════════════════
-- PM-2  Existing missions.status distribution
-- STOP if any value outside: pending, done, cancelled, validated
-- ════════════════════════════════════════════════════════════
SELECT status, COUNT(*) AS n
FROM   public.missions
GROUP  BY status
ORDER  BY status;
-- STOP CONDITION: any value NOT IN ('pending','done','cancelled','validated')


-- ════════════════════════════════════════════════════════════
-- PM-3  Existing service_requests.status distribution
-- STOP if any value outside:
--   new, assigned, in_progress, completed, validated, cancelled
-- ════════════════════════════════════════════════════════════
SELECT status, COUNT(*) AS n
FROM   public.service_requests
GROUP  BY status
ORDER  BY status;
-- STOP CONDITION: any value NOT IN
--   ('new','assigned','in_progress','completed','validated','cancelled')


-- ════════════════════════════════════════════════════════════
-- PM-4  CRITICAL — Duplicate pending missions per request
-- STOP CONDITION: any rows returned.
-- If this returns > 0 rows, Block 5c (pending winner index)
-- MUST NOT be applied. Human remediation required.
-- ════════════════════════════════════════════════════════════
SELECT request_id, COUNT(*) AS pending_count
FROM   public.missions
WHERE  status = 'pending'
GROUP  BY request_id
HAVING COUNT(*) > 1;
-- Expected: 0 rows
-- STOP CONDITION: any rows returned


-- ════════════════════════════════════════════════════════════
-- PM-5  No existing offered missions
-- Expected: 0. If > 0 the schema already diverged from baseline.
-- ════════════════════════════════════════════════════════════
SELECT COUNT(*) AS offered_missions
FROM   public.missions
WHERE  status = 'offered';
-- STOP CONDITION: count > 0


-- ════════════════════════════════════════════════════════════
-- PM-6  Exact CHECK constraint names — service_requests
-- Record conname values. Replace DROP CONSTRAINT names in
-- Blocks 2 and 4 of the forward migration if they differ
-- from the defaults used there.
-- ════════════════════════════════════════════════════════════
SELECT conname, pg_catalog.pg_get_constraintdef(oid) AS definition
FROM   pg_catalog.pg_constraint
WHERE  conrelid = 'public.service_requests'::regclass
  AND  contype  = 'c'
ORDER  BY conname;


-- ════════════════════════════════════════════════════════════
-- PM-7  Exact CHECK constraint names — missions
-- Same purpose as PM-6.
-- ════════════════════════════════════════════════════════════
SELECT conname, pg_catalog.pg_get_constraintdef(oid) AS definition
FROM   pg_catalog.pg_constraint
WHERE  conrelid = 'public.missions'::regclass
  AND  contype  = 'c'
ORDER  BY conname;


-- ════════════════════════════════════════════════════════════
-- PM-8  Current artisan service_requests SELECT policies
-- Confirms which policies are live and must be replaced.
-- Expected live policy: artisan_read_own_linked_requests only.
-- artisan_read_new_requests and artisan_read_active_requests
-- were already dropped by supabase/rls-artisan-read-linked-requests.sql
-- ════════════════════════════════════════════════════════════
SELECT policyname, cmd, qual AS using_expr, with_check
FROM   pg_catalog.pg_policies
WHERE  schemaname = 'public'
  AND  tablename  = 'service_requests'
ORDER  BY policyname;


-- ════════════════════════════════════════════════════════════
-- PM-9  RLS and FORCE RLS state on relevant tables
-- relrowsecurity=true:  RLS active for non-owner roles
-- relforcerowsecurity=true: RLS active even for table owner
-- STOP CONDITION: relforcerowsecurity=true on missions or
--   service_requests — SECURITY DEFINER functions running as
--   postgres/superuser would be blocked by their own policies.
-- ════════════════════════════════════════════════════════════
SELECT
  c.relname             AS table_name,
  c.relrowsecurity      AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM   pg_catalog.pg_class c
WHERE  c.relnamespace = 'public'::regnamespace
  AND  c.relname IN ('service_requests','missions','artisans')
ORDER  BY c.relname;
-- STOP CONDITION: rls_forced=true for service_requests or missions


-- ════════════════════════════════════════════════════════════
-- PM-10  Existing SECURITY DEFINER functions in public schema
-- Documents project convention before adding new ones.
-- sync_artisan_claim() confirms public-schema SECURITY DEFINER
-- is the established project pattern.
-- ════════════════════════════════════════════════════════════
SELECT
  p.proname                              AS function_name,
  pg_catalog.pg_get_userbyid(p.proowner) AS owner_role,
  p.prosecdef                            AS security_definer,
  p.proconfig                            AS config_options
FROM   pg_catalog.pg_proc p
WHERE  p.pronamespace = 'public'::regnamespace
  AND  p.prosecdef    = true
ORDER  BY p.proname;


-- ════════════════════════════════════════════════════════════
-- PM-11  Function owner RLS bypass capability
-- If the function owner is a superuser or has rolbypassrls,
-- SECURITY DEFINER functions bypass RLS on all tables.
-- This is required for claim_mission() to UPDATE both
-- service_requests and missions without being blocked by
-- artisan-scoped RLS policies.
-- ════════════════════════════════════════════════════════════
SELECT
  r.rolname,
  r.rolsuper     AS is_superuser,
  r.rolbypassrls AS bypasses_rls
FROM   pg_catalog.pg_roles r
WHERE  r.rolname IN (
  SELECT DISTINCT pg_catalog.pg_get_userbyid(p.proowner)
  FROM   pg_catalog.pg_proc p
  WHERE  p.pronamespace = 'public'::regnamespace
    AND  p.prosecdef    = true
);
-- STOP CONDITION: owner has rolsuper=false AND rolbypassrls=false
--   In that case SECURITY DEFINER will not bypass RLS.
--   Report to ops before applying migration.


-- ════════════════════════════════════════════════════════════
-- PM-12  owner_user_id dispatch-eligibility gap
-- Artisans with null owner_user_id are excluded from dispatch
-- in 7C.11F. Record count for pre-activation ops planning.
-- No repair in 7C.11C — human individual verification only.
-- ════════════════════════════════════════════════════════════
SELECT COUNT(*) AS dispatch_eligible_null_owner
FROM   public.artisans
WHERE  claimed              = true
  AND  onboarding_completed = true
  AND  availability         IN ('available','busy')
  AND  owner_user_id        IS NULL;
-- Not a STOP condition for 11C. Record and plan for pre-11F.


-- ════════════════════════════════════════════════════════════
-- PM-13  Confirm no new columns already exist (idempotency check)
-- If any of these columns already exist the forward migration
-- ADD COLUMN IF NOT EXISTS is safe but documents prior state.
-- ════════════════════════════════════════════════════════════
SELECT column_name, data_type, is_nullable
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   IN ('service_requests','missions')
  AND  column_name  IN ('idempotency_key','client_phone','urgency','accepted_at')
ORDER  BY table_name, column_name;
-- Expected: 0 rows (no columns exist yet)
-- If any rows: record them — migration is still safe but
-- existing values must be checked before STOP-gated drops.


-- ════════════════════════════════════════════════════════════
-- PM-14  Confirm no 3 new indexes already exist
-- ════════════════════════════════════════════════════════════
SELECT indexname, indexdef
FROM   pg_catalog.pg_indexes
WHERE  schemaname = 'public'
  AND  indexname  IN (
    'missions_one_offer_per_request',
    'missions_unique_artisan_per_request',
    'missions_one_pending_per_request',
    'service_requests_idempotency_key_unique'
  )
ORDER  BY indexname;
-- Expected: 0 rows


-- ════════════════════════════════════════════════════════════
-- PRECHECK SUMMARY — human must confirm before proceeding
-- ════════════════════════════════════════════════════════════
--
--  PM-4:  0 rows returned                         (CRITICAL)
--  PM-5:  offered_missions = 0                    (CRITICAL)
--  PM-9:  rls_forced = false for SR and missions  (CRITICAL)
--  PM-11: owner is superuser or rolbypassrls=true (CRITICAL)
--  PM-2:  no unexpected mission statuses
--  PM-3:  no unexpected SR statuses
--  PM-1:  baseline row counts recorded
--  PM-6:  SR CHECK constraint names recorded
--  PM-7:  missions CHECK constraint names recorded
--  PM-8:  live artisan SR SELECT policy confirmed
--  PM-12: owner_user_id gap count recorded
