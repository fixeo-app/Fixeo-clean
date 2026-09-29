'use strict';
// Renders private, reviewable SQL. Does not connect to or mutate any database.
const fs=require('node:fs'),path=require('node:path');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tables=new Set(['public.service_requests','public.missions','public.dispatch_execution_queue','public.dispatch_notification_outbox','public.estimator_context_redemptions']);
function render(manifest,images){
 if(manifest?.version!==1||!uuid.test(manifest.batch_id)||!/^[0-9a-f]{40}$/.test(manifest.baseline||'')||!manifest.backup?.at||!manifest.backup?.evidence)throw Error('INVALID_CHECKPOINT_METADATA');
 if(!Array.isArray(manifest.rows)||manifest.rows.length<1||manifest.rows.length>30)throw Error('BOUNDED_MANIFEST_REQUIRED');
 const seen=new Set();
 for(const r of manifest.rows){
  const ledger=r.table==='public.estimator_context_redemptions';
  if(!tables.has(r.table)||!/^[0-9a-f]{64}$/.test(r.sha256||'')||r.classification!=='A'||!r.reason||
   (ledger?!/^[1-9][0-9]{0,14}$/.test(r.id):!uuid.test(r.id))||r.method!==(ledger?'retain_committed_unlink_request':'archive_then_delete'))throw Error('INVALID_REVIEWED_ROW');
  const key=r.table+':'+r.id;if(seen.has(key))throw Error('DUPLICATE_TARGET');seen.add(key);
 }
 const ledger=manifest.rows.filter(x=>x.table==='public.estimator_context_redemptions');
 if(ledger.length!==1)throw Error('EXACTLY_ONE_CONSUMED_LEDGER_REQUIRED');
 const original=images.find(x=>x.table_name===ledger[0].table&&String(x.row?.id)===ledger[0].id)?.row;
 if(!original||original.state!=='committed'||!uuid.test(original.service_request_id)||!seen.has('public.service_requests:'+original.service_request_id))throw Error('LEDGER_DEPENDENCY_NOT_PROVEN');
 const encoded=JSON.stringify(manifest);
 if(encoded.includes('$manifest$')||encoded.includes('@@'))throw Error('UNSAFE_TEMPLATE_DELIMITER');
 const substitutions={MANIFEST:encoded,REDEMPTION_REQUEST_ID:original.service_request_id,REDEMPTION_ID:ledger[0].id,ROW_COUNT:String(manifest.rows.length),DELETE_COUNT:String(manifest.rows.filter(r=>r.method==='archive_then_delete').length)};
 return Object.fromEntries(['apply','rollback'].map(name=>[name,fs.readFileSync(path.join(__dirname,name+'.template.sql'),'utf8').replace(/@@([A-Z_]+)@@/g,(_,key)=>{if(!(key in substitutions))throw Error('UNKNOWN_TEMPLATE_FIELD');return substitutions[key];})]));
}
if(require.main===module){
 const [manifestPath,imagesPath,out]=process.argv.slice(2);
 if(!manifestPath||!imagesPath||!out)throw Error('Usage: render.cjs PRIVATE_MANIFEST PRIVATE_BEFORE_IMAGES PRIVATE_OUTPUT_DIRECTORY');
 const result=render(JSON.parse(fs.readFileSync(manifestPath,'utf8')),JSON.parse(fs.readFileSync(imagesPath,'utf8')));
 fs.mkdirSync(out,{recursive:true,mode:0o700});
 for(const [name,sql] of Object.entries(result))fs.writeFileSync(path.join(out,name+'.sql'),sql,{mode:0o600,flag:'wx'});
 console.log('Rendered two private SQL files; no database connection made.');
}
module.exports={render};
