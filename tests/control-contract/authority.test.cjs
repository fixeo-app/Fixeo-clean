'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {baseline,actor,migrate,uuid}=require('./fixture.cjs');
let db;
before(async()=>{db=await baseline();await db.exec(`
INSERT INTO auth.users(id) VALUES('${uuid(1)}'),('${uuid(2)}'),('${uuid(3)}'),('${uuid(4)}');
INSERT INTO public.users(id,role,full_name) VALUES('${uuid(1)}','client','Synthetic Client'),('${uuid(2)}','artisan','Synthetic Artisan'),('${uuid(3)}','admin','Synthetic Operator'),('${uuid(4)}','client','Other Client');
INSERT INTO public.profiles(id,role) SELECT id,role FROM public.users;
INSERT INTO public.artisans(id,owner_user_id,full_name,phone,phone_public,city,service_category,claimed,claim_status,onboarding_completed,availability,verified,is_verified)
VALUES('${uuid(20)}','${uuid(2)}','Synthetic Artisan','+000000000001','','Fès','plomberie',true,'approved',true,'available',false,false);
INSERT INTO public.service_requests(id,client_profile_id,city,service_category,description,status) VALUES('${uuid(100)}','${uuid(1)}','Fès','plomberie','Synthetic plumbing request','new');
`);await migrate(db);});
after(async()=>{await db?.close();});
const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
const rpc=async(name,args=[])=>Object.values((await query(`select to_jsonb(public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})) as result`,args))[0])[0];
async function denied(fn,pattern){await db.exec('SAVEPOINT expected_denial');let error;try{await fn();}catch(e){error=e;}await db.exec('ROLLBACK TO SAVEPOINT expected_denial; RELEASE SAVEPOINT expected_denial');assert.ok(error,'operation must be denied');if(pattern)assert.match(error.message,pattern);}
function tx(name,fn){test(name,async()=>{await db.exec('RESET ROLE; BEGIN');try{await fn();}finally{await db.exec('ROLLBACK; RESET ROLE;');}});}
let nonce=1000;
async function preview(cap,target,payload){return rpc('control_action_preview_v1',[cap,target,payload,uuid(++nonce)]);}
async function execute(p,key=uuid(++nonce)){return rpc('control_action_execute_v1',[p.preview_id,true,key]);}
async function command(cap,target,payload){return execute(await preview(cap,target,{reason:'Synthetic verification',...payload}));}
async function quote(){await actor(db,2);const q=await rpc('submit_artisan_quote_v2',[uuid(100),1000,'Repair fixture',null,'1 hour',null]);return q;}
async function approved(){const q=await quote();await actor(db,3);const x=await command('quote.approve',q.id,{version:1});assert.equal(x.ok,true,JSON.stringify(x));return q;}
async function completed(){const q=await approved();await actor(db,1);const m=await rpc('accept_quote_v2',[q.id]);await actor(db,2);assert.equal((await rpc('start_mission',[m.id])).ok,true);assert.equal((await rpc('complete_mission',[m.id])).ok,true);return m;}

tx('Historic classification remains unknown; future canonical creation is production and idempotent',async()=>{
 assert.equal((await query('select data_classification from public.service_requests where id=$1',[uuid(100)]))[0].data_classification,null);
 await actor(db,1);const args=['plomberie','Fès','Synthetic new request',uuid(501)];const a=await rpc('create_my_service_request_v1',args),b=await rpc('create_my_service_request_v1',args);assert.equal(a.id,b.id);assert.equal(a.data_classification,'production');
 await denied(()=>rpc('create_my_service_request_v1',['plomberie','Fès','Changed payload',uuid(501)]),/IDEMPOTENCY_CONFLICT/);
});
tx('Anon and authenticated cannot write direct SR, Mission or Quote, including column grants',async()=>{
 for(const who of [[1,'anon'],[1,'authenticated'],[2,'authenticated'],[3,'authenticated']]){
 await actor(db,...who);
 for(const table of ['service_requests','missions','quotes'])await denied(()=>query(`insert into public.${table}(id) values($1)`,[uuid(999)]),/permission denied/);
 await denied(()=>query('update public.service_requests set commission_paid=true where id=$1',[uuid(100)]),/permission denied/);
 await denied(()=>query("update public.missions set status='validated'"),/permission denied/);
 }
});
tx('Submitted quote is owner-visible, hidden from client, and emits no client notification',async()=>{
 const q=await quote();assert.equal(q.review_status,'submitted');assert.equal((await query('select id from public.quotes where id=$1',[q.id])).length,1);
 await actor(db,1);assert.equal((await query('select id from public.quotes where id=$1',[q.id])).length,0);await denied(()=>rpc('accept_quote_v2',[q.id]),/FIXEO_REVIEW_REQUIRED/);
 await db.exec('RESET ROLE');assert.equal(Number((await query("select count(*) n from public.notifications where type='quote_received'"))[0].n),0);
});
tx('Review requires Admin and a human confirmation; duplicate execution is idempotent',async()=>{
 const q=await quote();await denied(()=>preview('quote.approve',q.id,{version:1,reason:'Checked scope'}),/FORBIDDEN/);
 await actor(db,3);await denied(()=>rpc('review_marketplace_quote_v1',[q.id,1,true,'Checked scope',null]),/permission denied/);
 const p=await preview('quote.approve',q.id,{version:1,reason:'Checked scope'});
 await denied(()=>rpc('control_action_execute_v1',[p.preview_id,false,uuid(502)]),/HUMAN_CONFIRMATION_REQUIRED/);
 const a=await execute(p,uuid(502)),b=await execute(p,uuid(502));assert.equal(a.ok,true,JSON.stringify(a));assert.deepEqual(a,b);
 await actor(db,1);assert.equal((await query('select id from public.quotes where id=$1',[q.id])).length,1);
});
tx('Acceptance creates pending/assigned, never validated; full lifecycle retains canonical owners',async()=>{
 const q=await approved();await actor(db,4);await denied(()=>rpc('accept_quote_v2',[q.id]),/FORBIDDEN/);
 await actor(db,1);const m=await rpc('accept_quote_v2',[q.id]);assert.equal(m.status,'pending');assert.equal(m.accepted_quote_id,q.id);assert.equal(m.validated_at,null);assert.equal((await rpc('accept_quote_v2',[q.id])).id,m.id);
 assert.equal((await query('select status from public.service_requests where id=$1',[uuid(100)]))[0].status,'assigned');
 await actor(db,2);assert.equal((await rpc('start_mission',[m.id])).ok,true);assert.equal((await rpc('complete_mission',[m.id])).ok,true);
 await actor(db,1);assert.equal((await rpc('confirm_completed_mission',[uuid(100)])).ok,true);
 const final=(await query('select * from public.missions where id=$1',[m.id]))[0];assert.equal(final.status,'validated');assert.ok(final.started_at&&final.completed_at&&final.validated_at);
});
tx('Resubmission invalidates approval and stale previews without exposing unreviewed price',async()=>{
 const q=await quote();await actor(db,3);const p=await preview('quote.approve',q.id,{version:1,reason:'Checked scope'});
 await actor(db,2);const changed=await rpc('submit_artisan_quote_v2',[uuid(100),1200,'Repair fixture',null,'1 hour',null]);assert.equal(changed.quote_version,2);
 await actor(db,3);const r=await execute(p);assert.equal(r.ok,false);assert.equal(r.code,'STALE_PREVIEW');
 await actor(db,1);assert.equal((await query('select id from public.quotes where id=$1',[q.id])).length,0);
});
tx('Expired reviewed quote cannot be accepted and review cannot change a submitted price',async()=>{
 const q=await quote();await actor(db,3);await denied(()=>preview('quote.approve',q.id,{version:1,proposed_price:1,reason:'Checked scope'}),/INVALID_ACTION_PAYLOAD/);
 const r=await command('quote.approve',q.id,{version:1,expires_at:'2020-01-01T00:00:00Z'});assert.equal(r.ok,false);assert.equal(r.code,'INVALID_EXPIRY');
});
tx('Claims view denies anon and keeps owner isolation; no audit contains requester PII',async()=>{
 await db.exec(`INSERT INTO public.claim_requests(id,artisan_id,requester_user_id,requester_name,requester_phone,status) VALUES('${uuid(200)}','${uuid(20)}','${uuid(1)}','PRIVATE MARKER','+000000000099','pending');`);
 await actor(db,1,'anon');await denied(()=>query('select * from public.claims_pending'),/permission denied/);
 await actor(db,4);assert.equal((await query('select * from public.claims_pending')).length,0);
 await actor(db,1);assert.equal((await query('select * from public.claims_pending')).length,1);
 await denied(()=>query("insert into public.claim_requests(requester_user_id,status) values($1,'approved')",[uuid(1)]),/row-level security/);
 await db.exec('RESET ROLE');assert.ok(!JSON.stringify(await query('select * from fixeo_private.authority_audit_events_v1')).includes('PRIVATE MARKER'));
});
tx('Legacy Claims RPCs and direct review writes cannot bypass the human authority gate',async()=>{
 await db.exec(`INSERT INTO public.claim_requests(id,artisan_id,requester_user_id,status) VALUES('${uuid(200)}','${uuid(20)}','${uuid(1)}','pending');`);
 for(const role of ['anon','authenticated','service_role']){
  await actor(db,3,role);
  await denied(()=>rpc('approve_artisan_claim',[uuid(200)]),/permission denied/);
  await denied(()=>rpc('reject_artisan_claim',[uuid(200),'Synthetic denial']),/permission denied/);
  await denied(()=>rpc('_supersede_competing_claims',[uuid(20),uuid(200),null]),/permission denied/);
  await denied(()=>query("update public.claim_requests set status='approved' where id=$1",[uuid(200)]),/permission denied/);
  await denied(()=>query('delete from public.claim_requests where id=$1',[uuid(200)]),/permission denied/);
 }
 await actor(db,3);const result=await command('claim.reject',uuid(200),{});assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.verified.status,'rejected');assert.ok(result.audit_id);
});
tx('Settlement records canonical price/commission, never a remittance',async()=>{
 const m=await completed();await actor(db,3);const r=await command('mission.settle',m.id,{final_price:1000,expected_final_price:null});assert.equal(r.ok,true,JSON.stringify(r));assert.equal(Number(r.verified.commission_amount),150);assert.equal(Number(r.verified.confirmed_commission),0);
 const summary=await rpc('control_summary_v1',['finance','all']);assert.equal(Number(summary.metrics['finance.confirmed']),0);
 const stale=await command('mission.settle',m.id,{final_price:900,expected_final_price:null});assert.equal(stale.ok,false);assert.equal(stale.code,'STALE_VERSION');
});
tx('Finance proof, reconciliation, correction and cancellation are versioned and audit-safe',async()=>{
 const m=await completed();await actor(db,3);assert.equal((await command('mission.settle',m.id,{final_price:1000,expected_final_price:null})).ok,true);
 const d=await command('finance.declare',m.id,{amount:150,method:'wafacash',proof_reference:'RECEIPT-SYNTHETIC-ONLY'});assert.equal(d.ok,true,JSON.stringify(d));assert.equal(d.result.status,'declared');assert.equal(d.verified.confirmed_commission,0);
 const c=await command('finance.confirm',m.id,{remittance_id:d.result.id,version:1});assert.equal(c.ok,true,JSON.stringify(c));assert.equal(c.verified.confirmed_commission,150);
 const bad=await command('finance.cancel',m.id,{remittance_id:d.result.id,version:1});assert.equal(bad.ok,false);assert.equal(bad.code,'STALE_VERSION');
 const correct=await command('finance.correct',m.id,{remittance_id:d.result.id,version:2,amount:100,method:'bank_transfer',proof_reference:'NEW-REFERENCE'});assert.equal(correct.ok,true,JSON.stringify(correct));assert.equal(correct.verified.confirmed_commission,0);
 const cancel=await command('finance.cancel',m.id,{remittance_id:correct.result.id,version:1});assert.equal(cancel.ok,true,JSON.stringify(cancel));
 await db.exec('RESET ROLE');const audit=JSON.stringify(await query('select * from fixeo_private.authority_audit_events_v1'));assert.ok(!audit.includes('RECEIPT-SYNTHETIC-ONLY'));assert.ok(audit.includes('correct.cancel'));
});
tx('Bounded projections exclude private business, raw PII and arbitrary types',async()=>{
 await actor(db,3);const r=await rpc('control_dossier_read_v1',['request',uuid(100)]);assert.equal(r.summary.client_phone,undefined);assert.equal(r.summary.guest_token_hash,undefined);
 for(const type of ['artisan_business_clients','artisan_business_quotes','artisan_business_jobs','artisan_business_ledger','auth.users'])await denied(()=>rpc('control_dossier_read_v1',[type,uuid(100)]),/UNSUPPORTED_ENTITY/);
 await denied(()=>rpc('control_search_v1',['Synthetic','artisan_business_clients',null,25]),/INVALID_SEARCH/);
 await actor(db,1);await denied(()=>rpc('control_dossier_read_v1',['request',uuid(100)]),/FORBIDDEN/);
});
tx('Exact totals exceed a frontend page; pagination never claims a global total',async()=>{
 await db.exec(`INSERT INTO public.service_requests(client_profile_id,city,service_category,description,status) SELECT '${uuid(1)}','Fès','plomberie','Synthetic volume','new' FROM generate_series(1,751);`);
 await actor(db,3);const total=await rpc('control_summary_v1',['requests','all']);assert.equal(total.metrics['requests.total'],752);
 const page=await rpc('control_operations_list_v1',[null,50]);assert.equal(page.items.length,50);assert.equal(page.has_more,true);assert.equal(page.global_total,null);
 const second=await rpc('control_operations_list_v1',[page.next_cursor,50]);assert.equal(new Set([...page.items,...second.items].map(x=>x.id)).size,100);
});
tx('Classification is explicit, reversible and unavailable through direct updates',async()=>{
 await actor(db,3);let c=await command('request.classify',uuid(100),{classification:'test'});assert.equal(c.ok,true,JSON.stringify(c));assert.equal((await rpc('control_summary_v1',['requests','production'])).metrics['requests.total'],0);
 c=await command('request.classify',uuid(100),{classification:'unclassified'});assert.equal(c.ok,true);assert.equal(c.verified.data_classification,null);
});
tx('Verification synchronises the canonical flag only through a reviewed authority',async()=>{
 await actor(db,3);const r=await command('artisan.verify',uuid(20),{});assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.verified.verified,true);assert.equal(r.verified.verification_conflict,false);
 await actor(db,2);await denied(()=>query('update public.artisans set is_verified=true where id=$1',[uuid(20)]),/permission denied/);
});

async function enterpriseFixture(){await db.exec(`RESET ROLE;
 INSERT INTO public.enterprise_accounts(id,name,status) VALUES('${uuid(300)}','Synthetic Tenant','active'),('${uuid(301)}','Other Tenant','active');
 INSERT INTO public.enterprise_sites(id,enterprise_id,name,city,status) VALUES('${uuid(310)}','${uuid(300)}','Synthetic Site','Fès','active'),('${uuid(311)}','${uuid(301)}','Other Site','Rabat','active');
 INSERT INTO public.enterprise_members(id,enterprise_id,user_id,role,status) VALUES('${uuid(320)}','${uuid(300)}','${uuid(2)}','viewer','active');
 INSERT INTO public.enterprise_workforce_workers(id,enterprise_id,member_id,display_label,status,availability,max_concurrent_jobs,created_by) VALUES('${uuid(330)}','${uuid(300)}','${uuid(320)}','PRIVATE WORKER LABEL','active','available',2,'${uuid(3)}');
 INSERT INTO public.enterprise_request_context(id,enterprise_id,site_id,service_request_id,created_by) VALUES('${uuid(340)}','${uuid(300)}','${uuid(310)}','${uuid(100)}','${uuid(2)}');
 `);}
tx('Enterprise global supervision is minimal, scoped, and creates no membership',async()=>{
 await enterpriseFixture();await actor(db,3);
 const worker=await rpc('control_dossier_read_v1',['worker',uuid(330)]);assert.equal(worker.summary.enterprise_id,uuid(300));assert.equal(worker.summary.display_label,undefined);assert.equal(worker.summary.member_id,undefined);assert.equal(worker.summary.max_concurrent_jobs,2);
 await denied(()=>rpc('control_operations_list_v1',[null,50,null,null,null,uuid(300),uuid(311),'all']),/INVALID_TENANT_SCOPE/);
 await denied(()=>preview('request.dispatch',uuid(100),{artisan_id:uuid(20),reason:'Synthetic test'}),/ENTERPRISE_DELEGATION_REQUIRED/);
 await db.exec('RESET ROLE');assert.equal(Number((await query('select count(*) n from public.enterprise_members where user_id=$1',[uuid(3)]))[0].n),0);
 await actor(db,4);await denied(()=>rpc('control_dossier_read_v1',['worker',uuid(330)]),/FORBIDDEN/);
});
tx('SLA canonical facts recognise an internal winner and deny unrelated users',async()=>{
 await enterpriseFixture();await db.exec(`INSERT INTO public.enterprise_internal_assignments(id,enterprise_id,service_request_id,worker_id,status,assigned_at) VALUES('${uuid(350)}','${uuid(300)}','${uuid(100)}','${uuid(330)}','assigned',now());`);
 await actor(db,3);const f=await rpc('enterprise_request_sla_facts_v1',[uuid(100)]);assert.ok(f.acceptance_at);assert.equal(f.internal_winners,1);assert.equal(f.acceptance_status,'not_configured');assert.equal(f.start_sla,'not_configured');
 await actor(db,4);await denied(()=>rpc('enterprise_request_sla_facts_v1',[uuid(100)]),/FORBIDDEN/);
 await db.exec('RESET ROLE');await denied(()=>query("insert into public.missions(request_id,artisan_profile_id,status,accepted_at) values($1,$2,'pending',now())",[uuid(100),uuid(20)]),/WINNER_ALREADY_EXISTS/);
});
tx('Diagnostic projection exposes metadata only and only when bound to a request',async()=>{
 await db.exec(`INSERT INTO fixeo_private.diagnostic_sessions_v1(id,owner_user_id,owner_key,source,state,city_slug,input,consent_version,service_request_id) VALUES('${uuid(400)}','${uuid(1)}','u:${uuid(1)}','homepage','bound','fes','{"photo":"PRIVATE_MEDIA","phone":"PRIVATE_PHONE"}','diagnostic-privacy-v1','${uuid(100)}');`);
 await actor(db,3);const d=await rpc('control_dossier_read_v1',['diagnostic_summary',uuid(400)]);const text=JSON.stringify(d);assert.ok(!text.includes('PRIVATE_'));assert.equal(d.summary.media_access,'forbidden');assert.equal(d.summary.consent_version,'diagnostic-privacy-v1');
 await actor(db,1);await denied(()=>rpc('control_dossier_read_v1',['diagnostic_summary',uuid(400)]),/FORBIDDEN/);
});
tx('VAP settlement preserves the persisted commission and rejects a different total',async()=>{
 await db.exec(`INSERT INTO public.fixeo_pricing_offers_v1(id,offer_key,pricing_version,currency,service_code,catalogue_version,city,scope,vap_minor,materials_minor,commission_minor,client_total_minor,expires_at)
 VALUES('${uuid(410)}','${uuid(411)}','vap-bp33-v1','MAD','plomberie.synthetic','synthetic-v1','Fès','{"synthetic":true}',20000,0,6000,26000,now()+interval '1 hour');
 INSERT INTO public.service_requests(id,client_profile_id,city,service_category,description,status,pricing_offer_id) VALUES('${uuid(412)}','${uuid(1)}','Fès','plomberie','Synthetic VAP','completed','${uuid(410)}');
 INSERT INTO public.missions(id,request_id,client_profile_id,artisan_profile_id,status,accepted_at) VALUES('${uuid(413)}','${uuid(412)}','${uuid(1)}','${uuid(20)}','done',now());`);
 await actor(db,3);const bad=await command('mission.settle',uuid(413),{final_price:300,expected_final_price:null});assert.equal(bad.ok,false);
 const good=await command('mission.settle',uuid(413),{final_price:260,expected_final_price:null});assert.equal(good.ok,true,JSON.stringify(good));assert.equal(good.verified.commission_amount,60);assert.notEqual(good.verified.commission_amount,39);
});
tx('Sensitive functions cannot be executed by anon, non-admin or service-role without actor context',async()=>{
 for(const who of [[1,'anon'],[1,'authenticated'],[2,'authenticated']]){await actor(db,...who);await denied(()=>rpc('control_summary_v1',['requests','all']),/permission denied|FORBIDDEN/);}
 await actor(db,1,'service_role');await denied(()=>rpc('control_summary_v1',['requests','all']),/permission denied/);
 await db.exec('RESET ROLE');const leaked=await query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='fixeo_private' and p.proname in('control_row_v1','authority_audit_v1','control_require_admin_v1') and has_function_privilege('authenticated',p.oid,'EXECUTE')");assert.equal(leaked.length,0);
});

tx('Claims approval resolves the legacy link and preserves the canonical owner rule',async()=>{
 await db.exec(`INSERT INTO public.artisans(id,legacy_id,full_name,city,service_category,claimed,claim_status) VALUES('${uuid(21)}','synthetic-legacy','Synthetic unowned','Fès','plomberie',false,'pending'); INSERT INTO public.claim_requests(id,artisan_legacy_id,requester_user_id,status) VALUES('${uuid(201)}','synthetic-legacy','${uuid(4)}','pending');`);
 await actor(db,3);const r=await command('claim.approve',uuid(201),{});assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.verified.status,'approved');
 await db.exec('RESET ROLE');assert.equal((await query('select owner_user_id from public.artisans where id=$1',[uuid(21)]))[0].owner_user_id,uuid(4));
});
tx('Claim rejection uses the existing authority and failed review is durably audited',async()=>{
 await db.exec(`INSERT INTO public.claim_requests(id,artisan_id,requester_user_id,status) VALUES('${uuid(202)}','${uuid(20)}','${uuid(1)}','pending'),('${uuid(203)}','${uuid(20)}','${uuid(4)}','pending');`);
 await actor(db,3);const rejected=await command('claim.reject',uuid(202),{});assert.equal(rejected.ok,true,JSON.stringify(rejected));assert.equal(rejected.verified.status,'rejected');
 const conflict=await command('claim.approve',uuid(203),{});assert.equal(conflict.ok,false);assert.equal(conflict.code,'artisan_has_owner');
 await db.exec('RESET ROLE');const audit=await query('select result from fixeo_private.authority_audit_events_v1 where id=$1',[conflict.audit_id]);assert.equal(audit[0].result,'failed');
});
tx('Dossier relations are bounded and report overflow instead of silently claiming completeness',async()=>{
 await db.exec(`INSERT INTO public.missions(request_id,artisan_profile_id,status) SELECT '${uuid(100)}','${uuid(20)}','expired' FROM generate_series(1,61);`);
 await actor(db,3);const d=await rpc('control_dossier_read_v1',['request',uuid(100)]);assert.equal(d.relations.length,50);assert.equal(d.relations_has_more,true);
});
tx('History and empty totals retain distinct meanings',async()=>{
 await actor(db,3);assert.equal((await rpc('control_summary_v1',['finance','all'])).metrics['finance.due_gross'],0);
 const a=await rpc('control_summary_v1',['artisans','all']);assert.equal(a.metric_quality['artisans.active_30d'],'partial_historical_coverage');
 await db.exec(`RESET ROLE; UPDATE public.service_requests SET status='validated' WHERE id='${uuid(100)}'; INSERT INTO public.missions(request_id,artisan_profile_id,status,final_price) VALUES('${uuid(100)}','${uuid(20)}','validated',1000);`);
 await actor(db,3);const m=await rpc('control_summary_v1',['missions','all']);assert.equal(m.metrics['missions.validated'],0);assert.equal(m.metrics['missions.validated_raw'],1);assert.equal(m.metrics['missions.validation_unproven'],1);
 assert.equal((await rpc('control_summary_v1',['finance','all'])).metrics['finance.due_gross'],null);
 const id=(await query('select id from public.missions where request_id=$1',[uuid(100)]))[0].id;
 await denied(()=>preview('finance.declare',id,{reason:'Synthetic review',amount:100,method:'cash',proof_reference:'SYNTHETIC'}),/COMMISSION_NOT_DUE/);
});
tx('Existing server intake producer retains its grant while browser writes are denied',async()=>{
 await actor(db,1,'service_role');await query("insert into public.service_requests(id,city,service_category,description,status) values($1,'Fès','plomberie','Synthetic server intake','new')",[uuid(700)]);
 await db.exec('RESET ROLE');assert.equal((await query('select data_classification from public.service_requests where id=$1',[uuid(700)]))[0].data_classification,'production');
});

tx('Legacy accepted quote history stays readable without allowing a new validated mission',async()=>{
 await db.exec(`INSERT INTO public.quotes(id,request_id,artisan_profile_id,proposed_price,status,review_status) VALUES('${uuid(720)}','${uuid(100)}','${uuid(20)}',1000,'accepted','legacy_unreviewed');`);
 await actor(db,1);assert.equal((await query('select id from public.quotes where id=$1',[uuid(720)])).length,1);
 await denied(()=>rpc('accept_quote_v2',[uuid(720)]),/LEGACY_RECONCILIATION_REQUIRED/);
});

tx('Artisan photo producer is owner-bound without a general update grant',async()=>{
 await actor(db,2);const good='https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/artisan-media/profiles/'+uuid(2)+'/avatar.jpg';assert.equal((await rpc('update_my_artisan_photo_v1',[good])).id,uuid(20));
 await denied(()=>rpc('update_my_artisan_photo_v1',[good.replace(uuid(2),uuid(1))]),/INVALID_PHOTO_URL/);
 await actor(db,1);await denied(()=>rpc('update_my_artisan_photo_v1',[good]),/ARTISAN_NOT_FOUND/);
});
test('Postflight and non-destructive pause/resume scripts execute against the candidate schema',async()=>{
 const fs=require('node:fs'),path=require('node:path');const release=n=>fs.readFileSync(path.join(__dirname,'../../docs/control-os/bloc1',n),'utf8');
 await db.exec('RESET ROLE');await db.exec(release('02-postflight-readonly.sql'));await db.exec(release('03-rollback-pause-actions.sql'));
 await db.exec('BEGIN');await actor(db,3);await denied(()=>preview('artisan.verify',uuid(20),{reason:'Synthetic review'}),/permission denied/);await db.exec('ROLLBACK; RESET ROLE');
 await db.exec(release('04-resume-actions-after-review.sql'));await actor(db,3);assert.equal((await rpc('control_summary_v1',['requests','all'])).source,'requests');await db.exec('RESET ROLE');
});

tx('Classification cannot be selected by an ordinary Marketplace producer',async()=>{
 await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claims','{"sub":"${uuid(1)}","role":"authenticated"}',false);`);
 await denied(()=>query("insert into public.artisans(id,full_name,city,service_category,data_classification) values($1,'Synthetic','Fès','plomberie','test')",[uuid(730)]),/CLASSIFICATION_AUTHORITY_REQUIRED/);
});

tx('Finance history is discoverable from its mission with minimal proof metadata',async()=>{
 const m=await completed();await actor(db,3);await command('mission.settle',m.id,{final_price:1000,expected_final_price:null});
 const d=await command('finance.declare',m.id,{amount:100,method:'cash',proof_reference:'PRIVATE-RECEIPT-REFERENCE'});assert.equal(d.ok,true);
 const mission=await rpc('control_dossier_read_v1',['mission',m.id]);assert.ok(mission.relations.some(x=>x.type==='remittance'&&x.id===d.result.id));
 const record=await rpc('control_dossier_read_v1',['remittance',d.result.id]);assert.equal(record.summary.proof_present,true);assert.equal(record.summary.amount,100);assert.ok(record.timeline.some(x=>x.action==='declare'));assert.ok(!JSON.stringify(record).includes('PRIVATE-RECEIPT-REFERENCE'));
 await actor(db,1);await denied(()=>rpc('control_dossier_read_v1',['remittance',d.result.id]),/FORBIDDEN/);
});
