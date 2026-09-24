const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'../..');
const registry=fs.readFileSync(path.join(root,'supabase/migrations/20260924220000_enterprise_workforce_registry_block_a.sql'),'utf8');
const engine=fs.readFileSync(path.join(root,'supabase/migrations/20260924221000_enterprise_hybrid_dispatch_engine_block_a.sql'),'utf8');

test('A10 registry creates isolated workforce/runtime tables with RLS and SELECT-only browser grants',()=>{
  for(const t of ['enterprise_workforce_workers','enterprise_workforce_skills','enterprise_workforce_sites','enterprise_dispatch_policies','enterprise_internal_dispatch_offers','enterprise_internal_assignments','enterprise_hybrid_dispatch_state']){
    assert.match(registry,new RegExp('CREATE TABLE public\\.'+t));
    assert.match(registry,new RegExp('ALTER TABLE public\\.'+t+' ENABLE ROW LEVEL SECURITY'));
  }
  assert.match(registry,/REVOKE ALL ON TABLE[\s\S]*FROM PUBLIC,anon,authenticated/);
  assert.doesNotMatch(registry,/GRANT\s+(INSERT|UPDATE|DELETE)[\s\S]*TO authenticated/i);
});

test('A11 members are not automatically workers and worker registry links explicit member_id',()=>{
  assert.match(registry,/member_id uuid NOT NULL[\s\S]*REFERENCES public\.enterprise_members/);
  assert.match(registry,/UNIQUE \(enterprise_id, member_id\)/);
});

test('A12 policy supports four modes and no policy defaults to external_only',()=>{
  for(const mode of ['internal_only','internal_first','external_only','hybrid']) assert.match(registry,new RegExp(mode));
  assert.match(engine,/v_mode text := 'external_only'/);
  assert.match(engine,/IF v_policy_id IS NULL THEN[\s\S]*v_mode := 'external_only'/);
});

test('A13 Enterprise wrapper alone defers historical trigger and then calls hybrid resolver',()=>{
  assert.match(engine,/current_setting\('fixeo\.enterprise_dispatch_deferred', true\)/);
  assert.match(engine,/create_enterprise_request_hybrid/);
  assert.match(engine,/set_config\('fixeo\.enterprise_dispatch_deferred','on',true\)/);
  assert.match(engine,/public\.create_enterprise_request\(/);
  assert.match(engine,/public\.dispatch_enterprise_hybrid_v1\(v_request_id\)/);
});

test('A14 internal and artisan acceptance share service_requests new as the winner gate',()=>{
  assert.match(engine,/IF v_request_status<>'new' THEN/);
  assert.match(engine,/UPDATE public\.service_requests[\s\S]*SET status='assigned'[\s\S]*status='new'/);
  assert.match(engine,/UPDATE public\.dispatch_execution_queue[\s\S]*execution_status='CANCELLED'/);
});

test('A15 fallback runner is service-role only and internal-first only',()=>{
  assert.match(engine,/run_enterprise_dispatch_fallbacks_v1/);
  assert.match(engine,/s\.mode='internal_first'/);
  assert.match(engine,/REVOKE ALL ON FUNCTION public\.run_enterprise_dispatch_fallbacks_v1\(\)[\s\S]*FROM PUBLIC,anon,authenticated/);
  assert.match(engine,/GRANT EXECUTE ON FUNCTION public\.run_enterprise_dispatch_fallbacks_v1\(\)[\s\S]*TO service_role/);
});

test('A16 no historical missions schema or pricing files are modified',()=>{
  assert.doesNotMatch(registry+engine,/ALTER TABLE public\.missions/i);
  assert.doesNotMatch(registry+engine,/fixeo_pricing|pricing_offer/i);
});