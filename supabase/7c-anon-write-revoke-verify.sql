-- ============================================================
-- FIXEO — Anon Write Revoke: Post-Apply Verify (READ-ONLY)
-- File: supabase/7c-anon-write-revoke-verify.sql
-- Version: v1a — 2026-08-13
-- READ-ONLY: SELECT / information_schema queries only
-- Run after: 7c-anon-write-revoke.sql applied
-- ============================================================

-- ── V-1: anon has NO write privileges on artisans ─────────────
SELECT
  grantee,
  privilege_type,
  '🚨 FAIL: unexpected anon write on artisans' AS result
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name   = 'artisans'
  AND grantee      = 'anon'
  AND privilege_type IN ('INSERT','UPDATE','DELETE');
-- EXPECTED: 0 rows — any row here is a FAIL

-- ── V-2: anon has NO write privileges on portfolio_items ──────
SELECT
  grantee,
  privilege_type,
  '🚨 FAIL: unexpected anon write on portfolio_items' AS result
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name   = 'portfolio_items'
  AND grantee      = 'anon'
  AND privilege_type IN ('INSERT','UPDATE','DELETE');
-- EXPECTED: 0 rows — any row here is a FAIL

-- ── V-3: anon SELECT preserved on artisans ────────────────────
SELECT
  grantee,
  privilege_type,
  CASE WHEN COUNT(*) OVER () > 0 THEN '✅ PASS: anon SELECT preserved'
       ELSE '🚨 FAIL: anon SELECT missing'
  END AS result
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name   = 'artisans'
  AND grantee      = 'anon'
  AND privilege_type = 'SELECT';
-- EXPECTED: 1 row (anon SELECT)

-- ── V-4: anon SELECT preserved on portfolio_items ─────────────
SELECT
  grantee,
  privilege_type,
  CASE WHEN COUNT(*) OVER () > 0 THEN '✅ PASS: anon SELECT preserved'
       ELSE '🚨 FAIL: anon SELECT missing'
  END AS result
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name   = 'portfolio_items'
  AND grantee      = 'anon'
  AND privilege_type = 'SELECT';
-- EXPECTED: 1 row (anon SELECT)

-- ── V-5: authenticated INSERT/DELETE on portfolio_items ────────
SELECT
  grantee,
  privilege_type,
  '✅ PASS: authenticated write on portfolio_items' AS result
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name   = 'portfolio_items'
  AND grantee      = 'authenticated'
  AND privilege_type IN ('INSERT','DELETE')
ORDER BY privilege_type;
-- EXPECTED: 2 rows (INSERT, DELETE) for authenticated

-- ── V-6: authenticated column UPDATE on artisans (5 safe fields)
SELECT
  grantee,
  column_name,
  privilege_type,
  '✅ PASS: column grant preserved' AS result
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name   = 'artisans'
  AND grantee      = 'authenticated'
  AND privilege_type = 'UPDATE'
ORDER BY column_name;
-- EXPECTED: 5 rows (full_name, service_category, city, description, work_zone)
-- photo_url column grant separately checked below

-- ── V-7: artisans.photo_url column grant still active ─────────
SELECT
  grantee,
  column_name,
  privilege_type,
  CASE WHEN COUNT(*) OVER () > 0 THEN '✅ PASS: photo_url UPDATE preserved'
       ELSE '🚨 FAIL: photo_url UPDATE missing'
  END AS result
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name   = 'artisans'
  AND column_name  = 'photo_url'
  AND grantee      = 'authenticated'
  AND privilege_type = 'UPDATE';
-- EXPECTED: 1 row

-- ── V-8: authenticated does NOT have table-level UPDATE on artisans
SELECT
  grantee,
  privilege_type,
  '🚨 FAIL: authenticated has table-level UPDATE on artisans' AS result
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name   = 'artisans'
  AND grantee      = 'authenticated'
  AND privilege_type = 'UPDATE';
-- EXPECTED: 0 rows — table-level UPDATE was REVOKED in 7C.12A.2

-- ── V-9: RLS still enabled on both tables ─────────────────────
SELECT
  tablename,
  rowsecurity,
  CASE WHEN rowsecurity THEN '✅ PASS: RLS ON' ELSE '🚨 FAIL: RLS OFF' END AS rls_check
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('artisans','portfolio_items')
ORDER BY tablename;
-- EXPECTED: 2 rows, both rowsecurity = true

-- ── V-10: No unexpected anon write on any public table ────────
SELECT
  table_name,
  privilege_type,
  '⚠️ INFO: anon write on public table' AS note
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND grantee      = 'anon'
  AND privilege_type IN ('INSERT','UPDATE','DELETE')
ORDER BY table_name, privilege_type;
-- EXPECTED: 0 rows for artisans + portfolio_items
-- Other tables: investigate if unexpected entries appear

-- ── V-11: Full privilege matrix for artisans ──────────────────
SELECT
  grantee,
  privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name   = 'artisans'
ORDER BY grantee, privilege_type;
-- EXPECTED:
--   anon:          SELECT only
--   authenticated: SELECT only (UPDATE via column grants, not table-level)
--   service_role:  ALL

-- ── V-12: Full privilege matrix for portfolio_items ───────────
SELECT
  grantee,
  privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name   = 'portfolio_items'
ORDER BY grantee, privilege_type;
-- EXPECTED:
--   anon:          SELECT only
--   authenticated: SELECT, INSERT, DELETE (no UPDATE — intentional)
--   service_role:  ALL
-- ============================================================
