(function(root){
 'use strict';
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=v=>typeof v==='number'?v.toLocaleString('fr-FR'):'UNKNOWN';
 let filters={},snapshot=null,cursor=null,cell=null,popCursor=null,popKind=null,ticket=0,flight=null,popTicket=0,coverageTicket=0;
 const request=(op,body)=>root.FixeoControl.request(op,body);
 const stamp=v=>v?new Date(v).toLocaleString('fr-FR',{timeZone:'Africa/Casablanca'}):'Date inconnue';
 const localFilters=()=>({...filters,...(cell?{city:cell.city??'__unknown__',trade:cell.trade??'__unknown__'}:{})});
 const dossier=(type,id)=>`<button class="btn" data-intel-dossier="${esc(type)}" data-id="${esc(id)}">Dossier ${esc(type)} · ${esc(id.slice(0,8))}</button>`;
 function init(){
  const el=$('sec-intelligence');if(!el||$('intel-form'))return;
  el.innerHTML=`<div class="head"><div><div class="kicker">MARKETPLACE & GROWTH INTELLIGENCE</div><h1>Demande, réseau, opportunités</h1><p class="lead">Des populations réelles, des preuves accessibles, des actions gouvernées.</p></div><span class="pill" id="intel-state">Lecture…</span></div>
  <form id="intel-form" class="intel-filters"><label>Créées à partir du<input type="date" name="from" aria-label="Début de cohorte"></label><label>Jusqu’au, exclu<input type="date" name="to" aria-label="Fin de cohorte"></label><label>Ville<input name="city" placeholder="Toutes les villes" maxlength="120"></label><label>Métier<select name="trade"><option value="">Tous les métiers</option>${['plomberie','électricité','serrurerie','climatisation','menuiserie','maçonnerie','peinture','carrelage','nettoyage','jardinage','bricolage','demenagement'].map(v=>`<option>${v}</option>`).join('')}<option value="__unknown__">Métier inconnu</option></select></label><label>Périmètre<select name="classification"><option value="all">Toutes classifications</option><option value="production">Production classifiée</option><option value="test">Tests classifiés</option><option value="internal">Interne classifié</option><option value="unclassified">Non classifié</option></select></label><button class="btn primary" type="submit">Examiner</button></form>
  <p id="intel-scope" class="intel-muted"></p><div id="intel-sources" class="intel-sources" aria-live="polite"></div><p id="intel-integrity" class="intel-muted"></p>
  <div class="intel-layout"><div><h2>Cube opérationnel</h2><p class="intel-muted">Cohorte de création et stock ouvert actuel sont distincts. Un profil disponible déclaré n’est pas une capacité réservée.</p><div id="intel-cells" class="intel-cells"></div><button id="intel-next" class="btn" hidden>Cellules suivantes</button></div>
  <section class="card intel-detail" id="intel-detail" aria-live="polite"><h2>Examiner une cellule</h2><p>Sélectionnez une ville et un métier pour ouvrir les populations sources.</p></section></div>
  <section class="card intel-population" id="intel-population" hidden aria-live="polite"></section>`;
  $('intel-form').addEventListener('submit',e=>{e.preventDefault();filters=Object.fromEntries([...new FormData(e.currentTarget)].filter(([,v])=>v!==''));reset();refresh(true);});
 }
 function reset(){ticket++;popTicket++;coverageTicket++;cursor=null;cell=null;popCursor=null;snapshot=null;$('intel-population').hidden=true;$('intel-detail').innerHTML='<h2>Examiner une cellule</h2><p>Sélectionnez une cellule dans le Cube.</p>';}
 function render(){
  if(!snapshot)return;
  const stale=Date.now()-Date.parse(snapshot.generated_at)>60000;
  $('intel-state').textContent=stale?'STALE':snapshot.status;
  const s=snapshot.scope;
  $('intel-scope').textContent=s?`Cohorte [${s.from}, ${s.to}) · ${s.timezone} · ${number(snapshot.total_cells)} cellule(s), ${snapshot.cells.length} affichée(s) · Observé ${stamp(snapshot.generated_at)}`:'Périmètre non mesurable : sources indisponibles.';
  if(s)for(const k of ['from','to'])if(!$('intel-form').elements[k].value)$('intel-form').elements[k].value=s[k];
  $('intel-sources').innerHTML=Object.entries(snapshot.sources).map(([k,v])=>`<span class="pill" data-state="${esc(v.status)}">${esc(k)} · ${esc(stale&&v.status==='FRESH'?'STALE':v.status)}${v.error?' · '+esc(v.error):''}</span>`).join('');
  $('intel-integrity').textContent=snapshot.unattributed_missions==null?'Missions sans demande : non attribuables à ce filtre.':`${snapshot.unattributed_missions} mission(s) sans demande source · hors cellules · relation UNKNOWN / NOT_FOUND · aucun solde reconstruit.`;
  $('intel-cells').innerHTML=snapshot.cells.map(c=>`<button class="intel-cell" data-intel-cell="${esc(c.key)}"><span class="intel-cell-heading"><b>${esc(c.city??'Ville inconnue')} · ${esc(c.trade??'Métier inconnu')}</b><span>${number(c.operations?.waiting)} en attente</span></span><span class="intel-cell-facts"><span>${number(c.operations?.cohort_requests)} demande(s) dans la cohorte</span><span>${number(c.network?.referenced)} profils référencés</span><span>${number(c.network?.available_declared)} disponibles déclarés</span></span></button>`).join('')||`<div class="empty">${snapshot.status==='FRESH'?'Aucune demande dans cette fenêtre ni stock ouvert correspondant.':'Cellules inconnues sur les sources indisponibles.'}</div>`;
  $('intel-next').hidden=!snapshot.has_more;
 }
 async function refresh(force=false){
  init();if(!$('intel-form'))return;if(flight&&!force)return flight;
  const mine=++ticket;$('intel-state').textContent='Lecture…';
  const own=request('marketplace',{filters,after:cursor,limit:25}).then(data=>{if(mine!==ticket)return;snapshot=data;render();if(cell){cell=snapshot.cells.find(c=>c.key===cell.key)||null;detail();}}).catch(e=>{if(mine!==ticket)return;snapshot=null;$('intel-state').textContent='UNAVAILABLE';$('intel-cells').innerHTML=`<div class="error">SOURCE ERROR · ${esc(e.message)}. Aucun total déduit.</div>`;$('intel-sources').textContent='';$('intel-detail').innerHTML='';$('intel-population').hidden=true;}).finally(()=>{if(flight===own)flight=null;});flight=own;return own;
 }
 function detail(){
  popTicket++;coverageTicket++;$('intel-population').hidden=true;
  if(!cell){$('intel-detail').innerHTML='<p>La cellule n’est plus présente dans cette lecture. Choisissez une cellule actuelle.</p>';return;}
  const c=cell,o=c.operations,n=c.network,q=c.commerce;
  $('intel-detail').innerHTML=`<div class="kicker">PREUVES DE LA CELLULE</div><h2>${esc(c.city??'Ville inconnue')} · ${esc(c.trade??'Métier inconnu')}</h2>
  <dl class="intel-facts"><dt>Demande · cohorte</dt><dd>${number(o?.cohort_requests)} demandes créées dans la fenêtre</dd><dt>Opérations · stock</dt><dd>${number(o?.open)} ouvertes · ${number(o?.waiting)} sans engagement · ${number(o?.offered_missions)} offres</dd><dt>Attente la plus ancienne</dt><dd>${stamp(o?.oldest_waiting)}</dd><dt>Enterprise</dt><dd>${number(o?.enterprise_open)} demandes ouvertes</dd><dt>Dispatch</dt><dd>${number(o?.failed_notifications)} notifications en échec · une file ou une offre ne vaut pas acceptation</dd><dt>Réseau déclaré</dt><dd>${number(n?.claimed)} revendiqués · ${number(n?.verified)} vérifiés · ${number(n?.availability_unknown)} disponibilités inconnues</dd><dt>Fraîcheur réseau</dt><dd>Plus ancienne mise à jour profil : ${stamp(n?.oldest_profile_update)} ; ${number(n?.undated_profiles)} non datés. Ceci ne prouve pas une disponibilité récente.</dd><dt>Réservations / devis</dt><dd>${number(q?.quotes_presented)} présentés · ${number(q?.quotes_review)} à revoir · ${number(q?.quotes_expired)} expirés · absence de devis ≠ devis requis</dd></dl>
  <div class="intel-actions"><button class="btn" data-intel-pop="cohort">Demandes de la cohorte</button><button class="btn" data-intel-pop="open">Stock ouvert</button><button class="btn" data-intel-pop="waiting">Demandes en attente</button>${c.city&&c.trade?'<button class="btn" data-intel-pop="profiles">Profils de cette cellule</button>':''}</div>
  <h3>Couverture autorisée</h3><p>UNKNOWN avant vérification. Le contrôle relit au maximum cinq demandes via Dispatch ou Hybrid. Aucune affectation n’est exécutée.</p><button class="btn" id="intel-coverage-button" data-intel-coverage>Contrôler la couverture</button><div id="intel-coverage"></div>
  <div id="intel-activation"></div><div id="intel-cohorts"></div>
  <details><summary>Sources et définitions</summary><p>Demandes distinctes : service_requests. Acceptations : missions.accepted_at / enterprise_internal_assignments.assigned_at. Réseau distinct par cellule : artisans et métiers/villes secondaires. Les profils multivilles ne s’additionnent pas en un total réseau.</p><p>Normalisation : resolve_service_category_v1 et marketplace-dimensions-v1 ; valeurs brutes accessibles dans chaque dossier. Données Artisan Business privées exclues. Les sources partielles ou en erreur restent explicites.</p></details>`;
 }
 async function population(kind,more=false){
  if(!cell)return;const mine=++popTicket;if(!more){popCursor=null;popKind=kind;}
  const el=$('intel-population');el.hidden=false;if(!more)el.innerHTML='<p>Lecture de la population…</p>';
  try{const data=await request('marketplace-population',{kind:popKind,filters:localFilters(),after:popCursor,limit:25});if(mine!==popTicket)return;
   const html=data.items.map(x=>`<article class="intel-person">${dossier(x.type,x.id)}<span>${esc(x.facts.status??x.facts.availability??'UNKNOWN')} · ${esc(x.facts.raw_city??cell.city??'UNKNOWN')} · ${esc(x.facts.raw_trade??cell.trade??'UNKNOWN')}</span></article>`).join('');
   if(!more)el.innerHTML=`<h2>Population source · ${number(data.total)} objet(s)</h2><p class="intel-muted">${esc(popKind)} · ${stamp(data.as_of)} · population exacte, liste paginée. Le dossier relit l’autorité courante.</p><div id="intel-people"></div><button class="btn" id="intel-more" data-intel-more hidden>Objets suivants</button>`;
   $('intel-people').insertAdjacentHTML('beforeend',html||'<p>Aucun objet correspondant.</p>');popCursor=data.next_cursor;$('intel-more').hidden=!data.has_more;el.scrollIntoView?.({block:'nearest'});
  }catch(e){if(mine===popTicket)el.innerHTML=`<div class="error">SOURCE ERROR · ${esc(e.message)}. Population inconnue.</div>`;}
 }
 async function coverage(){
  if(!cell)return;const mine=++coverageTicket,button=$('intel-coverage-button');button.disabled=true;$('intel-coverage').textContent='Lecture canonique…';
  try{const data=await request('marketplace-coverage',{filters:localFilters(),limit:5});if(mine!==coverageTicket)return;
   $('intel-coverage').innerHTML=`<p>${data.checked_page} / ${data.total_waiting} demandes examinées · valables jusqu’à ${stamp(data.expires_at)}. ${data.has_more?'Contrôle partiel : ouvrir les demandes suivantes dans les dossiers.':''}</p>`+data.items.map(x=>`<div class="intel-coverage-row">${dossier('request',x.id)}<p>${esc(x.status)} · ${x.has_eligible_candidate===null?'Éligibilité UNKNOWN':x.has_eligible_candidate?'Au moins un candidat Dispatch actuel':'Aucun candidat Dispatch actuel'} · ${esc(x.authority)}</p>${(x.facts?.candidates||[]).map(a=>dossier('artisan',a.id)).join('')}${x.status==='ENTERPRISE_CONTEXT'?'<p>Parcours Enterprise gouverné ; permissions tenant revérifiées dans le dossier.</p>':''}</div>`).join('');
  }catch(e){if(mine===coverageTicket)$('intel-coverage').innerHTML=`<p class="error">SOURCE ERROR · ${esc(e.message)}. Couverture UNKNOWN.</p>`;}
  finally{if(mine===coverageTicket)button.disabled=false;}
 }
 function setContext(context){init();filters={...context};reset();root.FixeoAdmin?.navigate('intelligence');return refresh(true);}
 document.addEventListener('click',e=>{
  const b=e.target.closest('[data-intel-cell]');if(b){cell=snapshot?.cells.find(c=>c.key===b.dataset.intelCell);detail();return;}
  const d=e.target.closest('[data-intel-dossier]');if(d){root.FixeoDossier.open(d.dataset.intelDossier,d.dataset.id);return;}
  const p=e.target.closest('[data-intel-pop]');if(p){population(p.dataset.intelPop);return;}
  if(e.target.closest('[data-intel-more]')){population(popKind,true);return;}
  if(e.target.closest('[data-intel-coverage]')){coverage();return;}
  if(e.target.closest('#intel-next')){cursor=snapshot?.next_cursor;cell=null;refresh(true);}
 });
 root.FixeoIntelligence={refresh,setContext,clear:()=>{if($('intel-form')){reset();$('intel-cells').textContent='SESSION_REQUIRED';}}};
})(window);
