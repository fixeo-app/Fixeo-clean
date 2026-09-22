-- READ ONLY after all four migrations and the authorized private bucket creation.
BEGIN TRANSACTION READ ONLY;
SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id='diagnostic-private-v1';
SELECT c.relname,c.relrowsecurity,c.relacl,
 has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
 has_table_privilege('authenticated',c.oid,'SELECT') AS user_select,
 has_table_privilege('service_role',c.oid,'SELECT') AS server_direct_select
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='fixeo_private' AND c.relkind='r' AND c.relname LIKE 'diagnostic_%';
SELECT n.nspname,p.proname,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS user_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS server_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname IN ('public','fixeo_private') AND p.proname LIKE '%diagnostic%')
 OR (n.nspname='fixeo_private' AND p.proname='confirm_estimator_request_core_v1');
SELECT tgname,tgenabled,pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='public.service_requests'::regclass AND NOT tgisinternal;
SELECT (SELECT count(*) FROM public.service_requests) AS requests,(SELECT count(*) FROM public.missions) AS missions;
DO $guard$
BEGIN
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='fixeo_private' AND c.relkind='r' AND c.relname IN
   ('diagnostic_sessions_v1','diagnostic_media_v1','diagnostic_runs_v1','diagnostic_usage_windows_v1'))<>4
  THEN RAISE EXCEPTION 'Diagnostic tables missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='diagnostic-private-v1' AND NOT public AND file_size_limit=8388608
  AND allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp']) THEN RAISE EXCEPTION 'Private bucket mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='fixeo_private' AND c.relkind='r'
  AND c.relname LIKE 'diagnostic_%' AND (NOT c.relrowsecurity OR has_table_privilege('anon',c.oid,'SELECT')
   OR has_table_privilege('authenticated',c.oid,'SELECT') OR has_table_privilege('service_role',c.oid,'SELECT')))
  THEN RAISE EXCEPTION 'Diagnostic direct access is not sealed'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','fixeo_private') AND p.proname LIKE '%diagnostic%'
   AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE')))
  THEN RAISE EXCEPTION 'Diagnostic function exposed to a browser role'; END IF;
END $guard$;
ROLLBACK;
