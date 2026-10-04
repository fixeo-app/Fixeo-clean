'use strict';
const fs=require('fs'),assert=require('assert/strict');
for(const key of ['W41_ENV_FILE','W41_AUTH_FILE','W41_AUDIO_FILE','W41_REPORT_FILE'])assert.ok(process.env[key],key+' required');
const env=JSON.parse(fs.readFileSync(process.env.W41_ENV_FILE)),users=JSON.parse(fs.readFileSync(process.env.W41_AUTH_FILE));
const sharp=require('sharp');
assert.equal(env.SUPABASE_URL,'https://kqyhusnbybsukbcaoqtu.supabase.co');assert.equal(env.FIXEO_STAGING_PROJECT_REF,'kqyhusnbybsukbcaoqtu');
const results=[];const edge=env.SUPABASE_URL+'/functions/v1/mobile-rafi-preview-proxy';
let image;
async function request(label,user,route,body,expected){
 const t=performance.now();const r=await fetch(edge+route,{method:'POST',headers:{apikey:env.SUPABASE_ANON_KEY,...(user?{authorization:'Bearer '+user.token}:{})},body,redirect:'error',signal:AbortSignal.timeout(65000)});
 const raw=await r.text();const b=JSON.parse(raw);for(const secret of [...Object.values(env),...users.map(x=>x.token)])if(typeof secret==='string'&&secret.length>25)assert.ok(!raw.includes(secret),'Secret echo');
 const result={label,status:r.status,error:b.error,transcript_nonempty:!!b.text,privacy:b.privacy,safety_stop:b.result?.safety?.stop,latency_ms:Math.round(performance.now()-t),response_bytes:Buffer.byteLength(raw)};
 results.push(result);console.log(JSON.stringify(result));assert.equal(r.status,expected,label);return b;
}
function voice(){const f=new FormData();f.append('audio',new Blob([fs.readFileSync(process.env.W41_AUDIO_FILE)],{type:'audio/wav'}),'synthetic.wav');return f;}
function photo(persist=false){const f=new FormData();f.append('image',new Blob([image],{type:'image/png'}),'synthetic.png');f.append('city','rabat');f.append('description','Une forte odeur de gaz');if(persist){f.append('persist','true');f.append('consent_version','diagnostic-privacy-v1');}return f;}
(async()=>{
 image=await sharp({create:{width:64,height:64,channels:3,background:'#aabbcc'}}).png().toBuffer();
 await request('VOICE_ANON_REFUSED',null,'/api/mobile-rafi-transcribe',voice(),401);
 await request('VOICE_INVALID_JWT_REFUSED',{token:'invalid.jwt.'+'x'.repeat(30)},'/api/mobile-rafi-transcribe',voice(),401);
 for(const [i,role] of [[0,'CLIENT'],[2,'ARTISAN']])assert.ok((await request('VOICE_'+role+'_ACCEPTED',users[i],'/api/mobile-rafi-transcribe',voice(),200)).text);
 await request('PERSISTED_PHOTO_ARTISAN_REFUSED',users[2],'/api/mobile-rafi-photo',photo(true),403);
 for(const [i,role] of [[0,'CLIENT'],[2,'ARTISAN']]){const b=await request('EPHEMERAL_PHOTO_'+role+'_ACCEPTED',users[i],'/api/mobile-rafi-photo',photo(),200);assert.equal(b.privacy.persisted,false);assert.equal(b.diagnostic_reference,undefined);}
 const out=await fetch(env.SUPABASE_URL+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:env.SUPABASE_ANON_KEY,authorization:'Bearer '+users[2].token}});assert.equal(out.status,204);
 await request('VOICE_REVOKED_SESSION_REFUSED',users[2],'/api/mobile-rafi-transcribe',voice(),401);
 console.log('ROLE_SHARED_PASS');
})().catch(e=>{console.log(JSON.stringify({critical_failure:true,error_class:e.name,assertion:e.message.slice(0,180)}));process.exitCode=1}).finally(()=>fs.writeFileSync(process.env.W41_REPORT_FILE,JSON.stringify({results},null,2)));
