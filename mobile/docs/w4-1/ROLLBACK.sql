-- MANUAL ONLY. Target: kqyhusnbybsukbcaoqtu. Disable the W4.1 Preview/proxy first.
BEGIN;
UPDATE fixeo_private.mobile_intelligence_config_v1 SET enabled=false WHERE singleton;
REVOKE ALL ON FUNCTION public.mobile_diagnostic_state_v1(text,text),
 public.mobile_estimator_offer_v1(text,text),public.confirm_mobile_estimator_request_v2(text,text),
 public.mobile_intelligence_quota_v1(text),public.dispatch_my_estimator_request_v1(uuid) FROM authenticated;
DROP POLICY w41_diagnostic_safe_insert ON storage.objects;
DROP POLICY w41_diagnostic_safe_select ON storage.objects;
DROP FUNCTION public.mobile_diagnostic_state_v1(text,text);
DROP FUNCTION public.mobile_estimator_offer_v1(text,text);
DROP FUNCTION public.confirm_mobile_estimator_request_v2(text,text);
DROP FUNCTION public.mobile_intelligence_quota_v1(text);
DROP FUNCTION public.dispatch_my_estimator_request_v1(uuid);
DROP FUNCTION fixeo_private.w41_media_access_v1(text,boolean);
DROP FUNCTION fixeo_private.w41_dispatch_v1(uuid);
DROP FUNCTION fixeo_private.w41_quota_v1(text);
DROP FUNCTION fixeo_private.w41_execute_v1(text,text,text);
DROP FUNCTION fixeo_private.w41_finalize_v1(jsonb);
DROP FUNCTION fixeo_private.w41_confirm_v1(jsonb);
DROP FUNCTION fixeo_private.w41_offer_v1(jsonb);
DROP FUNCTION fixeo_private.w41_diagnostic_v1(jsonb);
DROP FUNCTION fixeo_private.w41_limits_v1(uuid);
DROP FUNCTION fixeo_private.w41_verify_v1(text,text,text);
DROP FUNCTION fixeo_private.w41_client_v1();
-- Retain receipts/config and confirmed business data for review/retention.
-- No direct storage metadata deletion. Objects must be cleaned using Storage API.
COMMIT;
-- Separately revoke only the newly provisioned W4.1 Vault key and remove exactly
-- the seven W4.1 branch-scoped Preview env entries. Never alter global variables.
