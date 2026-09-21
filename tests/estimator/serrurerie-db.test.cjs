const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const pilot=require('../../data/pricing/engine/serrurerie-pilot-v1');
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
 await db.exec("INSERT INTO artisans(city,service_category,availability,review_count,rating,updated_at) VALUES ('Rabat','Carrelage','available',500,5,now()),('Rabat','Serrurerie','available',0,0,now());");

 await db.exec(`ALTER TABLE service_requests ADD commission_paid boolean DEFAULT false, ADD commission_paid_at timestamptz, ADD commission_status text;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA auth TO authenticated;
 UPDATE artisans SET owner_user_id='${actor}' WHERE service_category='Serrurerie';`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260921122543_plumbing_same_visit_repair.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260921132727_electricity_same_visit_repair.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260921142222_climatisation_same_visit_service.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260921154406_serrurerie_same_visit_service.sql'),'utf8'));
 await db.exec('ALTER TABLE missions ADD accepted_at timestamptz; CREATE TABLE dispatch_execution_queue(request_id uuid,artisan_id uuid,execution_status text,updated_at timestamptz); GRANT ALL ON dispatch_execution_queue TO service_role,authenticated;');
 await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/clim-lifecycle-live-20260921.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/serr-complete-live-20260921.sql'),'utf8'));
 return db;
}
async function mission(db,code='serrurerie.diagnostic',stage='started'){
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
 if(spec.offer_checks){
  await assert.rejects(db.query('SELECT claim_mission($1)',[m.id]),/before acceptance/);
  await db.exec('RESET ROLE');assert.equal((await db.query('SELECT status FROM service_requests WHERE id=$1',[confirmed.request_id])).rows[0].status,'new');
  await asArtisan(db);
  await db.query('SELECT serrurerie_offer_artisan_v1($1,$2)',[confirmed.request_id,JSON.stringify(spec.offer_checks)]);
 }
 const claim=(await db.query('SELECT claim_mission($1) AS r',[m.id])).rows[0].r;assert.equal(claim.ok,true,JSON.stringify(claim));
 const started=(await db.query('SELECT start_mission($1) AS r',[m.id])).rows[0].r;assert.equal(started.ok,true,JSON.stringify(started));
 await db.exec('RESET ROLE; SET ROLE service_role');
 return {...m,ref:args[8],offer:row};
}
async function asArtisan(db,uid=actor){await db.exec('RESET ROLE; SET ROLE authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[uid]);}
async function propose(db,m,code,paid=22000,id=randomUUID(),inputs=pilot.services[code].inputs,visit=true,checks=pilot.services[code].professional_checks){
 await asArtisan(db);return (await db.query('SELECT serrurerie_repair_artisan_v1($1,$2,$3,$4,$5,$6,$7) AS r',[m.id,code,JSON.stringify(inputs),paid,id,visit,JSON.stringify(checks)])).rows[0].r;
}
async function decide(db,m,p,action='accept',hash='a'.repeat(64),paid=p.diagnostic_paid_minor){
 await db.exec('RESET ROLE; SET ROLE service_role');return (await db.query('SELECT serrurerie_repair_guest_v1($1,$2,$3,$4,$5) AS r',[m.ref,hash,action,p.id,paid])).rows[0].r;
}

async function prework(db,m,code='serrurerie.diagnostic',method='OCCUPANT_DOCUMENTS'){
 await asArtisan(db);return (await db.query('SELECT serrurerie_prework_artisan_v1($1,$2,$3) AS r',[m.id,JSON.stringify(pilot.services[code].professional_checks),method])).rows[0].r;
}
async function result(db,m,code='serrurerie.diagnostic'){
 await asArtisan(db);return (await db.query('SELECT serrurerie_completion_artisan_v1($1,$2) AS r',[m.id,JSON.stringify(pilot.services[code].completion_checks)])).rows[0].r;
}
async function readyDiagnostic(db,m){await prework(db,m);await result(db,m);}
async function complete(db,m){await asArtisan(db);return (await db.query('SELECT complete_mission($1) AS r',[m.id])).rows[0].r;}

test('Six locksmith services: real reservation, dispatch, acceptance, access verification, completion and settlement',async()=>{
 const db=await setup();try{
  for(const [code,s]of Object.entries(pilot.services)){
   await db.exec('RESET ROLE');assert.deepEqual((await db.query('SELECT fixeo_private.serrurerie_tariff_v1($1) AS t',[code])).rows[0].t,s);
   const m=await mission(db,code);
   assert.equal((await db.query('SELECT service_category FROM artisans WHERE id=$1',[m.artisan_profile_id])).rows[0].service_category,'Serrurerie');
   await assert.rejects(db.query('UPDATE missions SET final_price=$2 WHERE id=$1',[m.id,s.total_minor/100]),/pre-work/);
   assert.equal((await complete(db,m)).ok,false);
   await db.exec('RESET ROLE');assert.equal((await db.query('SELECT status FROM service_requests WHERE id=$1',[m.request_id])).rows[0].status,'in_progress');
   await result(db,m,code).then(()=>assert.fail('result before access accepted'),e=>assert.match(e.message,/pre-work/));
   const checked=await prework(db,m,code);assert.equal(checked.prework_confirmed,true);assert.equal(checked.completion_confirmed,false);
   assert.equal((await complete(db,m)).ok,false);
   await db.exec('RESET ROLE');await assert.rejects(db.query('UPDATE missions SET final_price=$2 WHERE id=$1',[m.id,s.total_minor/100]),/result confirmation/);
   const done=await result(db,m,code);assert.equal(done.completion_confirmed,true);assert.equal((await complete(db,m)).ok,true);assert.equal((await complete(db,m)).already_completed,true);
   await db.exec('RESET ROLE; SET ROLE service_role');await db.query('UPDATE missions SET final_price=$2 WHERE id=$1',[m.id,s.total_minor/100]);
   const saved=(await db.query('SELECT * FROM missions WHERE id=$1',[m.id])).rows[0];assert.equal(saved.status,'done');assert.equal(Number(saved.final_price),s.total_minor/100);assert.equal(Number(saved.commission_amount),60);
   await assert.rejects(db.query('UPDATE missions SET final_price=180 WHERE id=$1',[m.id]),/accepted offer/);
   assert.equal((await db.query('SELECT status FROM service_requests WHERE id=$1',[m.request_id])).rows[0].status,'completed');
  }
  await db.exec('RESET ROLE');assert.equal(Number((await db.query("SELECT commission_amount FROM missions WHERE request_id='legacy'")).rows[0].commission_amount),45);
 }finally{await db.close();}
});

test('Access attestations require ownership, a constrained proof type and exact checks; no raw identity data or mutable audit',async()=>{
 const db=await setup();try{
  const code='serrurerie.cylindre_remplacement.standard',s=pilot.services[code],m=await mission(db,code);
  const q='SELECT serrurerie_prework_artisan_v1($1,$2,$3) AS r',args=[m.id,JSON.stringify(s.professional_checks),'OCCUPANT_DOCUMENTS'];
  await asArtisan(db,'10000000-0000-4000-8000-000000000002');await assert.rejects(db.query(q,args),/Mission not available/);
  await asArtisan(db);
  for(const method of [null,'','CIN-12345','DOCUMENTS_INSIDE'])await assert.rejects(db.query(q,[args[0],args[1],method]),/checks/);
  for(const patch of [{...s.professional_checks,identity_and_access_right_verified_before_work:false},{...s.professional_checks,identity_number:'forbidden'},{}])await assert.rejects(db.query(q,[args[0],JSON.stringify(patch),args[2]]),/checks/);
  const checked=(await db.query(q,args)).rows[0].r;assert.equal(checked.prework_confirmed,true);assert.deepEqual((await db.query(q,args)).rows[0].r,checked);
  await assert.rejects(db.query(q,[args[0],args[1],'AUTHORIZED_MANDATE']),/Idempotency/);
  const done=pilot.services[code].completion_checks;
  await assert.rejects(db.query('SELECT serrurerie_completion_artisan_v1($1,$2)',[m.id,JSON.stringify({...done,part_installed_and_tested:false})]),/checks/);
  await db.exec('RESET ROLE');await assert.rejects(db.query('DELETE FROM fixeo_private.serrurerie_prework_v1 WHERE mission_id=$1',[m.id]),/immutable/);
  await assert.rejects(db.query('UPDATE missions SET artisan_profile_id=NULL WHERE id=$1',[m.id]),/immutable|before acceptance/);
  const record=(await db.query('SELECT * FROM fixeo_private.serrurerie_prework_v1 WHERE mission_id=$1',[m.id])).rows[0];assert.equal(record.access_check_type,'OCCUPANT_DOCUMENTS');assert.equal(Object.keys(record).length,6);
  await db.exec('SET ROLE service_role');const publicView=(await db.query('SELECT serrurerie_repair_guest_v1($1,$2) AS r',[m.ref,'a'.repeat(64)])).rows[0].r;
  assert.doesNotMatch(JSON.stringify(publicView),/OCCUPANT_DOCUMENTS|professional_checks|access_check_type|identity_number/);
  await db.exec('RESET ROLE');
  const tables=(await db.query("SELECT c.relname,c.relrowsecurity,has_table_privilege('authenticated',c.oid,'SELECT') AS auth_read,has_table_privilege('service_role',c.oid,'INSERT') AS server_write FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='fixeo_private' AND c.relkind='r' AND c.relname LIKE 'serrurerie_%'")).rows;
  assert.equal(tables.length,5);assert.ok(tables.every(t=>t.relrowsecurity&&!t.auth_read&&!t.server_write));
  for(const signature of ['serrurerie_prework_artisan_v1(uuid,jsonb,text)','serrurerie_offer_artisan_v1(uuid,jsonb)','serrurerie_completion_artisan_v1(uuid,jsonb)','serrurerie_repair_artisan_v1(uuid,text,jsonb,bigint,uuid,boolean,jsonb)'])assert.deepEqual((await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') AS anon,has_function_privilege('service_role',$1,'EXECUTE') AS server,has_function_privilege('authenticated',$1,'EXECUTE') AS artisan",['public.'+signature])).rows[0],{anon:false,server:false,artisan:true});
  const helpers=(await db.query("SELECT has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth,has_function_privilege('service_role',p.oid,'EXECUTE') AS server FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='fixeo_private' AND p.proname LIKE 'serrurerie_%'")).rows;assert.equal(helpers.length,4);assert.ok(helpers.every(x=>!x.auth&&!x.server));
 }finally{await db.close();}
});

test('Five same-visit conversions with both cash credits keep one offer binding, one mission and one fee; actual follow-up result is required',async()=>{
 const db=await setup();try{
  for(const [code,s] of Object.entries(pilot.services).filter(([,s])=>s.followup))for(const paid of [0,22000]){
   const m=await mission(db),id=randomUUID();
   await assert.rejects(propose(db,m,code,paid,id),/not available/);await readyDiagnostic(db,m);
   const proposed=await propose(db,m,code,paid,id);assert.equal(proposed.current_total_minor,22000);assert.equal(proposed.proposal.status,'PENDING');
   assert.deepEqual(await propose(db,m,code,paid,id),proposed);
   await assert.rejects(propose(db,m,code,paid===0?22000:0,id),/Idempotency/);
   const accepted=await decide(db,m,proposed.proposal);assert.equal(accepted.current_total_minor,s.total_minor);assert.equal(accepted.remaining_due_minor,s.total_minor-paid);assert.equal(accepted.commission_minor,6000);assert.equal(accepted.can_propose,false);assert.equal(accepted.prework_confirmed,true);assert.equal(accepted.completion_confirmed,false);assert.equal(accepted.direct_service_code,code);
   assert.deepEqual(await decide(db,m,proposed.proposal),accepted);
   const saved=(await db.query('SELECT * FROM missions WHERE id=$1',[m.id])).rows[0];assert.equal(saved.pricing_offer_id,m.pricing_offer_id);assert.equal(Number(saved.agreed_price),s.total_minor/100);assert.equal(Number(saved.commission_amount),60);
   assert.equal(Number((await db.query('SELECT client_total_minor FROM fixeo_pricing_offers_v1 WHERE id=$1',[m.pricing_offer_id])).rows[0].client_total_minor),22000);
   await assert.rejects(db.query('UPDATE missions SET final_price=$2 WHERE id=$1',[m.id,s.total_minor/100]),/result confirmation/);
   assert.equal((await complete(db,m)).ok,false);await result(db,m,code);assert.equal((await complete(db,m)).ok,true);
   await db.exec('RESET ROLE; SET ROLE service_role');
   await assert.rejects(db.query('UPDATE missions SET final_price=40 WHERE id=$1',[m.id]),/accepted offer/);
   await db.query('UPDATE missions SET final_price=$2 WHERE id=$1',[m.id,s.total_minor/100]);
   await assert.rejects(db.query('UPDATE missions SET pricing_offer_id=NULL WHERE id=$1',[m.id]),/immutable/);
   await assert.rejects(db.query("INSERT INTO missions(request_id,status) VALUES($1,'pending')",[m.request_id]),/already has its mission/);
   assert.equal((await db.query('SELECT count(*) AS n FROM missions WHERE request_id=$1',[m.request_id])).rows[0].n,1);
  }
 }finally{await db.close();}
});

test('A locked door, forged price, missing part confirmation or unapproved city cannot be inserted as a payable locksmith offer',async()=>{
 const db=await setup();try{
  const m=await mission(db,'serrurerie.cylindre_remplacement.standard','booked');await db.exec('RESET ROLE');
  const valid=(await db.query('SELECT * FROM fixeo_pricing_offers_v1 WHERE id=$1',[m.offer.id])).rows[0];
  for(const patch of [{service_code:'serrurerie.porte_verrouillee.ouverture'},{catalogue_version:'legacy-v1'},{city:'unapproved-city'},{vap_minor:30000,commission_minor:6000,client_total_minor:36000},{scope:{inputs:{...valid.scope.inputs,locksmith_part_fit:'UNKNOWN'}}},{scope:{inputs:{...valid.scope.inputs,locksmith_access_right:'DISPUTED_OR_UNAUTHORIZED'}}},{scope:{inputs:{...valid.scope.inputs,identity_document:'forbidden'}}}]){
   const row={...valid,id:randomUUID(),offer_key:randomUUID(),...patch};await assert.rejects(db.query('INSERT INTO fixeo_pricing_offers_v1 SELECT * FROM jsonb_populate_record(NULL::fixeo_pricing_offers_v1,$1::jsonb)',[JSON.stringify(row)]),/approved city/);
  }
 }finally{await db.close();}
});
test('Serrurerie consent, ownership, scope, latest proposal, expiry, lifecycle and privilege boundaries fail closed',async()=>{
 const db=await setup();try{
  const m=await mission(db),code='serrurerie.porte_claquee_ouverture';
  for(const blocked of ['serrurerie.porte_verrouillee.ouverture','serrurerie.diagnostic','serrurerie.unknown'])await assert.rejects(propose(db,m,blocked,22000,randomUUID(),{},true,{}),/scope/);
  await assert.rejects(propose(db,m,code,22000,randomUUID(),{},true),/scope/);
  await assert.rejects(propose(db,m,code,22000,randomUUID(),pilot.services[code].inputs,false),/same visit/);
  await assert.rejects(propose(db,m,code,10000),/cash/);
  await asArtisan(db,'10000000-0000-4000-8000-000000000002');
  await assert.rejects(db.query('SELECT serrurerie_repair_artisan_v1($1)',[m.id]),/Mission not available/);
  await asArtisan(db);
  await assert.rejects(db.query('SELECT serrurerie_repair_guest_v1($1,$2)',[m.ref,'a'.repeat(64)]),/permission denied/);
  await assert.rejects(db.query('SELECT * FROM fixeo_private.serrurerie_proposals_v1'),/permission denied/);
  await assert.rejects(db.query('UPDATE missions SET final_price=280 WHERE id=$1',[m.id]),/pre-work/);
  await readyDiagnostic(db,m);const p=(await propose(db,m,code)).proposal;
  await assert.rejects(decide(db,m,p,'accept','b'.repeat(64)),/Request not found/);
  await assert.rejects(decide(db,m,p,'accept','a'.repeat(64),0),/Cash credit/);
  const declined=await decide(db,m,p,'decline');assert.equal(declined.current_total_minor,22000);assert.equal(declined.proposal.status,'DECLINED');
  await assert.rejects(decide(db,m,p),/already recorded/);
  const p2=(await propose(db,m,code)).proposal;
  const p3=(await propose(db,m,'serrurerie.serrure_remplacement.standard')).proposal;
  await assert.rejects(decide(db,m,p2),/no longer available/);
  await db.query("UPDATE service_requests SET status='completed' WHERE id=$1",[m.request_id]);
  await assert.rejects(decide(db,m,p3),/no longer available/);
  await db.exec('RESET ROLE');
  await assert.rejects(db.query('DELETE FROM fixeo_private.serrurerie_decisions_v1 WHERE proposal_id=$1',[p.id]),/immutable/);
  assert.equal((await db.query('SELECT count(*) AS n FROM fixeo_private.serrurerie_decisions_v1 WHERE accepted')).rows[0].n,0);
  // An expired offer can be seeded only as a historical fixture, never mutated.
  const expired=await mission(db);
  await readyDiagnostic(db,expired);const pid=randomUUID();await propose(db,expired,code,0,pid);
  await db.exec('RESET ROLE');
  const src=(await db.query('SELECT * FROM fixeo_private.serrurerie_proposals_v1 WHERE id=$1',[pid])).rows[0];
  const oldOffer=(await db.query('SELECT * FROM fixeo_pricing_offers_v1 WHERE id=$1',[src.repair_offer_id])).rows[0];
  const oldId=randomUUID();await db.query('INSERT INTO fixeo_pricing_offers_v1 SELECT * FROM jsonb_populate_record(NULL::fixeo_pricing_offers_v1,$1::jsonb)',[JSON.stringify({...oldOffer,id:oldId,offer_key:randomUUID(),created_at:'2026-01-01T00:00:00Z',expires_at:'2026-01-01T01:00:00Z'})]);
  const expiredId=randomUUID();await db.query('INSERT INTO fixeo_private.serrurerie_proposals_v1(id,mission_id,request_id,artisan_id,original_offer_id,repair_offer_id,diagnostic_paid_minor,same_visit) VALUES($1,$2,$3,$4,$5,$6,0,true)',[expiredId,src.mission_id,src.request_id,src.artisan_id,src.original_offer_id,oldId]);
  await assert.rejects(decide(db,expired,{id:expiredId,diagnostic_paid_minor:0}),/no longer available/);
 }finally{await db.close();}
});

test('V2 locksmith acceptance is atomic, owner-bound, replayable and restricted to a single winner',async()=>{
 const db=await setup();try{
  const code='serrurerie.porte_claquee_blindee.ouverture',s=pilot.services[code],m=await mission(db,code,'booked'),other='10000000-0000-4000-8000-000000000002';
  await db.exec('RESET ROLE');
  const aid=(await db.query('SELECT id FROM artisans WHERE owner_user_id=$1',[actor])).rows[0].id;
  const bid=(await db.query("INSERT INTO artisans(owner_user_id,city,service_category,availability) VALUES($1,'Rabat','Serrurerie','available') RETURNING id",[other])).rows[0].id;
  await db.query("INSERT INTO dispatch_execution_queue VALUES($1,$2,'QUEUED',now()),($1,$3,'CONTACTED',now())",[m.request_id,aid,bid]);
  await asArtisan(db);
  await assert.rejects(db.query('SELECT accept_my_dispatch_offer_v1($1)',[m.request_id]),/before acceptance/);
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT status FROM service_requests WHERE id=$1',[m.request_id])).rows[0].status,'new');
  assert.equal((await db.query('SELECT count(*) AS n FROM missions WHERE request_id=$1',[m.request_id])).rows[0].n,0);
  await assert.rejects(db.query("INSERT INTO missions(request_id,artisan_profile_id,status) VALUES($1,$2,'pending')",[m.request_id,aid]),/before acceptance/);
  await asArtisan(db,'10000000-0000-4000-8000-000000000003');
  await assert.rejects(db.query('SELECT serrurerie_offer_artisan_v1($1,$2)',[m.request_id,JSON.stringify(s.offer_checks)]),/Opportunity/);
  await asArtisan(db);
  await assert.rejects(db.query('SELECT serrurerie_offer_artisan_v1($1,$2)',[m.request_id,'{}']),/before acceptance/);
  const q='SELECT serrurerie_offer_artisan_v1($1,$2) AS r',args=[m.request_id,JSON.stringify(s.offer_checks)];
  const checked=(await db.query(q,args)).rows[0].r;assert.equal(checked.confirmed,true);assert.equal(checked.materials_minor,0);assert.equal(checked.commission_minor,6000);assert.deepEqual((await db.query(q,args)).rows[0].r,checked);
  await assert.rejects(db.query(q,[m.request_id,JSON.stringify({...s.offer_checks,fixed_price_scope_and_availability_confirmed:false})]),/Idempotency/);
  await asArtisan(db,other);await db.query(q,args);
  await asArtisan(db);
  const winner=(await db.query('SELECT accept_my_dispatch_offer_v1($1) AS r',[m.request_id])).rows[0].r;assert.equal(winner.ok,true);
  const replay=(await db.query('SELECT accept_my_dispatch_offer_v1($1) AS r',[m.request_id])).rows[0].r;assert.equal(replay.mission_id,winner.mission_id);
  await asArtisan(db,other);assert.equal((await db.query('SELECT accept_my_dispatch_offer_v1($1) AS r',[m.request_id])).rows[0].r.ok,false);
  await db.exec('RESET ROLE');
  const saved=(await db.query('SELECT * FROM missions WHERE request_id=$1',[m.request_id])).rows;assert.equal(saved.length,1);assert.equal(saved[0].artisan_profile_id,aid);assert.equal(Number(saved[0].agreed_price),360);assert.equal(Number(saved[0].commission_amount),60);
  await assert.rejects(db.query('DELETE FROM fixeo_private.serrurerie_offer_checks_v1 WHERE request_id=$1',[m.request_id]),/immutable/);
 }finally{await db.close();}
});
