-- =============================================================================
-- FIXEO ENTERPRISE — BP15 — ENTERPRISE MEMBER <-> SITE ACCESS CONTROL
-- PRODUCTION VALIDATED — canonical BP15 migration
--
-- FROZEN CONTRACT
--   Global Enterprise roles:
--     owner, admin, operations_manager, reporter, viewer
--   Site-scoped role:
--     site_manager
--
--   Only owner/admin may mutate member<->site assignments.
--   A site_manager may access only explicitly assigned sites.
--   No historical backfill: Production precheck confirmed 0 Enterprise accounts,
--   members, sites, request contexts, SLA snapshots and SLA policies.
--
--   Out of scope:
--     billing/subscriptions, notifications, integrations/API keys/webhooks,
--     Enterprise settings, generic grant cleanup.
--
-- IMPORTANT
--   Production post-apply structure, RLS, ACL and contract checks validated.
-- =============================================================================

BEGIN;

-- 1. Assignment primitive ------------------------------------------------------

CREATE TABLE public.enterprise_member_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL,
  member_id uuid NOT NULL,
  site_id uuid NOT NULL,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT enterprise_member_sites_enterprise_fk
    FOREIGN KEY (enterprise_id)
    REFERENCES public.enterprise_accounts(id)
    ON UPDATE CASCADE ON DELETE CASCADE,

  CONSTRAINT enterprise_member_sites_member_fk
    FOREIGN KEY (member_id)
    REFERENCES public.enterprise_members(id)
    ON UPDATE CASCADE ON DELETE CASCADE,

  CONSTRAINT enterprise_member_sites_site_fk
    FOREIGN KEY (site_id)
    REFERENCES public.enterprise_sites(id)
    ON UPDATE CASCADE ON DELETE CASCADE,

  CONSTRAINT enterprise_member_sites_assigned_by_fk
    FOREIGN KEY (assigned_by)
    REFERENCES public.users(id)
    ON UPDATE CASCADE ON DELETE SET NULL,

  CONSTRAINT enterprise_member_sites_unique_assignment
    UNIQUE (enterprise_id, member_id, site_id)
);

CREATE INDEX idx_enterprise_member_sites_member
  ON public.enterprise_member_sites (enterprise_id, member_id);

CREATE INDEX idx_enterprise_member_sites_site
  ON public.enterprise_member_sites (enterprise_id, site_id);

ALTER TABLE public.enterprise_member_sites ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.enterprise_member_sites FROM PUBLIC;
REVOKE ALL ON TABLE public.enterprise_member_sites FROM anon;
REVOKE ALL ON TABLE public.enterprise_member_sites FROM authenticated;
GRANT SELECT ON TABLE public.enterprise_member_sites TO authenticated;


-- 2. Structural integrity trigger --------------------------------------------

CREATE OR REPLACE FUNCTION fixeo_private._bp15_validate_member_site_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_member_enterprise uuid;
  v_member_role text;
  v_member_status text;
  v_site_enterprise uuid;
BEGIN
  SELECT em.enterprise_id, em.role, em.status
  INTO v_member_enterprise, v_member_role, v_member_status
  FROM public.enterprise_members em
  WHERE em.id = NEW.member_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'enterprise_member_not_found';
  END IF;

  SELECT es.enterprise_id
  INTO v_site_enterprise
  FROM public.enterprise_sites es
  WHERE es.id = NEW.site_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'enterprise_site_not_found';
  END IF;

  IF v_member_enterprise <> NEW.enterprise_id
     OR v_site_enterprise <> NEW.enterprise_id
  THEN
    RAISE EXCEPTION 'enterprise_member_site_mismatch';
  END IF;

  IF v_member_role <> 'site_manager' THEN
    RAISE EXCEPTION 'member_role_not_site_manager';
  END IF;

  IF v_member_status <> 'active' THEN
    RAISE EXCEPTION 'member_not_active';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bp15_validate_member_site_assignment
ON public.enterprise_member_sites;

CREATE TRIGGER bp15_validate_member_site_assignment
BEFORE INSERT OR UPDATE OF enterprise_id, member_id, site_id
ON public.enterprise_member_sites
FOR EACH ROW
EXECUTE FUNCTION fixeo_private._bp15_validate_member_site_assignment();


-- Lifecycle contract: assignment rows are intentionally preserved when a member
-- becomes suspended/removed or changes away from site_manager. Such rows become
-- authorization-inert because effective access below requires active site_manager.
-- This preserves history and avoids hidden destructive coupling to Member Control Plane.

-- 3. Site-access helper --------------------------------------------------------

CREATE OR REPLACE FUNCTION fixeo_private._fixeo_can_access_enterprise_site(
  p_enterprise_id uuid,
  p_site_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    CASE
      WHEN auth.uid() IS NULL
        OR p_enterprise_id IS NULL
        OR p_site_id IS NULL
      THEN false

      WHEN fixeo_private._fixeo_is_admin()
      THEN EXISTS (
        SELECT 1
        FROM public.enterprise_sites es
        WHERE es.id = p_site_id
          AND es.enterprise_id = p_enterprise_id
      )

      ELSE EXISTS (
        SELECT 1
        FROM public.enterprise_members em
        JOIN public.enterprise_sites es
          ON es.id = p_site_id
         AND es.enterprise_id = em.enterprise_id
        WHERE em.enterprise_id = p_enterprise_id
          AND em.user_id = auth.uid()
          AND em.status = 'active'
          AND (
            em.role IN (
              'owner',
              'admin',
              'operations_manager',
              'reporter',
              'viewer'
            )
            OR (
              em.role = 'site_manager'
              AND EXISTS (
                SELECT 1
                FROM public.enterprise_member_sites ems
                WHERE ems.enterprise_id = p_enterprise_id
                  AND ems.member_id = em.id
                  AND ems.site_id = p_site_id
              )
            )
          )
      )
    END;
$function$;

ALTER FUNCTION fixeo_private._fixeo_can_access_enterprise_site(uuid,uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION fixeo_private._fixeo_can_access_enterprise_site(uuid,uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION fixeo_private._fixeo_can_access_enterprise_site(uuid,uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION fixeo_private._fixeo_can_access_enterprise_site(uuid,uuid)
  TO authenticated;


-- 4. RLS for assignment rows ---------------------------------------------------

CREATE POLICY enterprise_member_sites_fixeo_admin_select
ON public.enterprise_member_sites
FOR SELECT
TO authenticated
USING (fixeo_private._fixeo_is_admin());

CREATE POLICY enterprise_member_sites_members_select
ON public.enterprise_member_sites
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.enterprise_members caller
    WHERE caller.enterprise_id = enterprise_member_sites.enterprise_id
      AND caller.user_id = auth.uid()
      AND caller.status = 'active'
      AND (
        caller.role IN ('owner','admin')
        OR caller.id = enterprise_member_sites.member_id
      )
  )
);


-- 5. Audit vocabulary ----------------------------------------------------------

ALTER TABLE public.enterprise_audit_events
  DROP CONSTRAINT enterprise_audit_events_event_type_chk;

ALTER TABLE public.enterprise_audit_events
  ADD CONSTRAINT enterprise_audit_events_event_type_chk
  CHECK (
    event_type = ANY (
      ARRAY[
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
        'sla.snapshot_created'::text,
        'member.site_assigned'::text,
        'member.site_unassigned'::text
      ]
    )
  );

ALTER TABLE public.enterprise_audit_events
  DROP CONSTRAINT enterprise_audit_events_target_type_chk;

ALTER TABLE public.enterprise_audit_events
  ADD CONSTRAINT enterprise_audit_events_target_type_chk
  CHECK (
    target_type = ANY (
      ARRAY[
        'enterprise_member'::text,
        'enterprise_site'::text,
        'service_request'::text,
        'enterprise_account'::text,
        'enterprise_invitation'::text,
        'enterprise_member_site'::text
      ]
    )
  );


-- 6. Assignment mutation RPCs --------------------------------------------------

CREATE OR REPLACE FUNCTION public.assign_enterprise_member_site(
  p_enterprise_id uuid,
  p_member_id uuid,
  p_site_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_caller_status text;
  v_enterprise_status text;
  v_member_enterprise uuid;
  v_member_role text;
  v_member_status text;
  v_site_enterprise uuid;
  v_assignment_id uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF p_enterprise_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_required');
  END IF;
  IF p_member_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','member_required');
  END IF;
  IF p_site_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','site_required');
  END IF;

  SELECT ea.status INTO v_enterprise_status
  FROM public.enterprise_accounts ea
  WHERE ea.id=p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_found');
  END IF;

  IF v_enterprise_status <> 'active' THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',false,'reason','enterprise_not_active',
      'enterprise_status',v_enterprise_status
    );
  END IF;

  IF NOT fixeo_private._fixeo_is_admin() THEN
    SELECT em.role,em.status
    INTO v_caller_role,v_caller_status
    FROM public.enterprise_members em
    WHERE em.enterprise_id=p_enterprise_id
      AND em.user_id=v_caller_id;

    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'reason','not_a_member');
    END IF;

    IF v_caller_status <> 'active'
       OR v_caller_role NOT IN ('owner','admin')
    THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
    END IF;
  END IF;

  SELECT em.enterprise_id,em.role,em.status
  INTO v_member_enterprise,v_member_role,v_member_status
  FROM public.enterprise_members em
  WHERE em.id=p_member_id
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','member_not_found');
  END IF;

  IF v_member_enterprise <> p_enterprise_id THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','member_enterprise_mismatch');
  END IF;

  IF v_member_role <> 'site_manager' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','member_role_not_site_manager');
  END IF;

  IF v_member_status <> 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','member_not_active');
  END IF;

  SELECT es.enterprise_id
  INTO v_site_enterprise
  FROM public.enterprise_sites es
  WHERE es.id=p_site_id
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','site_not_found');
  END IF;

  IF v_site_enterprise <> p_enterprise_id THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','site_enterprise_mismatch');
  END IF;

  SELECT ems.id INTO v_assignment_id
  FROM public.enterprise_member_sites ems
  WHERE ems.enterprise_id=p_enterprise_id
    AND ems.member_id=p_member_id
    AND ems.site_id=p_site_id;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',true,'reason','already_assigned',
      'assignment_id',v_assignment_id
    );
  END IF;

  INSERT INTO public.enterprise_member_sites(
    enterprise_id,member_id,site_id,assigned_by
  )
  VALUES (
    p_enterprise_id,p_member_id,p_site_id,v_caller_id
  )
  RETURNING id INTO v_assignment_id;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'member.site_assigned',
    'enterprise_member_site',
    v_assignment_id,
    NULL,
    pg_catalog.jsonb_build_object(
      'assignment_id',v_assignment_id,
      'member_id',p_member_id,
      'site_id',p_site_id
    ),
    pg_catalog.jsonb_build_object(
      'member_id',p_member_id,
      'site_id',p_site_id
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,
    'assignment_id',v_assignment_id,
    'enterprise_id',p_enterprise_id,
    'member_id',p_member_id,
    'site_id',p_site_id
  );

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[assign_enterprise_member_site] error: % (SQLSTATE: %)',
    SQLERRM,SQLSTATE;
  RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;

ALTER FUNCTION public.assign_enterprise_member_site(uuid,uuid,uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assign_enterprise_member_site(uuid,uuid,uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_enterprise_member_site(uuid,uuid,uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_enterprise_member_site(uuid,uuid,uuid)
  TO authenticated;


CREATE OR REPLACE FUNCTION public.unassign_enterprise_member_site(
  p_enterprise_id uuid,
  p_member_id uuid,
  p_site_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_caller_status text;
  v_assignment_id uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF p_enterprise_id IS NULL OR p_member_id IS NULL OR p_site_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_arguments');
  END IF;

  IF NOT fixeo_private._fixeo_is_admin() THEN
    SELECT em.role,em.status
    INTO v_caller_role,v_caller_status
    FROM public.enterprise_members em
    WHERE em.enterprise_id=p_enterprise_id
      AND em.user_id=v_caller_id;

    IF NOT FOUND
       OR v_caller_status <> 'active'
       OR v_caller_role NOT IN ('owner','admin')
    THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
    END IF;
  END IF;

  SELECT ems.id
  INTO v_assignment_id
  FROM public.enterprise_member_sites ems
  WHERE ems.enterprise_id=p_enterprise_id
    AND ems.member_id=p_member_id
    AND ems.site_id=p_site_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',true,'reason','not_assigned');
  END IF;

  DELETE FROM public.enterprise_member_sites
  WHERE id=v_assignment_id;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'member.site_unassigned',
    'enterprise_member_site',
    v_assignment_id,
    pg_catalog.jsonb_build_object(
      'assignment_id',v_assignment_id,
      'member_id',p_member_id,
      'site_id',p_site_id
    ),
    NULL,
    pg_catalog.jsonb_build_object(
      'member_id',p_member_id,
      'site_id',p_site_id
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,
    'assignment_id',v_assignment_id,
    'enterprise_id',p_enterprise_id,
    'member_id',p_member_id,
    'site_id',p_site_id
  );

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[unassign_enterprise_member_site] error: % (SQLSTATE: %)',
    SQLERRM,SQLSTATE;
  RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;

ALTER FUNCTION public.unassign_enterprise_member_site(uuid,uuid,uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.unassign_enterprise_member_site(uuid,uuid,uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unassign_enterprise_member_site(uuid,uuid,uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.unassign_enterprise_member_site(uuid,uuid,uuid)
  TO authenticated;


-- 7. Site-scoped RLS -----------------------------------------------------------

DROP POLICY IF EXISTS es_members_select ON public.enterprise_sites;
CREATE POLICY es_members_select
ON public.enterprise_sites
FOR SELECT TO authenticated
USING (
  fixeo_private._fixeo_can_access_enterprise_site(enterprise_id,id)
);

DROP POLICY IF EXISTS erc_members_select ON public.enterprise_request_context;
CREATE POLICY erc_members_select
ON public.enterprise_request_context
FOR SELECT TO authenticated
USING (
  fixeo_private._fixeo_can_access_enterprise_site(enterprise_id,site_id)
);

DROP POLICY IF EXISTS ers_members_select ON public.enterprise_request_sla;
CREATE POLICY ers_members_select
ON public.enterprise_request_sla
FOR SELECT TO authenticated
USING (
  fixeo_private._fixeo_can_access_enterprise_site(enterprise_id,site_id)
);

DROP POLICY IF EXISTS esp_members_select ON public.enterprise_sla_policies;
CREATE POLICY esp_members_select
ON public.enterprise_sla_policies
FOR SELECT TO authenticated
USING (
  site_id IS NULL
  OR fixeo_private._fixeo_can_access_enterprise_site(enterprise_id,site_id)
);

DROP POLICY IF EXISTS service_requests_enterprise_members_select
ON public.service_requests;
CREATE POLICY service_requests_enterprise_members_select
ON public.service_requests
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.enterprise_request_context erc
    WHERE erc.service_request_id=service_requests.id
      AND fixeo_private._fixeo_can_access_enterprise_site(
        erc.enterprise_id,erc.site_id
      )
  )
);

DROP POLICY IF EXISTS missions_enterprise_members_select
ON public.missions;
CREATE POLICY missions_enterprise_members_select
ON public.missions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.enterprise_request_context erc
    WHERE missions.request_id=erc.service_request_id::text
      AND fixeo_private._fixeo_can_access_enterprise_site(
        erc.enterprise_id,erc.site_id
      )
  )
);



-- 8. Validated Production contracts with BP15-only authorization deltas --------
-- The bodies below originate from the validated BP12 v3 / BP14 v4 artifacts.
-- Existing payload, metric, urgency, cancellation and time-boundary semantics
-- are retained; only effective site-access checks/predicates are added.

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

  -- BP15 delta only: enforce effective site scope.
  IF NOT fixeo_private._fixeo_can_access_enterprise_site(p_enterprise_id,p_site_id) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_forbidden');
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

CREATE OR REPLACE FUNCTION public.get_enterprise_operational_summary(
  p_enterprise_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_site_id uuid DEFAULT NULL
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

  IF p_site_id IS NOT NULL AND NOT fixeo_private._fixeo_can_access_enterprise_site(
    p_enterprise_id,p_site_id
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_site');
  END IF;

  WITH request_base AS MATERIALIZED (
    SELECT
      erc.service_request_id,
      erc.site_id,
      sr.created_at,
      sr.status,
      sr.service_category,
      sr.city,
      sr.urgency,
      sr.commission_amount,
      sr.commission_paid,
      sr.commission_status
    FROM public.enterprise_request_context erc
    JOIN public.service_requests sr
      ON sr.id = erc.service_request_id
    WHERE erc.enterprise_id = p_enterprise_id
      AND (p_site_id IS NULL OR erc.site_id = p_site_id)
      AND fixeo_private._fixeo_can_access_enterprise_site(p_enterprise_id,erc.site_id)
      AND sr.created_at >= v_from
      AND sr.created_at < v_to
  ),
  mission_per_request AS MATERIALIZED (
    SELECT
      rb.service_request_id,
      pg_catalog.count(m.id) AS mission_count,
      pg_catalog.min(m.accepted_at) AS first_accepted_at,
      pg_catalog.bool_or(m.accepted_at IS NOT NULL) AS has_acceptance,
      pg_catalog.bool_or(m.status IN ('done','validated')) AS has_completed_mission
    FROM request_base rb
    LEFT JOIN public.missions m
      ON m.request_id = rb.service_request_id::text
    GROUP BY rb.service_request_id
  ),
  enriched AS MATERIALIZED (
    SELECT
      rb.*,
      COALESCE(mpr.mission_count,0) AS mission_count,
      COALESCE(mpr.has_acceptance,false) AS has_acceptance,
      COALESCE(mpr.has_completed_mission,false) AS has_completed_mission,
      mpr.first_accepted_at
    FROM request_base rb
    LEFT JOIN mission_per_request mpr
      ON mpr.service_request_id = rb.service_request_id
  )
  SELECT pg_catalog.jsonb_build_object(
    'ok', true,
    'enterprise_id', p_enterprise_id,
    'site_id', p_site_id,
    'from', p_from,
    'to', p_to,

    'request_count', pg_catalog.count(*),
    'new_count', pg_catalog.count(*) FILTER (WHERE status='new'),
    'assigned_count', pg_catalog.count(*) FILTER (WHERE status='assigned'),
    'in_progress_count', pg_catalog.count(*) FILTER (WHERE status='in_progress'),
    'completed_count', pg_catalog.count(*) FILTER (WHERE status='completed'),
    'validated_count', pg_catalog.count(*) FILTER (WHERE status='validated'),
    'cancelled_count', pg_catalog.count(*) FILTER (WHERE status='cancelled'),
    'no_match_count', pg_catalog.count(*) FILTER (WHERE status='no_match'),

    'requests_with_mission_count',
      pg_catalog.count(*) FILTER (WHERE mission_count > 0),

    'accepted_request_count',
      pg_catalog.count(*) FILTER (WHERE has_acceptance),

    -- Denominator is all Enterprise requests in the selected period/site.
    -- cancelled/no_match remain visible in their own counters; no exclusion is
    -- invented because Production currently has no such rows to validate.
    'acceptance_rate_percent',
      CASE
        WHEN pg_catalog.count(*) = 0 THEN NULL
        ELSE pg_catalog.round(
          100.0
          * pg_catalog.count(*) FILTER (WHERE has_acceptance)
          / pg_catalog.count(*),
          2
        )
      END,

    'avg_first_acceptance_minutes',
      pg_catalog.round(
        pg_catalog.avg(
          EXTRACT(epoch FROM (first_accepted_at-created_at))/60.0
        ) FILTER (WHERE first_accepted_at IS NOT NULL),
        2
      ),

    'completed_mission_request_count',
      pg_catalog.count(*) FILTER (WHERE has_completed_mission),

    -- Production evidence does not establish a canonical mission price row.
    -- Financial reporting therefore uses only request-level commission fields.
    'request_commission_total',
      COALESCE(pg_catalog.sum(commission_amount),0),

    'request_commission_paid_total',
      COALESCE(
        pg_catalog.sum(commission_amount)
          FILTER (WHERE commission_paid IS TRUE),
        0
      ),

    'request_commission_unpaid_total',
      COALESCE(
        pg_catalog.sum(commission_amount)
          FILTER (WHERE commission_paid IS DISTINCT FROM TRUE),
        0
      )
  )
  INTO v_result
  FROM enriched;

  -- SLA remains owned by the already validated BP12 RPC and is intentionally
  -- not composed into BP14 metrics, avoiding duplication of SLA semantics.
  -- BP12 currently treats p_to as inclusive (<= v_to), while BP14 uses the
  -- canonical half-open interval [p_from,p_to).  Do not compose the BP12 RPC
  -- here because that would mix two different populations in one BP14 result.
  -- SLA remains available through public.get_enterprise_sla_summary() as the
  -- independently validated BP12 contract.
  v_result := v_result || pg_catalog.jsonb_build_object(
    'sla',
    pg_catalog.jsonb_build_object(
      'source','get_enterprise_sla_summary',
      'included',false,
      'reason','separate_bp12_time_boundary_contract'
    )
  );

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_enterprise_site_summary(
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

  WITH request_base AS MATERIALIZED (
    SELECT
      erc.service_request_id,
      erc.site_id,
      sr.status,
      sr.created_at
    FROM public.enterprise_request_context erc
    JOIN public.service_requests sr
      ON sr.id=erc.service_request_id
    WHERE erc.enterprise_id=p_enterprise_id
      AND fixeo_private._fixeo_can_access_enterprise_site(p_enterprise_id,erc.site_id)
      AND sr.created_at >= v_from
      AND sr.created_at < v_to
  ),
  first_acceptance AS MATERIALIZED (
    SELECT
      rb.service_request_id,
      pg_catalog.min(m.accepted_at) AS first_accepted_at
    FROM request_base rb
    LEFT JOIN public.missions m
      ON m.request_id=rb.service_request_id::text
    GROUP BY rb.service_request_id
  ),
  site_rows AS (
    SELECT
      es.id AS site_id,
      es.name AS site_name,
      es.city,
      es.status AS site_status,
      pg_catalog.count(rb.service_request_id) AS request_count,
      pg_catalog.count(rb.service_request_id)
        FILTER (WHERE rb.status IN ('completed','validated')) AS completed_count,
      pg_catalog.count(rb.service_request_id)
        FILTER (WHERE fa.first_accepted_at IS NOT NULL) AS accepted_count
    FROM public.enterprise_sites es
    LEFT JOIN request_base rb ON rb.site_id=es.id
    LEFT JOIN first_acceptance fa
      ON fa.service_request_id=rb.service_request_id
    WHERE es.enterprise_id=p_enterprise_id
      AND fixeo_private._fixeo_can_access_enterprise_site(p_enterprise_id,es.id)
    GROUP BY es.id,es.name,es.city,es.status
  )
  SELECT pg_catalog.jsonb_build_object(
    'ok',true,
    'enterprise_id',p_enterprise_id,
    'from',p_from,
    'to',p_to,
    'sites',
      COALESCE(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'site_id',site_id,
            'site_name',site_name,
            'city',city,
            'site_status',site_status,
            'request_count',request_count,
            'completed_count',completed_count,
            'accepted_count',accepted_count,
            'acceptance_rate_percent',
              CASE
                WHEN request_count=0 THEN NULL
                ELSE pg_catalog.round(
                  100.0*accepted_count/request_count,
                  2
                )
              END
          )
          ORDER BY site_name,site_id
        ),
        '[]'::jsonb
      )
  )
  INTO v_result
  FROM site_rows;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_enterprise_request_breakdown(
  p_enterprise_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_site_id uuid DEFAULT NULL
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

  IF p_site_id IS NOT NULL AND NOT fixeo_private._fixeo_can_access_enterprise_site(
    p_enterprise_id,p_site_id
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_site');
  END IF;

  WITH rb AS MATERIALIZED (
    SELECT
      sr.service_category,
      sr.urgency,
      sr.status
    FROM public.enterprise_request_context erc
    JOIN public.service_requests sr
      ON sr.id=erc.service_request_id
    WHERE erc.enterprise_id=p_enterprise_id
      AND (p_site_id IS NULL OR erc.site_id=p_site_id)
      AND fixeo_private._fixeo_can_access_enterprise_site(p_enterprise_id,erc.site_id)
      AND sr.created_at >= v_from
      AND sr.created_at < v_to
  ),
  category_rows AS (
    SELECT service_category AS key,pg_catalog.count(*) AS count
    FROM rb GROUP BY service_category
  ),
  urgency_rows AS (
    SELECT COALESCE(urgency,'unspecified') AS key,pg_catalog.count(*) AS count
    FROM rb GROUP BY COALESCE(urgency,'unspecified')
  ),
  status_rows AS (
    SELECT status AS key,pg_catalog.count(*) AS count
    FROM rb GROUP BY status
  )
  SELECT pg_catalog.jsonb_build_object(
    'ok',true,
    'enterprise_id',p_enterprise_id,
    'site_id',p_site_id,
    'from',p_from,
    'to',p_to,
    'by_service_category',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('key',key,'count',count)
        ORDER BY count DESC,key
      ) FROM category_rows
    ),'[]'::jsonb),
    'by_urgency',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('key',key,'count',count)
        ORDER BY count DESC,key
      ) FROM urgency_rows
    ),'[]'::jsonb),
    'by_request_status',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('key',key,'count',count)
        ORDER BY count DESC,key
      ) FROM status_rows
    ),'[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$function$;

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
      AND fixeo_private._fixeo_can_access_enterprise_site(p_enterprise_id,ers.site_id)
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
      AND fixeo_private._fixeo_can_access_enterprise_site(p_enterprise_id,ers.site_id)
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

-- 9. Preserve existing RPC ownership / execution contract ----------------------
ALTER FUNCTION public.create_enterprise_request(uuid,uuid,text,text,text) OWNER TO postgres;
ALTER FUNCTION public.get_enterprise_operational_summary(uuid,timestamptz,timestamptz,uuid) OWNER TO postgres;
ALTER FUNCTION public.get_enterprise_site_summary(uuid,timestamptz,timestamptz) OWNER TO postgres;
ALTER FUNCTION public.get_enterprise_request_breakdown(uuid,timestamptz,timestamptz,uuid) OWNER TO postgres;
ALTER FUNCTION public.get_enterprise_sla_summary(uuid,timestamptz,timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_enterprise_request(uuid,uuid,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_enterprise_operational_summary(uuid,timestamptz,timestamptz,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_enterprise_site_summary(uuid,timestamptz,timestamptz) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_enterprise_request_breakdown(uuid,timestamptz,timestamptz,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_enterprise_sla_summary(uuid,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_enterprise_request(uuid,uuid,text,text,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_enterprise_operational_summary(uuid,timestamptz,timestamptz,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_enterprise_site_summary(uuid,timestamptz,timestamptz) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_enterprise_request_breakdown(uuid,timestamptz,timestamptz,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_enterprise_sla_summary(uuid,timestamptz,timestamptz) TO authenticated,service_role;

COMMIT;

-- END BP15 — PRODUCTION VALIDATED.
