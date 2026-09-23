-- FIXEO AUTH SECURITY P0 -- PROPOSAL ONLY, NOT APPLIED.
-- Baseline main/production: bc927b9c24d709ab76e55cd2c82210194da30026.
-- Requires explicit production authorization. No user or business row is repaired.
-- Existing constraints, CRUD grants, service_role and Enterprise RPCs stay intact.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = public, pg_catalog;

LOCK TABLE public.users, public.profiles, public.service_requests,
  public.missions, public.notifications, public.enterprise_leads,
  public.estimator_context_redemptions IN SHARE ROW EXCLUSIVE MODE;

DO $preflight$
DECLARE
  expected jsonb := $snapshot$[{"cmd":"SELECT","qual":"(EXISTS ( SELECT 1\n   FROM profiles\n  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))","roles":["authenticated"],"tablename":"enterprise_leads","permissive":"PERMISSIVE","policyname":"enterprise_leads_admin_select","schemaname":"public","with_check":null},{"cmd":"UPDATE","qual":"(EXISTS ( SELECT 1\n   FROM profiles\n  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))","roles":["authenticated"],"tablename":"enterprise_leads","permissive":"PERMISSIVE","policyname":"enterprise_leads_admin_update","schemaname":"public","with_check":"(EXISTS ( SELECT 1\n   FROM profiles\n  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))"},{"cmd":"SELECT","qual":"(EXISTS ( SELECT 1\n   FROM profiles\n  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))","roles":["authenticated"],"tablename":"estimator_context_redemptions","permissive":"PERMISSIVE","policyname":"ecr_admin_select","schemaname":"public","with_check":null},{"cmd":"ALL","qual":"((EXISTS ( SELECT 1\n   FROM users u\n  WHERE (((u.id)::text = (auth.uid())::text) AND (u.role = 'admin'::text)))) OR (EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE (((p.id)::text = (auth.uid())::text) AND (p.role = 'admin'::text)))))","roles":["authenticated"],"tablename":"missions","permissive":"PERMISSIVE","policyname":"admin_all_missions","schemaname":"public","with_check":"((EXISTS ( SELECT 1\n   FROM users u\n  WHERE (((u.id)::text = (auth.uid())::text) AND (u.role = 'admin'::text)))) OR (EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE (((p.id)::text = (auth.uid())::text) AND (p.role = 'admin'::text)))))"},{"cmd":"ALL","qual":"(EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE (((p.id)::text = (auth.uid())::text) AND (p.role = 'admin'::text))))","roles":["authenticated"],"tablename":"notifications","permissive":"PERMISSIVE","policyname":"admin_all_notifications","schemaname":"public","with_check":"(EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE (((p.id)::text = (auth.uid())::text) AND (p.role = 'admin'::text))))"},{"cmd":"INSERT","qual":null,"roles":["authenticated"],"tablename":"profiles","permissive":"PERMISSIVE","policyname":"profiles_insert_own","schemaname":"public","with_check":"(auth.uid() = id)"},{"cmd":"ALL","qual":"((EXISTS ( SELECT 1\n   FROM users u\n  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text)))) OR (EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))))","roles":["authenticated"],"tablename":"service_requests","permissive":"PERMISSIVE","policyname":"admin_all_service_requests","schemaname":"public","with_check":"((EXISTS ( SELECT 1\n   FROM users u\n  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text)))) OR (EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))))"},{"cmd":"INSERT","qual":null,"roles":["authenticated"],"tablename":"users","permissive":"PERMISSIVE","policyname":"users_insert_own","schemaname":"public","with_check":"(auth.uid() = id)"}]$snapshot$::jsonb;
  item jsonb;
  actual jsonb;
  r record;
BEGIN
  IF current_user <> 'postgres' OR current_setting('server_version_num')::integer < 170000 THEN
    RAISE EXCEPTION 'P0 requires the reviewed postgres owner and PostgreSQL >= 17';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(expected) LOOP
    SELECT to_jsonb(p) INTO actual FROM pg_policies p
    WHERE schemaname=item->>'schemaname' AND tablename=item->>'tablename'
      AND policyname=item->>'policyname';
    IF actual IS DISTINCT FROM item THEN
      RAISE EXCEPTION 'P0 policy drift: %.%',item->>'tablename',item->>'policyname';
    END IF;
  END LOOP;
  -- Detect a newly permissive identity policy, not only changes to the two INSERTs.
  SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) INTO actual
    FROM pg_policies p WHERE schemaname='public' AND tablename IN ('users','profiles');
  IF actual IS DISTINCT FROM $identity$[{"cmd":"ALL","qual":"is_admin()","roles":["authenticated"],"tablename":"profiles","permissive":"PERMISSIVE","policyname":"profiles_admin_all","schemaname":"public","with_check":"is_admin()"},{"cmd":"INSERT","qual":null,"roles":["authenticated"],"tablename":"profiles","permissive":"PERMISSIVE","policyname":"profiles_insert_own","schemaname":"public","with_check":"(auth.uid() = id)"},{"cmd":"SELECT","qual":"(auth.uid() = id)","roles":["authenticated"],"tablename":"profiles","permissive":"PERMISSIVE","policyname":"profiles_select_own","schemaname":"public","with_check":null},{"cmd":"UPDATE","qual":"(auth.uid() = id)","roles":["authenticated"],"tablename":"profiles","permissive":"PERMISSIVE","policyname":"profiles_update_own","schemaname":"public","with_check":"(auth.uid() = id)"},{"cmd":"ALL","qual":"is_admin()","roles":["authenticated"],"tablename":"users","permissive":"PERMISSIVE","policyname":"users_admin_all","schemaname":"public","with_check":"is_admin()"},{"cmd":"INSERT","qual":null,"roles":["authenticated"],"tablename":"users","permissive":"PERMISSIVE","policyname":"users_insert_own","schemaname":"public","with_check":"(auth.uid() = id)"},{"cmd":"SELECT","qual":"(auth.uid() = id)","roles":["authenticated"],"tablename":"users","permissive":"PERMISSIVE","policyname":"users_select_own","schemaname":"public","with_check":null},{"cmd":"UPDATE","qual":"(auth.uid() = id)","roles":["authenticated"],"tablename":"users","permissive":"PERMISSIVE","policyname":"users_update_own","schemaname":"public","with_check":"(auth.uid() = id)"}]$identity$::jsonb THEN
    RAISE EXCEPTION 'P0 identity policy set changed';
  END IF;
  SELECT jsonb_agg(to_jsonb(x) ORDER BY table_name) INTO actual FROM (
    SELECT conrelid::regclass::text table_name,conname,pg_get_constraintdef(oid,true) definition
    FROM pg_constraint WHERE conrelid IN ('public.users'::regclass,'public.profiles'::regclass)
      AND conname IN ('users_role_check','profiles_role_check')) x;
  IF actual IS DISTINCT FROM $constraints$[{"conname":"profiles_role_check","definition":"CHECK (role = ANY (ARRAY['client'::text, 'artisan'::text, 'admin'::text]))","table_name":"profiles"},{"conname":"users_role_check","definition":"CHECK (role = ANY (ARRAY['admin'::text, 'artisan'::text, 'client'::text]))","table_name":"users"}]$constraints$::jsonb THEN
    RAISE EXCEPTION 'P0 role constraint drift';
  END IF;
  SELECT jsonb_agg(to_jsonb(x) ORDER BY table_name) INTO actual FROM (
    SELECT t.tgrelid::regclass::text table_name,t.tgname,t.tgenabled,
      pg_get_triggerdef(t.oid,true) definition,t.tgfoid::regprocedure::text function_name
    FROM pg_trigger t WHERE t.tgrelid IN ('public.users'::regclass,'public.profiles'::regclass)
      AND NOT t.tgisinternal) x;
  IF actual IS DISTINCT FROM $triggers$[{"tgname":"protect_profiles_role","tgenabled":"O","definition":"CREATE TRIGGER protect_profiles_role BEFORE UPDATE OF role ON profiles FOR EACH ROW EXECUTE FUNCTION prevent_non_admin_role_change()","table_name":"profiles","function_name":"prevent_non_admin_role_change()"},{"tgname":"protect_users_role","tgenabled":"O","definition":"CREATE TRIGGER protect_users_role BEFORE UPDATE OF role ON users FOR EACH ROW EXECUTE FUNCTION prevent_non_admin_role_change()","table_name":"users","function_name":"prevent_non_admin_role_change()"}]$triggers$::jsonb THEN
    RAISE EXCEPTION 'P0 identity trigger set changed';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute
      WHERE attrelid IN ('public.users'::regclass,'public.profiles'::regclass) AND attacl IS NOT NULL)
    OR EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
      WHERE c.oid IN ('public.users'::regclass,'public.profiles'::regclass)
        AND (a.is_grantable OR a.grantee NOT IN
          (SELECT oid FROM pg_roles WHERE rolname IN ('postgres','anon','authenticated','service_role'))))
  THEN RAISE EXCEPTION 'P0 unreviewed identity table/column ACL'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles role_entry CROSS JOIN pg_namespace n
      WHERE role_entry.rolname IN ('anon','authenticated') AND n.nspname IN ('public','fixeo_private')
      AND has_schema_privilege(role_entry.oid,n.oid,'CREATE')) THEN
    RAISE EXCEPTION 'P0 untrusted schema CREATE privilege';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_depend d JOIN pg_policy p
      ON d.classid='pg_policy'::regclass AND d.objid=p.oid
    JOIN pg_attribute a ON a.attrelid=d.refobjid AND a.attnum=d.refobjsubid
    WHERE d.refclassid='pg_class'::regclass AND d.refobjid='public.profiles'::regclass
      AND a.attname='role'
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(expected) e
        WHERE e->>'policyname'=p.polname
          AND to_regclass(format('%I.%I',e->>'schemaname',e->>'tablename'))=p.polrelid)
  ) THEN RAISE EXCEPTION 'P0 unreviewed profiles.role policy dependency'; END IF;
  IF md5(pg_get_functiondef('public.is_admin()'::regprocedure)) <> '1986929dce09806c133d90b1bf480e1d'
    OR md5(pg_get_functiondef('public.prevent_non_admin_role_change()'::regprocedure)) <> '19cecb13800d2ebbe7f7881b7f9ef8be'
    OR md5(pg_get_functiondef('public.handle_new_user()'::regprocedure)) <> '75b3739d38ea4ae3bdfd9f8ea4db2a8d'
  THEN RAISE EXCEPTION 'P0 canonical helper/trigger function drift'; END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid IN ('public.users'::regclass,'public.profiles'::regclass)
    AND (NOT relrowsecurity OR relforcerowsecurity OR pg_get_userbyid(relowner)<>'postgres')) THEN
    RAISE EXCEPTION 'P0 identity RLS/owner drift';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O'
      AND tgfoid='public.prevent_non_admin_role_change()'::regprocedure
      AND ((tgrelid='public.users'::regclass AND tgname='protect_users_role')
        OR (tgrelid='public.profiles'::regclass AND tgname='protect_profiles_role'))) <> 2
  THEN RAISE EXCEPTION 'P0 existing role-update protection missing'; END IF;
  IF to_regprocedure('fixeo_private.enforce_profile_canonical_role_p0()') IS NOT NULL THEN
    RAISE EXCEPTION 'P0 already installed or function name conflict';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles p LEFT JOIN public.users u ON u.id=p.id
      WHERE u.id IS NULL OR p.role IS DISTINCT FROM u.role) THEN
    RAISE EXCEPTION 'P0 existing orphan/mismatched profile; separate review required';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member IN
      (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated'))) THEN
    RAISE EXCEPTION 'P0 client role inheritance changed';
  END IF;
  FOR r IN SELECT t,role_name,priv FROM unnest(ARRAY['users','profiles']) t
    CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) role_name
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) priv
  LOOP
    IF NOT has_table_privilege(r.role_name,'public.'||r.t,r.priv) THEN
      RAISE EXCEPTION 'P0 ACL drift: % %.%',r.role_name,r.t,r.priv;
    END IF;
  END LOOP;
END;
$preflight$;

-- Missing canonical identities cannot self-assign a privileged role.
-- Auth's trusted signup trigger still creates client/artisan identities.
ALTER POLICY users_insert_own ON public.users
  WITH CHECK (auth.uid() = id AND role = 'client');

-- Defense in depth: a self-created profile must mirror the caller's users row.
ALTER POLICY profiles_insert_own ON public.profiles
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT u.role FROM public.users u WHERE u.id = auth.uid())
  );

-- Applies to every profile insertion, including old cached JS and trusted callers.
-- Also prevents an explicit profile role/id update from introducing a second role.
-- No auth.uid() precondition: trusted signup runs without a user JWT.
-- RLS still checks the caller/target id; this trigger grants no access and exposes no RPC.
CREATE FUNCTION fixeo_private.enforce_profile_canonical_role_p0()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  canonical_role text;
BEGIN
  SELECT u.role INTO canonical_role FROM public.users u WHERE u.id = NEW.id;
  IF NOT FOUND OR canonical_role IS NULL
     OR canonical_role NOT IN ('admin','artisan','client') THEN
    RAISE EXCEPTION 'canonical_identity_missing_or_invalid' USING ERRCODE='23514';
  END IF;
  NEW.role := canonical_role;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION fixeo_private.enforce_profile_canonical_role_p0() OWNER TO postgres;
REVOKE ALL ON FUNCTION fixeo_private.enforce_profile_canonical_role_p0()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER enforce_profiles_canonical_role_p0
  BEFORE INSERT OR UPDATE OF id, role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION fixeo_private.enforce_profile_canonical_role_p0();

ALTER POLICY "enterprise_leads_admin_select" ON public.enterprise_leads
  USING (public.is_admin());

ALTER POLICY "enterprise_leads_admin_update" ON public.enterprise_leads
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER POLICY "ecr_admin_select" ON public.estimator_context_redemptions
  USING (public.is_admin());

ALTER POLICY "admin_all_missions" ON public.missions
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER POLICY "admin_all_notifications" ON public.notifications
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER POLICY "admin_all_service_requests" ON public.service_requests
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Remove exactly 16 excessive client-role privileges. Keep every CRUD grant.
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLE public.users, public.profiles FROM anon, authenticated;

DO $postconditions$
DECLARE r record;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_depend d JOIN pg_policy p
      ON d.classid='pg_policy'::regclass AND d.objid=p.oid
    JOIN pg_attribute a ON a.attrelid=d.refobjid AND a.attnum=d.refobjsubid
    WHERE d.refclassid='pg_class'::regclass AND d.refobjid='public.profiles'::regclass
      AND a.attname='role'
      AND NOT (p.polrelid='public.profiles'::regclass AND p.polname='profiles_insert_own')
  ) THEN RAISE EXCEPTION 'P0 noncanonical role policy remains'; END IF;
  FOR r IN SELECT t,role_name,priv FROM unnest(ARRAY['users','profiles']) t
    CROSS JOIN unnest(ARRAY['anon','authenticated']) role_name
    CROSS JOIN unnest(ARRAY['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) priv
  LOOP
    IF has_table_privilege(r.role_name,'public.'||r.t,r.priv) THEN
      RAISE EXCEPTION 'P0 excessive effective privilege remains: % %.%',r.role_name,r.t,r.priv;
    END IF;
  END LOOP;
  FOR r IN SELECT t,role_name,priv FROM unnest(ARRAY['users','profiles']) t
    CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) role_name
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) priv
  LOOP
    IF NOT has_table_privilege(r.role_name,'public.'||r.t,r.priv) THEN
      RAISE EXCEPTION 'P0 CRUD grant changed: % %.%',r.role_name,r.t,r.priv;
    END IF;
  END LOOP;
  FOR r IN SELECT t,priv FROM unnest(ARRAY['users','profiles']) t
    CROSS JOIN unnest(ARRAY['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) priv
  LOOP
    IF NOT has_table_privilege('service_role','public.'||r.t,r.priv) THEN
      RAISE EXCEPTION 'P0 service_role grant changed: %.%',r.t,r.priv;
    END IF;
  END LOOP;
END;
$postconditions$;
COMMIT;
