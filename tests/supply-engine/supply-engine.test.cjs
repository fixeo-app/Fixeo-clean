'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const ROOT=path.resolve(__dirname,'../..');
const migrations=[
  'supabase/migrations/20260930162500_supply_b1_lifecycle.sql',
  'supabase/migrations/20260930163000_supply_b2_intelligence.sql',
  'supabase/migrations/20260930163500_supply_b3_crm_queue.sql',
  'supabase/migrations/20260930164000_supply_b4_activation.sql',
  'supabase/migrations/20260930164500_supply_b5_agents_cost.sql',
  'supabase/migrations/20260930165000_supply_b6_channels.sql',
  'supabase/migrations/20260930165500_supply_b7_control_reads.sql',
  'supabase/migrations/20260930173000_supply_b8_b10_recruitment_agent_v1.sql',
  'supabase/migrations/20260930180000_supply_b11_b13_national_engine.sql',
  'supabase/migrations/20260930201500_supply_agents_rpc_bigint_fix.sql',
  'supabase/migrations/20260930204500_supply_b14_b17_learning_readiness.sql',
  'supabase/migrations/20260930211500_supply_external_discovery_dedup_v1.sql',
  'supabase/migrations/20260930213000_supply_external_secure_ingestion.sql'
].map(p=>fs.readFileSync(path.join(ROOT,p),'utf8'));

const adminHtml=fs.readFileSync(path.join(ROOT,'admin.html'),'utf8');
const adminSupply=fs.readFileSync(path.join(ROOT,'js/admin-supply-engine.js'),'utf8');
const adminControl=fs.readFileSync(path.join(ROOT,'js/admin-control-os-clean.js'),'utf8');
const api=require('../../api/supply-agent-fn/index.js');
const learningApi=require('../../api/supply-learning-fn/index.js');

function id(n){return '00000000-0000-4000-8000-'+String(n).padStart(12,'0');}
async function setActor(db,userId,role='authenticated'){
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[userId||'',role]);
}

async function withDb(t,fn){
  const url=process.env.SUPPLY_TEST_DATABASE_URL;
  if(!url){t.skip('SUPPLY_TEST_DATABASE_URL absent');return;}
  const {Client}=require('pg');
  const db=new Client({connectionString:url});
  await db.connect();
  try{await fn(db);}finally{await db.end();}
}

async function baseline(db){
  await db.query(String.raw`
    DROP TABLE IF EXISTS public.supply_external_candidates_v1 CASCADE;
    DROP TABLE IF EXISTS public.supply_external_batches_v1 CASCADE;
    DROP TABLE IF EXISTS public.supply_normalization_alias_v1 CASCADE;
    DROP TABLE IF EXISTS public.supply_national_cycles_v1 CASCADE;
    DROP TABLE IF EXISTS public.supply_national_cell_policy_v1 CASCADE;
    DROP TABLE IF EXISTS public.supply_national_runtime_v1 CASCADE;
    DROP VIEW IF EXISTS public.supply_coverage_v1 CASCADE;
    DROP VIEW IF EXISTS public.supply_artisan_projection_v1 CASCADE;
    DROP TABLE IF EXISTS public.supply_inbound_links_v1 CASCADE;
    DROP TABLE IF EXISTS public.supply_channel_outbox_v1 CASCADE;
    DROP TABLE IF EXISTS public.supply_agent_action_log_v1 CASCADE;
    DROP TABLE IF EXISTS public.supply_ai_usage_v1 CASCADE;
    DROP TABLE IF EXISTS public.supply_agent_runs_v1 CASCADE;
    DROP TABLE IF EXISTS public.supply_agents_v1 CASCADE;
    DROP TABLE IF EXISTS public.supply_runtime_config_v1 CASCADE;
    DROP TABLE IF EXISTS public.supply_work_queue_v1 CASCADE;
    DROP TABLE IF EXISTS public.supply_recruitment_attempts_v1 CASCADE;
    DROP TABLE IF EXISTS public.supply_campaigns_v1 CASCADE;
    DROP TABLE IF EXISTS public.supply_lifecycle_events_v1 CASCADE;
    DROP TABLE IF EXISTS public.supply_contact_preferences_v1 CASCADE;
    DROP TABLE IF EXISTS public.supply_artisan_state_v1 CASCADE;
    DROP SCHEMA IF EXISTS fixeo_private CASCADE;
    DROP SCHEMA IF EXISTS auth CASCADE;
    DROP SCHEMA IF EXISTS extensions CASCADE;
    DROP TABLE IF EXISTS public.whatsapp_inbound_messages CASCADE;
    DROP TABLE IF EXISTS public.missions CASCADE;
    DROP TABLE IF EXISTS public.service_requests CASCADE;
    DROP TABLE IF EXISTS public.claim_requests CASCADE;
    DROP TABLE IF EXISTS public.artisan_service_cities CASCADE;
    DROP TABLE IF EXISTS public.artisan_service_categories CASCADE;
    DROP TABLE IF EXISTS public.artisans CASCADE;
    DROP TABLE IF EXISTS public.users CASCADE;

    CREATE SCHEMA auth;
    CREATE SCHEMA fixeo_private;
    CREATE SCHEMA extensions;
    DO $role$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $role$;
    DO $role$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $role$;
    DO $role$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $role$;
    CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

    CREATE TABLE public.users(
      id uuid PRIMARY KEY,role text NOT NULL,full_name text DEFAULT '',email text,phone text
    );
    CREATE TABLE public.artisans(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      legacy_id text UNIQUE,
      full_name text NOT NULL DEFAULT '',
      name text,
      city text,
      service_category text NOT NULL DEFAULT '',
      source text DEFAULT 'admin',
      phone_public text,
      phone text,
      claimable boolean DEFAULT true,
      claimed boolean NOT NULL DEFAULT false,
      claim_status text NOT NULL DEFAULT 'unclaimed',
      owner_user_id uuid REFERENCES public.users(id),
      onboarding_completed boolean NOT NULL DEFAULT false,
      verified boolean NOT NULL DEFAULT false,
      is_verified boolean DEFAULT false,
      availability text NOT NULL DEFAULT 'available',
      is_public boolean NOT NULL DEFAULT true,
      data_classification text DEFAULT 'production',
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.artisan_service_categories(
      artisan_id uuid NOT NULL REFERENCES public.artisans(id) ON DELETE CASCADE,
      service_category text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.artisan_service_cities(
      artisan_id uuid NOT NULL REFERENCES public.artisans(id) ON DELETE CASCADE,
      city text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.claim_requests(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      artisan_id uuid REFERENCES public.artisans(id),
      artisan_legacy_id text,
      requester_user_id uuid REFERENCES public.users(id),
      status text NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.service_requests(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      city text NOT NULL,service_category text NOT NULL,status text NOT NULL DEFAULT 'new',
      created_at timestamptz DEFAULT now(),data_classification text DEFAULT 'production'
    );
    CREATE TABLE public.missions(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id text NOT NULL,
      artisan_profile_id uuid REFERENCES public.artisans(id),status text NOT NULL DEFAULT 'pending',
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.whatsapp_inbound_messages(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),provider_message_id text NOT NULL UNIQUE,
      from_e164 text NOT NULL,phone_number_id text,message_type text NOT NULL,
      message_text text,media_id text,caption text,provider_timestamp timestamptz,
      processing_status text NOT NULL DEFAULT 'RECEIVED',last_error text,
      created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $fn$;
    CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $fn$
      SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated')
    $fn$;
    CREATE OR REPLACE FUNCTION fixeo_private._fixeo_is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
      SELECT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='admin')
    $fn$;

    CREATE OR REPLACE FUNCTION public.approve_artisan_claim(uuid) RETURNS jsonb
      LANGUAGE sql SECURITY DEFINER AS $fn$ SELECT '{}'::jsonb $fn$;
    CREATE OR REPLACE FUNCTION public.complete_artisan_onboarding() RETURNS jsonb
      LANGUAGE sql SECURITY DEFINER AS $fn$ SELECT '{}'::jsonb $fn$;
    CREATE OR REPLACE FUNCTION public.admin_verify_artisan_v1(uuid) RETURNS jsonb
      LANGUAGE sql SECURITY DEFINER AS $fn$ SELECT '{}'::jsonb $fn$;

    INSERT INTO public.users(id,role,full_name) VALUES
      ('00000000-0000-4000-8000-000000000001','admin','Admin'),
      ('00000000-0000-4000-8000-000000000002','client','Owner candidate'),
      ('00000000-0000-4000-8000-000000000003','client','Other');
  `);
  for(const sql of migrations)await db.query(sql);
}

test('static contract: Control OS exposes Supply and agent API is disabled by default',()=>{
  assert.match(adminHtml,/data-view="supply"/);
  assert.match(adminHtml,/id="sec-supply"/);
  assert.match(adminHtml,/admin-supply-engine\.js\?v=supply14/);
  assert.match(adminControl,/supply:\[\]/);
  assert.match(adminControl,/FixeoSupply\?\.refresh/);
  assert.match(adminHtml,/Budget IA à 0/);
  assert.match(adminSupply,/supply_admin_dashboard_v1/);
  assert.match(adminSupply,/Promise\.allSettled/);
  assert.match(adminSupply,/mode dégradé/);
  assert.match(adminHtml,/id="supply-national-plan"/);
  assert.match(adminHtml,/id="s-national-candidates"/);
  assert.match(adminSupply,/RECHERCHE EXTERNE NÉCESSAIRE/);
  assert.match(adminSupply,/POOL EXISTANT/);
  assert.match(adminSupply,/Cycle réussi/);
  assert.match(adminHtml,/class="card supply-advanced"/);
  assert.equal(api.__test.flag(undefined),false);
  assert.equal(api.__test.flag('true'),true);
  assert.equal(api.__test.uuid(id(10)),true);
  assert.equal(api.__test.uuid('bad'),false);
  assert.equal(learningApi.__test.eq('same','same'),true);
  assert.match(require('fs').readFileSync(require('path').join(ROOT,'vercel.json'),'utf8'),/\/api\/supply-learning/);
  assert.match(require('fs').readFileSync(require('path').join(ROOT,'vercel.json'),'utf8'),/15 5 \* \* \*/);
});

test('Bloc 1-2: declared availability is not capacity and opt-out removes recruitment candidacy',async t=>{
  await withDb(t,async db=>{
    await baseline(db); await setActor(db,id(1));
    await db.query(`INSERT INTO public.artisans(id,full_name,city,service_category,phone,availability,claimable,claimed)
      VALUES($1,'A Fes','Fès','Plomberie','0611111111','available',true,false)`,[id(100)]);
    await db.query(`INSERT INTO public.service_requests(id,city,service_category,status) VALUES($1,'Fès','Plomberie','new')`,[id(200)]);
    let s=(await db.query('select public.supply_admin_summary_v1() x')).rows[0].x;
    assert.equal(Number(s.referenced),1);assert.equal(Number(s.declared_available),1);assert.equal(Number(s.operational_capacity_proven),0);
    let intel=await db.query('select * from public.supply_intelligence_v1(10)');
    assert.equal(intel.rowCount,1);assert.equal(intel.rows[0].coverage_status,'GAP');assert.ok(Number(intel.rows[0].recruitment_priority)>0);
    let cand=await db.query('select * from public.supply_recruitment_candidates_v1($1,$2,10)',['Fès','Plomberie']);
    assert.equal(cand.rowCount,1);assert.equal(cand.rows[0].artisan_id,id(100));
    let pref=(await db.query('select public.supply_set_contact_preference_v1($1,$2,$3,$4,$5,$6) x',
      [id(100),'OPTED_OUT','user_request',null,false,id(901)])).rows[0].x;
    assert.equal(pref.ok,true);
    cand=await db.query('select * from public.supply_recruitment_candidates_v1($1,$2,10)',['Fès','Plomberie']);
    assert.equal(cand.rowCount,0);
    const noImplicitOptIn=(await db.query('select public.supply_set_contact_preference_v1($1,$2,$3,$4,$5,$6) x',
      [id(100),'ALLOWED','operator',null,false,id(902)])).rows[0].x;
    assert.equal(noImplicitOptIn.reason,'explicit_opt_in_required');
  });
});

test('Bloc 3-4: campaign queue is bounded and activation requires canonical trust plus fresh proof',async t=>{
  await withDb(t,async db=>{
    await baseline(db); await setActor(db,id(1));
    await db.query(`INSERT INTO public.artisans(id,full_name,city,service_category,phone,availability,claimable,claimed)
      VALUES($1,'B Fes','Fès','Plomberie','0622222222','available',true,false)`,[id(101)]);
    let camp=(await db.query('select public.supply_create_campaign_v1($1,$2,$3,$4,$5,$6,$7,$8) x',
      ['Pilot Fes','Fès','Plomberie','MANUAL',5,2,48,100])).rows[0].x;
    assert.equal(camp.ok,true);const cid=camp.campaign_id;
    await db.query('select public.supply_set_campaign_status_v1($1,$2,$3)',[cid,'ACTIVE',false]);
    let enq=(await db.query('select public.supply_enqueue_campaign_v1($1,10) x',[cid])).rows[0].x;
    assert.equal(Number(enq.enqueued),1);
    let queue=await db.query('select * from public.supply_admin_queue_v1(20)');
    assert.equal(queue.rowCount,1);assert.equal(queue.rows[0].status,'QUEUED');
    let plan=(await db.query('select public.supply_activation_plan_v1($1) x',[id(101)])).rows[0].x;
    assert.match(plan.claim_path,/rejoindre-fixeo\.html/);
    let bad=(await db.query('select public.supply_confirm_activation_v1($1,$2,$3,$4,$5) x',
      [id(101),'operator_assertion',{},new Date(),id(903)])).rows[0].x;
    assert.equal(bad.reason,'activation_prerequisites_missing');
    await db.query(`UPDATE public.artisans SET claimed=true,claim_status='approved',owner_user_id=$2,onboarding_completed=true,verified=true WHERE id=$1`,[id(101),id(2)]);
    let ok=(await db.query('select public.supply_confirm_activation_v1($1,$2,$3,$4,$5) x',
      [id(101),'operator_assertion',{source:'test'},new Date(),id(904)])).rows[0].x;
    assert.equal(ok.ok,true);
    const proj=(await db.query('select lifecycle_stage,operational_capacity_proven from public.supply_artisan_projection_v1 where artisan_id=$1',[id(101)])).rows[0];
    assert.equal(proj.lifecycle_stage,'ACTIVATED');assert.equal(proj.operational_capacity_proven,true);
  });
});

test('Bloc 5: agent leases are exclusive and AI cost is hard-gated',async t=>{
  await withDb(t,async db=>{
    await baseline(db); await setActor(db,id(1));
    await db.query(`INSERT INTO public.artisans(id,full_name,city,service_category,phone,availability,claimable,claimed)
      VALUES($1,'C Fes','Fès','Électricité','0633333333','available',true,false)`,[id(102)]);
    let camp=(await db.query('select public.supply_create_campaign_v1($1,$2,$3,$4,$5,$6,$7,$8) x',
      ['Agent Pilot','Fès','Électricité','MANUAL',10,3,48,100])).rows[0].x;const cid=camp.campaign_id;
    await db.query('select public.supply_set_campaign_status_v1($1,$2,$3)',[cid,'ACTIVE',false]);
    await db.query('select public.supply_enqueue_campaign_v1($1,10)',[cid]);
    let agent=(await db.query('select public.supply_admin_register_agent_v1($1,$2,$3,$4,$5,$6) x',
      ['Recruiter 1','RECRUITER','v1',JSON.stringify(['contact']),'LOW_COST',100])).rows[0].x;const aid=agent.agent_id;
    await db.query('select public.supply_admin_set_agent_state_v1($1,$2,$3)',[aid,'ACTIVE',false]);
    await db.query('select public.supply_admin_set_runtime_v1(true,100,2,1)');
    await setActor(db,'','service_role');
    let stopped=(await db.query('select public.supply_agent_begin_run_v1($1,$2) x',[aid,cid])).rows[0].x;
    assert.equal(stopped.reason,'global_kill_switch');
    await setActor(db,id(1),'authenticated');
    await db.query('select public.supply_admin_set_runtime_v1(false,0,2,1)');
    await setActor(db,'','service_role');
    let run=(await db.query('select public.supply_agent_begin_run_v1($1,$2) x',[aid,cid])).rows[0].x;assert.equal(run.ok,true);
    let leased=await db.query('select * from public.supply_lease_work_v1($1,1,300)',[aid]);assert.equal(leased.rowCount,1);
    let leased2=await db.query('select * from public.supply_lease_work_v1($1,1,300)',[aid]);assert.equal(leased2.rowCount,0);
    const task=leased.rows[0];
    let blocked=(await db.query('select public.supply_agent_record_ai_usage_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) x',
      [aid,run.run_id,task.id,'classify','LOW_COST','model-x',10,5,0,1,100,null,'ok',id(910)])).rows[0].x;
    assert.equal(blocked.reason,'ai_budget_disabled');
    await setActor(db,id(1),'authenticated');await db.query('select public.supply_admin_set_runtime_v1(false,100,2,1)');
    await setActor(db,'','service_role');
    let usage=(await db.query('select public.supply_agent_record_ai_usage_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) x',
      [aid,run.run_id,task.id,'classify','LOW_COST','model-x',10,5,0,1,100,null,'ok',id(911)])).rows[0].x;
    assert.equal(usage.ok,true);
  });
});

test('Bloc 6: channel outbox remains provider-neutral and explicit STOP suppresses outreach',async t=>{
  await withDb(t,async db=>{
    await baseline(db); await setActor(db,id(1));
    await db.query(`INSERT INTO public.artisans(id,full_name,city,service_category,phone,availability,claimable,claimed)
      VALUES($1,'D Casa','Casablanca','Plomberie','0644444444','available',true,false)`,[id(103)]);
    let camp=(await db.query('select public.supply_create_campaign_v1($1,$2,$3,$4,$5,$6,$7,$8) x',
      ['WA Pilot','Casablanca','Plomberie','WHATSAPP',10,3,48,0])).rows[0].x;const cid=camp.campaign_id;
    await db.query('select public.supply_set_campaign_status_v1($1,$2,$3)',[cid,'ACTIVE',false]);
    let prep=(await db.query('select public.supply_prepare_channel_message_v1($1,$2,$3,$4,$5,$6,$7,$8,$9) x',
      [id(103),cid,null,'WHATSAPP','recruitment_v1','RECRUITMENT',{claim:true},new Date(),id(920)])).rows[0].x;
    assert.equal(prep.ok,true);
    await db.query('select public.supply_set_campaign_status_v1($1,$2,$3)',[cid,'PAUSED',false]);
    await setActor(db,'','service_role');
    let pausedClaim=(await db.query("select public.supply_channel_claim_next_v1('WHATSAPP','worker') x")).rows[0].x;
    assert.equal(pausedClaim.state,'EMPTY');
    await setActor(db,id(1),'authenticated');
    await db.query('select public.supply_set_campaign_status_v1($1,$2,$3)',[cid,'ACTIVE',false]);
    await setActor(db,'','service_role');
    let peek=(await db.query("select public.supply_channel_peek_v1('WHATSAPP') x")).rows[0].x;assert.equal(peek.state,'READY');
    let claim=(await db.query("select public.supply_channel_claim_next_v1('WHATSAPP','worker') x")).rows[0].x;assert.equal(claim.state,'CLAIMED');
    let sent=(await db.query("select public.supply_channel_finalize_v1($1,'SENT',$2,NULL,0) x",[claim.outbox_id,'wamid.test'])).rows[0].x;assert.equal(sent.ok,true);
    const inbound=id(930);
    await db.query(`INSERT INTO public.whatsapp_inbound_messages(id,provider_message_id,from_e164,message_type,message_text)
      VALUES($1,'wamid.in','212644444444','text','STOP')`,[inbound]);
    let proc=(await db.query('select public.supply_process_whatsapp_inbound_v1($1) x',[inbound])).rows[0].x;
    assert.equal(proc.resolution,'SUPPRESSED');
    const pref=(await db.query('select outreach_status from public.supply_contact_preferences_v1 where artisan_id=$1',[id(103)])).rows[0];
    assert.equal(pref.outreach_status,'OPTED_OUT');
  });
});

test('Bloc 7: dashboard read model exposes economics without inventing capacity',async t=>{
  await withDb(t,async db=>{
    await baseline(db); await setActor(db,id(1));
    await db.query(`INSERT INTO public.artisans(id,full_name,city,service_category,phone,availability,claimable,claimed)
      VALUES($1,'E Rabat','Rabat','Serrurerie','0655555555','available',true,false)`,[id(104)]);
    const d=(await db.query('select public.supply_admin_dashboard_v1() x')).rows[0].x;
    assert.equal(d.ok,true);assert.equal(d.semantics.declared_available_is_capacity,false);
    assert.equal(Number(d.summary.declared_available),1);assert.equal(Number(d.summary.operational_capacity_proven),0);
    assert.equal(Number(d.economics.total_cost_minor),0);
  });
});


test('Blocs 8-10: existing base is prioritized and Recruitment Agent V1 stays rules-first',async t=>{
  await withDb(t,async db=>{
    await baseline(db); await setActor(db,id(1));
    await db.query(`INSERT INTO public.artisans(id,full_name,city,service_category,phone,availability,claimable,claimed)
      VALUES($1,'Pilot Fes','Fès','Plomberie','0666666666','available',true,false)`,[id(105)]);
    const base=await db.query('select * from public.supply_admin_existing_base_v1($1,$2,10)',['Fès','Plomberie']);
    assert.equal(base.rowCount,1);assert.equal(base.rows[0].claimable_unowned,true);
    let camp=(await db.query('select public.supply_create_campaign_v1($1,$2,$3,$4,$5,$6,$7,$8) x',
      ['Existing Base Pilot','Fès','Plomberie','MANUAL',5,2,48,0])).rows[0].x;
    await db.query('select public.supply_set_campaign_status_v1($1,$2,$3)',[camp.campaign_id,'ACTIVE',false]);
    let prepared=(await db.query('select public.supply_admin_prepare_existing_base_v1($1,10) x',[camp.campaign_id])).rows[0].x;
    assert.equal(Number(prepared.prepared),1);
    let agent=(await db.query('select public.supply_admin_register_agent_v1($1,$2,$3,$4,$5,$6) x',
      ['Recruitment Agent V1','RECRUITER','v1',JSON.stringify(['task_brief','rules_decision','prepare_claim']),'RULES_ONLY',0])).rows[0].x;
    await db.query('select public.supply_admin_set_agent_state_v1($1,$2,$3)',[agent.agent_id,'ACTIVE',false]);
    await setActor(db,'','service_role');
    const run=(await db.query('select public.supply_agent_begin_run_v1($1,$2) x',[agent.agent_id,camp.campaign_id])).rows[0].x;
    const leased=await db.query('select * from public.supply_lease_work_v1($1,1,300)',[agent.agent_id]);
    assert.equal(leased.rowCount,1);
    const decision=(await db.query('select public.supply_agent_rules_decision_v1($1,$2,$3) x',
      [agent.agent_id,run.run_id,leased.rows[0].id])).rows[0].x;
    assert.equal(decision.decision,'PREPARE_CLAIM_OUTREACH');assert.equal(decision.model_required,false);
    await setActor(db,id(1));
    const ready=(await db.query('select public.supply_admin_recruitment_readiness_v1() x')).rows[0].x;
    assert.equal(ready.rules_first,true);assert.equal(ready.outbound_provider_enabled,false);
  });
});


test('Blocs 11-13: national engine ranks city-trade cells and provider stays closed by default',async t=>{
 await withDb(t,async db=>{
  await baseline(db); await setActor(db,id(1));
  await db.query(`INSERT INTO public.artisans(id,full_name,city,service_category,phone,claimable,claimed)
    VALUES($1,'Casa Plumber','Casablanca','Plomberie','0677777777',true,false),($2,'Agadir AC','Agadir','Climatisation','0688888888',true,false)`,[id(106),id(107)]);
  await db.query(`INSERT INTO public.service_requests(id,city,service_category,status) VALUES
    ($1,'Agadir','Climatisation','new'),($2,'Agadir','Climatisation','new'),($3,'Casablanca','Plomberie','new')`,[id(210),id(211),id(212)]);
  const cells=await db.query('select * from public.supply_national_cells_v1(10)');
  assert.ok(cells.rowCount>=2);assert.equal(cells.rows[0].city,'Agadir');
  const plan=(await db.query('select public.supply_national_plan_v1() x')).rows[0].x;
  assert.equal(plan.mode,'DRY_RUN');assert.equal(plan.provider_enabled,false);
  await setActor(db,'','service_role');
  const gate=(await db.query('select public.supply_national_provider_gate_v1() x')).rows[0].x;
  assert.equal(gate.allowed,false);
  const off=(await db.query('select public.supply_national_orchestrate_v1() x')).rows[0].x;
  assert.equal(off.reason,'national_orchestration_disabled');
 });
});


test('Supply agents admin RPC preserves bigint return contract',async t=>{
 await withDb(t,async db=>{
  await baseline(db); await setActor(db,id(1));
  await db.query("insert into public.supply_agents_v1(name,agent_type,version,status,capabilities,model_tier,daily_ai_budget_minor,kill_switch,created_by) values('Contract Agent','RECRUITER','v1','PAUSED','[]'::jsonb,'RULES_ONLY',0,false,$1)",[id(1)]);
  const rows=await db.query('select * from public.supply_admin_agents_v1()');
  assert.equal(rows.rowCount,1);assert.equal(rows.rows[0].name,'Contract Agent');assert.equal(Number(rows.rows[0].spend_today),0);assert.equal(Number(rows.rows[0].runs_today),0);
 });
});


test('B14-B17: learning cycle is closed, data quality normalizes aliases and readiness stays simulation-only',async t=>{
 await withDb(t,async db=>{
  await baseline(db); await setActor(db,id(1));
  await db.query(`INSERT INTO public.artisans(id,full_name,city,service_category,phone,claimable,claimed)
   VALUES($1,'Fes Electrician','Fès','Électricité','0699999999',true,false)`,[id(108)]);
  await db.query(`INSERT INTO public.service_requests(id,city,service_category,status) VALUES($1,'fes','electricite','new')`,[id(213)]);
  const quality=(await db.query('select public.supply_data_quality_v1() x')).rows[0].x;
  assert.ok(Number(quality.normalization_rescues)>=1);
  const ready=await db.query('select * from public.supply_activation_readiness_v1()');
  assert.ok(ready.rows.some(x=>x.activation_gate==='SIMULATION_READY'));
  await db.query('select public.supply_admin_set_national_runtime_v1(true,true,false,10,20,100,0)');
  await setActor(db,'','service_role');
  const cycle=(await db.query('select public.supply_learning_cycle_v1() x')).rows[0].x;
  assert.equal(cycle.ok,true);assert.equal(Number(cycle.stability_score),100);
  const gate=(await db.query('select public.supply_national_provider_gate_v1() x')).rows[0].x;
  assert.equal(gate.allowed,false);
  assert.equal(Number((await db.query('select count(*) n from public.supply_work_queue_v1')).rows[0].n),0);
 });
});


test('External Discovery V1 stages, deduplicates and never writes canonical artisans',async t=>{
 await withDb(t,async db=>{
  await baseline(db);await setActor(db,id(1));
  await db.query(`insert into public.artisans(id,full_name,city,service_category,phone,claimable,claimed) values($1,'Existing Fes','Fès','Serrurerie','0612345678',true,false)`,[id(109)]);
  const b=(await db.query("select public.supply_external_create_batch_v1('GENSPARK_OFFMAPS','fixture','Fès','Serrurerie') x")).rows[0].x;
  await db.query("select public.supply_external_stage_v1($1,'OFF-1','Existing Fes','Fès','Serrurerie','0612345678','https://example.test/1','{}')",[b.batch_id]);
  await db.query("select public.supply_external_stage_v1($1,'OFF-2','New Locksmith','Fès','Serrurerie','0698765432','https://example.test/2','{}')",[b.batch_id]);
  await db.query('select public.supply_external_analyze_batch_v1($1)',[b.batch_id]);
  const rows=await db.query('select * from public.supply_external_inbox_v1($1,20)',[b.batch_id]);
  assert.equal(rows.rows.find(x=>x.external_key==='OFF-1').decision,'EXISTING');
  assert.equal(rows.rows.find(x=>x.external_key==='OFF-2').decision,'NEW_CANDIDATE');
  const before=Number((await db.query('select count(*) n from public.artisans')).rows[0].n);
  const p=(await db.query('select public.supply_external_promote_v1($1) x',[rows.rows.find(x=>x.external_key==='OFF-2').candidate_id])).rows[0].x;
  assert.equal(p.state,'PROMOTION_READY');
  assert.equal(Number((await db.query('select count(*) n from public.artisans')).rows[0].n),before);
 });
});


test('Secure external ingestion benchmarks human decisions without canonical writes',async t=>{
 await withDb(t,async db=>{await baseline(db);await setActor(db,id(1));
  const before=Number((await db.query('select count(*) n from public.artisans')).rows[0].n);
  const rows=[{external_key:'REAL-1',display_name:'New Plumber',city:'Fès',service_category:'Plomberie',phone:'0611111111',human_decision:'OUTREACH_READY',human_priority:'P1'}];
  const x=(await db.query("select public.supply_external_ingest_v1('GENSPARK','fixture','Fès',$1::jsonb) x",[JSON.stringify(rows)])).rows[0].x;
  const b=(await db.query('select public.supply_external_benchmark_v1($1) x',[x.batch_id])).rows[0].x;
  assert.equal(Number(b.total),1);assert.equal(Number(b.agreement),1);assert.equal(Number(b.divergence),0);
  assert.equal(Number((await db.query('select count(*) n from public.artisans')).rows[0].n),before);
 });});
