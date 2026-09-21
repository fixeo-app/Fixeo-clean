const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const pilot=require('../../data/pricing/engine/electricity-pilot-v1');
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
 await db.exec("INSERT INTO artisans(city,service_category,availability,review_count,rating,updated_at) VALUES ('Rabat','Carrelage','available',500,5,now()),('Rabat','Électricité','available',0,0,now());");

 await db.exec(`ALTER TABLE service_requests ADD commission_paid boolean DEFAULT false, ADD commission_paid_at timestamptz, ADD commission_status text;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA auth TO authenticated;
 UPDATE artisans SET owner_user_id='${actor}' WHERE service_category='Électricité';`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260921122543_plumbing_same_visit_repair.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260921132727_electricity_same_visit_repair.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260921142222_climatisation_same_visit_service.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260921154406_serrurerie_same_visit_service.sql'),'utf8'));
 return db;
}
async function mission(db,code='electricite.diagnostic'){
 await db.exec('RESET ROLE');
 const spec=pilot.services[code]||require('../../data/pricing/engine/plumbing-pilot-v1').services[code];
 const s=o.evaluateEstimator(o.startEstimator({service_hint:code,city_slug:'rabat',known_inputs:spec.inputs}).session).session;
 const payload={service_code:code,city_slug:'rabat',session_id:s.session_id,context_id:'fxctx-'+randomUUID().replaceAll('-',''),outcome_type:s.outcome.outcome_type,expires_at:Date.now()+60000};let row;
 await attachOffer(s,payload,{env:{SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test'},fetchImpl:async(_,opts)=>{row=JSON.parse(opts.body);return {ok:true};}});
 await db.query('INSERT INTO fixeo_pricing_offers_v1 SELECT * FROM jsonb_populate_record(NULL::fixeo_pricing_offers_v1,$1::jsonb)',[JSON.stringify({...row,created_at:new Date().toISOString()})]);
 await db.exec('SET ROLE service_role');
 const args=[payload.context_id,payload.outcome_type,code,s.session_id,String(payload.amount_mad),'rabat','0612345678','Test only','FX-'+randomUUID().replaceAll('-','').slice(0,8).toUpperCase(),'a'.repeat(64),row.id];
 const confirmed=(await db.query('SELECT confirm_estimator_request_vap_v1('+args.map((_,i)=>'$'+(i+1)).join(',')+') AS r',args)).rows[0].r;assert.equal(confirmed.ok,true,JSON.stringify(confirmed));
 const dispatched=(await db.query('SELECT dispatch_request_v1($1) AS r',[confirmed.request_id])).rows[0].r;assert.equal(dispatched.ok,true,JSON.stringify(dispatched));
 const m=(await db.query('SELECT * FROM missions WHERE id=$1',[dispatched.mission_id])).rows[0];
 assert.equal(Number(m.agreed_price),payload.amount_mad);assert.equal(Number(m.commission_amount),60);assert.equal(m.pricing_offer_id,row.id);
 await db.query("UPDATE service_requests SET status='in_progress' WHERE id=$1",[confirmed.request_id]);
 // Dispatch v1 creates offered missions; acceptance occurs before the on-site repair.
 await db.query("UPDATE missions SET status='pending' WHERE id=$1",[m.id]);
 return {...m,ref:args[8],offer:row};
}
async function asArtisan(db,uid=actor){await db.exec('RESET ROLE; SET ROLE authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[uid]);}
async function propose(db,m,code,paid=24000,id=randomUUID(),inputs=pilot.services[code].inputs,visit=true,checks=pilot.services[code].professional_checks){
 await asArtisan(db);return (await db.query('SELECT electricity_repair_artisan_v1($1,$2,$3,$4,$5,$6,$7) AS r',[m.id,code,JSON.stringify(inputs),paid,id,visit,JSON.stringify(checks)])).rows[0].r;
}
async function decide(db,m,p,action='accept',hash='a'.repeat(64),paid=p.diagnostic_paid_minor){
 await db.exec('RESET ROLE; SET ROLE service_role');return (await db.query('SELECT electricity_repair_guest_v1($1,$2,$3,$4,$5) AS r',[m.ref,hash,action,p.id,paid])).rows[0].r;
}
test('Approved electricity: actual offer → atomic reservation → electricity dispatch → single commission',async()=>{
 const db=await setup();try{
  for(const [code,s] of Object.entries(pilot.services)){
   await db.exec('RESET ROLE');
   assert.deepEqual((await db.query('SELECT fixeo_private.electricity_tariff_v1($1) AS t',[code])).rows[0].t,s);
   const m=await mission(db,code);
   assert.equal((await db.query('SELECT service_category FROM artisans WHERE id=$1',[m.artisan_profile_id])).rows[0].service_category,'Électricité');
   if(s.parts){
    await assert.rejects(db.query('UPDATE missions SET final_price=$2 WHERE id=$1',[m.id,s.total_minor/100]),/pre-work/);
    await asArtisan(db);await db.query('SELECT electricity_prework_artisan_v1($1,$2)',[m.id,JSON.stringify(s.professional_checks)]);
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
  const code='electricite.disjoncteur_remplacement',s=pilot.services[code],m=await mission(db,code);
  await asArtisan(db,'10000000-0000-4000-8000-000000000002');
  await assert.rejects(db.query('SELECT electricity_prework_artisan_v1($1,$2)',[m.id,JSON.stringify(s.professional_checks)]),/Mission not available/);
  await asArtisan(db);
  await assert.rejects(db.query('SELECT electricity_prework_artisan_v1($1,$2)',[m.id,'{}']),/checks/);
  await assert.rejects(db.query('SELECT electricity_prework_artisan_v1($1,$2)',[m.id,JSON.stringify({...s.professional_checks,fault_verified:false})]),/checks/);
  await db.exec('RESET ROLE; SET ROLE service_role');
  await assert.rejects(db.query("UPDATE missions SET status='done' WHERE id=$1",[m.id]),/pre-work/);
  await assert.rejects(db.query('SELECT electricity_prework_artisan_v1($1,$2)',[m.id,JSON.stringify(s.professional_checks)]),/permission denied/);
  await asArtisan(db);
  const q='SELECT electricity_prework_artisan_v1($1,$2) AS r',args=[m.id,JSON.stringify(s.professional_checks)];
  const checked=(await db.query(q,args)).rows[0].r;assert.equal(checked.prework_confirmed,true);assert.deepEqual((await db.query(q,args)).rows[0].r,checked);
  await db.exec('RESET ROLE');
  await assert.rejects(db.query('DELETE FROM fixeo_private.electricity_prework_v1 WHERE mission_id=$1',[m.id]),/immutable/);
  await assert.rejects(db.query('UPDATE missions SET artisan_profile_id=NULL WHERE id=$1',[m.id]),/immutable/);
  await db.query("UPDATE missions SET status='done',final_price=310 WHERE id=$1",[m.id]);
  const diagnostic=await mission(db);await assert.rejects(propose(db,diagnostic,code,24000,randomUUID(),s.inputs,true,{}),/scope/);
  const direct=await mission(db,'electricite.prise_remplacement');await db.query("UPDATE service_requests SET status='completed' WHERE id=$1",[direct.request_id]);
  await asArtisan(db);await assert.rejects(db.query(q,[direct.id,JSON.stringify(pilot.services['electricite.prise_remplacement'].professional_checks)]),/mission state/);
  await db.exec('RESET ROLE');
  const rights=(await db.query(`SELECT has_function_privilege('anon','public.electricity_repair_artisan_v1(uuid,text,jsonb,bigint,uuid,boolean,jsonb)','EXECUTE') AS anon_artisan,
   has_function_privilege('authenticated','public.electricity_repair_guest_v1(text,text,text,uuid,bigint)','EXECUTE') AS auth_guest,
   has_function_privilege('anon','public.electricity_prework_artisan_v1(uuid,jsonb)','EXECUTE') AS anon_prework,
   has_function_privilege('service_role','public.electricity_repair_guest_v1(text,text,text,uuid,bigint)','EXECUTE') AS server_guest`)).rows[0];
  assert.deepEqual(rights,{anon_artisan:false,auth_guest:false,anon_prework:false,server_guest:true});
  const tables=(await db.query("SELECT relname,relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='fixeo_private' AND relname IN ('electricity_proposals_v1','electricity_decisions_v1','electricity_prework_v1')")).rows;assert.equal(tables.length,3);assert.ok(tables.every(t=>t.relrowsecurity));
 }finally{await db.close();}
});
test('An identical proposal UUID in plumbing and electricity cannot mix accepted offers or commissions',async()=>{
 const db=await setup();try{
  await db.exec(`INSERT INTO artisans(city,service_category,availability,owner_user_id) VALUES('Rabat','Plomberie','available','${actor}')`);
  const pl=require('../../data/pricing/engine/plumbing-pilot-v1'),pid=randomUUID(),m=await mission(db,'plomberie.diagnostic');
  await asArtisan(db);
  const plumbing=(await db.query('SELECT plumbing_repair_artisan_v1($1,$2,$3,$4,$5,true) AS r',[m.id,'plomberie.fuite_simple',JSON.stringify(pl.services['plomberie.fuite_simple'].inputs),22000,pid])).rows[0].r;
  await db.exec('RESET ROLE; SET ROLE service_role');
  await db.query("SELECT plumbing_repair_guest_v1($1,$2,'accept',$3,22000)",[m.ref,'a'.repeat(64),plumbing.proposal.id]);
  const electrical=await mission(db),proposal=(await propose(db,electrical,'electricite.prise_remplacement',24000,pid)).proposal;
  const accepted=await decide(db,electrical,proposal);assert.equal(accepted.current_total_minor,26000);assert.equal(accepted.remaining_due_minor,2000);
  for(const [missionId,total]of [[m.id,280],[electrical.id,260]]){
   await db.query('UPDATE missions SET final_price=$2 WHERE id=$1',[missionId,total]);
   const saved=(await db.query('SELECT agreed_price,commission_amount FROM missions WHERE id=$1',[missionId])).rows[0];assert.equal(Number(saved.agreed_price),total);assert.equal(Number(saved.commission_amount),60);
  }
 }finally{await db.close();}
});
test('All five same-visit repairs, with or without diagnostic cash already received, keep one mission and immutable offers',async()=>{
 const db=await setup();try{
  for(const [code,s] of Object.entries(pilot.services).filter(([c])=>c!=='electricite.diagnostic'))for(const paid of [0,24000]){
   const m=await mission(db),id=randomUUID();const proposed=await propose(db,m,code,paid,id);
   assert.equal(proposed.current_total_minor,24000);assert.equal(proposed.proposal.status,'PENDING');
   assert.deepEqual(await propose(db,m,code,paid,id),proposed);
   await assert.rejects(propose(db,m,code,paid===0?24000:0,id),/Idempotency conflict/);
   const accepted=await decide(db,m,proposed.proposal);
   assert.equal(accepted.current_total_minor,s.total_minor);assert.equal(accepted.remaining_due_minor,s.total_minor-paid);assert.equal(accepted.commission_minor,6000);assert.equal(accepted.can_propose,false);
   assert.deepEqual(await decide(db,m,proposed.proposal),accepted);
   const saved=(await db.query('SELECT * FROM missions WHERE id=$1',[m.id])).rows[0];
   assert.equal(saved.pricing_offer_id,m.pricing_offer_id);assert.equal(Number(saved.agreed_price),s.total_minor/100);assert.equal(Number(saved.commission_amount),60);
   assert.equal(Number((await db.query('SELECT client_total_minor FROM fixeo_pricing_offers_v1 WHERE id=$1',[m.pricing_offer_id])).rows[0].client_total_minor),24000);
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
test('Electrical consent, ownership, scope, latest proposal, expiry, lifecycle and privilege boundaries fail closed',async()=>{
 const db=await setup();try{
  const m=await mission(db),code='electricite.prise_remplacement';
  await assert.rejects(propose(db,m,code,24000,randomUUID(),{},true),/scope/);
  await assert.rejects(propose(db,m,code,24000,randomUUID(),pilot.services[code].inputs,false),/same visit/);
  await assert.rejects(propose(db,m,code,10000),/cash/);
  await asArtisan(db,'10000000-0000-4000-8000-000000000002');
  await assert.rejects(db.query('SELECT electricity_repair_artisan_v1($1)',[m.id]),/Mission not available/);
  await asArtisan(db);
  await assert.rejects(db.query('SELECT electricity_repair_guest_v1($1,$2)',[m.ref,'a'.repeat(64)]),/permission denied/);
  await assert.rejects(db.query('SELECT * FROM fixeo_private.electricity_proposals_v1'),/permission denied/);
  await assert.rejects(db.query('UPDATE missions SET final_price=280 WHERE id=$1',[m.id]),/accepted offer/);
  const p=(await propose(db,m,code)).proposal;
  await assert.rejects(decide(db,m,p,'accept','b'.repeat(64)),/Request not found/);
  await assert.rejects(decide(db,m,p,'accept','a'.repeat(64),0),/Cash credit/);
  const declined=await decide(db,m,p,'decline');assert.equal(declined.current_total_minor,24000);assert.equal(declined.proposal.status,'DECLINED');
  await assert.rejects(decide(db,m,p),/already recorded/);
  const p2=(await propose(db,m,code)).proposal;
  const p3=(await propose(db,m,'electricite.disjoncteur_remplacement')).proposal;
  await assert.rejects(decide(db,m,p2),/no longer available/);
  await db.query("UPDATE service_requests SET status='completed' WHERE id=$1",[m.request_id]);
  await assert.rejects(decide(db,m,p3),/no longer available/);
  await db.exec('RESET ROLE');
  await assert.rejects(db.query('DELETE FROM fixeo_private.electricity_decisions_v1 WHERE proposal_id=$1',[p.id]),/immutable/);
  assert.equal((await db.query('SELECT count(*) AS n FROM fixeo_private.electricity_decisions_v1 WHERE accepted')).rows[0].n,0);
  // An expired offer can be seeded only as a historical fixture, never mutated.
  const expired=await mission(db);
  const pid=randomUUID();await propose(db,expired,code,0,pid);
  await db.exec('RESET ROLE');
  const src=(await db.query('SELECT * FROM fixeo_private.electricity_proposals_v1 WHERE id=$1',[pid])).rows[0];
  const oldOffer=(await db.query('SELECT * FROM fixeo_pricing_offers_v1 WHERE id=$1',[src.repair_offer_id])).rows[0];
  const oldId=randomUUID();await db.query('INSERT INTO fixeo_pricing_offers_v1 SELECT * FROM jsonb_populate_record(NULL::fixeo_pricing_offers_v1,$1::jsonb)',[JSON.stringify({...oldOffer,id:oldId,offer_key:randomUUID(),created_at:'2026-01-01T00:00:00Z',expires_at:'2026-01-01T01:00:00Z'})]);
  const expiredId=randomUUID();await db.query('INSERT INTO fixeo_private.electricity_proposals_v1(id,mission_id,request_id,artisan_id,original_offer_id,repair_offer_id,diagnostic_paid_minor,same_visit) VALUES($1,$2,$3,$4,$5,$6,0,true)',[expiredId,src.mission_id,src.request_id,src.artisan_id,src.original_offer_id,oldId]);
  await assert.rejects(decide(db,expired,{id:expiredId,diagnostic_paid_minor:0}),/no longer available/);
 }finally{await db.close();}
});
