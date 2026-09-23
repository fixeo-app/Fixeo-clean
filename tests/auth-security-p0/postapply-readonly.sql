-- Prepared only. No exploit attempts and no validation writes on Production.
-- Run after a separately authorized migration, then compare with the preflight.
BEGIN READ ONLY;
SET LOCAL search_path = public, pg_catalog;

SELECT schemaname,tablename,policyname,cmd,roles,qual,with_check
FROM pg_policies WHERE schemaname='public' AND policyname IN (
  'users_insert_own','profiles_insert_own','admin_all_service_requests',
  'admin_all_missions','admin_all_notifications','enterprise_leads_admin_select',
  'enterprise_leads_admin_update','ecr_admin_select') ORDER BY tablename,policyname;

-- Expected: six rows, canonical_admin=true for each; original commands/roles retained.
SELECT policyname,qual='is_admin()' AND (with_check IS NULL OR with_check='is_admin()') canonical_admin
FROM pg_policies WHERE schemaname='public' AND policyname IN (
  'admin_all_service_requests','admin_all_missions','admin_all_notifications',
  'enterprise_leads_admin_select','enterprise_leads_admin_update','ecr_admin_select');

-- Expected: only profiles.profiles_insert_own, whose check mirrors users.role.
SELECT DISTINCT p.polrelid::regclass table_name,p.polname
FROM pg_depend d JOIN pg_policy p ON d.classid='pg_policy'::regclass AND d.objid=p.oid
JOIN pg_attribute a ON a.attrelid=d.refobjid AND a.attnum=d.refobjsubid
WHERE d.refclassid='pg_class'::regclass AND d.refobjid='public.profiles'::regclass AND a.attname='role';

-- Expected: matches_expected=true in all 48 cells.
SELECT table_name,role_name,privilege,
  has_table_privilege(role_name,'public.'||table_name,privilege) allowed,
  has_table_privilege(role_name,'public.'||table_name,privilege) =
    (role_name='service_role' OR privilege IN ('SELECT','INSERT','UPDATE','DELETE')) matches_expected
FROM unnest(ARRAY['users','profiles']) table_name
CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) role_name
CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) privilege;

SELECT t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true)
FROM pg_trigger t WHERE NOT t.tgisinternal
  AND t.tgrelid IN ('public.users'::regclass,'public.profiles'::regclass);
SELECT pg_get_userbyid(proowner) owner,prosecdef,proconfig,proacl,pg_get_functiondef(oid)
FROM pg_proc WHERE oid=to_regprocedure('fixeo_private.enforce_profile_canonical_role_p0()');

-- Counts may evolve with normal traffic; the migration contains no data repair.
SELECT (SELECT count(*) FROM auth.users) auth_users,
  (SELECT count(*) FROM public.users) public_users,
  (SELECT count(*) FROM public.profiles) public_profiles,
  (SELECT count(*) FROM public.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE p.id IS NULL) users_without_profiles,
  (SELECT count(*) FROM public.profiles p LEFT JOIN public.users u ON u.id=p.id WHERE u.id IS NULL) profiles_without_users,
  (SELECT count(*) FROM public.users u JOIN public.profiles p ON p.id=u.id WHERE u.role IS DISTINCT FROM p.role) role_mismatches;

-- Compare with 27 preflight Enterprise/onboarding fingerprints + unchanged authority helpers.
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) arguments,
  p.proacl,md5(pg_get_functiondef(p.oid)) definition_md5
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','fixeo_private') AND
  (p.proname LIKE '%enterprise%' OR p.proname IN (
    'register_new_artisan','approve_artisan_claim','is_admin','_fixeo_is_admin',
    'prevent_non_admin_role_change','handle_new_user'))
ORDER BY 1,2,3;
ROLLBACK;
