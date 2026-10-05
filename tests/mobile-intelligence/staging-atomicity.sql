-- Operator-only proof on kqyhusnbybsukbcaoqtu. Always ROLLBACK.
-- Uses one existing W4.1 fixture Client/session; no service-role credential.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
CREATE FUNCTION pg_temp.w41_fault() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'W41_FORCED_AFTER_OWNER_ATTACH' USING ERRCODE='P9001'; END $$;
CREATE TRIGGER w41_fault AFTER UPDATE OF client_profile_id ON public.service_requests
FOR EACH ROW WHEN (NEW.description='W41_ATOMIC_ROLLBACK_FIXTURE') EXECUTE FUNCTION pg_temp.w41_fault();
CREATE TEMP TABLE w41_proof(result jsonb);
DO $$
DECLARE u uuid; sid uuid; oid uuid:=gen_random_uuid(); ctx text:='fxctx-'||replace(gen_random_uuid()::text,'-','');
  e text; mac text; signing_key text; t bigint:=floor(extract(epoch FROM clock_timestamp())); fault_seen boolean:=false;
BEGIN
 SELECT a.id,s.id INTO u,sid FROM auth.users a JOIN auth.sessions s ON s.user_id=a.id
 JOIN public.users p ON p.id=a.id AND p.role='client'
 WHERE a.email LIKE 'w41-0-%@example.invalid' ORDER BY s.created_at DESC LIMIT 1;
 IF u IS NULL THEN RAISE EXCEPTION 'Missing dedicated W41 staging fixture'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'session_id',sid,'role','authenticated')::text,true);
 e:=jsonb_build_object('v',1,'kid','w41-v1','aud','fixeo-mobile-w41','environment','staging',
 'project_ref','kqyhusnbybsukbcaoqtu','branch','feat/fixeo-mobile-w4-1-intelligence-gateway',
 'user_id',u,'operation','confirm','operation_id',oid,'issued_at',t,'expires_at',t+60,
 'payload',jsonb_build_object('kind','pricing','confirmation',jsonb_build_object(
 'p_context_id',ctx,'p_outcome_type','PRICE_READY','p_service_code','bricolage.visite_minimum',
 'p_session_id','w41-atomic-'||oid,'p_amount_mad',199,'p_city_slug','rabat','p_client_phone','0612345678',
 'p_description','W41_ATOMIC_ROLLBACK_FIXTURE','p_tracking_ref','FX-'||upper(substr(md5(oid::text),1,16)),
 'p_guest_token_hash',repeat('0',64))))::text;
 SELECT decrypted_secret INTO signing_key FROM vault.decrypted_secrets WHERE name='fixeo_w41_attestation_v1';
 mac:=encode(extensions.hmac(convert_to('fixeo-w41-attestation-v1:'||e,'UTF8'),convert_to(signing_key,'UTF8'),'sha256'),'hex');
 BEGIN
   PERFORM public.confirm_mobile_estimator_request_v2(e,mac);
 EXCEPTION WHEN SQLSTATE 'P9001' THEN fault_seen:=true;
 END;
 IF NOT fault_seen THEN RAISE EXCEPTION 'Fault injection not reached'; END IF;
 IF EXISTS(SELECT 1 FROM public.service_requests WHERE description='W41_ATOMIC_ROLLBACK_FIXTURE')
 OR EXISTS(SELECT 1 FROM public.estimator_context_redemptions WHERE context_id=ctx)
 OR EXISTS(SELECT 1 FROM fixeo_private.mobile_intelligence_receipts_v1 WHERE operation_id=oid)
 THEN RAISE EXCEPTION 'Partial commit detected'; END IF;
 INSERT INTO w41_proof VALUES(jsonb_build_object('forced_error_after_owner_attach',true,
 'request_rolled_back',true,'redemption_rolled_back',true,'receipt_rolled_back',true));
END $$;
SELECT result FROM w41_proof;
ROLLBACK;
