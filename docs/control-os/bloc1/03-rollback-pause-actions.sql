-- Emergency operational rollback, only after explicit Production authorization.
-- Retains rows, audit, remittances, reviewed quotes and protective ACLs.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
REVOKE EXECUTE ON FUNCTION public.control_action_preview_v1(text,uuid,jsonb,uuid),public.control_action_execute_v1(uuid,boolean,uuid) FROM authenticated;
COMMIT;
-- Read-only Control and legitimate Client/Artisan/Enterprise authorities remain installed.
-- Do NOT restore anonymous Claims access, raw SR/Mission/Quote writes or old validated-on-acceptance code.
