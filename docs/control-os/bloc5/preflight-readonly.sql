BEGIN READ ONLY;
SELECT jsonb_build_object(
 'at',now(),
 'functions',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),'sd',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'acl',p.proacl::text,'hash',md5(pg_get_functiondef(p.oid))) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','fixeo_private')),
 'relations',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl',c.relacl::text) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','fixeo_private') AND c.relkind IN('r','v','m','p')),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.schemaname,p.tablename,p.policyname) FROM pg_policies p WHERE p.schemaname IN('public','fixeo_private')),
 'migrations',(SELECT jsonb_agg(jsonb_build_object('version',version,'name',name) ORDER BY version) FROM supabase_migrations.schema_migrations),
 'orphans',(SELECT jsonb_agg(jsonb_build_object('id',m.id,'request_id',m.request_id,'hash',md5(to_jsonb(m)::text)) ORDER BY m.id) FROM public.missions m LEFT JOIN public.service_requests r ON r.id::text=m.request_id WHERE r.id IS NULL),
 'blocking_locks',(SELECT count(*) FROM pg_locks WHERE NOT granted)
) result;
COMMIT;
