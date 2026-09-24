-- FIXEO ENTERPRISE — BLOCK A / A10-A11-A15
-- Workforce registry, capabilities, site scope and hybrid dispatch policy control plane.
-- No business-data backfill. No browser write grants.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Audit vocabulary extension.
-- ---------------------------------------------------------------------------
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
    'sla.snapshot_created'::text,
    'member.site_assigned'::text,
    'member.site_unassigned'::text,
    'workforce.worker_created'::text,
    'workforce.worker_updated'::text,
    'workforce.skills_updated'::text,
    'workforce.sites_updated'::text,
    'workforce.availability_updated'::text,
    'dispatch.policy_created'::text,
    'dispatch.policy_updated'::text,
    'dispatch.internal_offered'::text,
    'dispatch.internal_accepted'::text,
    'dispatch.internal_declined'::text,
    'dispatch.internal_assignment_updated'::text,
    'dispatch.external_started'::text,
    'dispatch.external_fallback'::text,
    'dispatch.no_internal_candidate'::text
  ]));

ALTER TABLE public.enterprise_audit_events
  DROP CONSTRAINT enterprise_audit_events_target_type_chk;

ALTER TABLE public.enterprise_audit_events
  ADD CONSTRAINT enterprise_audit_events_target_type_chk
  CHECK (target_type = ANY (ARRAY[
    'enterprise_member'::text,
    'enterprise_site'::text,
    'service_request'::text,
    'enterprise_account'::text,
    'enterprise_invitation'::text,
    'enterprise_member_site'::text,
    'enterprise_workforce_worker'::text,
    'enterprise_dispatch_policy'::text,
    'enterprise_internal_assignment'::text
  ]));

-- ---------------------------------------------------------------------------
-- 2) Workforce registry.
-- ---------------------------------------------------------------------------
CREATE TABLE public.enterprise_workforce_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL
    REFERENCES public.enterprise_accounts(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  member_id uuid NOT NULL
    REFERENCES public.enterprise_members(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  display_label text NOT NULL,
  employee_code text,
  status text NOT NULL DEFAULT 'active',
  availability text NOT NULL DEFAULT 'available',
  all_sites boolean NOT NULL DEFAULT false,
  max_concurrent_jobs integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL DEFAULT auth.uid()
    REFERENCES public.users(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT enterprise_workforce_workers_unique_member
    UNIQUE (enterprise_id, member_id),
  CONSTRAINT enterprise_workforce_workers_label_chk
    CHECK (
      char_length(btrim(display_label)) BETWEEN 1 AND 160
    ),
  CONSTRAINT enterprise_workforce_workers_employee_code_chk
    CHECK (
      employee_code IS NULL
      OR char_length(btrim(employee_code)) BETWEEN 1 AND 80
    ),
  CONSTRAINT enterprise_workforce_workers_status_chk
    CHECK (status IN ('active','inactive')),
  CONSTRAINT enterprise_workforce_workers_availability_chk
    CHECK (availability IN ('available','unavailable','off_duty')),
  CONSTRAINT enterprise_workforce_workers_capacity_chk
    CHECK (max_concurrent_jobs BETWEEN 1 AND 20)
);

CREATE UNIQUE INDEX enterprise_workforce_workers_employee_code_uq
  ON public.enterprise_workforce_workers (
    enterprise_id,
    lower(btrim(employee_code))
  )
  WHERE employee_code IS NOT NULL;

CREATE INDEX idx_enterprise_workforce_workers_enterprise
  ON public.enterprise_workforce_workers (enterprise_id, status, availability);

CREATE TABLE public.enterprise_workforce_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL
    REFERENCES public.enterprise_accounts(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  worker_id uuid NOT NULL
    REFERENCES public.enterprise_workforce_workers(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  service_category text NOT NULL,
  skill_level integer NOT NULL DEFAULT 3,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT enterprise_workforce_skills_category_chk
    CHECK (char_length(btrim(service_category)) BETWEEN 1 AND 160),
  CONSTRAINT enterprise_workforce_skills_level_chk
    CHECK (skill_level BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX enterprise_workforce_skills_worker_category_uq
  ON public.enterprise_workforce_skills (
    worker_id,
    lower(btrim(service_category))
  );

CREATE INDEX idx_enterprise_workforce_skills_lookup
  ON public.enterprise_workforce_skills (
    enterprise_id,
    lower(btrim(service_category)),
    active
  );

CREATE TABLE public.enterprise_workforce_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL
    REFERENCES public.enterprise_accounts(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  worker_id uuid NOT NULL
    REFERENCES public.enterprise_workforce_workers(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  site_id uuid NOT NULL
    REFERENCES public.enterprise_sites(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT enterprise_workforce_sites_unique
    UNIQUE (enterprise_id, worker_id, site_id)
);

CREATE INDEX idx_enterprise_workforce_sites_lookup
  ON public.enterprise_workforce_sites (enterprise_id, site_id, worker_id);

-- ---------------------------------------------------------------------------
-- 3) Dispatch policy.
-- ---------------------------------------------------------------------------
CREATE TABLE public.enterprise_dispatch_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL
    REFERENCES public.enterprise_accounts(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  site_id uuid
    REFERENCES public.enterprise_sites(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  service_category text,
  mode text NOT NULL DEFAULT 'external_only',
  internal_offer_limit integer NOT NULL DEFAULT 3,
  offer_ttl_minutes integer NOT NULL DEFAULT 15,
  fallback_after_minutes integer NOT NULL DEFAULT 10,
  status text NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL DEFAULT auth.uid()
    REFERENCES public.users(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT enterprise_dispatch_policies_category_chk
    CHECK (
      service_category IS NULL
      OR char_length(btrim(service_category)) BETWEEN 1 AND 160
    ),
  CONSTRAINT enterprise_dispatch_policies_mode_chk
    CHECK (mode IN ('internal_only','internal_first','external_only','hybrid')),
  CONSTRAINT enterprise_dispatch_policies_offer_limit_chk
    CHECK (internal_offer_limit BETWEEN 1 AND 10),
  CONSTRAINT enterprise_dispatch_policies_offer_ttl_chk
    CHECK (offer_ttl_minutes BETWEEN 1 AND 1440),
  CONSTRAINT enterprise_dispatch_policies_fallback_chk
    CHECK (fallback_after_minutes BETWEEN 0 AND 1440),
  CONSTRAINT enterprise_dispatch_policies_status_chk
    CHECK (status IN ('active','inactive'))
);

CREATE UNIQUE INDEX enterprise_dispatch_policies_scope_uq
  ON public.enterprise_dispatch_policies (
    enterprise_id,
    COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(lower(btrim(service_category)), '__default__'::text)
  );

CREATE INDEX idx_enterprise_dispatch_policies_lookup
  ON public.enterprise_dispatch_policies (enterprise_id, status, site_id);

-- ---------------------------------------------------------------------------
-- 4) Internal dispatch runtime.
-- ---------------------------------------------------------------------------
CREATE TABLE public.enterprise_internal_dispatch_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL
    REFERENCES public.enterprise_accounts(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  service_request_id uuid NOT NULL
    REFERENCES public.service_requests(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  worker_id uuid NOT NULL
    REFERENCES public.enterprise_workforce_workers(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'offered',
  score integer NOT NULL DEFAULT 0,
  offered_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  responded_at timestamptz,

  CONSTRAINT enterprise_internal_dispatch_offers_status_chk
    CHECK (status IN ('offered','accepted','declined','expired','cancelled')),
  CONSTRAINT enterprise_internal_dispatch_offers_unique
    UNIQUE (service_request_id, worker_id)
);

CREATE INDEX idx_enterprise_internal_dispatch_offers_worker
  ON public.enterprise_internal_dispatch_offers (worker_id, status, expires_at);

CREATE INDEX idx_enterprise_internal_dispatch_offers_request
  ON public.enterprise_internal_dispatch_offers (service_request_id, status);

CREATE TABLE public.enterprise_internal_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL
    REFERENCES public.enterprise_accounts(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  service_request_id uuid NOT NULL UNIQUE
    REFERENCES public.service_requests(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  worker_id uuid NOT NULL
    REFERENCES public.enterprise_workforce_workers(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  offer_id uuid UNIQUE
    REFERENCES public.enterprise_internal_dispatch_offers(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'assigned',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT enterprise_internal_assignments_status_chk
    CHECK (status IN ('assigned','in_progress','completed','validated','cancelled'))
);

CREATE INDEX idx_enterprise_internal_assignments_worker
  ON public.enterprise_internal_assignments (worker_id, status, assigned_at DESC);

CREATE TABLE public.enterprise_hybrid_dispatch_state (
  service_request_id uuid PRIMARY KEY
    REFERENCES public.service_requests(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  enterprise_id uuid NOT NULL
    REFERENCES public.enterprise_accounts(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  policy_id uuid
    REFERENCES public.enterprise_dispatch_policies(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  mode text NOT NULL,
  status text NOT NULL,
  fallback_due_at timestamptz,
  external_dispatched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT enterprise_hybrid_dispatch_state_mode_chk
    CHECK (mode IN ('internal_only','internal_first','external_only','hybrid')),
  CONSTRAINT enterprise_hybrid_dispatch_state_status_chk
    CHECK (status IN (
      'internal_offered',
      'internal_assigned',
      'external_dispatched',
      'hybrid_active',
      'no_internal_candidate',
      'external_failed',
      'completed',
      'cancelled'
    ))
);

CREATE INDEX idx_enterprise_hybrid_dispatch_state_fallback
  ON public.enterprise_hybrid_dispatch_state (status, fallback_due_at)
  WHERE fallback_due_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5) RLS / browser grants.
-- ---------------------------------------------------------------------------
ALTER TABLE public.enterprise_workforce_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_workforce_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_workforce_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_dispatch_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_internal_dispatch_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_internal_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_hybrid_dispatch_state ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION fixeo_private._fixeo_is_enterprise_workforce_self(
  p_worker_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.enterprise_workforce_workers w
    JOIN public.enterprise_members em
      ON em.id = w.member_id
     AND em.enterprise_id = w.enterprise_id
    WHERE w.id = p_worker_id
      AND em.user_id = auth.uid()
      AND em.status = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION fixeo_private._fixeo_is_enterprise_dispatch_operator(
  p_enterprise_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.enterprise_members em
    WHERE em.enterprise_id = p_enterprise_id
      AND em.user_id = auth.uid()
      AND em.status = 'active'
      AND em.role IN ('owner','admin','operations_manager')
  );
$function$;

REVOKE ALL ON FUNCTION fixeo_private._fixeo_is_enterprise_workforce_self(uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION fixeo_private._fixeo_is_enterprise_dispatch_operator(uuid)
  FROM PUBLIC,anon,authenticated;

CREATE POLICY eww_members_select
ON public.enterprise_workforce_workers
FOR SELECT TO authenticated
USING (fixeo_private._fixeo_is_enterprise_member(enterprise_id));

CREATE POLICY ews_members_select
ON public.enterprise_workforce_skills
FOR SELECT TO authenticated
USING (fixeo_private._fixeo_is_enterprise_member(enterprise_id));

CREATE POLICY ewsite_members_select
ON public.enterprise_workforce_sites
FOR SELECT TO authenticated
USING (fixeo_private._fixeo_is_enterprise_member(enterprise_id));

CREATE POLICY edp_members_select
ON public.enterprise_dispatch_policies
FOR SELECT TO authenticated
USING (fixeo_private._fixeo_is_enterprise_member(enterprise_id));

CREATE POLICY eido_operator_or_self_select
ON public.enterprise_internal_dispatch_offers
FOR SELECT TO authenticated
USING (
  fixeo_private._fixeo_is_enterprise_dispatch_operator(enterprise_id)
  OR fixeo_private._fixeo_is_enterprise_workforce_self(worker_id)
);

CREATE POLICY eia_members_select
ON public.enterprise_internal_assignments
FOR SELECT TO authenticated
USING (fixeo_private._fixeo_is_enterprise_member(enterprise_id));

CREATE POLICY ehds_members_select
ON public.enterprise_hybrid_dispatch_state
FOR SELECT TO authenticated
USING (fixeo_private._fixeo_is_enterprise_member(enterprise_id));

REVOKE ALL ON TABLE
  public.enterprise_workforce_workers,
  public.enterprise_workforce_skills,
  public.enterprise_workforce_sites,
  public.enterprise_dispatch_policies,
  public.enterprise_internal_dispatch_offers,
  public.enterprise_internal_assignments,
  public.enterprise_hybrid_dispatch_state
FROM PUBLIC,anon,authenticated;

GRANT SELECT ON TABLE
  public.enterprise_workforce_workers,
  public.enterprise_workforce_skills,
  public.enterprise_workforce_sites,
  public.enterprise_dispatch_policies,
  public.enterprise_internal_dispatch_offers,
  public.enterprise_internal_assignments,
  public.enterprise_hybrid_dispatch_state
TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Workforce management RPCs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_enterprise_workforce_worker(
  p_enterprise_id uuid,
  p_member_id uuid,
  p_display_label text,
  p_employee_code text DEFAULT NULL,
  p_all_sites boolean DEFAULT false,
  p_max_concurrent_jobs integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_enterprise uuid;
  v_member_status text;
  v_label text;
  v_code text;
  v_worker_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF NOT fixeo_private._fixeo_is_enterprise_manager(p_enterprise_id) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  v_label := pg_catalog.btrim(p_display_label);
  v_code := NULLIF(pg_catalog.btrim(p_employee_code), '');

  IF v_label IS NULL OR pg_catalog.char_length(v_label) NOT BETWEEN 1 AND 160 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_label');
  END IF;

  IF v_code IS NOT NULL AND pg_catalog.char_length(v_code) NOT BETWEEN 1 AND 80 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_employee_code');
  END IF;

  IF p_max_concurrent_jobs IS NULL OR p_max_concurrent_jobs NOT BETWEEN 1 AND 20 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_capacity');
  END IF;

  SELECT em.enterprise_id, em.status
  INTO v_member_enterprise, v_member_status
  FROM public.enterprise_members em
  WHERE em.id = p_member_id
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','member_not_found');
  END IF;

  IF v_member_enterprise <> p_enterprise_id THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','member_enterprise_mismatch');
  END IF;

  IF v_member_status <> 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','member_not_active');
  END IF;

  INSERT INTO public.enterprise_workforce_workers(
    enterprise_id,member_id,display_label,employee_code,all_sites,
    max_concurrent_jobs,created_by
  )
  VALUES(
    p_enterprise_id,p_member_id,v_label,v_code,COALESCE(p_all_sites,false),
    p_max_concurrent_jobs,auth.uid()
  )
  RETURNING id INTO v_worker_id;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'workforce.worker_created',
    'enterprise_workforce_worker',
    v_worker_id,
    NULL,
    pg_catalog.jsonb_build_object(
      'member_id',p_member_id,
      'status','active',
      'availability','available',
      'all_sites',COALESCE(p_all_sites,false),
      'max_concurrent_jobs',p_max_concurrent_jobs
    ),
    pg_catalog.jsonb_build_object('display_label',v_label,'employee_code',v_code)
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,'worker_id',v_worker_id,'enterprise_id',p_enterprise_id
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','worker_exists');
  WHEN OTHERS THEN
    RAISE WARNING '[create_enterprise_workforce_worker] % %', SQLSTATE, SQLERRM;
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_enterprise_workforce_worker(
  p_enterprise_id uuid,
  p_worker_id uuid,
  p_display_label text,
  p_employee_code text,
  p_status text,
  p_all_sites boolean,
  p_max_concurrent_jobs integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_label text;
  v_code text;
  v_before jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF NOT fixeo_private._fixeo_is_enterprise_manager(p_enterprise_id) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  v_label := pg_catalog.btrim(p_display_label);
  v_code := NULLIF(pg_catalog.btrim(p_employee_code), '');

  IF v_label IS NULL OR pg_catalog.char_length(v_label) NOT BETWEEN 1 AND 160 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_label');
  END IF;
  IF v_code IS NOT NULL AND pg_catalog.char_length(v_code) NOT BETWEEN 1 AND 80 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_employee_code');
  END IF;
  IF p_status NOT IN ('active','inactive') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_status');
  END IF;
  IF p_max_concurrent_jobs IS NULL OR p_max_concurrent_jobs NOT BETWEEN 1 AND 20 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_capacity');
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'status',w.status,
    'availability',w.availability,
    'all_sites',w.all_sites,
    'max_concurrent_jobs',w.max_concurrent_jobs,
    'display_label',w.display_label,
    'employee_code',w.employee_code
  )
  INTO v_before
  FROM public.enterprise_workforce_workers w
  WHERE w.id = p_worker_id
    AND w.enterprise_id = p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','worker_not_found');
  END IF;

  UPDATE public.enterprise_workforce_workers
  SET display_label=v_label,
      employee_code=v_code,
      status=p_status,
      all_sites=COALESCE(p_all_sites,false),
      max_concurrent_jobs=p_max_concurrent_jobs,
      updated_at=now()
  WHERE id=p_worker_id;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'workforce.worker_updated',
    'enterprise_workforce_worker',
    p_worker_id,
    v_before,
    pg_catalog.jsonb_build_object(
      'status',p_status,
      'all_sites',COALESCE(p_all_sites,false),
      'max_concurrent_jobs',p_max_concurrent_jobs,
      'display_label',v_label,
      'employee_code',v_code
    ),
    '{}'::jsonb
  );

  RETURN pg_catalog.jsonb_build_object('ok',true,'worker_id',p_worker_id);

EXCEPTION
  WHEN unique_violation THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','employee_code_exists');
  WHEN OTHERS THEN
    RAISE WARNING '[update_enterprise_workforce_worker] % %', SQLSTATE, SQLERRM;
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;

CREATE OR REPLACE FUNCTION public.replace_enterprise_workforce_skills(
  p_enterprise_id uuid,
  p_worker_id uuid,
  p_skills jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_item jsonb;
  v_category text;
  v_level integer;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF NOT fixeo_private._fixeo_is_enterprise_manager(p_enterprise_id) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.enterprise_workforce_workers w
    WHERE w.id=p_worker_id AND w.enterprise_id=p_enterprise_id
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','worker_not_found');
  END IF;

  IF p_skills IS NULL OR pg_catalog.jsonb_typeof(p_skills) <> 'array' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_skills');
  END IF;

  DELETE FROM public.enterprise_workforce_skills
  WHERE enterprise_id=p_enterprise_id AND worker_id=p_worker_id;

  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_skills)
  LOOP
    v_category := pg_catalog.lower(pg_catalog.btrim(v_item->>'service_category'));
    BEGIN
      v_level := (v_item->>'skill_level')::integer;
    EXCEPTION WHEN OTHERS THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_skill_level');
    END;

    IF v_category IS NULL OR pg_catalog.char_length(v_category) NOT BETWEEN 1 AND 160 THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_service_category');
    END IF;
    IF v_level NOT BETWEEN 1 AND 5 THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_skill_level');
    END IF;

    INSERT INTO public.enterprise_workforce_skills(
      enterprise_id,worker_id,service_category,skill_level,active
    )
    VALUES(p_enterprise_id,p_worker_id,v_category,v_level,true);

    v_count := v_count + 1;
  END LOOP;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'workforce.skills_updated',
    'enterprise_workforce_worker',
    p_worker_id,
    NULL,
    pg_catalog.jsonb_build_object('skill_count',v_count),
    '{}'::jsonb
  );

  RETURN pg_catalog.jsonb_build_object('ok',true,'worker_id',p_worker_id,'skill_count',v_count);

EXCEPTION
  WHEN unique_violation THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','duplicate_skill');
  WHEN OTHERS THEN
    RAISE WARNING '[replace_enterprise_workforce_skills] % %', SQLSTATE, SQLERRM;
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;

CREATE OR REPLACE FUNCTION public.replace_enterprise_workforce_sites(
  p_enterprise_id uuid,
  p_worker_id uuid,
  p_site_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_site_id uuid;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF NOT fixeo_private._fixeo_is_enterprise_manager(p_enterprise_id) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.enterprise_workforce_workers w
    WHERE w.id=p_worker_id AND w.enterprise_id=p_enterprise_id
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','worker_not_found');
  END IF;

  DELETE FROM public.enterprise_workforce_sites
  WHERE enterprise_id=p_enterprise_id AND worker_id=p_worker_id;

  FOREACH v_site_id IN ARRAY COALESCE(p_site_ids, ARRAY[]::uuid[])
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.enterprise_sites es
      WHERE es.id=v_site_id
        AND es.enterprise_id=p_enterprise_id
        AND es.status='active'
    ) THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'reason','site_not_available','site_id',v_site_id);
    END IF;

    INSERT INTO public.enterprise_workforce_sites(
      enterprise_id,worker_id,site_id
    )
    VALUES(p_enterprise_id,p_worker_id,v_site_id)
    ON CONFLICT DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'workforce.sites_updated',
    'enterprise_workforce_worker',
    p_worker_id,
    NULL,
    pg_catalog.jsonb_build_object('site_count',v_count),
    '{}'::jsonb
  );

  RETURN pg_catalog.jsonb_build_object('ok',true,'worker_id',p_worker_id,'site_count',v_count);

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[replace_enterprise_workforce_sites] % %', SQLSTATE, SQLERRM;
  RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_enterprise_workforce_availability(
  p_enterprise_id uuid,
  p_worker_id uuid,
  p_availability text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_old text;
  v_is_self boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF p_availability NOT IN ('available','unavailable','off_duty') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_availability');
  END IF;

  v_is_self := fixeo_private._fixeo_is_enterprise_workforce_self(p_worker_id);

  IF NOT fixeo_private._fixeo_is_enterprise_manager(p_enterprise_id)
     AND NOT v_is_self
  THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  SELECT w.availability
  INTO v_old
  FROM public.enterprise_workforce_workers w
  WHERE w.id=p_worker_id AND w.enterprise_id=p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','worker_not_found');
  END IF;

  IF v_old = p_availability THEN
    RETURN pg_catalog.jsonb_build_object('ok',true,'reason','no_change','worker_id',p_worker_id);
  END IF;

  UPDATE public.enterprise_workforce_workers
  SET availability=p_availability,updated_at=now()
  WHERE id=p_worker_id;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'workforce.availability_updated',
    'enterprise_workforce_worker',
    p_worker_id,
    pg_catalog.jsonb_build_object('availability',v_old),
    pg_catalog.jsonb_build_object('availability',p_availability),
    '{}'::jsonb
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,'worker_id',p_worker_id,'availability',p_availability
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_enterprise_dispatch_policy(
  p_enterprise_id uuid,
  p_policy_id uuid,
  p_site_id uuid,
  p_service_category text,
  p_mode text,
  p_internal_offer_limit integer,
  p_offer_ttl_minutes integer,
  p_fallback_after_minutes integer,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_category text;
  v_id uuid;
  v_event text;
  v_before jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF NOT fixeo_private._fixeo_is_enterprise_manager(p_enterprise_id) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  v_category := NULLIF(pg_catalog.lower(pg_catalog.btrim(p_service_category)), '');

  IF p_mode NOT IN ('internal_only','internal_first','external_only','hybrid') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_mode');
  END IF;
  IF p_internal_offer_limit IS NULL OR p_internal_offer_limit NOT BETWEEN 1 AND 10 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_offer_limit');
  END IF;
  IF p_offer_ttl_minutes IS NULL OR p_offer_ttl_minutes NOT BETWEEN 1 AND 1440 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_offer_ttl');
  END IF;
  IF p_fallback_after_minutes IS NULL OR p_fallback_after_minutes NOT BETWEEN 0 AND 1440 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_fallback');
  END IF;
  IF p_status NOT IN ('active','inactive') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_status');
  END IF;

  IF p_site_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.enterprise_sites es
    WHERE es.id=p_site_id AND es.enterprise_id=p_enterprise_id
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','site_not_found');
  END IF;

  IF p_policy_id IS NULL THEN
    INSERT INTO public.enterprise_dispatch_policies(
      enterprise_id,site_id,service_category,mode,internal_offer_limit,
      offer_ttl_minutes,fallback_after_minutes,status,created_by
    )
    VALUES(
      p_enterprise_id,p_site_id,v_category,p_mode,p_internal_offer_limit,
      p_offer_ttl_minutes,p_fallback_after_minutes,p_status,auth.uid()
    )
    RETURNING id INTO v_id;
    v_event := 'dispatch.policy_created';
  ELSE
    SELECT pg_catalog.to_jsonb(p)
    INTO v_before
    FROM public.enterprise_dispatch_policies p
    WHERE p.id=p_policy_id AND p.enterprise_id=p_enterprise_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'reason','policy_not_found');
    END IF;

    UPDATE public.enterprise_dispatch_policies
    SET site_id=p_site_id,
        service_category=v_category,
        mode=p_mode,
        internal_offer_limit=p_internal_offer_limit,
        offer_ttl_minutes=p_offer_ttl_minutes,
        fallback_after_minutes=p_fallback_after_minutes,
        status=p_status,
        updated_at=now()
    WHERE id=p_policy_id;

    v_id := p_policy_id;
    v_event := 'dispatch.policy_updated';
  END IF;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    v_event,
    'enterprise_dispatch_policy',
    v_id,
    v_before,
    pg_catalog.jsonb_build_object(
      'site_id',p_site_id,
      'service_category',v_category,
      'mode',p_mode,
      'internal_offer_limit',p_internal_offer_limit,
      'offer_ttl_minutes',p_offer_ttl_minutes,
      'fallback_after_minutes',p_fallback_after_minutes,
      'status',p_status
    ),
    '{}'::jsonb
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,'policy_id',v_id,'mode',p_mode,'status',p_status
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','policy_exists');
  WHEN OTHERS THEN
    RAISE WARNING '[upsert_enterprise_dispatch_policy] % %', SQLSTATE, SQLERRM;
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_enterprise_workforce_profile_v1(
  p_enterprise_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    (
      SELECT pg_catalog.jsonb_build_object(
        'ok',true,
        'worker_id',w.id,
        'enterprise_id',w.enterprise_id,
        'member_id',w.member_id,
        'display_label',w.display_label,
        'status',w.status,
        'availability',w.availability
      )
      FROM public.enterprise_workforce_workers w
      JOIN public.enterprise_members em
        ON em.id=w.member_id
       AND em.enterprise_id=w.enterprise_id
      WHERE w.enterprise_id=p_enterprise_id
        AND em.user_id=auth.uid()
        AND em.status='active'
      LIMIT 1
    ),
    pg_catalog.jsonb_build_object('ok',false,'reason','worker_not_found')
  );
$function$;

-- ---------------------------------------------------------------------------
-- 7) Ownership / grants for RPCs.
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.create_enterprise_workforce_worker(uuid,uuid,text,text,boolean,integer)
  OWNER TO postgres;
ALTER FUNCTION public.update_enterprise_workforce_worker(uuid,uuid,text,text,text,boolean,integer)
  OWNER TO postgres;
ALTER FUNCTION public.replace_enterprise_workforce_skills(uuid,uuid,jsonb)
  OWNER TO postgres;
ALTER FUNCTION public.replace_enterprise_workforce_sites(uuid,uuid,uuid[])
  OWNER TO postgres;
ALTER FUNCTION public.set_enterprise_workforce_availability(uuid,uuid,text)
  OWNER TO postgres;
ALTER FUNCTION public.upsert_enterprise_dispatch_policy(uuid,uuid,uuid,text,text,integer,integer,integer,text)
  OWNER TO postgres;
ALTER FUNCTION public.get_my_enterprise_workforce_profile_v1(uuid)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.create_enterprise_workforce_worker(uuid,uuid,text,text,boolean,integer)
  FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.update_enterprise_workforce_worker(uuid,uuid,text,text,text,boolean,integer)
  FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.replace_enterprise_workforce_skills(uuid,uuid,jsonb)
  FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.replace_enterprise_workforce_sites(uuid,uuid,uuid[])
  FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.set_enterprise_workforce_availability(uuid,uuid,text)
  FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.upsert_enterprise_dispatch_policy(uuid,uuid,uuid,text,text,integer,integer,integer,text)
  FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_my_enterprise_workforce_profile_v1(uuid)
  FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.create_enterprise_workforce_worker(uuid,uuid,text,text,boolean,integer)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.update_enterprise_workforce_worker(uuid,uuid,text,text,text,boolean,integer)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.replace_enterprise_workforce_skills(uuid,uuid,jsonb)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.replace_enterprise_workforce_sites(uuid,uuid,uuid[])
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_enterprise_workforce_availability(uuid,uuid,text)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.upsert_enterprise_dispatch_policy(uuid,uuid,uuid,text,text,integer,integer,integer,text)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_enterprise_workforce_profile_v1(uuid)
  TO authenticated,service_role;

COMMIT;
