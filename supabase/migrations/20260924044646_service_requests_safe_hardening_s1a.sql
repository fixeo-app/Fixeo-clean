-- S1A EXACT REVIEW CANDIDATE. NOT APPLIED. Production authorization not given.
-- Recheck main and Production SHA 9fc7542c84a554f1c604e045322a374122f7daf0 READY.
-- Only service_requests grants and four named policies may change.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = public, pg_catalog;
LOCK TABLE public.service_requests IN SHARE ROW EXCLUSIVE MODE;
DO $s1a$
DECLARE
  stage integer;
  actual jsonb;
  expected jsonb;
  failed text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'S1A requires the audited postgres grantor';
  END IF;
  FOR stage IN 0..1 LOOP
    -- Stage 0: exact PRE-S1A guard. Stage 1: exact postconditions.
    expected := CASE WHEN stage=0
      THEN '{"roles":"d31d75f5a6351088c9f7332a1d20cc6d","table":"88ae00956afbe43734916c0ad0d7c4f2","columns":"ad813ed6e8d4fa4343ed7744a16a3a20","indexes":"025a1f7171a9ace4eac8ab21c055f1ee","policies":"73a13708f3bf2289dfbed5d5a69a92e3","triggers":"22372421c7e3155bc217a71b31a110d9","table_acl":"910be19a2013b4c937520b41c9e43230","column_acl":"d751713988987e9331980363e24189ce","constraints":"0ea55a572f8abae879fc6f57749033df","memberships":"d751713988987e9331980363e24189ce","effective_table":"30df084b981f5fb8703b5190838bdc62","effective_columns":"327aa3822d6ec2638e5ca6605f1f03ab"}'::jsonb
      ELSE '{"roles":"d31d75f5a6351088c9f7332a1d20cc6d","table":"88ae00956afbe43734916c0ad0d7c4f2","columns":"ad813ed6e8d4fa4343ed7744a16a3a20","indexes":"025a1f7171a9ace4eac8ab21c055f1ee","policies":"c8bf9bef1a542f220405995848d95d7c","triggers":"22372421c7e3155bc217a71b31a110d9","table_acl":"256e15d5bb98169a47bd9446c86f8012","column_acl":"94912e9c608a33c7b688477ab65564ca","constraints":"0ea55a572f8abae879fc6f57749033df","memberships":"d751713988987e9331980363e24189ce","effective_table":"f4aee00edc65e07b1596583b69957311","effective_columns":"2e0a16dc3c5782506e67c6a55aa4ea4a"}'::jsonb END;
    SELECT captured.contract INTO actual FROM (
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
    ) captured;
    SELECT string_agg(e.key, ', ' ORDER BY e.key) INTO failed
      FROM jsonb_each_text(expected) e
      WHERE md5(actual->>e.key) IS DISTINCT FROM e.value;
    IF failed IS NOT NULL THEN
      RAISE EXCEPTION 'S1A catalogue mismatch at stage %: %', stage, failed;
    END IF;
    IF stage=0 THEN
      REVOKE INSERT ON TABLE public.service_requests FROM anon;
      GRANT INSERT (service_category, city, description, status)
        ON TABLE public.service_requests TO anon;

      DROP POLICY anon_insert ON public.service_requests;
      ALTER POLICY anon_service_requests_insert ON public.service_requests
        WITH CHECK ((status = 'new'::text) AND (client_profile_id IS NULL));

      DROP POLICY artisan_assign_new_requests ON public.service_requests;
      ALTER POLICY artisan_update_assigned_requests ON public.service_requests
        USING (EXISTS (
          SELECT 1 FROM public.missions m
          JOIN public.artisans a ON ((m.artisan_profile_id)::text = (a.id)::text)
          WHERE (m.request_id = (service_requests.id)::text)
            AND ((a.owner_user_id)::text = (auth.uid())::text)
        ))
        WITH CHECK (EXISTS (
          SELECT 1 FROM public.missions m
          JOIN public.artisans a ON ((m.artisan_profile_id)::text = (a.id)::text)
          WHERE (m.request_id = (service_requests.id)::text)
            AND ((a.owner_user_id)::text = (auth.uid())::text)
        ));
    END IF;
  END LOOP;
END $s1a$;
COMMIT;
