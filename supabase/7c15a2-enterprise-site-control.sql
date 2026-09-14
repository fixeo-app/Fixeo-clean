-- ════════════════════════════════════════════════════════════
-- FIXEO OPERATIONS — 7C.15A.2 Enterprise Site Control Plane
-- File: supabase/7c15a2-enterprise-site-control.sql
-- Sprint: BP08C
-- HEAD at authoring: 9a628c4dd53e9da28f2459056302c2b022480d05
--
-- PURPOSE
-- Add self-service enterprise site administration:
-- metadata updates (name, city, site_code, address_line) and
-- status transitions (active ↔ inactive).
-- Physical delete is NOT provided — deactivation is the
-- terminal mutation for a site (status='inactive').
--
-- SCOPE
-- 1. update_enterprise_site() RPC
-- 2. set_enterprise_site_status() RPC
-- 3. Revoke table-level UPDATE on enterprise_sites from authenticated
--    (all mutations now go through RPCs only)
-- 4. Grants / revokes for both RPCs
--
-- DEFERRED: Audit trail
-- Reason: audit calls (BP08D) are reserved for the next migration.
-- NO audit inserts in this file.
--
-- DEFERRED: Physical DELETE RPC
-- Site deactivation semantics: status='inactive'.
-- enterprise_request_context rows remain intact (FK ON DELETE RESTRICT).
-- create_enterprise_request Guard 7 already blocks inactive sites.
-- DO NOT modify 7c13a3.
--
-- INVARIANTS
-- A. Caller must be active owner or admin of the enterprise.
-- B. Site must exist and belong to the caller's enterprise.
-- C. All text mutations are normalized via pg_catalog.btrim().
-- D. No-op is not an error — returns {ok:true, reason:'no_change'}.
-- E. Physical DELETE not used — status='inactive' is the terminal state.
-- F. Deactivating a site does NOT purge enterprise_request_context.
--
-- SECURITY MODEL (both RPCs)
-- • SECURITY DEFINER: executes as postgres, bypassing RLS on enterprise_sites.
-- • SET search_path = '': prevents search-path injection.
-- • All identifiers fully schema-qualified (public., auth.uid(), pg_catalog.).
-- • EXECUTE revoked from PUBLIC and anon.
-- • EXECUTE granted to authenticated only.
-- • p_enterprise_id and p_site_id are untrusted caller input;
--   the site-enterprise cross-check (Guard 4/5) is the critical
--   cross-tenant boundary — it verifies site.enterprise_id = p_enterprise_id.
--
-- CONCURRENCY
-- Both RPCs acquire enterprise_accounts FOR UPDATE before any
-- membership check or site mutation. This serializes concurrent
-- site mutations for the same enterprise and prevents a
-- race where two concurrent admins both pass the membership
-- check then both mutate the same site inconsistently.
--
-- ADDITIVE ONLY (tables, triggers, indexes, other RPCs)
-- Zero modifications to: enterprise_accounts, enterprise_members,
-- enterprise_request_context, service_requests, or any prior RPC.
-- The REVOKE UPDATE on enterprise_sites (Section 3) is the only
-- change to an existing grant — it tightens privilege, not widens it.
-- ════════════════════════════════════════════════════════════
-- PRODUCTION MIGRATION — applied and post-apply validated in Supabase production.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════
-- PRECONDITION CHECKS
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_es_exists boolean;
  v_ea_exists boolean;
  v_em_exists boolean;
  v_h1_exists boolean;
  v_h2_exists boolean;
  v_r1_exists boolean;
  v_r2_exists boolean;
BEGIN
  -- 1. enterprise_sites must exist (7c13a2 applied)
  SELECT EXISTS(
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'enterprise_sites'
  ) INTO v_es_exists;

  IF NOT v_es_exists THEN
    RAISE EXCEPTION 'ABORT: public.enterprise_sites not found. Apply 7c13a2 first.';
  END IF;

  -- 2. enterprise_accounts must exist (7c13a1 applied)
  SELECT EXISTS(
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'enterprise_accounts'
  ) INTO v_ea_exists;

  IF NOT v_ea_exists THEN
    RAISE EXCEPTION 'ABORT: public.enterprise_accounts not found. Apply 7c13a1 first.';
  END IF;

  -- 3. enterprise_members must exist (7c13a1 applied)
  SELECT EXISTS(
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'enterprise_members'
  ) INTO v_em_exists;

  IF NOT v_em_exists THEN
    RAISE EXCEPTION 'ABORT: public.enterprise_members not found. Apply 7c13a1 first.';
  END IF;

  -- 4. fixeo_private._fixeo_is_enterprise_member must exist (7c13a1 applied)
  SELECT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'fixeo_private'
      AND p.proname = '_fixeo_is_enterprise_member'
  ) INTO v_h1_exists;

  IF NOT v_h1_exists THEN
    RAISE EXCEPTION 'ABORT: fixeo_private._fixeo_is_enterprise_member not found. Apply 7c13a1 first.';
  END IF;

  -- 5. fixeo_private._fixeo_is_enterprise_manager must exist (7c13a1 applied)
  SELECT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'fixeo_private'
      AND p.proname = '_fixeo_is_enterprise_manager'
  ) INTO v_h2_exists;

  IF NOT v_h2_exists THEN
    RAISE EXCEPTION 'ABORT: fixeo_private._fixeo_is_enterprise_manager not found. Apply 7c13a1 first.';
  END IF;

  -- 6. update_enterprise_site must NOT already exist (idempotency guard)
  SELECT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'update_enterprise_site'
  ) INTO v_r1_exists;

  IF v_r1_exists THEN
    RAISE EXCEPTION 'ABORT: public.update_enterprise_site() already exists. Already applied?';
  END IF;

  -- 7. set_enterprise_site_status must NOT already exist (idempotency guard)
  SELECT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'set_enterprise_site_status'
  ) INTO v_r2_exists;

  IF v_r2_exists THEN
    RAISE EXCEPTION 'ABORT: public.set_enterprise_site_status() already exists. Already applied?';
  END IF;

  RAISE NOTICE '7c15a2 preconditions PASSED';
END $$;

-- ════════════════════════════════════════════════════════════
-- SECTION 1: update_enterprise_site() RPC
--
-- PURPOSE
-- Allow an active owner or admin to update the metadata
-- (name, city, site_code, address_line) of an enterprise site.
--
-- GUARD SEQUENCE (first failing guard returns immediately)
-- Guard 1: auth.uid() not NULL → unauthenticated
-- Guard 2: enterprise_accounts FOR UPDATE lock (serializes concurrent ops)
-- Guard 3: Caller membership check:
--          not_a_member / caller_not_active / forbidden
-- Guard 4: Site exists → site_not_found
-- Guard 5: Site belongs to p_enterprise_id → site_enterprise_mismatch
-- Guard 6: Validate and normalize p_name → name_required / name_too_long
-- Guard 7: Validate and normalize p_city → city_required / city_too_long
-- Guard 8: Validate and normalize p_site_code
--          if provided → site_code_invalid
-- Guard 9: Validate and normalize p_address_line
--          if provided → address_invalid
-- Guard 10: No-op check (all fields unchanged) → no_change (ok:true)
-- Guard 11: UPDATE enterprise_sites
-- Exception: unique_violation → site_code_exists
-- Exception: OTHERS → internal_error
--
-- RETURN SHAPE
-- Success: {"ok": true, "site_id": "", "enterprise_id": ""}
-- No-op:   {"ok": true, "reason": "no_change"}
-- Failure: {"ok": false, "reason": "<code>"}
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_enterprise_site(
  p_enterprise_id uuid,
  p_site_id uuid,
  p_name text,
  p_city text,
  p_site_code text DEFAULT NULL,
  p_address_line text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_caller_stat text;
  v_site_eid uuid;
  v_site_name text;
  v_site_city text;
  v_site_code_cur text;
  v_site_addr_cur text;
  v_name text;
  v_city text;
  v_site_code text;
  v_address_line text;
BEGIN
  -- ── Guard 1: caller must be authenticated ─────────────────
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- ── Guard 2: acquire enterprise row lock ──────────────────
  -- Serializes concurrent site mutations for the same enterprise.
  -- Pattern matches BP08B (7c15a1) owner-invariant design.
  PERFORM id
  FROM public.enterprise_accounts
  WHERE id = p_enterprise_id
  FOR UPDATE;

  -- ── Guard 3: resolve caller membership ────────────────────
  SELECT em.role, em.status
  INTO v_caller_role, v_caller_stat
  FROM public.enterprise_members em
  WHERE em.enterprise_id = p_enterprise_id
    AND em.user_id = v_caller_id;

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
  -- Critical cross-tenant boundary: v_site_eid must equal p_enterprise_id.
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
    -- Blank after trim (e.g. ' ') → treat as NULL (clear the code)
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
    -- Blank after trim → treat as NULL (clear the address)
    IF pg_catalog.char_length(v_address_line) = 0 THEN
      v_address_line := NULL;
    END IF;
  ELSE
    v_address_line := NULL;
  END IF;

  -- ── Guard 10: no-op check ─────────────────────────────────
  -- All four fields are semantically identical to current values.
  -- NULL site_code / address_line is treated as "clear" — compare
  -- to current value using IS NOT DISTINCT FROM (NULL-safe equality).
  IF v_name IS NOT DISTINCT FROM v_site_name
     AND v_city IS NOT DISTINCT FROM v_site_city
     AND v_site_code IS NOT DISTINCT FROM v_site_code_cur
     AND v_address_line IS NOT DISTINCT FROM v_site_addr_cur THEN
    RETURN pg_catalog.jsonb_build_object('ok', true, 'reason', 'no_change');
  END IF;

  -- ── Mutation ───────────────────────────────────────────────
  -- Executes as postgres (SECURITY DEFINER). RLS not applied.
  -- updated_at is refreshed by the enterprise_sites_updated_at trigger.
  UPDATE public.enterprise_sites
  SET name = v_name,
      city = v_city,
      site_code = v_site_code,
      address_line = v_address_line
  WHERE id = p_site_id;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'site_id', p_site_id,
    'enterprise_id', p_enterprise_id
  );

EXCEPTION
  -- Unique violation on (enterprise_id, site_code) partial index
  -- uq_es_enterprise_site_code in 7c13a2.
  WHEN unique_violation THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_code_exists');

  WHEN OTHERS THEN
    RAISE WARNING '[update_enterprise_site] error: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'internal_error');
END;
$$;

-- ════════════════════════════════════════════════════════════
-- SECTION 2: set_enterprise_site_status() RPC
--
-- PURPOSE
-- Allow an active owner or admin to activate or deactivate
-- an enterprise site.
-- Status vocabulary: 'active' | 'inactive' (from 7c13a2 CHECK).
-- Deactivation semantics: status='inactive'.
-- enterprise_request_context rows for this site are preserved
-- (FK ON DELETE RESTRICT; historical audit trail intact).
-- create_enterprise_request Guard 7 enforces site_inactive for
-- new request creation — DO NOT modify 7c13a3.
--
-- GUARD SEQUENCE
-- Guard 1: auth.uid() not NULL → unauthenticated
-- Guard 2: Validate p_status IN ('active','inactive') → invalid_status
-- Guard 3: enterprise_accounts FOR UPDATE lock
-- Guard 4: Caller membership check:
--          not_a_member / caller_not_active / forbidden
-- Guard 5: Site exists AND belongs to enterprise:
--          site_not_found / site_enterprise_mismatch
-- Guard 6: No-op (already at target status) → no_change (ok:true)
-- Guard 7: UPDATE enterprise_sites SET status
--
-- RETURN SHAPE
-- Success: {"ok": true, "site_id": "", "new_status": ""}
-- No-op:   {"ok": true, "reason": "no_change"}
-- Failure: {"ok": false, "reason": "<code>"}
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_enterprise_site_status(
  p_enterprise_id uuid,
  p_site_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_caller_stat text;
  v_site_eid uuid;
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
    AND em.user_id = v_caller_id;

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
  IF v_site_status = p_status THEN
    RETURN pg_catalog.jsonb_build_object('ok', true, 'reason', 'no_change');
  END IF;

  -- ── Mutation ───────────────────────────────────────────────
  -- Executes as postgres (SECURITY DEFINER). RLS not applied.
  -- updated_at refreshed by enterprise_sites_updated_at trigger.
  -- enterprise_request_context rows are NOT deleted — FK ON DELETE
  -- RESTRICT in 7c13a3 prevents it; historical rows stay intact.
  UPDATE public.enterprise_sites
  SET status = p_status
  WHERE id = p_site_id;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'site_id', p_site_id,
    'new_status', p_status
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[set_enterprise_site_status] error: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'internal_error');
END;
$$;

-- ════════════════════════════════════════════════════════════
-- SECTION 3: Revoke direct UPDATE on enterprise_sites
--
-- Background (7c13a2):
-- The original migration granted UPDATE(name,site_code,address_line,city,status)
-- to authenticated alongside the es_manager_update RLS policy.
-- Now that dedicated RPCs gate all site mutations with explicit
-- guard sequences, the column-level UPDATE grant is no longer
-- needed and represents unnecessary attack surface.
--
-- After this REVOKE, enterprise_sites is effectively read-only
-- for authenticated — all mutations MUST go through the
-- SECURITY DEFINER RPCs (create_enterprise_site, update_enterprise_site,
-- set_enterprise_site_status).
-- SELECT is preserved (needed by es_members_select RLS policy
-- and for dashboard reads).
--
-- NOTE: es_manager_update RLS policy (from 7c13a2) is preserved.
-- It now has no practical effect for authenticated because the
-- table-level UPDATE grant is revoked. However, it stays in place
-- to document intent and does not interfere. Service_role
-- (postgres) bypasses RLS regardless.
-- ════════════════════════════════════════════════════════════

-- Remove table-level UPDATE privilege from authenticated.
REVOKE UPDATE ON public.enterprise_sites FROM authenticated;

-- Remove the column-level UPDATE privileges inherited from 7c13a2.
-- PostgreSQL tracks table-level and column-level grants independently,
-- so the explicit column REVOKE is required to fully close direct writes.
REVOKE UPDATE (
  name,
  site_code,
  address_line,
  city,
  status
) ON public.enterprise_sites FROM authenticated;

-- Reaffirm SELECT explicitly (in case any prior REVOKE ALL was partial).
GRANT SELECT ON public.enterprise_sites TO authenticated;

-- authenticated now has no direct UPDATE path on enterprise_sites.
-- All site mutations go through the SECURITY DEFINER RPCs only.

DO $$ BEGIN RAISE NOTICE '7c15a2 SECTION 3 — REVOKE UPDATE on enterprise_sites FROM authenticated complete'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 4: Grants for both RPCs
--
-- Pattern: same as 7c15a1 (BP08B) and 7c13a2.
-- REVOKE from PUBLIC and anon, GRANT to authenticated only.
-- ════════════════════════════════════════════════════════════

-- update_enterprise_site
REVOKE EXECUTE ON FUNCTION public.update_enterprise_site(uuid, uuid, text, text, text, text)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_enterprise_site(uuid, uuid, text, text, text, text)
  FROM anon;
GRANT  EXECUTE ON FUNCTION public.update_enterprise_site(uuid, uuid, text, text, text, text)
  TO authenticated;

-- set_enterprise_site_status
REVOKE EXECUTE ON FUNCTION public.set_enterprise_site_status(uuid, uuid, text)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_enterprise_site_status(uuid, uuid, text)
  FROM anon;
GRANT  EXECUTE ON FUNCTION public.set_enterprise_site_status(uuid, uuid, text)
  TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c15a2 SECTION 4 — RPC grants applied for both site-control RPCs'; END $$;


-- ════════════════════════════════════════════════════════════
-- FINAL STATUS
-- ════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '7C.15A.2 Enterprise Site Control Plane — complete.';
  RAISE NOTICE '';
  RAISE NOTICE 'New RPCs (public schema, PostgREST-exposed, authenticated only):';
  RAISE NOTICE '  update_enterprise_site(eid, sid, name, city[, site_code[, address_line]])';
  RAISE NOTICE '  set_enterprise_site_status(eid, sid, status)';
  RAISE NOTICE '';
  RAISE NOTICE 'Privilege change:';
  RAISE NOTICE '  REVOKE UPDATE ON enterprise_sites FROM authenticated';
  RAISE NOTICE '  All site mutations now go through SECURITY DEFINER RPCs only';
  RAISE NOTICE '';
  RAISE NOTICE 'Deactivation semantics:';
  RAISE NOTICE '  status=inactive; enterprise_request_context rows intact';
  RAISE NOTICE '  create_enterprise_request Guard 7 (site_inactive) unchanged';
  RAISE NOTICE '';
  RAISE NOTICE 'Audit: DEFERRED to BP08D';
  RAISE NOTICE 'Physical DELETE RPC: NOT PROVIDED';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables modified:         NONE';
  RAISE NOTICE 'Existing RLS modified:   NONE';
  RAISE NOTICE 'Existing RPCs modified:  NONE';
  RAISE NOTICE 'Existing triggers modified: NONE';
  RAISE NOTICE '';
  RAISE NOTICE 'Production migration complete.';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
END $$;

COMMIT;
