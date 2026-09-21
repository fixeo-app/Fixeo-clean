const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const pilot=require('../../data/pricing/engine/climatisation-pilot-v1');
const o=require('../../data/pricing/orchestrator/estimator-orchestrator-v1');
const {attachOffer}=require('../../api/estimator-v1/fixeo-vap-offers-v1');
const actor='10000000-0000-4000-8000-000000000001';
async function setup(){const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE artisans(owner_user_id uuid,full_name text,name text,phone_public text,phone text,source text,claimed boolean,claim_status text,photo_url text,is_public boolean,id uuid PRIMARY KEY DEFAULT gen_random_uuid(),city text,service_category text,work_zone text,availability text,review_count integer,rating numeric,updated_at timestamptz);
 CREATE TABLE service_requests(target_artisan_id uuid,id uuid PRIMARY KEY DEFAULT gen_random_uuid(),service_category text,city text,description text,client_phone text,urgency text,status text,idempotency_key text,tracking_ref text,guest_token_hash text);
 CREATE TABLE estimator_context_redemptions(context_id text PRIMARY KEY,outcome_type text,service_code text,session_id text,amount_mad integer,state text,acquired_at timestamptz,service_request_id uuid,committed_at timestamptz,failed_at timestamptz,failure_reason text,booking_ref text,order_id text);
 CREATE TABLE missions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id text,artisan_profile_id uuid,status text,agreed_price numeric,final_price numeric,commission_amount numeric);
 CREATE FUNCTION set_commission_amount() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.commission_amount:=coalesce(round(coalesce(NEW.final_price,NEW.agreed_price)*0.15,2),0);RETURN NEW;END $$;
 CREATE TRIGGER trg_set_commission_amount BEFORE INSERT OR UPDATE ON missions FOR EACH ROW EXECUTE FUNCTION set_commission_amount();
 INSERT INTO missions(request_id,agreed_price) VALUES('legacy',300);
 GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
 GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role,authenticated;`);
 for(const file of ['20260921005143_vap_bp33_offers_foundation.sql','20260921012731_vap_booking_settlement_binding.sql','20260921090058_garden_vap_confirmation.sql','20260921091341_tile_vap_confirmation.sql']) await db.exec('BEGIN;'+fs.readFileSync(path.join(__dirname,'../../supabase/migrations',file),'utf8')+'COMMIT;');
 await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/dispatch-request-live-20260921.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/category-resolution-live-20260921.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260921100804_masonry_vap_confirmation.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260921103223_moving_vap_confirmation.sql'),'utf8'));
 await db.exec("INSERT INTO artisans(city,service_category,availability,review_count,rating,updated_at) VALUES ('Rabat','Carrelage','available',500,5,now()),('Rabat','Climatisation','available',0,0,now());");

 await db.exec(`ALTER TABLE service_requests ADD commission_paid boolean DEFAULT false, ADD commission_paid_at timestamptz, ADD commission_status text;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA auth TO authenticated;
 UPDATE artisans SET owner_user_id='${actor}' WHERE service_category='Climatisation';`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260921122543_plumbing_same_visit_repair.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260921132727_electricity_same_visit_repair.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260921142222_climatisation_same_visit_service.sql'),'utf8'));
 await db.exec('ALTER TABLE missions ADD accepted_at timestamptz; CREATE TABLE dispatch_execution_queue(request_id uuid,artisan_id uuid,execution_status text,updated_at timestamptz); GRANT ALL ON dispatch_execution_queue TO service_role,authenticated;');
 await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/clim-lifecycle-live-20260921.sql'),'utf8'));
 return db;
}
async function mission(db,code='climatisation.diagnostic',stage='started'){
 await db.exec('RESET ROLE');
 const spec=pilot.services[code]||require('../../data/pricing/engine/plumbing-pilot-v1').services[code];
 const s=o.evaluateEstimator(o.startEstimator({service_hint:code,city_slug:'rabat',known_inputs:spec.inputs}).session).session;
 const payload={service_code:code,city_slug:'rabat',session_id:s.session_id,context_id:'fxctx-'+randomUUID().replaceAll('-',''),outcome_type:s.outcome.outcome_type,expires_at:Date.now()+60000};let row;
 await attachOffer(s,payload,{env:{SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test'},fetchImpl:async(_,opts)=>{row=JSON.parse(opts.body);return {ok:true};}});
 await db.query('INSERT INTO fixeo_pricing_offers_v1 SELECT * FROM jsonb_populate_record(NULL::fixeo_pricing_offers_v1,$1::jsonb)',[JSON.stringify({...row,created_at:new Date().toISOString()})]);
 await db.exec('SET ROLE service_role');
 const args=[payload.context_id,payload.outcome_type,code,s.session_id,String(payload.amount_mad),'rabat','0612345678','Test only','FX-'+randomUUID().replaceAll('-','').slice(0,8).toUpperCase(),'a'.repeat(64),row.id];
 const confirmed=(await db.query('SELECT confirm_estimator_request_vap_v1('+args.map((_,i)=>'$'+(i+1)).join(',')+') AS r',args)).rows[0].r;assert.equal(confirmed.ok,true,JSON.stringify(confirmed));
 if(stage==='booked')return {request_id:confirmed.request_id,ref:args[8],offer:row};
 const dispatched=(await db.query('SELECT dispatch_request_v1($1) AS r',[confirmed.request_id])).rows[0].r;assert.equal(dispatched.ok,true,JSON.stringify(dispatched));
 const m=(await db.query('SELECT * FROM missions WHERE id=$1',[dispatched.mission_id])).rows[0];
 assert.equal(Number(m.agreed_price),payload.amount_mad);assert.equal(Number(m.commission_amount),spec.commission_minor/100);assert.equal(m.pricing_offer_id,row.id);
 await asArtisan(db);
 if(spec.installation){
  await assert.rejects(db.query('SELECT claim_mission($1)',[m.id]),/before acceptance/);
  await db.exec('RESET ROLE');assert.equal((await db.query('SELECT status FROM service_requests WHERE id=$1',[confirmed.request_id])).rows[0].status,'new');
  await asArtisan(db);
  await db.query('SELECT climatisation_offer_artisan_v1($1,$2)',[confirmed.request_id,JSON.stringify(spec.offer_checks)]);
 }
 const claim=(await db.query('SELECT claim_mission($1) AS r',[m.id])).rows[0].r;assert.equal(claim.ok,true,JSON.stringify(claim));
 const started=(await db.query('SELECT start_mission($1) AS r',[m.id])).rows[0].r;assert.equal(started.ok,true,JSON.stringify(started));
 await db.exec('RESET ROLE; SET ROLE service_role');
 return {...m,ref:args[8],offer:row};
}
async function asArtisan(db,uid=actor){await db.exec('RESET ROLE; SET ROLE authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[uid]);}
async function propose(db,m,code,paid=26000,id=randomUUID(),inputs=pilot.services[code].inputs,visit=true,checks=pilot.services[code].professional_checks){
 await asArtisan(db);return (await db.query('SELECT climatisation_repair_artisan_v1($1,$2,$3,$4,$5,$6,$7) AS r',[m.id,code,JSON.stringify(inputs),paid,id,visit,JSON.stringify(checks)])).rows[0].r;
}
async function decide(db,m,p,action='accept',hash='a'.repeat(64),paid=p.diagnostic_paid_minor){
 await db.exec('RESET ROLE; SET ROLE service_role');return (await db.query('SELECT climatisation_repair_guest_v1($1,$2,$3,$4,$5) AS r',[m.ref,hash,action,p.id,paid])).rows[0].r;
}
test('Approved climatisation: actual offer → atomic reservation → climatisation dispatch → single commission',async()=>{
 const db=await setup();try{
  for(const [code,s] of Object.entries(pilot.services)){
   await db.exec('RESET ROLE');
   assert.deepEqual((await db.query('SELECT fixeo_private.climatisation_tariff_v1($1) AS t',[code])).rows[0].t,s);
   const m=await mission(db,code);
   assert.equal((await db.query('SELECT service_category FROM artisans WHERE id=$1',[m.artisan_profile_id])).rows[0].service_category,'Climatisation');
   if(code!=='climatisation.diagnostic'){
    await assert.rejects(db.query('UPDATE missions SET final_price=$2 WHERE id=$1',[m.id,s.total_minor/100]),/pre-work/);
    await asArtisan(db);await db.query('SELECT climatisation_prework_artisan_v1($1,$2)',[m.id,JSON.stringify(s.professional_checks)]);
    await db.exec('RESET ROLE; SET ROLE service_role');
   }
   if(s.installation){
    await assert.rejects(db.query('UPDATE missions SET final_price=$2 WHERE id=$1',[m.id,s.total_minor/100]),/commissioning/);
    await asArtisan(db);await db.query('SELECT climatisation_completion_artisan_v1($1,$2)',[m.id,JSON.stringify({tightness_verified:true,vacuum_completed:true,commissioning_successful:true})]);
    await db.exec('RESET ROLE; SET ROLE service_role');
   }
   await db.query('UPDATE missions SET final_price=$2 WHERE id=$1',[m.id,s.total_minor/100]);
   await assert.rejects(db.query('UPDATE missions SET final_price=180 WHERE id=$1',[m.id]));
  }
  await db.exec('RESET ROLE');assert.equal(Number((await db.query("SELECT commission_amount FROM missions WHERE request_id='legacy'")).rows[0].commission_amount),45);
 }finally{await db.close();}
});
test('Professional checks require ownership, exact attestations and active lifecycle; audit records and artisan stay fixed',async()=>{
 const db=await setup();try{
  const code='climatisation.desinfection_profonde',s=pilot.services[code],m=await mission(db,code);
  await asArtisan(db,'10000000-0000-4000-8000-000000000002');
  await assert.rejects(db.query('SELECT climatisation_prework_artisan_v1($1,$2)',[m.id,JSON.stringify(s.professional_checks)]),/Mission not available/);
  await asArtisan(db);
  await assert.rejects(db.query('SELECT climatisation_prework_artisan_v1($1,$2)',[m.id,'{}']),/checks/);
  await assert.rejects(db.query('SELECT climatisation_prework_artisan_v1($1,$2)',[m.id,JSON.stringify({...s.professional_checks,fault_verified:false})]),/checks/);
  await db.exec('RESET ROLE; SET ROLE service_role');
  await assert.rejects(db.query("UPDATE missions SET status='done' WHERE id=$1",[m.id]),/pre-work/);
  await assert.rejects(db.query('SELECT climatisation_prework_artisan_v1($1,$2)',[m.id,JSON.stringify(s.professional_checks)]),/permission denied/);
  await asArtisan(db);
  const q='SELECT climatisation_prework_artisan_v1($1,$2) AS r',args=[m.id,JSON.stringify(s.professional_checks)];
  const checked=(await db.query(q,args)).rows[0].r;assert.equal(checked.prework_confirmed,true);assert.deepEqual((await db.query(q,args)).rows[0].r,checked);
  await db.exec('RESET ROLE');
  await assert.rejects(db.query('DELETE FROM fixeo_private.climatisation_prework_v1 WHERE mission_id=$1',[m.id]),/immutable/);
  await assert.rejects(db.query('UPDATE missions SET artisan_profile_id=NULL WHERE id=$1',[m.id]),/immutable/);
  await db.query("UPDATE missions SET status='done',final_price=450 WHERE id=$1",[m.id]);
  const diagnostic=await mission(db);await assert.rejects(propose(db,diagnostic,code,26000,randomUUID(),s.inputs,true,{}),/scope/);
  const direct=await mission(db,'climatisation.entretien_annuel');await db.query("UPDATE service_requests SET status='completed' WHERE id=$1",[direct.request_id]);
  await asArtisan(db);await assert.rejects(db.query(q,[direct.id,JSON.stringify(pilot.services['climatisation.entretien_annuel'].professional_checks)]),/mission state/);
  await db.exec('RESET ROLE');
  const rights=(await db.query(`SELECT has_function_privilege('anon','public.climatisation_repair_artisan_v1(uuid,text,jsonb,bigint,uuid,boolean,jsonb)','EXECUTE') AS anon_artisan,
   has_function_privilege('authenticated','public.climatisation_repair_guest_v1(text,text,text,uuid,bigint)','EXECUTE') AS auth_guest,
   has_function_privilege('anon','public.climatisation_prework_artisan_v1(uuid,jsonb)','EXECUTE') AS anon_prework,
   has_function_privilege('service_role','public.climatisation_repair_guest_v1(text,text,text,uuid,bigint)','EXECUTE') AS server_guest`)).rows[0];
  assert.deepEqual(rights,{anon_artisan:false,auth_guest:false,anon_prework:false,server_guest:true});
  const tables=(await db.query("SELECT relname,relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='fixeo_private' AND relname IN ('climatisation_proposals_v1','climatisation_decisions_v1','climatisation_prework_v1')")).rows;assert.equal(tables.length,3);assert.ok(tables.every(t=>t.relrowsecurity));
 }finally{await db.close();}
});
test('Both same-visit maintenance services, with or without diagnostic cash already received, keep one mission and immutable offers',async()=>{
 const db=await setup();try{
  for(const [code,s] of Object.entries(pilot.services).filter(([,s])=>s.followup))for(const paid of [0,26000]){
   const m=await mission(db),id=randomUUID();const proposed=await propose(db,m,code,paid,id);
   assert.equal(proposed.current_total_minor,26000);assert.equal(proposed.proposal.status,'PENDING');
   assert.deepEqual(await propose(db,m,code,paid,id),proposed);
   await assert.rejects(propose(db,m,code,paid===0?26000:0,id),/Idempotency conflict/);
   const accepted=await decide(db,m,proposed.proposal);
   assert.equal(accepted.current_total_minor,s.total_minor);assert.equal(accepted.remaining_due_minor,s.total_minor-paid);assert.equal(accepted.commission_minor,6000);assert.equal(accepted.can_propose,false);
   assert.deepEqual(await decide(db,m,proposed.proposal),accepted);
   const saved=(await db.query('SELECT * FROM missions WHERE id=$1',[m.id])).rows[0];
   assert.equal(saved.pricing_offer_id,m.pricing_offer_id);assert.equal(Number(saved.agreed_price),s.total_minor/100);assert.equal(Number(saved.commission_amount),60);
   assert.equal(Number((await db.query('SELECT client_total_minor FROM fixeo_pricing_offers_v1 WHERE id=$1',[m.pricing_offer_id])).rows[0].client_total_minor),26000);
   assert.equal((await db.query('SELECT count(*) AS n FROM missions WHERE request_id=$1',[m.request_id])).rows[0].n,1);
   await assert.rejects(db.query('UPDATE missions SET final_price=60 WHERE id=$1',[m.id]),/new accepted offer/);
   await assert.rejects(db.query('UPDATE missions SET pricing_offer_id=NULL WHERE id=$1',[m.id]),/immutable/);
   await assert.rejects(db.query('UPDATE missions SET artisan_profile_id=NULL WHERE id=$1',[m.id]),/immutable/);
   await assert.rejects(db.query("INSERT INTO missions(request_id,status) VALUES($1,'pending')",[m.request_id]),/already has its mission/);
   await db.query("UPDATE missions SET final_price=$2,status='done' WHERE id=$1",[m.id,s.total_minor/100]);
   await db.query('UPDATE missions SET final_price=$2 WHERE id=$1',[m.id,s.total_minor/100]);
   assert.deepEqual(await decide(db,m,proposed.proposal),accepted);
   await assert.rejects(propose(db,m,code),/not available/);
  }
 }finally{await db.close();}
});
test('Climatisation consent, ownership, scope, latest proposal, expiry, lifecycle and privilege boundaries fail closed',async()=>{
 const db=await setup();try{
  const m=await mission(db),code='climatisation.entretien_annuel';
  for(const blocked of ['climatisation.installation.standard','climatisation.installation.mono_split_5m','climatisation.desinstallation'])await assert.rejects(propose(db,m,blocked),/scope/);
  await assert.rejects(propose(db,m,code,26000,randomUUID(),{},true),/scope/);
  await assert.rejects(propose(db,m,code,26000,randomUUID(),pilot.services[code].inputs,false),/same visit/);
  await assert.rejects(propose(db,m,code,10000),/cash/);
  await asArtisan(db,'10000000-0000-4000-8000-000000000002');
  await assert.rejects(db.query('SELECT climatisation_repair_artisan_v1($1)',[m.id]),/Mission not available/);
  await asArtisan(db);
  await assert.rejects(db.query('SELECT climatisation_repair_guest_v1($1,$2)',[m.ref,'a'.repeat(64)]),/permission denied/);
  await assert.rejects(db.query('SELECT * FROM fixeo_private.climatisation_proposals_v1'),/permission denied/);
  await assert.rejects(db.query('UPDATE missions SET final_price=280 WHERE id=$1',[m.id]),/accepted offer/);
  const p=(await propose(db,m,code)).proposal;
  await assert.rejects(decide(db,m,p,'accept','b'.repeat(64)),/Request not found/);
  await assert.rejects(decide(db,m,p,'accept','a'.repeat(64),0),/Cash credit/);
  const declined=await decide(db,m,p,'decline');assert.equal(declined.current_total_minor,26000);assert.equal(declined.proposal.status,'DECLINED');
  await assert.rejects(decide(db,m,p),/already recorded/);
  const p2=(await propose(db,m,code)).proposal;
  const p3=(await propose(db,m,'climatisation.desinfection_profonde')).proposal;
  await assert.rejects(decide(db,m,p2),/no longer available/);
  await db.query("UPDATE service_requests SET status='completed' WHERE id=$1",[m.request_id]);
  await assert.rejects(decide(db,m,p3),/no longer available/);
  await db.exec('RESET ROLE');
  await assert.rejects(db.query('DELETE FROM fixeo_private.climatisation_decisions_v1 WHERE proposal_id=$1',[p.id]),/immutable/);
  assert.equal((await db.query('SELECT count(*) AS n FROM fixeo_private.climatisation_decisions_v1 WHERE accepted')).rows[0].n,0);
  // An expired offer can be seeded only as a historical fixture, never mutated.
  const expired=await mission(db);
  const pid=randomUUID();await propose(db,expired,code,0,pid);
  await db.exec('RESET ROLE');
  const src=(await db.query('SELECT * FROM fixeo_private.climatisation_proposals_v1 WHERE id=$1',[pid])).rows[0];
  const oldOffer=(await db.query('SELECT * FROM fixeo_pricing_offers_v1 WHERE id=$1',[src.repair_offer_id])).rows[0];
  const oldId=randomUUID();await db.query('INSERT INTO fixeo_pricing_offers_v1 SELECT * FROM jsonb_populate_record(NULL::fixeo_pricing_offers_v1,$1::jsonb)',[JSON.stringify({...oldOffer,id:oldId,offer_key:randomUUID(),created_at:'2026-01-01T00:00:00Z',expires_at:'2026-01-01T01:00:00Z'})]);
  const expiredId=randomUUID();await db.query('INSERT INTO fixeo_private.climatisation_proposals_v1(id,mission_id,request_id,artisan_id,original_offer_id,repair_offer_id,diagnostic_paid_minor,same_visit) VALUES($1,$2,$3,$4,$5,$6,0,true)',[expiredId,src.mission_id,src.request_id,src.artisan_id,src.original_offer_id,oldId]);
  await assert.rejects(decide(db,expired,{id:expiredId,diagnostic_paid_minor:0}),/no longer available/);
 }finally{await db.close();}
});

test('V2 installation acceptance is atomic, owner-bound, replayable and restricted to a single winner',async()=>{
 const db=await setup();try{
  const code='climatisation.installation.mono_split_5m',s=pilot.services[code],m=await mission(db,code,'booked'),other='10000000-0000-4000-8000-000000000002';
  await db.exec('RESET ROLE');
  const aid=(await db.query('SELECT id FROM artisans WHERE owner_user_id=$1',[actor])).rows[0].id;
  const bid=(await db.query("INSERT INTO artisans(owner_user_id,city,service_category,availability) VALUES($1,'Rabat','Climatisation','available') RETURNING id",[other])).rows[0].id;
  await db.query("INSERT INTO dispatch_execution_queue VALUES($1,$2,'QUEUED',now()),($1,$3,'CONTACTED',now())",[m.request_id,aid,bid]);
  await asArtisan(db);
  await assert.rejects(db.query('SELECT accept_my_dispatch_offer_v1($1)',[m.request_id]),/before acceptance/);
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT status FROM service_requests WHERE id=$1',[m.request_id])).rows[0].status,'new');
  assert.equal((await db.query('SELECT count(*) AS n FROM missions WHERE request_id=$1',[m.request_id])).rows[0].n,0);
  await assert.rejects(db.query("INSERT INTO missions(request_id,artisan_profile_id,status) VALUES($1,$2,'pending')",[m.request_id,aid]),/before acceptance/);
  await asArtisan(db,'10000000-0000-4000-8000-000000000003');
  await assert.rejects(db.query('SELECT climatisation_offer_artisan_v1($1,$2)',[m.request_id,JSON.stringify(s.offer_checks)]),/Opportunity/);
  await asArtisan(db);
  await assert.rejects(db.query('SELECT climatisation_offer_artisan_v1($1,$2)',[m.request_id,'{}']),/before acceptance/);
  const q='SELECT climatisation_offer_artisan_v1($1,$2) AS r',args=[m.request_id,JSON.stringify(s.offer_checks)];
  const checked=(await db.query(q,args)).rows[0].r;assert.equal(checked.confirmed,true);assert.equal(checked.materials_minor,60000);assert.equal(checked.commission_minor,9000);assert.deepEqual((await db.query(q,args)).rows[0].r,checked);
  await assert.rejects(db.query(q,[m.request_id,JSON.stringify({...s.offer_checks,kit_and_fixed_total_confirmed:false})]),/Idempotency/);
  await asArtisan(db,other);await db.query(q,args);
  await asArtisan(db);
  const winner=(await db.query('SELECT accept_my_dispatch_offer_v1($1) AS r',[m.request_id])).rows[0].r;assert.equal(winner.ok,true);
  const replay=(await db.query('SELECT accept_my_dispatch_offer_v1($1) AS r',[m.request_id])).rows[0].r;assert.equal(replay.mission_id,winner.mission_id);
  await asArtisan(db,other);assert.equal((await db.query('SELECT accept_my_dispatch_offer_v1($1) AS r',[m.request_id])).rows[0].r.ok,false);
  await db.exec('RESET ROLE');
  const saved=(await db.query('SELECT * FROM missions WHERE request_id=$1',[m.request_id])).rows;assert.equal(saved.length,1);assert.equal(saved[0].artisan_profile_id,aid);assert.equal(Number(saved[0].agreed_price),1290);assert.equal(Number(saved[0].commission_amount),90);
  await assert.rejects(db.query('DELETE FROM fixeo_private.climatisation_offer_checks_v1 WHERE request_id=$1',[m.request_id]),/immutable/);
 }finally{await db.close();}
});

test('Installation completion needs exact professional attestations and private audit tables have no direct access',async()=>{
 const db=await setup();try{
  const code='climatisation.installation.standard',s=pilot.services[code],m=await mission(db,code),done={tightness_verified:true,vacuum_completed:true,commissioning_successful:true};
  await asArtisan(db);await assert.rejects(db.query('SELECT climatisation_completion_artisan_v1($1,$2)',[m.id,JSON.stringify(done)]),/pre-work/);
  await db.query('SELECT climatisation_prework_artisan_v1($1,$2)',[m.id,JSON.stringify(s.professional_checks)]);
  await assert.rejects(db.query('SELECT climatisation_completion_artisan_v1($1,$2)',[m.id,JSON.stringify({...done,vacuum_completed:false})]),/checks/);
  await asArtisan(db,'10000000-0000-4000-8000-000000000002');await assert.rejects(db.query('SELECT climatisation_completion_artisan_v1($1,$2)',[m.id,JSON.stringify(done)]),/Mission not available/);
  await asArtisan(db);const q='SELECT climatisation_completion_artisan_v1($1,$2) AS r',args=[m.id,JSON.stringify(done)],completed=(await db.query(q,args)).rows[0].r;assert.equal(completed.completion_confirmed,true);assert.deepEqual((await db.query(q,args)).rows[0].r,completed);
  await db.exec('RESET ROLE');await assert.rejects(db.query('DELETE FROM fixeo_private.climatisation_completion_v1 WHERE mission_id=$1',[m.id]),/immutable/);
  await db.query("UPDATE missions SET status='done',final_price=1025 WHERE id=$1",[m.id]);
  const tables=(await db.query("SELECT c.relname,c.relrowsecurity,has_table_privilege('authenticated',c.oid,'SELECT') AS auth_read,has_table_privilege('service_role',c.oid,'INSERT') AS server_write FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='fixeo_private' AND c.relkind='r' AND c.relname LIKE 'climatisation_%'")).rows;
  assert.equal(tables.length,5);assert.ok(tables.every(t=>t.relrowsecurity&&!t.auth_read&&!t.server_write));
  for(const signature of ['public.climatisation_offer_artisan_v1(uuid,jsonb)','public.climatisation_completion_artisan_v1(uuid,jsonb)']){
   assert.deepEqual((await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') AS anon,has_function_privilege('service_role',$1,'EXECUTE') AS server,has_function_privilege('authenticated',$1,'EXECUTE') AS artisan",[signature])).rows[0],{anon:false,server:false,artisan:true});
  }
  const privateHelpers=(await db.query("SELECT p.proname,has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth,has_function_privilege('service_role',p.oid,'EXECUTE') AS server FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='fixeo_private' AND p.proname LIKE 'climatisation_%'")).rows;
  assert.equal(privateHelpers.length,3);assert.ok(privateHelpers.every(p=>!p.auth&&!p.server));
 }finally{await db.close();}
});
