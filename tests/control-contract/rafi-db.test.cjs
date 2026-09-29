'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {baseline,migrate,actor,uuid}=require('./fixture.cjs');
let db,beforeFunctions;
const sql=fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260929021750_control_os_b2_rafi_reads.sql'),'utf8');
const rpc=async(source,classification='all')=>(await db.query('select public.control_rafi_source_v1($1,$2) result',[source,classification])).rows[0].result;
before(async()=>{
 db=await baseline();await migrate(db);
 beforeFunctions=(await db.query("select p.oid,md5(pg_get_functiondef(p.oid)) hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','fixeo_private') and p.prokind='f' order by p.oid")).rows;
 await db.exec(sql);
 await db.exec(`INSERT INTO auth.users(id) VALUES('${uuid(1)}'),('${uuid(2)}'),('${uuid(3)}');
 INSERT INTO public.users(id,role,full_name) VALUES('${uuid(1)}','client','Synthetic Client'),('${uuid(2)}','artisan','Synthetic Artisan'),('${uuid(3)}','admin','Synthetic Operator');
 INSERT INTO public.profiles(id,role) SELECT id,role FROM public.users;`);
});
after(async()=>db?.close());
async function denied(fn,pattern){await db.exec('SAVEPOINT denied');let error;try{await fn();}catch(e){error=e;}await db.exec('ROLLBACK TO SAVEPOINT denied; RELEASE SAVEPOINT denied');assert.ok(error);assert.match(error.message,pattern);}
function tx(name,fn){test(name,async()=>{await db.exec('RESET ROLE; BEGIN');try{await fn();}finally{await db.exec('ROLLBACK; RESET ROLE');}});}
tx('RAFI SQL five empty sources are exact and read only',async()=>{await actor(db,3);for(const source of ['operations','network','trust','finance','enterprise']){const r=await rpc(source);assert.equal(r.total_observations,0,source);assert.deepEqual(r.observations,[]);assert.equal(r.has_more,false);}});
tx('RAFI SQL anon, non-admin and service_role cannot bypass Admin',async()=>{for(const [user,role] of [[1,'anon'],[1,'authenticated'],[2,'authenticated'],[3,'service_role']]){await actor(db,user,role);await denied(()=>rpc('network'),/permission denied|FORBIDDEN/);await denied(()=>db.query('select public.control_rafi_dispatch_read_v1($1)',[uuid(100)]),/permission denied|FORBIDDEN/);}});
tx('RAFI SQL unknown input refuses instead of broadening scope',async()=>{await actor(db,3);await denied(()=>rpc('secret'),/INVALID_SOURCE/);await denied(()=>rpc('network','private'),/INVALID_CLASSIFICATION/);await denied(()=>rpc('network',null),/INVALID_CLASSIFICATION/);});
tx('RAFI migration leaves every Bloc 1 function and authority unchanged',async()=>{for(const f of beforeFunctions){const row=(await db.query('select md5(pg_get_functiondef($1::oid)) hash',[f.oid])).rows[0];assert.equal(row.hash,f.hash);}const funcs=(await db.query("select p.proname,p.prosecdef,p.provolatile,p.proconfig,pg_get_userbyid(p.proowner) owner,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') authenticated,has_function_privilege('service_role',p.oid,'execute') service_role from pg_proc p where proname like 'control_rafi_%' order by proname")).rows;assert.equal(funcs.length,3);for(const f of funcs){assert.equal(f.prosecdef,true);assert.equal(f.provolatile,'s');assert.ok(f.proconfig.includes('search_path=""'));assert.equal(f.owner,'postgres');assert.equal(f.anon,false);assert.equal(f.service_role,false);assert.equal(f.authenticated,true);}});
async function seed(){
 await db.exec("SELECT set_config('request.jwt.claims','{\"sub\":\""+uuid(3)+"\",\"role\":\"authenticated\"}',false);");
 // Isolated fixtures only; avoid producing offers while constructing the source scenario.
 await db.exec(`ALTER TABLE public.service_requests DISABLE TRIGGER USER;
 INSERT INTO public.service_requests(id,client_profile_id,city,service_category,description,status,urgency,created_at,data_classification) VALUES
 ('${uuid(100)}','${uuid(1)}','Fès','plomberie','Synthetic RAFI request','new','urgent',now()-interval '3 hours','test'),
 ('${uuid(101)}','${uuid(1)}','Fès','plomberie','Synthetic RAFI request','new','normale',now()-interval '1 day','test');
 ALTER TABLE public.service_requests ENABLE TRIGGER USER;
 INSERT INTO public.artisans(id,owner_user_id,full_name,phone,city,service_category,claimed,claim_status,onboarding_completed,availability,verified,is_verified,data_classification) VALUES
 ('${uuid(20)}','${uuid(2)}','Synthetic Multi','+000000000001','Rabat','electricite',true,'approved',true,'available',false,false,'test'),
 ('${uuid(21)}',NULL,'Synthetic Unclaimed','+000000000002','Fès','plomberie',false,'unclaimed',false,'unavailable',false,false,'test');
 INSERT INTO public.artisan_service_categories(artisan_id,service_category) VALUES('${uuid(20)}','plomberie');
 INSERT INTO public.artisan_service_cities(artisan_id,city) VALUES('${uuid(20)}','Fès');`);
}
tx('RAFI network correlates real demand, multitrade/city supply and activation without PII',async()=>{await seed();await actor(db,3);const n=await rpc('network','test');assert.equal(n.total_observations,1);const o=n.observations[0];assert.equal(o.count,2);assert.equal(o.facts.profiles,2);assert.equal(o.facts.available_profiles,1);assert.equal(o.facts.to_verify,1);assert.equal(o.facts.unclaimed,1);assert.deepEqual(o.facts.verify_ids,[uuid(20)]);assert.deepEqual(o.facts.claim_ids,[uuid(21)]);assert.ok(!JSON.stringify(n).includes('+000'));assert.equal((await rpc('network','production')).total_observations,0);});
tx('RAFI requests use canonical winners and dates',async()=>{await seed();await actor(db,3);const o=await rpc('operations','test');assert.equal(o.observations.filter(x=>x.kind==='request.waiting').length,2);assert.equal(o.observations[0].facts.urgency,'urgent');});
tx('RAFI canonical Dispatch reader exposes ranked candidates without phone or arbitrary execution',async()=>{await seed();await actor(db,3);const r=(await db.query('select public.control_rafi_dispatch_read_v1($1) result',[uuid(100)])).rows[0].result;assert.equal(r.execution_authorized,false);assert.equal(r.source,'dispatch_preview_v22');assert.ok(!JSON.stringify(r).includes('+000'));assert.ok(Array.isArray(r.candidates));});
tx('RAFI Enterprise source respects tenant guard and cross-tenant sites',async()=>{await seed();await db.exec(`INSERT INTO public.enterprise_accounts(id,name) VALUES('${uuid(30)}','Synthetic A'),('${uuid(31)}','Synthetic B');
 INSERT INTO public.enterprise_sites(id,enterprise_id,name,city) VALUES('${uuid(40)}','${uuid(30)}','Synthetic A site','Fès'),('${uuid(41)}','${uuid(31)}','Synthetic B site','Fès');
 INSERT INTO public.enterprise_request_context(enterprise_id,site_id,service_request_id,created_by) VALUES('${uuid(30)}','${uuid(40)}','${uuid(100)}','${uuid(1)}');`);
 await actor(db,3);const e=await rpc('enterprise','test');assert.equal(e.observations.length,1);assert.equal(e.observations[0].site_id,uuid(40));assert.equal(e.observations[0].facts.sla.acceptance_status,'not_configured');await denied(()=>db.query('select public.control_rafi_dispatch_read_v1($1)',[uuid(100)]),/ENTERPRISE_DELEGATION_REQUIRED/);
 await actor(db,1);await denied(()=>rpc('enterprise','test'),/FORBIDDEN/);await denied(()=>db.query('select public.enterprise_request_sla_facts_v1($1)',[uuid(100)]),/FORBIDDEN/);
});
