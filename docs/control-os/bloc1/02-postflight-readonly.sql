-- Read-only metadata certification. No Production fixture, write or impersonation.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='15s';
DO $$ DECLARE t text; c record;
BEGIN
 FOREACH t IN ARRAY ARRAY['service_requests','missions','quotes'] LOOP
  IF has_table_privilege('authenticated','public.'||t,'INSERT,UPDATE,DELETE') OR has_any_column_privilege('authenticated','public.'||t,'INSERT,UPDATE') THEN RAISE EXCEPTION 'DIRECT_WRITE_GRANT_REMAINS: %',t; END IF;
 END LOOP;
 IF has_table_privilege('anon','public.claims_pending','SELECT') THEN RAISE EXCEPTION 'CLAIMS_ANON_EXPOSED'; END IF;
 IF has_table_privilege('authenticated','public.commission_remittances_v1','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'FINANCE_DIRECT_ACCESS'; END IF;
 FOR c IN SELECT oid,relname,reloptions FROM pg_class WHERE oid IN('public.claims_pending'::regclass,'public.artisans_available'::regclass,'public.artisan_review_stats'::regclass,'public.enterprise_sla_status'::regclass) LOOP
  IF NOT coalesce(c.reloptions @> ARRAY['security_invoker=true'],false) THEN RAISE EXCEPTION 'VIEW_OWNER_BYPASS: %',c.relname; END IF;
 END LOOP;
 IF NOT has_function_privilege('authenticated','public.control_action_execute_v1(uuid,boolean,uuid)','EXECUTE') OR has_function_privilege('anon','public.control_action_execute_v1(uuid,boolean,uuid)','EXECUTE') THEN RAISE EXCEPTION 'CONTROL_EXECUTE_ACL_INVALID'; END IF;
 IF has_function_privilege('authenticated','public.admin_commission_remittance_v1(uuid,text,uuid,integer,numeric,text,text,text)','EXECUTE') THEN RAISE EXCEPTION 'FINANCE_PREVIEW_BYPASS'; END IF;
END $$;
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,p.prosecdef,p.proconfig,p.proacl::text,md5(pg_get_functiondef(p.oid)) definition_md5
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN('public','fixeo_private') AND (p.proname LIKE 'control_%' OR p.proname IN('review_marketplace_quote_v1','admin_commission_remittance_v1','enterprise_request_sla_facts_v1')) ORDER BY 1,2,3;
COMMIT;
