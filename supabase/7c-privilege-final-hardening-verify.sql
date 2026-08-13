-- ============================================================
-- FIXEO — Final Privilege Hardening: Post-Apply Verify (READ-ONLY)
-- File: supabase/7c-privilege-final-hardening-verify.sql
-- Version: v1a — 2026-08-13
-- READ-ONLY: SELECT / information_schema queries only
-- Run after: 7c-privilege-final-hardening.sql applied
-- ============================================================
-- PASS criteria: no unexpected privilege rows.
-- Any row returned by a "must be 0 rows" check = FAIL.
-- ============================================================

-- ── V-1: anon has ONLY SELECT on portfolio_items ──────────────
-- Returns any anon privilege that is NOT SELECT — all rows are FAILs
SELECT
  grantee,
  privilege_type,
  '🚨 FAIL: unexpected anon privilege on portfolio_items' AS result
FROM information_schema.table_privileges
WHERE table_schema   = 'public'
  AND table_name     = 'portfolio_items'
  AND grantee        = 'anon'
  AND privilege_type <> 'SELECT';
-- EXPECTED: 0 rows

-- ── V-2: anon has ONLY SELECT on artisans ─────────────────────
SELECT
  grantee,
  privilege_type,
  '🚨 FAIL: unexpected anon privilege on artisans' AS result
FROM information_schema.table_privileges
WHERE table_schema   = 'public'
  AND table_name     = 'artisans'
  AND grantee        = 'anon'
  AND privilege_type <> 'SELECT';
-- EXPECTED: 0 rows

-- ── V-3: authenticated has only SELECT/INSERT/DELETE on portfolio_items
-- UPDATE, TRUNCATE, TRIGGER, REFERENCES must all be absent
SELECT
  grantee,
  privilege_type,
  '🚨 FAIL: unexpected authenticated privilege on portfolio_items' AS result
FROM information_schema.table_privileges
WHERE table_schema   = 'public'
  AND table_name     = 'portfolio_items'
  AND grantee        = 'authenticated'
  AND privilege_type NOT IN ('SELECT','INSERT','DELETE');
-- EXPECTED: 0 rows

-- ── V-4: authenticated has NO table-level UPDATE on artisans ──
SELECT
  grantee,
  privilege_type,
  '🚨 FAIL: authenticated has unexpected table-level privilege on artisans' AS result
FROM information_schema.table_privileges
WHERE table_schema   = 'public'
  AND table_name     = 'artisans'
  AND grantee        = 'authenticated'
  AND privilege_type NOT IN ('SELECT');
-- EXPECTED: 0 rows
-- Note: column-level UPDATE grants appear in column_privileges, not here

-- ── V-5: anon SELECT preserved on portfolio_items ─────────────
SELECT
  grantee,
  privilege_type,
  '✅ PASS: anon SELECT present' AS result
FROM information_schema.table_privileges
WHERE table_schema  = 'public'
  AND table_name    = 'portfolio_items'
  AND grantee       = 'anon'
  AND privilege_type = 'SELECT';
-- EXPECTED: 1 row

-- ── V-6: anon SELECT preserved on artisans ────────────────────
SELECT
  grantee,
  privilege_type,
  '✅ PASS: anon SELECT present' AS result
FROM information_schema.table_privileges
WHERE table_schema  = 'public'
  AND table_name    = 'artisans'
  AND grantee       = 'anon'
  AND privilege_type = 'SELECT';
-- EXPECTED: 1 row

-- ── V-7: authenticated INSERT/DELETE preserved on portfolio_items
SELECT
  grantee,
  privilege_type,
  '✅ PASS: authenticated gallery write preserved' AS result
FROM information_schema.table_privileges
WHERE table_schema  = 'public'
  AND table_name    = 'portfolio_items'
  AND grantee       = 'authenticated'
  AND privilege_type IN ('INSERT','DELETE')
ORDER BY privilege_type;
-- EXPECTED: 2 rows (INSERT, DELETE)

-- ── V-8: authenticated column UPDATE on artisans (5 safe fields)
SELECT
  grantee,
  column_name,
  privilege_type,
  '✅ PASS: profile column UPDATE preserved' AS result
FROM information_schema.column_privileges
WHERE table_schema  = 'public'
  AND table_name    = 'artisans'
  AND grantee       = 'authenticated'
  AND privilege_type = 'UPDATE'
ORDER BY column_name;
-- EXPECTED: 5 rows: city, description, full_name, service_category, work_zone
-- (plus photo_url if that column grant was applied — check V-9)

-- ── V-9: artisans.photo_url column UPDATE for authenticated ───
SELECT
  grantee,
  column_name,
  privilege_type,
  CASE WHEN COUNT(*) OVER () > 0
       THEN '✅ PASS: photo_url column UPDATE preserved'
       ELSE '⚠️  INFO: photo_url column grant absent (apply separately if needed)'
  END AS result
FROM information_schema.column_privileges
WHERE table_schema  = 'public'
  AND table_name    = 'artisans'
  AND column_name   = 'photo_url'
  AND grantee       = 'authenticated'
  AND privilege_type = 'UPDATE';
-- EXPECTED: 1 row (if grant was applied)

-- ── V-10: No TRUNCATE privilege for anon or authenticated ─────
SELECT
  table_name,
  grantee,
  privilege_type,
  '🚨 FAIL: TRUNCATE privilege present — bypasses RLS' AS result
FROM information_schema.table_privileges
WHERE table_schema  = 'public'
  AND table_name    IN ('artisans','portfolio_items')
  AND grantee       IN ('anon','authenticated')
  AND privilege_type = 'TRUNCATE';
-- EXPECTED: 0 rows

-- ── V-11: No TRIGGER privilege for anon or authenticated ──────
SELECT
  table_name,
  grantee,
  privilege_type,
  '🚨 FAIL: TRIGGER privilege present' AS result
FROM information_schema.table_privileges
WHERE table_schema  = 'public'
  AND table_name    IN ('artisans','portfolio_items')
  AND grantee       IN ('anon','authenticated')
  AND privilege_type = 'TRIGGER';
-- EXPECTED: 0 rows

-- ── V-12: No REFERENCES privilege for anon or authenticated ───
SELECT
  table_name,
  grantee,
  privilege_type,
  '🚨 FAIL: REFERENCES privilege present' AS result
FROM information_schema.table_privileges
WHERE table_schema  = 'public'
  AND table_name    IN ('artisans','portfolio_items')
  AND grantee       IN ('anon','authenticated')
  AND privilege_type = 'REFERENCES';
-- EXPECTED: 0 rows

-- ── V-13: RLS still enabled on both tables ────────────────────
SELECT
  tablename,
  rowsecurity,
  CASE WHEN rowsecurity THEN '✅ PASS: RLS ON' ELSE '🚨 FAIL: RLS OFF' END AS rls_check
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename  IN ('artisans','portfolio_items')
ORDER BY tablename;
-- EXPECTED: 2 rows, both rowsecurity = true

-- ── V-14: Complete final privilege matrix — portfolio_items ───
SELECT
  grantee,
  privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name   = 'portfolio_items'
  AND grantee      NOT IN ('postgres','PUBLIC')
ORDER BY grantee, privilege_type;
-- EXPECTED FINAL STATE:
--   anon:          SELECT
--   authenticated: DELETE, INSERT, SELECT
--   service_role:  DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

-- ── V-15: Complete final privilege matrix — artisans ──────────
SELECT
  grantee,
  privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name   = 'artisans'
  AND grantee      NOT IN ('postgres','PUBLIC')
ORDER BY grantee, privilege_type;
-- EXPECTED FINAL STATE:
--   anon:          SELECT
--   authenticated: SELECT (column-level UPDATE grants are separate)
--   service_role:  ALL (DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE)
-- ============================================================
