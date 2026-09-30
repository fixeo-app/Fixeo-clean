(function(root){
 'use strict';
 const $=id=>document.getElementById(id);
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const date=value=>value?new Date(value).toLocaleString('fr-FR'):'Inconnu';
 const labels={request:'Demande',mission:'Mission / Finance',quote:'Devis Marketplace',artisan:'Artisan',client:'Client',claim:'Claim',enterprise:'Entreprise',site:'Site Enterprise',worker:'Technicien interne',internal_assignment:'Affectation interne',pricing_offer:'Offre tarifaire / Réservation',diagnostic_summary:'Diagnostic — résumé autorisé',remittance:'Reversement'};
 const set=(id,text)=>{if($(id))$(id).textContent=text;};
 let currentDossier=null,ticket=0,returnFocus=null,actionBusy=false;
 const pages={};
 const relation=r=>r.access&&r.access!=='accessible'?`<p class="dossier-missing">${esc(labels[r.type]||r.type)} · ${esc(r.id)} — ${esc(r.access)}</p>`:`<button class="btn dossier-link" data-dossier-type="${esc(r.type)}" data-id="${esc(r.id)}"><b>${esc(labels[r.type]||r.type)}</b><span>${esc(r.id)}</span>${r.relation?`<small>${esc(r.relation)} · ${esc(r.source)}</small>`:''}</button>`;
 function route(type,id,replace=false){const u=new URL(location.href);if(type)u.searchParams.set('dossier',type+':'+id);else u.searchParams.delete('dossier');history[replace?'replaceState':'pushState']({fixeoDossierDepth:type?(history.state?.fixeoDossierDepth||0)+1:0},'',u);}
 function openShell(title,sub,preserve=false){
  if(!preserve){ticket++;currentDossier=null;route(null,null,true);}
  if(!$('drawer').classList.contains('open'))returnFocus=document.activeElement;
  set('drawer-title',title);set('drawer-sub',sub);
  for(const id of ['drawer-summary','drawer-facts','drawer-relations','drawer-actions'])$(id).innerHTML='';
  $('drawer').hidden=false;$('drawer').classList.add('open');$('drawer').setAttribute('role','dialog');$('drawer').setAttribute('aria-modal','true');$('drawer').setAttribute('aria-labelledby','drawer-title');
  document.querySelector('.os')?.setAttribute('inert','');$('drawer-close').focus();
 }
 function close(options={}){ticket++;currentDossier=null;$('drawer').classList.remove('open');$('drawer').hidden=true;document.querySelector('.os')?.removeAttribute('inert');if(options.history!==false)route(null,null,true);if(returnFocus?.isConnected)returnFocus.focus();}
 function panel(name,title){return `<section class="dossier-section" aria-label="${title}"><h3>${title}</h3><div id="dossier-${name}" aria-live="polite">Lecture…</div></section>`;}
 function renderPage(section){
  const p=pages[section],box=$('dossier-'+section);if(!box||!p)return;
  if(p.error){box.innerHTML=`<div class="error">SOURCE ERROR · ${esc(p.error)}</div><button class="btn" data-dossier-retry="${section}">Relire cette source</button>`;return;}
  box.innerHTML=(section==='relations'?p.items.map(relation).join(''):p.items.map(e=>`<article class="rafi-event"><b>${esc(e.action)} · ${esc(e.result)}</b><small>${esc(date(e.occurred_at))} · ${esc(e.authority)}</small><span>${esc(e.evidence)} · ${esc(e.source)}</span><span>${e.actor_id?'Acteur '+esc(e.actor_id):'Acteur non documenté'}${e.correlation_id?' · Corrélation '+esc(e.correlation_id):''}</span><small>${esc(e.key)}</small></article>`).join(''))||`<p>Aucun ${section==='relations'?'lien canonique':'événement documenté'} dans cette source.</p>`;
  box.insertAdjacentHTML('beforeend',`<small>FRESH · ${esc(date(p.as_of))} · ${p.items.length} élément(s) chargés${p.has_more?' · PARTIAL — suite disponible':''}</small>${p.has_more?`<button class="btn" data-dossier-more="${section}">Charger la suite</button>`:''}`);
 }
 async function loadPage(section,more=false){
  const d=currentDossier,mark=ticket;if(!d)return;
  if(pages[section]?.busy)return;const old=pages[section];pages[section]={...old,busy:true};
  try{const data=await root.FixeoControl.request('dossier-section',{type:d.entity_type,id:d.id,section,after:more?old?.next_cursor:null,limit:25});if(mark!==ticket)return;
   pages[section]={...data,items:more?[...old.items,...data.items]:data.items};renderPage(section);
  }catch(e){if(mark!==ticket)return;if(e.message==='FORBIDDEN'){close();return;}pages[section]={error:e.message};renderPage(section);}
 }
 function renderOperation(o){
  const j=o.item,h=j.hybrid,slug={waiting:'En attente',offered:'Offres en cours — acceptation non acquise',engaged:'Exécution engagée',unknown_conflict:'UNKNOWN — exécuteurs en conflit',unresolved:'État à examiner'};
  return `<div class="dossier-operational"><b>${esc(slug[j.operational_state]||'UNKNOWN')}</b><p>État demande : ${esc(j.status||'UNKNOWN')} · Exécuteur : ${esc(j.executor)} · Origine : ${esc(j.origin)}</p><p>Mode observé : ${esc(h?.mode||'UNKNOWN')} · Dispatch hybride : ${esc(h?.status||'UNKNOWN')}</p><p>SLA d’acceptation : ${esc(j.sla?.acceptance_status||'Non configuré')} ${j.sla?.acceptance_due_at?'· échéance '+esc(date(j.sla.acceptance_due_at)):''}</p><p>${j.active_offers} offre(s) actives · ${j.dispatch.queued} entrée(s) en file · ${j.dispatch.sent_evidence} preuve(s) d’envoi · ${j.dispatch.retry_count} tentative(s) déclarées</p><small>${esc(j.provenance)} · ${esc(j.dispatch.source)} · ${esc(date(o.as_of))}</small></div>`;
 }
 async function operationContext(d){
  const mark=ticket;if(!d.request_id)return;
  try{const o=await root.FixeoControl.request('operation-context',{request_id:d.request_id});if(mark===ticket)$('dossier-operation').innerHTML=renderOperation(o);}
  catch(e){if(mark===ticket)$('dossier-operation').innerHTML=`<div class="error">SOURCE ERROR · ${esc(e.message)}</div>`;}
 }
 async function hybridContext(d){
  const mark=ticket;if(!d.enterprise_context||d.entity_type!=='request')return;
  try{const h=await root.FixeoControl.request('hybrid-context',{request_id:d.id});if(mark!==ticket)return;d.hybrid=h;
   $('dossier-hybrid').innerHTML=`<p>Politique résolue : <b>${esc(h.policy.mode)}</b> · ${esc(h.policy.id||'Défaut canonique')}</p><p>${h.tenant_operator?'Permission de dispatch Enterprise vérifiée.':'ACTION NON DISPONIBLE · permission de dispatch du tenant absente.'}</p>`+
    (h.workers.length?h.workers.map(w=>`<div class="dossier-worker">${relation({type:'worker',id:w.id})}<span>${w.eligible?'Éligible selon le preview':'Non éligible'} · ${w.active_assignments}/${w.max_concurrent_jobs} interventions actives · ${esc(w.availability)}</span><small>${esc(w.reasons.join(' · '))}</small></div>`).join(''):'<p>Aucun technicien dans le registre du tenant.</p>')+
    `<small>${esc(h.source)} · ${esc(date(h.as_of))} · ${h.workers_has_more?'PARTIAL — 50 techniciens affichés sur '+h.worker_total:'FRESH'}</small><p>Autorités : ${esc(h.rpc.assign)} / ${esc(h.rpc.retry)}. Le preview ne déclenche aucune offre.</p>`;
   if(h.rafi_workforce?.signals.length)$('dossier-hybrid').insertAdjacentHTML('beforeend','<p>RAFI · '+esc(h.rafi_workforce.status)+' · '+h.rafi_workforce.signals.length+' capacité(s) atteinte(s) dans ce contexte. Examiner les affectations ; aucune surcharge globale déduite.</p>');
   renderActions(d,d.decision);
  }catch(e){if(mark===ticket)$('dossier-hybrid').innerHTML=`<div class="error">SOURCE ERROR · ${esc(e.message)} — actions indisponibles.</div>`;}
 }
 async function openDossier(type,id,context=null,options={}){
  if(!labels[type])return;const mark=++ticket;currentDossier=null;for(const k of Object.keys(pages))delete pages[k];
  if(options.history!==false)route(type,id);openShell(context?.decision?.title||labels[type],type.toUpperCase()+' · '+id,true);$('drawer-summary').innerHTML='<p>Lecture de l’identité canonique…</p>';
  try{const d=await root.FixeoControl.request('dossier',{type,id});if(mark!==ticket)return;
   currentDossier=d;d.decision=context?.decision;const s=d.summary;
   $('drawer-summary').innerHTML=`<div class="dossier-toolbar"><button class="btn" data-dossier-back>← Retour</button><button class="btn" data-dossier-refresh>Actualiser le dossier</button><button class="btn" data-dossier-copy>Copier le lien</button></div><b>${esc(s.name||s.service_category||labels[type])}</b><p>${esc(s.status||s.state||s.availability||'État non renseigné')} · FRESH · ${esc(date(d.as_of))}</p><small>Source : ${esc(d.provenance)} · Projection : ${esc(d.projection)}</small>`;
   if(d.rafi_context){const c=d.rafi_context;$('drawer-summary').insertAdjacentHTML('beforeend','<details><summary>Contexte RAFI · établi / manquant</summary>'+c.facts.map(f=>'<p>'+esc(f.field)+' : '+esc(f.value==null?'UNKNOWN':f.value)+' · '+esc(f.provenance)+'</p>').join('')+'<p>'+esc(c.limitations.join(' '))+'</p></details>');}
   const matches=root.FixeoRafi?.decisionsFor(type,id)||[];
   $('drawer-summary').insertAdjacentHTML('beforeend',context?.explanation||matches.slice(0,3).map(x=>root.FixeoRafi.explain(x)).join(''));
   $('drawer-facts').innerHTML=Object.entries({...fields,state:'État canonique',revision:'Révision',role:'Rôle',site_code:'Référence site',max_concurrent_jobs:'Capacité déclarée',active_assignments:'Affectations actives',service_code:'Service tarifaire',pricing_version:'Version tarifaire',client_total_minor:'Total (unités mineures)',expires_at:'Expiration',media_access:'Accès médias'}).filter(([k])=>Object.hasOwn(s,k)).map(([k,label])=>`<div class="fact"><span>${esc(label)}</span><b>${s[k]===null?'UNKNOWN':esc(Array.isArray(s[k])?s[k].join(', '):typeof s[k]==='boolean'?(s[k]?'Oui':'Non'):s[k])}</b><small>${esc(d.field_sources?.[k]||d.provenance)}</small></div>`).join('');
   $('drawer-relations').innerHTML=panel('relations','Objets liés')+panel('timeline','Suivi / audit')+(root.FixeoRegisters?.supportsDossier(type)?panel('register','Contexte du registre canonique'):'')+(d.request_id?panel('operation','Contexte opérationnel'):'')+(d.enterprise_context&&type==='request'?panel('hybrid','Workforce / Hybrid'):'');
   renderActions(d,d.decision);
   await Promise.allSettled([loadPage('relations'),loadPage('timeline'),operationContext(d),hybridContext(d),root.FixeoRegisters?.loadDossier(d,$('dossier-register'))]);
  }catch(e){if(mark===ticket)$('drawer-summary').innerHTML=`<div class="error">Dossier indisponible · ${esc(e.message)}</div><button class="btn" data-dossier-reopen="${esc(type)}" data-id="${esc(id)}">Réessayer</button>`;}
 }
  const fields = {status:'État',request_status:'État demande',urgency:'Urgence',city:'Ville',service_category:'Métier',availability:'Disponibilité',claimed:'Revendiqué',verified:'Vérifié',has_owner:'Propriétaire présent',onboarding_completed:'Onboarding terminé',created_at:'Création',accepted_at:'Acceptation',started_at:'Démarrage',completed_at:'Fin',validated_at:'Validation',final_price:'Prix final',agreed_price:'Prix convenu',commission_amount:'Commission',confirmed_commission:'Reversements confirmés',service_description:'Périmètre proposé',supplies_description:'Fournitures proposées',estimated_duration:'Durée estimée par l’artisan',submitted_at:'Soumission',presented_at:'Présentation au client',reviewed_version:'Version revue',review_status:'Revue',quote_version:'Version',proposed_price:'Prix proposé',amount:'Montant',currency:'Devise',version:'Version',proof_present:'Preuve enregistrée',services:'Métiers déclarés',cities:'Villes déclarées',data_classification:'Classification'};
  function renderActions(dossier,d) {
    const s=dossier.summary, type=dossier.entity_type, controls=[];
    const action=(cap,label)=>d?.canonical_proof&&![d.actionability.capability,({'claim.approve':'claim.reject','quote.approve':'quote.reject'})[d.actionability.capability]].includes(cap)?'':`<button class="btn" data-rafi-prepare="${esc(cap)}">${esc(label)}</button>`;
    if(type==='request'&&s.status==='new'&&!dossier.enterprise_context)controls.push(action('request.dispatch','Préparer le dispatch'));
    if(type==='artisan'&&s.verified!==true&&s.claimed&&s.has_owner&&s.onboarding_completed)controls.push(action('artisan.verify','Préparer la vérification'));
    if(type==='claim'&&s.status==='pending')controls.push(action('claim.approve','Préparer l’approbation'),action('claim.reject','Préparer le refus'));
    if(type==='quote'&&s.status==='pending'&&['submitted','legacy_unreviewed'].includes(s.review_status))controls.push(action('quote.approve','Préparer l’approbation'),action('quote.reject','Préparer le refus'));
    if(type==='mission'&&s.final_price===null&&((s.status==='done'&&['completed','validated'].includes(s.request_status))||(s.status==='validated'&&s.request_status==='validated'&&s.completed_at)))controls.push(action('mission.settle','Préparer le prix final'));
    if(type==='mission'&&dossier.financeContext?.facts?.can_declare===true)controls.push(action('finance.declare','Préparer une déclaration de reversement'));
    if(type==='remittance'&&dossier.financeContext?.facts?.can_reconcile===true&&['declared','confirmed'].includes(s.status)){
      if(s.status==='declared'&&s.proof_present)controls.push(action('finance.confirm','Préparer le rapprochement'));
      controls.push(action('finance.correct','Préparer une correction tracée'),action('finance.cancel','Préparer l’annulation de cette écriture'));
    }
    if(dossier.hybrid?.actionable){
      if(dossier.hybrid.policy.mode!=='external_only'&&dossier.hybrid.workers.some(w=>w.eligible))controls.push(action('enterprise.assign','Préparer l’affectation interne'));
      controls.push(action('enterprise.retry','Préparer la relance hybride'));
    }
    for(let i=controls.length-1;i>=0;i--)if(!controls[i])controls.splice(i,1);
    const provisioning=type==='enterprise'?'<button class="btn" data-enterprise-provision-manage="'+esc(dossier.id)+'">Gérer le propriétaire</button>':'';
    $('drawer-actions').innerHTML=`<div class="rafi-action-contract"><b>${controls.length?'ACTION DISPONIBLE · préparation':'ACTION MÉTIER NON DISPONIBLE'}</b><p>${controls.length?'Préconditions relues par le serveur ; confirmation Admin obligatoire avant exécution.':esc(dossier.hybrid?.unavailable_reason||d?.actionability.unavailable_reason||(dossier.enterprise_context?'Permission Enterprise et état courant requis.':'Aucune commande applicable à cet état.'))}</p></div>`+provisioning+controls.join('')+'<div id="rafi-action-form"></div><div id="rafi-action-result" role="status" aria-live="polite"></div>';
  }
  async function prepare(capability) {
    const dossier=currentDossier;if(!dossier||actionBusy)return;
    const form=$('rafi-action-form'),s=dossier.summary;
    form.innerHTML='<p>Préparation…</p>';
    let input='';
    if(capability==='request.dispatch'){
      try {const r=await root.FixeoControl.request('dispatch-candidates',{request_id:dossier.id});if(currentDossier!==dossier)return;
        if(!r.candidates.length){form.innerHTML='<p>ACTION NON DISPONIBLE · aucun candidat retourné par le preview Dispatch. Aucune couverture globale n’est déduite de cette liste bornée.</p>';return;}
        input='<label>Artisan proposé par Dispatch<select name="artisan_id" required class="control">'+r.candidates.map(a=>`<option value="${esc(a.id)}">#${a.rank} · ${esc(a.city)} · ${esc(a.service_category)} · ${esc(a.id.slice(0,8))}</option>`).join('')+'</select></label><p>Liste canonique bornée à 50 candidats. Le dispatch final peut refuser une proposition.</p>';
      } catch(error){form.innerHTML='<div class="error">'+esc(error.message)+'</div>';return;}
    }
    if(capability==='enterprise.assign'){
      const h=dossier.hybrid;if(!h?.actionable)return;
      input='<label>Technicien interne éligible<select name="worker_id" required class="control">'+h.workers.filter(w=>w.eligible).map(w=>`<option value="${esc(w.id)}">${esc(w.id.slice(0,8))} · ${w.active_assignments}/${w.max_concurrent_jobs} interventions</option>`).join('')+'</select></label>';
    }
    if(['finance.declare','finance.correct'].includes(capability))input='<label>Montant du reversement (MAD)<input class="control" name="amount" type="number" min="0.01" step="0.01" required></label><label>Méthode<select class="control" name="method" required><option value="cash">Espèces</option><option value="wafacash">Wafacash</option><option value="bank_transfer">Virement</option></select></label><label>Référence de la preuve<input class="control" name="proof_reference" minlength="3" maxlength="128" required></label><p>Une référence documente une déclaration ; seul le rapprochement canonique la confirme.</p>';
    if(capability==='finance.cancel')input='<p>Annule cette écriture du registre tout en conservant son historique. Aucun remboursement ni paiement réel n’est exécuté.</p>';
    if(capability==='quote.approve')input='<label>Expiration (facultative)<input class="control" name="expires_at" type="datetime-local"></label><p>La validation présente cette version au client et peut envoyer sa notification canonique.</p>';
    if(capability==='mission.settle')input='<label>Prix final vérifié (MAD)<input class="control" name="final_price" type="number" min="0.01" step="0.01" required></label>';
    form.innerHTML=`<form id="rafi-prepare-form" data-capability="${esc(capability)}"><p>Autorité / commande : ${esc(capability)}</p>${input}<label>Motif de la revue<textarea class="control" name="reason" minlength="3" maxlength="500" required placeholder="Éléments vérifiés par l’opérateur"></textarea></label>${capability==='finance.confirm'?'<label><input type="checkbox" name="proof_reviewed" required> J’ai examiné la preuve documentaire du reversement.</label>':''}<button class="btn primary" type="submit">Vérifier les préconditions et voir l’aperçu</button></form>`;
  }
  async function executeForm(form) {
    if(actionBusy||!currentDossier)return;
    const d=currentDossier,capability=form.dataset.capability,s=d.summary,values=new FormData(form),payload={reason:values.get('reason')};
    let target=d.id;
    if(capability==='enterprise.assign')payload.worker_id=values.get('worker_id');
    if(capability==='request.dispatch')payload.artisan_id=values.get('artisan_id');
    if(capability.startsWith('quote.')){payload.version=s.quote_version;if(capability==='quote.approve'&&values.get('expires_at'))payload.expires_at=new Date(values.get('expires_at')).toISOString();}
    if(capability==='mission.settle'){payload.final_price=Number(values.get('final_price'));payload.expected_final_price=s.final_price;}
    if(capability.startsWith('finance.')){
      if(d.entity_type==='remittance'){target=s.mission_id;payload.remittance_id=d.id;payload.version=s.version;}
      if(['finance.declare','finance.correct'].includes(capability)){payload.amount=Number(values.get('amount'));payload.method=values.get('method');payload.proof_reference=values.get('proof_reference');}
    }
    actionBusy=true;for(const b of form.querySelectorAll('button,input,select,textarea'))b.disabled=true;
    try {
      const result=await root.FixeoControl.command(capability,target,payload,d.decision||null);
      if(result.cancelled){set('rafi-action-result','Action annulée avant exécution.');return;}
      if(!result.ok||!result.audit_id||!result.correlation_id||!result.idempotency_key||result.verified?.id!==target)throw Error('RESULT_NOT_VERIFIED');
      await root.FixeoRafi.load();
      if(currentDossier!==d)return;
      await openDossier(d.entity_type,d.id,null,{history:false});
      set('rafi-action-result','Résultat vérifié · audit '+result.audit_id+' · corrélation '+result.correlation_id+' · idempotence '+result.idempotency_key);
      root.FixeoOperations?.refresh(true);root.FixeoRegisters?.invalidate();
    } catch(error){set('rafi-action-result','Action non confirmée · '+error.message+' · Relisez le dossier avant de réessayer.');}
    finally{actionBusy=false;for(const b of form.querySelectorAll('button,input,select,textarea'))b.disabled=false;}
  }


 document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.dossierType){e.stopImmediatePropagation();openDossier(b.dataset.dossierType,b.dataset.id);}
  else if(b.dataset.rafiPrepare){e.stopImmediatePropagation();prepare(b.dataset.rafiPrepare);}
  else if(b.dataset.dossierMore)loadPage(b.dataset.dossierMore,true);
  else if(b.dataset.dossierRetry)loadPage(b.dataset.dossierRetry);
  else if(b.dataset.dossierReopen)openDossier(b.dataset.dossierReopen,b.dataset.id,null,{history:false});
  else if(b.hasAttribute('data-dossier-refresh')&&currentDossier)openDossier(currentDossier.entity_type,currentDossier.id,null,{history:false});
  else if(b.hasAttribute('data-dossier-back')){if(history.state?.fixeoDossierDepth)history.back();else close();}
  else if(b.hasAttribute('data-dossier-copy'))navigator.clipboard?.writeText(location.href).then(()=>{b.textContent='Lien copié';}).catch(()=>{b.textContent='Copie indisponible';});
  else if(b.id==='drawer-close'){e.stopImmediatePropagation();close();}
 });
 document.addEventListener('submit',e=>{if(e.target.id==='rafi-prepare-form'){e.preventDefault();executeForm(e.target);}});
 document.addEventListener('keydown',e=>{
  if(!$('drawer')?.classList.contains('open'))return;
  if(e.key==='Escape'){e.preventDefault();close();}
  if(e.key==='Tab'){const a=[...$('drawer').querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')].filter(x=>!x.hidden);const first=a[0],last=a.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 });
 function fromRoute(){const value=new URL(location.href).searchParams.get('dossier'),m=value?.match(/^([a-z_]+):([0-9a-f-]{36})$/i);if(m&&labels[m[1]])openDossier(m[1],m[2],null,{history:false});else close({history:false});}
 addEventListener('popstate',fromRoute);
 root.FixeoDossier={open:openDossier,openShell,close,fromRoute,refreshActions:d=>{if(currentDossier===d)renderActions(d,d.decision);}};
})(window);
