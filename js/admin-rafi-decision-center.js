(function (root) {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {operations:'Operations',network:'Network',trust:'Trust',finance:'Finance',enterprise:'Enterprise'};
  const fields = {status:'État',request_status:'État demande',urgency:'Urgence',city:'Ville',service_category:'Métier',availability:'Disponibilité',claimed:'Revendiqué',verified:'Vérifié',has_owner:'Propriétaire présent',onboarding_completed:'Onboarding terminé',created_at:'Création',accepted_at:'Acceptation',started_at:'Démarrage',completed_at:'Fin',validated_at:'Validation',final_price:'Prix final',agreed_price:'Prix convenu',commission_amount:'Commission',confirmed_commission:'Reversements confirmés',review_status:'Revue',quote_version:'Version',proposed_price:'Prix proposé',amount:'Montant',currency:'Devise',version:'Version',proof_present:'Preuve enregistrée',services:'Métiers déclarés',cities:'Villes déclarées',data_classification:'Classification'};
  let snapshot = null, flight = null, currentDossier = null, drawerTicket = 0, contextTicket = 0, returnFocus = null;
  let activeContext = null, contextCursor = null, contextRows = [], actionBusy = false, planLimit = 40;
  const age = minutes => minutes == null ? 'Ancienneté inconnue' : minutes < 60 ? minutes+' min' : minutes < 1440 ? Math.floor(minutes/60)+' h' : Math.floor(minutes/1440)+' j';
  const date = value => value ? new Date(value).toLocaleString('fr-FR') : 'Non renseigné';
  const stale = d => !d || Date.parse(d.expires_at) <= Date.now() || snapshot?.status === 'STALE';
  const decision = id => snapshot?.decisions.find(d => d.decision_id === id);
  const set = (id, text) => {if ($(id)) $(id).textContent = text;};
  const button = (id, label, cls='') => `<button class="btn ${cls}" data-rafi-decision="${esc(id)}">${esc(label)}</button>`;
  const badge = d => `<span class="rafi-priority ${d.priority.toLowerCase()}">${esc(d.priority)} · ${esc(d.priority_label)}</span>`;

  function render() {
    if (!$('rafi-plan')) return;
    if (!snapshot) {set('rafi-brief','Lecture des sources canoniques…');set('rafi-next','Les priorités apparaîtront dès que les sources auront répondu.');for(const id of ['rafi-actions','rafi-plan','rafi-network-plan','rafi-top-priority','rafi-sources'])$(id).innerHTML='';set('rafi-top-impact','');return;}
    const expired = snapshot.decisions.some(stale);
    const state = expired ? 'STALE' : snapshot.status;
    set('rafi-state',state);$('rafi-state').dataset.state=state;
    set('rafi-as-of','Observé le '+date(snapshot.generated_at));
    $('rafi-sources').innerHTML=Object.entries(snapshot.sources).map(([source,s])=>`<span class="rafi-source" data-state="${esc(s.status)}" title="${esc(s.error || (s.total_observations==null?'Source indisponible':s.returned_observations+' / '+s.total_observations+' observations'))}">${esc(labels[source])}<b>${esc(s.status)}</b></span>`).join('');
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
    const groups=[['NOW','À traiter',d=>d.priority==='P0'||d.priority==='P1'],['RISK','Risque',d=>d.decision_type.includes('sla')||d.decision_type.includes('inconsistent')||d.decision_type.includes('failed')],['CAPACITY','Capacité',d=>d.decision_type.includes('capacity')],['TRUST','Confiance',d=>d.universes.includes('TRUST')],['COVERAGE','Couverture',d=>d.decision_type==='network.coverage']];
    $('overview-signals').innerHTML=groups.map(([tag,title,predicate])=>{const matches=snapshot.decisions.filter(predicate);return `<button class="signal" data-view="rafi"><small>${tag} · ${esc(title)}</small><b>${matches.length || '—'}</b><p>${matches[0]?esc(matches[0].title):snapshot.status==='FRESH'?'Aucune décision déclenchée.':'Aucun signal visible · lecture partielle.'}</p></button>`;}).join('');
    $('overview-priority').innerHTML=snapshot.decisions.slice(0,4).map(d=>`<button class="row" data-rafi-decision="${esc(d.decision_id)}"><b>${esc(d.title)}</b><small>${esc(d.reason[0])}</small>${badge(d)}</button>`).join('')||'<div class="empty">'+(snapshot.status==='FRESH'?'Aucune priorité RAFI détectée.':'Priorités inconnues sur les sources indisponibles.')+'</div>';
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

  function openDrawer(title,sub) {
    returnFocus=document.activeElement;set('drawer-title',title);set('drawer-sub',sub);
    for(const id of ['drawer-summary','drawer-facts','drawer-relations','drawer-actions'])$(id).innerHTML='';
    $('drawer').classList.add('open');$('drawer').setAttribute('role','dialog');$('drawer').setAttribute('aria-labelledby','drawer-title');$('drawer-close').setAttribute('aria-label','Fermer le dossier');$('drawer-close').focus();
  }
  function closeDrawer(){drawerTicket++;$('drawer').classList.remove('open');currentDossier=null;returnFocus?.focus();}
  const relation=(type,id,label)=>`<button class="btn rafi-relation" data-rafi-dossier="${esc(type)}" data-id="${esc(id)}">${esc(label||type+' · '+id.slice(0,8))} →</button>`;
  function explain(d) {
    const evidence=d.evidence[0];
    return `<div class="rafi-explain">${badge(d)}<h3>Pourquoi maintenant</h3><ul>${d.reason.map(r=>'<li>'+esc(r)+'</li>').join('')}</ul><h3>Impact potentiel <small>INFÉRENCE</small></h3><p>${esc(d.impact.text)}</p><h3>Action recommandée</h3><p>${esc(d.recommended_action.text)}</p><h3>Autorité / parcours</h3><p>${esc(d.authority)}${d.actionability.capability?" · "+esc(d.actionability.capability):""}</p><p>${esc(d.actionability.rpc)}</p><details><summary>Voir les preuves · FAITS</summary><p>${d.affected_count} objet(s) concernés · ${esc(date(evidence.as_of))}</p><p>${esc(evidence.reference)}</p><p>Périmètre : ${esc(evidence.scope.classification)} · ${esc(d.city||'ville non renseignée')} · ${esc(d.service_category||'métier non renseigné')}</p><p>Règle ${esc(d.decision_type)} / ${esc(d.rule_version)} · ${esc(evidence.source_window)}</p>${evidence.sample_ids.length?'<p>Références échantillonnées :</p>'+evidence.sample_ids.map(id=>relation('request',id)).join(''):''}</details></div>`;
  }
  async function openDecision(id) {
    const d=decision(id);if(!d)return;
    if(d.target_id && d.target_type!=='cohort')return openDossier(d.target_type,d.target_id,d);
    openDrawer(d.title,'Décision RAFI · '+d.decision_id);$('drawer-summary').innerHTML=explain(d);
    $('drawer-actions').innerHTML=`<p>ACTION DISPONIBLE · ouvrir le contexte</p><button class="btn primary" data-rafi-context="${esc(id)}">Ouvrir ${d.recommended_action.context.view==='network'?'Network 360':'Operations'} filtré</button>`;
    if(d.actionability.unavailable_reason)$('drawer-actions').insertAdjacentHTML('beforeend','<p>ACTION MÉTIER NON DISPONIBLE · '+esc(d.actionability.unavailable_reason)+'</p>');
    $('drawer-relations').innerHTML=d.related_ids.map(id=>relation('artisan',id,'Profil prioritaire · '+id.slice(0,8))).join('');
  }

  async function openDossier(type,id,d=null) {
    const ticket=++drawerTicket;currentDossier=null;openDrawer(d?.title||'Dossier '+type,type.toUpperCase()+' · '+id);
    $('drawer-summary').innerHTML='<p>Lecture du dossier canonique…</p>';
    try {
      const dossier=await root.FixeoControl.request('dossier',{type,id});if(ticket!==drawerTicket)return;
      currentDossier=dossier;const s=dossier.summary;
      $('drawer-summary').innerHTML=(d?explain(d):`<b>${esc(s.name||s.service_category||type)}</b><p>${esc(s.status||s.availability||'État du profil')} · Observé ${esc(date(dossier.as_of))}</p>`);
      $('drawer-facts').innerHTML=Object.entries(fields).filter(([key])=>Object.hasOwn(s,key)).map(([key,label])=>`<div class="fact"><span>${label}</span><b>${s[key]===null?'Non renseigné':esc(Array.isArray(s[key])?s[key].join(', '):typeof s[key]==='boolean'?(s[key]?'Oui':'Non'):s[key])}</b></div>`).join('');
      if(dossier.enterprise_context)$('drawer-facts').insertAdjacentHTML('beforeend',`<div class="fact"><span>Contexte Enterprise / site</span><b>${esc(dossier.enterprise_context.enterprise_id)}<br>${esc(dossier.enterprise_context.site_id)}</b></div><div class="fact"><span>SLA d’acceptation</span><b>${esc(dossier.enterprise_context.sla?.acceptance_status||'Non configuré')}</b></div>`);
      $('drawer-relations').innerHTML=dossier.relations.map(r=>relation(r.type,r.id)).join('')+(dossier.relations_has_more?'<p>50 relations affichées ; d’autres relations existent.</p>':'')+'<h3>Suivi / audit</h3>'+(dossier.timeline.length?dossier.timeline.map(e=>`<div class="rafi-event"><b>${esc(e.action)} · ${esc(e.result)}</b><small>${esc(date(e.occurred_at))} · ${esc(e.authority)}</small><span>Audit ${esc(e.id)}</span></div>`).join(''):'<p>Aucun événement d’audit disponible dans cette fenêtre.</p>')+(dossier.timeline_has_more?'<p>50 derniers événements affichés.</p>':'');
      renderActions(dossier,d);
    } catch(error){if(ticket===drawerTicket)$('drawer-summary').innerHTML='<div class="error">Dossier indisponible · '+esc(error.message)+'</div>';}
  }

  function renderActions(dossier,d) {
    const s=dossier.summary, type=dossier.entity_type, controls=[];
    const action=(cap,label)=>`<button class="btn" data-rafi-prepare="${esc(cap)}">${esc(label)}</button>`;
    if(type==='request'&&s.status==='new'&&!dossier.enterprise_context)controls.push(action('request.dispatch','Préparer le dispatch'));
    if(type==='artisan'&&s.verified!==true&&s.claimed&&s.has_owner&&s.onboarding_completed)controls.push(action('artisan.verify','Préparer la vérification'));
    if(type==='claim'&&s.status==='pending')controls.push(action('claim.approve','Préparer l’approbation'),action('claim.reject','Préparer le refus'));
    if(type==='quote'&&s.review_status==='submitted')controls.push(action('quote.approve','Préparer l’approbation'),action('quote.reject','Préparer le refus'));
    if(type==='mission'&&s.final_price===null&&((s.status==='done'&&['completed','validated'].includes(s.request_status))||(s.status==='validated'&&s.request_status==='validated'&&s.completed_at)))controls.push(action('mission.settle','Préparer le prix final'));
    if(type==='remittance'&&s.status==='declared'&&s.proof_present)controls.push(action('finance.confirm','Préparer le rapprochement'));
    $('drawer-actions').innerHTML=`<div class="rafi-action-contract"><b>${controls.length?'ACTION DISPONIBLE · préparation':'ACTION MÉTIER NON DISPONIBLE'}</b><p>${controls.length?'Préconditions relues par le serveur ; confirmation Admin obligatoire avant exécution.':esc(d?.actionability.unavailable_reason||'Aucune commande applicable à cet état depuis RAFI.')}</p></div>`+controls.join('')+'<div id="rafi-action-form"></div><div id="rafi-action-result" role="status" aria-live="polite"></div>';
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
    if(capability==='mission.settle')input='<label>Prix final vérifié (MAD)<input class="control" name="final_price" type="number" min="0.01" step="0.01" required></label>';
    form.innerHTML=`<form id="rafi-prepare-form" data-capability="${esc(capability)}"><p>Autorité / commande : ${esc(capability)}</p>${input}<label>Motif de la revue<textarea class="control" name="reason" minlength="3" maxlength="500" required placeholder="Éléments vérifiés par l’opérateur"></textarea></label>${capability==='finance.confirm'?'<label><input type="checkbox" name="proof_reviewed" required> J’ai examiné la preuve documentaire du reversement.</label>':''}<button class="btn primary" type="submit">Vérifier les préconditions et voir l’aperçu</button></form>`;
  }
  async function executeForm(form) {
    if(actionBusy||!currentDossier)return;
    const d=currentDossier,capability=form.dataset.capability,s=d.summary,values=new FormData(form),payload={reason:values.get('reason')};
    let target=d.id;
    if(capability==='request.dispatch')payload.artisan_id=values.get('artisan_id');
    if(capability.startsWith('quote.'))payload.version=s.quote_version;
    if(capability==='mission.settle'){payload.final_price=Number(values.get('final_price'));payload.expected_final_price=s.final_price;}
    if(capability==='finance.confirm'){target=s.mission_id;payload.remittance_id=d.id;payload.version=s.version;}
    actionBusy=true;for(const b of form.querySelectorAll('button,input,select,textarea'))b.disabled=true;
    try {
      const result=await root.FixeoControl.command(capability,target,payload);
      if(result.cancelled){set('rafi-action-result','Action annulée avant exécution.');return;}
      if(!result.ok||!result.audit_id||!result.correlation_id||!result.idempotency_key||result.verified?.id!==target)throw Error('RESULT_NOT_VERIFIED');
      await openDossier(d.entity_type,d.id);
      set('rafi-action-result','Résultat vérifié · audit '+result.audit_id+' · corrélation '+result.correlation_id+' · idempotence '+result.idempotency_key);
      await load();
    } catch(error){set('rafi-action-result','Action non confirmée · '+error.message+' · Relisez le dossier avant de réessayer.');}
    finally{actionBusy=false;for(const b of form.querySelectorAll('button,input,select,textarea'))b.disabled=false;}
  }

  async function openContext(id) {
    const d=decision(id);if(!d)return;activeContext={...d.recommended_action.context};contextCursor=null;contextRows=[];
    closeDrawer();root.FixeoAdmin.navigate(activeContext.view);await loadContext(false);
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
    else if(b.dataset.rafiPrepare){event.stopImmediatePropagation();prepare(b.dataset.rafiPrepare);}
    else if(b.hasAttribute('data-rafi-more'))loadContext(true);
    else if(b.hasAttribute('data-rafi-plan-more')){planLimit+=40;render();}
    else if(b.hasAttribute('data-rafi-clear-context'))clearContext();
    else if(b.id==='rafi-refresh')load();
    else if(b.id==='drawer-close')closeDrawer();
  });
  document.addEventListener('submit',event=>{if(event.target.id==='rafi-prepare-form'){event.preventDefault();executeForm(event.target);}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('drawer')?.classList.contains('open'))closeDrawer();});
  document.addEventListener('change',event=>{if(['rafi-priority-filter','rafi-universe-filter'].includes(event.target.id)){planLimit=40;render();}if(event.target.id==='rafi-classification'){snapshot=null;planLimit=40;clearContext();render();load();}});
  setInterval(()=>{if(snapshot&&!document.hidden)render();},15000);
  root.FixeoRafi={load,render,renderTower,openDossier,openDecision,clearContext};
})(window);
