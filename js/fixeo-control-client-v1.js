(function(root){'use strict';
 const uuid=()=>crypto.randomUUID();
 async function request(operation,body){
  const c=root.FixeoSupabaseClient?.client;if(!c)throw Error('SUPABASE_UNAVAILABLE');
  const s=await c.auth.getSession(),token=s.data?.session?.access_token;if(!token)throw Error('SESSION_REQUIRED');
  const response=await fetch('/api/control-v1/'+operation,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body||{}),signal:AbortSignal.timeout(8000)});
  const data=await response.json();if(!response.ok||data.ok===false)throw Error(data.code||'CONTROL_UNAVAILABLE');return data;
 }
 function review(p){return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.setAttribute('aria-labelledby','control-review-title');dialog.style.cssText='max-width:560px;width:calc(100% - 32px);border:1px solid #cbd5e1;border-radius:18px;padding:24px;color:#17213b;box-shadow:0 24px 90px #0004';
  const title=document.createElement('h2');title.id='control-review-title';title.textContent='Confirmer cette action';
  const text=document.createElement('p');text.textContent=p.effect_description;
  const details=document.createElement('pre');details.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 system-ui;background:#f1f5f9;padding:16px;border-radius:10px';
  details.textContent='Cible : '+(p.current.name||p.target.type)+' · '+p.target.id+'\nAutorité : '+p.authority+'\nÉtat actuel : '+(p.current.status||p.current.review_status||'Profil')+'\nEffet demandé : '+JSON.stringify(p.effect,null,2)+'\nValidité : '+new Date(p.expires_at).toLocaleTimeString('fr-FR');
  const warning=document.createElement('p');warning.textContent='Le serveur revérifiera les droits et l’état du dossier. L’action et son résultat seront journalisés.';
  const cancel=document.createElement('button');cancel.className='btn';cancel.textContent='Revenir';
  const confirm=document.createElement('button');confirm.className='btn primary';confirm.textContent='Confirmer et exécuter';confirm.style.marginLeft='12px';
  const close=value=>{dialog.close();dialog.remove();resolve(value);};cancel.onclick=()=>close(false);confirm.onclick=()=>close(true);dialog.addEventListener('cancel',e=>{e.preventDefault();close(false);});
  dialog.append(title,text,details,warning,cancel,confirm);document.body.append(dialog);dialog.showModal();cancel.focus();
 });}
 async function command(capability,targetId,payload){
  const p=await request('action/preview',{capability,target_id:targetId,payload:{reason:'Revue explicite par opérateur FIXEO',...payload}});
  if(!await review(p))return {cancelled:true};
  return request('action/execute',{preview_id:p.preview_id,confirmed:true,idempotency_key:uuid()});
 }
 root.FixeoControl={request,command};
})(window);
