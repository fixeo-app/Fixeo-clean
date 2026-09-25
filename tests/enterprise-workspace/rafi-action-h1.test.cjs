const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const actions=require('../../api/enterprise-rafi-actions');
const root=path.join(__dirname,'../..');

test('H1-01 action proposal contract allowlists action types and is non executable',()=>{
  const a=actions.normalizeAction({type:'create_governed_request',title:'Créer intervention',summary:'Préparer',target:{site_id:'x'},params:{description:'Fuite'},impact:'Soumis à gouvernance'});
  assert.equal(a.type,'create_governed_request');
  assert.equal(a.requires_confirmation,true);
  assert.equal(a.executable,false);
  assert.equal(actions.normalizeAction({type:'pay_invoice'}),null);
});
test('H1-02 proposals are bounded and sanitize arbitrary keys',()=>{
  const out=actions.normalizeActions(Array.from({length:8},(_,i)=>({type:'prepare_maintenance_action',title:'T'+i,summary:'S',target:{site_id:'x'},params:{ok:'yes','bad-key!':'no'},impact:'I'})));
  assert.equal(out.length,3);
  assert.equal(out[0].params.ok,'yes');
  assert.equal(Object.hasOwn(out[0].params,'bad-key!'),false);
});
test('H1-03 RAFI remains read-only and only emits proposals',()=>{
  const code=fs.readFileSync(path.join(root,'api/enterprise-rafi.js'),'utf8');
  assert.match(code,/only a draft for human review/);
  assert.match(code,/never executes anything/);
  assert.doesNotMatch(code,/rpc\(['"](?:upsert|set_|create_|submit_|decide_|dispatch_|assign_|retry_|accept_|decline_)/);
  assert.doesNotMatch(code,/SUPABASE_SERVICE_ROLE_KEY|service_role/);
});
test('H1-04 proposal schema is strict and mandatory',()=>{
  const code=fs.readFileSync(path.join(root,'api/enterprise-rafi.js'),'utf8');
  assert.match(code,/action_proposals/);
  assert.match(code,/maxItems:3/);
  for(const type of actions.ACTION_TYPES)assert.match(code,new RegExp(type));
});
test('H1-05 H1 has no execution endpoint or database migration',()=>{
  const contract=fs.readFileSync(path.join(root,'api/enterprise-rafi-actions.js'),'utf8');
  assert.doesNotMatch(contract,/fetch\(|\.rpc\(|SUPABASE_|service_role/);
  assert.equal(actions.ACTION_TYPES.length,6);
});
