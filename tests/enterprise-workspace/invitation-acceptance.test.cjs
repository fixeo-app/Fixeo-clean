const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');

const root=path.join(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'enterprise-invitation.html'),'utf8');
const code=fs.readFileSync(path.join(root,'js/fixeo-enterprise-invitation.js'),'utf8');
const token='a'.repeat(64);

async function boot(search,session,acceptResult){
  const dom=new JSDOM(html,{url:'https://fixture.invalid/enterprise-invitation.html'+search,runScripts:'outside-only'});
  const w=dom.window;
  const calls=[];
  const client={auth:{getSession:async()=>({data:{session},error:null})}};
  w.FixeoSupabaseClient={CONFIGURED:true,ready:async()=>({client})};
  w.FixeoEnterpriseInvitationActions={accept:async(_client,value)=>{
    calls.push(value);
    if(acceptResult instanceof Error) throw acceptResult;
    return acceptResult||{ok:true,enterprise_id:'00000000-0000-4000-8000-000000000101'};
  }};
  w.eval(code);
  await new Promise(r=>setImmediate(r));
  return {w,dom,calls,q:id=>w.document.getElementById(id)};
}

test('B7 acceptance page rejects malformed token before any RPC',async()=>{
  const s=await boot('?token=bad',{user:{id:'u'}});
  assert.match(s.q('fxei-message').textContent,/invalide/i);
  assert.equal(s.calls.length,0);
  s.dom.window.close();
});

test('B7 acceptance page requires a real authenticated session',async()=>{
  const s=await boot('?token='+token,null);
  assert.equal(s.q('fxei-login').hidden,false);
  assert.equal(s.q('fxei-accept').hidden,true);
  assert.equal(s.calls.length,0);
  s.dom.window.close();
});

test('B7 accepted invitation clears token URL and exposes returned enterprise workspace',async()=>{
  const enterpriseId='00000000-0000-4000-8000-000000000101';
  const s=await boot('?token='+token,{user:{id:'u'}},{ok:true,enterprise_id:enterpriseId});
  assert.equal(s.q('fxei-accept').hidden,false);
  s.q('fxei-accept').click();
  await new Promise(r=>setImmediate(r));
  assert.deepEqual(s.calls,[token]);
  assert.equal(s.w.location.search,'');
  assert.equal(s.q('fxei-workspace').hidden,false);
  assert.equal(s.q('fxei-workspace').getAttribute('href'),'dashboard-enterprise.html?enterprise_id='+enterpriseId);
  assert.match(s.q('fxei-message').textContent,/maintenant actif/i);
  s.dom.window.close();
});

test('B7 acceptance artifacts are noindex/no-referrer and contain no browser token persistence',()=>{
  const dom=new JSDOM(html);
  const d=dom.window.document;
  assert.equal(d.querySelector('meta[name=robots]').content,'noindex, nofollow');
  assert.equal(d.querySelector('meta[name=referrer]').content,'no-referrer');
  assert.doesNotMatch(code,/localStorage|sessionStorage|console\.log|token_hash/);
  assert.deepEqual([...d.scripts].map(x=>x.getAttribute('src').split('?')[0]),[
    'js/supabase-client.js','js/fixeo-enterprise-invitation-actions.js','js/fixeo-enterprise-invitation.js'
  ]);
  dom.window.close();
});
