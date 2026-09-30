-- FIXEO Control OS — Enterprise Provisioning Admin V1
-- Admin-only provisioning of Enterprise tenants and founding owners.
-- No global role mutation. No browser service_role. Raw invitation tokens are never stored.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $guard$
DECLARE
  v_role_def text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'ENTERPRISE_PROVISIONING_OWNER_DRIFT';
  END IF;

  IF to_regclass('public.enterprise_accounts') IS NULL
     OR to_regclass('public.enterprise_members') IS NULL
     OR to_regclass('public.enterprise_invitations') IS NULL
     OR to_regclass('public.enterprise_audit_events') IS NULL
     OR to_regprocedure('public.is_admin()') IS NULL
     OR to_regprocedure('fixeo_private._fixeo_is_admin()') IS NULL
     OR to_regprocedure('fixeo_private._write_enterprise_audit_event(uuid,text,text,uuid,jsonb,jsonb,jsonb)') IS NULL
  THEN
    RAISE EXCEPTION 'ENTERPRISE_PROVISIONING_BASELINE_MISSING';
  END IF;

  SELECT pg_get_constraintdef(oid)
  INTO v_role_def
  FROM pg_constraint
  WHERE conrelid='public.enterprise_invitations'::regclass
    AND conname='enterprise_invitations_role_chk';

  IF v_role_def IS NULL OR position('owner' in lower(v_role_def)) > 0 THEN
    RAISE EXCEPTION 'ENTERPRISE_INVITATION_ROLE_BASELINE_DRIFT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.enterprise_members
    WHERE role='owner' AND status IN ('active','invited','suspended')
    GROUP BY enterprise_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'ENTERPRISE_OWNER_BASELINE_CONFLICT';
  END IF;
END
$guard$;

-- Storage must be able to represent a founding-owner invitation.
-- Ordinary Enterprise managers remain unable to create owner invitations because
-- create_enterprise_invitation() keeps its existing non-owner role allowlist.
ALTER TABLE public.enterprise_invitations
  DROP CONSTRAINT enterprise_invitations_role_chk;

ALTER TABLE public.enterprise_invitations
  ADD CONSTRAINT enterprise_invitations_role_chk
  CHECK (role = ANY (ARRAY[
    'owner'::text,
    'admin'::text,
    'operations_manager'::text,
    'site_manager'::text,
    'reporter'::text,
    'viewer'::text
  ]));

CREATE TABLE IF NOT EXISTS fixeo_private.enterprise_provision_commands_v1 (
  actor_user_id uuid NOT NULL REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  enterprise_id uuid REFERENCES public.enterprise_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  result jsonb NOT NULL CHECK (jsonb_typeof(result)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_user_id,idempotency_key)
);

ALTER TABLE fixeo_private.enterprise_provision_commands_v1 OWNER TO postgres;
REVOKE ALL ON TABLE fixeo_private.enterprise_provision_commands_v1 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION fixeo_private._normalize_enterprise_phone_v1(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $fn$
  WITH x AS (
    SELECT pg_catalog.regexp_replace(pg_catalog.coalesce(p_value,''),'[^0-9]','','g') AS d
  )
  SELECT CASE
    WHEN pg_catalog.char_length(d)=10 AND pg_catalog.left(d,1)='0'
      THEN '212'||pg_catalog.substring(d FROM 2)
    ELSE d
  END
  FROM x;
$fn$;

ALTER FUNCTION fixeo_private._normalize_enterprise_phone_v1(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION fixeo_private._normalize_enterprise_phone_v1(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.admin_find_enterprise_owner_v1(p_query text)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  email text,
  phone text,
  global_role text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_query text;
  v_email text;
  v_phone text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SESSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF NOT fixeo_private._fixeo_is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  v_query := pg_catalog.btrim(pg_catalog.coalesce(p_query,''));
  IF pg_catalog.char_length(v_query) < 3 OR pg_catalog.char_length(v_query) > 320 THEN
    RETURN;
  END IF;

  v_email := pg_catalog.lower(v_query);
  v_phone := fixeo_private._normalize_enterprise_phone_v1(v_query);

  RETURN QUERY
  SELECT u.id,u.full_name,u.email,u.phone,u.role
  FROM public.users u
  WHERE u.id::text=v_query
     OR pg_catalog.lower(pg_catalog.btrim(pg_catalog.coalesce(u.email,'')))=v_email
     OR (
       v_phone <> ''
       AND fixeo_private._normalize_enterprise_phone_v1(u.phone)=v_phone
     )
  ORDER BY
    CASE WHEN u.id::text=v_query THEN 0
         WHEN pg_catalog.lower(pg_catalog.btrim(pg_catalog.coalesce(u.email,'')))=v_email THEN 1
         ELSE 2 END,
    u.id
  LIMIT 10;
END
$fn$;

ALTER FUNCTION public.admin_find_enterprise_owner_v1(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_find_enterprise_owner_v1(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_find_enterprise_owner_v1(text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION fixeo_private._admin_assign_founder_owner_v1(
  p_enterprise_id uuid,
  p_actor_user_id uuid,
  p_owner_user_id uuid,
  p_owner_email text,
  p_invitation_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_enterprise_status text;
  v_owner_email text;
  v_expires_at timestamptz;
  v_member_id uuid;
  v_user public.users%ROWTYPE;
  v_raw_token text;
  v_token_hash text;
  v_invitation_id uuid;
BEGIN
  SELECT ea.status INTO v_enterprise_status
  FROM public.enterprise_accounts ea
  WHERE ea.id=p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_found');
  END IF;
  IF v_enterprise_status <> 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_active');
  END IF;

  IF (p_owner_user_id IS NULL) = (p_owner_email IS NULL OR pg_catalog.btrim(p_owner_email)='') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','owner_target_required');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.enterprise_members em
    WHERE em.enterprise_id=p_enterprise_id
      AND em.role='owner'
      AND em.status IN ('active','invited','suspended')
  ) OR EXISTS (
    SELECT 1 FROM public.enterprise_invitations ei
    WHERE ei.enterprise_id=p_enterprise_id
      AND ei.role='owner'
      AND ei.status='pending'
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','founding_owner_already_set');
  END IF;

  IF p_owner_user_id IS NOT NULL THEN
    SELECT * INTO v_user
    FROM public.users u
    WHERE u.id=p_owner_user_id;

    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'reason','owner_user_not_found');
    END IF;

    INSERT INTO public.enterprise_members(
      enterprise_id,user_id,role,status,invited_by
    ) VALUES (
      p_enterprise_id,p_owner_user_id,'owner','active',p_actor_user_id
    )
    RETURNING id INTO v_member_id;

    RETURN pg_catalog.jsonb_build_object(
      'ok',true,
      'owner_state','active',
      'owner_user_id',p_owner_user_id,
      'owner_member_id',v_member_id,
      'owner_name',v_user.full_name,
      'owner_email',v_user.email,
      'owner_phone',v_user.phone
    );
  END IF;

  v_owner_email := pg_catalog.lower(pg_catalog.btrim(p_owner_email));
  -- FIXEO identities are phone-first. A founding invitation for a user
  -- who does not exist yet must target the deterministic internal email
  -- generated from the Moroccan WhatsApp number used by FIXEO Auth.
  IF v_owner_email !~ '^212[67][0-9]{8}@fixeo\.ma$'
  THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_owner_identifier');
  END IF;

  v_expires_at := pg_catalog.coalesce(p_invitation_expires_at,pg_catalog.now()+interval '7 days');
  IF v_expires_at <= pg_catalog.now()
     OR v_expires_at > pg_catalog.now()+interval '30 days'
  THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_expiry');
  END IF;

  v_raw_token := pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
  v_token_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(pg_catalog.lower(v_raw_token),'UTF8'),'sha256'),
    'hex'
  );

  INSERT INTO public.enterprise_invitations(
    enterprise_id,email_normalized,role,invited_by,target_user_id,
    token_hash,status,expires_at
  ) VALUES (
    p_enterprise_id,v_owner_email,'owner',p_actor_user_id,NULL,
    v_token_hash,'pending',v_expires_at
  )
  RETURNING id INTO v_invitation_id;

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,
    'owner_state','invitation_pending',
    'owner_email',v_owner_email,
    'owner_phone','+'||pg_catalog.split_part(v_owner_email,'@',1),
    'invitation_id',v_invitation_id,
    'invitation_token',v_raw_token,
    'expires_at',v_expires_at
  );
END
$fn$;

ALTER FUNCTION fixeo_private._admin_assign_founder_owner_v1(uuid,uuid,uuid,text,timestamp with time zone) OWNER TO postgres;
REVOKE ALL ON FUNCTION fixeo_private._admin_assign_founder_owner_v1(uuid,uuid,uuid,text,timestamp with time zone) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.admin_provision_enterprise_v1(
  p_name text,
  p_legal_name text,
  p_owner_user_id uuid,
  p_owner_email text,
  p_idempotency_key uuid,
  p_invitation_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor uuid;
  v_name text;
  v_legal_name text;
  v_owner_email text;
  v_hash text;
  v_existing_hash text;
  v_existing_result jsonb;
  v_enterprise_id uuid;
  v_owner jsonb;
  v_stored jsonb;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;
  IF NOT fixeo_private._fixeo_is_admin() THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;
  IF p_idempotency_key IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','idempotency_key_required');
  END IF;

  v_name := pg_catalog.btrim(pg_catalog.coalesce(p_name,''));
  IF pg_catalog.char_length(v_name) < 1 OR pg_catalog.char_length(v_name) > 200 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','name_invalid');
  END IF;

  IF p_legal_name IS NULL OR pg_catalog.btrim(p_legal_name)='' THEN
    v_legal_name := NULL;
  ELSE
    v_legal_name := pg_catalog.btrim(p_legal_name);
    IF pg_catalog.char_length(v_legal_name) > 300 THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'reason','legal_name_invalid');
    END IF;
  END IF;

  IF (p_owner_user_id IS NULL) = (p_owner_email IS NULL OR pg_catalog.btrim(p_owner_email)='') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','owner_target_required');
  END IF;

  v_owner_email := CASE
    WHEN p_owner_email IS NULL THEN NULL
    ELSE pg_catalog.lower(pg_catalog.btrim(p_owner_email))
  END;

  v_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        v_name||'|'||
        pg_catalog.coalesce(v_legal_name,'')||'|'||
        pg_catalog.coalesce(p_owner_user_id::text,'')||'|'||
        pg_catalog.coalesce(v_owner_email,'')||'|'||
        pg_catalog.coalesce(p_invitation_expires_at::text,''),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor::text||':'||p_idempotency_key::text,0)
  );

  SELECT c.request_hash,c.result
  INTO v_existing_hash,v_existing_result
  FROM fixeo_private.enterprise_provision_commands_v1 c
  WHERE c.actor_user_id=v_actor
    AND c.idempotency_key=p_idempotency_key;

  IF FOUND THEN
    IF v_existing_hash <> v_hash THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'reason','idempotency_conflict');
    END IF;
    RETURN v_existing_result || pg_catalog.jsonb_build_object(
      'replayed',true,
      'invitation_token',NULL,
      'token_available',false
    );
  END IF;

  INSERT INTO public.enterprise_accounts(name,legal_name,status,data_classification)
  VALUES(v_name,v_legal_name,'active','production')
  RETURNING id INTO v_enterprise_id;

  v_owner := fixeo_private._admin_assign_founder_owner_v1(
    v_enterprise_id,v_actor,p_owner_user_id,v_owner_email,p_invitation_expires_at
  );

  IF pg_catalog.coalesce((v_owner->>'ok')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'OWNER_ASSIGNMENT_FAILED:%',pg_catalog.coalesce(v_owner->>'reason','unknown');
  END IF;

  IF v_owner->>'owner_state'='invitation_pending' THEN
    PERFORM fixeo_private._write_enterprise_audit_event(
      v_enterprise_id,
      'member.invited',
      'enterprise_invitation',
      (v_owner->>'invitation_id')::uuid,
      NULL,
      pg_catalog.jsonb_build_object(
        'role','owner',
        'status','pending'
      ),
      pg_catalog.jsonb_build_object(
        'source','admin_provision_enterprise_v1',
        'founding_owner',true,
        'email',v_owner->>'owner_email'
      )
    );
  END IF;

  PERFORM fixeo_private._write_enterprise_audit_event(
    v_enterprise_id,
    'account.created',
    'enterprise_account',
    v_enterprise_id,
    NULL,
    pg_catalog.jsonb_build_object(
      'name',v_name,
      'legal_name',v_legal_name,
      'status','active'
    ),
    pg_catalog.jsonb_build_object(
      'source','admin_provision_enterprise_v1',
      'provisioned_by_admin',true,
      'owner_state',v_owner->>'owner_state',
      'founding_owner_user_id',v_owner->>'owner_user_id',
      'founding_owner_email',v_owner->>'owner_email'
    )
  );

  v_stored := pg_catalog.jsonb_build_object(
    'ok',true,
    'enterprise_id',v_enterprise_id,
    'enterprise_name',v_name,
    'legal_name',v_legal_name,
    'owner_state',v_owner->>'owner_state',
    'owner_user_id',v_owner->>'owner_user_id',
    'owner_member_id',v_owner->>'owner_member_id',
    'owner_name',v_owner->>'owner_name',
    'owner_email',v_owner->>'owner_email',
    'owner_phone',v_owner->>'owner_phone',
    'invitation_id',v_owner->>'invitation_id',
    'expires_at',v_owner->>'expires_at',
    'replayed',false,
    'token_available',(v_owner->>'invitation_token') IS NOT NULL
  );

  INSERT INTO fixeo_private.enterprise_provision_commands_v1(
    actor_user_id,idempotency_key,request_hash,enterprise_id,result
  ) VALUES (
    v_actor,p_idempotency_key,v_hash,v_enterprise_id,v_stored
  );

  RETURN v_stored ||
    CASE WHEN v_owner->>'invitation_token' IS NOT NULL
      THEN pg_catalog.jsonb_build_object('invitation_token',v_owner->>'invitation_token')
      ELSE '{}'::jsonb
    END;

EXCEPTION
  WHEN unique_violation THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','provisioning_conflict');
  WHEN OTHERS THEN
    RAISE WARNING '[admin_provision_enterprise_v1] error: % (SQLSTATE: %)',SQLERRM,SQLSTATE;
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END
$fn$;

ALTER FUNCTION public.admin_provision_enterprise_v1(text,text,uuid,text,uuid,timestamp with time zone) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_provision_enterprise_v1(text,text,uuid,text,uuid,timestamp with time zone) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_provision_enterprise_v1(text,text,uuid,text,uuid,timestamp with time zone) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.admin_assign_founder_owner_v1(
  p_enterprise_id uuid,
  p_owner_user_id uuid,
  p_owner_email text,
  p_invitation_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor uuid;
  v_owner jsonb;
  v_account_name text;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;
  IF NOT fixeo_private._fixeo_is_admin() THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  SELECT name INTO v_account_name
  FROM public.enterprise_accounts
  WHERE id=p_enterprise_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_found');
  END IF;

  v_owner := fixeo_private._admin_assign_founder_owner_v1(
    p_enterprise_id,v_actor,p_owner_user_id,p_owner_email,p_invitation_expires_at
  );

  IF pg_catalog.coalesce((v_owner->>'ok')::boolean,false) IS NOT TRUE THEN
    RETURN v_owner;
  END IF;

  IF v_owner->>'owner_state'='invitation_pending' THEN
    PERFORM fixeo_private._write_enterprise_audit_event(
      p_enterprise_id,
      'member.invited',
      'enterprise_invitation',
      (v_owner->>'invitation_id')::uuid,
      NULL,
      pg_catalog.jsonb_build_object('role','owner','status','pending'),
      pg_catalog.jsonb_build_object(
        'source','admin_assign_founder_owner_v1',
        'founding_owner',true,
        'email',v_owner->>'owner_email'
      )
    );
  END IF;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'account.updated',
    'enterprise_account',
    p_enterprise_id,
    pg_catalog.jsonb_build_object('owner_state','missing'),
    pg_catalog.jsonb_build_object(
      'owner_state',v_owner->>'owner_state',
      'owner_user_id',v_owner->>'owner_user_id',
      'owner_email',v_owner->>'owner_email'
    ),
    pg_catalog.jsonb_build_object(
      'source','admin_assign_founder_owner_v1',
      'provisioned_by_admin',true
    )
  );

  RETURN v_owner || pg_catalog.jsonb_build_object(
    'enterprise_id',p_enterprise_id,
    'enterprise_name',v_account_name
  );
END
$fn$;

ALTER FUNCTION public.admin_assign_founder_owner_v1(uuid,uuid,text,timestamp with time zone) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_assign_founder_owner_v1(uuid,uuid,text,timestamp with time zone) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_founder_owner_v1(uuid,uuid,text,timestamp with time zone) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.admin_get_enterprise_owner_state_v1(p_enterprise_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor uuid;
  v_account public.enterprise_accounts%ROWTYPE;
  v_member record;
  v_invitation record;
  v_state text;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;
  IF NOT fixeo_private._fixeo_is_admin() THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  SELECT * INTO v_account
  FROM public.enterprise_accounts
  WHERE id=p_enterprise_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_found');
  END IF;

  SELECT em.id AS member_id,em.user_id,em.status,u.full_name,u.email,u.phone
  INTO v_member
  FROM public.enterprise_members em
  JOIN public.users u ON u.id=em.user_id
  WHERE em.enterprise_id=p_enterprise_id
    AND em.role='owner'
    AND em.status IN ('active','invited','suspended')
  ORDER BY CASE em.status WHEN 'active' THEN 0 WHEN 'invited' THEN 1 ELSE 2 END,em.created_at
  LIMIT 1;

  SELECT ei.id,ei.email_normalized,ei.expires_at,ei.created_at
  INTO v_invitation
  FROM public.enterprise_invitations ei
  WHERE ei.enterprise_id=p_enterprise_id
    AND ei.role='owner'
    AND ei.status='pending'
  ORDER BY ei.created_at DESC
  LIMIT 1;

  v_state := CASE
    WHEN v_member.member_id IS NOT NULL THEN v_member.status
    WHEN v_invitation.id IS NOT NULL THEN 'invitation_pending'
    ELSE 'missing'
  END;

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,
    'enterprise_id',v_account.id,
    'enterprise_name',v_account.name,
    'legal_name',v_account.legal_name,
    'enterprise_status',v_account.status,
    'owner_state',v_state,
    'owner_member_id',v_member.member_id,
    'owner_user_id',v_member.user_id,
    'owner_name',v_member.full_name,
    'owner_email',CASE
      WHEN v_member.email IS NOT NULL THEN v_member.email
      WHEN v_invitation.email_normalized ~ '^[0-9]{12}@fixeo\.ma$' THEN NULL
      ELSE v_invitation.email_normalized
    END,
    'owner_phone',pg_catalog.coalesce(
      v_member.phone,
      CASE WHEN v_invitation.email_normalized ~ '^[0-9]{12}@fixeo\.ma$'
        THEN '+'||pg_catalog.split_part(v_invitation.email_normalized,'@',1)
        ELSE NULL END
    ),
    'invitation_id',v_invitation.id,
    'invitation_email',CASE
      WHEN v_invitation.email_normalized ~ '^[0-9]{12}@fixeo\.ma$' THEN NULL
      ELSE v_invitation.email_normalized
    END,
    'invitation_phone',CASE
      WHEN v_invitation.email_normalized ~ '^[0-9]{12}@fixeo\.ma$'
        THEN '+'||pg_catalog.split_part(v_invitation.email_normalized,'@',1)
      ELSE NULL
    END,
    'invitation_expires_at',v_invitation.expires_at
  );
END
$fn$;

ALTER FUNCTION public.admin_get_enterprise_owner_state_v1(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_get_enterprise_owner_state_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_get_enterprise_owner_state_v1(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.admin_rotate_founder_invitation_v1(
  p_enterprise_id uuid,
  p_invitation_id uuid,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor uuid;
  v_email text;
  v_status text;
  v_role text;
  v_expires_at timestamptz;
  v_raw_token text;
  v_hash text;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;
  IF NOT fixeo_private._fixeo_is_admin() THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  PERFORM 1 FROM public.enterprise_accounts
  WHERE id=p_enterprise_id AND status='active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_active');
  END IF;

  SELECT ei.email_normalized,ei.status,ei.role
  INTO v_email,v_status,v_role
  FROM public.enterprise_invitations ei
  WHERE ei.id=p_invitation_id
    AND ei.enterprise_id=p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invitation_not_found');
  END IF;
  IF v_status <> 'pending' OR v_role <> 'owner' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','founder_invitation_not_pending');
  END IF;

  v_expires_at := pg_catalog.coalesce(p_expires_at,pg_catalog.now()+interval '7 days');
  IF v_expires_at <= pg_catalog.now()
     OR v_expires_at > pg_catalog.now()+interval '30 days'
  THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_expiry');
  END IF;

  v_raw_token := pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
  v_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(pg_catalog.lower(v_raw_token),'UTF8'),'sha256'),
    'hex'
  );

  UPDATE public.enterprise_invitations
  SET token_hash=v_hash,
      expires_at=v_expires_at,
      updated_at=pg_catalog.now()
  WHERE id=p_invitation_id;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'member.invited',
    'enterprise_invitation',
    p_invitation_id,
    pg_catalog.jsonb_build_object('status','pending','role','owner'),
    pg_catalog.jsonb_build_object('status','pending','role','owner','expires_at',v_expires_at),
    pg_catalog.jsonb_build_object(
      'source','admin_rotate_founder_invitation_v1',
      'founding_owner',true,
      'token_rotated',true
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,
    'enterprise_id',p_enterprise_id,
    'invitation_id',p_invitation_id,
    'owner_email',v_email,
    'invitation_token',v_raw_token,
    'expires_at',v_expires_at
  );
END
$fn$;

ALTER FUNCTION public.admin_rotate_founder_invitation_v1(uuid,uuid,timestamp with time zone) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_rotate_founder_invitation_v1(uuid,uuid,timestamp with time zone) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_rotate_founder_invitation_v1(uuid,uuid,timestamp with time zone) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.admin_revoke_founder_invitation_v1(
  p_enterprise_id uuid,
  p_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor uuid;
  v_email text;
  v_status text;
  v_role text;
  v_target uuid;
  v_member_id uuid;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;
  IF NOT fixeo_private._fixeo_is_admin() THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  PERFORM 1 FROM public.enterprise_accounts
  WHERE id=p_enterprise_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_not_found');
  END IF;

  SELECT ei.email_normalized,ei.status,ei.role,ei.target_user_id
  INTO v_email,v_status,v_role,v_target
  FROM public.enterprise_invitations ei
  WHERE ei.id=p_invitation_id
    AND ei.enterprise_id=p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invitation_not_found');
  END IF;
  IF v_status <> 'pending' OR v_role <> 'owner' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','founder_invitation_not_pending');
  END IF;

  UPDATE public.enterprise_invitations
  SET status='revoked',
      revoked_at=pg_catalog.now(),
      revoked_by=v_actor,
      updated_at=pg_catalog.now()
  WHERE id=p_invitation_id;

  IF v_target IS NOT NULL THEN
    UPDATE public.enterprise_members
    SET status='removed',updated_at=pg_catalog.now()
    WHERE enterprise_id=p_enterprise_id
      AND user_id=v_target
      AND role='owner'
      AND status='invited'
    RETURNING id INTO v_member_id;
  END IF;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'member.invitation_revoked',
    'enterprise_invitation',
    p_invitation_id,
    pg_catalog.jsonb_build_object('status','pending','role','owner'),
    pg_catalog.jsonb_build_object('status','revoked','role','owner'),
    pg_catalog.jsonb_build_object(
      'source','admin_revoke_founder_invitation_v1',
      'founding_owner',true,
      'owner_email',v_email,
      'member_id',v_member_id
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,
    'enterprise_id',p_enterprise_id,
    'invitation_id',p_invitation_id,
    'owner_state','missing'
  );
END
$fn$;

ALTER FUNCTION public.admin_revoke_founder_invitation_v1(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_revoke_founder_invitation_v1(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_founder_invitation_v1(uuid,uuid) TO authenticated,service_role;

COMMIT;
