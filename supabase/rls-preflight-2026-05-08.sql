-- ============================================================
-- FIXEO — RLS Pre-Flight Verification
-- Date: 2026-05-08
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
--
-- ✅ READ-ONLY — no ALTER, no DROP, no CREATE, no DELETE,
--               no UPDATE, no INSERT anywhere in this file
--
-- PURPOSE:
--   Confirm live table schemas, column names, current RLS state,
--   current policies, and critical FK relationships BEFORE
--   applying rls-phase2-2026-05-08.sql
--
-- HOW TO USE:
--   Run each block separately (F5 or "Run") in Supabase SQL Editor.
--   Read the "Expected output" comment above each block.
--   If the output matches → safe to proceed.
--   If the output differs → see the "STOP" comment for each case.
-- ============================================================


-- ============================================================
-- BLOCK A — RLS ENABLED/DISABLED PER TABLE
-- ============================================================
-- Expected output: one row per table
-- Check: rowsecurity column
--   TRUE  = RLS is enabled
--   FALSE = RLS is disabled (CRITICAL — must be enabled)
--
-- WHAT TO LOOK FOR:
--   service_requests: FALSE → CRITICAL (confirmed no RLS)
--   payments:         FALSE → CRITICAL (confirmed no RLS)
--   missions:         TRUE  → RLS enabled (policies may still be missing)
--   artisans:         TRUE  → RLS enabled (public read policy exists)
--   artisan_profiles: TRUE/FALSE → unknown (empty table)
--   profiles:         TRUE  → RLS enabled
--   users:            TRUE  → RLS enabled
--   claim_requests:   TRUE  → RLS enabled
-- ============================================================

SELECT
  schemaname,
  tablename,
  rowsecurity,
  CASE WHEN rowsecurity THEN '✅ RLS ON' ELSE '🚨 RLS OFF' END AS rls_status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'artisans', 'profiles', 'users', 'service_requests',
    'missions', 'payments', 'claim_requests', 'artisan_profiles',
    'quotes'
  )
ORDER BY tablename;


-- ============================================================
-- BLOCK B — ALL EXISTING POLICIES (names, tables, operations)
-- ============================================================
-- Expected output: list of all RLS policies currently defined
-- Check: are any policies missing for critical tables?
--
-- WHAT TO LOOK FOR:
--   service_requests: should show NO rows (no RLS configured yet)
--   payments:         should show NO rows (no RLS configured yet)
--   missions:         should show some rows (RLS enabled, check what policies)
--   artisans:         should show artisans_public_read + artisans_no_anon_insert
--                     + artisans_owner_update (from rls-fix-2026-04-29.sql)
--   profiles/users:   should show self_read / self_update / insert_own / admin_all
--   claim_requests:   should show claims_insert / claims_admin_all
--
-- STOP if you see:
--   USING (true) on UPDATE/DELETE for any table → over-permissive, must fix
--   No policies at all on missions → INSERT/DELETE unprotected
-- ============================================================

SELECT
  schemaname,
  tablename,
  policyname,
  cmd AS operation,
  permissive,
  roles,
  qual   AS using_clause,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'artisans', 'profiles', 'users', 'service_requests',
    'missions', 'payments', 'claim_requests', 'artisan_profiles',
    'quotes'
  )
ORDER BY tablename, cmd, policyname;


-- ============================================================
-- BLOCK C — service_requests COLUMNS
-- ============================================================
-- Expected columns (from live probe + schema audit):
--   id, client_profile_id, service_category, city,
--   description, budget_range, status, created_at
--
-- CRITICAL CHECKS:
--   1. Is client_profile_id NOT NULL?
--      → Confirms INSERT policy "client_profile_id = auth.uid()" is safe
--   2. Is client_profile_id a UUID FK to profiles/users?
--      → Confirms artisan read policy won't accidentally expose data
--   3. What are the valid CHECK constraint values for status?
--      → Needed to confirm status='new' artisan filter works
--
-- STOP if you see:
--   No client_profile_id column → our INSERT/SELECT policies reference wrong column
--   client_profile_id allows NULL → anon can still insert without FK
-- ============================================================

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default,
  udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'service_requests'
ORDER BY ordinal_position;

-- Also: check CHECK constraints on service_requests
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.service_requests'::regclass
  AND contype = 'c';

-- Also: check FKs on service_requests
SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  ccu.column_name AS foreign_column
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name = 'service_requests';


-- ============================================================
-- BLOCK D — payments COLUMNS
-- ============================================================
-- Expected (from schema.sql and probe):
--   id, mission_id, amount, status, created_at
--   (probe confirmed row: id, mission_id, amount, status, created_at)
--
-- CRITICAL CHECKS:
--   1. Is there a user_id or client_id column?
--      → Determines whether "pay_owner_read USING (user_id = auth.uid())" works
--   2. If NO user_id → our proposed "pay_owner_read" policy uses
--      "USING (auth.uid() IS NOT NULL)" which is correct as temporary fallback
--   3. Is mission_id FK to missions?
--      → Confirms data model for future owner-based policy
--
-- STOP if you see:
--   user_id or owner_id column exists → tighten the policy to use it
-- ============================================================

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payments'
ORDER BY ordinal_position;

SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  ccu.column_name AS foreign_column
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name = 'payments';


-- ============================================================
-- BLOCK E — missions COLUMNS
-- ============================================================
-- Expected (from probe error chain + fixeo-supabase-core.js):
--   id, request_id, client_profile_id, artisan_profile_id,
--   agreed_price, status, created_at (+ possibly more)
--
-- CRITICAL CHECKS:
--   1. Confirm client_profile_id and artisan_profile_id exist as UUID columns
--      → Our policy uses these: "client_profile_id = auth.uid()"
--   2. What is the valid status CHECK constraint?
--      → We attempted: accepted, pending, validated, in_progress — all failed
--      → Need real values before writing policies that filter on status
--   3. Is there a commission_amount or commission_paid column?
--      → Needed for future commission-based policies
--
-- STOP if you see:
--   client_profile_id missing → missions SELECT/INSERT policy breaks all of fixeo-supabase-core.js
--   artisan_profile_id missing → same
-- ============================================================

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'missions'
ORDER BY ordinal_position;

SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.missions'::regclass
  AND contype = 'c';


-- ============================================================
-- BLOCK F — artisan_profiles COLUMNS
-- ============================================================
-- Expected: table is empty, columns unknown
-- Live probe: artisan_profiles exists, returns []
-- fixeo-supabase-core.js: uses artisan_profile_id in quotes/missions
--   → BUT this ID = auth.uid() directly (NOT artisan_profiles.id FK)
--   → artisan_profiles table is unused in frontend code
--
-- CRITICAL CHECKS:
--   1. What columns exist? Is there a user_id / owner_id?
--      → If yes: update our artisan_profiles policy to use it
--      → If no (empty/placeholder table): our USING (user_id = auth.uid()) must be adjusted
--   2. Does artisan_profiles have any data at all?
--
-- STOP if you see:
--   user_id column does NOT exist → remove that branch from the policy
--   (use "auth.uid() IS NOT NULL" as owner check instead)
-- ============================================================

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'artisan_profiles'
ORDER BY ordinal_position;

SELECT COUNT(*) AS row_count FROM public.artisan_profiles;


-- ============================================================
-- BLOCK G — profiles COLUMNS + recursion risk check
-- ============================================================
-- Expected columns (from schema.sql):
--   id, role, full_name, phone, city, created_at (+ email?)
--
-- CRITICAL CHECKS:
--   1. Does column "role" exist with a CHECK constraint?
--      → Our policy uses: EXISTS (SELECT 1 FROM profiles WHERE role='admin')
--   2. Self-reference risk: the admin policy queries profiles WHERE role='admin'
--      AND the query itself runs UNDER the profiles table RLS.
--      In Supabase: policies on a table are evaluated when QUERYING that table.
--      A policy on profiles that sub-selects FROM profiles = recursive evaluation.
--      Supabase's PostgREST handles this via security_barrier views, but
--      it can still cause infinite recursion (error code 42P17).
--
-- RECURSION TEST: run this as an authenticated non-admin user.
-- If it errors with "infinite recursion detected in policy for relation profiles"
-- → we must switch to auth.jwt() ->> 'role' = 'admin' instead.
-- This test only runs correctly if you're logged in as a real user.
--
-- SAFE ALTERNATIVE (no recursion):
--   Use SECURITY DEFINER function that bypasses RLS:
--   CREATE FUNCTION is_admin() RETURNS boolean
--     LANGUAGE sql SECURITY DEFINER SET search_path = public AS
--     'SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = ''admin'')';
--   Then policies use: USING (is_admin())
-- ============================================================

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
ORDER BY ordinal_position;

-- Check constraints on profiles
SELECT
  conname,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.profiles'::regclass
  AND contype IN ('c', 'u');

-- Row count (how many profiles exist?)
SELECT COUNT(*) AS profile_count FROM public.profiles;


-- ============================================================
-- BLOCK H — users COLUMNS
-- ============================================================
-- Expected (from schema.sql):
--   id, role, email, full_name, phone, city, created_at
--
-- CRITICAL CHECKS:
--   1. Does 'role' column exist with CHECK (admin/artisan/client)?
--   2. How many users exist? (confirms whether admin account exists)
--   3. Is there an admin@fixeo.ma row?
-- ============================================================

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
ORDER BY ordinal_position;

-- Row count
SELECT COUNT(*) AS user_count FROM public.users;

-- Check if admin email has a row (safe — returns count only, no PII)
SELECT
  COUNT(*) AS admin_row_count,
  MAX(role) AS admin_role
FROM public.users
WHERE email = 'admin@fixeo.ma';


-- ============================================================
-- BLOCK I — claim_requests COLUMNS
-- ============================================================
-- Expected (from schema.sql):
--   id, artisan_id, artisan_legacy_id, requester_user_id,
--   requester_name, requester_phone, onboarding_data,
--   status, notes, created_at, reviewed_at
--
-- CRITICAL CHECKS:
--   1. Is requester_user_id nullable?
--      → Must be nullable for anon claim submissions (no auth.uid())
--   2. Status CHECK constraint values?
--      → Confirm 'pending', 'approved', 'rejected' are valid
-- ============================================================

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'claim_requests'
ORDER BY ordinal_position;

SELECT
  conname,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.claim_requests'::regclass
  AND contype = 'c';


-- ============================================================
-- BLOCK J — artisans COLUMNS (confirm owner column name)
-- ============================================================
-- From schema.sql: owner_user_id UUID REFERENCES public.users(id)
-- But rls-fix-2026-04-29.sql references: public.profiles for admin check
-- Confirm which table is used in the EXISTING artisans policies.
--
-- CRITICAL CHECKS:
--   1. Is owner_user_id the correct FK column name?
--   2. Does it reference public.users or public.profiles?
--      → Our new patch uses public.users for admin EXISTS checks
--      → Existing rls-fix-2026-04-29.sql used public.profiles
--      → We must be consistent — confirm which table has real rows
-- ============================================================

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'artisans'
  AND column_name IN (
    'owner_user_id', 'owner_id', 'user_id', 'claimed',
    'claim_status', 'verified', 'legacy_id'
  )
ORDER BY ordinal_position;

-- Check artisans FK to confirm FK target (users vs profiles)
SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  ccu.column_name AS foreign_column
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name = 'artisans';


-- ============================================================
-- BLOCK K — SECURITY DEFINER FUNCTION CHECK
-- ============================================================
-- This checks whether a safe is_admin() helper function
-- already exists (avoids recursion in profiles/users policies).
-- If it doesn't exist, we need to CREATE it in the patch.
--
-- Expected output:
--   0 rows → function does not exist → patch must CREATE it
--   1 row  → function exists → patch can reference it directly
-- ============================================================

SELECT
  routine_name,
  routine_type,
  security_type,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('is_admin', 'is_admin_user', 'check_admin_role')
  AND routine_type = 'FUNCTION';


-- ============================================================
-- BLOCK L — EXISTING TRIGGER FUNCTIONS
-- ============================================================
-- Confirm sync_artisan_claim() trigger still exists
-- and uses SECURITY DEFINER (required to update artisans
-- when claim_requests.status changes — bypasses RLS)
--
-- Expected: 1 row for sync_artisan_claim with SECURITY DEFINER
-- STOP if security_type = 'INVOKER' → trigger won't be able
-- to UPDATE artisans when called by anon claim submitter
-- ============================================================

SELECT
  routine_name,
  security_type,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'sync_artisan_claim'
  AND routine_type = 'FUNCTION';

-- Also check update_updated_at trigger
SELECT
  routine_name,
  security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'update_updated_at'
  AND routine_type = 'FUNCTION';


-- ============================================================
-- BLOCK M — quotes TABLE (used by listOpenRequests / submitQuote)
-- ============================================================
-- fixeo-supabase-core.js queries quotes alongside service_requests
-- Must confirm it has RLS too, and artisan_profile_id column exists
--
-- CRITICAL: if quotes has no RLS, artisans could read/modify
-- each other's quotes (bid manipulation risk)
-- ============================================================

SELECT
  tablename,
  rowsecurity,
  CASE WHEN rowsecurity THEN '✅ RLS ON' ELSE '🚨 RLS OFF' END AS rls_status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'quotes';

SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'quotes'
ORDER BY ordinal_position;


-- ============================================================
-- END OF PRE-FLIGHT SCRIPT
-- ============================================================
-- After running all blocks, record results in a table like:
--
-- Table              | RLS On? | Policies? | Columns match? | Safe?
-- service_requests   |   [A]   |   [B]     |     [C]        |  ?
-- payments           |   [A]   |   [B]     |     [D]        |  ?
-- missions           |   [A]   |   [B]     |     [E]        |  ?
-- artisan_profiles   |   [A]   |   [B]     |     [F]        |  ?
-- profiles           |   [A]   |   [B]     |     [G]        |  ?
-- users              |   [A]   |   [B]     |     [H]        |  ?
-- claim_requests     |   [A]   |   [B]     |     [I]        |  ?
-- artisans           |   [A]   |   [B]     |     [J]        |  ?
-- quotes             |   [M]   |   [B]     |     [M]        |  ?
--
-- Share the output of ALL blocks above before applying the patch.
-- ============================================================
