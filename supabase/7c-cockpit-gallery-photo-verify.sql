-- ============================================================
-- FIXEO — Cockpit V1: Post-Apply Verify (READ-ONLY)
-- File: supabase/7c-cockpit-gallery-photo-verify.sql
-- Version: v1a — 2026-08-13
-- READ-ONLY: SELECT / information_schema queries only
-- Run after: 7c-cockpit-gallery-photo.sql applied + artisan-media bucket created
-- ============================================================
-- PASS criteria for each check noted in comments.
-- ============================================================

-- ── V-1: portfolio_items table exists with RLS enabled ─────────
SELECT
  tablename,
  rowsecurity,
  CASE WHEN rowsecurity THEN '✅ PASS: RLS ON' ELSE '🚨 FAIL: RLS OFF' END AS rls_check
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'portfolio_items';
-- EXPECTED: 1 row, rowsecurity = true

-- ── V-2: portfolio_items column contract ───────────────────────
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'portfolio_items'
ORDER BY ordinal_position;
-- EXPECTED columns: id (uuid), artisan_id (text NOT NULL),
--   image_url (text NOT NULL), description (text NOT NULL),
--   source (text NOT NULL), created_at (timestamptz NOT NULL)

-- ── V-3: portfolio_items RLS policies ─────────────────────────
SELECT
  policyname,
  cmd,
  roles,
  CASE
    WHEN policyname = 'portfolio_public_read'    THEN '✅ Public read'
    WHEN policyname = 'portfolio_artisan_insert' THEN '✅ Artisan insert (uid check)'
    WHEN policyname = 'portfolio_artisan_delete' THEN '✅ Artisan delete (uid check)'
    ELSE '⚠️ Unexpected policy'
  END AS expected
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'portfolio_items'
ORDER BY policyname;
-- EXPECTED: 3 policies — public_read (SELECT), artisan_insert (INSERT), artisan_delete (DELETE)
-- NO UPDATE policy expected

-- ── V-4: No UPDATE RLS policy on portfolio_items ──────────────
SELECT COUNT(*) AS update_policy_count,
  CASE WHEN COUNT(*) = 0 THEN '✅ PASS: no UPDATE policy (intentional)'
       ELSE '🚨 FAIL: unexpected UPDATE policy exists'
  END AS check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'portfolio_items' AND cmd = 'UPDATE';
-- EXPECTED: 0 — artisans cannot edit image_url/artisan_id after insert

-- ── V-5: portfolio_items index exists ─────────────────────────
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'portfolio_items';
-- EXPECTED: portfolio_items_artisan_idx on (artisan_id, created_at DESC)

-- ── V-6: Grants on portfolio_items ────────────────────────────
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'portfolio_items'
ORDER BY grantee, privilege_type;
-- EXPECTED:
--   anon: SELECT
--   authenticated: SELECT, INSERT, DELETE
--   service_role: SELECT, INSERT, UPDATE, DELETE (ALL)

-- ── V-7: artisan-media storage bucket exists ──────────────────
SELECT
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  CASE WHEN name = 'artisan-media' AND public = true THEN '✅ PASS'
       ELSE '🚨 FAIL: bucket missing or not public'
  END AS check
FROM storage.buckets
WHERE name = 'artisan-media';
-- EXPECTED: 1 row, public=true, file_size_limit <= 8388608 (8MB), mime includes image/*

-- ── V-8: Storage RLS policies for artisan-media ───────────────
SELECT
  name,
  action,
  roles,
  definition
FROM storage.policies
WHERE bucket_id = 'artisan-media'
ORDER BY action, name;
-- EXPECTED policies:
--   artisan_media_public_read    (SELECT, anon+authenticated) — public read
--   artisan_media_owner_upload   (INSERT, authenticated)      — own path only
--   artisan_media_owner_update   (UPDATE, authenticated)      — own path only
--   artisan_media_owner_delete   (DELETE, authenticated)      — own path only

-- ── V-9: Cross-artisan write prevention check (policy logic) ──
-- Verify upload policy uses foldername[2] = auth.uid()::text
SELECT
  name,
  definition,
  CASE
    WHEN definition ILIKE '%auth.uid()::text%'
      AND definition ILIKE '%foldername%'
    THEN '✅ PASS: path-scoped to auth.uid()'
    ELSE '🚨 FAIL: ownership check missing or wrong'
  END AS ownership_check
FROM storage.policies
WHERE bucket_id = 'artisan-media'
  AND action IN ('INSERT','UPDATE','DELETE');
-- EXPECTED: all 3 write policies show PASS

-- ── V-10: artisans.photo_url column grant still active ────────
SELECT grantee, privilege_type, column_name
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'artisans'
  AND column_name = 'photo_url'
  AND grantee = 'authenticated';
-- EXPECTED: authenticated has UPDATE on artisans.photo_url
-- (applied in 7C.12A.2 — REVOKE table-level + column-specific GRANTs)

-- ── V-11: Confirm no service_role grant exposure ───────────────
-- Verify service_role is NOT granted to anon/authenticated
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('portfolio_items', 'artisans')
  AND grantee = 'anon'
  AND privilege_type IN ('UPDATE','DELETE','INSERT')
ORDER BY table_name, privilege_type;
-- EXPECTED on artisans: 0 rows for anon INSERT/UPDATE/DELETE (column grants only)
-- EXPECTED on portfolio_items: anon has SELECT only (no write)

-- ── SUMMARY ───────────────────────────────────────────────────
-- Run all blocks above.
-- All ✅ PASS = cockpit storage contract matches JS code contract.
-- Any 🚨 FAIL = investigate before proceeding with human QA.
-- ============================================================
