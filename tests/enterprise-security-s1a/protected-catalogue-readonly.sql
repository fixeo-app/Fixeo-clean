BEGIN READ ONLY;
SET LOCAL search_path = public, pg_catalog;
SET LOCAL statement_timeout = '30s';
WITH full_contract AS (WITH target_functions AS (
 SELECT p.*,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind='f' AND p.proname ILIKE '%dispatch%'
), target_tables AS (
 SELECT c.* FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r' AND (c.relname LIKE 'enterprise_%' OR c.relname LIKE 'dispatch_%' OR c.relname IN
 ('service_requests','missions','notifications','quotes','payments','users','profiles','artisans','artisan_profiles','fixeo_pricing_offers_v1','estimator_context_redemptions'))
)
SELECT jsonb_build_object(
 'function_inventory',(SELECT jsonb_agg(jsonb_build_object(
  'signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
  'definition_md5',md5(pg_get_functiondef(p.oid)),'acl',
  (SELECT coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable)
   ORDER BY (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END) COLLATE "C",a.privilege_type COLLATE "C"),'[]') FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a),
  'execute',jsonb_build_object('PUBLIC',EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'),
   'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE'),'postgres',has_function_privilege('postgres',p.oid,'EXECUTE')))
  ORDER BY p.oid::regprocedure::text COLLATE "C") FROM target_functions p),
 'all_function_definitions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'md5',md5(pg_get_functiondef(p.oid))) ORDER BY p.oid::regprocedure::text COLLATE "C")
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','fixeo_private') AND p.prokind IN('f','p')),
 'table_inventory',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl',
  (SELECT coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable)
   ORDER BY (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END) COLLATE "C",a.privilege_type COLLATE "C"),'[]') FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a)) ORDER BY c.relname COLLATE "C") FROM target_tables c),
 'table_effective',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'role',r,'privilege',p,'allowed',has_table_privilege(r,c.oid,p)) ORDER BY c.relname COLLATE "C",r COLLATE "C",p COLLATE "C")
  FROM target_tables c CROSS JOIN unnest(ARRAY['anon','authenticated','service_role','postgres'])r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'])p),
 'column_acl',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'column',a.attname,'acl',a.attacl) ORDER BY c.relname COLLATE "C",a.attname COLLATE "C"),'[]')
  FROM target_tables c JOIN pg_attribute a ON a.attrelid=c.oid WHERE a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.tablename COLLATE "C",p.policyname COLLATE "C") FROM pg_policies p WHERE p.schemaname='public' AND p.tablename IN(SELECT relname FROM target_tables)),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,true)) ORDER BY t.tgrelid::regclass::text COLLATE "C",t.tgname COLLATE "C") FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN(SELECT oid FROM target_tables)),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('table',t.relname,'name',c.conname,'type',c.contype,'definition',pg_get_constraintdef(c.oid,true)) ORDER BY t.relname COLLATE "C",c.conname COLLATE "C") FROM pg_constraint c JOIN target_tables t ON t.oid=c.conrelid),
 'schema_access',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'role',r,'usage',has_schema_privilege(r,n.oid,'USAGE'),'create',has_schema_privilege(r,n.oid,'CREATE')) ORDER BY n.nspname COLLATE "C",r COLLATE "C")
  FROM pg_namespace n CROSS JOIN unnest(ARRAY['anon','authenticated','service_role','postgres'])r WHERE n.nspname IN('public','fixeo_private')),
 'unprivileged_roles',(SELECT jsonb_agg(jsonb_build_object('role',rolname,'superuser',rolsuper,'inherit',rolinherit,'bypassrls',rolbypassrls) ORDER BY rolname COLLATE "C") FROM pg_roles WHERE rolname IN('anon','authenticated','service_role')),
 'browser_role_memberships',(SELECT coalesce(jsonb_agg(jsonb_build_object('member',pg_get_userbyid(m.member),'parent',pg_get_userbyid(m.roleid),'inherit',m.inherit_option,'set',m.set_option) ORDER BY m.member,m.roleid),'[]') FROM pg_auth_members m WHERE m.member IN ('anon'::regrole,'authenticated'::regrole,'service_role'::regrole))
) AS contract), target_contract AS (WITH t AS (
  SELECT * FROM pg_catalog.pg_class WHERE oid='public.service_requests'::regclass
)
SELECT jsonb_build_object(
  'table', (SELECT jsonb_build_object('owner',pg_get_userbyid(relowner),'kind',relkind,
    'rls',relrowsecurity,'force_rls',relforcerowsecurity) FROM t),
  'columns', (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'position',a.attnum,
    'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,
    'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated)
    ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='public.service_requests'::regclass AND a.attnum>0 AND NOT a.attisdropped),
  'table_acl', (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),
    'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
    'privilege',a.privilege_type,'grantable',a.is_grantable)
    ORDER BY (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END) COLLATE "C",a.privilege_type COLLATE "C")
    FROM t CROSS JOIN LATERAL aclexplode(coalesce(t.relacl,acldefault('r',t.relowner)))a),
  'column_acl', (SELECT coalesce(jsonb_agg(jsonb_build_object('column',a.attname,'acl',a.attacl)
    ORDER BY a.attname COLLATE "C"),'[]') FROM pg_attribute a
    WHERE a.attrelid='public.service_requests'::regclass AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL),
  'effective_table', (SELECT jsonb_agg(jsonb_build_object('role',r,'privilege',p,
    'allowed',has_table_privilege(r,'public.service_requests',p)) ORDER BY r COLLATE "C",p COLLATE "C")
    FROM unnest(ARRAY['anon','authenticated','service_role','postgres'])r
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'])p),
  'effective_columns', (SELECT jsonb_agg(jsonb_build_object('role',r,'column',a.attname,'privilege',p,
    'allowed',has_column_privilege(r,a.attrelid,a.attnum,p)) ORDER BY r COLLATE "C",a.attname COLLATE "C",p COLLATE "C")
    FROM pg_attribute a CROSS JOIN unnest(ARRAY['anon','authenticated','service_role','postgres'])r
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES'])p
    WHERE a.attrelid='public.service_requests'::regclass AND a.attnum>0 AND NOT a.attisdropped),
  'policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname COLLATE "C")
    FROM pg_policies p WHERE schemaname='public' AND tablename='service_requests'),
  'triggers', (SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,
    'definition',pg_get_triggerdef(t.oid,true),'function',p.oid::regprocedure::text,
    'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'function_md5',md5(pg_get_functiondef(p.oid)))
    ORDER BY t.tgname COLLATE "C") FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE t.tgrelid='public.service_requests'::regclass AND NOT t.tgisinternal),
  'constraints', (SELECT jsonb_agg(jsonb_build_object('name',conname,'type',contype,
    'definition',pg_get_constraintdef(oid,true)) ORDER BY conname COLLATE "C")
    FROM pg_constraint WHERE conrelid='public.service_requests'::regclass),
  'indexes', (SELECT jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef)
    ORDER BY indexname COLLATE "C") FROM pg_indexes WHERE schemaname='public' AND tablename='service_requests'),
  'roles', (SELECT jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,
    'bypassrls',rolbypassrls,'inherit',rolinherit) ORDER BY rolname COLLATE "C")
    FROM pg_roles WHERE rolname IN('anon','authenticated','service_role')),
  'memberships', (SELECT coalesce(jsonb_agg(jsonb_build_object('member',pg_get_userbyid(member),
    'parent',pg_get_userbyid(roleid),'inherit',inherit_option,'set',set_option)
    ORDER BY pg_get_userbyid(member) COLLATE "C",pg_get_userbyid(roleid) COLLATE "C"),'[]')
    FROM pg_auth_members WHERE member IN('anon'::regrole,'authenticated'::regrole,'service_role'::regrole))
) AS contract)
SELECT jsonb_build_object('full',f.contract,'target',t.contract,
'function_security',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl,'md5',md5(pg_get_functiondef(p.oid))) ORDER BY p.oid::regprocedure::text COLLATE "C") FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','fixeo_private') AND p.prokind IN('f','p')),
'default_acl',(SELECT coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'type',d.defaclobjtype,'acl',d.defaclacl) ORDER BY d.defaclrole,d.defaclnamespace,d.defaclobjtype),'[]') FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace),
'rpc_acl',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'md5',md5(pg_get_functiondef(p.oid)),'PUBLIC',EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'),'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE'),'postgres',has_function_privilege('postgres',p.oid,'EXECUTE')) ORDER BY p.oid::regprocedure::text COLLATE "C") FROM pg_proc p WHERE p.oid IN('public.accept_my_dispatch_offer_v1(uuid)'::regprocedure,'public.get_my_dispatch_offers_v1()'::regprocedure,'public.create_enterprise_request(uuid,uuid,text,text,text)'::regprocedure)),
'grantor',current_user) AS evidence FROM full_contract f CROSS JOIN target_contract t;
COMMIT;
