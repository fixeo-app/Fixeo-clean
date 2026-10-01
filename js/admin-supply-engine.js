(function(root){
  'use strict';

  var state={loading:false,selectedCity:'',selectedService:'',last:null};
  function q(id){return document.getElementById(id);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);});}
  function num(v){return Number(v||0).toLocaleString('fr-FR');}
  function moneyMinor(v){return (Number(v||0)/100).toLocaleString('fr-FR',{style:'currency',currency:'MAD',maximumFractionDigits:2});}
  function set(id,v){var e=q(id);if(e)e.textContent=v;}
  async function client(){
    if(!root.FixeoSupabaseClient)throw new Error('SUPABASE_UNAVAILABLE');
    var ready=await root.FixeoSupabaseClient.ready();
    return ready&&ready.client?ready.client:root.FixeoSupabaseClient.client;
  }
  async function rpc(name,args){
    var c=await client(),r=await c.rpc(name,args||{});
    if(!r||r.error)throw new Error((r&&r.error&&r.error.message)||name+'_FAILED');
    return r.data;
  }
  function status(text,tone){
    var e=q('supply-state');if(!e)return;
    e.textContent=text||'';e.dataset.tone=tone||'';
  }
  function tone(stage){
    if(stage==='ACTIVATED')return 'good';
    if(stage==='VERIFIED'||stage==='ONBOARDED'||stage==='CLAIMED')return 'info';
    if(stage==='ENGAGED'||stage==='CLAIM_IN_PROGRESS')return 'warn';
    return '';
  }
  function renderDashboard(d){
    var s=d&&d.summary||{},a=d&&d.agents||{},ch=d&&d.channel||{},eco=d&&d.economics||{};
    set('s-referenced',num(s.referenced));
    set('s-contactable',num(s.contactable));
    set('s-activated',num(s.activated));
    set('s-capacity',num(s.operational_capacity_proven));
    set('s-claimable',num(s.claimable_unowned));
    set('s-ai-spend',moneyMinor(a.ai_spend_today));
    set('s-channel-spend',moneyMinor(eco.channel_cost_minor));
    set('s-total-spend',moneyMinor(eco.total_cost_minor));
    set('s-model-calls',num(a.model_calls_today));
    set('s-outbox-ready',num(ch.ready));
    set('s-agents-active',num(a.agents_active));
    var safety=q('supply-safety');
    if(safety)safety.innerHTML=
      '<div><span>AGENTS</span><b>'+(a.global_kill_switch?'STOP GLOBAL':'Prêts · '+num(a.agents_active)+' actifs')+'</b></div>'+
      '<div><span>BUDGET IA / JOUR</span><b>'+moneyMinor(a.daily_ai_budget_minor)+'</b></div>'+
      '<div><span>RÈGLE CAPACITÉ</span><b>Disponibilité déclarée ≠ capacité</b></div>'+
      '<div><span>COÛT / ACTIVÉ</span><b>'+(eco.cost_per_activated==null?'—':moneyMinor(eco.cost_per_activated))+'</b></div>';
  }
  function renderReadiness(funnel,ready){
    var safety=q('supply-safety');if(!safety)return;
    var existing=safety.querySelectorAll('[data-b8]');existing.forEach(function(n){n.remove();});
    safety.insertAdjacentHTML('beforeend',
      '<div data-b8><span>PIPELINE RECRUTEMENT</span><b>'+num(funnel&&funnel.contacted)+' contactés · '+num(funnel&&funnel.engaged)+' engagés · '+num(funnel&&funnel.activated)+' activés</b></div>'+
      '<div data-b8><span>BASE EXISTANTE ACTIVABLE</span><b>'+num(ready&&ready.existing_base_ready)+' profils · Agent '+(ready&&ready.active_agents?'ACTIF':'EN PAUSE')+'</b></div>');
  }
  function renderNational(n){
    var safety=q('supply-safety'),r=n&&n.runtime||{},cells=n&&n.cells||[],cy=n&&n.last_cycle||null;
    if(safety){
      safety.querySelectorAll('[data-national]').forEach(function(x){x.remove();});
      safety.insertAdjacentHTML('beforeend',
        '<div data-national><span>MOTEUR NATIONAL</span><b>'+(r.orchestration_enabled?'ACTIF':'PRÊT · OFF')+' · '+(r.dry_run?'DRY-RUN':'LIVE')+'</b></div>'+
        '<div data-national><span>WHATSAPP PROVIDER</span><b>'+(n&&n.provider_status||'OFF')+' · '+num(cells.length)+' cellules prioritaires</b></div>');
    }
    var mode=q('s-national-mode');if(mode){mode.textContent=(r.orchestration_enabled?'ACTIF':'OFF')+' · '+(r.dry_run?'DRY-RUN':'LIVE')+' · PROVIDER '+(n&&n.provider_status||'OFF');mode.className='pill '+(r.dry_run?'info':'warn');}
    set('s-national-cells',num(cells.length));
    var planned=cy&&cy.candidates_planned!=null?cy.candidates_planned:cells.reduce(function(a,x){return a+Math.min(Number(x.recruitment_pool||0),Number(r.max_candidates_per_cell||20));},0);
    set('s-national-candidates',num(planned));
    set('s-national-zero',num(cells.filter(function(x){return Number(x.recruitment_pool||0)===0;}).length));
    var cycleLabel='Pas encore';
    if(cy){cycleLabel=(cy.status==='SUCCEEDED'?'Cycle réussi':cy.status==='FAILED'?'Cycle échoué':cy.status)+' · '+(cy.mode==='DRY_RUN'?'Simulation':cy.mode==='LIVE'?'Réel':(cy.mode||''));}
    set('s-national-cycle',cycleLabel);
    var e=q('supply-national-plan');if(!e)return;
    e.innerHTML=cells.length?cells.map(function(x,i){
      var zero=Number(x.recruitment_pool||0)===0,target=Math.min(Number(x.recruitment_pool||0),Number(r.max_candidates_per_cell||20));
      return '<button class="supply-row supply-national-cell" data-supply-city="'+esc(x.city)+'" data-supply-service="'+esc(x.service_category)+'">'+
        '<div><b>#'+(i+1)+' · '+esc(x.city)+' · '+esc(x.service_category)+'</b><small>'+num(x.demand_open)+' demande(s) ouverte(s) · capacité prouvée '+num(x.operational_capacity_proven)+' · '+(zero?'RECHERCHE EXTERNE NÉCESSAIRE':'POOL EXISTANT · cible '+num(target)+' artisan(s)')+'</small></div>'+
        '<div class="supply-cell-flags"><span class="pill '+(zero?'danger':'good')+'">'+(zero?'EXTERNE':'POOL')+'</span><span class="pill '+(x.recruitment_priority>=500?'warn':'info')+'">P'+num(x.recruitment_priority)+'</span></div></button>';
    }).join(''):'<div class="empty">Aucune cellule nationale prioritaire.</div>';
  }
  function renderCoverage(rows){
    var e=q('supply-gaps');if(!e)return;
    e.innerHTML=(rows||[]).length?(rows||[]).map(function(x){
      return '<button class="supply-row supply-gap" data-supply-city="'+esc(x.city)+'" data-supply-service="'+esc(x.service_category)+'">'+
        '<div><b>'+esc(x.city)+' · '+esc(x.service_category)+'</b><small>'+num(x.demand_open)+' demande(s) ouverte(s) · '+num(x.recruitment_pool)+' profils activables</small></div>'+
        '<span class="pill '+(x.coverage_status==='GAP'?'danger':x.coverage_status==='THIN'?'warn':'good')+'">'+esc(x.coverage_status)+' · '+num(x.recruitment_priority)+'</span></button>';
    }).join(''):'<div class="empty">Aucun trou de couverture prioritaire calculé.</div>';
  }
  function renderCandidates(rows){
    var e=q('supply-candidates');if(!e)return;
    var ctx=q('supply-candidate-context');
    if(ctx)ctx.textContent=(state.selectedCity||state.selectedService)?('Priorité · '+(state.selectedCity||'Toutes villes')+' · '+(state.selectedService||'Tous métiers')):'Meilleurs profils contactables du réseau';
    e.innerHTML=(rows||[]).length?(rows||[]).map(function(x){
      return '<article class="supply-row supply-candidate">'+
        '<div><b>#'+esc(x.rank)+' · '+esc(x.artisan_name)+'</b><small>'+esc(x.city||'Ville inconnue')+' · '+esc(x.service_category||'Métier inconnu')+' · '+esc(x.lifecycle_stage)+'</small></div>'+
        '<div class="supply-row-actions"><span class="pill '+tone(x.lifecycle_stage)+'">score '+esc(x.score)+'</span>'+
        '<button class="btn" data-supply-copy="'+esc(x.claim_path)+'">Copier lien claim</button>'+
        '<button class="btn" data-supply-dossier="'+esc(x.artisan_id)+'">Dossier</button></div></article>';
    }).join(''):'<div class="empty">Aucun profil contactable pour ce filtre.</div>';
  }
  function renderQueue(rows){
    var e=q('supply-queue');if(!e)return;
    e.innerHTML=(rows||[]).length?(rows||[]).map(function(x){
      return '<article class="supply-row"><div><b>'+esc(x.artisan_name)+'</b><small>'+esc(x.task_type)+' · '+esc(x.city||'')+' · '+esc(x.service_category||'')+'</small></div>'+
        '<span class="pill '+(x.status==='HUMAN_REVIEW'?'warn':x.status==='QUEUED'?'info':'')+'">'+esc(x.status)+' · P'+esc(x.priority)+'</span></article>';
    }).join(''):'<div class="empty">Aucune tâche Supply en file.</div>';
  }
  function renderCampaigns(rows){
    var e=q('supply-campaigns');if(!e)return;
    e.innerHTML=(rows||[]).length?(rows||[]).map(function(x){
      var actions='';
      if(x.status==='DRAFT'||x.status==='PAUSED')actions+='<button class="btn primary" data-supply-activate="'+esc(x.campaign_id)+'">Activer</button>';
      if(x.status==='ACTIVE'&&!x.kill_switch)actions+='<button class="btn" data-supply-enqueue="'+esc(x.campaign_id)+'">Préparer 30 tâches</button><button class="btn" data-supply-pause="'+esc(x.campaign_id)+'">Pause</button>';
      return '<article class="supply-row"><div><b>'+esc(x.name)+'</b><small>'+esc(x.city||'Toutes villes')+' · '+esc(x.service_category||'Tous métiers')+' · '+esc(x.preferred_channel)+' · '+num(x.contacted)+' contacté(s)</small></div>'+
        '<div class="supply-row-actions"><span class="pill '+(x.status==='ACTIVE'?'good':x.status==='PAUSED'?'warn':'')+'">'+esc(x.status)+'</span>'+actions+'</div></article>';
    }).join(''):'<div class="empty">Aucune campagne. Créez une campagne bornée pour commencer.</div>';
  }
  function renderAgents(rows){
    var e=q('supply-agents');if(!e)return;
    e.innerHTML=(rows||[]).length?(rows||[]).map(function(x){
      return '<article class="supply-row"><div><b>'+esc(x.name)+'</b><small>'+esc(x.agent_type)+' · '+esc(x.version)+' · '+esc(x.model_tier)+'</small></div>'+
        '<span class="pill '+(x.status==='ACTIVE'&&!x.kill_switch?'good':x.kill_switch?'danger':'')+'">'+esc(x.kill_switch?'KILL SWITCH':x.status)+' · '+moneyMinor(x.spend_today)+'</span></article>';
    }).join(''):'<div class="empty">Aucun agent enregistré. Le moteur fonctionne actuellement en mode déterministe.</div>';
  }
  function renderEvents(rows){
    var e=q('supply-events');if(!e)return;
    e.innerHTML=(rows||[]).length?(rows||[]).slice(0,20).map(function(x){
      return '<article class="supply-row"><div><b>'+esc(x.artisan_name)+'</b><small>'+esc(x.event_type)+' · '+esc(x.evidence_class)+' · '+new Date(x.created_at).toLocaleString('fr-FR')+'</small></div>'+
        '<span class="pill '+tone(x.to_stage)+'">'+esc(x.to_stage||x.from_stage||'EVENT')+'</span></article>';
    }).join(''):'<div class="empty">Aucun événement Supply enregistré.</div>';
  }
  var SUPPLY_READ_CONCURRENCY=4;
  async function settleBounded(jobs,limit){
    var out=new Array(jobs.length),cursor=0,count=Math.max(1,Math.min(Number(limit)||1,jobs.length||1));
    async function worker(){
      while(true){
        var i=cursor++;
        if(i>=jobs.length)return;
        try{out[i]={status:'fulfilled',value:await jobs[i][1]()};}
        catch(error){out[i]={status:'rejected',reason:error};}
      }
    }
    await Promise.all(Array.from({length:count},function(){return worker();}));
    return out;
  }
  async function loadCandidates(){
    var rows=await rpc('supply_recruitment_candidates_v1',{
      p_city:state.selectedCity||null,p_service:state.selectedService||null,p_limit:30
    });
    renderCandidates(rows||[]);
  }
  async function refresh(force){
    if(state.loading&&!force)return;
    state.loading=true;status('Lecture du Supply Engine…','');
    try{
      var jobs=[
        ['dashboard',function(){return rpc('supply_admin_dashboard_v1');}],
        ['coverage',function(){return rpc('supply_intelligence_v1',{p_limit:25});}],
        ['candidates',function(){return rpc('supply_recruitment_candidates_v1',{p_city:state.selectedCity||null,p_service:state.selectedService||null,p_limit:30});}],
        ['queue',function(){return rpc('supply_admin_queue_v1',{p_limit:80});}],
        ['campaigns',function(){return rpc('supply_admin_campaigns_v1');}],
        ['agents',function(){return rpc('supply_admin_agents_v1');}],
        ['events',function(){return rpc('supply_admin_events_v1',{p_limit:40});}],
        ['funnel',function(){return rpc('supply_admin_funnel_v1');}],
        ['readiness',function(){return rpc('supply_admin_recruitment_readiness_v1');}],
        ['national',function(){return rpc('supply_admin_national_dashboard_v1');}]
      ];
      var settled=await settleBounded(jobs,SUPPLY_READ_CONCURRENCY);
      var data={},failed=[];
      settled.forEach(function(r,i){if(r.status==='fulfilled')data[jobs[i][0]]=r.value;else failed.push(jobs[i][0]);});
      state.last=data;
      if(data.dashboard)renderDashboard(data.dashboard);
      if(data.coverage)renderCoverage(data.coverage);
      if(data.candidates)renderCandidates(data.candidates);
      if(data.queue)renderQueue(data.queue);
      if(data.campaigns)renderCampaigns(data.campaigns);
      if(data.agents)renderAgents(data.agents);
      if(data.events)renderEvents(data.events);
      if(data.funnel||data.readiness)renderReadiness(data.funnel||{},data.readiness||{});
      if(data.national)renderNational(data.national);
      if(failed.length)status('Supply Engine · mode dégradé · '+failed.join(', ')+' indisponible(s)','warn');
      else status('Supply Engine · données canoniques · '+new Date().toLocaleTimeString('fr-FR'),'success');
    }catch(e){status('Supply Engine indisponible · '+(e&&e.message?e.message:'erreur'),'error');}
    finally{state.loading=false;}
  }
  async function createCampaign(form){
    var fd=new FormData(form),name=String(fd.get('name')||'').trim();
    if(!name){status('Nom de campagne requis.','error');return;}
    status('Création de la campagne…','');
    try{
      var out=await rpc('supply_create_campaign_v1',{
        p_name:name,p_city:String(fd.get('city')||'').trim()||null,
        p_service:String(fd.get('service')||'').trim()||null,
        p_channel:String(fd.get('channel')||'MANUAL'),
        p_daily_contact_limit:Number(fd.get('daily_limit'))||30,
        p_max_attempts:Number(fd.get('max_attempts'))||3,
        p_cooldown_hours:Number(fd.get('cooldown_hours'))||48,
        p_daily_ai_budget_minor:Math.max(0,Math.round((Number(fd.get('ai_budget_mad'))||0)*100))
      });
      if(!out||out.ok!==true)throw new Error(out&&out.reason||'CREATE_FAILED');
      form.reset();status('Campagne créée en brouillon. Activez-la lorsque vous êtes prêt.','success');await refresh(true);
    }catch(e){status('Création refusée · '+e.message,'error');}
  }
  async function mutateCampaign(id,action){
    if(!id)return;
    try{
      if(action==='activate'){
        await rpc('supply_set_campaign_status_v1',{p_campaign_id:id,p_status:'ACTIVE',p_kill_switch:false});
        status('Campagne activée. Aucun contact n’est envoyé automatiquement.','success');
      }else if(action==='pause'){
        await rpc('supply_set_campaign_status_v1',{p_campaign_id:id,p_status:'PAUSED',p_kill_switch:false});
        status('Campagne mise en pause.','success');
      }else if(action==='enqueue'){
        var out=await rpc('supply_enqueue_campaign_v1',{p_campaign_id:id,p_limit:30});
        status(num(out&&out.enqueued)+' tâche(s) déterministe(s) préparée(s).','success');
      }
      await refresh(true);
    }catch(e){status('Action campagne refusée · '+e.message,'error');}
  }

  async function xlsxRows(file){
    if(!root.XLSX){await new Promise(function(resolve,reject){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';s.onload=resolve;s.onerror=function(){reject(new Error('XLSX_LOADER_FAILED'));};document.head.appendChild(s);});}
    var wb=root.XLSX.read(await file.arrayBuffer(),{type:'array'}),name=wb.SheetNames[0];if(!name)throw new Error('XLSX_EMPTY');
    var data=root.XLSX.utils.sheet_to_json(wb.Sheets[name],{defval:'',raw:false});
    function pick(r,names){for(var i=0;i<names.length;i++){var want=names[i].toUpperCase();for(var k in r){if(String(k).trim().toUpperCase()===want)return String(r[k]||'').trim();}}return '';}
    return data.map(function(r,i){return {external_key:pick(r,['ID','EXTERNAL_KEY'])||('ROW-'+(i+2)),display_name:pick(r,['NOM_PROFESSIONNEL','NOM_COMMERCIAL','NOM']),city:pick(r,['VILLE','CITY']),service_category:pick(r,['METIER_PRINCIPAL','MÉTIER_PRINCIPAL','METIER','SERVICE_CATEGORY']),phone:pick(r,['TELEPHONE','TÉLÉPHONE','TELEPHONE_NORMALISE','TÉLÉPHONE_NORMALISÉ']),source_url:pick(r,['URL_SOURCE_1','SOURCE_URL','URL']),human_decision:pick(r,['STATUT_FINAL','STATUS','DECISION_FIXEO']),human_priority:pick(r,['PRIORITE_OUTREACH','PRIORITÉ_OUTREACH','PRIORITE'])};}).filter(function(x){return x.external_key;});
  }
  function csvRows(text){
    var lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).filter(function(x){return x.trim();});if(lines.length<2)throw new Error('CSV_EMPTY');
    function split(line){var out=[],cur='',q=false;for(var i=0;i<line.length;i++){var ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(ch===','&&!q){out.push(cur);cur='';}else cur+=ch;}out.push(cur);return out;}
    var h=split(lines[0]).map(function(x){return x.trim();}),idx={};h.forEach(function(x,i){idx[x.toUpperCase()]=i;});
    function v(a,n){var i=idx[n];return i==null?'':String(a[i]||'').trim();}
    return lines.slice(1).map(function(line){var a=split(line),status=v(a,'STATUT_FINAL')||v(a,'STATUS')||v(a,'DECISION_FIXEO');
      return {external_key:v(a,'ID'),display_name:v(a,'NOM_PROFESSIONNEL')||v(a,'NOM_COMMERCIAL'),city:v(a,'VILLE'),service_category:v(a,'METIER_PRINCIPAL'),phone:v(a,'TELEPHONE')||v(a,'TELEPHONE_NORMALISE'),source_url:v(a,'URL_SOURCE_1'),human_decision:status,human_priority:v(a,'PRIORITE_OUTREACH')};}).filter(function(x){return x.external_key;});
  }
  async function importExternal(form){
    var file=q('supply-import-file').files[0],st=q('supply-import-state');if(!file)throw new Error('FILE_REQUIRED');
    if(file.size>2*1024*1024)throw new Error('FILE_TOO_LARGE');var rows=/\.xlsx$/i.test(file.name)?await xlsxRows(file):csvRows(await file.text());if(rows.length>500)throw new Error('BATCH_TOO_LARGE');
    var submit=form.querySelector('button[type="submit"]'),original=submit?submit.textContent:'Analyser dans le staging';
    if(submit){submit.disabled=true;submit.setAttribute('aria-busy','true');submit.textContent='Analyse en cours…';}
    st.textContent='Analyse de '+rows.length+' ligne(s)… Ne recliquez pas.';
    try{
      var fd=new FormData(form),out=await rpc('supply_external_ingest_v1',{p_source:String(fd.get('source')||'GENSPARK_QUALIFICATION'),p_source_ref:file.name,p_city:String(fd.get('city')||'Fès'),p_rows:rows});
      if(!out||out.ok!==true)throw new Error(out&&out.reason||'INGEST_FAILED');
      var bench=await rpc('supply_external_benchmark_v1',{p_batch:out.batch_id});
      st.textContent=(out.reused?'Lot déjà analysé · résultat réutilisé · ':'Analyse terminée · ')+Number(bench.total||0)+' profils · '+Number(bench.agreement||0)+' accord(s) · '+Number(bench.divergence||0)+' divergence(s). Aucun artisan créé.';
    }finally{if(submit){submit.disabled=false;submit.removeAttribute('aria-busy');submit.textContent=original;}}
  }
  document.addEventListener('submit',function(e){
    if(e.target&&e.target.id==='supply-campaign-form'){e.preventDefault();createCampaign(e.target);return;}if(e.target&&e.target.id==='supply-import-form'){e.preventDefault();importExternal(e.target).catch(function(err){var st=q('supply-import-state');if(st)st.textContent='Import refusé · '+err.message;});}
  });
  document.addEventListener('click',function(e){
    var b=e.target.closest('button');if(!b)return;
    if(b.id==='supply-refresh'){refresh(true);return;}
    if(b.dataset.supplyCity!==undefined){
      state.selectedCity=b.dataset.supplyCity||'';state.selectedService=b.dataset.supplyService||'';loadCandidates();return;
    }
    if(b.dataset.supplyCopy){
      var url=new URL(b.dataset.supplyCopy,location.origin).href;
      navigator.clipboard&&navigator.clipboard.writeText(url).then(function(){b.textContent='Copié ✓';});
      return;
    }
    if(b.dataset.supplyDossier){
      if(root.FixeoDossier&&root.FixeoDossier.open)root.FixeoDossier.open('artisan',b.dataset.supplyDossier);
      return;
    }
    if(b.dataset.supplyActivate){mutateCampaign(b.dataset.supplyActivate,'activate');return;}
    if(b.dataset.supplyPause){mutateCampaign(b.dataset.supplyPause,'pause');return;}
    if(b.dataset.supplyEnqueue){mutateCampaign(b.dataset.supplyEnqueue,'enqueue');return;}
  });

  root.FixeoSupply=Object.freeze({refresh:refresh});
})(window);
