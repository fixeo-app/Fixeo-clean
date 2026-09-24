const test=require('node:test');
const assert=require('node:assert/strict');
const entry=require('../../js/fixeo-workspace-entry.js');
const eid='00000000-0000-4000-8000-000000000101';
const rt=(access)=>({resolver:{resolve:async()=>access},client:{}});

test('client without enterprise keeps client dashboard',async()=>{
 const d=await entry.resolveDestination('dashboard-client.html',{runtime:rt({ok:true,status:'OK',global_space:{type:'client',destination:'dashboard-client.html'},enterprise_spaces:[]})});
 assert.equal(d,'dashboard-client.html');
});
test('artisan without enterprise keeps artisan V2',async()=>{
 const d=await entry.resolveDestination('dashboard-artisan-v2.html',{runtime:rt({ok:true,status:'OK',global_space:{type:'artisan',destination:'dashboard-artisan-v2.html'},enterprise_spaces:[]})});
 assert.equal(d,'dashboard-artisan-v2.html');
});
test('admin without enterprise keeps admin',async()=>{
 const d=await entry.resolveDestination('admin.html',{runtime:rt({ok:true,status:'OK',global_space:{type:'admin',destination:'admin.html'},enterprise_spaces:[]})});
 assert.equal(d,'admin.html');
});
test('valid enterprise membership routes generic entry to selector',async()=>{
 const d=await entry.resolveDestination('dashboard-client.html',{runtime:rt({ok:true,status:'OK',global_space:{type:'client',destination:'dashboard-client.html'},enterprise_spaces:[{type:'enterprise',enterprise_id:eid,name:'ACME',role:'owner'}]})});
 assert.equal(d,'workspace-select.html');
});
test('invalid tenant id cannot trigger selector',async()=>{
 const d=await entry.resolveDestination('dashboard-client.html',{runtime:rt({ok:true,status:'OK',global_space:{type:'client',destination:'dashboard-client.html'},enterprise_spaces:[{type:'enterprise',enterprise_id:'bad',name:'ACME',role:'owner'}]})});
 assert.equal(d,'dashboard-client.html');
});
test('unknown enterprise role cannot trigger selector',async()=>{
 const d=await entry.resolveDestination('dashboard-client.html',{runtime:rt({ok:true,status:'OK',global_space:{type:'client',destination:'dashboard-client.html'},enterprise_spaces:[{type:'enterprise',enterprise_id:eid,name:'ACME',role:'superadmin'}]})});
 assert.equal(d,'dashboard-client.html');
});
test('resolver failure preserves safe fallback',async()=>{
 const d=await entry.resolveDestination('admin.html',{runtime:{resolver:{resolve:async()=>{throw Error('network')}},client:{}}});
 assert.equal(d,'admin.html');
});
test('hung resolver times out to safe fallback',async()=>{
 const d=await entry.resolveDestination('dashboard-client.html',{runtime:{resolver:{resolve:()=>new Promise(()=>{})},client:{}},waitMs:10});
 assert.equal(d,'dashboard-client.html');
});
test('untrusted fallback URL is reduced to an allowlisted local destination',()=>{
 assert.equal(entry.safeFallback('https://evil.invalid/dashboard-client.html?x=1'),'dashboard-client.html');
 assert.equal(entry.safeFallback('javascript:alert(1)'),'auth.html');
 assert.equal(entry.safeFallback('https://evil.invalid/pwn.html'),'auth.html');
});
test('forged global destination cannot replace canonical mapping',async()=>{
 const d=await entry.resolveDestination('dashboard-client.html',{runtime:rt({ok:true,status:'OK',global_space:{type:'client',destination:'https://evil.invalid'},enterprise_spaces:[]})});
 assert.equal(d,'dashboard-client.html');
});
