// Compares read-only Production catalogues; never connects to a database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dir = path.join(__dirname, '../../docs/enterprise-os/security-s1a');
const read = name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const before = read('production-before.json'), after = read('production-after.json');
const checks = {};
function check(name, fn) { fn(); checks[name] = 'PASS'; }
const sr = 'service_requests';
check('preflight_12', () => { const c=read('preflight-production.json'); assert.equal(c.length,13); assert(c.every(x=>x.pass)); });
check('postflight_12', () => { const c=read('postflight-production.json'); assert.equal(c.length,13); assert(c.every(x=>x.pass)); });
check('exact_patch_and_migration', () => {
  const hash='7e998abb17c31ccc587715c81fa9ecad803cff7e8cb6f2cccd31db83f3322844';
  for (const file of [path.join(dir,'patch-proposed.sql'),path.join(__dirname,'../../supabase/migrations/20260924044646_service_requests_safe_hardening_s1a.sql')]) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash);
});
check('anon_table_insert_false', () => assert.equal(after.target.effective_table.find(x=>x.role==='anon'&&x.privilege==='INSERT').allowed,false));
check('anon_four_column_insert_only', () => assert.deepEqual(after.target.effective_columns.filter(x=>x.role==='anon'&&x.privilege==='INSERT'&&x.allowed).map(x=>x.column),['city','description','service_category','status']));
check('guest_defaults', () => {
  assert.equal(after.target.columns.find(x=>x.name==='status').default,"'new'::text");
  const c=after.target.columns.find(x=>x.name==='client_profile_id'); assert.equal(c.default,null); assert.equal(c.not_null,false);
});
check('canonical_anon_policy', () => {
  const policies=after.target.policies.filter(x=>x.roles.some(r=>r==='anon'||r==='public')&&['ALL','INSERT'].includes(x.cmd));
  assert.equal(policies.length,1); assert.equal(policies[0].policyname,'anon_service_requests_insert');
  assert.equal(policies[0].with_check,"((status = 'new'::text) AND (client_profile_id IS NULL))");
});
check('anon_select_update_delete_blocked_by_rls', () => {
  assert.equal(after.target.table.rls,true);
  for (const cmd of ['SELECT','UPDATE','DELETE']) {
    const policies=after.target.policies.filter(x=>x.roles.some(r=>r==='anon'||r==='public')&&['ALL',cmd].includes(x.cmd));
    assert.equal(policies.length,1); assert.equal(policies[0].qual,'false');
  }
});
check('assignment_policy_removed', () => assert(!after.target.policies.some(x=>x.policyname==='artisan_assign_new_requests')));
check('artisan_owner_and_linked_mission_preserved_without_phone', () => {
  const p=after.target.policies.find(x=>x.policyname==='artisan_update_assigned_requests'); assert(p);
  for (const expression of [p.qual,p.with_check]) {
    assert.match(expression,/missions m/); assert.match(expression,/m.request_id = \(service_requests.id\)::text/);
    assert.match(expression,/m.artisan_profile_id/); assert.match(expression,/a.owner_user_id/); assert.match(expression,/auth.uid\(\)/);
    assert.doesNotMatch(expression,/phone|profiles|\bOR\b/i);
  }
});
check('only_authorized_catalogue_delta', () => {
  const expected=structuredClone(before.full);
  expected.table_inventory.find(x=>x.name===sr).acl=expected.table_inventory.find(x=>x.name===sr).acl.filter(x=>!(x.grantee==='anon'&&x.privilege==='INSERT'));
  expected.table_effective.find(x=>x.table===sr&&x.role==='anon'&&x.privilege==='INSERT').allowed=false;
  expected.column_acl.push(...after.target.column_acl.map(x=>({table:sr,...x})));
  expected.column_acl.sort((a,b)=>a.table<b.table?-1:a.table>b.table?1:a.column<b.column?-1:a.column>b.column?1:0);
  expected.policies=expected.policies.filter(x=>x.tablename!==sr).concat(after.target.policies);
  expected.policies.sort((a,b)=>a.tablename<b.tablename?-1:a.tablename>b.tablename?1:a.policyname<b.policyname?-1:a.policyname>b.policyname?1:0);
  assert.deepEqual(after.full,expected);
});
check('all_134_function_definitions_security_and_acl_identical', () => assert.deepEqual(after.function_security,before.function_security));
check('default_acl_identical', () => assert.deepEqual(after.default_acl,before.default_acl));
check('enterprise_and_artisan_rpcs_preserved', () => {
  assert.deepEqual(after.rpc_acl,before.rpc_acl);
  for (const f of after.rpc_acl) {assert.equal(f.authenticated,true);assert.equal(f.service_role,true);assert.equal(f.postgres,true);assert.equal(f.anon,false);assert.equal(f.PUBLIC,false);}
});
check('service_role_postgres_and_authenticated_table_privileges_preserved', () => {
  for (const r of ['service_role','postgres','authenticated']) assert.deepEqual(after.full.table_effective.filter(x=>x.role===r),before.full.table_effective.filter(x=>x.role===r));
});
check('triggers_constraints_identical', () => {assert.deepEqual(after.full.triggers,before.full.triggers);assert.deepEqual(after.full.constraints,before.full.constraints);});
check('s0_five_functions_52_privileges_nine_tables', () => {
  const s0before=require('../../docs/enterprise-os/security-s0/contract-before.json');
  const removed=s0before.table_effective.filter(x=>['anon','authenticated'].includes(x.role)&&['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'].includes(x.privilege)&&x.allowed);
  assert.equal(removed.length,52);assert.equal(new Set(removed.map(x=>x.table)).size,9);
  for(const x of removed)assert.equal(after.full.table_effective.find(y=>y.table===x.table&&y.role===x.role&&y.privilege===x.privilege).allowed,false);
  for(const sig of ['dispatch_request_v1_backup_20260821(uuid)','dispatch_notification_worker_peek_v1(text)','auto_dispatch_service_request_v1()','enqueue_dispatch_notification_from_mission_v1()','trigger_dispatch_v2_on_service_request()']) assert.deepEqual(after.full.function_inventory.find(x=>x.signature===sig).execute,{PUBLIC:false,anon:false,authenticated:false,service_role:true,postgres:true});
});
check('p0_catalogue_preserved', () => {
  for (const table of ['users','profiles']) for (const key of ['table_inventory','table_effective','column_acl','policies','triggers']) {
    const same=x=>(x.table||x.name||x.tablename)===table;assert.deepEqual(after.full[key].filter(same),before.full[key].filter(same));
  }
  assert.equal(after.full.all_function_definitions.find(x=>x.signature==='is_admin()').md5,'1986929dce09806c133d90b1bf480e1d');
});
check('rollback_reference_is_blocked_not_executed', () => {
  const sql=fs.readFileSync(path.join(dir,'rollback-blocked.sql'),'utf8'); assert(sql.indexOf('RAISE EXCEPTION')<sql.indexOf('REVOKE INSERT'));
});
console.log(JSON.stringify({checks,passed:Object.keys(checks).length,failed:0,production_business_writes_performed:false},null,2));
