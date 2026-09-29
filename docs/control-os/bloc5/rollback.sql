-- Operational rollback: withdraw additive Bloc 5 reads only after reverting its UI/API.
-- Both server integrity guards intentionally remain installed and backwards compatible.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_user<>'postgres' OR (SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE oid=to_regprocedure('public.admin_settle_mission_v1(uuid,numeric,numeric,text)')) IS DISTINCT FROM 'c65636d6c39bc43e91818dc10f9f00fd' THEN RAISE EXCEPTION 'ROLLBACK_BASELINE_MISMATCH';END IF;
END $$;
DROP FUNCTION public.control_people_page_v1(jsonb,jsonb,integer),public.control_people_context_v1(text,uuid,uuid,integer),public.control_trust_page_v1(jsonb,jsonb,integer),public.control_trust_context_v1(text,uuid,uuid,integer),public.control_review_history_v1(text,uuid,jsonb,integer),public.control_quotes_page_v1(jsonb,jsonb,integer),public.control_quote_context_v1(text,uuid),public.control_finance_page_v1(jsonb,jsonb,integer),public.control_finance_context_v1(text,uuid,uuid,integer);
DROP FUNCTION fixeo_private.control_people_facts_v1(text,uuid),fixeo_private.control_quote_requirement_v1(uuid),fixeo_private.control_finance_facts_v1(uuid);
COMMIT;
