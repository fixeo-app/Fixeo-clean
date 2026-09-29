-- STAGING ONLY: synthetic server-producer contract on the real PostgreSQL schema.
-- Run after the Bloc 1 fixture. This does not activate AI, media, SMS or workers.
BEGIN;
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id='10000000-0000-4000-8000-000000000003' AND raw_app_meta_data->>'fixture_suite'='control-b1') OR
 EXISTS(SELECT 1 FROM auth.users WHERE raw_app_meta_data->>'fixture_suite' IS DISTINCT FROM 'control-b1') THEN RAISE EXCEPTION 'SYNTHETIC_STAGING_REQUIRED'; END IF;
END $$;
CREATE TEMP TABLE diagnostic_test_context(kind text,context jsonb);
CREATE TEMP TABLE diagnostic_test_results(kind text,result jsonb);
INSERT INTO fixeo_private.diagnostic_sessions_v1(id,guest_secret_hash,owner_key,city_slug,input,consent_version,expires_at)
SELECT ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,repeat('a',64),'g:'||repeat('a',64),'rabat',jsonb_build_object('description','SYNTHETIC_DIAGNOSTIC_RECETTE'),'diagnostic-privacy-v1',now()+interval '1 day' FROM generate_series(500,501)n;
INSERT INTO fixeo_private.diagnostic_runs_v1(id,session_id,revision,state,input_snapshot,result,provider,model,contract_version,reserved_micro_usd,finished_at)
SELECT ('20000000-0000-4000-8000-'||lpad((n+10)::text,12,'0'))::uuid,('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,1,'complete','{}',
 jsonb_build_object('safety',jsonb_build_object('version','fixeo-risk-routing-v2','level',CASE WHEN n=500 THEN 'CRITICAL' ELSE 'NORMAL' END,'stop',n=500,'urgency',CASE WHEN n=500 THEN 'now' ELSE 'normale' END,'signals',CASE WHEN n=500 THEN '["gas"]'::jsonb ELSE '[]'::jsonb END),'trade',jsonb_build_object('value','plomberie'),'questions','[]'::jsonb),
 'synthetic','synthetic','fixeo-diagnostic-v1',0,now() FROM generate_series(500,501)n;
UPDATE fixeo_private.diagnostic_sessions_v1 s SET state='ready',selected_run_id=r.id FROM fixeo_private.diagnostic_runs_v1 r WHERE r.session_id=s.id AND s.id IN('20000000-0000-4000-8000-000000000500','20000000-0000-4000-8000-000000000501');
INSERT INTO diagnostic_test_context SELECT CASE WHEN s.id='20000000-0000-4000-8000-000000000500' THEN 'critical' ELSE 'quote' END,jsonb_build_object('session_id',s.id,'run_id',s.selected_run_id,'revision',s.revision,'actor',s.owner_key,'acknowledged',true) FROM fixeo_private.diagnostic_sessions_v1 s WHERE s.id IN('20000000-0000-4000-8000-000000000500','20000000-0000-4000-8000-000000000501');
GRANT SELECT ON diagnostic_test_context TO service_role;
GRANT INSERT,SELECT ON diagnostic_test_results TO service_role;
SET LOCAL ROLE service_role;
INSERT INTO diagnostic_test_results SELECT kind,public.create_diagnostic_critical_request_v1(context,'0600000000','FX-SYNTHETIC-B1-CRITICAL',repeat('b',64),'fixeo-critical-ack-v1') FROM diagnostic_test_context WHERE kind='critical';
INSERT INTO diagnostic_test_results SELECT kind||'-retry',public.create_diagnostic_critical_request_v1(context,'0600000000','FX-SYNTHETIC-B1-CRITICAL',repeat('b',64),'fixeo-critical-ack-v1') FROM diagnostic_test_context WHERE kind='critical';
INSERT INTO diagnostic_test_results SELECT kind,public.create_diagnostic_quote_request_v1(context,'0600000000','FX-SYNTHETIC-B1-QUOTE',repeat('c',64),'SYNTHETIC_DIAGNOSTIC_QUOTE','plomberie','rabat') FROM diagnostic_test_context WHERE kind='quote';
INSERT INTO diagnostic_test_results SELECT kind||'-retry',public.create_diagnostic_quote_request_v1(context,'0600000000','FX-SYNTHETIC-B1-QUOTE',repeat('c',64),'SYNTHETIC_DIAGNOSTIC_QUOTE','plomberie','rabat') FROM diagnostic_test_context WHERE kind='quote';
RESET ROLE;
DO $$ DECLARE critical uuid; quote uuid; BEGIN
 SELECT (result->>'request_id')::uuid INTO critical FROM diagnostic_test_results WHERE kind='critical';
 SELECT (result->>'request_id')::uuid INTO quote FROM diagnostic_test_results WHERE kind='quote';
 IF critical IS NULL OR quote IS NULL OR critical=quote THEN RAISE EXCEPTION 'PRODUCERS_MUST_CREATE_REQUESTS'; END IF;
 IF (SELECT result->>'request_id' FROM diagnostic_test_results WHERE kind='critical-retry')<>critical::text OR
 (SELECT result->>'request_id' FROM diagnostic_test_results WHERE kind='quote-retry')<>quote::text THEN RAISE EXCEPTION 'RETRY_MUST_RETURN_SAME_REQUEST'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.service_requests WHERE id=critical AND urgency='now' AND data_classification='production' AND client_profile_id IS NULL) THEN RAISE EXCEPTION 'CRITICAL_GUEST_REQUEST_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.service_requests WHERE id=quote AND urgency='normale' AND data_classification='production') THEN RAISE EXCEPTION 'DIAGNOSTIC_QUOTE_REQUEST_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM fixeo_private.diagnostic_sessions_v1 WHERE id IN('20000000-0000-4000-8000-000000000500','20000000-0000-4000-8000-000000000501') AND state<>'bound') THEN RAISE EXCEPTION 'DIAGNOSTIC_BIND_REQUIRED'; END IF;
 IF has_function_privilege('authenticated','public.create_diagnostic_critical_request_v1(jsonb,text,text,text,text)','EXECUTE') OR has_function_privilege('anon','public.create_diagnostic_quote_request_v1(jsonb,text,text,text,text,text,text)','EXECUTE') THEN RAISE EXCEPTION 'SERVER_ONLY_ACL_REQUIRED'; END IF;
END $$;
COMMIT;
SELECT 'PASS' AS status,'real staging PostgreSQL; service_role server boundary; no live LLM/media' AS mode,kind,result->>'request_id' AS request_id FROM diagnostic_test_results ORDER BY kind;
