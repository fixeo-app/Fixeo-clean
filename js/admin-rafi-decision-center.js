(function (root) {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {operations:'Operations',network:'Network',trust:'Trust',finance:'Finance',enterprise:'Enterprise'};
  let snapshot = null, flight = null, contextTicket = 0;
  let activeContext = null, contextCursor = null, contextRows = [], planLimit = 40;
  const age = minutes => minutes == null ? 'Ancienneté inconnue' : minutes < 60 ? minutes+' min' : minutes < 1440 ? Math.floor(minutes/60)+' h' : Math.floor(minutes/1440)+' j';
  const date = value => value ? new Date(value).toLocaleString('fr-FR') : 'Non renseigné';
  const sourceState = s => ['FRESH','PARTIAL'].includes(s.status) && (!Number.isFinite(Date.parse(s.as_of)) || Date.now()-Date.parse(s.as_of)>60000) ? 'STALE' : s.status;
  const snapshotState = () => snapshot?.status==='STALE' || Object.values(snapshot?.sources||{}).some(s=>sourceState(s)==='STALE') ? 'STALE' : snapshot?.status;
  const stale = d => !d || Date.parse(d.expires_at) <= Date.now() || snapshot?.status === 'STALE';
  const decision = id => snapshot?.decisions.find(d => d.decision_id === id);
  const set = (id, text) => {if ($(id)) $(id).textContent = text;};
  const button = (id, label, cls='') => `<button class="btn ${cls}" data-rafi-decision="${esc(id)}">${esc(label)}</button>`;
  const badge = d => `<span class="rafi-priority ${d.priority.toLowerCase()}">${esc(d.priority)} · ${esc(d.priority_label)}</span>`;

  function render() {
    if (!$('rafi-plan')) return;
    if (!snapshot) {set('rafi-brief','Lecture des sources canoniques…');set('rafi-next','Les priorités apparaîtront dès que les sources auront répondu.');for(const id of ['rafi-actions','rafi-plan','rafi-network-plan','rafi-top-priority','rafi-sources'])$(id).innerHTML='';set('rafi-top-impact','');return;}
    const state = snapshotState();
    set('rafi-state',state);$('rafi-state').dataset.state=state;
    set('rafi-as-of','Observé le '+date(snapshot.generated_at));
    $('rafi-sources').innerHTML=Object.entries(snapshot.sources).map(([source,s])=>`<span class="rafi-source" data-state="${esc(sourceState(s))}" title="${esc(s.error || (s.total_observations==null?'Source indisponible':s.returned_observations+' / '+s.total_observations+' observations'))}">${esc(labels[source])}<b>${esc(sourceState(s))}</b></span>`).join('');
    const top = snapshot.decisions[0];
    $('rafi-top').dataset.priority = top?.priority || 'empty';
    $('rafi-top-priority').innerHTML = top ? badge(top) : '';
    set('rafi-brief',top?.title || (state==='FRESH'?'Aucune décision à traiter dans les règles couvertes.':'Priorité impossible à établir sur les sources disponibles.'));
    set('rafi-next',top ? top.reason.join(' ') : state==='FRESH'?'Les sources observées ne déclenchent aucune règle de triage.':'Les valeurs absentes restent inconnues. Actualisez pour relire les sources.');
    set('rafi-top-impact',top ? top.impact.text : '');
    $('rafi-actions').innerHTML = top ? button(top.decision_id,'Comprendre et ouvrir le dossier','primary')+`<span class="rafi-meta">${top.affected_count} objet(s) · ${esc(age(top.age_minutes))}${stale(top)?' · Lecture périmée':''}</span>` : '';
    const priority=$('rafi-priority-filter').value, universe=$('rafi-universe-filter').value;
    const filtered=snapshot.decisions.filter(d=>(priority==='all'||d.priority===priority)&&(universe==='all'||d.universes.includes(universe)));
    set('rafi-plan-count',filtered.length+' décision(s) dans la fenêtre observée');
    const plan=filtered.filter(d=>d.decision_id!==top?.decision_id);
    $('rafi-plan').innerHTML=plan.length ? plan.slice(0,planLimit).map((d,index)=>`<article class="rafi-decision"><div class="rafi-order">${String(index+2).padStart(2,'0')}</div><div class="rafi-decision-main"><div class="rafi-decision-meta">${badge(d)}<span>${esc(d.universes.join(' / '))}</span></div><h3>${esc(d.title)}</h3><p>${esc(d.reason[0])}</p><small>${d.affected_count} objet(s) · ${esc(age(d.age_minutes))} · ${esc(d.authority)}</small></div>${button(d.decision_id,'Examiner →')}</article>`).join('')+(plan.length>planLimit?'<button class="btn" data-rafi-plan-more>Afficher les décisions suivantes</button>':'') : `<div class="empty">${top && filtered.length?'La priorité principale est affichée ci-dessus.':'Aucune autre décision ne correspond à ces filtres.'}</div>`;
    const network=snapshot.decisions.filter(d=>['network.verify','network.activate','network.coverage'].includes(d.decision_type)).slice(0,6);
    $('rafi-network-plan').innerHTML=network.length?network.map(d=>`<button class="rafi-network-item" data-rafi-decision="${esc(d.decision_id)}">${badge(d)}<b>${esc(d.title)}</b><span>${esc(d.recommended_action.text)}</span></button>`).join(''):'<div class="empty">Aucune activation déclenchée par les données réseau disponibles.</div>';
    const notice=$('rafi-notice');notice.hidden=state==='FRESH';notice.textContent=state==='STALE'?'Lecture périmée : actualisez avant de préparer une action.':state==='UNAVAILABLE'?'Sources indisponibles : aucune priorité globale ne peut être conclue.':'Lecture partielle : les décisions visibles reposent sur les observations disponibles ; des dossiers peuvent manquer.';
    renderTower();
  }

  function renderTower() {
    if (!snapshot || !$('overview-signals')) return;
    const state=snapshotState(), freshness=state==='STALE'?'Lecture périmée · ':'';
    const groups=[['NOW','À traiter',d=>d.priority==='P0'||d.priority==='P1'],['RISK','Risque',d=>d.decision_type.includes('sla')||d.decision_type.includes('inconsistent')||d.decision_type.includes('failed')],['CAPACITY','Capacité',d=>d.decision_type.includes('capacity')],['TRUST','Confiance',d=>d.universes.includes('TRUST')],['COVERAGE','Couverture',d=>d.decision_type==='network.coverage']];
    $('overview-signals').innerHTML=groups.map(([tag,title,predicate])=>{const matches=snapshot.decisions.filter(predicate);return `<button class="signal" data-view="rafi"><small>${tag} · ${esc(title)}</small><b>${matches.length || '—'}</b><p>${freshness}${matches[0]?esc(matches[0].title):state==='FRESH'?'Aucune décision déclenchée.':'Aucun signal visible · lecture incomplète.'}</p></button>`;}).join('');
    $('overview-priority').innerHTML=snapshot.decisions.slice(0,4).map(d=>`<button class="row" data-rafi-decision="${esc(d.decision_id)}"><b>${esc(d.title)}</b><small>${freshness}${esc(d.reason[0])}</small>${badge(d)}</button>`).join('')||'<div class="empty">'+(state==='FRESH'?'Aucune priorité RAFI détectée.':freshness+'Priorités inconnues sur les sources indisponibles.')+'</div>';
  }

  async function load() {
    if (flight) return flight;
    const classification=$('rafi-classification')?.value||'all';
    set('rafi-refresh-label','Lecture…');
    flight=root.FixeoControl.request('decisions',{classification})
      .then(data=>{if(classification!==($('rafi-classification')?.value||'all'))return;snapshot=data;render();})
      .catch(error=>{
        if (error.message==='FORBIDDEN'||error.message==='AUTH_REQUIRED'||error.message==='SESSION_REQUIRED') {snapshot=null;closeDrawer();clearContext();render();$('overview-priority').innerHTML='';$('overview-signals').innerHTML='';}
        else if(snapshot) snapshot={...snapshot,status:'STALE'};
        set('rafi-state',snapshot?'STALE':'UNAVAILABLE');
        $('rafi-notice').hidden=false;$('rafi-notice').textContent='Lecture impossible · '+error.message;
        if(snapshot)render();else{set('rafi-brief','Sources indisponibles');$('rafi-plan').innerHTML='<div class="empty">Aucune décision ne peut être affichée.</div>';$('rafi-actions').innerHTML='';$('rafi-network-plan').innerHTML='';}
      }).finally(()=>{flight=null;set('rafi-refresh-label','Actualiser');if(classification!==($('rafi-classification')?.value||'all'))load();});
    return flight;
  }

  const openDrawer=(title,sub)=>root.FixeoDossier.openShell(title,sub);
  const closeDrawer=()=>root.FixeoDossier.close();
  const relation=(type,id,label)=>`<button class="btn rafi-relation" data-rafi-dossier="${esc(type)}" data-id="${esc(id)}">${esc(label||type+' · '+id.slice(0,8))} →</button>`;
  function explain(d) {
    const evidence=d.evidence[0];
    return `<div class="rafi-explain">${stale(d)?'<p class="error">STALE · recommandation datée ; relire les sources avant décision.</p>':''}${badge(d)}<h3>Pourquoi maintenant</h3><ul>${d.reason.map(r=>'<li>'+esc(r)+'</li>').join('')}</ul><h3>Impact potentiel <small>INFÉRENCE</small></h3><p>${esc(d.impact.text)}</p><h3>Action recommandée</h3><p>${esc(d.recommended_action.text)}</p><h3>Autorité / parcours</h3><p>${esc(d.authority)}${d.actionability.capability?" · "+esc(d.actionability.capability):""}</p><p>${esc(d.actionability.rpc)}</p><details><summary>Voir les preuves · FAITS</summary><p>${d.affected_count} objet(s) concernés · ${esc(date(evidence.as_of))}</p><p>${esc(evidence.reference)}</p><p>Périmètre : ${esc(evidence.scope.classification)} · ${esc(d.city||'ville non renseignée')} · ${esc(d.service_category||'métier non renseigné')}</p><p>Règle ${esc(d.decision_type)} / ${esc(d.rule_version)} · ${esc(evidence.source_window)}</p>${evidence.sample_ids.length?'<p>Références échantillonnées :</p>'+evidence.sample_ids.map(id=>relation('request',id)).join(''):''}</details></div>`;
  }
  async function openDecision(id) {
    const d=decision(id);if(!d)return;
    if(d.target_id && d.target_type!=='cohort')return openDossier(d.target_type,d.target_id,d);
    openDrawer(d.title,'Décision RAFI · '+d.decision_id);$('drawer-summary').innerHTML=explain(d);
    $('drawer-actions').innerHTML=`<p>ACTION DISPONIBLE · ouvrir le contexte</p><button class="btn primary" data-rafi-context="${esc(id)}">Ouvrir ${d.recommended_action.context.view==='intelligence'?'Marketplace Intelligence':d.recommended_action.context.view==='network'?'Network 360':'Operations'} filtré</button>`;
    if(d.actionability.unavailable_reason)$('drawer-actions').insertAdjacentHTML('beforeend','<p>ACTION MÉTIER NON DISPONIBLE · '+esc(d.actionability.unavailable_reason)+'</p>');
    $('drawer-relations').innerHTML=d.related_ids.map(id=>relation('artisan',id,'Profil prioritaire · '+id.slice(0,8))).join('');
  }

  const openDossier=(type,id,d=null)=>root.FixeoDossier.open(type,id,d?{decision:d,explanation:explain(d)}:null);

  async function openContext(id) {
    const d=decision(id);if(!d)return;activeContext={...d.recommended_action.context};contextCursor=null;contextRows=[];
    closeDrawer();root.FixeoAdmin.navigate(activeContext.view);
    if(activeContext.view==='intelligence'&&root.FixeoIntelligence){root.FixeoIntelligence.setContext({city:activeContext.city??'__unknown__',trade:activeContext.trade??'__unknown__',classification:activeContext.classification});return;}
    if(activeContext.view==='network'&&root.FixeoRegisters){root.FixeoRegisters.setContext('network',{...activeContext,type:'artisan'});return;}
    if(activeContext.view==='operations'&&root.FixeoOperations){root.FixeoOperations.setContext(activeContext);return;}
    await loadContext(false);
  }
  async function loadContext(more) {
    if(!activeContext)return;const ticket=++contextTicket,c={...activeContext};
    const view=c.view==='network'?'network':'operations';let panel=$('rafi-context-'+view);
    if(!panel){panel=document.createElement('div');panel.id='rafi-context-'+view;panel.className='card rafi-context';$('sec-'+view).prepend(panel);}
    panel.innerHTML='<p>Lecture du contexte RAFI…</p>';
    const body={city:c.city,trade:c.trade,classification:c.classification,after:more?contextCursor:null,limit:25};
    if(view==='network')body.state=c.state||'all';else{body.enterprise_id=c.enterprise_id;body.site_id=c.site_id;}
    try{const data=await root.FixeoControl.request(view==='network'?'network-context':'operations',body);if(ticket!==contextTicket)return;
      contextRows=more?[...contextRows,...data.items]:data.items;contextCursor=data.next_cursor;
      panel.innerHTML=`<div class="card-head"><div><span class="kicker">CONTEXTE RAFI</span><h2>${esc(c.city||'Toutes villes')} · ${esc(c.trade||'Tous métiers')}</h2><p>${esc(c.classification)}${c.state?' · '+esc(c.state):''}${c.enterprise_id?' · Enterprise '+esc(c.enterprise_id):''}${c.site_id?' · Site '+esc(c.site_id):''} · ${contextRows.length} objet(s) chargés</p></div><button class="btn" data-rafi-clear-context>Quitter le filtre</button></div><div class="list">`+contextRows.map(s=>relation(view==='network'?'artisan':'request',s.id,(s.name||s.service_category||'Dossier')+' · '+(s.city||'—')+' · '+(s.status||s.availability||''))).join('')+(contextRows.length?'':'<p>Aucun dossier ne correspond à ce contexte.</p>')+`</div>${data.has_more?'<button class="btn" data-rafi-more>Charger la suite</button>':''}`;
      // The filtered canonical context supersedes the broad legacy list while active.
      const list=$(view==='network'?'network-list':'operations-list');if(list)list.hidden=true;
    }catch(error){if(ticket===contextTicket)panel.innerHTML='<div class="error">Contexte indisponible · '+esc(error.message)+'</div><button class="btn" data-rafi-clear-context>Quitter le filtre</button>';}
  }
  function clearContext(){contextTicket++;activeContext=null;for(const v of ['network','operations'])$('rafi-context-'+v)?.remove();for(const id of ['network-list','operations-list'])if($(id))$(id).hidden=false;}

  document.addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.dataset.rafiDecision){event.stopImmediatePropagation();openDecision(b.dataset.rafiDecision);}
    else if(b.dataset.rafiDossier){event.stopImmediatePropagation();openDossier(b.dataset.rafiDossier,b.dataset.id);}
    else if(b.dataset.rafiContext){event.stopImmediatePropagation();openContext(b.dataset.rafiContext);}
    else if(b.hasAttribute('data-rafi-more'))loadContext(true);
    else if(b.hasAttribute('data-rafi-plan-more')){planLimit+=40;render();}
    else if(b.hasAttribute('data-rafi-clear-context'))clearContext();
    else if(b.id==='rafi-refresh')load();
  });
  document.addEventListener('change',event=>{if(['rafi-priority-filter','rafi-universe-filter'].includes(event.target.id)){planLimit=40;render();}if(event.target.id==='rafi-classification'){snapshot=null;planLimit=40;clearContext();render();load();}});
  setInterval(()=>{if(snapshot&&!document.hidden)render();},15000);
  root.FixeoRafi={load,render,renderTower,openDossier,openDecision,clearContext,decisionsFor:(type,id)=>snapshot?.decisions.filter(d=>d.target_type===type&&d.target_id===id)||[],explain};
})(window);
