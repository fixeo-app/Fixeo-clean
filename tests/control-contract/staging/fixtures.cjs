'use strict';
// Synthetic fixture generator, never a Production migration.
const fs=require('node:fs');
const [ref,out]=process.argv.slice(2);
if(ref!=='kqyhusnbybsukbcaoqtu'||!out)throw Error('APPROVED_STAGING_REQUIRED');
const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0');
const user=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const sql=[`BEGIN; SET LOCAL statement_timeout='120s';
DO $gate$ BEGIN
 IF (SELECT count(*) FROM auth.users WHERE raw_app_meta_data->>'fixture_suite'='control-b1')<>16 OR EXISTS(SELECT 1 FROM auth.users WHERE raw_app_meta_data->>'fixture_suite' IS DISTINCT FROM 'control-b1') THEN RAISE EXCEPTION 'SYNTHETIC_AUTH_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM public.service_requests) OR EXISTS(SELECT 1 FROM public.artisans) THEN RAISE EXCEPTION 'EMPTY_FIXTURE_TABLES_REQUIRED'; END IF;
END $gate$;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT set_config('fixeo.enterprise_dispatch_deferred','on',true);
INSERT INTO public.artisans(id,owner_user_id,full_name,phone,city,service_category,claimed,claim_status,onboarding_completed,availability,verified,data_classification)
VALUES('${id(20)}','${user(2)}','ARTISAN_SYNTHETIC','+000000000002','Fès','plomberie',true,'approved',true,'available',false,'test'),
('${id(21)}','${user(12)}','ARTISAN_OTHER_SYNTHETIC','+000000000012','Fès','plomberie',true,'approved',true,'available',true,'test');
INSERT INTO public.artisans(id,legacy_id,full_name,city,service_category,claimed,claim_status,onboarding_completed,availability,verified,data_classification)
VALUES('${id(22)}','control-b1-legacy-claim','UNCLAIMED_SYNTHETIC','Fès','plomberie',false,'pending',false,'unavailable',false,'test'),
('${id(23)}','control-b1-concurrent-claim','CONCURRENT_CLAIM_SYNTHETIC','Rabat','electricite',false,'pending',false,'unavailable',false,'internal'),
('${id(24)}','control-b1-legacy-verification','LEGACY_VERIFIED_SYNTHETIC','Fès','plomberie',false,'pending',false,'unavailable',false,NULL);
-- Explicit simulation of a historical divergence, confined to this seed
-- transaction. The canonical trigger is restored before any authenticated test.
ALTER TABLE public.artisans DISABLE TRIGGER verified_canonical_v1;
UPDATE public.artisans SET is_verified=true WHERE id='${id(24)}';
ALTER TABLE public.artisans ENABLE TRIGGER verified_canonical_v1;
INSERT INTO public.artisan_service_categories(artisan_id,service_category) VALUES('${id(20)}','plomberie'),('${id(20)}','electricite'),('${id(21)}','plomberie');
INSERT INTO public.artisan_service_cities(artisan_id,city) VALUES('${id(20)}','Fès'),('${id(20)}','Rabat'),('${id(21)}','Fès');
INSERT INTO public.service_requests(id,client_profile_id,city,service_category,description,status,urgency,data_classification)
SELECT ('20000000-0000-4000-8000-'||lpad((10000+i)::text,12,'0'))::uuid,'${user(1)}','SYNTHETIC_VOLUME','plomberie','CONTROL_B1_VOLUME_SYNTHETIC',
(ARRAY['new','assigned','in_progress','completed','validated','cancelled','no_match'])[1+(i%7)],
(ARRAY['now','urgent','normale',NULL])[1+(i%4)],
(ARRAY['production','test','internal',NULL])[1+(i%4)] FROM generate_series(1,800) i;
`];
const requests=[...Array.from({length:25},(_,n)=>[100+n,'new']),[150,'assigned'],[151,'in_progress'],[152,'completed'],[153,'validated'],[154,'validated'],[155,'cancelled'],[156,'new'],[157,'new'],[160,'completed'],[162,'completed'],[170,'new'],[171,'new'],[172,'new'],[173,'new']];
for(const [n,status] of requests)sql.push(`INSERT INTO public.service_requests(id,client_profile_id,city,service_category,description,status,urgency,data_classification) VALUES('${id(n)}','${user(1)}','Fès','plomberie','CONTROL_B1_REQUEST_${n}_SYNTHETIC','${status}','${n%3===0?'now':n%3===1?'urgent':'normale'}','test');`);
sql.push(`INSERT INTO public.service_requests(id,city,service_category,description,status,urgency,data_classification) VALUES('${id(180)}','Fès','plomberie','GUEST_INTAKE_SYNTHETIC','new',NULL,'test');`);
const missions=[[600,150,'pending'],[601,151,'pending'],[602,152,'done'],[603,153,'validated'],[604,154,'validated'],[605,155,'cancelled'],[606,156,'declined'],[607,157,'expired'],[610,104,'offered'],[612,105,'offered'],[620,160,'done'],[622,162,'done'],[630,170,'offered']];
for(const [n,r,status] of missions)sql.push(`INSERT INTO public.missions(id,request_id,client_profile_id,artisan_profile_id,status,agreed_price,accepted_at,started_at,completed_at,validated_at,final_price) VALUES('${id(n)}','${id(r)}','${user(1)}','${id(20)}','${status}',1000,${['pending','done','validated'].includes(status)?"now()-interval '2 hours'":'NULL'},${n===601||n===603?"now()-interval '1 hour'":'NULL'},${n===603?"now()-interval '10 minutes'":'NULL'},${n===603?'now()':'NULL'},${n===604?'1000':'NULL'});`);
sql.push(`INSERT INTO public.quotes(id,request_id,artisan_profile_id,proposed_price,status,review_status,service_description) VALUES('${id(720)}','${id(103)}','${id(20)}',1000,'accepted','legacy_unreviewed','LEGACY_QUOTE_SYNTHETIC');
INSERT INTO public.claim_requests(id,artisan_legacy_id,requester_user_id,requester_name,requester_phone,status) VALUES('${id(200)}','control-b1-legacy-claim','${user(15)}','PRIVATE_CLAIM_NAME_SYNTHETIC','+000000000004','pending');
INSERT INTO public.claim_requests(id,artisan_id,requester_user_id,requester_name,status) VALUES('${id(201)}','${id(20)}','${user(1)}','PRIVATE_CLAIM_REJECT_SYNTHETIC','pending'),('${id(202)}','${id(20)}','${user(4)}','PRIVATE_CLAIM_OWNER_CONFLICT_SYNTHETIC','pending'),('${id(203)}','${id(23)}','${user(15)}','CLAIM_CONCURRENT_A_SYNTHETIC','pending'),('${id(204)}','${id(23)}','${user(16)}','CLAIM_CONCURRENT_B_SYNTHETIC','pending');
INSERT INTO public.enterprise_accounts(id,name,status,data_classification) VALUES('${id(300)}','TENANT_A_SYNTHETIC','active','test'),('${id(301)}','TENANT_B_SYNTHETIC','active','test');
INSERT INTO public.enterprise_sites(id,enterprise_id,name,city,status) VALUES('${id(310)}','${id(300)}','SITE_A1_SYNTHETIC','Fès','active'),('${id(312)}','${id(300)}','SITE_A2_RESTRICTED_SYNTHETIC','Rabat','active'),('${id(311)}','${id(301)}','SITE_B_SYNTHETIC','Rabat','active');
`);
for(const [n,tenant,u,role] of [[320,300,5,'owner'],[321,300,6,'operations_manager'],[322,300,7,'viewer'],[323,301,8,'owner'],[324,301,9,'operations_manager'],[325,301,10,'viewer'],[326,300,11,'viewer'],[327,300,14,'site_manager']])sql.push(`INSERT INTO public.enterprise_members(id,enterprise_id,user_id,role,status) VALUES('${id(n)}','${id(tenant)}','${user(u)}','${role}','active');`);
sql.push(`INSERT INTO public.enterprise_member_sites(enterprise_id,member_id,site_id,assigned_by) VALUES('${id(300)}','${id(327)}','${id(310)}','${user(5)}');
INSERT INTO public.enterprise_workforce_workers(id,enterprise_id,member_id,display_label,status,availability,max_concurrent_jobs,all_sites,created_by) VALUES('${id(330)}','${id(300)}','${id(326)}','PRIVATE_WORKER_LABEL_SYNTHETIC','active','available',10,true,'${user(5)}'),('${id(331)}','${id(301)}','${id(325)}','PRIVATE_TENANT_B_WORKER_SYNTHETIC','active','available',2,true,'${user(8)}');
INSERT INTO public.enterprise_workforce_skills(enterprise_id,worker_id,service_category) VALUES('${id(300)}','${id(330)}','plomberie'),('${id(301)}','${id(331)}','plomberie');
INSERT INTO public.enterprise_dispatch_policies(id,enterprise_id,site_id,mode,created_by) VALUES('${id(360)}','${id(300)}','${id(310)}','hybrid','${user(5)}');
`);
for(const [r,tenant,site,u] of [[170,300,310,5],[171,300,310,5],[172,300,312,5],[173,301,311,8]])sql.push(`INSERT INTO public.enterprise_request_context(enterprise_id,site_id,service_request_id,created_by) VALUES('${id(tenant)}','${id(site)}','${id(r)}','${user(u)}'); INSERT INTO public.enterprise_request_sla(service_request_id,enterprise_id,site_id,policy_urgency,request_urgency,acceptance_target_minutes,started_at,at_risk_at,due_at) VALUES('${id(r)}','${id(tenant)}','${id(site)}','high','urgent',30,now(),now()+interval '22 minutes',now()+interval '30 minutes');`);
sql.push(`INSERT INTO public.quotes(id,request_id,artisan_profile_id,status,proposed_price,service_description,review_status,quote_version,reviewed_version,reviewed_by,reviewed_at,presented_at,expires_at) VALUES('${id(721)}','${id(102)}','${id(20)}','pending',1000,'SYNTHETIC_EXPIRED_QUOTE','approved',1,1,'${user(3)}',now()-interval '1 day',now()-interval '1 day',now()-interval '1 hour');
INSERT INTO public.quotes(id,request_id,artisan_profile_id,status,proposed_price,service_description,review_status) VALUES('${id(722)}','${id(101)}','${id(20)}','pending',1000,'SYNTHETIC_LEGACY_UNREVIEWED','legacy_unreviewed');`);
sql.push(`INSERT INTO fixeo_private.diagnostic_sessions_v1(id,owner_user_id,owner_key,source,state,city_slug,input,consent_version,service_request_id) VALUES('${id(400)}','${user(1)}','u:${user(1)}','homepage','bound','fes','{"photo":"PRIVATE_DIAGNOSTIC_MEDIA_SYNTHETIC","phone":"PRIVATE_PHONE_SYNTHETIC","description":"PRIVATE_FULL_INPUT_SYNTHETIC"}','diagnostic-privacy-v1','${id(100)}');
INSERT INTO public.fixeo_pricing_offers_v1(id,offer_key,pricing_version,currency,service_code,catalogue_version,city,scope,vap_minor,materials_minor,commission_minor,client_total_minor,expires_at) VALUES('${id(410)}','${id(411)}','vap-bp33-v1','MAD','plomberie.synthetic','synthetic-v1','Fès','{"synthetic":true}',20000,5000,6000,31000,now()+interval '1 day');
INSERT INTO public.service_requests(id,client_profile_id,city,service_category,description,status,data_classification,pricing_offer_id) VALUES('${id(161)}','${user(1)}','Fès','plomberie','VAP_WITH_MATERIALS_SYNTHETIC','completed','test','${id(410)}');
INSERT INTO public.missions(id,request_id,client_profile_id,artisan_profile_id,status,accepted_at) VALUES('${id(621)}','${id(161)}','${user(1)}','${id(20)}','done',now());
INSERT INTO public.artisan_business_clients(id,owner_user_id,full_name,notes) VALUES('${id(800)}','${user(2)}','PRIVATE_BUSINESS_CLIENT_SYNTHETIC','PRIVATE_BUSINESS_NOTES_SYNTHETIC');
INSERT INTO public.artisan_business_quotes(id,owner_user_id,client_id,quote_number,title,description,total) VALUES('${id(801)}','${user(2)}','${id(800)}','SYNTHETIC-PRIVATE-1','PRIVATE_BUSINESS_QUOTE_SYNTHETIC','PRIVATE_BUSINESS_QUOTE_BODY_SYNTHETIC',9999);
INSERT INTO public.artisan_business_jobs(id,owner_user_id,client_id,quote_id,title,amount,notes) VALUES('${id(802)}','${user(2)}','${id(800)}','${id(801)}','PRIVATE_BUSINESS_JOB_SYNTHETIC',9999,'PRIVATE_BUSINESS_JOB_NOTES_SYNTHETIC');
INSERT INTO public.artisan_business_ledger(id,owner_user_id,client_id,job_id,entry_type,amount,note) VALUES('${id(803)}','${user(2)}','${id(800)}','${id(802)}','income',9999,'PRIVATE_BUSINESS_INCOME_SYNTHETIC'),('${id(804)}','${user(2)}','${id(800)}','${id(802)}','expense',999,'PRIVATE_BUSINESS_EXPENSE_SYNTHETIC');
COMMIT;`);
fs.writeFileSync(out,sql.join('\n'));console.log(JSON.stringify({project_ref:ref,volume_requests:800,dedicated_requests:requests.length+2,synthetic_tenants:2,real_data:false}));
