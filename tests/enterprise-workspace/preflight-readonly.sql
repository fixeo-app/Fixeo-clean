BEGIN READ ONLY;
SELECT jsonb_build_object(
'tables',(SELECT jsonb_agg(jsonb_build_object('name',name,'exists',to_regclass('public.'||name) IS NOT NULL,'rls',(SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.'||name)))) FROM unnest(ARRAY['enterprise_accounts','enterprise_members','enterprise_sites','enterprise_member_sites']) name),
'columns',(SELECT jsonb_agg(to_jsonb(c) ORDER BY table_name,ordinal_position) FROM (SELECT table_name,column_name,data_type,is_nullable,ordinal_position FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('enterprise_accounts','enterprise_members','enterprise_sites','enterprise_member_sites')) c),
'constraints',(SELECT jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,'definition',pg_get_constraintdef(oid))) FROM pg_constraint WHERE conrelid IN (to_regclass('public.enterprise_accounts'),to_regclass('public.enterprise_members'),to_regclass('public.enterprise_sites'),to_regclass('public.enterprise_member_sites'))),
'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public' AND (tablename IN ('enterprise_accounts','enterprise_members','enterprise_sites','enterprise_member_sites','users','profiles') OR policyname IN ('admin_all_service_requests','admin_all_missions','admin_all_notifications','enterprise_leads_admin_select','enterprise_leads_admin_update','ecr_admin_select'))),
'helpers',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND ((n.nspname='fixeo_private' AND (p.proname LIKE '%enterprise%' OR p.proname='_fixeo_is_admin' OR p.proname='enforce_profile_canonical_role_p0')) OR (n.nspname='public' AND p.proname='is_admin'))),
'grants',(SELECT jsonb_agg(jsonb_build_object('table',t,'role',r,'privilege',p,'allowed',has_table_privilege(r,to_regclass('public.'||t),p))) FROM unnest(ARRAY['users','profiles','enterprise_accounts','enterprise_members','enterprise_sites','enterprise_member_sites']) t CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p),
'profile_triggers',(SELECT jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid))) FROM pg_trigger WHERE tgrelid='public.profiles'::regclass AND NOT tgisinternal),
'schema_access',jsonb_build_object('public',has_schema_privilege('authenticated','public','USAGE'),'fixeo_private',has_schema_privilege('authenticated','fixeo_private','USAGE')),
'is_admin_md5',md5(pg_get_functiondef('public.is_admin()'::regprocedure))
) evidence;
ROLLBACK;

-- Additional P0 catalogue verification; no business data read or changed.
BEGIN READ ONLY;
SELECT jsonb_build_object(
'role_constraints',(SELECT jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid)) ORDER BY c.conname) FROM pg_constraint c WHERE c.conrelid IN ('public.users'::regclass,'public.profiles'::regclass) AND pg_get_constraintdef(c.oid) ILIKE '%role%'),
'role_triggers',(SELECT jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid IN ('public.users'::regclass,'public.profiles'::regclass) AND NOT t.tgisinternal AND (pg_get_triggerdef(t.oid) ILIKE '%role%' OR t.tgname ILIKE '%canonical%')),
'protect_role',pg_get_functiondef('public.prevent_non_admin_role_change()'::regprocedure),
'rls',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'enabled',c.relrowsecurity)) FROM pg_class c WHERE c.oid IN ('public.users'::regclass,'public.profiles'::regclass))
) AS evidence;
ROLLBACK;
