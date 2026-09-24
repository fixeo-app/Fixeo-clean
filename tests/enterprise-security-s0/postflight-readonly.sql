-- Catalogue only. Never invokes a business/dispatch function or reads business rows.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = public, pg_catalog;
WITH captured AS (
WITH target_functions AS (
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
) AS contract
), checks AS (
 SELECT e.key AS check_name, e.value AS expected_md5,
 md5(c.contract->>e.key) AS actual_md5,
 md5(c.contract->>e.key) = e.value AS pass
 FROM captured c CROSS JOIN jsonb_each_text('{"policies":"57741de3e2d77d408bfafeb777834e05","triggers":"54e1d0cf96c413639e7de248e332d183","column_acl":"9e5791ff271403b7d7db9c7c741a42a7","constraints":"0f5f8e80395244eea2289b25bb7660be","schema_access":"0891ab6a658cf605bf691aacb854aaa5","table_effective":"0e6964ab4ed554b075faf4e545062a42","table_inventory":"61a17ef8a5931e31fbc0e1c4aef0c582","function_inventory":"a976c44dd112ccf30d6f7bb8a5296145","unprivileged_roles":"05b193a66e730ecc334ccfbc3093cb0d","all_function_definitions":"2e90810debf53c495e80bc72d14657c2","browser_role_memberships":"d751713988987e9331980363e24189ce"}'::jsonb) e
)
SELECT * FROM checks
UNION ALL SELECT 'ALL_CHECKS', NULL, NULL, bool_and(pass) FROM checks
ORDER BY check_name;
ROLLBACK;
