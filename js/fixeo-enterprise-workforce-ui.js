/* FIXEO Enterprise Block A — isolated Workforce/Hybrid Dispatch UI. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.FixeoEnterpriseWorkforceUI=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var MODE_LABELS={
    internal_only:'Interne uniquement',
    internal_first:'Interne puis externe',
    external_only:'Externe uniquement',
    hybrid:'Hybride simultané'
  };
  var AVAIL_LABELS={available:'Disponible',unavailable:'Indisponible',off_duty:'Hors service'};
  function mount(win,hooks){
    var d=win.document, by=id=>d.getElementById(id), model=null;
    var list=by('enterprise-workforce-list'),empty=by('enterprise-workforce-empty'),mode=by('enterprise-workforce-mode'),create=by('enterprise-workforce-create');
    var dlg=by('enterprise-workforce-dialog'),dlgTitle=by('enterprise-workforce-dialog-title'),close=by('enterprise-workforce-close'),cancel=by('enterprise-workforce-cancel'),form=by('enterprise-workforce-form');
    var wid=by('enterprise-workforce-id'),member=by('enterprise-workforce-member'),label=by('enterprise-workforce-label'),code=by('enterprise-workforce-code'),skills=by('enterprise-workforce-skills'),sites=by('enterprise-workforce-sites'),allSites=by('enterprise-workforce-all-sites'),capacity=by('enterprise-workforce-capacity'),status=by('enterprise-workforce-status'),error=by('enterprise-workforce-error'),submit=by('enterprise-workforce-submit');
    var pList=by('enterprise-dispatch-policy-list'),pEmpty=by('enterprise-dispatch-policy-empty'),pMode=by('enterprise-dispatch-policy-mode'),pCreate=by('enterprise-dispatch-policy-create');
    var pDlg=by('enterprise-dispatch-policy-dialog'),pTitle=by('enterprise-dispatch-policy-dialog-title'),pClose=by('enterprise-dispatch-policy-close'),pCancel=by('enterprise-dispatch-policy-cancel'),pForm=by('enterprise-dispatch-policy-form');
    var pId=by('enterprise-dispatch-policy-id'),pSite=by('enterprise-dispatch-policy-site'),pCat=by('enterprise-dispatch-policy-category'),pValue=by('enterprise-dispatch-policy-value'),pLimit=by('enterprise-dispatch-policy-limit'),pTtl=by('enterprise-dispatch-policy-ttl'),pFallback=by('enterprise-dispatch-policy-fallback'),pStatus=by('enterprise-dispatch-policy-status'),pError=by('enterprise-dispatch-policy-error'),pSubmit=by('enterprise-dispatch-policy-submit');
    var myModule=by('enterprise-my-workforce-module'),myStatus=by('enterprise-my-workforce-status'),myOffers=by('enterprise-my-workforce-offers'),myAssignments=by('enterprise-my-workforce-assignments');
    var assignDlg=by('enterprise-internal-assign-dialog'),assignClose=by('enterprise-internal-assign-close'),assignCancel=by('enterprise-internal-assign-cancel'),assignForm=by('enterprise-internal-assign-form'),assignRequest=by('enterprise-internal-assign-request'),assignWorker=by('enterprise-internal-assign-worker'),assignError=by('enterprise-internal-assign-error'),assignSubmit=by('enterprise-internal-assign-submit');
    var live=by('enterprise-hybrid-dispatch-live');

    function el(tag,cls,text){var n=d.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
    function actions(){return win.FixeoEnterpriseWorkforceActions;}
    function role(){return hooks.getRole();}
    function eid(){return hooks.getEnterpriseId();}
    function client(){return hooks.getClient();}
    function canManage(){return actions()&&actions().canManage(role());}
    function canOperate(){return actions()&&actions().canOperate(role());}
    function setErr(node,msg){node.textContent=msg||'';node.hidden=!msg;}
    async function refresh(){await hooks.refresh();}

    function siteName(id){
      var s=(model&&model.sites||[]).find(x=>x.id===id);
      return s?[s.name,s.city].filter(Boolean).join(' · '):'Site';
    }
    function memberName(id){
      var i=(model&&model.members||[]).findIndex(x=>x.id===id);
      return i>=0?'Membre • '+String(model.members[i].user_id||'').replace(/-/g,'').slice(-6):'Membre';
    }
    function workerById(id){return model&&model.workforce&&model.workforce.workers.find(x=>x.id===id);}
    function interventionById(id){return model&&model.interventions&&model.interventions.find(x=>x.id===id);}

    function parseSkills(value){
      var raw=String(value||'').trim();
      if(!raw)return[];
      return raw.split(',').map(part=>{
        var bits=part.trim().split(':');
        var cat=String(bits[0]||'').trim().toLowerCase(),lvl=Number(bits[1]||3);
        if(!cat||!Number.isInteger(lvl)||lvl<1||lvl>5)throw new Error('INVALID_SKILLS');
        return {service_category:cat,skill_level:lvl};
      });
    }
    function formatSkills(rows){return (rows||[]).map(x=>x.service_category+':'+x.skill_level).join(', ');}

    function populateMemberSelect(selected){
      member.replaceChildren();
      var used=new Set((model.workforce.workers||[]).filter(w=>w.id!==wid.value).map(w=>w.member_id));
      (model.members||[]).filter(m=>m.status==='active'&&!used.has(m.id)).forEach(m=>{
        var o=d.createElement('option');o.value=m.id;o.textContent=memberName(m.id);if(m.id===selected)o.selected=true;member.append(o);
      });
    }
    function populateSiteSelect(select,selectedIds,includeGlobal){
      select.replaceChildren();
      if(includeGlobal){var g=d.createElement('option');g.value='';g.textContent='Toute l’entreprise';select.append(g);}
      var set=new Set(selectedIds||[]);
      (model.sites||[]).forEach(s=>{
        var o=d.createElement('option');o.value=s.id;o.textContent=[s.name,s.city].filter(Boolean).join(' · ');o.selected=set.has(s.id);select.append(o);
      });
    }
    function openWorker(worker){
      if(!canManage())return;
      form.reset();setErr(error,'');wid.value=worker?worker.id:'';
      populateMemberSelect(worker&&worker.member_id||'');
      member.disabled=!!worker;
      label.value=worker?worker.display_label:'';
      code.value=worker?worker.employee_code:'';
      skills.value=worker?formatSkills(worker.skills):'';
      populateSiteSelect(sites,worker&&worker.site_ids||[],false);
      allSites.checked=!!(worker&&worker.all_sites);
      capacity.value=worker?String(worker.max_concurrent_jobs):'1';
      status.value=worker?worker.status:'active';
      dlgTitle.textContent=worker?'Modifier le technicien':'Ajouter un technicien';
      dlg.hidden=false;
    }
    function closeWorker(){dlg.hidden=true;member.disabled=false;setErr(error,'');}
    async function submitWorker(ev){
      ev.preventDefault();if(!canManage())return;submit.disabled=true;setErr(error,'');
      try{
        var workerId=wid.value;
        var payload={member_id:member.value,display_label:label.value,employee_code:code.value,all_sites:allSites.checked,max_concurrent_jobs:Number(capacity.value),status:status.value};
        var skillRows=parseSkills(skills.value);
        var siteIds=allSites.checked?[]:[...sites.selectedOptions].map(o=>o.value).filter(Boolean);
        var result=workerId
          ? await actions().updateWorker(client(),eid(),workerId,payload)
          : await actions().createWorker(client(),eid(),payload);
        workerId=workerId||result.worker_id;
        await actions().replaceSkills(client(),eid(),workerId,skillRows);
        await actions().replaceSites(client(),eid(),workerId,siteIds);
        closeWorker();await refresh();
      }catch(e){
        var r=e&&(e.reason||e.message)||'';
        setErr(error,r==='worker_exists'?'Ce membre possède déjà un profil Workforce.':r==='INVALID_SKILLS'?'Vérifiez le format des compétences.':r==='employee_code_exists'?'Ce code employé est déjà utilisé.':'Impossible d’enregistrer ce technicien.');
      }finally{submit.disabled=false;}
    }

    function openPolicy(policy){
      if(!canManage())return;
      pForm.reset();setErr(pError,'');pId.value=policy?policy.id:'';
      populateSiteSelect(pSite,policy&&policy.site_id?[policy.site_id]:[],true);
      pSite.value=policy&&policy.site_id||'';
      pCat.value=policy?policy.service_category:'';
      pValue.value=policy?policy.mode:'internal_first';
      pLimit.value=policy?String(policy.internal_offer_limit):'3';
      pTtl.value=policy?String(policy.offer_ttl_minutes):'15';
      pFallback.value=policy?String(policy.fallback_after_minutes):'10';
      pStatus.value=policy?policy.status:'active';
      pTitle.textContent=policy?'Modifier la règle':'Nouvelle règle de dispatch';
      pDlg.hidden=false;
    }
    function closePolicy(){pDlg.hidden=true;setErr(pError,'');}
    async function submitPolicy(ev){
      ev.preventDefault();if(!canManage())return;pSubmit.disabled=true;setErr(pError,'');
      try{
        await actions().upsertPolicy(client(),eid(),{
          policy_id:pId.value||null,site_id:pSite.value||null,service_category:pCat.value,
          mode:pValue.value,internal_offer_limit:Number(pLimit.value),offer_ttl_minutes:Number(pTtl.value),
          fallback_after_minutes:Number(pFallback.value),status:pStatus.value
        });
        closePolicy();await refresh();
      }catch(e){setErr(pError,(e&&e.reason)==='policy_exists'?'Une règle existe déjà pour ce périmètre.':'Impossible d’enregistrer cette règle.');}
      finally{pSubmit.disabled=false;}
    }

    function openAssign(requestId){
      if(!canOperate())return;
      assignRequest.value=requestId;assignWorker.replaceChildren();setErr(assignError,'');
      (model.workforce.workers||[]).filter(w=>w.status==='active'&&w.availability==='available').forEach(w=>{
        var o=d.createElement('option');o.value=w.id;o.textContent=w.display_label;assignWorker.append(o);
      });
      assignDlg.hidden=false;
    }
    function closeAssign(){assignDlg.hidden=true;setErr(assignError,'');}
    async function submitAssign(ev){
      ev.preventDefault();assignSubmit.disabled=true;setErr(assignError,'');
      try{await actions().assignWorker(client(),eid(),assignRequest.value,assignWorker.value);closeAssign();await refresh();}
      catch(e){setErr(assignError,(e&&e.reason)==='worker_not_eligible'?'Ce technicien n’est pas éligible pour ce site.':'Affectation impossible.');}
      finally{assignSubmit.disabled=false;}
    }

    async function handleClick(ev){
      var b=ev.target.closest('[data-wf-action]');if(!b)return;
      var action=b.dataset.wfAction,id=b.dataset.id,req=b.dataset.requestId;
      try{
        b.disabled=true;
        if(action==='edit-worker')openWorker(workerById(id));
        else if(action==='availability'){await actions().setAvailability(client(),eid(),id,b.dataset.value);await refresh();}
        else if(action==='edit-policy')openPolicy((model.workforce.dispatch_policies||[]).find(x=>x.id===id));
        else if(action==='accept-offer'){await actions().acceptOffer(client(),req);await refresh();}
        else if(action==='decline-offer'){await actions().declineOffer(client(),req);await refresh();}
        else if(action==='start-assignment'){await actions().setAssignmentStatus(client(),eid(),req,'in_progress');await refresh();}
        else if(action==='complete-assignment'){await actions().setAssignmentStatus(client(),eid(),req,'completed');await refresh();}
        else if(action==='retry-dispatch'){await actions().retryDispatch(client(),eid(),req);await refresh();}
        else if(action==='assign-worker')openAssign(req);
      }catch(_){}
      finally{b.disabled=false;}
    }

    function renderWorkforceCommand(wf){
      var host=by('enterprise-workforce-command');if(!host)return;host.replaceChildren();
      var workers=wf.workers||[],active=workers.filter(w=>w.status==='active'),available=active.filter(w=>w.availability==='available');
      var busy=(wf.assignments||[]).filter(a=>['assigned','in_progress'].includes(a.status));
      var offers=(wf.offers||[]).filter(o=>o.status==='offered');
      function metric(label,value,hint){var n=el('div','fxew-j83-metric');n.append(el('span','',label),el('strong','',String(value)),el('small','',hint));return n;}
      host.append(metric('Effectif actif',active.length,'techniciens'),metric('Disponible',available.length,available.length?'mobilisable maintenant':'aucune capacité'),metric('Engagé',busy.length,'missions internes'),metric('Offres',offers.length,'en attente'));
      var decision=by('enterprise-workforce-decision');if(decision){
        var msg=available.length?'Capacité interne disponible · RAFI peut privilégier l’interne selon les règles de dispatch.':'Capacité interne indisponible · le réseau FIXEO / dispatch hybride reste le relais opérationnel.';
        decision.textContent=msg;decision.dataset.state=available.length?'available':'external';
      }
    }
    function renderWorkers(wf){
      renderWorkforceCommand(wf);
      list.replaceChildren();empty.hidden=wf.workers.length!==0;mode.textContent=canManage()?'Gestion autorisée':'Lecture seule';create.hidden=!canManage();
      wf.workers.forEach(w=>{
        var c=el('article','fxew-workforce-card fxew-j83-worker'),h=el('div','fxew-workforce-head'),copy=el('div');
        copy.append(el('strong','',w.display_label),el('span','',[w.employee_code||'',AVAIL_LABELS[w.availability]||w.availability].filter(Boolean).join(' · ')));
        h.append(copy,el('span','fxew-status',w.status));c.append(h);
        var sk=el('p','fxew-workforce-meta',(w.skills||[]).map(x=>x.service_category+' · N'+x.skill_level).join('  |  ')||'Aucune compétence');
        var sc=w.all_sites?'Tous les sites':(w.site_ids||[]).map(siteName).join(' · ')||'Aucun site';
        c.append(sk,el('p','fxew-workforce-meta','Périmètre · '+sc+' · Capacité '+w.max_concurrent_jobs));
        var a=el('div','fxew-site-actions');
        if(canManage()){var e=el('button','fxew-site-action','Configurer');e.type='button';e.dataset.wfAction='edit-worker';e.dataset.id=w.id;a.append(e);}
        if(canManage()||wf.my_worker_id===w.id){
          ['available','unavailable','off_duty'].forEach(v=>{if(v!==w.availability){var x=el('button','fxew-site-action',AVAIL_LABELS[v]);x.type='button';x.dataset.wfAction='availability';x.dataset.id=w.id;x.dataset.value=v;a.append(x);}});
        }
        if(a.children.length)c.append(a);list.append(c);
      });
    }
    function renderPolicies(wf){
      pList.replaceChildren();pEmpty.hidden=wf.dispatch_policies.length!==0;pMode.textContent=canManage()?'Gestion autorisée':'Lecture seule';pCreate.hidden=!canManage();
      wf.dispatch_policies.forEach(p=>{
        var c=el('article','fxew-dispatch-policy-card'),h=el('div','fxew-workforce-head'),copy=el('div');
        copy.append(el('strong','',MODE_LABELS[p.mode]||p.mode),el('span','',[p.site_id?siteName(p.site_id):'Toute l’entreprise',p.service_category||'Tous les métiers'].join(' · ')));
        h.append(copy,el('span','fxew-status',p.status));c.append(h);
        c.append(el('p','fxew-workforce-meta','Offres '+p.internal_offer_limit+' · TTL '+p.offer_ttl_minutes+' min · Fallback '+p.fallback_after_minutes+' min'));
        if(canManage()){var a=el('div','fxew-site-actions'),e=el('button','fxew-site-action','Modifier');e.type='button';e.dataset.wfAction='edit-policy';e.dataset.id=p.id;a.append(e);c.append(a);}
        pList.append(c);
      });
    }
    function renderMyWork(wf){
      var me=wf.my_worker_id;if(!me){myModule.hidden=true;return;}myModule.hidden=false;
      var w=workerById(me);myStatus.textContent=w?(AVAIL_LABELS[w.availability]||w.availability):'';
      myOffers.replaceChildren();myAssignments.replaceChildren();
      wf.offers.filter(o=>o.worker_id===me&&o.status==='offered').forEach(o=>{
        var it=interventionById(o.service_request_id),c=el('article','fxew-intervention');
        c.append(el('strong','',it?it.service_category:'Intervention'),el('p','fxew-workforce-meta',(it?[it.site_name,it.city].filter(Boolean).join(' · '):'')+' · expire '+new Date(o.expires_at).toLocaleString('fr-MA')));
        var a=el('div','fxew-site-actions'),ok=el('button','fxew-button fxew-button--primary','Accepter'),no=el('button','fxew-button','Refuser');
        ok.type=no.type='button';ok.dataset.wfAction='accept-offer';no.dataset.wfAction='decline-offer';ok.dataset.requestId=no.dataset.requestId=o.service_request_id;a.append(ok,no);c.append(a);myOffers.append(c);
      });
      wf.assignments.filter(a=>a.worker_id===me&&['assigned','in_progress','completed'].includes(a.status)).forEach(a=>{
        var it=interventionById(a.service_request_id),c=el('article','fxew-intervention');
        c.append(el('strong','',it?it.service_category:'Mission interne'),el('p','fxew-workforce-meta','Statut · '+a.status));
        var acts=el('div','fxew-site-actions');
        if(a.status==='assigned'){var st=el('button','fxew-button fxew-button--primary','Démarrer');st.type='button';st.dataset.wfAction='start-assignment';st.dataset.requestId=a.service_request_id;acts.append(st);}
        if(a.status==='in_progress'){var co=el('button','fxew-button fxew-button--primary','Terminer');co.type='button';co.dataset.wfAction='complete-assignment';co.dataset.requestId=a.service_request_id;acts.append(co);}
        if(acts.children.length)c.append(acts);myAssignments.append(c);
      });
    }
    function renderLive(wf){
      if(!live)return;live.replaceChildren();
      var rows=(model.interventions||[]).filter(i=>i.hybrid_dispatch||i.internal_assignment);
      var liveHead=by('enterprise-hybrid-live-summary');if(liveHead){
        var internal=rows.filter(i=>i.internal_assignment).length,external=rows.filter(i=>i.hybrid_dispatch&&['external_only','internal_first','hybrid'].includes(i.hybrid_dispatch.mode)).length;
        liveHead.textContent=rows.length?rows.length+' dispatch actifs · '+internal+' interne'+(internal>1?'s':'')+' · '+external+' avec relais réseau':'Aucun dispatch actif';
      }
      rows.slice(0,30).forEach(i=>{
        var hd=i.hybrid_dispatch||{},ia=i.internal_assignment||null;
        var c=el('article','fxew-hybrid-live-card fxew-j84-flow');
        var head=el('div','fxew-j84-flow-head'),copy=el('div');
        copy.append(el('span','fxew-module-kicker','DECISION FLOW'),el('strong','',i.service_category||'Intervention'),el('small','',[i.site_name,i.city].filter(Boolean).join(' · ')));
        head.append(copy,el('span','fxew-status',hd.status||i.request_status));c.append(head);
        var flow=el('div','fxew-j84-rail');
        function step(label,value,state){var n=el('div','fxew-j84-step fxew-j84-step--'+state);n.append(el('span','',label),el('strong','',value));return n;}
        var mode=hd.mode||'external_only',modeLabel=MODE_LABELS[mode]||mode;
        var internalState=ia?'done':((wf.workers||[]).some(w=>w.status==='active'&&w.availability==='available')?'ready':'off');
        var internalText=ia?'Assigné · '+ia.status:(internalState==='ready'?'Capacité disponible':'Aucune capacité');
        var externalUsed=['external_only','internal_first','hybrid'].includes(mode);
        flow.append(step('Demande','Ouverte','done'),step('Stratégie',modeLabel,'done'),step('Interne',internalText,internalState),step('Réseau FIXEO',externalUsed?'Mobilisé':'En attente',externalUsed?'live':'off'),step('État',hd.status||i.request_status,'live'));
        c.append(flow);
        var next=el('div','fxew-j84-next');
        var nextText=ia?'Suivre la mission interne et son avancement.':externalUsed?'Suivre le dispatch réseau sur cette demande existante.':'Capacité interne requise avant affectation.';
        next.append(el('span','','PROCHAINE ACTION'),el('strong','',nextText));c.append(next);
        if(canOperate()&&i.request_status==='new'){
          var a=el('div','fxew-site-actions'),retry=el('button','fxew-site-action','Relancer dispatch'),assign=el('button','fxew-site-action','Affecter interne');
          retry.type=assign.type='button';retry.dataset.wfAction='retry-dispatch';assign.dataset.wfAction='assign-worker';retry.dataset.requestId=assign.dataset.requestId=i.id;
          if(internalState==='off')assign.disabled=true;
          a.append(retry,assign);c.append(a);
        }
        live.append(c);
      });
    }

    function render(nextModel){
      model=nextModel||{};if(!model.workforce)return;
      renderWorkers(model.workforce);renderPolicies(model.workforce);renderMyWork(model.workforce);renderLive(model.workforce);
    }

    create.addEventListener('click',()=>openWorker(null));close.addEventListener('click',closeWorker);cancel.addEventListener('click',closeWorker);form.addEventListener('submit',submitWorker);
    pCreate.addEventListener('click',()=>openPolicy(null));pClose.addEventListener('click',closePolicy);pCancel.addEventListener('click',closePolicy);pForm.addEventListener('submit',submitPolicy);
    assignClose.addEventListener('click',closeAssign);assignCancel.addEventListener('click',closeAssign);assignForm.addEventListener('submit',submitAssign);
    d.addEventListener('click',handleClick);

    return {render:render,destroy:function(){d.removeEventListener('click',handleClick);}};
  }
  return Object.freeze({mount:mount});
});