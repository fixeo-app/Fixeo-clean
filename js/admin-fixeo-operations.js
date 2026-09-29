(function(root){
 'use strict';
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const names={status:'ops-status',urgency:'ops-urgency',city:'ops-city',trade:'ops-trade',origin:'ops-origin',executor:'ops-executor',mode:'ops-mode',sla:'ops-sla',min_age:'ops-age',query:'ops-search',classification:'ops-classification'};
 let filters={},rows=[],cursor=null,hasMore=false,asOf=null,serial=0,busy=false,refreshAt=0,timer;
 const executor={internal:'Interne',external:'Artisan externe',unassigned:'Non affecté',conflict:'UNKNOWN · conflit'};
 const stage={waiting:'À traiter',offered:'Offres — acceptation attendue',engaged:'Exécution engagée',unresolved:'À examiner',unknown_conflict:'UNKNOWN · conflit'};
 function render(error=null){
  const list=$('operations-list');if(!list)return;
  const stale=asOf&&Date.now()-Date.parse(asOf)>60000;
  $('ops-count').textContent=error?'SOURCE ERROR · '+error:busy?'Lecture…':`${stale?'STALE':'FRESH'} · ${rows.length} demandes chargées${hasMore?' · PARTIAL — suite disponible':''} · total global non déduit de cette page`;
  $('ops-context').textContent=Object.entries(filters).map(([k,v])=>k+' : '+v).join(' · ')||'Toutes origines · référence stable pour la pagination';
  list.innerHTML=busy&&!rows.length?'<p role="status">Lecture de la source canonique…</p>':error?`<div class="error">Source indisponible : ${esc(error)}. Aucun zéro n’est déduit.</div><button class="btn" data-ops-retry>Réessayer</button>`:rows.map(r=>`<article class="operation-row" data-stage="${esc(r.operational_state)}"><button class="operation-main" data-kind="request" data-id="${esc(r.id)}"><span class="kicker">${esc(r.origin)} · ${esc(r.id.slice(0,8))}</span><b>${esc(r.service_category||'Métier UNKNOWN')} · ${esc(r.city||'Ville UNKNOWN')}</b><span>${esc(stage[r.operational_state]||'UNKNOWN')}</span><small>Demande ${esc(r.status||'UNKNOWN')} · urgence ${esc(r.urgency||'UNKNOWN')} · ${r.age_minutes==null?'Ancienneté UNKNOWN':r.age_minutes+' min'}</small></button><div class="operation-context"><span class="pill">${esc(executor[r.executor]||'UNKNOWN')}</span><span>Mode ${esc(r.hybrid?.mode||'UNKNOWN')}</span><span>SLA ${esc(r.sla?.acceptance_status||'Non configuré')}</span><small>${r.active_offers} offre(s) · ${r.dispatch?.sent_evidence??'UNKNOWN'} preuve(s) d’envoi</small></div><div class="operation-links">${[...r.internal_assignments,...r.missions].map(x=>`<button class="btn" data-kind="${x.type}" data-id="${esc(x.id)}">${x.type==='mission'?'Mission':'Affectation'} ${esc(x.id.slice(0,8))} →</button>`).join('')}${r.enterprise_id?`<button class="btn" data-kind="enterprise" data-id="${esc(r.enterprise_id)}">Entreprise →</button><button class="btn" data-kind="site" data-id="${esc(r.site_id)}">Site →</button>`:''}</div></article>`).join('')||'<div class="empty">Aucune demande ne correspond à ces filtres dans la source canonique.</div>';
  $('ops-more').hidden=!hasMore||!!error;$('ops-more').disabled=busy;
  $('ops-provenance').textContent='Sources : service_requests, missions, Enterprise context / assignments / hybrid, SLA canonique et dispatch. '+(asOf?'Observé le '+new Date(asOf).toLocaleString('fr-FR'):'');
 }
 async function refresh(force=false,more=false){
  if(busy&&!force)return;if(!force&&!more&&Date.now()-refreshAt<30000)return;
  const mark=++serial;busy=true;if(!more){rows=[];cursor=null;hasMore=false;}render();
  try{const data=await root.FixeoControl.request('operations',{...filters,after:more?cursor:null,limit:25});if(mark!==serial)return;rows=more?[...rows,...data.items]:data.items;cursor=data.next_cursor;hasMore=data.has_more;asOf=data.as_of;refreshAt=Date.now();busy=false;render();}
  catch(e){if(mark!==serial)return;busy=false;rows=[];asOf=null;hasMore=false;render(e.message);}
 }
 function readFilters(){filters=Object.fromEntries(Object.entries(filters).filter(([k])=>['enterprise_id','site_id'].includes(k)));for(const [k,id] of Object.entries(names)){const value=$(id)?.value?.trim();if(value&&value!=='all')filters[k]=k==='min_age'?Number(value):value;}refresh(true);}
 function setContext(c){filters={};for(const k of [...Object.keys(names),'enterprise_id','site_id'])if(c[k]!=null&&c[k]!==''&&c[k]!=='all')filters[k]=c[k];for(const [k,id] of Object.entries(names)){if($(id))$(id).value=filters[k]??($(id).tagName==='SELECT'?'all':'');}refresh(true);}
 for(const id of Object.values(names)){const field=$(id);field?.addEventListener(field.tagName==='SELECT'?'change':'input',()=>{clearTimeout(timer);timer=setTimeout(readFilters,field.tagName==='SELECT'?0:300);});}
 $('ops-more')?.addEventListener('click',()=>refresh(false,true));$('ops-reset')?.addEventListener('click',()=>setContext({}));
 document.addEventListener('click',e=>{if(e.target.closest('[data-ops-retry]'))refresh(true);});
 setInterval(()=>{if($('sec-operations')?.classList.contains('active')&&!document.hidden)render();},15000);
 root.FixeoOperations={refresh,setContext};
 // A single paginated search covers all canonical dossier types, including exact IDs.
 let searchMark=0,searchTimer,searchRows=[],searchCursor=null,searchMore=false;
 async function search(more=false){
  const query=$('global-search').value.trim(),type=$('global-type').value,mark=++searchMark,box=$('global-results');
  if(query.length<2){box.hidden=true;box.innerHTML='';return;}box.hidden=false;if(!more){searchRows=[];searchCursor=null;}box.innerHTML='<p>Recherche canonique…</p>';
  try{const data=await root.FixeoControl.request('search',{query,type,after:more?searchCursor:null,limit:15});if(mark!==searchMark)return;searchRows=more?[...searchRows,...data.items]:data.items;searchCursor=data.next_cursor;searchMore=data.has_more;
   box.innerHTML=searchRows.map(x=>`<button class="row" data-kind="${esc(x.type)}" data-id="${esc(x.id)}"><b>${esc(x.summary.name||x.summary.service_category||x.type)}</b><small>${esc(x.type)} · ${esc(x.id)} · ${esc(x.summary.city||'')}</small></button>`).join('')||'<p>Aucun résultat canonique.</p>';
   box.insertAdjacentHTML('beforeend',searchMore?'<button class="btn" data-search-more>Charger la suite</button>':'<small>Fin des résultats.</small>');
  }catch(e){if(mark===searchMark)box.innerHTML=`<div class="error">SOURCE ERROR · ${esc(e.message)}</div>`;}
 }
 $('global-search')?.addEventListener('input',()=>{searchMark++;clearTimeout(searchTimer);searchTimer=setTimeout(()=>search(),300);});$('global-type')?.addEventListener('change',()=>search());
 document.addEventListener('click',e=>{if(e.target.closest('[data-search-more]'))search(true);if(e.target.closest('#global-results [data-kind]'))$('global-results').hidden=true;});
})(window);
