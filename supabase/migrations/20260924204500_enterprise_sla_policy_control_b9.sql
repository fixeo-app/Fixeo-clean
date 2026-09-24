-- FIXEO Enterprise B9 — audited SLA policy control plane.
-- Adds secured RPCs only. No business data migration/backfill.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_enterprise_sla_policy(
  p_enterprise_id uuid,
  p_site_id uuid,
  p_urgency text,
  p_acceptance_target_minutes integer,
  p_status text DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_caller_id uuid := auth.uid();
  v_enterprise_status text;
  v_site_enterprise uuid;
  v_policy_id uuid;
  v_target_type text;
  v_target_id uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF p_enterprise_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_required');
  END IF;

  IF p_acceptance_target_minutes IS NULL OR p_acceptance_target_minutes <= 0 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_target');
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('active','inactive') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_status');
  END IF;

  IF p_urgency IS NOT NULL
     AND p_urgency NOT IN ('urgent','high','normal','low')
  THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_urgency');
  END IF;

  SELECT ea.status
  INTO v_enterprise_status
  FROM public.enterprise_accounts ea
  WHERE ea.id = p_enterprise_id
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_found');
  END IF;

  IF v_enterprise_status <> 'active' THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',false,'reason','enterprise_not_active',
      'enterprise_status',v_enterprise_status
    );
  END IF;

  IF NOT fixeo_private._fixeo_is_enterprise_manager(p_enterprise_id) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  IF p_site_id IS NOT NULL THEN
    SELECT es.enterprise_id
    INTO v_site_enterprise
    FROM public.enterprise_sites es
    WHERE es.id = p_site_id
    FOR SHARE;

    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'reason','site_not_found');
    END IF;

    IF v_site_enterprise <> p_enterprise_id THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'reason','site_enterprise_mismatch');
    END IF;
  END IF;

  INSERT INTO public.enterprise_sla_policies(
    enterprise_id,
    site_id,
    urgency,
    acceptance_target_minutes,
    status,
    created_by
  )
  VALUES(
    p_enterprise_id,
    p_site_id,
    p_urgency,
    p_acceptance_target_minutes,
    p_status,
    v_caller_id
  )
  RETURNING id INTO v_policy_id;

  v_target_type := CASE WHEN p_site_id IS NULL THEN 'enterprise_account' ELSE 'enterprise_site' END;
  v_target_id := COALESCE(p_site_id,p_enterprise_id);

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'sla.policy_created',
    v_target_type,
    v_target_id,
    NULL,
    pg_catalog.jsonb_build_object(
      'site_id',p_site_id,
      'urgency',p_urgency,
      'acceptance_target_minutes',p_acceptance_target_minutes,
      'status',p_status
    ),
    pg_catalog.jsonb_build_object('policy_id',v_policy_id)
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,
    'policy_id',v_policy_id,
    'enterprise_id',p_enterprise_id,
    'site_id',p_site_id,
    'urgency',p_urgency,
    'acceptance_target_minutes',p_acceptance_target_minutes,
    'status',p_status
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','policy_exists');
  WHEN OTHERS THEN
    RAISE WARNING '[create_enterprise_sla_policy] error: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_enterprise_sla_policy(
  p_enterprise_id uuid,
  p_policy_id uuid,
  p_site_id uuid,
  p_urgency text,
  p_acceptance_target_minutes integer,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_caller_id uuid := auth.uid();
  v_enterprise_status text;
  v_site_enterprise uuid;
  v_old_site_id uuid;
  v_old_urgency text;
  v_old_target integer;
  v_old_status text;
  v_target_type text;
  v_target_id uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF p_enterprise_id IS NULL OR p_policy_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_arguments');
  END IF;

  IF p_acceptance_target_minutes IS NULL OR p_acceptance_target_minutes <= 0 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_target');
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('active','inactive') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_status');
  END IF;

  IF p_urgency IS NOT NULL
     AND p_urgency NOT IN ('urgent','high','normal','low')
  THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_urgency');
  END IF;

  SELECT ea.status
  INTO v_enterprise_status
  FROM public.enterprise_accounts ea
  WHERE ea.id = p_enterprise_id
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_found');
  END IF;

  IF v_enterprise_status <> 'active' THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',false,'reason','enterprise_not_active',
      'enterprise_status',v_enterprise_status
    );
  END IF;

  IF NOT fixeo_private._fixeo_is_enterprise_manager(p_enterprise_id) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  SELECT
    p.site_id,
    p.urgency,
    p.acceptance_target_minutes,
    p.status
  INTO
    v_old_site_id,
    v_old_urgency,
    v_old_target,
    v_old_status
  FROM public.enterprise_sla_policies p
  WHERE p.id = p_policy_id
    AND p.enterprise_id = p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','policy_not_found');
  END IF;

  IF p_site_id IS NOT NULL THEN
    SELECT es.enterprise_id
    INTO v_site_enterprise
    FROM public.enterprise_sites es
    WHERE es.id = p_site_id
    FOR SHARE;

    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'reason','site_not_found');
    END IF;

    IF v_site_enterprise <> p_enterprise_id THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'reason','site_enterprise_mismatch');
    END IF;
  END IF;

  IF v_old_site_id IS NOT DISTINCT FROM p_site_id
     AND v_old_urgency IS NOT DISTINCT FROM p_urgency
     AND v_old_target = p_acceptance_target_minutes
     AND v_old_status = p_status
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',true,'reason','no_change','policy_id',p_policy_id
    );
  END IF;

  UPDATE public.enterprise_sla_policies
  SET site_id = p_site_id,
      urgency = p_urgency,
      acceptance_target_minutes = p_acceptance_target_minutes,
      status = p_status
  WHERE id = p_policy_id
    AND enterprise_id = p_enterprise_id;

  v_target_type := CASE WHEN p_site_id IS NULL THEN 'enterprise_account' ELSE 'enterprise_site' END;
  v_target_id := COALESCE(p_site_id,p_enterprise_id);

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'sla.policy_updated',
    v_target_type,
    v_target_id,
    pg_catalog.jsonb_build_object(
      'site_id',v_old_site_id,
      'urgency',v_old_urgency,
      'acceptance_target_minutes',v_old_target,
      'status',v_old_status
    ),
    pg_catalog.jsonb_build_object(
      'site_id',p_site_id,
      'urgency',p_urgency,
      'acceptance_target_minutes',p_acceptance_target_minutes,
      'status',p_status
    ),
    pg_catalog.jsonb_build_object('policy_id',p_policy_id)
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,
    'policy_id',p_policy_id,
    'enterprise_id',p_enterprise_id,
    'site_id',p_site_id,
    'urgency',p_urgency,
    'acceptance_target_minutes',p_acceptance_target_minutes,
    'status',p_status
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','policy_exists');
  WHEN OTHERS THEN
    RAISE WARNING '[update_enterprise_sla_policy] error: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;

ALTER FUNCTION public.create_enterprise_sla_policy(uuid,uuid,text,integer,text) OWNER TO postgres;
ALTER FUNCTION public.update_enterprise_sla_policy(uuid,uuid,uuid,text,integer,text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.create_enterprise_sla_policy(uuid,uuid,text,integer,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.update_enterprise_sla_policy(uuid,uuid,uuid,text,integer,text) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.create_enterprise_sla_policy(uuid,uuid,text,integer,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.update_enterprise_sla_policy(uuid,uuid,uuid,text,integer,text) TO authenticated,service_role;

COMMIT;
