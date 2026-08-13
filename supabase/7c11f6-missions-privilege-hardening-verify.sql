-- ============================================================
-- FIXEO Phase 7C.11F.6 — Privilege Hardening Verification
-- supabase/7c11f6-missions-privilege-hardening-verify.sql
--
-- READ-ONLY. Zero mutations. Safe to run in Supabase SQL editor.
--
-- PURPOSE:
--   Verify the target privilege matrix was applied correctly after
--   running 7c11f6-missions-privilege-hardening.sql.
--   Returns tabular rows so each check can be read at a glance.
--
-- EXPECTED RESULTS (all checks must show PASS):
--   anon   INSERT on missions        → REVOKED
--   anon   UPDATE on missions        → REVOKED
--   anon   DELETE on missions        → REVOKED
--   anon   UPDATE agreed_price       → REVOKED
--   anon   UPDATE commission_amount  → REVOKED
--   authenticated UPDATE (table)     → REVOKED (broad)
--   authenticated UPDATE agreed_price → REVOKED
--   authenticated UPDATE commission_amount → REVOKED
--   authenticated DELETE             → REVOKED
--   authenticated SELECT             → GRANTED (required for reads)
--   authenticated INSERT             → GRANTED (required for mission creation)
--   authenticated UPDATE status      → GRANTED (artisan status update path)
-- ============================================================

-- ── A: Table-level privilege state post-hardening ────────────
SELECT
  'TABLE_PRIV_CHECK'                       AS check_type,
  grantee,
  privilege_type,
  is_grantable,
  CASE
    WHEN grantee = 'anon'
      AND privilege_type IN ('INSERT','UPDATE','DELETE')
      THEN 'FAIL — should be REVOKED'
    WHEN grantee = 'authenticated'
      AND privilege_type = 'DELETE'
      THEN 'FAIL — should be REVOKED'
    WHEN grantee = 'authenticated'
      AND privilege_type = 'UPDATE'
      AND is_grantable = 'NO'
      THEN 'NOTE — broad table UPDATE still present; check column grants are column-restricted'
    ELSE 'OK'
  END                                       AS assessment
FROM information_schema.table_privileges
WHERE table_schema    = 'public'
  AND table_name      = 'missions'
  AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
  AND grantee IN ('anon','authenticated')
ORDER BY grantee, privilege_type;

-- ── B: Column-level privilege state post-hardening ───────────
SELECT
  'COLUMN_PRIV_CHECK'                       AS check_type,
  grantee,
  column_name,
  privilege_type,
  CASE
    WHEN grantee IN ('anon','authenticated')
      AND column_name IN ('agreed_price','commission_amount','final_price')
      AND privilege_type IN ('UPDATE','INSERT')
      THEN 'FAIL — financial column direct write must be REVOKED'
    WHEN grantee = 'authenticated'
      AND column_name = 'status'
      AND privilege_type = 'UPDATE'
      THEN 'PASS — required for artisan status update'
    WHEN grantee = 'anon'
      AND privilege_type IN ('INSERT','UPDATE')
      THEN 'FAIL — anon must have no DML'
    ELSE 'OK'
  END                                        AS assessment
FROM information_schema.column_privileges
WHERE table_schema    = 'public'
  AND table_name      = 'missions'
  AND column_name    IN ('agreed_price','commission_amount','final_price','status','id')
  AND privilege_type IN ('SELECT','INSERT','UPDATE')
  AND grantee IN ('anon','authenticated')
ORDER BY grantee, column_name, privilege_type;

-- ── C: RLS state (must be unchanged) ─────────────────────────
SELECT
  'RLS_STATE'              AS check_type,
  relname                  AS table_name,
  relrowsecurity           AS rls_enabled,
  relforcerowsecurity      AS rls_forced,
  CASE
    WHEN relrowsecurity THEN 'PASS — RLS enabled'
    ELSE 'FAIL — RLS must be enabled on missions'
  END                       AS assessment
FROM pg_class
JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
WHERE pg_namespace.nspname = 'public'
  AND relname = 'missions';

-- ── D: RLS policies (should be unchanged from pre-hardening) ──
SELECT
  'RLS_POLICY'                              AS check_type,
  polname::text                             AS policy_name,
  polcmd::text                              AS command,
  COALESCE(
    array_to_string(
      ARRAY(SELECT r::regrole::text FROM unnest(polroles) r),
      ','
    ),
    'PUBLIC'
  )                                          AS roles,
  pg_get_expr(polqual,    polrelid)          AS using_expression,
  pg_get_expr(polwithcheck, polrelid)        AS with_check_expression
FROM pg_policy
JOIN pg_class     ON pg_class.oid     = pg_policy.polrelid
JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
WHERE pg_namespace.nspname = 'public'
  AND pg_class.relname     = 'missions'
ORDER BY polname::text;

-- ── E: Explicit binary pass/fail for critical constraints ─────
SELECT
  check_name,
  expected,
  actual,
  CASE WHEN expected = actual THEN 'PASS' ELSE 'FAIL' END AS result
FROM (

  -- E1: anon INSERT revoked
  SELECT
    'anon INSERT on missions revoked'                   AS check_name,
    'NOT GRANTED'                                       AS expected,
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.table_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND grantee='anon' AND privilege_type='INSERT'),
      'NOT GRANTED'
    )                                                   AS actual

  UNION ALL

  -- E2: anon UPDATE revoked
  SELECT
    'anon UPDATE on missions revoked',
    'NOT GRANTED',
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.table_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND grantee='anon' AND privilege_type='UPDATE'),
      'NOT GRANTED'
    )

  UNION ALL

  -- E3: anon DELETE revoked
  SELECT
    'anon DELETE on missions revoked',
    'NOT GRANTED',
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.table_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND grantee='anon' AND privilege_type='DELETE'),
      'NOT GRANTED'
    )

  UNION ALL

  -- E4: authenticated DELETE revoked
  SELECT
    'authenticated DELETE on missions revoked',
    'NOT GRANTED',
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.table_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND grantee='authenticated' AND privilege_type='DELETE'),
      'NOT GRANTED'
    )

  UNION ALL

  -- E5: authenticated direct UPDATE agreed_price revoked
  SELECT
    'authenticated UPDATE(agreed_price) revoked',
    'NOT GRANTED',
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.column_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND column_name='agreed_price'
         AND grantee='authenticated' AND privilege_type='UPDATE'),
      'NOT GRANTED'
    )

  UNION ALL

  -- E6: authenticated direct UPDATE commission_amount revoked
  SELECT
    'authenticated UPDATE(commission_amount) revoked',
    'NOT GRANTED',
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.column_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND column_name='commission_amount'
         AND grantee='authenticated' AND privilege_type='UPDATE'),
      'NOT GRANTED'
    )

  UNION ALL

  -- E7: authenticated SELECT preserved
  SELECT
    'authenticated SELECT on missions preserved',
    'GRANTED',
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.table_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND grantee='authenticated' AND privilege_type='SELECT'),
      'NOT GRANTED'
    )

  UNION ALL

  -- E8: authenticated INSERT preserved (mission creation fallback)
  SELECT
    'authenticated INSERT on missions preserved',
    'GRANTED',
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.table_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND grantee='authenticated' AND privilege_type='INSERT'),
      'NOT GRANTED'
    )

  UNION ALL

  -- E9: authenticated UPDATE(status) preserved (artisan path)
  SELECT
    'authenticated UPDATE(status) preserved',
    'GRANTED',
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.column_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND column_name='status'
         AND grantee='authenticated' AND privilege_type='UPDATE'),
      'NOT GRANTED'
    )

  UNION ALL

  -- E10: anon UPDATE(agreed_price) revoked (column level)
  SELECT
    'anon UPDATE(agreed_price) revoked',
    'NOT GRANTED',
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.column_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND column_name='agreed_price'
         AND grantee='anon' AND privilege_type='UPDATE'),
      'NOT GRANTED'
    )

  UNION ALL

  -- E11: anon UPDATE(commission_amount) revoked (column level)
  SELECT
    'anon UPDATE(commission_amount) revoked',
    'NOT GRANTED',
    COALESCE(
      (SELECT 'GRANTED' FROM information_schema.column_privileges
       WHERE table_schema='public' AND table_name='missions'
         AND column_name='commission_amount'
         AND grantee='anon' AND privilege_type='UPDATE'),
      'NOT GRANTED'
    )

  UNION ALL

  -- E12: RLS still enabled
  SELECT
    'missions RLS enabled',
    'true',
    relrowsecurity::text
  FROM pg_class
  JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
  WHERE pg_namespace.nspname='public' AND relname='missions'

) checks
ORDER BY result DESC, check_name; -- FAIL rows sort first
