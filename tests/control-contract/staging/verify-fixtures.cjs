'use strict';
const fs=require('node:fs');
const {baseline,migrate}=require('../fixture.cjs');
(async()=>{
 const db=await baseline();
 try{
  await migrate(db);await db.exec('ALTER TABLE auth.users ADD raw_app_meta_data jsonb;');
  for(let n=1;n<=16;n++){
   const id='10000000-0000-4000-8000-'+String(n).padStart(12,'0');const role=[3,13].includes(n)?'admin':[2,12].includes(n)?'artisan':'client';
   await db.exec(`INSERT INTO auth.users VALUES('${id}','{"fixture_suite":"control-b1"}'); INSERT INTO public.users(id,role) VALUES('${id}','${role}'); INSERT INTO public.profiles(id,role) VALUES('${id}','${role}');`);
  }
  await db.exec(fs.readFileSync(process.argv[2],'utf8'));const r=await db.query('select count(*) as requests from public.service_requests');console.log(JSON.stringify({fixture_structure:'PASS',requests:r.rows[0].requests}));
 }finally{await db.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
