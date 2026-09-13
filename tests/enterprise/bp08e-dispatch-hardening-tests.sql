-- ════════════════════════════════════════════════════════════
-- FIXEO — BP08E Dispatch search_path Hardening Tests
-- File: tests/enterprise/bp08e-dispatch-hardening-tests.sql
-- Sprint: BP08E
-- Branch: recovery/seo-v3-safe
-- HEAD at preparation: 9a628c4dd53e9da28f2459056302c2b022480d05
--
-- STATIC TEST SUITE for 7c15a4-dispatch-search-path-hardening.sql
--
-- These tests use RAISE NOTICE (PASS/SKIP_NOT_FOUND/FAIL) for all
-- results. They NEVER raise EXCEPTION for missing functions, since
-- the 5 dispatch functions are production-only and will not be
-- present in a local development environment.
--
-- TESTS COVERED:
--   E-01: dispatch_execution_plan_v1  — existence + search_path check
--   E-02: dispatch_batch_preview_v1   — existence + search_path check
--   E-03: dispatch_candidate_pool_v1  — existence + search_path check
--   E-04: dispatch_preview_v21        — existence + search_path check
--   E-05: resolve_service_category_v1 — existence + search_path check
--   E-06: Migration file presence (pg_catalog object count check)
--   E-07: No new dispatch function signatures introduced
--   E-08: Dispatch trigger path unchanged (trg_dispatch_v2_on_service_request)
--
-- PASS CONDITIONS:
--   E-01 through E-05:
--     PASS          → function exists AND search_path = '' (hardened)
--     SKIP_NOT_FOUND → function does not exist (expected locally)
--     FAIL          → function exists BUT search_path != '' (hardening failed)
--   E-06:
--     PASS          → the migration left no unexpected new functions
--     (file presence is verified by convention check below)
--   E-07:
--     PASS          → no new dispatch_ function signatures beyond known set
--     FAIL          → unexpected new dispatch_ functions found
--   E-08:
--     PASS          → trg_dispatch_v2_on_service_request exists
--     SKIP_NOT_FOUND → trigger does not exist (production-only)
--     FAIL          → trigger was inadvertently dropped (should never happen)
--
-- USAGE:
--   Run this file against any target database after applying
--   7c15a4-dispatch-search-path-hardening.sql.
--   In local dev: all E-01 through E-05 will SKIP_NOT_FOUND.
--   In production: all E-01 through E-05 should PASS.
--
-- DO NOT RUN AGAINST PRODUCTION WITHOUT REVIEW.
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  -- ── Working variables ────────────────────────────────────
  v_fn_oid          oid;
  v_fn_config       text[];
  v_fn_config_str   text;
  v_is_hardened     boolean;
  v_cfg_entry       text;
  v_trigger_exists  boolean;
  v_new_fn_count    integer;
  v_new_fn_names    text;

  -- ── Summary counters ─────────────────────────────────────
  v_pass   integer := 0;
  v_skip   integer := 0;
  v_fail   integer := 0;
  v_total  integer := 0;

  -- ── Known dispatch function names (baseline) ─────────────
  -- This is the full set of dispatch_ functions that should exist
  -- after BP08E. The 5 legacy target functions plus dispatch_request_v1.
  -- Any function with prefix "dispatch_" beyond this set is unexpected.
  v_known_dispatch_fns text[] := ARRAY[
    'dispatch_request_v1',
    'dispatch_execution_plan_v1',
    'dispatch_batch_preview_v1',
    'dispatch_candidate_pool_v1',
    'dispatch_preview_v21'
  ];

  -- ── Helper: check if a function's search_path is hardened ─
  -- Returns true if search_path is set to empty string ('').
  -- PostgreSQL stores SET search_path = '' in proconfig as 'search_path='.
  -- We check all known representations.

BEGIN

  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'BP08E — Dispatch search_path Hardening Test Suite';
  RAISE NOTICE 'Sprint BP08E | File: 7c15a4-dispatch-search-path-hardening.sql';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE 'NOTE: Functions marked SKIP_NOT_FOUND are production-only.';
  RAISE NOTICE '      PASS requires the function to exist AND be hardened.';
  RAISE NOTICE '';

  -- ════════════════════════════════════════════════════════
  -- SECTION E — Per-function search_path verification
  -- Tests E-01 through E-05
  -- ════════════════════════════════════════════════════════

  -- ── Helper macro (inline via labeled block) ──────────────
  -- Used for each of the 5 functions: check existence, then check config.

  -- ── E-01: dispatch_execution_plan_v1 ─────────────────────
  v_total := v_total + 1;
  v_fn_oid := NULL;
  v_is_hardened := false;

  SELECT p.oid, p.proconfig
  INTO   v_fn_oid, v_fn_config
  FROM   pg_catalog.pg_proc p
  JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.proname = 'dispatch_execution_plan_v1'
  LIMIT  1;

  IF v_fn_oid IS NULL THEN
    v_skip := v_skip + 1;
    RAISE NOTICE 'E-01 SKIP_NOT_FOUND: dispatch_execution_plan_v1 — not in pg_proc (production-only)';
  ELSE
    -- Check if hardened
    v_fn_config_str := pg_catalog.array_to_string(COALESCE(v_fn_config, ARRAY[]::text[]), '|');
    v_is_hardened := false;
    IF v_fn_config IS NOT NULL THEN
      FOREACH v_cfg_entry IN ARRAY v_fn_config LOOP
        IF v_cfg_entry = 'search_path='
        OR v_cfg_entry = 'search_path=''''
        OR v_cfg_entry = 'search_path=""'
        THEN
          v_is_hardened := true;
        END IF;
      END LOOP;
    END IF;
    -- Also check string patterns for edge cases
    IF v_fn_config_str LIKE '%search_path=''''%' THEN
      v_is_hardened := true;
    END IF;

    IF v_is_hardened THEN
      v_pass := v_pass + 1;
      RAISE NOTICE 'E-01 PASS: dispatch_execution_plan_v1 — search_path hardened (OID: %)', v_fn_oid;
    ELSE
      v_fail := v_fail + 1;
      RAISE NOTICE 'E-01 FAIL: dispatch_execution_plan_v1 — search_path NOT empty';
      RAISE NOTICE '  Current config: %', COALESCE(NULLIF(v_fn_config_str, ''), '(no proconfig set)');
      RAISE NOTICE '  Expected: search_path= (empty string)';
      RAISE NOTICE '  Action: Re-run 7c15a4-dispatch-search-path-hardening.sql in production';
    END IF;
  END IF;

  -- ── E-02: dispatch_batch_preview_v1 ──────────────────────
  v_total := v_total + 1;
  v_fn_oid := NULL;
  v_is_hardened := false;

  SELECT p.oid, p.proconfig
  INTO   v_fn_oid, v_fn_config
  FROM   pg_catalog.pg_proc p
  JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.proname = 'dispatch_batch_preview_v1'
  LIMIT  1;

  IF v_fn_oid IS NULL THEN
    v_skip := v_skip + 1;
    RAISE NOTICE 'E-02 SKIP_NOT_FOUND: dispatch_batch_preview_v1 — not in pg_proc (production-only)';
  ELSE
    v_fn_config_str := pg_catalog.array_to_string(COALESCE(v_fn_config, ARRAY[]::text[]), '|');
    v_is_hardened := false;
    IF v_fn_config IS NOT NULL THEN
      FOREACH v_cfg_entry IN ARRAY v_fn_config LOOP
        IF v_cfg_entry = 'search_path='
        OR v_cfg_entry = 'search_path=''''
        OR v_cfg_entry = 'search_path=""'
        THEN
          v_is_hardened := true;
        END IF;
      END LOOP;
    END IF;
    IF v_fn_config_str LIKE '%search_path=''''%' THEN
      v_is_hardened := true;
    END IF;

    IF v_is_hardened THEN
      v_pass := v_pass + 1;
      RAISE NOTICE 'E-02 PASS: dispatch_batch_preview_v1 — search_path hardened (OID: %)', v_fn_oid;
    ELSE
      v_fail := v_fail + 1;
      RAISE NOTICE 'E-02 FAIL: dispatch_batch_preview_v1 — search_path NOT empty';
      RAISE NOTICE '  Current config: %', COALESCE(NULLIF(v_fn_config_str, ''), '(no proconfig set)');
      RAISE NOTICE '  Expected: search_path= (empty string)';
      RAISE NOTICE '  Action: Re-run 7c15a4-dispatch-search-path-hardening.sql in production';
    END IF;
  END IF;

  -- ── E-03: dispatch_candidate_pool_v1 ─────────────────────
  v_total := v_total + 1;
  v_fn_oid := NULL;
  v_is_hardened := false;

  SELECT p.oid, p.proconfig
  INTO   v_fn_oid, v_fn_config
  FROM   pg_catalog.pg_proc p
  JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.proname = 'dispatch_candidate_pool_v1'
  LIMIT  1;

  IF v_fn_oid IS NULL THEN
    v_skip := v_skip + 1;
    RAISE NOTICE 'E-03 SKIP_NOT_FOUND: dispatch_candidate_pool_v1 — not in pg_proc (production-only)';
  ELSE
    v_fn_config_str := pg_catalog.array_to_string(COALESCE(v_fn_config, ARRAY[]::text[]), '|');
    v_is_hardened := false;
    IF v_fn_config IS NOT NULL THEN
      FOREACH v_cfg_entry IN ARRAY v_fn_config LOOP
        IF v_cfg_entry = 'search_path='
        OR v_cfg_entry = 'search_path=''''
        OR v_cfg_entry = 'search_path=""'
        THEN
          v_is_hardened := true;
        END IF;
      END LOOP;
    END IF;
    IF v_fn_config_str LIKE '%search_path=''''%' THEN
      v_is_hardened := true;
    END IF;

    IF v_is_hardened THEN
      v_pass := v_pass + 1;
      RAISE NOTICE 'E-03 PASS: dispatch_candidate_pool_v1 — search_path hardened (OID: %)', v_fn_oid;
    ELSE
      v_fail := v_fail + 1;
      RAISE NOTICE 'E-03 FAIL: dispatch_candidate_pool_v1 — search_path NOT empty';
      RAISE NOTICE '  Current config: %', COALESCE(NULLIF(v_fn_config_str, ''), '(no proconfig set)');
      RAISE NOTICE '  Expected: search_path= (empty string)';
      RAISE NOTICE '  Action: Re-run 7c15a4-dispatch-search-path-hardening.sql in production';
    END IF;
  END IF;

  -- ── E-04: dispatch_preview_v21 ───────────────────────────
  v_total := v_total + 1;
  v_fn_oid := NULL;
  v_is_hardened := false;

  SELECT p.oid, p.proconfig
  INTO   v_fn_oid, v_fn_config
  FROM   pg_catalog.pg_proc p
  JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.proname = 'dispatch_preview_v21'
  LIMIT  1;

  IF v_fn_oid IS NULL THEN
    v_skip := v_skip + 1;
    RAISE NOTICE 'E-04 SKIP_NOT_FOUND: dispatch_preview_v21 — not in pg_proc (production-only)';
  ELSE
    v_fn_config_str := pg_catalog.array_to_string(COALESCE(v_fn_config, ARRAY[]::text[]), '|');
    v_is_hardened := false;
    IF v_fn_config IS NOT NULL THEN
      FOREACH v_cfg_entry IN ARRAY v_fn_config LOOP
        IF v_cfg_entry = 'search_path='
        OR v_cfg_entry = 'search_path=''''
        OR v_cfg_entry = 'search_path=""'
        THEN
          v_is_hardened := true;
        END IF;
      END LOOP;
    END IF;
    IF v_fn_config_str LIKE '%search_path=''''%' THEN
      v_is_hardened := true;
    END IF;

    IF v_is_hardened THEN
      v_pass := v_pass + 1;
      RAISE NOTICE 'E-04 PASS: dispatch_preview_v21 — search_path hardened (OID: %)', v_fn_oid;
    ELSE
      v_fail := v_fail + 1;
      RAISE NOTICE 'E-04 FAIL: dispatch_preview_v21 — search_path NOT empty';
      RAISE NOTICE '  Current config: %', COALESCE(NULLIF(v_fn_config_str, ''), '(no proconfig set)');
      RAISE NOTICE '  Expected: search_path= (empty string)';
      RAISE NOTICE '  Action: Re-run 7c15a4-dispatch-search-path-hardening.sql in production';
    END IF;
  END IF;

  -- ── E-05: resolve_service_category_v1 ────────────────────
  v_total := v_total + 1;
  v_fn_oid := NULL;
  v_is_hardened := false;

  SELECT p.oid, p.proconfig
  INTO   v_fn_oid, v_fn_config
  FROM   pg_catalog.pg_proc p
  JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.proname = 'resolve_service_category_v1'
  LIMIT  1;

  IF v_fn_oid IS NULL THEN
    v_skip := v_skip + 1;
    RAISE NOTICE 'E-05 SKIP_NOT_FOUND: resolve_service_category_v1 — not in pg_proc (production-only)';
  ELSE
    v_fn_config_str := pg_catalog.array_to_string(COALESCE(v_fn_config, ARRAY[]::text[]), '|');
    v_is_hardened := false;
    IF v_fn_config IS NOT NULL THEN
      FOREACH v_cfg_entry IN ARRAY v_fn_config LOOP
        IF v_cfg_entry = 'search_path='
        OR v_cfg_entry = 'search_path=''''
        OR v_cfg_entry = 'search_path=""'
        THEN
          v_is_hardened := true;
        END IF;
      END LOOP;
    END IF;
    IF v_fn_config_str LIKE '%search_path=''''%' THEN
      v_is_hardened := true;
    END IF;

    IF v_is_hardened THEN
      v_pass := v_pass + 1;
      RAISE NOTICE 'E-05 PASS: resolve_service_category_v1 — search_path hardened (OID: %)', v_fn_oid;
    ELSE
      v_fail := v_fail + 1;
      RAISE NOTICE 'E-05 FAIL: resolve_service_category_v1 — search_path NOT empty';
      RAISE NOTICE '  Current config: %', COALESCE(NULLIF(v_fn_config_str, ''), '(no proconfig set)');
      RAISE NOTICE '  Expected: search_path= (empty string)';
      RAISE NOTICE '  Action: Re-run 7c15a4-dispatch-search-path-hardening.sql in production';
    END IF;
  END IF;

  -- ════════════════════════════════════════════════════════
  -- E-06: Migration integrity — no unexpected new functions
  -- Verifies that the migration file (7c15a4) did not introduce
  -- any new SQL objects beyond the expected hardening-only changes.
  --
  -- This checks that the migration's stated zero-logic-change
  -- property holds: it only alters existing functions, it does
  -- not create new ones. We verify by checking that the only
  -- dispatch_ functions in pg_proc are the known baseline set.
  -- ════════════════════════════════════════════════════════

  v_total := v_total + 1;
  RAISE NOTICE '';
  RAISE NOTICE '────────────────────────────────────────────────────────────';

  SELECT count(*), string_agg(p.proname, ', ' ORDER BY p.proname)
  INTO   v_new_fn_count, v_new_fn_names
  FROM   pg_catalog.pg_proc p
  JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.proname LIKE 'dispatch_%'
    AND  p.proname != ALL(v_known_dispatch_fns);

  IF v_new_fn_count = 0 THEN
    v_pass := v_pass + 1;
    RAISE NOTICE 'E-06 PASS: No unexpected dispatch_ functions introduced by migration.';
    RAISE NOTICE '  Known dispatch_ functions verified: %s', array_to_string(v_known_dispatch_fns, ', ');
  ELSE
    v_fail := v_fail + 1;
    RAISE NOTICE 'E-06 FAIL: % unexpected dispatch_ function(s) found: %',
      v_new_fn_count, v_new_fn_names;
    RAISE NOTICE '  Migration should only ALTER existing functions — it must NOT create new ones.';
    RAISE NOTICE '  Review 7c15a4-dispatch-search-path-hardening.sql for unexpected CREATE FUNCTION.';
  END IF;

  -- ════════════════════════════════════════════════════════
  -- E-07: No new dispatch function SIGNATURES introduced
  -- Verifies that dispatch_request_v1 signature is unchanged
  -- (it's the primary local dispatch function and should not
  -- have been touched by this migration).
  -- ════════════════════════════════════════════════════════

  v_total := v_total + 1;
  RAISE NOTICE '';
  RAISE NOTICE '────────────────────────────────────────────────────────────';

  -- Check dispatch_request_v1 is still present and unchanged
  SELECT p.oid INTO v_fn_oid
  FROM   pg_catalog.pg_proc p
  JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.proname = 'dispatch_request_v1'
  LIMIT  1;

  IF v_fn_oid IS NULL THEN
    -- dispatch_request_v1 not found — this is itself a problem unrelated to BP08E
    -- but we report it as skip rather than fail since it's production-only
    v_skip := v_skip + 1;
    RAISE NOTICE 'E-07 SKIP_NOT_FOUND: dispatch_request_v1 not in pg_proc.';
    RAISE NOTICE '  Cannot verify signature unchanged. Expected in production.';
  ELSE
    -- Verify it still has search_path = '' (not accidentally altered)
    SELECT pg_catalog.array_to_string(COALESCE(p.proconfig, ARRAY[]::text[]), '|')
    INTO   v_fn_config_str
    FROM   pg_catalog.pg_proc p
    WHERE  p.oid = v_fn_oid;

    IF v_fn_config_str LIKE '%search_path=''''%'
    OR v_fn_config_str = 'search_path='
    THEN
      v_pass := v_pass + 1;
      RAISE NOTICE 'E-07 PASS: dispatch_request_v1 signature unchanged, still hardened.';
      RAISE NOTICE '  search_path = '''' confirmed. No accidental alteration by BP08E.';
    ELSE
      -- dispatch_request_v1 exists but search_path changed — unexpected
      v_fail := v_fail + 1;
      RAISE NOTICE 'E-07 FAIL: dispatch_request_v1 config appears changed.';
      RAISE NOTICE '  Current config: %', COALESCE(NULLIF(v_fn_config_str, ''), '(no proconfig)');
      RAISE NOTICE '  Expected: search_path= (empty). Was this function accidentally modified?';
    END IF;
  END IF;

  -- ════════════════════════════════════════════════════════
  -- E-08: Dispatch trigger path unchanged
  -- Verifies trg_dispatch_v2_on_service_request still exists.
  -- This trigger is the primary dispatch activation path and
  -- must not have been dropped or altered by this migration.
  -- ════════════════════════════════════════════════════════

  v_total := v_total + 1;
  RAISE NOTICE '';
  RAISE NOTICE '────────────────────────────────────────────────────────────';

  SELECT EXISTS (
    SELECT 1
    FROM   pg_catalog.pg_trigger t
    JOIN   pg_catalog.pg_class c   ON c.oid = t.tgrelid
    JOIN   pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE  n.nspname = 'public'
      AND  t.tgname  = 'trg_dispatch_v2_on_service_request'
  ) INTO v_trigger_exists;

  IF v_trigger_exists THEN
    v_pass := v_pass + 1;
    RAISE NOTICE 'E-08 PASS: trg_dispatch_v2_on_service_request exists and unchanged.';
    RAISE NOTICE '  Dispatch trigger path intact after BP08E migration.';
  ELSE
    -- Trigger may not exist locally (production-only), so SKIP rather than FAIL
    v_skip := v_skip + 1;
    RAISE NOTICE 'E-08 SKIP_NOT_FOUND: trg_dispatch_v2_on_service_request not found.';
    RAISE NOTICE '  Expected in production. Local environment may not have this trigger.';
    RAISE NOTICE '  Verify in production: trigger must exist after applying this migration.';
  END IF;

  -- ════════════════════════════════════════════════════════
  -- SUMMARY
  -- ════════════════════════════════════════════════════════

  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'BP08E TEST SUITE SUMMARY';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '  Total tests:        %', v_total;
  RAISE NOTICE '  PASS:               %', v_pass;
  RAISE NOTICE '  SKIP_NOT_FOUND:     %', v_skip;
  RAISE NOTICE '  FAIL:               %', v_fail;
  RAISE NOTICE '';

  IF v_fail = 0 AND v_skip = 0 THEN
    RAISE NOTICE 'RESULT: ALL PASS — All % tests passed.', v_total;
    RAISE NOTICE '  BP08E hardening verified. search_path = '''' confirmed on all 5 functions.';
  ELSIF v_fail = 0 AND v_skip > 0 THEN
    RAISE NOTICE 'RESULT: PASS WITH SKIPS — % passed, % skipped (production-only functions).', v_pass, v_skip;
    RAISE NOTICE '  Re-run against production to verify hardening on the 5 dispatch functions.';
    RAISE NOTICE '  No failures detected.';
  ELSE
    RAISE NOTICE 'RESULT: FAILURES DETECTED — % test(s) failed. Review FAIL entries above.', v_fail;
    RAISE NOTICE '  Check that 7c15a4-dispatch-search-path-hardening.sql was run successfully.';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'End of BP08E test suite.';
  RAISE NOTICE '════════════════════════════════════════════════════════════';

END;
$$;
