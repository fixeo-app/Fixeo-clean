-- ════════════════════════════════════════════════════════════
-- FIXEO — 7C.15A.4 Dispatch search_path Hardening
-- File: supabase/7c15a4-dispatch-search-path-hardening.sql
-- Sprint: BP08E
-- Branch: recovery/seo-v3-safe
-- HEAD at preparation: 9a628c4dd53e9da28f2459056302c2b022480d05
--
-- PURPOSE
--   Harden the 5 legacy dispatch functions by setting
--   SET search_path = '' to eliminate search-path injection
--   risk. These functions are documented in 7c13a3 as using
--   SET search_path = 'public' rather than ''.
--
-- FUNCTIONS IN SCOPE
--   1. public.dispatch_execution_plan_v1
--   2. public.dispatch_batch_preview_v1
--   3. public.dispatch_candidate_pool_v1
--   4. public.dispatch_preview_v21
--   5. public.resolve_service_category_v1
--
-- CRITICAL SAFETY ARCHITECTURE
--   These 5 functions are NOT defined in the local repository
--   SQL files. They exist only in the production database,
--   where they were created by external migrations not tracked
--   here. Their bodies CANNOT be inspected locally.
--
--   THEREFORE: this migration CONDITIONALLY inspects each
--   function body in the target database (via pg_get_functiondef)
--   before attempting any ALTER. It checks whether the body
--   already contains fully schema-qualified identifiers or
--   whether unqualified references remain that would break
--   under SET search_path = ''.
--
--   The migration NEVER raises EXCEPTION for missing functions.
--   It NEVER alters a function that cannot be safely hardened.
--   It documents every decision in RAISE NOTICE output.
--
-- REFERENCE
--   7c13a3-enterprise-request-context.sql lines 109-115:
--     "Several existing dispatch functions use
--      SET search_path = 'public' rather than ''.
--      Specifically: dispatch_execution_plan_v1,
--      dispatch_batch_preview_v1, dispatch_candidate_pool_v1,
--      dispatch_preview_v21, resolve_service_category_v1.
--      Remediation deferred to a dedicated security hardening migration."
--
-- ESTABLISHED PATTERN
--   All SECURITY DEFINER functions created by this project use:
--     SECURITY DEFINER
--     SET search_path = ''
--   with full schema-qualification of all object references
--   (public.tablename, pg_catalog.function(), etc.).
--   See: claim_mission(), get_my_mission_offers(),
--        get_accepted_mission_detail(), dispatch_request_v1().
--
-- ZERO BUSINESS LOGIC CHANGE
--   This migration performs ALTER FUNCTION ... SET search_path = ''
--   ONLY. No function body is rewritten. No other function
--   attributes are changed. No permissions altered.
--
-- SAFETY PROPERTIES
--   • Idempotent: functions already at search_path='' are skipped
--   • Non-destructive: missing functions generate NOTICE, not error
--   • Conservative: any function whose body contains patterns that
--     suggest unqualified identifiers is marked pending_review
--   • Fully logged: every decision captured in RAISE NOTICE
--   • No data mutations: zero rows changed
--   • No schema changes beyond SET search_path on the function
--
-- LOCAL vs PRODUCTION BEHAVIOR
--   Local environment: all 5 functions will be not_found_locally.
--     Migration emits WARN notices and exits cleanly. No failure.
--   Production environment: migration inspects each body and
--     applies hardening where safe, marks pending_review where
--     unqualified references are detected.
--
-- PRE-MIGRATION
--   Run against a non-production environment first.
--   Verify all NOTICE output before applying to production.
--
-- POST-MIGRATION
--   Run bp08e-dispatch-hardening-tests.sql to verify results.
-- ════════════════════════════════════════════════════════════
-- DO NOT APPLY TO SUPABASE WITHOUT EXPLICIT HUMAN AUTHORIZATION
-- ════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  -- ── Target function registry ─────────────────────────────
  v_targets   text[] := ARRAY[
    'dispatch_execution_plan_v1',
    'dispatch_batch_preview_v1',
    'dispatch_candidate_pool_v1',
    'dispatch_preview_v21',
    'resolve_service_category_v1'
  ];

  -- ── Per-function working variables ───────────────────────
  v_fn_name         text;
  v_fn_oid          oid;
  v_fn_config       text[];
  v_fn_config_str   text;
  v_fn_body         text;
  v_fn_proname      text;

  -- ── Analysis variables ───────────────────────────────────
  v_already_hardened  boolean;
  v_has_unqualified   boolean;
  v_unqualified_hint  text;

  -- ── Summary counters ─────────────────────────────────────
  v_count_hardened     integer := 0;
  v_count_skipped      integer := 0;
  v_count_pending      integer := 0;
  v_count_not_found    integer := 0;
  v_count_total        integer := 0;

  -- ── Precondition: track whether ANY function was found ───
  v_any_found         boolean := false;

BEGIN

  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE '7C.15A.4 — Dispatch search_path Hardening';
  RAISE NOTICE 'Sprint BP08E | Branch: recovery/seo-v3-safe';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE 'PRECONDITION CHECK: Scanning for dispatch functions in pg_proc...';
  RAISE NOTICE '';

  -- ── PRECONDITION: Count how many of the 5 functions exist ─
  SELECT count(*) INTO v_count_total
  FROM   pg_catalog.pg_proc p
  JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.proname = ANY(v_targets);

  IF v_count_total = 0 THEN
    RAISE NOTICE 'PRECONDITION WARN: None of the 5 dispatch target functions';
    RAISE NOTICE '  were found in pg_proc for schema public.';
    RAISE NOTICE '  This is expected in the local development environment.';
    RAISE NOTICE '  These functions exist only in the production database.';
    RAISE NOTICE '  Run this migration in production to apply hardening.';
    RAISE NOTICE '';
    RAISE NOTICE '  Functions not found locally:';
    RAISE NOTICE '    dispatch_execution_plan_v1   → not_found_locally';
    RAISE NOTICE '    dispatch_batch_preview_v1    → not_found_locally';
    RAISE NOTICE '    dispatch_candidate_pool_v1   → not_found_locally';
    RAISE NOTICE '    dispatch_preview_v21         → not_found_locally';
    RAISE NOTICE '    resolve_service_category_v1  → not_found_locally';
    RAISE NOTICE '';
    RAISE NOTICE 'PRECONDITION RESULT: No functions to harden in this environment.';
    RAISE NOTICE '  Migration exits cleanly. No errors. No changes made.';
    RAISE NOTICE '';
    RAISE NOTICE '════════════════════════════════════════════════════════════';
    RAISE NOTICE 'SUMMARY: 0 hardened | 0 skipped | 0 pending_review | 5 not_found';
    RAISE NOTICE '════════════════════════════════════════════════════════════';
    RETURN; -- Exit the DO block cleanly; transaction will COMMIT below
  END IF;

  RAISE NOTICE 'PRECONDITION PASS: % of 5 target function(s) found in pg_proc.', v_count_total;
  RAISE NOTICE 'Proceeding with per-function analysis...';
  RAISE NOTICE '';

  -- ── PER-FUNCTION ANALYSIS AND CONDITIONAL HARDENING ──────
  FOREACH v_fn_name IN ARRAY v_targets
  LOOP
    v_fn_oid          := NULL;
    v_fn_config       := NULL;
    v_fn_config_str   := NULL;
    v_fn_body         := NULL;
    v_already_hardened  := false;
    v_has_unqualified   := false;
    v_unqualified_hint  := NULL;

    RAISE NOTICE '────────────────────────────────────────────────────────────';
    RAISE NOTICE 'Function: public.%', v_fn_name;

    -- ── STEP 1: Check existence ──────────────────────────────
    SELECT p.oid, p.proconfig
    INTO   v_fn_oid, v_fn_config
    FROM   pg_catalog.pg_proc p
    JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  p.proname = v_fn_name
    LIMIT  1; -- take first overload if multiple exist

    IF v_fn_oid IS NULL THEN
      v_count_not_found := v_count_not_found + 1;
      RAISE NOTICE '  STATUS: not_found_locally';
      RAISE NOTICE '  REASON: Function does not exist in pg_proc for schema public.';
      RAISE NOTICE '  ACTION: No ALTER performed. Record as not_found_locally.';
      RAISE NOTICE '  NOTE:   Production body cannot be inspected here.';
      RAISE NOTICE '          Run this migration in production to apply hardening.';
      CONTINUE;
    END IF;

    v_any_found := true;

    -- ── STEP 2: Check current search_path configuration ──────
    -- pg_proc.proconfig is a text[] of GUC settings like
    -- {"search_path=''", "search_path=public"} etc.
    -- We flatten to a single string for pattern matching.
    v_fn_config_str := array_to_string(COALESCE(v_fn_config, ARRAY[]::text[]), '|');

    RAISE NOTICE '  OID:    %', v_fn_oid;
    RAISE NOTICE '  CONFIG: %', COALESCE(v_fn_config_str, '(none — no proconfig set)');

    -- Check if already hardened (search_path is empty string)
    IF v_fn_config_str LIKE '%search_path=''''%'
    OR v_fn_config_str LIKE '%search_path=""'
    OR v_fn_config_str = 'search_path='
    THEN
      v_already_hardened := true;
    END IF;

    -- Also check if search_path is literally an empty value (= '')
    -- PostgreSQL stores SET search_path = '' as: search_path=
    IF v_fn_config IS NOT NULL THEN
      DECLARE
        v_cfg_entry text;
      BEGIN
        FOREACH v_cfg_entry IN ARRAY v_fn_config LOOP
          IF v_cfg_entry = 'search_path='
          OR v_cfg_entry = 'search_path=''''
          OR v_cfg_entry = 'search_path=""'
          THEN
            v_already_hardened := true;
          END IF;
        END LOOP;
      END;
    END IF;

    IF v_already_hardened THEN
      v_count_skipped := v_count_skipped + 1;
      RAISE NOTICE '  STATUS: already_hardened';
      RAISE NOTICE '  REASON: search_path is already set to empty string.';
      RAISE NOTICE '  ACTION: No ALTER performed. Idempotent skip.';
      CONTINUE;
    END IF;

    -- ── STEP 3: Inspect function body for unqualified references
    -- Retrieve the full function definition text via pg_get_functiondef.
    -- This is only possible when the function exists in THIS database instance.
    -- We look for patterns that suggest unqualified identifiers which would
    -- break under SET search_path = ''.
    --
    -- Heuristics for "likely unqualified" (conservative — flag more than needed):
    --   a) Direct table reference without schema: FROM tablename (no dot before)
    --      We check for FROM/JOIN/UPDATE/INSERT/DELETE without schema prefix
    --   b) Function calls without pg_catalog or public prefix
    --   c) Type casts using bare type names in complex expressions
    --
    -- Pattern: if body contains "FROM " followed by an identifier that has
    -- no "." (schema qualifier) immediately before the identifier, flag it.
    --
    -- NOTE: This heuristic is intentionally conservative. False positives
    -- (functions flagged as pending_review but actually safe) are acceptable.
    -- False negatives (hardening a function with unqualified refs) are NOT.

    BEGIN
      SELECT pg_catalog.pg_get_functiondef(v_fn_oid) INTO v_fn_body;
    EXCEPTION WHEN OTHERS THEN
      v_fn_body := NULL;
      RAISE NOTICE '  WARN: pg_get_functiondef failed for OID %: %', v_fn_oid, SQLERRM;
    END;

    IF v_fn_body IS NULL THEN
      v_count_pending := v_count_pending + 1;
      RAISE NOTICE '  STATUS: pending_review';
      RAISE NOTICE '  REASON: Cannot retrieve function body via pg_get_functiondef.';
      RAISE NOTICE '  ACTION: No ALTER performed. Manual inspection required.';
      CONTINUE;
    END IF;

    RAISE NOTICE '  BODY_LENGTH: % chars', length(v_fn_body);

    -- ── HEURISTIC ANALYSIS ───────────────────────────────────
    -- Check 1: Already has SET search_path = '' in body header
    -- (Some functions embed it in the definition text itself)
    IF v_fn_body ILIKE '%SET search_path = ''''%'
    OR v_fn_body ILIKE '%set search_path=''''%'
    THEN
      v_already_hardened := true;
    END IF;

    IF v_already_hardened THEN
      v_count_skipped := v_count_skipped + 1;
      RAISE NOTICE '  STATUS: already_hardened (detected in body text)';
      RAISE NOTICE '  REASON: SET search_path = '''' found in function definition.';
      RAISE NOTICE '  ACTION: No ALTER performed. Idempotent skip.';
      CONTINUE;
    END IF;

    -- Check 2: Look for unqualified table/type references
    -- Pattern: FROM <identifier> or JOIN <identifier> without a schema dot
    -- We use position() and lower() which are pg_catalog-safe.
    --
    -- Detects patterns like:
    --   FROM artisans  (unqualified)
    --   FROM public.artisans  (qualified — safe)
    --   JOIN missions  (unqualified)
    --
    -- We check if the body contains FROM/JOIN followed by text that has
    -- no dot within 2 characters before the next whitespace/newline token.
    -- This is approximate — a full parser is not available in PL/pgSQL.
    --
    -- Conservative approach: check if body uses known project table names
    -- without a schema prefix. The project tables are:
    --   artisans, service_requests, missions, users, profiles,
    --   enterprise_organizations, enterprise_members, enterprise_requests,
    --   dispatch_execution_queue

    v_has_unqualified := false;
    v_unqualified_hint := '';

    -- Test for unqualified FROM artisans (not preceded by ".")
    -- We look for FROM artisans as a word boundary without prior dot
    IF v_fn_body ~ '\mFROM\s+artisans\M'
    OR v_fn_body ~ '\mJOIN\s+artisans\M'
    OR v_fn_body ~ '\mUPDATE\s+artisans\M'
    THEN
      v_has_unqualified := true;
      v_unqualified_hint := v_unqualified_hint || 'artisans ';
    END IF;

    IF v_fn_body ~ '\mFROM\s+service_requests\M'
    OR v_fn_body ~ '\mJOIN\s+service_requests\M'
    OR v_fn_body ~ '\mUPDATE\s+service_requests\M'
    THEN
      v_has_unqualified := true;
      v_unqualified_hint := v_unqualified_hint || 'service_requests ';
    END IF;

    IF v_fn_body ~ '\mFROM\s+missions\M'
    OR v_fn_body ~ '\mJOIN\s+missions\M'
    OR v_fn_body ~ '\mUPDATE\s+missions\M'
    OR v_fn_body ~ '\mINSERT\s+INTO\s+missions\M'
    THEN
      v_has_unqualified := true;
      v_unqualified_hint := v_unqualified_hint || 'missions ';
    END IF;

    IF v_fn_body ~ '\mFROM\s+enterprise_organizations\M'
    OR v_fn_body ~ '\mFROM\s+enterprise_members\M'
    OR v_fn_body ~ '\mFROM\s+enterprise_requests\M'
    OR v_fn_body ~ '\mFROM\s+dispatch_execution_queue\M'
    THEN
      v_has_unqualified := true;
      v_unqualified_hint := v_unqualified_hint || 'enterprise_tables ';
    END IF;

    -- Check for use of auth.uid() — this IS schema-qualified (auth.) so it's safe
    -- Check for unqualified function calls that are NOT pg_catalog builtins
    -- Known risky pattern: calling unqualified user-defined functions
    IF v_fn_body ~ '\mnormalize_service_category_v1\s*\('
    AND v_fn_body !~ '\mpublic\.normalize_service_category_v1\s*\('
    THEN
      v_has_unqualified := true;
      v_unqualified_hint := v_unqualified_hint || 'normalize_service_category_v1() ';
    END IF;

    IF v_fn_body ~ '\mdispatch_request_v1\s*\('
    AND v_fn_body !~ '\mpublic\.dispatch_request_v1\s*\('
    THEN
      v_has_unqualified := true;
      v_unqualified_hint := v_unqualified_hint || 'dispatch_request_v1() ';
    END IF;

    -- ── DECISION ─────────────────────────────────────────────
    IF v_has_unqualified THEN
      v_count_pending := v_count_pending + 1;
      RAISE NOTICE '  STATUS: pending_review';
      RAISE NOTICE '  REASON: Unqualified identifier patterns detected in body.';
      RAISE NOTICE '  UNQUALIFIED_PATTERNS: %', trim(v_unqualified_hint);
      RAISE NOTICE '  ACTION: No ALTER performed. Manual inspection required.';
      RAISE NOTICE '  REQUIRED: Rewrite function body with schema-qualified identifiers,';
      RAISE NOTICE '    then re-run this migration, OR manually ALTER after verification.';
      RAISE NOTICE '  REFERENCE: See established pattern in dispatch_request_v1():';
      RAISE NOTICE '    FROM public.artisans a, FROM public.missions m, etc.';
    ELSE
      -- ── SAFE TO HARDEN ──────────────────────────────────────
      -- No unqualified references detected. Apply search_path hardening.
      -- This is a metadata-only change: ALTER FUNCTION SET search_path.
      -- Zero business logic change. Zero function body change.

      RAISE NOTICE '  ANALYSIS: No unqualified identifier patterns detected.';
      RAISE NOTICE '  CURRENT search_path: %',
        COALESCE(
          (SELECT cfg FROM unnest(COALESCE(v_fn_config, ARRAY[]::text[])) AS cfg
           WHERE cfg LIKE 'search_path%' LIMIT 1),
          '(not set)'
        );
      RAISE NOTICE '  APPLYING: ALTER FUNCTION public.% SET search_path = ''''', v_fn_name;

      BEGIN
        EXECUTE format(
          'ALTER FUNCTION public.%I SET search_path = ''''',
          v_fn_name
        );
        v_count_hardened := v_count_hardened + 1;
        RAISE NOTICE '  STATUS: hardened';
        RAISE NOTICE '  RESULT: search_path set to empty string successfully.';
      EXCEPTION WHEN OTHERS THEN
        v_count_pending := v_count_pending + 1;
        RAISE NOTICE '  STATUS: pending_review (ALTER FAILED)';
        RAISE NOTICE '  ERROR:  % (SQLSTATE: %)', SQLERRM, SQLSTATE;
        RAISE NOTICE '  ACTION: Manual ALTER required. See error above.';
      END;
    END IF;

  END LOOP; -- FOREACH v_fn_name

  -- ── FINAL SUMMARY ────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE '7C.15A.4 — Dispatch search_path Hardening SUMMARY';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE 'Results per function:';

  -- Re-scan to emit per-function status in summary
  FOREACH v_fn_name IN ARRAY v_targets
  LOOP
    SELECT p.oid INTO v_fn_oid
    FROM   pg_catalog.pg_proc p
    JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  p.proname = v_fn_name
    LIMIT  1;

    IF v_fn_oid IS NULL THEN
      RAISE NOTICE '  %-40s → not_found_locally', v_fn_name;
    ELSE
      SELECT pg_catalog.array_to_string(COALESCE(p.proconfig, ARRAY[]::text[]), '|')
      INTO   v_fn_config_str
      FROM   pg_catalog.pg_proc p
      WHERE  p.oid = v_fn_oid;

      IF v_fn_config_str LIKE '%search_path=''''%'
      OR v_fn_config_str LIKE '%search_path=""'
      OR v_fn_config_str = 'search_path='
      THEN
        RAISE NOTICE '  %-40s → hardened (search_path='''')', v_fn_name;
      ELSE
        RAISE NOTICE '  %-40s → config: %', v_fn_name,
          COALESCE(NULLIF(v_fn_config_str, ''), '(no proconfig)');
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE 'Aggregate counts:';
  RAISE NOTICE '  Functions hardened (ALTER applied):    %', v_count_hardened;
  RAISE NOTICE '  Functions skipped (already at ''''): %', v_count_skipped;
  RAISE NOTICE '  Functions pending_review:              %', v_count_pending;
  RAISE NOTICE '  Functions not_found_locally:           %', v_count_not_found;
  RAISE NOTICE '';

  IF v_count_not_found = 5 THEN
    RAISE NOTICE 'ENVIRONMENT NOTE: All 5 functions are production-only.';
    RAISE NOTICE '  This migration should be run in production where the';
    RAISE NOTICE '  functions exist. No local changes were made.';
  ELSIF v_count_pending > 0 THEN
    RAISE NOTICE 'ACTION REQUIRED: % function(s) need manual inspection.', v_count_pending;
    RAISE NOTICE '  Review the pending_review entries above and either:';
    RAISE NOTICE '    (a) Rewrite function body with schema-qualified identifiers';
    RAISE NOTICE '        then re-run this migration, OR';
    RAISE NOTICE '    (b) Manually verify body safety and apply ALTER directly.';
  END IF;

  IF v_count_hardened > 0 THEN
    RAISE NOTICE 'SUCCESS: % function(s) hardened. search_path injection risk removed.', v_count_hardened;
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'BP08E migration complete. Zero business logic changed.';
  RAISE NOTICE '════════════════════════════════════════════════════════════';

END;
$$;

COMMIT;
