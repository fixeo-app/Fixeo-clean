(function(root){'use strict';
 const uuid=()=>crypto.randomUUID();
 const sources=Object.freeze(['requests','missions','artisans','trust','network','finance']);
 const summaryFlights=new Map();
 const commandFlights=new Map(),pendingCommands=new Map();
 const traces=[];
 const now=()=>root.performance?.now?.()??Date.now();
 const safeOperation=value=>/^[a-z0-9/_-]{1,64}$/i.test(String(value||''))?String(value):'unknown';
 const safeCode=value=>/^[A-Z0-9_]{2,80}$/.test(String(value||''))?String(value):null;
 const safeCorrelation=value=>/^[0-9a-f-]{36}$/i.test(String(value||''))?String(value):null;
 function recordTrace(entry){
  const trace=Object.freeze({operation:safeOperation(entry.operation),status:entry.status==='success'?'success':'error',http_status:Number.isInteger(entry.http_status)?entry.http_status:null,ms:Math.max(0,Math.round(Number(entry.ms)||0)),code:safeCode(entry.code),correlation_id:safeCorrelation(entry.correlation_id),at:new Date().toISOString()});
  traces.push(trace);if(traces.length>50)traces.splice(0,traces.length-50);
  try{root.dispatchEvent?.(new CustomEvent('fixeo:control-trace',{detail:trace}));}catch(_){}
  return trace;
 }
 async function request(operation,body){
  const started=now(),op=safeOperation(operation);
  try{
   const c=root.FixeoSupabaseClient?.client;if(!c)throw Error('SUPABASE_UNAVAILABLE');
   const s=await c.auth.getSession(),token=s.data?.session?.access_token;if(!token)throw Error('SESSION_REQUIRED');
   const response=await fetch('/api/control-v1/'+operation,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body||{}),signal:AbortSignal.timeout(15000)});
   const data=await response.json(),correlation=response.headers?.get?.('X-Correlation-ID')||data?.correlation_id;
   if(!response.ok||data.ok===false){const error=Error(data.code||'CONTROL_UNAVAILABLE');error.status=response.status;recordTrace({operation:op,status:'error',http_status:response.status,ms:now()-started,code:error.message,correlation_id:correlation});throw error;}
   recordTrace({operation:op,status:'success',http_status:response.status,ms:now()-started,correlation_id:correlation});return data;
  }catch(error){
   if(!Number.isInteger(error.status))recordTrace({operation:op,status:'error',http_status:null,ms:now()-started,code:safeCode(error.message)||'TRANSPORT_ERROR',correlation_id:null});
   throw error;
  }
 }
 function review(p){return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.setAttribute('aria-labelledby','control-review-title');dialog.style.cssText='max-width:560px;width:calc(100% - 32px);border:1px solid #334155;border-radius:18px;padding:24px;color:#f7f8ff;background:#0c1120;box-shadow:0 24px 90px #0004';
  const title=document.createElement('h2');title.id='control-review-title';title.textContent='Confirmer cette action';
  const text=document.createElement('p');text.textContent=p.effect_description;
  const details=document.createElement('pre');details.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 system-ui;background:#111a2e;padding:16px;border-radius:10px';
  details.textContent='Cible : '+(p.current.name||p.target.type)+' · '+p.target.id+'\nAutorité : '+p.authority+'\nÉtat actuel : '+(p.current.status||p.current.review_status||'Profil')+'\nEffet demandé : '+JSON.stringify(p.effect,null,2)+(p.remittance?'\nReversement : '+JSON.stringify(p.remittance,null,2):'')+'\nPréconditions : '+p.preconditions.join(', ')+'\nValidité : '+new Date(p.expires_at).toLocaleTimeString('fr-FR');
  const warning=document.createElement('p');warning.textContent='Le serveur revérifiera les droits et l’état du dossier. L’action et son résultat seront journalisés.';
  const cancel=document.createElement('button');cancel.className='btn';cancel.textContent='Revenir';
  const confirm=document.createElement('button');confirm.className='btn primary';confirm.textContent='Confirmer et exécuter';confirm.style.marginLeft='12px';
  const close=value=>{dialog.close();dialog.remove();resolve(value);};cancel.onclick=()=>close(false);confirm.onclick=()=>close(true);dialog.addEventListener('cancel',e=>{e.preventDefault();close(false);});
  dialog.append(title,text,details,warning,cancel,confirm);document.body.append(dialog);dialog.showModal();cancel.focus();
 });}
 async function command(capability,targetId,payload,decision=null){
  const session=await root.FixeoSupabaseClient.client.auth.getSession();
  const actor=session.data?.session?.user?.id;if(!actor)throw Error('SESSION_REQUIRED');
  const prefix=decision?.canonical_proof?'rafi':capability.startsWith('enterprise.')?'hybrid':'action';
  const key=JSON.stringify([actor,capability,targetId,payload,decision?.decision_id||null]);
  if(commandFlights.has(key))return commandFlights.get(key);
  const flight=(async()=>{
   let pending=pendingCommands.get(key);
   if(!pending){pending={preview:await request(prefix+'/preview',{capability,target_id:targetId,payload:{reason:'Revue explicite par opérateur FIXEO',...payload},...(prefix==='rafi'?{decision_id:decision.decision_id,evidence_fingerprint:decision.evidence_fingerprint,valid_until:decision.expires_at,classification:decision.recommended_action.context.classification}:{})}),idempotency_key:uuid()};pendingCommands.set(key,pending);}
   if(!await review(pending.preview)){pendingCommands.delete(key);return {cancelled:true};}
   try{const result=await request(prefix+'/execute',{preview_id:pending.preview.preview_id,confirmed:true,idempotency_key:pending.idempotency_key});pendingCommands.delete(key);return result;}
   catch(error){if(error.status>=400&&error.status<500)pendingCommands.delete(key);throw error;}
  })().finally(()=>commandFlights.delete(key));
  commandFlights.set(key,flight);return flight;
 }
 function summary(onSource,classification='all'){
  if(!['all','production','test','internal','unclassified'].includes(classification))return Promise.reject(Error('INVALID_CLASSIFICATION'));
  let flight=summaryFlights.get(classification);
  if(flight){flight.listeners.add(onSource);return flight.promise;}
  flight={listeners:new Set([onSource]),promise:null};summaryFlights.set(classification,flight);
  flight.promise=Promise.all(sources.map(async source=>{
   let state;try{const result=await request('summary',{source,classification});state=result.sources[source];}
   catch(error){state={source,status:error.message==='FORBIDDEN'?'forbidden':'unavailable',data:null,error:error.message,as_of:null,completeness:'unknown'};}
   for(const listener of flight.listeners)if(typeof listener==='function')listener(source,state);
   return [source,state];
  })).then(Object.fromEntries).finally(()=>summaryFlights.delete(classification));
  return flight.promise;
 }
 root.FixeoControl={request,command,summary,traceSnapshot:()=>traces.map(x=>({...x}))};
})(window);
