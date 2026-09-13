-- ════════════════════════════════════════════════════════════
-- FIXEO — 7C.15A.5 Enterprise Site Audit Wiring
-- File: supabase/7c15a5-enterprise-site-audit-wiring.sql
-- Sprint: BP08C/D/E Audit Patch
-- Branch: recovery/seo-v3-safe
-- HEAD at preparation: eb2da7d2c570a479c4120b4c026901f482fbd847
--
-- PURPOSE
--   Wire the two BP08C site mutation RPCs into the canonical
--   enterprise_audit_log via fixeo_private._eal_append().
--
--   This migration is ADDITIVE ONLY.
--
--   It uses CREATE OR REPLACE to re-define:
--     public.update_enterprise_site(...)
--     public.set_enterprise_site_status(...)
--
--   The ONLY changes from 7c15a2 are:
--     (a) DECLARE block: new v_old_* variables for pre-mutation state
--     (b) After the successful UPDATE statement:
--         a single PERFORM fixeo_private._eal_append(...) call
--     (c) NO guard logic change
--     (d) NO return shape change
--     (e) NO error code change
--     (f) NO security attribute change
--     (g) NO no-op path change (audit only fires after real mutation)
--
-- AUDIT EVENTS ADDED
--   update_enterprise_site   → action_type: 'site_updated'
--   set_enterprise_site_status → action_type: 'site_status_changed'
--
-- METADATA POLICY
--   Only changed-state values are stored.
--   No user email, auth token, phone, or unrelated PII.
--   Fields: old_name, new_name, old_city, new_city,
--           old_site_code, new_site_code,
--           old_address_line, new_address_line  (update_enterprise_site)
--           old_status, new_status              (set_enterprise_site_status)
--
-- DEPENDENCIES
--   7c15a2-enterprise-site-control.sql     — RPCs being re-defined
--   7c15a3-enterprise-account-audit.sql    — enterprise_audit_log +
--                                            fixeo_private._eal_append()
--
-- IDEMPOTENCY
--   CREATE OR REPLACE is safe to re-run.
--   enterprise_audit_log and _eal_append must already exist;
--   precondition block verifies this before proceeding.
--
-- DO NOT APPLY TO SUPABASE WITHOUT EXPLICIT HUMAN AUTHORIZATION.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════
-- PRECONDITION CHECKS
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_eal_exists      boolean;
  v_append_exists   boolean;
  v_update_site_exists  boolean;
  v_status_site_exists  boolean;
BEGIN
  -- enterprise_audit_log must exist (from 7c15a3)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'enterprise_audit_log'
  ) INTO v_eal_exists;

  IF NOT v_eal_exists THEN
    RAISE EXCEPTION 'ABORT: enterprise_audit_log does not exist. Apply 7c15a3 first.';
  END IF;

  -- fixeo_private._eal_append must exist (from 7c15a3)
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'fixeo_private'
      AND p.proname = '_eal_append'
  ) INTO v_append_exists;

  IF NOT v_append_exists THEN
    RAISE EXCEPTION 'ABORT: fixeo_private._eal_append does not exist. Apply 7c15a3 first.';
  END IF;

  -- update_enterprise_site must exist (from 7c15a2)
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'update_enterprise_site'
  ) INTO v_update_site_exists;

  IF NOT v_update_site_exists THEN
    RAISE EXCEPTION 'ABORT: public.update_enterprise_site does not exist. Apply 7c15a2 first.';
  END IF;

  -- set_enterprise_site_status must exist (from 7c15a2)
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'set_enterprise_site_status'
  ) INTO v_status_site_exists;

  IF NOT v_status_site_exists THEN
    RAISE EXCEPTION 'ABORT: public.set_enterprise_site_status does not exist. Apply 7c15a2 first.';
  END IF;

  RAISE NOTICE '7c15a5 PRECONDITION PASS: all dependencies verified.';
END $$;

-- ════════════════════════════════════════════════════════════
-- SECTION 1: update_enterprise_site() — with audit wiring
--
-- Identical to 7c15a2 version except:
--   DECLARE: adds v_old_name, v_old_city, v_old_site_code, v_old_addr
--   After UPDATE: PERFORM fixeo_private._eal_append(...)
--   No-op path (Guard 10 early return) is UNCHANGED — no audit there.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.update_enterprise_site(
  p_enterprise_id uuid,
  p_site_id       uuid,
  p_name          text,
  p_city          text,
  p_site_code     text DEFAULT NULL,
  p_address_line  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id      uuid;
  v_caller_role    text;
  v_caller_stat    text;
  v_site_eid       uuid;
  v_site_name      text;
  v_site_city      text;
  v_site_code_cur  text;
  v_site_addr_cur  text;
  v_name           text;
  v_city           text;
  v_site_code      text;
  v_address_line   text;
BEGIN

  -- ── Guard 1: caller must be authenticated ─────────────────
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- ── Guard 2: acquire enterprise row lock ──────────────────
  PERFORM id
  FROM public.enterprise_accounts
  WHERE id = p_enterprise_id
  FOR UPDATE;

  -- ── Guard 3: resolve caller membership ────────────────────
  SELECT em.role, em.status
  INTO v_caller_role, v_caller_stat
  FROM public.enterprise_members em
  WHERE em.enterprise_id = p_enterprise_id
    AND em.user_id       = v_caller_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_a_member');
  END IF;
  IF v_caller_stat != 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'caller_not_active');
  END IF;
  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  -- ── Guard 4 + 5: site exists and belongs to this enterprise ─
  SELECT es.enterprise_id, es.name, es.city, es.site_code, es.address_line
  INTO v_site_eid, v_site_name, v_site_city, v_site_code_cur, v_site_addr_cur
  FROM public.enterprise_sites es
  WHERE es.id = p_site_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_not_found');
  END IF;

  IF v_site_eid <> p_enterprise_id THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_enterprise_mismatch');
  END IF;

  -- ── Guard 6: validate and normalize name ──────────────────
  IF p_name IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_name)) < 1 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'name_required');
  END IF;
  v_name := pg_catalog.btrim(p_name);
  IF pg_catalog.char_length(v_name) > 200 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'name_too_long');
  END IF;

  -- ── Guard 7: validate and normalize city ──────────────────
  IF p_city IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_city)) < 1 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'city_required');
  END IF;
  v_city := pg_catalog.btrim(p_city);
  IF pg_catalog.char_length(v_city) > 120 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'city_too_long');
  END IF;

  -- ── Guard 8: validate and normalize site_code if provided ─
  IF p_site_code IS NOT NULL THEN
    v_site_code := pg_catalog.btrim(p_site_code);
    IF pg_catalog.char_length(v_site_code) > 80 THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_code_invalid');
    END IF;
    IF pg_catalog.char_length(v_site_code) = 0 THEN
      v_site_code := NULL;
    END IF;
  ELSE
    v_site_code := NULL;
  END IF;

  -- ── Guard 9: validate and normalize address_line if provided
  IF p_address_line IS NOT NULL THEN
    v_address_line := pg_catalog.btrim(p_address_line);
    IF pg_catalog.char_length(v_address_line) > 500 THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'address_invalid');
    END IF;
    IF pg_catalog.char_length(v_address_line) = 0 THEN
      v_address_line := NULL;
    END IF;
  ELSE
    v_address_line := NULL;
  END IF;

  -- ── Guard 10: no-op check ─────────────────────────────────
  -- AUDIT NOTE: early return here — no event fired on no_change.
  IF v_name           IS NOT DISTINCT FROM v_site_name
  AND v_city          IS NOT DISTINCT FROM v_site_city
  AND v_site_code     IS NOT DISTINCT FROM v_site_code_cur
  AND v_address_line  IS NOT DISTINCT FROM v_site_addr_cur
  THEN
    RETURN pg_catalog.jsonb_build_object('ok', true, 'reason', 'no_change');
  END IF;

  -- ── Mutation ───────────────────────────────────────────────
  UPDATE public.enterprise_sites
  SET
    name         = v_name,
    city         = v_city,
    site_code    = v_site_code,
    address_line = v_address_line
  WHERE id = p_site_id;

  -- ── Audit: fire only after real mutation ──────────────────
  -- Captures pre-mutation values (v_site_*) vs post-mutation (v_*).
  -- No-op path above returns before reaching this point.
  -- Unauthenticated / forbidden paths return before reaching this.
  -- Metadata contains no PII (name/city/code/address are site data,
  -- not personal data).
  PERFORM fixeo_private._eal_append(
    p_enterprise_id,
    v_caller_id,
    'site_updated',
    'enterprise_site',
    p_site_id,
    pg_catalog.jsonb_build_object(
      'old_name',         v_site_name,
      'new_name',         v_name,
      'old_city',         v_site_city,
      'new_city',         v_city,
      'old_site_code',    v_site_code_cur,
      'new_site_code',    v_site_code,
      'old_address_line', v_site_addr_cur,
      'new_address_line', v_address_line
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',            true,
    'site_id',       p_site_id,
    'enterprise_id', p_enterprise_id
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_code_exists');
  WHEN OTHERS THEN
    RAISE WARNING '[update_enterprise_site] error: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'internal_error');
END;
$$;

DO $$ BEGIN RAISE NOTICE '7c15a5 SECTION 1 — update_enterprise_site() re-defined with audit wiring'; END $$;

-- ════════════════════════════════════════════════════════════
-- SECTION 2: set_enterprise_site_status() — with audit wiring
--
-- Identical to 7c15a2 version except:
--   After UPDATE: PERFORM fixeo_private._eal_append(...)
--   No-op path (Guard 6 early return) is UNCHANGED — no audit there.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_enterprise_site_status(
  p_enterprise_id uuid,
  p_site_id       uuid,
  p_status        text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id   uuid;
  v_caller_role text;
  v_caller_stat text;
  v_site_eid    uuid;
  v_site_status text;
BEGIN

  -- ── Guard 1: caller must be authenticated ─────────────────
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- ── Guard 2: validate p_status ────────────────────────────
  IF p_status IS NULL OR p_status NOT IN ('active', 'inactive') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_status');
  END IF;

  -- ── Guard 3: acquire enterprise row lock ──────────────────
  PERFORM id
  FROM public.enterprise_accounts
  WHERE id = p_enterprise_id
  FOR UPDATE;

  -- ── Guard 4: resolve caller membership ────────────────────
  SELECT em.role, em.status
  INTO v_caller_role, v_caller_stat
  FROM public.enterprise_members em
  WHERE em.enterprise_id = p_enterprise_id
    AND em.user_id       = v_caller_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_a_member');
  END IF;
  IF v_caller_stat != 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'caller_not_active');
  END IF;
  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  -- ── Guard 5: site exists and belongs to this enterprise ───
  SELECT es.enterprise_id, es.status
  INTO v_site_eid, v_site_status
  FROM public.enterprise_sites es
  WHERE es.id = p_site_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_not_found');
  END IF;

  IF v_site_eid <> p_enterprise_id THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_enterprise_mismatch');
  END IF;

  -- ── Guard 6: no-op check ──────────────────────────────────
  -- AUDIT NOTE: early return here — no event fired on no_change.
  IF v_site_status = p_status THEN
    RETURN pg_catalog.jsonb_build_object('ok', true, 'reason', 'no_change');
  END IF;

  -- ── Mutation ───────────────────────────────────────────────
  UPDATE public.enterprise_sites
  SET status = p_status
  WHERE id = p_site_id;

  -- ── Audit: fire only after real mutation ──────────────────
  -- v_site_status holds the pre-mutation status (captured in Guard 5).
  -- p_status is the new status.
  -- Covers both active→inactive (deactivation) and inactive→active
  -- (reactivation) transitions.
  -- No-op path above returns before reaching this point.
  PERFORM fixeo_private._eal_append(
    p_enterprise_id,
    v_caller_id,
    'site_status_changed',
    'enterprise_site',
    p_site_id,
    pg_catalog.jsonb_build_object(
      'old_status', v_site_status,
      'new_status', p_status
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',        true,
    'site_id',   p_site_id,
    'new_status', p_status
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[set_enterprise_site_status] error: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'internal_error');
END;
$$;

DO $$ BEGIN RAISE NOTICE '7c15a5 SECTION 2 — set_enterprise_site_status() re-defined with audit wiring'; END $$;

-- ════════════════════════════════════════════════════════════
-- SECTION 3: Grants — preserve exactly from 7c15a2
--
-- CREATE OR REPLACE does not alter existing GRANT/REVOKE state.
-- Re-issuing them here is idempotent and makes this migration
-- self-contained if applied independently.
-- ════════════════════════════════════════════════════════════

-- update_enterprise_site
REVOKE EXECUTE ON FUNCTION public.update_enterprise_site(uuid, uuid, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_enterprise_site(uuid, uuid, text, text, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.update_enterprise_site(uuid, uuid, text, text, text, text) TO authenticated;

-- set_enterprise_site_status
REVOKE EXECUTE ON FUNCTION public.set_enterprise_site_status(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_enterprise_site_status(uuid, uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.set_enterprise_site_status(uuid, uuid, text) TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c15a5 SECTION 3 — grants re-affirmed for both RPCs'; END $$;

-- ════════════════════════════════════════════════════════════
-- SUMMARY
-- ════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '7c15a5 — Enterprise Site Audit Wiring COMPLETE';
  RAISE NOTICE '  update_enterprise_site      → site_updated event';
  RAISE NOTICE '  set_enterprise_site_status  → site_status_changed event';
  RAISE NOTICE '  Both: audit fires ONLY after real mutation';
  RAISE NOTICE '  Both: no_change early return path untouched (no event)';
  RAISE NOTICE '  Both: all guard logic, return shapes unchanged';
  RAISE NOTICE '  Both: SECURITY DEFINER, SET search_path = '''' preserved';
  RAISE NOTICE '  Grants: PUBLIC/anon REVOKE; authenticated GRANT preserved';
  RAISE NOTICE '════════════════════════════════════════════════════════';
END $$;

COMMIT;
