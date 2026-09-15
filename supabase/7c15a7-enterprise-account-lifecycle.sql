-- ============================================================================
-- FIXEO ENTERPRISE — 7C.15A.7 — PRODUCTION CORRECTED-v2
-- Enterprise Account Lifecycle Control Plane
-- PRODUCTION MIGRATION — PRECHECK 26/26 PASS TO PRODUCTION.
--
-- Production-source-preserving rewrite from A01-A12 audit.
-- Only inserted semantic change in existing operational RPCs:
-- reject account status other than active with reason enterprise_not_active.
-- create_enterprise_request already had an active-account guard and is preserved.
-- ============================================================================
BEGIN;

ALTER TABLE public.enterprise_audit_events
  DROP CONSTRAINT enterprise_audit_events_event_type_chk;

ALTER TABLE public.enterprise_audit_events
  ADD CONSTRAINT enterprise_audit_events_event_type_chk
  CHECK (event_type = ANY (ARRAY[
    'member.role_updated'::text,'member.status_updated'::text,
    'site.created'::text,'site.updated'::text,'site.status_updated'::text,
    'request.created'::text,'account.created'::text,'account.updated'::text,
    'member.invited'::text,'member.invitation_accepted'::text,
    'member.invitation_revoked'::text,'member.invitation_expired'::text,
    'account.status_updated'::text
  ]));

CREATE OR REPLACE FUNCTION public.set_enterprise_account_status(
  p_enterprise_id uuid, p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_before_status text;
  v_target_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF NOT fixeo_private._fixeo_is_admin() THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  IF p_enterprise_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_required');
  END IF;

  v_target_status := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_status,'')));
  IF v_target_status NOT IN ('active','suspended','closed') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_status');
  END IF;

  SELECT ea.status INTO v_before_status
  FROM public.enterprise_accounts ea
  WHERE ea.id=p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_found');
  END IF;

  IF v_before_status=v_target_status THEN
    RETURN pg_catalog.jsonb_build_object('ok',true,'reason','no_change',
      'enterprise_id',p_enterprise_id,'status',v_before_status);
  END IF;

  IF v_before_status='closed' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','closed_is_terminal');
  END IF;

  IF NOT (
    (v_before_status='active' AND v_target_status IN ('suspended','closed'))
    OR (v_before_status='suspended' AND v_target_status IN ('active','closed'))
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_transition',
      'from_status',v_before_status,'to_status',v_target_status);
  END IF;

  UPDATE public.enterprise_accounts
  SET status=v_target_status
  WHERE id=p_enterprise_id;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'account.status_updated',
    'enterprise_account',
    p_enterprise_id,
    pg_catalog.jsonb_build_object('status',v_before_status),
    pg_catalog.jsonb_build_object('status',v_target_status),
    pg_catalog.jsonb_build_object('source','set_enterprise_account_status')
  );

  RETURN pg_catalog.jsonb_build_object('ok',true,'enterprise_id',p_enterprise_id,
    'previous_status',v_before_status,'status',v_target_status);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[set_enterprise_account_status] error: % (SQLSTATE: %)',SQLERRM,SQLSTATE;
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;

ALTER FUNCTION public.set_enterprise_account_status(uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_enterprise_account_status(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_enterprise_account_status(uuid,text) TO authenticated,service_role;
REVOKE UPDATE (status) ON public.enterprise_accounts FROM PUBLIC,anon,authenticated;

-- SOURCE-PRESERVING REWRITE: update_enterprise_account
CREATE OR REPLACE FUNCTION public.update_enterprise_account(p_enterprise_id uuid, p_name text, p_legal_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller_id       uuid;
  v_authorized      boolean;
  v_current_name    text;
  v_current_legal   text;
  v_current_status  text;
  v_name            text;
  v_legal_name      text;
BEGIN
  -- Guard 1: authenticated caller.
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'unauthenticated'
    );
  END IF;

  -- Guard 2: enterprise id required.
  IF p_enterprise_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'enterprise_required'
    );
  END IF;

  -- Guard 3: lock account and capture current state.
  SELECT
    ea.name,
    ea.legal_name,
    ea.status
  INTO
    v_current_name,
    v_current_legal,
    v_current_status
  FROM public.enterprise_accounts ea
  WHERE ea.id = p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'enterprise_not_found'
    );
  END IF;

  IF v_current_status <> 'active' THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'enterprise_not_active',
      'enterprise_status', v_current_status
    );
  END IF;

  -- Guard 4: active owner/admin authorization.
  SELECT fixeo_private._fixeo_is_enterprise_manager(
    p_enterprise_id
  )
  INTO v_authorized;

  IF NOT COALESCE(v_authorized, false) THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'forbidden'
    );
  END IF;

  -- Guard 5: validate and normalize name.
  IF p_name IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(p_name)) < 1
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'name_required'
    );
  END IF;

  v_name := pg_catalog.btrim(p_name);

  IF pg_catalog.char_length(v_name) > 200 THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'name_too_long'
    );
  END IF;

  -- Guard 6: legal_name may be NULL to clear it.
  IF p_legal_name IS NOT NULL THEN
    v_legal_name := pg_catalog.btrim(p_legal_name);

    IF pg_catalog.char_length(v_legal_name) < 1
       OR pg_catalog.char_length(v_legal_name) > 300
    THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false,
        'reason', 'legal_name_invalid'
      );
    END IF;
  ELSE
    v_legal_name := NULL;
  END IF;

  -- Guard 7: semantic no-op.
  IF v_name IS NOT DISTINCT FROM v_current_name
     AND v_legal_name IS NOT DISTINCT FROM v_current_legal
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', true,
      'reason', 'no_change'
    );
  END IF;

  -- Mutation. Status is intentionally untouched.
  UPDATE public.enterprise_accounts
  SET
    name = v_name,
    legal_name = v_legal_name
  WHERE id = p_enterprise_id;

  -- Transactional audit.
  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'account.updated',
    'enterprise_account',
    p_enterprise_id,
    pg_catalog.jsonb_build_object(
      'name', v_current_name,
      'legal_name', v_current_legal,
      'status', v_current_status
    ),
    pg_catalog.jsonb_build_object(
      'name', v_name,
      'legal_name', v_legal_name,
      'status', v_current_status
    ),
    '{}'::jsonb
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'enterprise_id', p_enterprise_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING
      '[update_enterprise_account] unexpected error: % (SQLSTATE: %)',
      SQLERRM,
      SQLSTATE;

    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'internal_error'
    );
END;
$function$;


ALTER FUNCTION public.update_enterprise_account(p_enterprise_id uuid, p_name text, p_legal_name text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_enterprise_account(p_enterprise_id uuid, p_name text, p_legal_name text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_enterprise_account(p_enterprise_id uuid, p_name text, p_legal_name text) TO authenticated,service_role;

-- SOURCE-PRESERVING REWRITE: create_enterprise_site
CREATE OR REPLACE FUNCTION public.create_enterprise_site(p_enterprise_id uuid, p_name text, p_city text, p_site_code text DEFAULT NULL::text, p_address_line text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller_id      uuid;
  v_caller_exists  boolean;
  v_authorized     boolean;
  v_enterprise_status text;
  v_name           text;
  v_city           text;
  v_site_code      text;
  v_address_line   text;
  v_site_id        uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = v_caller_id
  ) INTO v_caller_exists;

  IF NOT v_caller_exists THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;

  IF p_enterprise_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'enterprise_required');
  END IF;

  SELECT ea.status
  INTO v_enterprise_status
  FROM public.enterprise_accounts ea
  WHERE ea.id = p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_found');
  END IF;

  IF v_enterprise_status <> 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_active',
      'enterprise_status',v_enterprise_status);
  END IF;

  SELECT fixeo_private._fixeo_is_enterprise_manager(p_enterprise_id)
  INTO v_authorized;

  IF NOT COALESCE(v_authorized, false) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  IF p_name IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_name)) < 1 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'name_required');
  END IF;

  v_name := pg_catalog.btrim(p_name);
  IF pg_catalog.char_length(v_name) > 200 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'name_too_long');
  END IF;

  IF p_city IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_city)) < 1 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'city_required');
  END IF;

  v_city := pg_catalog.btrim(p_city);
  IF pg_catalog.char_length(v_city) > 120 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'city_too_long');
  END IF;

  IF p_site_code IS NOT NULL THEN
    v_site_code := pg_catalog.btrim(p_site_code);
    IF pg_catalog.char_length(v_site_code) < 1
       OR pg_catalog.char_length(v_site_code) > 80
    THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_code_invalid');
    END IF;
  ELSE
    v_site_code := NULL;
  END IF;

  IF p_address_line IS NOT NULL THEN
    v_address_line := pg_catalog.btrim(p_address_line);
    IF pg_catalog.char_length(v_address_line) < 1
       OR pg_catalog.char_length(v_address_line) > 500
    THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'address_invalid');
    END IF;
  ELSE
    v_address_line := NULL;
  END IF;

  INSERT INTO public.enterprise_sites (
    enterprise_id,
    name,
    site_code,
    address_line,
    city,
    status
  )
  VALUES (
    p_enterprise_id,
    v_name,
    v_site_code,
    v_address_line,
    v_city,
    'active'
  )
  RETURNING id INTO v_site_id;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'site.created',
    'enterprise_site',
    v_site_id,
    NULL,
    pg_catalog.jsonb_build_object(
      'name', v_name,
      'city', v_city,
      'site_code', v_site_code,
      'address_line', v_address_line,
      'status', 'active'
    ),
    '{}'::jsonb
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'site_id', v_site_id
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'site_code_exists'
    );

  WHEN OTHERS THEN
    RAISE WARNING '[create_enterprise_site] unexpected error: %', SQLERRM;
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'internal_error'
    );
END;
$function$;


ALTER FUNCTION public.create_enterprise_site(p_enterprise_id uuid, p_name text, p_city text, p_site_code text, p_address_line text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_enterprise_site(p_enterprise_id uuid, p_name text, p_city text, p_site_code text, p_address_line text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_enterprise_site(p_enterprise_id uuid, p_name text, p_city text, p_site_code text, p_address_line text) TO authenticated,service_role;

-- SOURCE-PRESERVING REWRITE: update_enterprise_site
CREATE OR REPLACE FUNCTION public.update_enterprise_site(p_enterprise_id uuid, p_site_id uuid, p_name text, p_city text, p_site_code text DEFAULT NULL::text, p_address_line text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_enterprise_status text;
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
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT ea.status
  INTO v_enterprise_status
  FROM public.enterprise_accounts ea
  WHERE ea.id = p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_found');
  END IF;

  IF v_enterprise_status <> 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_active',
      'enterprise_status',v_enterprise_status);
  END IF;

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

  IF p_name IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_name)) < 1 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'name_required');
  END IF;

  v_name := pg_catalog.btrim(p_name);
  IF pg_catalog.char_length(v_name) > 200 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'name_too_long');
  END IF;

  IF p_city IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_city)) < 1 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'city_required');
  END IF;

  v_city := pg_catalog.btrim(p_city);
  IF pg_catalog.char_length(v_city) > 120 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'city_too_long');
  END IF;

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

  IF v_name IS NOT DISTINCT FROM v_site_name
     AND v_city IS NOT DISTINCT FROM v_site_city
     AND v_site_code IS NOT DISTINCT FROM v_site_code_cur
     AND v_address_line IS NOT DISTINCT FROM v_site_addr_cur
  THEN
    RETURN pg_catalog.jsonb_build_object('ok', true, 'reason', 'no_change');
  END IF;

  UPDATE public.enterprise_sites
  SET name = v_name,
      city = v_city,
      site_code = v_site_code,
      address_line = v_address_line
  WHERE id = p_site_id;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'site.updated',
    'enterprise_site',
    p_site_id,
    pg_catalog.jsonb_build_object(
      'name', v_site_name,
      'city', v_site_city,
      'site_code', v_site_code_cur,
      'address_line', v_site_addr_cur
    ),
    pg_catalog.jsonb_build_object(
      'name', v_name,
      'city', v_city,
      'site_code', v_site_code,
      'address_line', v_address_line
    ),
    '{}'::jsonb
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'site_id', p_site_id,
    'enterprise_id', p_enterprise_id
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_code_exists');

  WHEN OTHERS THEN
    RAISE WARNING '[update_enterprise_site] error: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'internal_error');
END;
$function$;


ALTER FUNCTION public.update_enterprise_site(p_enterprise_id uuid, p_site_id uuid, p_name text, p_city text, p_site_code text, p_address_line text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_enterprise_site(p_enterprise_id uuid, p_site_id uuid, p_name text, p_city text, p_site_code text, p_address_line text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_enterprise_site(p_enterprise_id uuid, p_site_id uuid, p_name text, p_city text, p_site_code text, p_address_line text) TO authenticated,service_role;

-- SOURCE-PRESERVING REWRITE: set_enterprise_site_status
CREATE OR REPLACE FUNCTION public.set_enterprise_site_status(p_enterprise_id uuid, p_site_id uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_enterprise_status text;
  v_caller_id uuid;
  v_caller_role text;
  v_caller_stat text;
  v_site_eid uuid;
  v_site_status text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('active', 'inactive') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_status');
  END IF;

  SELECT ea.status
  INTO v_enterprise_status
  FROM public.enterprise_accounts ea
  WHERE ea.id = p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_found');
  END IF;

  IF v_enterprise_status <> 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_active',
      'enterprise_status',v_enterprise_status);
  END IF;

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

  IF v_site_status = p_status THEN
    RETURN pg_catalog.jsonb_build_object('ok', true, 'reason', 'no_change');
  END IF;

  UPDATE public.enterprise_sites
  SET status = p_status
  WHERE id = p_site_id;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'site.status_updated',
    'enterprise_site',
    p_site_id,
    pg_catalog.jsonb_build_object('status', v_site_status),
    pg_catalog.jsonb_build_object('status', p_status),
    '{}'::jsonb
  );

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
$function$;


ALTER FUNCTION public.set_enterprise_site_status(p_enterprise_id uuid, p_site_id uuid, p_status text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_enterprise_site_status(p_enterprise_id uuid, p_site_id uuid, p_status text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_enterprise_site_status(p_enterprise_id uuid, p_site_id uuid, p_status text) TO authenticated,service_role;

-- SOURCE-PRESERVING REWRITE: create_enterprise_request
CREATE OR REPLACE FUNCTION public.create_enterprise_request(p_enterprise_id uuid, p_site_id uuid, p_service_category text, p_description text, p_urgency text DEFAULT NULL::text)
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
  v_sr_id              uuid;
  v_ctx_id             uuid;
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

  -- Serialize against account lifecycle transitions.
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
  WHERE es.id = p_site_id;

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
  RETURNING id INTO v_sr_id;

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

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'service_request_id', v_sr_id,
    'enterprise_request_context_id', v_ctx_id,
    'enterprise_id', p_enterprise_id,
    'site_id', p_site_id
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


ALTER FUNCTION public.create_enterprise_request(p_enterprise_id uuid, p_site_id uuid, p_service_category text, p_description text, p_urgency text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_enterprise_request(p_enterprise_id uuid, p_site_id uuid, p_service_category text, p_description text, p_urgency text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_enterprise_request(p_enterprise_id uuid, p_site_id uuid, p_service_category text, p_description text, p_urgency text) TO authenticated,service_role;

-- SOURCE-PRESERVING REWRITE: update_enterprise_member_role
CREATE OR REPLACE FUNCTION public.update_enterprise_member_role(p_enterprise_id uuid, p_member_id uuid, p_new_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_enterprise_status text;
  v_caller_id   uuid;
  v_caller_role text;
  v_caller_stat text;
  v_target_role text;
  v_target_stat text;
  v_target_uid  uuid;
  v_owner_count integer;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF p_new_role IS NULL
     OR p_new_role NOT IN ('admin','operations_manager','site_manager','reporter','viewer')
  THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_role');
  END IF;

  SELECT ea.status
  INTO v_enterprise_status
  FROM public.enterprise_accounts ea
  WHERE ea.id = p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_found');
  END IF;

  IF v_enterprise_status <> 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_active',
      'enterprise_status',v_enterprise_status);
  END IF;

  SELECT em.role, em.status
  INTO v_caller_role, v_caller_stat
  FROM public.enterprise_members em
  WHERE em.enterprise_id = p_enterprise_id
    AND em.user_id = v_caller_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','not_a_member');
  END IF;

  IF v_caller_stat != 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','caller_not_active');
  END IF;

  IF v_caller_role NOT IN ('owner','admin') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  SELECT em.role, em.status, em.user_id
  INTO v_target_role, v_target_stat, v_target_uid
  FROM public.enterprise_members em
  WHERE em.id = p_member_id
    AND em.enterprise_id = p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','member_not_found');
  END IF;

  IF v_target_stat NOT IN ('active','suspended') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','member_not_modifiable');
  END IF;

  IF v_caller_role = 'admin' AND v_target_role = 'owner' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','cannot_modify_owner');
  END IF;

  IF v_target_role = 'owner' AND v_target_stat = 'active' THEN
    SELECT COUNT(*)
    INTO v_owner_count
    FROM public.enterprise_members
    WHERE enterprise_id = p_enterprise_id
      AND role = 'owner'
      AND status = 'active'
      AND id != p_member_id;

    IF v_owner_count = 0 THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'reason','owner_invariant_violation');
    END IF;
  END IF;

  IF v_target_role = p_new_role THEN
    RETURN pg_catalog.jsonb_build_object('ok',true,'reason','no_change');
  END IF;

  UPDATE public.enterprise_members
  SET role = p_new_role,
      updated_at = now()
  WHERE id = p_member_id;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'member.role_updated',
    'enterprise_member',
    p_member_id,
    pg_catalog.jsonb_build_object('role', v_target_role),
    pg_catalog.jsonb_build_object('role', p_new_role),
    pg_catalog.jsonb_build_object(
      'target_user_id', v_target_uid,
      'target_status', v_target_stat
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'member_id', p_member_id,
    'new_role', p_new_role
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[update_enterprise_member_role] error: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;


ALTER FUNCTION public.update_enterprise_member_role(p_enterprise_id uuid, p_member_id uuid, p_new_role text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_enterprise_member_role(p_enterprise_id uuid, p_member_id uuid, p_new_role text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_enterprise_member_role(p_enterprise_id uuid, p_member_id uuid, p_new_role text) TO authenticated,service_role;

-- SOURCE-PRESERVING REWRITE: set_enterprise_member_status
CREATE OR REPLACE FUNCTION public.set_enterprise_member_status(p_enterprise_id uuid, p_member_id uuid, p_new_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_enterprise_status text;
  v_caller_id   uuid;
  v_caller_role text;
  v_caller_stat text;
  v_target_role text;
  v_target_stat text;
  v_owner_count integer;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF p_new_status IS NULL
     OR p_new_status NOT IN ('active','suspended','removed')
  THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_status');
  END IF;

  SELECT ea.status
  INTO v_enterprise_status
  FROM public.enterprise_accounts ea
  WHERE ea.id = p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_found');
  END IF;

  IF v_enterprise_status <> 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_active',
      'enterprise_status',v_enterprise_status);
  END IF;

  SELECT em.role, em.status
  INTO v_caller_role, v_caller_stat
  FROM public.enterprise_members em
  WHERE em.enterprise_id = p_enterprise_id
    AND em.user_id = v_caller_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','not_a_member');
  END IF;

  IF v_caller_stat != 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','caller_not_active');
  END IF;

  IF v_caller_role NOT IN ('owner','admin') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  SELECT em.role, em.status
  INTO v_target_role, v_target_stat
  FROM public.enterprise_members em
  WHERE em.id = p_member_id
    AND em.enterprise_id = p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','member_not_found');
  END IF;

  IF v_target_stat = 'removed' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','member_already_removed');
  END IF;

  IF v_caller_role = 'admin' AND v_target_role = 'owner' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','cannot_modify_owner');
  END IF;

  IF v_target_role = 'owner'
     AND v_target_stat = 'active'
     AND p_new_status IN ('suspended','removed')
  THEN
    SELECT COUNT(*)
    INTO v_owner_count
    FROM public.enterprise_members
    WHERE enterprise_id = p_enterprise_id
      AND role = 'owner'
      AND status = 'active'
      AND id != p_member_id;

    IF v_owner_count = 0 THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'reason','owner_invariant_violation');
    END IF;
  END IF;

  IF v_target_stat = 'active' AND p_new_status = 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',true,'reason','no_change');
  END IF;

  IF v_target_stat = 'suspended' AND p_new_status = 'suspended' THEN
    RETURN pg_catalog.jsonb_build_object('ok',true,'reason','no_change');
  END IF;

  IF v_target_stat = 'invited' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invited_status_not_managed_here');
  END IF;

  UPDATE public.enterprise_members
  SET status = p_new_status,
      updated_at = now()
  WHERE id = p_member_id;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'member.status_updated',
    'enterprise_member',
    p_member_id,
    pg_catalog.jsonb_build_object('status', v_target_stat),
    pg_catalog.jsonb_build_object('status', p_new_status),
    pg_catalog.jsonb_build_object('target_role', v_target_role)
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'member_id', p_member_id,
    'new_status', p_new_status
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[set_enterprise_member_status] error: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;


ALTER FUNCTION public.set_enterprise_member_status(p_enterprise_id uuid, p_member_id uuid, p_new_status text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_enterprise_member_status(p_enterprise_id uuid, p_member_id uuid, p_new_status text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_enterprise_member_status(p_enterprise_id uuid, p_member_id uuid, p_new_status text) TO authenticated,service_role;

-- SOURCE-PRESERVING REWRITE: create_enterprise_invitation
CREATE OR REPLACE FUNCTION public.create_enterprise_invitation(p_enterprise_id uuid, p_email text, p_role text, p_expires_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_enterprise_status text;
  v_caller_id uuid;
  v_caller_role text;
  v_caller_status text;

  v_email text;

  v_auth_match_count integer;
  v_auth_user_id uuid;
  v_public_user_exists boolean;

  v_existing_member_id uuid;
  v_existing_member_status text;

  v_old_invitation_id uuid;
  v_old_target_user_id uuid;
  v_old_member_id uuid;
  v_old_member_status text;

  v_raw_token text;
  v_token_hash text;

  v_invitation_id uuid;
  v_member_id uuid;
BEGIN
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  v_email := pg_catalog.lower(pg_catalog.btrim(p_email));

  IF v_email IS NULL
     OR pg_catalog.char_length(v_email) < 3
     OR pg_catalog.char_length(v_email) > 320
     OR pg_catalog.strpos(v_email,'@') <= 1
  THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_email');
  END IF;

  IF p_role IS NULL
     OR p_role NOT IN (
       'admin',
       'operations_manager',
       'site_manager',
       'reporter',
       'viewer'
     )
  THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_role');
  END IF;

  IF p_expires_at IS NULL
     OR p_expires_at <= pg_catalog.now()
     OR p_expires_at > pg_catalog.now() + interval '30 days'
  THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_expiry');
  END IF;

  -- LOCK ORDER #1: enterprise account.
  SELECT ea.status
  INTO v_enterprise_status
  FROM public.enterprise_accounts ea
  WHERE ea.id = p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_found');
  END IF;

  IF v_enterprise_status <> 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_active',
      'enterprise_status',v_enterprise_status);
  END IF;

  SELECT em.role, em.status
  INTO v_caller_role, v_caller_status
  FROM public.enterprise_members em
  WHERE em.enterprise_id = p_enterprise_id
    AND em.user_id = v_caller_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','not_a_member');
  END IF;

  IF v_caller_status <> 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','caller_not_active');
  END IF;

  IF v_caller_role NOT IN ('owner','admin') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  -- LOCK ORDER #2: stale/current invitation for this Enterprise+email.
  SELECT ei.id, ei.target_user_id
  INTO v_old_invitation_id, v_old_target_user_id
  FROM public.enterprise_invitations ei
  WHERE ei.enterprise_id = p_enterprise_id
    AND ei.email_normalized = v_email
    AND ei.status = 'pending'
  ORDER BY ei.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF (
      SELECT ei.expires_at
      FROM public.enterprise_invitations ei
      WHERE ei.id = v_old_invitation_id
    ) > pg_catalog.now()
    THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok',false,
        'reason','invitation_pending'
      );
    END IF;

    -- Expire stale pending invitation.
    UPDATE public.enterprise_invitations
    SET status = 'expired',
        updated_at = pg_catalog.now()
    WHERE id = v_old_invitation_id;

    -- LOCK ORDER #3: membership. Retire only an invited membership associated
    -- with the same resolved target. No physical DELETE.
    IF v_old_target_user_id IS NOT NULL THEN
      SELECT em.id, em.status
      INTO v_old_member_id, v_old_member_status
      FROM public.enterprise_members em
      WHERE em.enterprise_id = p_enterprise_id
        AND em.user_id = v_old_target_user_id
      FOR UPDATE;

      IF FOUND AND v_old_member_status = 'invited' THEN
        UPDATE public.enterprise_members
        SET status = 'removed',
            updated_at = pg_catalog.now()
        WHERE id = v_old_member_id;
      END IF;
    END IF;

    PERFORM fixeo_private._write_enterprise_audit_event(
      p_enterprise_id,
      'member.invitation_expired',
      'enterprise_invitation',
      v_old_invitation_id,
      pg_catalog.jsonb_build_object('status','pending'),
      pg_catalog.jsonb_build_object('status','expired'),
      pg_catalog.jsonb_build_object('member_id',v_old_member_id)
    );
  END IF;

  -- Resolve normalized email against auth.users, never public.users email.
  SELECT COUNT(*)
  INTO v_auth_match_count
  FROM auth.users au
  WHERE pg_catalog.lower(pg_catalog.btrim(au.email::text)) = v_email;

  IF v_auth_match_count > 1 THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',false,
      'reason','ambiguous_email_identity'
    );
  END IF;

  IF v_auth_match_count = 0 THEN
    v_auth_user_id := NULL;
  ELSE
    -- Exactly one normalized auth.users identity exists.
    SELECT au.id
    INTO STRICT v_auth_user_id
    FROM auth.users au
    WHERE pg_catalog.lower(pg_catalog.btrim(au.email::text)) = v_email;

    SELECT EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = v_auth_user_id
    )
    INTO v_public_user_exists;

    IF NOT v_public_user_exists THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok',false,
        'reason','identity_not_ready'
      );
    END IF;
  END IF;

  -- Existing membership handling.
  IF v_auth_user_id IS NOT NULL THEN
    SELECT em.id, em.status
    INTO v_existing_member_id, v_existing_member_status
    FROM public.enterprise_members em
    WHERE em.enterprise_id = p_enterprise_id
      AND em.user_id = v_auth_user_id
    FOR UPDATE;

    IF FOUND THEN
      IF v_existing_member_status IN ('active','suspended') THEN
        RETURN pg_catalog.jsonb_build_object(
          'ok',false,
          'reason','already_member',
          'member_id',v_existing_member_id,
          'member_status',v_existing_member_status
        );
      END IF;

      IF v_existing_member_status = 'invited' THEN
        -- No current pending invitation exists at this point. An invited row
        -- without a live pending invitation is stale and is safely re-used.
        UPDATE public.enterprise_members
        SET role = p_role,
            invited_by = v_caller_id,
            updated_at = pg_catalog.now()
        WHERE id = v_existing_member_id;

        v_member_id := v_existing_member_id;

      ELSIF v_existing_member_status = 'removed' THEN
        UPDATE public.enterprise_members
        SET role = p_role,
            status = 'invited',
            invited_by = v_caller_id,
            updated_at = pg_catalog.now()
        WHERE id = v_existing_member_id;

        v_member_id := v_existing_member_id;

      ELSE
        RETURN pg_catalog.jsonb_build_object(
          'ok',false,
          'reason','membership_state_unsupported'
        );
      END IF;
    END IF;
  END IF;

  -- Generate token inside PostgreSQL. Raw token is never stored.
  v_raw_token :=
    pg_catalog.encode(
      extensions.gen_random_bytes(32),
      'hex'
    );

  v_token_hash :=
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(v_raw_token,'UTF8'),
        'sha256'
      ),
      'hex'
    );

  INSERT INTO public.enterprise_invitations (
    enterprise_id,
    email_normalized,
    role,
    invited_by,
    target_user_id,
    token_hash,
    status,
    expires_at
  )
  VALUES (
    p_enterprise_id,
    v_email,
    p_role,
    v_caller_id,
    v_auth_user_id,
    v_token_hash,
    'pending',
    p_expires_at
  )
  RETURNING id INTO v_invitation_id;

  IF v_auth_user_id IS NOT NULL AND v_member_id IS NULL THEN
    INSERT INTO public.enterprise_members (
      enterprise_id,
      user_id,
      role,
      status,
      invited_by
    )
    VALUES (
      p_enterprise_id,
      v_auth_user_id,
      p_role,
      'invited',
      v_caller_id
    )
    RETURNING id INTO v_member_id;
  END IF;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'member.invited',
    'enterprise_invitation',
    v_invitation_id,
    NULL,
    pg_catalog.jsonb_build_object(
      'role',p_role,
      'status','pending',
      'target_user_resolved',(v_auth_user_id IS NOT NULL)
    ),
    pg_catalog.jsonb_build_object('member_id',v_member_id)
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,
    'invitation_id',v_invitation_id,
    'invitation_token',v_raw_token,
    'member_id',v_member_id,
    'target_user_resolved',(v_auth_user_id IS NOT NULL),
    'expires_at',p_expires_at
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',false,
      'reason','invitation_conflict'
    );

  WHEN OTHERS THEN
    RAISE WARNING '[create_enterprise_invitation] error: % (SQLSTATE: %)',
      SQLERRM, SQLSTATE;
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;


ALTER FUNCTION public.create_enterprise_invitation(p_enterprise_id uuid, p_email text, p_role text, p_expires_at timestamp with time zone) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_enterprise_invitation(p_enterprise_id uuid, p_email text, p_role text, p_expires_at timestamp with time zone) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_enterprise_invitation(p_enterprise_id uuid, p_email text, p_role text, p_expires_at timestamp with time zone) TO authenticated,service_role;

-- SOURCE-PRESERVING REWRITE: accept_enterprise_invitation
CREATE OR REPLACE FUNCTION public.accept_enterprise_invitation(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_enterprise_status text;
  v_caller_id uuid;
  v_caller_email text;
  v_public_user_exists boolean;

  v_token_hash text;

  v_probe_enterprise_id uuid;

  v_invitation_id uuid;
  v_enterprise_id uuid;
  v_invitation_email text;
  v_invitation_role text;
  v_invitation_status text;
  v_target_user_id uuid;
  v_expires_at timestamptz;

  v_member_id uuid;
  v_member_status text;
BEGIN
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF p_token IS NULL
     OR pg_catalog.char_length(p_token) <> 64
     OR p_token !~ '^[0-9a-fA-F]{64}$'
  THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_token');
  END IF;

  SELECT pg_catalog.lower(pg_catalog.btrim(au.email::text))
  INTO v_caller_email
  FROM auth.users au
  WHERE au.id = v_caller_id;

  IF NOT FOUND OR v_caller_email IS NULL OR v_caller_email = '' THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',false,
      'reason','identity_email_unavailable'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = v_caller_id
  )
  INTO v_public_user_exists;

  IF NOT v_public_user_exists THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',false,
      'reason','identity_not_ready'
    );
  END IF;

  v_token_hash :=
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(pg_catalog.lower(p_token),'UTF8'),
        'sha256'
      ),
      'hex'
    );

  -- Probe only: no lock yet.
  SELECT ei.enterprise_id
  INTO v_probe_enterprise_id
  FROM public.enterprise_invitations ei
  WHERE ei.token_hash = v_token_hash;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invitation_not_found');
  END IF;

  -- LOCK ORDER #1: enterprise account.
  SELECT ea.status
  INTO v_enterprise_status
  FROM public.enterprise_accounts ea
  WHERE ea.id = v_probe_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_found');
  END IF;

  IF v_enterprise_status <> 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_active',
      'enterprise_status',v_enterprise_status);
  END IF;

  -- LOCK ORDER #2: invitation. Re-read all mutable fields after account lock.
  SELECT
    ei.id,
    ei.enterprise_id,
    ei.email_normalized,
    ei.role,
    ei.status,
    ei.target_user_id,
    ei.expires_at
  INTO
    v_invitation_id,
    v_enterprise_id,
    v_invitation_email,
    v_invitation_role,
    v_invitation_status,
    v_target_user_id,
    v_expires_at
  FROM public.enterprise_invitations ei
  WHERE ei.token_hash = v_token_hash
    AND ei.enterprise_id = v_probe_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invitation_not_found');
  END IF;

  IF v_invitation_status <> 'pending' THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',false,
      'reason','invitation_not_pending'
    );
  END IF;

  IF v_expires_at <= pg_catalog.now() THEN
    UPDATE public.enterprise_invitations
    SET status='expired',
        updated_at=pg_catalog.now()
    WHERE id=v_invitation_id;

    -- LOCK ORDER #3: invited membership, if one was materialized.
    IF v_target_user_id IS NOT NULL THEN
      SELECT em.id, em.status
      INTO v_member_id, v_member_status
      FROM public.enterprise_members em
      WHERE em.enterprise_id=v_enterprise_id
        AND em.user_id=v_target_user_id
      FOR UPDATE;

      IF FOUND AND v_member_status='invited' THEN
        UPDATE public.enterprise_members
        SET status='removed',
            updated_at=pg_catalog.now()
        WHERE id=v_member_id;
      END IF;
    END IF;

    PERFORM fixeo_private._write_enterprise_audit_event(
      v_enterprise_id,
      'member.invitation_expired',
      'enterprise_invitation',
      v_invitation_id,
      pg_catalog.jsonb_build_object('status','pending'),
      pg_catalog.jsonb_build_object('status','expired'),
      pg_catalog.jsonb_build_object('member_id',v_member_id)
    );

    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invitation_expired');
  END IF;

  IF v_caller_email <> v_invitation_email THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',false,
      'reason','invitation_identity_mismatch'
    );
  END IF;

  IF v_target_user_id IS NOT NULL
     AND v_target_user_id <> v_caller_id
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',false,
      'reason','invitation_identity_mismatch'
    );
  END IF;

  -- LOCK ORDER #3: membership.
  SELECT em.id, em.status
  INTO v_member_id, v_member_status
  FROM public.enterprise_members em
  WHERE em.enterprise_id=v_enterprise_id
    AND em.user_id=v_caller_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_member_status IN ('active','suspended') THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok',false,
        'reason','membership_conflict',
        'member_status',v_member_status
      );
    END IF;

    IF v_member_status NOT IN ('invited','removed') THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok',false,
        'reason','membership_state_unsupported',
        'member_status',v_member_status
      );
    END IF;

    -- 'removed' is valid here when the invitation was created before this
    -- auth identity existed, or after an older invitation lifecycle ended.
    -- Acceptance reuses the historical membership row; no physical DELETE.
    UPDATE public.enterprise_members
    SET role=v_invitation_role,
        status='active',
        invited_by=(
          SELECT ei.invited_by
          FROM public.enterprise_invitations ei
          WHERE ei.id=v_invitation_id
        ),
        updated_at=pg_catalog.now()
    WHERE id=v_member_id;

  ELSE
    INSERT INTO public.enterprise_members (
      enterprise_id,
      user_id,
      role,
      status,
      invited_by
    )
    SELECT
      ei.enterprise_id,
      v_caller_id,
      ei.role,
      'active',
      ei.invited_by
    FROM public.enterprise_invitations ei
    WHERE ei.id=v_invitation_id
    RETURNING id INTO v_member_id;
  END IF;

  UPDATE public.enterprise_invitations
  SET status='accepted',
      target_user_id=v_caller_id,
      accepted_at=pg_catalog.now(),
      accepted_by=v_caller_id,
      updated_at=pg_catalog.now()
  WHERE id=v_invitation_id;

  PERFORM fixeo_private._write_enterprise_audit_event(
    v_enterprise_id,
    'member.invitation_accepted',
    'enterprise_invitation',
    v_invitation_id,
    pg_catalog.jsonb_build_object(
      'status','pending',
      'role',v_invitation_role
    ),
    pg_catalog.jsonb_build_object(
      'status','accepted',
      'role',v_invitation_role,
      'member_id',v_member_id
    ),
    pg_catalog.jsonb_build_object(
      'accepted_user_id',v_caller_id
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,
    'invitation_id',v_invitation_id,
    'enterprise_id',v_enterprise_id,
    'member_id',v_member_id,
    'role',v_invitation_role,
    'status','active'
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',false,
      'reason','membership_conflict'
    );

  WHEN OTHERS THEN
    RAISE WARNING '[accept_enterprise_invitation] error: % (SQLSTATE: %)',
      SQLERRM, SQLSTATE;
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;


ALTER FUNCTION public.accept_enterprise_invitation(p_token text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.accept_enterprise_invitation(p_token text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_enterprise_invitation(p_token text) TO authenticated,service_role;

-- SOURCE-PRESERVING REWRITE: revoke_enterprise_invitation
CREATE OR REPLACE FUNCTION public.revoke_enterprise_invitation(p_enterprise_id uuid, p_invitation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_enterprise_status text;
  v_caller_id uuid;
  v_caller_role text;
  v_caller_status text;

  v_status text;
  v_role text;
  v_target_user_id uuid;

  v_member_id uuid;
  v_member_status text;
BEGIN
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  -- LOCK ORDER #1: enterprise account.
  SELECT ea.status
  INTO v_enterprise_status
  FROM public.enterprise_accounts ea
  WHERE ea.id = p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_found');
  END IF;

  IF v_enterprise_status <> 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_active',
      'enterprise_status',v_enterprise_status);
  END IF;

  SELECT em.role, em.status
  INTO v_caller_role, v_caller_status
  FROM public.enterprise_members em
  WHERE em.enterprise_id=p_enterprise_id
    AND em.user_id=v_caller_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','not_a_member');
  END IF;

  IF v_caller_status <> 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','caller_not_active');
  END IF;

  IF v_caller_role NOT IN ('owner','admin') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  -- LOCK ORDER #2: invitation.
  SELECT ei.status, ei.role, ei.target_user_id
  INTO v_status, v_role, v_target_user_id
  FROM public.enterprise_invitations ei
  WHERE ei.id=p_invitation_id
    AND ei.enterprise_id=p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invitation_not_found');
  END IF;

  IF v_status <> 'pending' THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',false,
      'reason','invitation_not_pending'
    );
  END IF;

  -- LOCK ORDER #3: membership.
  IF v_target_user_id IS NOT NULL THEN
    SELECT em.id, em.status
    INTO v_member_id, v_member_status
    FROM public.enterprise_members em
    WHERE em.enterprise_id=p_enterprise_id
      AND em.user_id=v_target_user_id
    FOR UPDATE;

    IF FOUND AND v_member_status='invited' THEN
      UPDATE public.enterprise_members
      SET status='removed',
          updated_at=pg_catalog.now()
      WHERE id=v_member_id;

    ELSIF FOUND THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok',false,
        'reason','membership_conflict',
        'member_status',v_member_status
      );
    END IF;
  END IF;

  UPDATE public.enterprise_invitations
  SET status='revoked',
      revoked_at=pg_catalog.now(),
      revoked_by=v_caller_id,
      updated_at=pg_catalog.now()
  WHERE id=p_invitation_id;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'member.invitation_revoked',
    'enterprise_invitation',
    p_invitation_id,
    pg_catalog.jsonb_build_object(
      'status','pending',
      'role',v_role
    ),
    pg_catalog.jsonb_build_object(
      'status','revoked',
      'role',v_role
    ),
    pg_catalog.jsonb_build_object('member_id',v_member_id)
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,
    'invitation_id',p_invitation_id,
    'status','revoked'
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[revoke_enterprise_invitation] error: % (SQLSTATE: %)',
      SQLERRM, SQLSTATE;
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$function$;


ALTER FUNCTION public.revoke_enterprise_invitation(p_enterprise_id uuid, p_invitation_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.revoke_enterprise_invitation(p_enterprise_id uuid, p_invitation_id uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revoke_enterprise_invitation(p_enterprise_id uuid, p_invitation_id uuid) TO authenticated,service_role;

COMMIT;
-- END 7C.15A.7 PRODUCTION MIGRATION.
