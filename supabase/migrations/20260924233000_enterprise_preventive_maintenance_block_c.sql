-- FIXEO ENTERPRISE — BLOCK C / Preventive Maintenance
-- Plans, recurrence, calendar, reminders, automatic request generation and run history.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Audit vocabulary extension for human plan management.
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
    'dispatch.no_internal_candidate'::text,
    'control_tower.escalation_created'::text,
    'control_tower.escalation_updated'::text,
    'maintenance.plan_created'::text,
    'maintenance.plan_updated'::text
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
    'enterprise_internal_assignment'::text,
    'enterprise_control_tower_escalation'::text,
    'enterprise_maintenance_plan'::text
  ]));

-- ---------------------------------------------------------------------------
-- 2) Preventive maintenance plan and run history.
-- ---------------------------------------------------------------------------
CREATE TABLE public.enterprise_maintenance_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL
    REFERENCES public.enterprise_accounts(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  site_id uuid NOT NULL
    REFERENCES public.enterprise_sites(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  name text NOT NULL,
  service_category text NOT NULL,
  description text NOT NULL,
  urgency text,
  frequency text NOT NULL,
  interval_count integer NOT NULL DEFAULT 1,
  next_due_at timestamptz NOT NULL,
  reminder_hours integer NOT NULL DEFAULT 24,
  status text NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL DEFAULT auth.uid()
    REFERENCES public.users(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  updated_by uuid NOT NULL DEFAULT auth.uid()
    REFERENCES public.users(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT enterprise_maintenance_plans_name_chk
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  CONSTRAINT enterprise_maintenance_plans_category_chk
    CHECK (char_length(btrim(service_category)) BETWEEN 1 AND 160),
  CONSTRAINT enterprise_maintenance_plans_description_chk
    CHECK (char_length(btrim(description)) BETWEEN 1 AND 2000),
  CONSTRAINT enterprise_maintenance_plans_urgency_chk
    CHECK (urgency IS NULL OR urgency IN ('normale','urgent','now')),
  CONSTRAINT enterprise_maintenance_plans_frequency_chk
    CHECK (frequency IN ('daily','weekly','monthly')),
  CONSTRAINT enterprise_maintenance_plans_interval_chk
    CHECK (interval_count BETWEEN 1 AND 24),
  CONSTRAINT enterprise_maintenance_plans_reminder_chk
    CHECK (reminder_hours BETWEEN 0 AND 720),
  CONSTRAINT enterprise_maintenance_plans_status_chk
    CHECK (status IN ('active','paused','inactive'))
);

CREATE INDEX idx_enterprise_maintenance_plans_due
  ON public.enterprise_maintenance_plans (status,next_due_at)
  WHERE status='active';

CREATE INDEX idx_enterprise_maintenance_plans_enterprise
  ON public.enterprise_maintenance_plans (enterprise_id,site_id,status,next_due_at);

CREATE TABLE public.enterprise_maintenance_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL
    REFERENCES public.enterprise_accounts(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  plan_id uuid NOT NULL
    REFERENCES public.enterprise_maintenance_plans(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  due_at timestamptz NOT NULL,
  service_request_id uuid
    REFERENCES public.service_requests(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  status text NOT NULL,
  generated_at timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT enterprise_maintenance_runs_unique_due
    UNIQUE (plan_id,due_at),
  CONSTRAINT enterprise_maintenance_runs_status_chk
    CHECK (status IN ('processing','generated','failed','skipped')),
  CONSTRAINT enterprise_maintenance_runs_error_chk
    CHECK (error_code IS NULL OR char_length(btrim(error_code)) BETWEEN 1 AND 160)
);

CREATE INDEX idx_enterprise_maintenance_runs_enterprise
  ON public.enterprise_maintenance_runs (enterprise_id,due_at DESC);

CREATE INDEX idx_enterprise_maintenance_runs_plan
  ON public.enterprise_maintenance_runs (plan_id,due_at DESC);

ALTER TABLE public.enterprise_maintenance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_maintenance_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY emp_members_select
ON public.enterprise_maintenance_plans
FOR SELECT TO authenticated
USING (
  fixeo_private._fixeo_can_access_enterprise_site(enterprise_id,site_id)
);

CREATE POLICY emr_members_select
ON public.enterprise_maintenance_runs
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.enterprise_maintenance_plans p
    WHERE p.id=enterprise_maintenance_runs.plan_id
      AND p.enterprise_id=enterprise_maintenance_runs.enterprise_id
      AND fixeo_private._fixeo_can_access_enterprise_site(p.enterprise_id,p.site_id)
  )
);

REVOKE ALL ON TABLE
  public.enterprise_maintenance_plans,
  public.enterprise_maintenance_runs
FROM PUBLIC,anon,authenticated;

GRANT SELECT ON TABLE
  public.enterprise_maintenance_plans,
  public.enterprise_maintenance_runs
TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Helper for next occurrence.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fixeo_private._fixeo_next_maintenance_due(
  p_due_at timestamptz,
  p_frequency text,
  p_interval_count integer
)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
BEGIN
  IF p_frequency='daily' THEN
    RETURN p_due_at + pg_catalog.make_interval(days=>p_interval_count);
  ELSIF p_frequency='weekly' THEN
    RETURN p_due_at + pg_catalog.make_interval(days=>(7*p_interval_count));
  ELSIF p_frequency='monthly' THEN
    RETURN p_due_at + pg_catalog.make_interval(months=>p_interval_count);
  END IF;
  RAISE EXCEPTION 'invalid_frequency';
END;
$function$;

REVOKE ALL ON FUNCTION fixeo_private._fixeo_next_maintenance_due(
  timestamptz,text,integer
) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION fixeo_private._fixeo_next_maintenance_due(
  timestamptz,text,integer
) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Human plan management RPC.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_enterprise_maintenance_plan_v1(
  p_enterprise_id uuid,
  p_plan_id uuid,
  p_site_id uuid,
  p_name text,
  p_service_category text,
  p_description text,
  p_urgency text,
  p_frequency text,
  p_interval_count integer,
  p_next_due_at timestamptz,
  p_reminder_hours integer,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_name text;
  v_category text;
  v_description text;
  v_before jsonb;
  v_id uuid;
  v_event text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF NOT fixeo_private._fixeo_is_enterprise_dispatch_operator(p_enterprise_id) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  IF p_site_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.enterprise_sites es
    WHERE es.id=p_site_id
      AND es.enterprise_id=p_enterprise_id
      AND es.status='active'
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','site_not_available');
  END IF;

  v_name := pg_catalog.btrim(p_name);
  v_category := pg_catalog.lower(pg_catalog.btrim(p_service_category));
  v_description := pg_catalog.btrim(p_description);

  IF v_name IS NULL OR pg_catalog.char_length(v_name) NOT BETWEEN 1 AND 200 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_name');
  END IF;
  IF v_category IS NULL OR pg_catalog.char_length(v_category) NOT BETWEEN 1 AND 160 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_service_category');
  END IF;
  IF v_description IS NULL OR pg_catalog.char_length(v_description) NOT BETWEEN 1 AND 2000 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_description');
  END IF;
  IF p_urgency IS NOT NULL AND p_urgency NOT IN ('normale','urgent','now') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_urgency');
  END IF;
  IF p_frequency NOT IN ('daily','weekly','monthly') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_frequency');
  END IF;
  IF p_interval_count IS NULL OR p_interval_count NOT BETWEEN 1 AND 24 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_interval');
  END IF;
  IF p_next_due_at IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','next_due_required');
  END IF;
  IF p_reminder_hours IS NULL OR p_reminder_hours NOT BETWEEN 0 AND 720 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_reminder');
  END IF;
  IF p_status NOT IN ('active','paused','inactive') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_status');
  END IF;

  IF p_plan_id IS NULL THEN
    INSERT INTO public.enterprise_maintenance_plans(
      enterprise_id,site_id,name,service_category,description,urgency,
      frequency,interval_count,next_due_at,reminder_hours,status,
      created_by,updated_by
    )
    VALUES(
      p_enterprise_id,p_site_id,v_name,v_category,v_description,p_urgency,
      p_frequency,p_interval_count,p_next_due_at,p_reminder_hours,p_status,
      auth.uid(),auth.uid()
    )
    RETURNING id INTO v_id;
    v_event := 'maintenance.plan_created';
  ELSE
    SELECT pg_catalog.to_jsonb(p)
    INTO v_before
    FROM public.enterprise_maintenance_plans p
    WHERE p.id=p_plan_id
      AND p.enterprise_id=p_enterprise_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'reason','plan_not_found');
    END IF;

    UPDATE public.enterprise_maintenance_plans
    SET site_id=p_site_id,
        name=v_name,
        service_category=v_category,
        description=v_description,
        urgency=p_urgency,
        frequency=p_frequency,
        interval_count=p_interval_count,
        next_due_at=p_next_due_at,
        reminder_hours=p_reminder_hours,
        status=p_status,
        updated_by=auth.uid(),
        updated_at=now()
    WHERE id=p_plan_id
    RETURNING id INTO v_id;

    v_event := 'maintenance.plan_updated';
  END IF;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    v_event,
    'enterprise_maintenance_plan',
    v_id,
    v_before,
    pg_catalog.jsonb_build_object(
      'site_id',p_site_id,
      'service_category',v_category,
      'urgency',p_urgency,
      'frequency',p_frequency,
      'interval_count',p_interval_count,
      'next_due_at',p_next_due_at,
      'reminder_hours',p_reminder_hours,
      'status',p_status
    ),
    pg_catalog.jsonb_build_object('name',v_name)
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,
    'plan_id',v_id,
    'next_due_at',p_next_due_at,
    'status',p_status
  );

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[upsert_enterprise_maintenance_plan_v1] % %',SQLSTATE,SQLERRM;
  RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;

ALTER FUNCTION public.upsert_enterprise_maintenance_plan_v1(
  uuid,uuid,uuid,text,text,text,text,text,integer,timestamptz,integer,text
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.upsert_enterprise_maintenance_plan_v1(
  uuid,uuid,uuid,text,text,text,text,text,integer,timestamptz,integer,text
) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.upsert_enterprise_maintenance_plan_v1(
  uuid,uuid,uuid,text,text,text,text,text,integer,timestamptz,integer,text
) TO authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 5) System request generator for one maintenance plan occurrence.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fixeo_private._fixeo_generate_maintenance_request_v1(
  p_plan_id uuid,
  p_due_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_plan public.enterprise_maintenance_plans%ROWTYPE;
  v_enterprise_status text;
  v_site_status text;
  v_city text;
  v_sla_urgency text;
  v_policy_id uuid;
  v_policy_urgency text;
  v_target_minutes integer;
  v_request_id uuid;
  v_context_id uuid;
  v_request_sla_id uuid;
  v_started_at timestamptz;
  v_at_risk_at timestamptz;
  v_due_at timestamptz;
  v_dispatch jsonb;
BEGIN
  SELECT *
  INTO v_plan
  FROM public.enterprise_maintenance_plans p
  WHERE p.id=p_plan_id
  FOR UPDATE;

  IF NOT FOUND OR v_plan.status<>'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','plan_not_active');
  END IF;

  SELECT ea.status
  INTO v_enterprise_status
  FROM public.enterprise_accounts ea
  WHERE ea.id=v_plan.enterprise_id
  FOR SHARE;

  IF v_enterprise_status<>'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_active');
  END IF;

  SELECT es.status,es.city
  INTO v_site_status,v_city
  FROM public.enterprise_sites es
  WHERE es.id=v_plan.site_id
    AND es.enterprise_id=v_plan.enterprise_id
  FOR SHARE;

  IF NOT FOUND OR v_site_status<>'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','site_not_active');
  END IF;

  v_sla_urgency := CASE v_plan.urgency
    WHEN 'now' THEN 'urgent'
    WHEN 'urgent' THEN 'high'
    WHEN 'normale' THEN 'normal'
    ELSE 'normal'
  END;

  SELECT p.id,p.urgency,p.acceptance_target_minutes
  INTO v_policy_id,v_policy_urgency,v_target_minutes
  FROM public.enterprise_sla_policies p
  WHERE p.enterprise_id=v_plan.enterprise_id
    AND p.status='active'
    AND (p.site_id=v_plan.site_id OR p.site_id IS NULL)
    AND (p.urgency=v_sla_urgency OR p.urgency IS NULL)
  ORDER BY
    CASE WHEN p.site_id=v_plan.site_id THEN 0 ELSE 1 END,
    CASE WHEN p.urgency=v_sla_urgency THEN 0 ELSE 1 END
  LIMIT 1
  FOR SHARE;

  IF v_policy_id IS NULL THEN
    v_policy_urgency := v_sla_urgency;
    v_target_minutes := CASE v_sla_urgency
      WHEN 'urgent' THEN 15
      WHEN 'high' THEN 30
      WHEN 'normal' THEN 120
      WHEN 'low' THEN 240
      ELSE 120
    END;
  END IF;

  PERFORM pg_catalog.set_config('fixeo.enterprise_dispatch_deferred','on',true);

  INSERT INTO public.service_requests(
    service_category,city,description,urgency,client_profile_id,status
  )
  VALUES(
    v_plan.service_category,
    v_city,
    '[Maintenance préventive] '||v_plan.description,
    v_plan.urgency,
    NULL,
    'new'
  )
  RETURNING id,created_at
  INTO v_request_id,v_started_at;

  PERFORM pg_catalog.set_config('fixeo.enterprise_dispatch_deferred','off',true);

  v_started_at := COALESCE(v_started_at,now());

  INSERT INTO public.enterprise_request_context(
    enterprise_id,site_id,service_request_id,created_by
  )
  VALUES(
    v_plan.enterprise_id,
    v_plan.site_id,
    v_request_id,
    v_plan.created_by
  )
  RETURNING id INTO v_context_id;

  v_at_risk_at := v_started_at + (pg_catalog.make_interval(mins=>v_target_minutes)*0.75);
  v_due_at := v_started_at + pg_catalog.make_interval(mins=>v_target_minutes);

  INSERT INTO public.enterprise_request_sla(
    service_request_id,enterprise_id,site_id,policy_id,policy_urgency,
    request_urgency,acceptance_target_minutes,started_at,at_risk_at,due_at
  )
  VALUES(
    v_request_id,v_plan.enterprise_id,v_plan.site_id,v_policy_id,v_policy_urgency,
    v_plan.urgency,v_target_minutes,v_started_at,v_at_risk_at,v_due_at
  )
  RETURNING id INTO v_request_sla_id;

  v_dispatch := public.dispatch_enterprise_hybrid_v1(v_request_id);

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,
    'service_request_id',v_request_id,
    'enterprise_request_context_id',v_context_id,
    'request_sla_id',v_request_sla_id,
    'dispatch',v_dispatch
  );

EXCEPTION WHEN OTHERS THEN
  PERFORM pg_catalog.set_config('fixeo.enterprise_dispatch_deferred','off',true);
  RAISE WARNING '[_fixeo_generate_maintenance_request_v1] % %',SQLSTATE,SQLERRM;
  RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;

REVOKE ALL ON FUNCTION fixeo_private._fixeo_generate_maintenance_request_v1(
  uuid,timestamptz
) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION fixeo_private._fixeo_generate_maintenance_request_v1(
  uuid,timestamptz
) TO service_role;

-- ---------------------------------------------------------------------------
-- 6) Idempotent maintenance scheduler.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_enterprise_maintenance_scheduler_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_plan record;
  v_run_id uuid;
  v_result jsonb;
  v_next_due timestamptz;
  v_generated integer := 0;
  v_failed integer := 0;
BEGIN
  FOR v_plan IN
    SELECT p.*
    FROM public.enterprise_maintenance_plans p
    WHERE p.status='active'
      AND p.next_due_at<=now()
    ORDER BY p.next_due_at
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO public.enterprise_maintenance_runs(
      enterprise_id,plan_id,due_at,status,created_at,updated_at
    )
    VALUES(
      v_plan.enterprise_id,v_plan.id,v_plan.next_due_at,'processing',now(),now()
    )
    ON CONFLICT (plan_id,due_at)
    DO UPDATE SET updated_at=now()
    RETURNING id INTO v_run_id;

    SELECT fixeo_private._fixeo_generate_maintenance_request_v1(
      v_plan.id,
      v_plan.next_due_at
    )
    INTO v_result;

    IF COALESCE((v_result->>'ok')::boolean,false) THEN
      UPDATE public.enterprise_maintenance_runs
      SET service_request_id=(v_result->>'service_request_id')::uuid,
          status='generated',
          generated_at=now(),
          error_code=NULL,
          updated_at=now()
      WHERE id=v_run_id;

      v_next_due := fixeo_private._fixeo_next_maintenance_due(
        v_plan.next_due_at,v_plan.frequency,v_plan.interval_count
      );

      UPDATE public.enterprise_maintenance_plans
      SET next_due_at=v_next_due,
          updated_at=now()
      WHERE id=v_plan.id;

      v_generated := v_generated+1;
    ELSE
      UPDATE public.enterprise_maintenance_runs
      SET status='failed',
          error_code=COALESCE(v_result->>'reason','generation_failed'),
          updated_at=now()
      WHERE id=v_run_id;

      v_failed := v_failed+1;
    END IF;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,
    'generated',v_generated,
    'failed',v_failed
  );
END;
$function$;

ALTER FUNCTION public.run_enterprise_maintenance_scheduler_v1()
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.run_enterprise_maintenance_scheduler_v1()
  FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.run_enterprise_maintenance_scheduler_v1()
  TO service_role;

-- ---------------------------------------------------------------------------
-- 7) Read model for calendar / reminders / history.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_enterprise_preventive_maintenance_v1(
  p_enterprise_id uuid,
  p_history_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_plans jsonb;
  v_runs jsonb;
  v_summary jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF p_enterprise_id IS NULL THEN
    RAISE EXCEPTION 'enterprise_required';
  END IF;

  IF p_history_limit IS NULL OR p_history_limit<1 OR p_history_limit>500 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;

  IF NOT fixeo_private._fixeo_is_enterprise_member(p_enterprise_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id',p.id,
        'site_id',p.site_id,
        'site_name',es.name,
        'city',es.city,
        'name',p.name,
        'service_category',p.service_category,
        'description',p.description,
        'urgency',p.urgency,
        'frequency',p.frequency,
        'interval_count',p.interval_count,
        'next_due_at',p.next_due_at,
        'reminder_hours',p.reminder_hours,
        'status',p.status,
        'reminder_due',
          (
            p.status='active'
            AND now() >= p.next_due_at - pg_catalog.make_interval(hours=>p.reminder_hours)
            AND now() < p.next_due_at
          ),
        'overdue',
          (p.status='active' AND now()>=p.next_due_at),
        'updated_at',p.updated_at
      )
      ORDER BY p.next_due_at,p.name
    ),
    '[]'::jsonb
  )
  INTO v_plans
  FROM public.enterprise_maintenance_plans p
  JOIN public.enterprise_sites es ON es.id=p.site_id
  WHERE p.enterprise_id=p_enterprise_id
    AND fixeo_private._fixeo_can_access_enterprise_site(p.enterprise_id,p.site_id);

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id',r.id,
        'plan_id',r.plan_id,
        'plan_name',p.name,
        'site_id',p.site_id,
        'site_name',es.name,
        'due_at',r.due_at,
        'service_request_id',r.service_request_id,
        'status',r.status,
        'generated_at',r.generated_at,
        'error_code',r.error_code
      )
      ORDER BY r.due_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_runs
  FROM (
    SELECT r.*
    FROM public.enterprise_maintenance_runs r
    JOIN public.enterprise_maintenance_plans p2 ON p2.id=r.plan_id
    WHERE r.enterprise_id=p_enterprise_id
      AND fixeo_private._fixeo_can_access_enterprise_site(p2.enterprise_id,p2.site_id)
    ORDER BY r.due_at DESC
    LIMIT p_history_limit
  ) r
  JOIN public.enterprise_maintenance_plans p ON p.id=r.plan_id
  JOIN public.enterprise_sites es ON es.id=p.site_id;

  SELECT pg_catalog.jsonb_build_object(
    'active_plans',
      count(*) FILTER (WHERE p.status='active')::integer,
    'due_soon',
      count(*) FILTER (
        WHERE p.status='active'
          AND now() >= p.next_due_at - pg_catalog.make_interval(hours=>p.reminder_hours)
          AND now() < p.next_due_at
      )::integer,
    'overdue',
      count(*) FILTER (
        WHERE p.status='active' AND now()>=p.next_due_at
      )::integer,
    'paused',
      count(*) FILTER (WHERE p.status='paused')::integer
  )
  INTO v_summary
  FROM public.enterprise_maintenance_plans p
  WHERE p.enterprise_id=p_enterprise_id
    AND fixeo_private._fixeo_can_access_enterprise_site(p.enterprise_id,p.site_id);

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,
    'generated_at',now(),
    'summary',v_summary,
    'plans',v_plans,
    'runs',v_runs
  );
END;
$function$;

ALTER FUNCTION public.get_enterprise_preventive_maintenance_v1(uuid,integer)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_enterprise_preventive_maintenance_v1(uuid,integer)
  FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.get_enterprise_preventive_maintenance_v1(uuid,integer)
  TO authenticated,service_role;

COMMIT;
