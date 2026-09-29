'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Client}=require('pg');const {baseline,uuid}=require('./fixture.cjs');
const url=process.env.CONTROL_TEST_DATABASE_URL;
if(!url){test('Native PostgreSQL concurrency suite runs in isolated CI service',{skip:'CONTROL_TEST_DATABASE_URL absent; never use a remote or Production database'},()=>{});}
else {
 const parsed=new URL(url);if(!['localhost','127.0.0.1'].includes(parsed.hostname)||parsed.pathname!=='/control_contract')throw Error('ISOLATED_LOCAL_DATABASE_REQUIRED');
 let admin;const clients=[];
 const conn=async(actor)=>{const c=new Client({connectionString:url});await c.connect();clients.push(c);await c.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uuid(actor),role:'authenticated'})]);await c.query('SET ROLE authenticated');return c;};
 const rpc=async(c,name,args)=>{const r=await c.query(`select to_jsonb(public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})) result`,args);return r.rows[0].result;};
 before(async()=>{
  admin=new Client({connectionString:url});await admin.connect();let schema;await baseline({db:{exec:s=>{schema=s;}}});await admin.query(schema);
  await admin.query(`INSERT INTO auth.users(id) VALUES('${uuid(1)}'),('${uuid(2)}'),('${uuid(3)}'),('${uuid(4)}'); INSERT INTO public.users(id,role) VALUES('${uuid(1)}','client'),('${uuid(2)}','artisan'),('${uuid(3)}','admin'),('${uuid(4)}','client'); INSERT INTO public.profiles(id,role) SELECT id,role FROM public.users; INSERT INTO public.artisans(id,owner_user_id,full_name,phone,city,service_category,claimed,claim_status,onboarding_completed,availability) VALUES('${uuid(20)}','${uuid(2)}','Synthetic Artisan','+000000000001','Fès','plomberie',true,'approved',true,'available');`);
  for(const p of fs.readdirSync(path.join(__dirname,'../../supabase/migrations')).filter(x=>x.includes('_control_os_b1_')||x.includes('_control_os_b2_')).sort())await admin.query(fs.readFileSync(path.join(__dirname,'../../supabase/migrations',p),'utf8'));
  await admin.query(require('./bloc34-fixture.cjs').sql);
  await admin.query(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260929142337_control_os_b34_settlement_integrity_guard.sql'),'utf8'));
  await admin.query(require('./bloc5-fixture.cjs').sql);
  await admin.query(require('./bloc5-fixture.cjs').guard);
  await admin.query(require('./bloc6-fixture.cjs').sql);
  await admin.query(require('./bloc7-fixture.cjs').sql);
 });
 after(async()=>{await Promise.all(clients.map(c=>c.end()));await admin?.end();});
 const request=async(n,status='new')=>admin.query('INSERT INTO public.service_requests(id,client_profile_id,city,service_category,description,status) VALUES($1,$2,$3,$4,$5,$6)',[uuid(n),uuid(1),'Fès','plomberie','Synthetic concurrency',status]);
 let seq=5000;
 const preview=async(c,cap,id,payload)=>rpc(c,'control_action_preview_v1',[cap,id,{reason:'Synthetic concurrency',...payload},uuid(++seq)]);
 const execute=async(c,p,key=uuid(++seq))=>rpc(c,'control_action_execute_v1',[p.preview_id,true,key]);
 test('Two concurrent retries produce one execution audit and the same result',async()=>{
  const [a,b]=await Promise.all([conn(3),conn(3)]);const p=await preview(a,'artisan.verify',uuid(20),{});const results=await Promise.all([execute(a,p,uuid(5100)),execute(b,p,uuid(5100))]);assert.ok(results.every(x=>x.ok));assert.deepEqual(results[0],results[1]);
  const n=await admin.query("select count(*) n from fixeo_private.authority_audit_events_v1 where action='execute' and idempotency_key=$1",[uuid(5100)]);assert.equal(Number(n.rows[0].n),1);
 });
 test('Two competing settlements serialize; stale preview cannot overwrite the winner',async()=>{
  await request(600,'completed');await admin.query("insert into public.missions(id,request_id,artisan_profile_id,status,agreed_price,accepted_at) values($1,$2,$3,'done',1000,now())",[uuid(601),uuid(600),uuid(20)]);
  const [a,b]=await Promise.all([conn(3),conn(3)]);const [pa,pb]=await Promise.all([preview(a,'mission.settle',uuid(601),{final_price:1000,expected_final_price:null}),preview(b,'mission.settle',uuid(601),{final_price:900,expected_final_price:null})]);
  const r=await Promise.all([execute(a,pa),execute(b,pb)]);assert.equal(r.filter(x=>x.ok).length,1);assert.equal(r.find(x=>!x.ok).code,'STALE_PREVIEW');
 });
 test('Concurrent client acceptance creates one pending mission and returns it idempotently',async()=>{
  await request(610);const artisan=await conn(2),op=await conn(3);const q=await rpc(artisan,'submit_artisan_quote_v2',[uuid(610),1000,'Synthetic repair',null,null,null]);assert.equal((await execute(op,await preview(op,'quote.approve',q.id,{version:1}))).ok,true);
  const [a,b]=await Promise.all([conn(1),conn(1)]);const r=await Promise.all([rpc(a,'accept_quote_v2',[q.id]),rpc(b,'accept_quote_v2',[q.id])]);assert.equal(r[0].id,r[1].id);assert.equal(r[0].status,'pending');
  const n=await admin.query('select count(*) n from public.missions where request_id=$1',[uuid(610)]);assert.equal(Number(n.rows[0].n),1);
 });
 test('Concurrent internal assignment and external acceptance have one canonical winner',async()=>{
  await request(620);await admin.query(`INSERT INTO public.enterprise_accounts(id,name,status) VALUES('${uuid(621)}','Synthetic Tenant','active'); INSERT INTO public.enterprise_sites(id,enterprise_id,name,city,status) VALUES('${uuid(622)}','${uuid(621)}','Synthetic Site','Fès','active'); INSERT INTO public.enterprise_members(id,enterprise_id,user_id,role,status) VALUES('${uuid(623)}','${uuid(621)}','${uuid(4)}','owner','active'),('${uuid(624)}','${uuid(621)}','${uuid(2)}','viewer','active'); INSERT INTO public.enterprise_workforce_workers(id,enterprise_id,member_id,display_label,all_sites,created_by) VALUES('${uuid(625)}','${uuid(621)}','${uuid(624)}','Synthetic Worker',true,'${uuid(4)}'); INSERT INTO public.enterprise_request_context(enterprise_id,site_id,service_request_id,created_by) VALUES('${uuid(621)}','${uuid(622)}','${uuid(620)}','${uuid(4)}'); INSERT INTO public.missions(id,request_id,artisan_profile_id,status) VALUES('${uuid(626)}','${uuid(620)}','${uuid(20)}','offered');`);
  const [a,b]=await Promise.all([conn(2),conn(4)]);const r=await Promise.all([rpc(a,'claim_mission',[uuid(626)]),rpc(b,'assign_enterprise_internal_worker_v1',[uuid(621),uuid(620),uuid(625)])]);assert.equal(r.filter(x=>x.ok).length,1,JSON.stringify(r));
  const n=await admin.query("select (select count(*) from public.missions where request_id=$1 and status='pending')+(select count(*) from public.enterprise_internal_assignments where service_request_id=$1::uuid and status='assigned') n",[uuid(620)]);assert.equal(Number(n.rows[0].n),1);
 });
 test('Concurrent Claims through Control retain one owner and supersede the other claim',async()=>{
  await admin.query(`INSERT INTO public.artisans(id,full_name,city,service_category,claimed,claim_status) VALUES('${uuid(700)}','Synthetic unclaimed','Fès','plomberie',false,'pending'); INSERT INTO public.claim_requests(id,artisan_id,requester_user_id,status) VALUES('${uuid(701)}','${uuid(700)}','${uuid(1)}','pending'),('${uuid(702)}','${uuid(700)}','${uuid(4)}','pending');`);
  const [a,b]=await Promise.all([conn(3),conn(3)]);const [pa,pb]=await Promise.all([preview(a,'claim.approve',uuid(701),{}),preview(b,'claim.approve',uuid(702),{})]);
  const results=await Promise.all([execute(a,pa),execute(b,pb)]);assert.equal(results.filter(x=>x.ok).length,1);
  const rows=(await admin.query('select status from public.claim_requests where artisan_id=$1',[uuid(700)])).rows;assert.deepEqual(rows.map(x=>x.status).sort(),['approved','superseded_by_approval']);
 });
 test('Concurrent remittance confirmations cannot overpay the canonical commission',async()=>{
  const a=await conn(3),b=await conn(3);const p1=await preview(a,'finance.declare',uuid(601),{amount:100,method:'cash',proof_reference:'SYNTHETIC-A'}),p2=await preview(b,'finance.declare',uuid(601),{amount:100,method:'cash',proof_reference:'SYNTHETIC-B'});
  const d1=await execute(a,p1),d2=await execute(b,p2);assert.ok(d1.ok&&d2.ok);
  const [c1,c2]=await Promise.all([preview(a,'finance.confirm',uuid(601),{remittance_id:d1.result.id,version:1}),preview(b,'finance.confirm',uuid(601),{remittance_id:d2.result.id,version:1})]);
  const r=await Promise.all([execute(a,c1),execute(b,c2)]);assert.equal(r.filter(x=>x.ok).length,1);const sums=await admin.query("select sum(amount) paid from public.commission_remittances_v1 where mission_id=$1 and status='confirmed'",[uuid(601)]);assert.equal(Number(sums.rows[0].paid),100);
 });
 // P0: native row-lock evidence, without timing assumptions or remote data.
 const raw=async()=>{const c=new Client({connectionString:url});await c.connect();clients.push(c);return c;};
 async function blocked(pid,blocker){for(let i=0;i<200;i++){const r=await admin.query('select $2::int=any(pg_blocking_pids($1::int)) blocked',[pid,blocker]);if(r.rows[0].blocked)return;await new Promise(resolve=>setTimeout(resolve,20));}assert.fail('Expected canonical parent row lock was not observed');}
 async function doneMission(base){await request(base,'completed');await admin.query("insert into public.missions(id,request_id,artisan_profile_id,status,completed_at) values($1,$2,$3,'done',now())",[uuid(base+1),uuid(base),uuid(20)]);}
 test('P0 concurrent invalid previews are both refused without creating a preview or financial mutation',async()=>{
  await doneMission(1200);await admin.query('delete from public.service_requests where id=$1',[uuid(1200)]);
  const [a,b]=await Promise.all([conn(3),conn(3)]),r=await Promise.allSettled([preview(a,'mission.settle',uuid(1201),{final_price:100,expected_final_price:null}),preview(b,'mission.settle',uuid(1201),{final_price:100,expected_final_price:null})]);
  for(const x of r){assert.equal(x.status,'rejected');assert.match(x.reason.message,/REQUEST_NOT_FOUND/);}
  assert.equal(Number((await admin.query('select count(*) n from fixeo_private.control_action_previews_v1 where target_id=$1',[uuid(1201)])).rows[0].n),0);
  assert.equal((await admin.query('select final_price from public.missions where id=$1',[uuid(1201)])).rows[0].final_price,null);
 });
 test('P0 deletion winning the row lock makes settlement wait then refuse without any partial business write',async()=>{
  await doneMission(1210);const a=await conn(3),remover=await raw(),p=await preview(a,'mission.settle',uuid(1211),{final_price:100,expected_final_price:null});
  const before=(await admin.query('select to_jsonb(m) row from public.missions m where id=$1',[uuid(1211)])).rows[0].row;
  await remover.query('BEGIN');try{
   await remover.query('delete from public.service_requests where id=$1',[uuid(1210)]);
   const pending=execute(a,p).then(value=>({value}),error=>({error}));await blocked(a.processID,remover.processID);await remover.query('COMMIT');
   const {value,error}=await pending;assert.ifError(error);assert.equal(value.ok,false);assert.equal(value.code,'REQUEST_NOT_FOUND');
   assert.deepEqual((await admin.query('select to_jsonb(m) row from public.missions m where id=$1',[uuid(1211)])).rows[0].row,before);
  }finally{await remover.query('ROLLBACK');}
 });
 test('P0 settlement holds a parent key-share lock until commit; a concurrent deletion cannot pass it',async()=>{
  await doneMission(1220);const a=await conn(3),remover=await raw(),p=await preview(a,'mission.settle',uuid(1221),{final_price:100,expected_final_price:null});
  await a.query('BEGIN');await remover.query('BEGIN');try{
   const result=await execute(a,p);assert.equal(result.ok,true);assert.equal(result.verified.request_status,'completed');
   const pending=remover.query('delete from public.service_requests where id=$1',[uuid(1220)]).then(value=>({value}),error=>({error}));
   await blocked(remover.processID,a.processID);await a.query('COMMIT');const {error}=await pending;assert.ifError(error);await remover.query('ROLLBACK');
   assert.equal((await admin.query('select count(*)::int n from public.service_requests where id=$1',[uuid(1220)])).rows[0].n,1);
   assert.equal(Number((await admin.query('select final_price from public.missions where id=$1',[uuid(1221)])).rows[0].final_price),100);
  }finally{await a.query('ROLLBACK');await remover.query('ROLLBACK');}
 });
 // Blocs 3 + 4: exercise new orchestration through the unchanged domain RPCs.
 async function hybridSeed(base,extraRequest=false){
  await request(base);if(extraRequest)await request(base+1);
  await admin.query(`INSERT INTO public.enterprise_accounts(id,name,status) VALUES('${uuid(base+10)}','Synthetic B34 tenant','active');
  INSERT INTO public.enterprise_sites(id,enterprise_id,name,city,status) VALUES('${uuid(base+11)}','${uuid(base+10)}','Synthetic B34 site','Fès','active');
  INSERT INTO public.enterprise_members(id,enterprise_id,user_id,role,status) VALUES('${uuid(base+12)}','${uuid(base+10)}','${uuid(3)}','operations_manager','active'),('${uuid(base+13)}','${uuid(base+10)}','${uuid(2)}','viewer','active');
  INSERT INTO public.enterprise_workforce_workers(id,enterprise_id,member_id,display_label,all_sites,created_by) VALUES('${uuid(base+14)}','${uuid(base+10)}','${uuid(base+13)}','Synthetic B34 worker',true,'${uuid(3)}');
  INSERT INTO public.enterprise_workforce_skills(enterprise_id,worker_id,service_category,skill_level,active) VALUES('${uuid(base+10)}','${uuid(base+14)}','plomberie',3,true);
  INSERT INTO public.enterprise_dispatch_policies(id,enterprise_id,mode,status,created_by) VALUES('${uuid(base+15)}','${uuid(base+10)}','internal_only','active','${uuid(3)}');
  INSERT INTO public.enterprise_request_context(enterprise_id,site_id,service_request_id,created_by) VALUES('${uuid(base+10)}','${uuid(base+11)}','${uuid(base)}','${uuid(3)}');`);
  if(extraRequest)await admin.query('insert into public.enterprise_request_context(enterprise_id,site_id,service_request_id,created_by) values($1,$2,$3,$4)',[uuid(base+10),uuid(base+11),uuid(base+1),uuid(3)]);
 }
 const hp=(c,base,requestId=base)=>rpc(c,'control_hybrid_preview_v1',['enterprise.assign',uuid(requestId),{worker_id:uuid(base+14),reason:'Synthetic B34 race'},uuid(++seq)]);
 const he=(c,p,key=uuid(++seq))=>rpc(c,'control_hybrid_execute_v1',[p.preview_id,true,key]);
 test('B34 two concurrent clicks share one canonical assignment and execution audit',async()=>{
  await hybridSeed(800);const [a,b]=await Promise.all([conn(3),conn(3)]),p=await hp(a,800),key=uuid(++seq);
  const r=await Promise.all([he(a,p,key),he(b,p,key)]);assert.ok(r.every(x=>x.ok),JSON.stringify(r));assert.deepEqual(r[0],r[1]);
  assert.equal(Number((await admin.query('select count(*) n from public.enterprise_internal_assignments where service_request_id=$1',[uuid(800)])).rows[0].n),1);
  assert.equal(Number((await admin.query("select count(*) n from fixeo_private.authority_audit_events_v1 where action='enterprise.assign' and idempotency_key=$1",[key])).rows[0].n),1);
 });
 test('B34 two requests competing for one worker cannot overbook through Control',async()=>{
  await hybridSeed(900,true);const [a,b]=await Promise.all([conn(3),conn(3)]),pa=await hp(a,900),pb=await hp(b,900,901);
  const r=await Promise.all([he(a,pa),he(b,pb)]);assert.equal(r.filter(x=>x.ok).length,1,JSON.stringify(r));assert.equal(r.find(x=>!x.ok).code,'STALE_PREVIEW');
  assert.equal(Number((await admin.query("select count(*) n from public.enterprise_internal_assignments where worker_id=$1 and status='assigned'",[uuid(914)])).rows[0].n),1);
 });
 test('B34 governed internal assignment versus canonical external acceptance has one winner',async()=>{
  await hybridSeed(1000);await admin.query("insert into public.missions(id,request_id,artisan_profile_id,status) values($1,$2,$3,'offered')",[uuid(1020),uuid(1000),uuid(20)]);
  const [a,b]=await Promise.all([conn(3),conn(2)]),p=await hp(a,1000);const r=await Promise.all([he(a,p),rpc(b,'claim_mission',[uuid(1020)])]);
  assert.equal(r.filter(x=>x.ok).length,1,JSON.stringify(r));
  const n=(await admin.query("select (select count(*) from public.missions where request_id=$1 and status='pending')+(select count(*) from public.enterprise_internal_assignments where service_request_id=$1::uuid and status='assigned') n",[uuid(1000)])).rows[0].n;assert.equal(Number(n),1);
 });

 test('B5 Finance locks the canonical parent against deletion and state changes until commit',async()=>{
  await doneMission(1300);const a=await conn(3),editor=await raw();assert.equal((await execute(a,await preview(a,'mission.settle',uuid(1301),{final_price:1000,expected_final_price:null}))).ok,true);
  for(const operation of ['delete','update']){
   const p=await preview(a,'finance.declare',uuid(1301),{amount:10,method:'cash',proof_reference:'SYNTHETIC-B5-'+operation});await a.query('BEGIN');await editor.query('BEGIN');
   try{assert.equal((await execute(a,p)).ok,true);const sql=operation==='delete'?'delete from public.service_requests where id=$1':"update public.service_requests set status='cancelled' where id=$1";
    const pending=editor.query(sql,[uuid(1300)]).then(value=>({value}),error=>({error}));await blocked(editor.processID,a.processID);await a.query('COMMIT');const {error}=await pending;assert.ifError(error);await editor.query('ROLLBACK');
   }finally{await a.query('ROLLBACK');await editor.query('ROLLBACK');}
  }
  assert.equal((await admin.query('select status from public.service_requests where id=$1',[uuid(1300)])).rows[0].status,'completed');
 });
 test('B5 Finance rechecks a concurrently deleted parent after waiting; no partial ledger write',async()=>{
  await doneMission(1310);const a=await conn(3),remover=await raw();assert.equal((await execute(a,await preview(a,'mission.settle',uuid(1311),{final_price:1000,expected_final_price:null}))).ok,true);
  const p=await preview(a,'finance.declare',uuid(1311),{amount:10,method:'cash',proof_reference:'SYNTHETIC-B5-DELETED'});await remover.query('BEGIN');
  try{await remover.query('delete from public.service_requests where id=$1',[uuid(1310)]);const pending=execute(a,p);await blocked(a.processID,remover.processID);await remover.query('COMMIT');const r=await pending;assert.equal(r.ok,false);assert.equal(r.code,'REQUEST_NOT_FOUND');assert.equal(Number((await admin.query('select count(*) n from public.commission_remittances_v1 where mission_id=$1',[uuid(1311)])).rows[0].n),0);
  }finally{await remover.query('ROLLBACK');}
 });
 test('B5 concurrent retries of one financial declaration share one ledger row and one result',async()=>{
  const [a,b]=await Promise.all([conn(3),conn(3)]),p=await preview(a,'finance.declare',uuid(1301),{amount:10,method:'cash',proof_reference:'SYNTHETIC-B5-RETRY'}),key=uuid(++seq);
  const r=await Promise.all([execute(a,p,key),execute(b,p,key)]);assert.ok(r.every(x=>x.ok));assert.deepEqual(r[0],r[1]);assert.equal(Number((await admin.query('select count(*) n from public.commission_remittances_v1 where id=$1',[r[0].result.id])).rows[0].n),1);
 });

 test('B6 read snapshots remain coherent through concurrent parent removal; missions and authorities stay unchanged',async()=>{
  await request(1400);await admin.query("update public.service_requests set city='Synthetic Cube Concurrency' where id=$1",[uuid(1400)]);
  await admin.query("insert into public.missions(id,request_id,artisan_profile_id,status) values($1,$2,$3,'offered')",[uuid(1401),uuid(1400),uuid(20)]);
  const a=await conn(3),b=await conn(3),writer=await raw(),filters={city:'Synthetic Cube Concurrency'};
  const mission=(await admin.query('select to_jsonb(m) j from public.missions m where id=$1',[uuid(1401)])).rows[0].j;
  await a.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try{
   const first=await rpc(a,'control_marketplace_cube_v1',['operations',filters,null,25]);assert.equal(first.items[0].facts.waiting,1);
   await writer.query('delete from public.service_requests where id=$1',[uuid(1400)]);
   const repeated=await rpc(a,'control_marketplace_cube_v1',['operations',filters,null,25]);assert.deepEqual(repeated,first);
   const fresh=await rpc(b,'control_marketplace_cube_v1',['operations',filters,null,25]);assert.equal(fresh.total_cells,0);
   const finance=await rpc(b,'control_finance_context_v1',['mission',uuid(1401),null,25]);assert.equal(finance.facts.request_relation,'NOT_FOUND');assert.equal(finance.facts.due_balance,null);
   assert.deepEqual((await admin.query('select to_jsonb(m) j from public.missions m where id=$1',[uuid(1401)])).rows[0].j,mission);
  }finally{await a.query('ROLLBACK');}
 });

 async function rafiClaim(n){await admin.query('insert into public.claim_requests(id,artisan_id,requester_user_id,status) values($1,$2,$3,$4)',[uuid(n),uuid(20),uuid(1),'pending']);const a=await conn(3);const p=(await rpc(a,'control_rafi_source_v3',['trust','all'])).observations.find(o=>o.target_id===uuid(n)).proof;return {a,p};}
 test('B7 simultaneous RAFI confirmations share one canonical result and one execution audit',async()=>{
  const {a,p}=await rafiClaim(1500),b=await conn(3),proposal=await rpc(a,'control_rafi_proposal_v3',[p,'claim.pending','claim.reject',uuid(1500),{reason:'Synthetic concurrent review'},uuid(1501)]),key=uuid(1502);
  const r=await Promise.all([a,b].map(c=>rpc(c,'control_rafi_execute_v3',[proposal.preview_id,true,key])));assert.ok(r.every(x=>x.ok),JSON.stringify(r));assert.deepEqual(r[0],r[1]);assert.equal(Number((await admin.query("select count(*) n from fixeo_private.authority_audit_events_v1 where action='execute' and idempotency_key=$1",[key])).rows[0].n),1);
 });
 test('B7 a source change winning the target lock is refused even through the old Control endpoint',async()=>{
  const {a,p}=await rafiClaim(1510),writer=await raw(),proposal=await rpc(a,'control_rafi_proposal_v3',[p,'claim.pending','claim.reject',uuid(1510),{reason:'Synthetic concurrent review'},uuid(1511)]);
  await writer.query('BEGIN');try{await writer.query("update public.claim_requests set status='approved' where id=$1",[uuid(1510)]);const pending=execute(a,proposal,uuid(1512));await blocked(a.processID,writer.processID);await writer.query('COMMIT');const r=await pending;assert.equal(r.ok,false);assert.equal(r.code,'EVIDENCE_NOT_OBSERVED');assert.equal((await admin.query('select status from public.claim_requests where id=$1',[uuid(1510)])).rows[0].status,'approved');}finally{await writer.query('ROLLBACK');}
 });
 test('B7 concurrent followup creation deduplicates operator intent; competing versions cannot overwrite',async()=>{
  const {a,p}=await rafiClaim(1520),b=await conn(3),due=new Date(Date.now()+3600000).toISOString();const create=c=>rpc(c,'control_rafi_followup_v3',['create',null,null,p,'claim.pending',due,null,uuid(1521)]);
  const made=await Promise.all([create(a),create(b)]);assert.deepEqual(made[0],made[1]);const f=made[0].followup;
  const result=await Promise.allSettled([rpc(a,'control_rafi_followup_v3',['acknowledge',f.id,1,null,null,null,null,uuid(1522)]),rpc(b,'control_rafi_followup_v3',['reschedule',f.id,1,null,null,due,null,uuid(1523)])]);assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.match(result.find(x=>x.status==='rejected').reason.message,/STALE_FOLLOWUP/);assert.equal(Number((await admin.query('select count(*) n from fixeo_private.rafi_followups_v3 where observation_ref=$1',[p.ref])).rows[0].n),1);
 });

 test('B7 expiration while waiting for canonical lock uses wall-clock time before any business effect',async()=>{
  const {a,p}=await rafiClaim(1530),writer=await raw(),proposal=await rpc(a,'control_rafi_proposal_v3',[p,'claim.pending','claim.reject',uuid(1530),{reason:'Synthetic expiration under lock'},uuid(1531)]);
  await writer.query('BEGIN');try{await writer.query('select id from public.claim_requests where id=$1 for update',[uuid(1530)]);await admin.query("update fixeo_private.rafi_proposals_v3 set expires_at=clock_timestamp()+interval '100 milliseconds' where preview_id=$1",[proposal.preview_id]);const pending=execute(a,proposal,uuid(1532));await blocked(a.processID,writer.processID);await writer.query('select pg_sleep(0.15)');await writer.query('COMMIT');const r=await pending;assert.equal(r.ok,false);assert.equal(r.code,'STALE_EVIDENCE');assert.equal((await admin.query('select status from public.claim_requests where id=$1',[uuid(1530)])).rows[0].status,'pending');}finally{await writer.query('ROLLBACK');}
 });

}
