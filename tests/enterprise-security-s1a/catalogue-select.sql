WITH t AS (
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
) AS contract
