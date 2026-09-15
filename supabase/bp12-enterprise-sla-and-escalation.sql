-- =============================================================================
-- FIXEO ENTERPRISE — BP12 — DRAFT v1
-- Enterprise SLA Policy, Immutable Request Snapshot & Derived SLA Status
--
-- STATUS:
--   DRAFT FOR STATIC AUDIT ONLY — DO NOT APPLY TO PRODUCTION.
--
-- Frozen V1 contract:
--   * Canonical request linkage remains enterprise_request_context.
--   * No service_requests.enterprise_site_id.
--   * No parallel request/mission lifecycle.
--   * SLA policies are configuration; each Enterprise request receives one
--     immutable SLA snapshot at creation.
--   * Site-specific policy overrides Enterprise-wide policy.
--   * Urgency-specific policy overrides default policy within the same scope.
--   * If no active override matches, FIXEO defaults apply automatically:
--       urgent = 15 min, high = 30 min, normal = 120 min, low = 240 min.
--   * First acceptance is MIN(missions.accepted_at).
--   * SLA state is derived, not independently mutable.
--   * at_risk = 75% of acceptance target; breach = 100%.
--   * No automatic WhatsApp/SMS/email or dispatch mutation in BP12 V1.
--   * All active Enterprise members may read SLA snapshots/results for their
--     own tenant. No cross-tenant visibility.
--   * Snapshot rows are not user-updatable/deletable.
--   * Account + site must be active when a new Enterprise request is created.
--
-- IMPORTANT COMPATIBILITY DECISION:
--   Production service_requests.urgency is constrained to:
--       NULL | normale | urgent | now
--   and current rows use those values.
--   Therefore BP12 DOES NOT rewrite that canonical vocabulary.
--
--   SLA urgency policy vocabulary is normalized separately:
--       normal -> canonical request urgency 'normale' (and NULL)
--       high   -> canonical request urgency 'urgent'
--       urgent -> canonical request urgency 'now'
--       NULL   -> default policy
--
--   'low' remains a valid SLA policy vocabulary value for future-compatible
--   configuration, but current create_enterprise_request() has no canonical
--   service_requests urgency value that resolves to 'low'. This draft does not
--   invent one or alter existing request callers.
--
-- This migration MUST pass static audit + dedicated production read-only
-- precheck before any APPLY.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Hard preconditions: fail closed if the production contract drifted.
-- -----------------------------------------------------------------------------
DO $bp12_preconditions$
DECLARE
  v_urgency_constraint text;
BEGIN
  IF pg_catalog.to_regclass('public.enterprise_accounts') IS NULL
     OR pg_catalog.to_regclass('public.enterprise_members') IS NULL
     OR pg_catalog.to_regclass('public.enterprise_sites') IS NULL
     OR pg_catalog.to_regclass('public.enterprise_request_context') IS NULL
     OR pg_catalog.to_regclass('public.enterprise_audit_events') IS NULL
     OR pg_catalog.to_regclass('public.service_requests') IS NULL
     OR pg_catalog.to_regclass('public.missions') IS NULL
  THEN
    RAISE EXCEPTION 'bp12_precondition_missing_canonical_relation';
  END IF;

  IF pg_catalog.to_regclass('public.enterprise_sla_policies') IS NOT NULL
     OR pg_catalog.to_regclass('public.enterprise_request_sla') IS NOT NULL
     OR pg_catalog.to_regclass('public.enterprise_sla_status') IS NOT NULL
  THEN
    RAISE EXCEPTION 'bp12_precondition_sla_object_collision';
  END IF;

  IF pg_catalog.to_regprocedure(
       'public.create_enterprise_request(uuid,uuid,text,text,text)'
     ) IS NULL
  THEN
    RAISE EXCEPTION 'bp12_precondition_create_request_rpc_missing';
  END IF;

  IF pg_catalog.to_regprocedure(
       'fixeo_private._write_enterprise_audit_event(uuid,text,text,uuid,jsonb,jsonb,jsonb)'
     ) IS NULL
  THEN
    RAISE EXCEPTION 'bp12_precondition_audit_writer_missing';
  END IF;

  IF pg_catalog.to_regprocedure(
       'fixeo_private._fixeo_is_enterprise_member(uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'fixeo_private._fixeo_is_enterprise_manager(uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'fixeo_private._fixeo_is_admin()'
     ) IS NULL
  THEN
    RAISE EXCEPTION 'bp12_precondition_access_helper_missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='service_requests'
      AND column_name='enterprise_site_id'
  ) THEN
    RAISE EXCEPTION 'bp12_precondition_duplicate_site_source_detected';
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(c.oid, true)
  INTO v_urgency_constraint
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid=pg_catalog.to_regclass('public.service_requests')
    AND c.conname='service_requests_urgency_check'
    AND c.contype='c';

  IF v_urgency_constraint IS NULL
     OR v_urgency_constraint NOT ILIKE '%normale%'
     OR v_urgency_constraint NOT ILIKE '%urgent%'
     OR v_urgency_constraint NOT ILIKE '%now%'
  THEN
    RAISE EXCEPTION 'bp12_precondition_request_urgency_contract_drift';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname='public'
      AND (
        (tablename='enterprise_sla_policies'
         AND policyname IN (
           'esp_deny_anon',
           'esp_fixeo_admin_all',
           'esp_members_select',
           'esp_manager_insert',
           'esp_manager_update'
         ))
        OR
        (tablename='enterprise_request_sla'
         AND policyname IN (
           'ers_deny_anon',
           'ers_fixeo_admin_select',
           'ers_members_select'
         ))
      )
  ) THEN
    RAISE EXCEPTION 'bp12_precondition_policy_collision';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname='get_enterprise_sla_summary'
  ) THEN
    RAISE EXCEPTION 'bp12_precondition_summary_rpc_collision';
  END IF;
END
$bp12_preconditions$;

-- -----------------------------------------------------------------------------
-- 1. Extend the EXISTING audit vocabulary additively.
--    Preserve every current production value exactly.
-- -----------------------------------------------------------------------------
ALTER TABLE public.enterprise_audit_events
  DROP CONSTRAINT enterprise_audit_events_event_type_chk;

ALTER TABLE public.enterprise_audit_events
  ADD CONSTRAINT enterprise_audit_events_event_type_chk
  CHECK (event_type = ANY (ARRAY[
    'member.role_updated'::text,
    'member.status_updated'::text,
    'site.created'::text,
    'site.updated'::text,
    'site.status_updated'::text,
    'request.created'::text,
    'account.created'::text,
    'account.updated'::text,
    'member.invited'::text,
    'member.invitation_accepted'::text,
    'member.invitation_revoked'::text,
    'member.invitation_expired'::text,
    'account.status_updated'::text,
    'account.ownership_transferred'::text,
    'sla.policy_created'::text,
    'sla.policy_updated'::text,
    'sla.snapshot_created'::text
  ]));

-- -----------------------------------------------------------------------------
-- 2. SLA policy configuration.
--    site_id NULL = Enterprise-wide policy.
--    urgency NULL = default policy for that scope.
-- -----------------------------------------------------------------------------
CREATE TABLE public.enterprise_sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL,
  site_id uuid NULL,
  urgency text NULL,
  acceptance_target_minutes integer NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),

  CONSTRAINT enterprise_sla_policies_enterprise_fk
    FOREIGN KEY (enterprise_id)
    REFERENCES public.enterprise_accounts(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,

  CONSTRAINT enterprise_sla_policies_site_fk
    FOREIGN KEY (site_id)
    REFERENCES public.enterprise_sites(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,

  CONSTRAINT enterprise_sla_policies_created_by_fk
    FOREIGN KEY (created_by)
    REFERENCES public.users(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,

  CONSTRAINT enterprise_sla_policies_urgency_chk
    CHECK (urgency IS NULL OR urgency IN ('urgent','high','normal','low')),

  CONSTRAINT enterprise_sla_policies_target_chk
    CHECK (acceptance_target_minutes > 0),

  CONSTRAINT enterprise_sla_policies_status_chk
    CHECK (status IN ('active','inactive'))
);

-- One policy per scope + urgency, including NULL/default semantics.
CREATE UNIQUE INDEX enterprise_sla_policies_scope_urgency_uq
  ON public.enterprise_sla_policies (
    enterprise_id,
    COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(urgency, '__default__'::text)
  );

CREATE INDEX idx_enterprise_sla_policies_enterprise
  ON public.enterprise_sla_policies (enterprise_id, status);

CREATE INDEX idx_enterprise_sla_policies_site
  ON public.enterprise_sla_policies (site_id, status)
  WHERE site_id IS NOT NULL;

-- Prevent cross-tenant site policies even for trusted/direct writes.
CREATE OR REPLACE FUNCTION fixeo_private._bp12_validate_sla_policy_site()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_site_enterprise uuid;
BEGIN
  IF NEW.site_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT es.enterprise_id
  INTO v_site_enterprise
  FROM public.enterprise_sites es
  WHERE es.id=NEW.site_id;

  IF v_site_enterprise IS NULL THEN
    RAISE EXCEPTION 'sla_policy_site_not_found';
  END IF;

  IF v_site_enterprise <> NEW.enterprise_id THEN
    RAISE EXCEPTION 'sla_policy_site_enterprise_mismatch';
  END IF;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION fixeo_private._bp12_validate_sla_policy_site() OWNER TO postgres;
REVOKE ALL ON FUNCTION fixeo_private._bp12_validate_sla_policy_site()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER bp12_validate_sla_policy_site
BEFORE INSERT OR UPDATE OF enterprise_id,site_id
ON public.enterprise_sla_policies
FOR EACH ROW
EXECUTE FUNCTION fixeo_private._bp12_validate_sla_policy_site();

-- updated_at is server-owned.
CREATE OR REPLACE FUNCTION fixeo_private._bp12_touch_sla_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$function$;

ALTER FUNCTION fixeo_private._bp12_touch_sla_policy() OWNER TO postgres;
REVOKE ALL ON FUNCTION fixeo_private._bp12_touch_sla_policy()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER bp12_touch_sla_policy
BEFORE UPDATE ON public.enterprise_sla_policies
FOR EACH ROW
EXECUTE FUNCTION fixeo_private._bp12_touch_sla_policy();

-- -----------------------------------------------------------------------------
-- 3. Immutable per-request SLA snapshot.
--    This is the contractual SLA attached at request creation.
-- -----------------------------------------------------------------------------
CREATE TABLE public.enterprise_request_sla (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id uuid NOT NULL,
  enterprise_id uuid NOT NULL,
  site_id uuid NOT NULL,
  policy_id uuid NULL,
  policy_urgency text NULL,
  request_urgency text NULL,
  acceptance_target_minutes integer NOT NULL,
  started_at timestamptz NOT NULL,
  at_risk_at timestamptz NOT NULL,
  due_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),

  CONSTRAINT enterprise_request_sla_request_uq
    UNIQUE (service_request_id),

  CONSTRAINT enterprise_request_sla_request_fk
    FOREIGN KEY (service_request_id)
    REFERENCES public.service_requests(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,

  CONSTRAINT enterprise_request_sla_enterprise_fk
    FOREIGN KEY (enterprise_id)
    REFERENCES public.enterprise_accounts(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,

  CONSTRAINT enterprise_request_sla_site_fk
    FOREIGN KEY (site_id)
    REFERENCES public.enterprise_sites(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,

  CONSTRAINT enterprise_request_sla_policy_fk
    FOREIGN KEY (policy_id)
    REFERENCES public.enterprise_sla_policies(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,

  CONSTRAINT enterprise_request_sla_policy_urgency_chk
    CHECK (
      policy_urgency IS NULL
      OR policy_urgency IN ('urgent','high','normal','low')
    ),

  CONSTRAINT enterprise_request_sla_request_urgency_chk
    CHECK (
      request_urgency IS NULL
      OR request_urgency IN ('normale','urgent','now')
    ),

  CONSTRAINT enterprise_request_sla_target_chk
    CHECK (acceptance_target_minutes > 0),

  CONSTRAINT enterprise_request_sla_deadline_order_chk
    CHECK (started_at <= at_risk_at AND at_risk_at <= due_at)
);

CREATE INDEX idx_enterprise_request_sla_enterprise_created
  ON public.enterprise_request_sla (enterprise_id, created_at DESC);

CREATE INDEX idx_enterprise_request_sla_site_created
  ON public.enterprise_request_sla (site_id, created_at DESC);

CREATE INDEX idx_enterprise_request_sla_due
  ON public.enterprise_request_sla (due_at);

-- Absolute immutability: no UPDATE/DELETE, even trusted application roles.
CREATE OR REPLACE FUNCTION fixeo_private._bp12_reject_request_sla_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION 'enterprise_request_sla_is_immutable';
END;
$function$;

ALTER FUNCTION fixeo_private._bp12_reject_request_sla_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION fixeo_private._bp12_reject_request_sla_mutation()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER bp12_reject_request_sla_mutation
BEFORE UPDATE OR DELETE ON public.enterprise_request_sla
FOR EACH ROW
EXECUTE FUNCTION fixeo_private._bp12_reject_request_sla_mutation();

-- -----------------------------------------------------------------------------
-- 4. RLS and direct privileges.
-- -----------------------------------------------------------------------------
ALTER TABLE public.enterprise_sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_request_sla ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.enterprise_sla_policies FROM PUBLIC, anon;
REVOKE ALL ON public.enterprise_request_sla FROM PUBLIC, anon;

-- Policy configuration:
-- active members read; managers configure; FIXEO admin retains control.
GRANT SELECT, INSERT, UPDATE ON public.enterprise_sla_policies TO authenticated;
REVOKE DELETE ON public.enterprise_sla_policies FROM authenticated;

CREATE POLICY esp_deny_anon
ON public.enterprise_sla_policies
AS PERMISSIVE FOR ALL TO anon
USING (false) WITH CHECK (false);

CREATE POLICY esp_fixeo_admin_all
ON public.enterprise_sla_policies
AS PERMISSIVE FOR ALL TO authenticated
USING (fixeo_private._fixeo_is_admin())
WITH CHECK (fixeo_private._fixeo_is_admin());

CREATE POLICY esp_members_select
ON public.enterprise_sla_policies
AS PERMISSIVE FOR SELECT TO authenticated
USING (fixeo_private._fixeo_is_enterprise_member(enterprise_id));

CREATE POLICY esp_manager_insert
ON public.enterprise_sla_policies
AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (
  fixeo_private._fixeo_is_enterprise_manager(enterprise_id)
  AND status IN ('active','inactive')
);

CREATE POLICY esp_manager_update
ON public.enterprise_sla_policies
AS PERMISSIVE FOR UPDATE TO authenticated
USING (fixeo_private._fixeo_is_enterprise_manager(enterprise_id))
WITH CHECK (
  fixeo_private._fixeo_is_enterprise_manager(enterprise_id)
  AND status IN ('active','inactive')
);

-- Snapshots: SELECT only for active tenant members and FIXEO admin.
GRANT SELECT ON public.enterprise_request_sla TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.enterprise_request_sla FROM authenticated;

CREATE POLICY ers_deny_anon
ON public.enterprise_request_sla
AS PERMISSIVE FOR ALL TO anon
USING (false) WITH CHECK (false);

CREATE POLICY ers_fixeo_admin_select
ON public.enterprise_request_sla
AS PERMISSIVE FOR SELECT TO authenticated
USING (fixeo_private._fixeo_is_admin());

CREATE POLICY ers_members_select
ON public.enterprise_request_sla
AS PERMISSIVE FOR SELECT TO authenticated
USING (fixeo_private._fixeo_is_enterprise_member(enterprise_id));

-- -----------------------------------------------------------------------------
-- 5. Derived SLA status view.
--    No persisted lifecycle. First acceptance = MIN(missions.accepted_at).
--    Safe join direction: missions.request_id TEXT = service_request_id::TEXT.
-- -----------------------------------------------------------------------------
CREATE VIEW public.enterprise_sla_status
WITH (security_invoker=true)
AS
WITH first_acceptance AS (
  SELECT
    ers.service_request_id,
    pg_catalog.min(m.accepted_at) AS first_accepted_at
  FROM public.enterprise_request_sla ers
  LEFT JOIN public.missions m
    ON m.request_id = ers.service_request_id::text
   AND m.accepted_at IS NOT NULL
  GROUP BY ers.service_request_id
)
SELECT
  ers.id AS request_sla_id,
  ers.service_request_id,
  ers.enterprise_id,
  ers.site_id,
  ers.policy_id,
  ers.policy_urgency,
  ers.request_urgency,
  ers.acceptance_target_minutes,
  ers.started_at,
  ers.at_risk_at,
  ers.due_at,
  fa.first_accepted_at,
  CASE
    WHEN fa.first_accepted_at IS NOT NULL
         AND fa.first_accepted_at <= ers.due_at
      THEN 'MET'
    WHEN fa.first_accepted_at IS NOT NULL
         AND fa.first_accepted_at > ers.due_at
      THEN 'BREACHED'
    WHEN pg_catalog.now() >= ers.due_at
      THEN 'BREACHED'
    WHEN pg_catalog.now() >= ers.at_risk_at
      THEN 'AT_RISK'
    ELSE 'ON_TRACK'
  END::text AS sla_status,
  CASE
    WHEN fa.first_accepted_at IS NOT NULL
      THEN GREATEST(
        0,
        EXTRACT(
          epoch FROM (fa.first_accepted_at - ers.started_at)
        ) / 60.0
      )
    ELSE NULL
  END AS first_acceptance_minutes,
  CASE
    WHEN fa.first_accepted_at IS NOT NULL
         AND fa.first_accepted_at > ers.due_at
      THEN EXTRACT(
        epoch FROM (fa.first_accepted_at - ers.due_at)
      ) / 60.0
    WHEN fa.first_accepted_at IS NULL
         AND pg_catalog.now() > ers.due_at
      THEN EXTRACT(
        epoch FROM (pg_catalog.now() - ers.due_at)
      ) / 60.0
    ELSE 0
  END AS breach_minutes
FROM public.enterprise_request_sla ers
LEFT JOIN first_acceptance fa
  ON fa.service_request_id=ers.service_request_id;

REVOKE ALL ON public.enterprise_sla_status FROM PUBLIC, anon;
GRANT SELECT ON public.enterprise_sla_status TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. Source-preserving rewrite of create_enterprise_request().
--
-- Existing auth/account/member/site/input semantics are preserved.
-- Existing service_requests urgency vocabulary is preserved.
-- New atomic behavior:
--   service_request -> enterprise_request_context -> SLA snapshot -> audits
--
-- Policy resolution order:
--   1 site + urgency
--   2 site + default
--   3 enterprise + urgency
--   4 enterprise + default
--
-- No active policy => built-in FIXEO default is applied atomically.
-- Defaults: urgent 15m / high 30m / normal 120m / low 240m.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_enterprise_request(
  p_enterprise_id uuid,
  p_site_id uuid,
  p_service_category text,
  p_description text,
  p_urgency text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller_id          uuid;
  v_caller_exists      boolean;
  v_enterprise_active  boolean;
  v_enterprise_status  text;
  v_authorized         boolean;
  v_site_enterprise    uuid;
  v_site_status        text;
  v_city               text;
  v_service_category   text;
  v_description        text;
  v_urgency            text;
  v_sla_urgency        text;
  v_sr_id              uuid;
  v_ctx_id             uuid;
  v_policy_id           uuid;
  v_policy_urgency      text;
  v_target_minutes      integer;
  v_started_at          timestamptz;
  v_at_risk_at          timestamptz;
  v_due_at              timestamptz;
  v_request_sla_id      uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = v_caller_id
  ) INTO v_caller_exists;

  IF NOT COALESCE(v_caller_exists, false) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;

  IF p_enterprise_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'enterprise_required');
  END IF;

  IF p_site_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_required');
  END IF;

  -- Preserve serialization against account lifecycle transitions.
  SELECT ea.status
  INTO v_enterprise_status
  FROM public.enterprise_accounts ea
  WHERE ea.id = p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'enterprise_not_found');
  END IF;

  v_enterprise_active := (v_enterprise_status = 'active');

  IF NOT COALESCE(v_enterprise_active, false) THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'enterprise_not_active',
      'enterprise_status', v_enterprise_status
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.enterprise_members em
    WHERE em.enterprise_id = p_enterprise_id
      AND em.user_id = v_caller_id
      AND em.status = 'active'
      AND em.role IN (
        'owner',
        'admin',
        'operations_manager',
        'site_manager',
        'reporter'
      )
  ) INTO v_authorized;

  IF NOT COALESCE(v_authorized, false) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  SELECT es.enterprise_id, es.status, es.city
  INTO v_site_enterprise, v_site_status, v_city
  FROM public.enterprise_sites es
  WHERE es.id = p_site_id
  FOR SHARE;

  IF v_site_enterprise IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_not_found');
  END IF;

  IF v_site_enterprise <> p_enterprise_id THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_enterprise_mismatch');
  END IF;

  IF v_site_status <> 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_inactive');
  END IF;

  IF p_service_category IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(p_service_category)) < 1
  THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'service_category_required');
  END IF;

  v_service_category := pg_catalog.btrim(p_service_category);

  IF p_description IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(p_description)) < 1
  THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'description_required');
  END IF;

  v_description := pg_catalog.btrim(p_description);

  IF p_urgency IS NOT NULL THEN
    IF p_urgency NOT IN ('normale', 'urgent', 'now') THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'urgency_invalid');
    END IF;
    v_urgency := p_urgency;
  ELSE
    v_urgency := NULL;
  END IF;

  -- Compatibility normalization used ONLY for SLA policy lookup.
  v_sla_urgency := CASE v_urgency
    WHEN 'now' THEN 'urgent'
    WHEN 'urgent' THEN 'high'
    WHEN 'normale' THEN 'normal'
    ELSE 'normal'
  END;

  -- Lock the selected policy so its contractual values cannot change between
  -- resolution and snapshot insertion.
  SELECT p.id, p.urgency, p.acceptance_target_minutes
  INTO v_policy_id, v_policy_urgency, v_target_minutes
  FROM public.enterprise_sla_policies p
  WHERE p.enterprise_id=p_enterprise_id
    AND p.status='active'
    AND (p.site_id=p_site_id OR p.site_id IS NULL)
    AND (p.urgency=v_sla_urgency OR p.urgency IS NULL)
  ORDER BY
    CASE WHEN p.site_id=p_site_id THEN 0 ELSE 1 END,
    CASE WHEN p.urgency=v_sla_urgency THEN 0 ELSE 1 END
  LIMIT 1
  FOR SHARE;

  IF v_policy_id IS NULL THEN
    -- Built-in FIXEO defaults: no manual SLA configuration is required.
    -- policy_id remains NULL to make the default source explicit in the
    -- immutable snapshot.
    v_policy_urgency := v_sla_urgency;
    v_target_minutes := CASE v_sla_urgency
      WHEN 'urgent' THEN 15
      WHEN 'high'   THEN 30
      WHEN 'normal' THEN 120
      WHEN 'low'    THEN 240
      ELSE NULL
    END;

    IF v_target_minutes IS NULL THEN
      RAISE EXCEPTION 'bp12_unmapped_sla_urgency';
    END IF;
  END IF;

  INSERT INTO public.service_requests (
    service_category,
    city,
    description,
    urgency,
    client_profile_id,
    status
  )
  VALUES (
    v_service_category,
    v_city,
    v_description,
    v_urgency,
    NULL,
    'new'
  )
  RETURNING id, created_at
  INTO v_sr_id, v_started_at;

  -- Defensive fallback only if legacy created_at were ever NULL.
  v_started_at := COALESCE(v_started_at, pg_catalog.now());

  INSERT INTO public.enterprise_request_context (
    enterprise_id,
    site_id,
    service_request_id,
    created_by
  )
  VALUES (
    p_enterprise_id,
    p_site_id,
    v_sr_id,
    v_caller_id
  )
  RETURNING id INTO v_ctx_id;

  v_at_risk_at :=
    v_started_at
    + (pg_catalog.make_interval(mins => v_target_minutes) * 0.75);

  v_due_at :=
    v_started_at
    + pg_catalog.make_interval(mins => v_target_minutes);

  INSERT INTO public.enterprise_request_sla (
    service_request_id,
    enterprise_id,
    site_id,
    policy_id,
    policy_urgency,
    request_urgency,
    acceptance_target_minutes,
    started_at,
    at_risk_at,
    due_at
  )
  VALUES (
    v_sr_id,
    p_enterprise_id,
    p_site_id,
    v_policy_id,
    v_policy_urgency,
    v_urgency,
    v_target_minutes,
    v_started_at,
    v_at_risk_at,
    v_due_at
  )
  RETURNING id INTO v_request_sla_id;

  -- Preserve existing request.created audit event.
  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'request.created',
    'service_request',
    v_sr_id,
    NULL,
    pg_catalog.jsonb_build_object(
      'service_request_id', v_sr_id,
      'enterprise_request_context_id', v_ctx_id,
      'site_id', p_site_id,
      'service_category', v_service_category,
      'urgency', v_urgency
    ),
    pg_catalog.jsonb_build_object(
      'enterprise_request_context_id', v_ctx_id
    )
  );

  -- Add immutable SLA snapshot audit.
  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'sla.snapshot_created',
    'service_request',
    v_sr_id,
    NULL,
    pg_catalog.jsonb_build_object(
      'request_sla_id', v_request_sla_id,
      'policy_id', v_policy_id,
      'policy_source',
        CASE WHEN v_policy_id IS NULL THEN 'fixeo_default' ELSE 'enterprise_policy' END,
      'policy_urgency', v_policy_urgency,
      'request_urgency', v_urgency,
      'acceptance_target_minutes', v_target_minutes,
      'started_at', v_started_at,
      'at_risk_at', v_at_risk_at,
      'due_at', v_due_at
    ),
    pg_catalog.jsonb_build_object(
      'enterprise_request_context_id', v_ctx_id,
      'site_id', p_site_id
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'service_request_id', v_sr_id,
    'enterprise_request_context_id', v_ctx_id,
    'enterprise_id', p_enterprise_id,
    'site_id', p_site_id,
    'request_sla_id', v_request_sla_id,
    'sla_policy_id', v_policy_id,
    'sla_policy_source',
      CASE WHEN v_policy_id IS NULL THEN 'fixeo_default' ELSE 'enterprise_policy' END,
    'sla_status', 'ON_TRACK',
    'sla_at_risk_at', v_at_risk_at,
    'sla_due_at', v_due_at
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[create_enterprise_request] unexpected error: % (SQLSTATE: %)',
      SQLERRM, SQLSTATE;

    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'internal_error'
    );
END;
$function$;

ALTER FUNCTION public.create_enterprise_request(
  uuid,uuid,text,text,text
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.create_enterprise_request(
  uuid,uuid,text,text,text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_enterprise_request(
  uuid,uuid,text,text,text
) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. Read-only Enterprise SLA summary RPC.
--    Cancellation exclusion:
--      A request cancelled before first acceptance is excluded from eligibility.
--    No writes, no notification side effects, no dispatch side effects.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_enterprise_sla_summary(
  p_enterprise_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_from timestamptz := COALESCE(p_from, '-infinity'::timestamptz);
  v_to   timestamptz := COALESCE(p_to, 'infinity'::timestamptz);
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF p_enterprise_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_required');
  END IF;

  IF NOT (
    fixeo_private._fixeo_is_enterprise_member(p_enterprise_id)
    OR fixeo_private._fixeo_is_admin()
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  IF v_from > v_to THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_period');
  END IF;

  WITH first_acceptance AS (
    SELECT
      ers.service_request_id,
      pg_catalog.min(m.accepted_at) AS first_accepted_at
    FROM public.enterprise_request_sla ers
    LEFT JOIN public.missions m
      ON m.request_id=ers.service_request_id::text
     AND m.accepted_at IS NOT NULL
    WHERE ers.enterprise_id=p_enterprise_id
      AND ers.started_at >= v_from
      AND ers.started_at <= v_to
    GROUP BY ers.service_request_id
  ),
  eligible AS (
    SELECT
      ers.*,
      sr.status AS request_status,
      fa.first_accepted_at,
      CASE
        WHEN fa.first_accepted_at IS NOT NULL
             AND fa.first_accepted_at <= ers.due_at THEN 'MET'
        WHEN fa.first_accepted_at IS NOT NULL
             AND fa.first_accepted_at > ers.due_at THEN 'BREACHED'
        WHEN pg_catalog.now() >= ers.due_at THEN 'BREACHED'
        WHEN pg_catalog.now() >= ers.at_risk_at THEN 'AT_RISK'
        ELSE 'ON_TRACK'
      END AS state,
      CASE
        WHEN fa.first_accepted_at IS NOT NULL THEN
          GREATEST(
            0,
            EXTRACT(
              epoch FROM (fa.first_accepted_at-ers.started_at)
            ) / 60.0
          )
        ELSE NULL
      END AS acceptance_minutes
    FROM public.enterprise_request_sla ers
    JOIN public.service_requests sr ON sr.id=ers.service_request_id
    LEFT JOIN first_acceptance fa
      ON fa.service_request_id=ers.service_request_id
    WHERE ers.enterprise_id=p_enterprise_id
      AND ers.started_at >= v_from
      AND ers.started_at <= v_to
      AND NOT (
        fa.first_accepted_at IS NULL
        AND pg_catalog.lower(COALESCE(sr.status,'')) IN (
          'cancelled','canceled','annule','annulée','annulee'
        )
      )
  )
  SELECT pg_catalog.jsonb_build_object(
    'ok', true,
    'enterprise_id', p_enterprise_id,
    'from', p_from,
    'to', p_to,
    'eligible_count', pg_catalog.count(*),
    'met_count', pg_catalog.count(*) FILTER (WHERE state='MET'),
    'breached_count', pg_catalog.count(*) FILTER (WHERE state='BREACHED'),
    'on_track_count', pg_catalog.count(*) FILTER (WHERE state='ON_TRACK'),
    'at_risk_count', pg_catalog.count(*) FILTER (WHERE state='AT_RISK'),
    'sla_met_rate_percent',
      CASE
        WHEN pg_catalog.count(*) FILTER (
          WHERE state IN ('MET','BREACHED')
        ) = 0 THEN NULL
        ELSE pg_catalog.round(
          100.0
          * pg_catalog.count(*) FILTER (WHERE state='MET')
          / pg_catalog.count(*) FILTER (WHERE state IN ('MET','BREACHED')),
          2
        )
      END,
    'avg_first_acceptance_minutes',
      pg_catalog.round(
        pg_catalog.avg(acceptance_minutes)
          FILTER (WHERE acceptance_minutes IS NOT NULL),
        2
      )
  )
  INTO v_result
  FROM eligible;

  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.get_enterprise_sla_summary(
  uuid,timestamptz,timestamptz
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_enterprise_sla_summary(
  uuid,timestamptz,timestamptz
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_enterprise_sla_summary(
  uuid,timestamptz,timestamptz
) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 8. Final privilege hardening.
-- -----------------------------------------------------------------------------
REVOKE DELETE ON public.enterprise_sla_policies
  FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.enterprise_request_sla
  FROM PUBLIC, anon, authenticated;

COMMIT;

-- =============================================================================
-- END BP12 DRAFT v1
--
-- STATIC AUDIT MUST PROVE, at minimum:
--   A. No canonical urgency constraint/value was rewritten.
--   B. Existing create_enterprise_request auth/account/site/input behavior kept.
--   C. No service_requests.enterprise_site_id introduced.
--   D. Snapshot creation is atomic with request/context creation.
--   E. Snapshot UPDATE/DELETE impossible for application users.
--   F. Safe missions TEXT -> UUID-as-text join direction only.
--   G. Tenant isolation on policy/snapshot reads.
--   H. Summary RPC is read-only and tenant-isolated.
--   I. Existing audit vocabulary preserved + BP12 values added only.
--   J. No notification/dispatch side effect.
--   K. Site policy cannot reference a different Enterprise.
--   L. Policy resolution precedence is deterministic.
--   M. No matching policy resolves to FIXEO defaults:
--      urgent=15 / high=30 / normal=120 / low=240 minutes.
-- =============================================================================
