-- ============================================================
-- FIXEO Phase 7C.11F.6 — INSERT Column Hardening Verification
-- supabase/7c11f6-missions-insert-column-hardening-verify.sql
--
-- READ-ONLY. Zero mutations. Safe to run in Supabase SQL editor.
--
-- PURPOSE:
--   Verify authenticated table-level INSERT was replaced with
--   exact column-level INSERT grants after applying
--   7c11f6-missions-insert-column-hardening.sql.
--
-- EXPECTED: All checks in Block E must show PASS.
-- ============================================================

-- ── A: Table-level privilege state ──────────────────────────
SELECT
  'TABLE_PRIV'          AS check_type,
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.table_privileges
WHERE table_schema   = 'public'
  AND table_name     = 'missions'
  AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
  AND grantee IN ('anon','authenticated')
ORDER BY grantee, privilege_type;

-- ── B: Column-level INSERT grants ───────────────────────────
SELECT
  'COLUMN_INSERT'       AS check_type,
  grantee,
  column_name,
  privilege_type
FROM information_schema.column_privileges
WHERE table_schema   = 'public'
  AND table_name     = 'missions'
  AND privilege_type = 'INSERT'
  AND grantee IN ('anon','authenticated')
ORDER BY grantee, column_name;

-- ── C: Column-level UPDATE grants ───────────────────────────
SELECT
  'COLUMN_UPDATE'       AS check_type,
  grantee,
  column_name,
  privilege_type
FROM information_schema.column_privileges
WHERE table_schema   = 'public'
  AND table_name     = 'missions'
  AND privilege_type = 'UPDATE'
  AND grantee IN ('anon','authenticated')
ORDER BY grantee, column_name;

-- ── D: RLS still enabled ─────────────────────────────────────
SELECT
  'RLS_STATE'           AS check_type,
  relname               AS table_name,
  relrowsecurity        AS rls_enabled,
  CASE WHEN relrowsecurity THEN 'OK' ELSE 'FAIL — RLS must remain enabled' END AS assessment
FROM pg_class
JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
WHERE pg_namespace.nspname = 'public'
  AND relname = 'missions';

-- ── E: Binary pass/fail checks ──────────────────────────────
SELECT
  check_name,
  expected,
  actual,
  CASE WHEN expected = actual THEN 'PASS' ELSE 'FAIL' END AS result
FROM (

  -- E1: authenticated table-level INSERT revoked
  SELECT
    'authenticated table INSERT revoked'              AS check_name,
    'NOT GRANTED'                                     AS expected,
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.table_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND grantee='authenticated' AND privilege_type='INSERT'),
      'NOT GRANTED'
    )                                                 AS actual

  UNION ALL

  -- E2: authenticated INSERT(request_id) granted
  SELECT 'authenticated INSERT(request_id) granted', 'GRANTED',
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.column_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND grantee='authenticated' AND privilege_type='INSERT'
         AND column_name='request_id'),
      'NOT GRANTED'
    )

  UNION ALL

  -- E3: authenticated INSERT(client_profile_id) granted
  SELECT 'authenticated INSERT(client_profile_id) granted', 'GRANTED',
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.column_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND grantee='authenticated' AND privilege_type='INSERT'
         AND column_name='client_profile_id'),
      'NOT GRANTED'
    )

  UNION ALL

  -- E4: authenticated INSERT(artisan_profile_id) granted
  SELECT 'authenticated INSERT(artisan_profile_id) granted', 'GRANTED',
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.column_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND grantee='authenticated' AND privilege_type='INSERT'
         AND column_name='artisan_profile_id'),
      'NOT GRANTED'
    )

  UNION ALL

  -- E5: authenticated INSERT(agreed_price) granted
  SELECT 'authenticated INSERT(agreed_price) granted', 'GRANTED',
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.column_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND grantee='authenticated' AND privilege_type='INSERT'
         AND column_name='agreed_price'),
      'NOT GRANTED'
    )

  UNION ALL

  -- E6: authenticated INSERT(status) granted
  SELECT 'authenticated INSERT(status) granted', 'GRANTED',
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.column_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND grantee='authenticated' AND privilege_type='INSERT'
         AND column_name='status'),
      'NOT GRANTED'
    )

  UNION ALL

  -- E7: authenticated INSERT(final_price) NOT granted
  SELECT 'authenticated INSERT(final_price) NOT granted', 'NOT GRANTED',
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.column_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND grantee='authenticated' AND privilege_type='INSERT'
         AND column_name='final_price'),
      'NOT GRANTED'
    )

  UNION ALL

  -- E8: authenticated INSERT(commission_amount) NOT granted
  SELECT 'authenticated INSERT(commission_amount) NOT granted', 'NOT GRANTED',
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.column_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND grantee='authenticated' AND privilege_type='INSERT'
         AND column_name='commission_amount'),
      'NOT GRANTED'
    )

  UNION ALL

  -- E9: authenticated UPDATE(status) preserved
  SELECT 'authenticated UPDATE(status) preserved', 'GRANTED',
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.column_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND grantee='authenticated' AND privilege_type='UPDATE'
         AND column_name='status'),
      'NOT GRANTED'
    )

  UNION ALL

  -- E10: authenticated UPDATE(agreed_price) remains revoked
  SELECT 'authenticated UPDATE(agreed_price) revoked', 'NOT GRANTED',
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.column_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND grantee='authenticated' AND privilege_type='UPDATE'
         AND column_name='agreed_price'),
      'NOT GRANTED'
    )

  UNION ALL

  -- E11: authenticated UPDATE(commission_amount) remains revoked
  SELECT 'authenticated UPDATE(commission_amount) revoked', 'NOT GRANTED',
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.column_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND grantee='authenticated' AND privilege_type='UPDATE'
         AND column_name='commission_amount'),
      'NOT GRANTED'
    )

  UNION ALL

  -- E12: anon INSERT revoked (table level)
  SELECT 'anon INSERT revoked', 'NOT GRANTED',
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.table_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND grantee='anon' AND privilege_type='INSERT'),
      'NOT GRANTED'
    )

  UNION ALL

  -- E13: anon UPDATE revoked (table level)
  SELECT 'anon UPDATE revoked', 'NOT GRANTED',
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.table_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND grantee='anon' AND privilege_type='UPDATE'),
      'NOT GRANTED'
    )

  UNION ALL

  -- E14: anon DELETE revoked (table level)
  SELECT 'anon DELETE revoked', 'NOT GRANTED',
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.table_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND grantee='anon' AND privilege_type='DELETE'),
      'NOT GRANTED'
    )

  UNION ALL

  -- E15: authenticated SELECT preserved
  SELECT 'authenticated SELECT preserved', 'GRANTED',
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.table_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND grantee='authenticated' AND privilege_type='SELECT'),
      'NOT GRANTED'
    )

  UNION ALL

  -- E16: RLS still enabled
  SELECT 'missions RLS enabled', 'true',
    relrowsecurity::text
  FROM pg_class
  JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
  WHERE pg_namespace.nspname='public' AND relname='missions'

) checks
ORDER BY result DESC, check_name; -- FAIL rows sort first
