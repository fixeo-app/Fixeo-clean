-- Forward recovery only after cause is corrected, tests pass and resumption is authorized.
BEGIN;
SET LOCAL lock_timeout='5s';
GRANT EXECUTE ON FUNCTION public.control_action_preview_v1(text,uuid,jsonb,uuid),public.control_action_execute_v1(uuid,boolean,uuid) TO authenticated;
COMMIT;
