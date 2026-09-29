'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const h=require('./http.cjs');
(async()=>{
 const selected=process.argv.slice(2);
 const prior=selected.length&&process.env.FIXEO_STAGING_AUTH_EVIDENCE&&fs.existsSync(process.env.FIXEO_STAGING_AUTH_EVIDENCE)?JSON.parse(fs.readFileSync(process.env.FIXEO_STAGING_AUTH_EVIDENCE,'utf8')):null;
 const results=prior?prior.results.filter(x=>!selected.includes(x.name)):[];
 async function verifyIdentity(name){
  await h.login(name);
  const who=await h.request('/auth/v1/user',{actor:name,method:'GET'});assert.equal(who.status,200);assert.equal(who.data.id,h.uid(name));
  const role=await h.select(name,'users','select=id,role&id=eq.'+h.uid(name));assert.equal(role.status,200);assert.equal(role.data[0]?.role,h.identities[name].role);
  await h.refresh(name);
  results.push({name,login:'PASS',real_jwt:'PASS',canonical_role:'PASS',refresh:'PASS'});
  console.log('PASS Auth / JWT / rôle / refresh: '+name);
 }
 const names=selected.length?selected:Object.keys(h.identities);
 for(let i=0;i<names.length;i+=3)await Promise.all(names.slice(i,i+3).map(verifyIdentity));
 const invalid=await h.request('/auth/v1/token?grant_type=password',{body:{email:h.identities.client.email,password:'INCORRECT-SYNTHETIC-PASSWORD'}});assert.equal(invalid.status,400);
 const anon=await h.request('/auth/v1/user',{method:'GET'});assert.ok([401,403].includes(anon.status),'ANONYMOUS_AUTH_MUST_BE_DENIED');
 const bad=await h.request('/auth/v1/user',{method:'GET',token:'invalid-token-does-not-authorize'});assert.ok([401,403].includes(bad.status),'INVALID_AUTH_MUST_BE_DENIED');
 const out={project_ref:h.REF,synthetic_identities:results.length,results,invalid_password:'PASS',anonymous_user:'PASS',invalid_bearer:'PASS',completed_at:new Date().toISOString()};
 if(process.env.FIXEO_STAGING_AUTH_EVIDENCE)fs.writeFileSync(process.env.FIXEO_STAGING_AUTH_EVIDENCE,JSON.stringify(out,null,2));
 console.log(JSON.stringify(out));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
