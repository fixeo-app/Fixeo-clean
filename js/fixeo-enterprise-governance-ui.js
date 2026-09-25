/* FIXEO Enterprise Block F — Governance UI. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.FixeoEnterpriseGovernanceUI=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var ROLE_LABELS={owner:'Propriétaire',admin:'Administrateur',operations_manager:'Responsable opérations',site_manager:'Responsable site'};
  function mount(win,hooks){
    var d=win.document,by=id=>d.getElementById(id),data=null,sites=[];
    var section=by('enterprise-governance-module'),state=by('enterprise-governance-state'),msg=by('enterprise-governance-message'),retry=by('enterprise-governance-retry');
    var pending=by('enterprise-governance-pending'),policies=by('enterprise-governance-policies'),cases=by('enterprise-governance-cases'),create=by('enterprise-governance-create'),mode=by('enterprise-governance-mode'),intelligence=by('enterprise-governance-intelligence');
    var dlg=by('enterprise-governance-policy-dialog'),title=by('enterprise-governance-policy-title'),close=by('enterprise-governance-policy-close'),cancel=by('enterprise-governance-policy-cancel'),form=by('enterprise-governance-policy-form');
    var pid=by('enterprise-governance-policy-id'),pname=by('enterprise-governance-policy-name'),psite=by('enterprise-governance-policy-site'),pcat=by('enterprise-governance-policy-category'),purg=by('enterprise-governance-policy-urgency'),preq=by('enterprise-governance-policy-requester'),pmin=by('enterprise-governance-policy-min'),pmax=by('enterprise-governance-policy-max'),ppriority=by('enterprise-governance-policy-priority'),pstatus=by('enterprise-governance-policy-status'),psteps=by('enterprise-governance-policy-steps'),perror=by('enterprise-governance-policy-error'),psubmit=by('enterprise-governance-policy-submit');
    var decisionDlg=by('enterprise-governance-decision-dialog'),decisionClose=by('enterprise-governance-decision-close'),decisionCancel=by('enterprise-governance-decision-cancel'),decisionCase=by('enterprise-governance-decision-case'),decisionNote=by('enterprise-governance-decision-note'),decisionError=by('enterprise-governance-decision-error'),approve=by('enterprise-governance-approve'),reject=by('enterprise-governance-reject');

    function api(){return win.FixeoEnterpriseGovernance;}
    function client(){return hooks.getClient();}
    function eid(){return hooks.getEnterpriseId();}
    function role(){return hooks.getRole();}
    function el(tag,cls,text){var n=d.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
    function setState(t,r){state.hidden=false;msg.textContent=t;retry.hidden=!r;}
    function setErr(node,t){node.textContent=t||'';node.hidden=!t;}
    function canManage(){return api()&&api().canManage(role());}
    function siteName(id){var s=sites.find(x=>x.id===id);return s?[s.name,s.city].filter(Boolean).join(' · '):'Toute l’entreprise';}
    function money(v){return v==null?'—':Number(v).toLocaleString('fr-MA',{minimumFractionDigits:2,maximumFractionDigits:2})+' MAD';}
    function parseSteps(value){
      return String(value||'').split(',').map(x=>x.trim()).filter(Boolean).map((r,i)=>({step_order:i+1,approver_role:r}));
    }
    function populateSites(selected){
      psite.replaceChildren();var g=d.createElement('option');g.value='';g.textContent='Toute l’entreprise';psite.append(g);
      sites.filter(s=>s.status==='active').forEach(s=>{var o=d.createElement('option');o.value=s.id;o.textContent=[s.name,s.city].filter(Boolean).join(' · ');if(s.id===selected)o.selected=true;psite.append(o);});
    }
    function renderPolicies(rows){
      policies.replaceChildren();
      if(!canManage()){policies.append(el('p','fxew-report-empty','Les règles sont administrées par owner/admin.'));return;}
      (rows||[]).forEach(p=>{
        var c=el('article','fxew-governance-card'),h=el('div','fxew-workforce-head'),copy=el('div');
        copy.append(el('strong','',p.name),el('span','',[p.site_id?siteName(p.site_id):'Toute l’entreprise',p.service_category||'Tous métiers'].join(' · ')));
        h.append(copy,el('span','fxew-status',p.status));c.append(h);
        c.append(el('p','fxew-workforce-meta',
          'Montant '+money(p.min_amount)+' → '+money(p.max_amount)+' · '+(p.steps||[]).map(s=>ROLE_LABELS[s.approver_role]||s.approver_role).join(' → ')));
        var a=el('div','fxew-site-actions'),b=el('button','fxew-site-action','Modifier');b.type='button';b.dataset.governanceAction='edit-policy';b.dataset.id=p.id;a.append(b);c.append(a);policies.append(c);
      });
    }
    function renderCases(rows){
      cases.replaceChildren();
      (rows||[]).forEach(c=>{
        var card=el('article','fxew-governance-case'+(c.status==='pending'&&c.required_role===role()?' fxew-governance-case--mine':''));
        var h=el('div','fxew-workforce-head'),copy=el('div');
        copy.append(el('strong','',c.service_category),el('span','',siteName(c.site_id)+' · '+c.requester_role));
        h.append(copy,el('span','fxew-status',c.status));card.append(h);
        card.append(el('p','fxew-workforce-meta','Montant · '+money(c.requested_amount)+' · Étape '+c.current_step+'/'+c.total_steps+' · '+(ROLE_LABELS[c.required_role]||c.required_role||'Terminé')));
        card.append(el('p','fxew-governance-description',c.description));
        if(c.status==='pending'&&c.required_role===role()){
          var a=el('div','fxew-site-actions'),b=el('button','fxew-button fxew-button--primary','Décider');b.type='button';b.dataset.governanceAction='decide';b.dataset.id=c.id;a.append(b);card.append(a);
        }
        cases.append(card);
      });
      if(!cases.children.length)cases.append(el('p','fxew-report-empty','Aucun dossier d’approbation.'));
    }
    function renderIntelligence(x){
      if(!intelligence)return;intelligence.replaceChildren();
      var rows=(x&&x.cases)||[],rules=(x&&x.policies)||[],mine=Number(x&&x.pending_for_me||0),pendingRows=rows.filter(c=>c.status==='pending'),activeRules=rules.filter(p=>p.status==='active');
      function signal(label,value,hint,tone){var n=el('div','fxew-j89-signal fxew-j89-signal--'+tone);n.append(el('span','',label),el('strong','',String(value)),el('small','',hint));return n;}
      intelligence.append(signal('À valider par moi',mine,mine?'décision'+(mine>1?'s':'')+' requise'+(mine>1?'s':''):'aucune','critical'),signal('En attente',pendingRows.length,'dossiers ouverts','attention'),signal('Règles actives',activeRules.length,'cadre de contrôle','stable'));
      var next=rows.find(c=>c.status==='pending'&&c.required_role===role())||pendingRows[0]||null;
      var card=el('div','fxew-j89-next');card.append(el('span','','PROCHAINE DÉCISION'),el('strong','',next?(next.service_category||'Dossier d’approbation'):'Aucune décision en attente'),el('small','',next?[siteName(next.site_id),'Étape '+next.current_step+'/'+next.total_steps,ROLE_LABELS[next.required_role]||next.required_role].filter(Boolean).join(' · '):'Aucun dossier ne nécessite actuellement une validation.'));intelligence.append(card);
      var decision=el('div','fxew-j89-decision'),t=mine&&next?'Priorité : statuer sur ce dossier avant les autres validations.':pendingRows.length?'Suivre le prochain niveau d’approbation du dossier en attente.':activeRules.length?'Aucune validation en attente ; les règles actives restent appliquées.':'Aucune règle active ni décision en attente avec les données disponibles.';
      decision.append(el('span','','PROCHAINE ACTION'),el('strong','',t));intelligence.append(decision);
    }
    function render(x){
      data=x;pending.textContent=String(x.pending_for_me||0);mode.textContent=canManage()?'Gestion autorisée':'Lecture';create.hidden=!canManage();
      renderPolicies(x.policies||[]);renderCases(x.cases||[]);renderIntelligence(x);state.hidden=true;
    }
    async function refresh(){
      if(!api()||!client()||!eid())return;section.hidden=false;setState('Actualisation de la gouvernance…',false);
      try{render(await api().load(client(),eid()));}catch(_){setState('Impossible de charger la gouvernance. Réessayez.',true);}
    }
    function setSites(rows){sites=Array.isArray(rows)?rows.slice():[];}
    function openPolicy(p){
      if(!canManage())return;form.reset();setErr(perror,'');pid.value=p?p.id:'';populateSites(p&&p.site_id||'');
      pname.value=p?p.name:'';pcat.value=p&&p.service_category||'';purg.value=p&&p.urgency||'';preq.value=p&&p.requester_role||'';
      pmin.value=p&&p.min_amount!=null?p.min_amount:'';pmax.value=p&&p.max_amount!=null?p.max_amount:'';ppriority.value=p?p.priority:100;pstatus.value=p?p.status:'active';
      psteps.value=p?(p.steps||[]).map(s=>s.approver_role).join(', '):'operations_manager, admin';title.textContent=p?'Modifier la règle':'Nouvelle règle d’approbation';dlg.hidden=false;
    }
    function closePolicy(){dlg.hidden=true;setErr(perror,'');}
    async function savePolicy(ev){
      ev.preventDefault();psubmit.disabled=true;setErr(perror,'');
      try{
        await api().upsertPolicy(client(),eid(),{
          policy_id:pid.value||null,name:pname.value,site_id:psite.value||null,service_category:pcat.value,urgency:purg.value||null,
          requester_role:preq.value||null,min_amount:pmin.value,max_amount:pmax.value,priority:Number(ppriority.value),status:pstatus.value,steps:parseSteps(psteps.value)
        });
        closePolicy();await refresh();
      }catch(e){setErr(perror,e&&e.message==='INVALID_STEPS'?'Étapes invalides. Utilisez : operations_manager, admin':'Impossible d’enregistrer cette règle.');}
      finally{psubmit.disabled=false;}
    }
    function openDecision(id){decisionCase.value=id;decisionNote.value='';setErr(decisionError,'');decisionDlg.hidden=false;}
    function closeDecision(){decisionDlg.hidden=true;setErr(decisionError,'');}
    async function decide(value){
      var id=decisionCase.value;if(!id)return;approve.disabled=reject.disabled=true;setErr(decisionError,'');
      try{await api().decide(client(),eid(),id,value,decisionNote.value);closeDecision();await refresh();if(hooks.refreshOperations)await hooks.refreshOperations();}
      catch(e){var r=e&&(e.reason||e.message)||'';setErr(decisionError,r==='wrong_approver_role'?'Votre rôle ne correspond pas au niveau d’approbation attendu.':'Impossible d’enregistrer cette décision.');}
      finally{approve.disabled=reject.disabled=false;}
    }
    function click(ev){
      var b=ev.target.closest('[data-governance-action]');if(!b||!data)return;
      if(b.dataset.governanceAction==='edit-policy')openPolicy((data.policies||[]).find(x=>x.id===b.dataset.id));
      if(b.dataset.governanceAction==='decide')openDecision(b.dataset.id);
    }

    create.addEventListener('click',()=>openPolicy(null));retry.addEventListener('click',refresh);close.addEventListener('click',closePolicy);cancel.addEventListener('click',closePolicy);form.addEventListener('submit',savePolicy);
    decisionClose.addEventListener('click',closeDecision);decisionCancel.addEventListener('click',closeDecision);approve.addEventListener('click',()=>decide('approved'));reject.addEventListener('click',()=>decide('rejected'));
    d.addEventListener('click',click);
    return {refresh:refresh,setSites:setSites,destroy:function(){d.removeEventListener('click',click);}};
  }
  return Object.freeze({mount:mount});
});