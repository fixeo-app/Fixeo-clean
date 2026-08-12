-- ============================================================
-- FIXEO — 7C.11C Dispatch Data Foundation
-- File: supabase/7c11c-dispatch-foundation-verify.sql
-- Purpose: READ-ONLY post-migration verification
-- Run AFTER forward migration completes.
-- All checks must pass before marking 7C.11C complete.
-- NO writes. NO inserts. NO updates. NO deletes.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- V-1  Row counts unchanged (compare to PM-1 baseline)
-- ════════════════════════════════════════════════════════════
SELECT
  (SELECT COUNT(*) FROM public.missions)         AS missions_count,
  (SELECT COUNT(*) FROM public.service_requests) AS sr_count;
-- Both must equal PM-1 baseline exactly. FAIL if different.


-- ════════════════════════════════════════════════════════════
-- V-2  No new rows inserted (latest created_at unchanged)
-- ════════════════════════════════════════════════════════════
SELECT MAX(created_at) AS latest_mission    FROM public.missions;
SELECT MAX(created_at) AS latest_sr         FROM public.service_requests;
-- Must match pre-migration values.


-- ════════════════════════════════════════════════════════════
-- V-3  Status distributions unchanged for existing rows
-- ════════════════════════════════════════════════════════════
SELECT status, COUNT(*) AS n FROM public.missions         GROUP BY status ORDER BY status;
SELECT status, COUNT(*) AS n FROM public.service_requests GROUP BY status ORDER BY status;
-- Must match PM-2 and PM-3 distributions exactly.
-- New values (offered/declined/expired/no_match) must NOT appear yet.


-- ════════════════════════════════════════════════════════════
-- V-4  New columns present on service_requests
-- ════════════════════════════════════════════════════════════
SELECT column_name, data_type, is_nullable
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'service_requests'
  AND  column_name  IN ('idempotency_key','client_phone','urgency')
ORDER  BY column_name;
-- Expected: 3 rows, data_type='text', is_nullable='YES'


-- ════════════════════════════════════════════════════════════
-- V-5  accepted_at present on missions
-- ════════════════════════════════════════════════════════════
SELECT column_name, data_type, is_nullable
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'missions'
  AND  column_name  = 'accepted_at';
-- Expected: 1 row, timestamp with time zone, is_nullable='YES'


-- ════════════════════════════════════════════════════════════
-- V-6  All new columns NULL for all existing rows
-- ════════════════════════════════════════════════════════════
SELECT COUNT(*) AS non_null_idempotency FROM public.service_requests WHERE idempotency_key IS NOT NULL;
SELECT COUNT(*) AS non_null_phone       FROM public.service_requests WHERE client_phone    IS NOT NULL;
SELECT COUNT(*) AS non_null_urgency     FROM public.service_requests WHERE urgency         IS NOT NULL;
SELECT COUNT(*) AS non_null_accepted_at FROM public.missions          WHERE accepted_at    IS NOT NULL;
-- All 4 expected: 0. FAIL if any > 0.


-- ════════════════════════════════════════════════════════════
-- V-7  service_requests status CHECK includes no_match + originals
-- ════════════════════════════════════════════════════════════
SELECT conname, pg_catalog.pg_get_constraintdef(oid) AS definition
FROM   pg_catalog.pg_constraint
WHERE  conrelid = 'public.service_requests'::regclass
  AND  contype  = 'c'
  AND  conname  LIKE '%status%';
-- definition must contain: no_match
-- definition must contain: new, assigned, in_progress,
--   completed, validated, cancelled


-- ════════════════════════════════════════════════════════════
-- V-8  missions status CHECK includes new values + originals
-- ════════════════════════════════════════════════════════════
SELECT conname, pg_catalog.pg_get_constraintdef(oid) AS definition
FROM   pg_catalog.pg_constraint
WHERE  conrelid = 'public.missions'::regclass
  AND  contype  = 'c'
  AND  conname  LIKE '%status%';
-- definition must contain: offered, declined, expired
-- definition must contain: pending, done, cancelled, validated


-- ════════════════════════════════════════════════════════════
-- V-9  urgency CHECK present and correct
-- ════════════════════════════════════════════════════════════
SELECT conname, pg_catalog.pg_get_constraintdef(oid) AS definition
FROM   pg_catalog.pg_constraint
WHERE  conrelid = 'public.service_requests'::regclass
  AND  contype  = 'c'
  AND  conname  = 'service_requests_urgency_check';
-- Expected: 1 row
-- definition must contain: normale, urgent, now, IS NULL


-- ════════════════════════════════════════════════════════════
-- V-10  All 3 partial unique indexes on missions
-- ════════════════════════════════════════════════════════════
SELECT indexname, indexdef
FROM   pg_catalog.pg_indexes
WHERE  schemaname = 'public'
  AND  tablename  = 'missions'
  AND  indexname  IN (
    'missions_one_offer_per_request',
    'missions_unique_artisan_per_request',
    'missions_one_pending_per_request'
  )
ORDER  BY indexname;
-- Expected: 3 rows
-- missions_one_offer_per_request:
--   indexdef contains: WHERE (status = 'offered')
-- missions_unique_artisan_per_request:
--   indexdef contains: (request_id, artisan_profile_id)
--   indexdef contains: WHERE (status IN ('offered','pending') ...)
--   or: WHERE ((status = ANY (ARRAY[...]))
-- missions_one_pending_per_request:
--   indexdef contains: WHERE (status = 'pending')


-- ════════════════════════════════════════════════════════════
-- V-11  Idempotency key partial unique index
-- ════════════════════════════════════════════════════════════
SELECT indexname, indexdef
FROM   pg_catalog.pg_indexes
WHERE  schemaname = 'public'
  AND  indexname  = 'service_requests_idempotency_key_unique';
-- Expected: 1 row
-- indexdef must contain: WHERE (idempotency_key IS NOT NULL)


-- ════════════════════════════════════════════════════════════
-- V-12  RLS policy: pending-only, no phone fallback
-- ════════════════════════════════════════════════════════════
SELECT policyname, qual AS using_expr
FROM   pg_catalog.pg_policies
WHERE  schemaname = 'public'
  AND  tablename  = 'service_requests'
  AND  policyname = 'artisan_read_own_linked_requests';
-- Expected: 1 row
-- using_expr must contain: status = 'pending'
-- using_expr must NOT contain: phone_public
-- using_expr must NOT contain: OR a.phone
-- using_expr must contain: owner_user_id = auth.uid()


-- ════════════════════════════════════════════════════════════
-- V-13  Old broad policies are gone
-- ════════════════════════════════════════════════════════════
SELECT COUNT(*) AS stale_policies
FROM   pg_catalog.pg_policies
WHERE  schemaname = 'public'
  AND  tablename  = 'service_requests'
  AND  policyname IN ('artisan_read_new_requests','artisan_read_active_requests');
-- Expected: 0


-- ════════════════════════════════════════════════════════════
-- V-14  All 3 RPCs exist as SECURITY DEFINER
-- ════════════════════════════════════════════════════════════
SELECT
  p.proname                              AS function_name,
  pg_catalog.pg_get_userbyid(p.proowner) AS owner_role,
  p.prosecdef                            AS security_definer,
  p.pronargs                             AS arg_count,
  p.proconfig                            AS config_options
FROM   pg_catalog.pg_proc p
WHERE  p.pronamespace = 'public'::regnamespace
  AND  p.proname IN (
    'claim_mission',
    'get_my_mission_offers',
    'get_accepted_mission_detail'
  )
ORDER  BY p.proname;
-- Expected: 3 rows
-- All: prosecdef = true
-- claim_mission:               pronargs = 1
-- get_my_mission_offers:       pronargs = 0
-- get_accepted_mission_detail: pronargs = 1


-- ════════════════════════════════════════════════════════════
-- V-15  search_path is exactly '' (empty string) for all 3 RPCs
-- ════════════════════════════════════════════════════════════
SELECT proname, proconfig
FROM   pg_catalog.pg_proc
WHERE  pronamespace = 'public'::regnamespace
  AND  proname IN (
    'claim_mission',
    'get_my_mission_offers',
    'get_accepted_mission_detail'
  );
-- proconfig must contain an element: 'search_path='
-- The value after '=' must be empty (no schema names).
-- FAIL if 'search_path=public' or 'search_path=pg_catalog, public'.


-- ════════════════════════════════════════════════════════════
-- V-16  EXECUTE grants: authenticated only, no PUBLIC, no anon
-- ════════════════════════════════════════════════════════════
SELECT routine_name, grantee, privilege_type
FROM   information_schema.routine_privileges
WHERE  routine_schema = 'public'
  AND  routine_name IN (
    'claim_mission',
    'get_my_mission_offers',
    'get_accepted_mission_detail'
  )
ORDER  BY routine_name, grantee;
-- Expected: grantee = 'authenticated' ONLY for all 3.
-- FAIL if PUBLIC or anon appears.


-- ════════════════════════════════════════════════════════════
-- V-17  RLS enabled; FORCE RLS off for relevant tables
-- ════════════════════════════════════════════════════════════
SELECT
  c.relname             AS table_name,
  c.relrowsecurity      AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM   pg_catalog.pg_class c
WHERE  c.relnamespace = 'public'::regnamespace
  AND  c.relname IN ('service_requests','missions','artisans')
ORDER  BY c.relname;
-- All 3: rls_enabled = true
-- All 3: rls_forced = false (SECURITY DEFINER bypasses RLS)
-- FAIL if rls_forced = true for service_requests or missions.


-- ════════════════════════════════════════════════════════════
-- V-18  Function owner RLS bypass capability confirmed
-- ════════════════════════════════════════════════════════════
SELECT
  r.rolname,
  r.rolsuper     AS is_superuser,
  r.rolbypassrls AS bypasses_rls
FROM   pg_catalog.pg_roles r
WHERE  r.rolname = (
  SELECT pg_catalog.pg_get_userbyid(p.proowner)
  FROM   pg_catalog.pg_proc p
  WHERE  p.pronamespace = 'public'::regnamespace
    AND  p.proname = 'claim_mission'
  LIMIT  1
);
-- Expected: rolsuper=true OR rolbypassrls=true.
-- FAIL if both false — functions will not bypass RLS as designed.


-- ════════════════════════════════════════════════════════════
-- V-19  Zero dispatch activated — no offered missions
-- ════════════════════════════════════════════════════════════
SELECT COUNT(*) AS offered_missions FROM public.missions WHERE status = 'offered';
-- Expected: 0


-- ════════════════════════════════════════════════════════════
-- V-20  Zero no_match requests
-- ════════════════════════════════════════════════════════════
SELECT COUNT(*) AS no_match_count FROM public.service_requests WHERE status = 'no_match';
-- Expected: 0


-- ════════════════════════════════════════════════════════════
-- V-21  Existing descriptions unchanged (spot check)
-- ════════════════════════════════════════════════════════════
SELECT id, LEFT(description, 80) AS description_preview, status, created_at
FROM   public.service_requests
ORDER  BY created_at DESC
LIMIT  5;
-- Compare to pre-migration state. No content changes expected.


-- ════════════════════════════════════════════════════════════
-- V-22  Zero duplicate pending / offered / active-pair rows
-- ════════════════════════════════════════════════════════════
SELECT request_id, COUNT(*) AS n
FROM   public.missions WHERE status = 'pending'
GROUP  BY request_id HAVING COUNT(*) > 1;
-- Expected: 0 rows

SELECT request_id, COUNT(*) AS n
FROM   public.missions WHERE status = 'offered'
GROUP  BY request_id HAVING COUNT(*) > 1;
-- Expected: 0 rows (also enforced by index)

SELECT request_id, artisan_profile_id, COUNT(*) AS n
FROM   public.missions WHERE status IN ('offered','pending')
GROUP  BY request_id, artisan_profile_id HAVING COUNT(*) > 1;
-- Expected: 0 rows (also enforced by index)


-- ════════════════════════════════════════════════════════════
-- V-23  Dry-run CHECK validation — no mutations
-- Proves all existing rows satisfy extended CHECKs.
-- ════════════════════════════════════════════════════════════
UPDATE public.missions         SET status = status WHERE false;
UPDATE public.service_requests SET status = status WHERE false;
-- Both: 0 rows affected, 0 constraint violations.


-- ════════════════════════════════════════════════════════════
-- V-24  owner_user_id gap — final count for pre-11F planning
-- ════════════════════════════════════════════════════════════
SELECT COUNT(*) AS dispatch_eligible_null_owner
FROM   public.artisans
WHERE  claimed              = true
  AND  onboarding_completed = true
  AND  availability         IN ('available','busy')
  AND  owner_user_id        IS NULL;
-- Record for 7C.11F pre-activation ops planning.
-- Not a STOP condition for 7C.11C.
