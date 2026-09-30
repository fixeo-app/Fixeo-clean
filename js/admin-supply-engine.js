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
    var safety=q('supply-safety');if(!safety)return;
    safety.querySelectorAll('[data-national]').forEach(function(x){x.remove();});
    var r=n&&n.runtime||{},cells=n&&n.cells||[];
    safety.insertAdjacentHTML('beforeend',
      '<div data-national><span>MOTEUR NATIONAL</span><b>'+(r.orchestration_enabled?'ACTIF':'PRÊT · OFF')+' · '+(r.dry_run?'DRY-RUN':'LIVE')+'</b></div>'+
      '<div data-national><span>WHATSAPP PROVIDER</span><b>'+(n&&n.provider_status||'OFF')+' · '+num(cells.length)+' cellules prioritaires</b></div>');
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
      var data=await Promise.all([
        rpc('supply_admin_dashboard_v1'),
        rpc('supply_intelligence_v1',{p_limit:25}),
        rpc('supply_recruitment_candidates_v1',{p_city:state.selectedCity||null,p_service:state.selectedService||null,p_limit:30}),
        rpc('supply_admin_queue_v1',{p_limit:80}),
        rpc('supply_admin_campaigns_v1'),
        rpc('supply_admin_agents_v1'),
        rpc('supply_admin_events_v1',{p_limit:40}),
        rpc('supply_admin_funnel_v1'),
        rpc('supply_admin_recruitment_readiness_v1'),
        rpc('supply_admin_national_dashboard_v1')
      ]);
      state.last=data;
      renderDashboard(data[0]||{});
      renderCoverage(data[1]||[]);
      renderCandidates(data[2]||[]);
      renderQueue(data[3]||[]);
      renderCampaigns(data[4]||[]);
      renderAgents(data[5]||[]);
      renderEvents(data[6]||[]);
      renderReadiness(data[7]||{},data[8]||{});
      renderNational(data[9]||{});
      status('Supply Engine · données canoniques · '+new Date().toLocaleTimeString('fr-FR'),'success');
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

  document.addEventListener('submit',function(e){
    if(e.target&&e.target.id==='supply-campaign-form'){e.preventDefault();createCampaign(e.target);}
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
