/* FIXEO Enterprise Block B — isolated Control Tower UI. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.FixeoEnterpriseControlTowerUI=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var SEVERITY_LABELS={critical:'Critique',high:'Élevé',medium:'À surveiller'};
  var REASON_LABELS={
    manual_critical:'Escalade critique',
    sla_breached:'SLA dépassé',
    manual_high:'Escalade prioritaire',
    sla_at_risk:'SLA à risque',
    external_dispatch_failed:'Dispatch externe en échec',
    no_internal_candidate:'Aucun technicien interne',
    fallback_due:'Fallback externe attendu',
    unassigned:'Non attribuée',
    assigned_not_started:'Affectée mais non démarrée'
  };
  function mount(win,hooks){
    var d=win.document,by=id=>d.getElementById(id),members=[];
    var section=by('enterprise-control-tower'),state=by('enterprise-control-tower-state'),msg=by('enterprise-control-tower-message'),retry=by('enterprise-control-tower-retry');
    var summary=by('enterprise-control-summary'),attention=by('enterprise-control-attention'),sites=by('enterprise-control-sites'),workers=by('enterprise-control-workers');
    var dlg=by('enterprise-control-escalation-dialog'),close=by('enterprise-control-escalation-close'),cancel=by('enterprise-control-escalation-cancel'),form=by('enterprise-control-escalation-form');
    var req=by('enterprise-control-escalation-request'),priority=by('enterprise-control-escalation-priority'),status=by('enterprise-control-escalation-status'),assignee=by('enterprise-control-escalation-assignee'),note=by('enterprise-control-escalation-note'),error=by('enterprise-control-escalation-error'),submit=by('enterprise-control-escalation-submit');
    var current=null;
    function el(tag,cls,text){var n=d.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
    function client(){return hooks.getClient();}
    function eid(){return hooks.getEnterpriseId();}
    function role(){return hooks.getRole();}
    function api(){return win.FixeoEnterpriseControlTower;}
    function canEscalate(){return api()&&api().canEscalate(role());}
    function setState(text,retryable){state.hidden=false;msg.textContent=text;retry.hidden=!retryable;}
    function dateTime(v){if(!v)return'';var x=new Date(v);return Number.isNaN(x.getTime())?'':x.toLocaleString('fr-MA');}
    function memberLabel(id){
      var m=members.find(x=>x.id===id);if(!m)return 'Membre';
      return 'Membre • '+String(m.user_id||'').replace(/-/g,'').slice(-6);
    }
    function openEscalation(item){
      if(!canEscalate())return;
      form.reset();error.hidden=true;error.textContent='';
      req.value=item.request_id;
      priority.value=item.escalation&&item.escalation.priority||'high';
      status.value=item.escalation&&item.escalation.status||'open';
      assignee.replaceChildren();
      var none=d.createElement('option');none.value='';none.textContent='Non assigné';assignee.append(none);
      members.filter(m=>m.status==='active').forEach(m=>{
        var o=d.createElement('option');o.value=m.id;o.textContent=memberLabel(m.id);
        if(item.escalation&&item.escalation.assigned_to_member_id===m.id)o.selected=true;
        assignee.append(o);
      });
      note.value=item.escalation&&item.escalation.note||'';
      dlg.hidden=false;
    }
    function closeDlg(){dlg.hidden=true;error.hidden=true;error.textContent='';}
    async function save(ev){
      ev.preventDefault();submit.disabled=true;error.hidden=true;
      try{
        await api().upsertEscalation(client(),eid(),{
          request_id:req.value,priority:priority.value,status:status.value,
          assigned_to_member_id:assignee.value||null,note:note.value
        });
        closeDlg();await refresh();
      }catch(e){
        error.textContent=(e&&e.reason)==='assignee_not_available'?'Ce membre n’est plus disponible.':'Impossible d’enregistrer l’escalade.';
        error.hidden=false;
      }finally{submit.disabled=false;}
    }
    function renderSummary(s){
      summary.replaceChildren();
      [
        ['Ouvertes',s.open_requests||0],
        ['Critiques',s.critical||0],
        ['À risque',s.at_risk||0],
        ['Escalades',s.manual_escalations||0]
      ].forEach(x=>{var c=el('div','fxew-kpi');c.append(el('span','fxew-kpi-label',x[0]),el('strong','fxew-kpi-value',String(x[1])));summary.append(c);});
      try{win.dispatchEvent(new win.CustomEvent('fixeo:enterprise:control-tower-ready',{detail:{summary:s}}));}catch(_e){}
    }
    function renderAttention(rows){
      attention.replaceChildren();
      if(!rows.length){attention.append(el('p','fxew-report-empty','Aucune intervention ne nécessite une attention immédiate.'));return;}
      rows.forEach(item=>{
        var card=el('article','fxew-control-alert fxew-control-alert--'+item.severity);
        var head=el('div','fxew-control-alert-head'),copy=el('div');
        copy.append(el('strong','',item.service_category||'Intervention'),el('span','',[item.site_name,item.city].filter(Boolean).join(' · ')));
        head.append(copy,el('span','fxew-status',SEVERITY_LABELS[item.severity]||item.severity));card.append(head);
        card.append(el('p','fxew-control-reason',REASON_LABELS[item.reason]||item.reason));
        var meta=el('div','fxew-control-meta');
        if(item.due_at)meta.append(el('span','', 'Échéance · '+dateTime(item.due_at)));
        if(item.dispatch_mode)meta.append(el('span','', 'Dispatch · '+item.dispatch_mode));
        if(item.internal_worker_label)meta.append(el('span','', 'Interne · '+item.internal_worker_label));
        if(item.escalation&&item.escalation.assigned_to_member_id)meta.append(el('span','', 'Responsable · '+memberLabel(item.escalation.assigned_to_member_id)));
        card.append(meta);
        if(canEscalate()){
          var a=el('div','fxew-site-actions'),b=el('button','fxew-site-action',item.escalation?'Modifier escalade':'Escalader');
          b.type='button';b.dataset.controlAction='escalate';b.dataset.requestId=item.request_id;a.append(b);card.append(a);
        }
        attention.append(card);
      });
    }
    function renderSites(rows){
      sites.replaceChildren();
      rows.forEach(x=>{
        var c=el('article','fxew-control-load-card'),h=el('div','fxew-workforce-head'),copy=el('div');
        copy.append(el('strong','',x.site_name||'Site'),el('span','',x.city||''));h.append(copy,el('span','fxew-status',String(x.open_count||0)+' ouvertes'));c.append(h);
        c.append(el('p','fxew-workforce-meta','Critiques '+(x.breached_count||0)+' · À risque '+(x.at_risk_count||0)+' · Internes '+(x.internal_active_count||0)));sites.append(c);
      });
    }
    function renderWorkers(rows){
      workers.replaceChildren();
      rows.forEach(x=>{
        var c=el('article','fxew-control-load-card'),h=el('div','fxew-workforce-head'),copy=el('div');
        copy.append(el('strong','',x.display_label||'Technicien'),el('span','',[x.availability,x.status].filter(Boolean).join(' · ')));h.append(copy,el('span','fxew-status',String(x.utilization_percent||0)+' %'));c.append(h);
        c.append(el('p','fxew-workforce-meta','Actives '+(x.active_assignments||0)+' / '+(x.max_concurrent_jobs||0)+' · À démarrer '+(x.waiting_start_count||0)+' · En cours '+(x.in_progress_count||0)));workers.append(c);
      });
    }
    async function refresh(){
      if(!eid()||!client()||!api())return;
      section.hidden=false;setState('Actualisation de la Control Tower…',false);
      try{
        current=await api().load(client(),eid(),100);
        renderSummary(current.summary||{});
        renderAttention(current.attention||[]);
        renderSites(current.site_load||[]);
        renderWorkers(current.worker_load||[]);
        state.hidden=true;
      }catch(_){setState('Impossible de charger la Control Tower. Réessayez.',true);}
    }
    function setMembers(rows){members=Array.isArray(rows)?rows.slice():[];}
    function click(ev){
      var b=ev.target.closest('[data-control-action]');if(!b)return;
      if(b.dataset.controlAction==='escalate'&&current){
        var item=(current.attention||[]).find(x=>x.request_id===b.dataset.requestId);if(item)openEscalation(item);
      }
    }
    retry.addEventListener('click',refresh);close.addEventListener('click',closeDlg);cancel.addEventListener('click',closeDlg);form.addEventListener('submit',save);d.addEventListener('click',click);
    return {refresh:refresh,setMembers:setMembers,destroy:function(){d.removeEventListener('click',click);}};
  }
  return Object.freeze({mount:mount});
});