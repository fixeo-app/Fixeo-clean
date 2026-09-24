/* FIXEO Enterprise Block C — isolated Preventive Maintenance UI. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.FixeoEnterprisePreventiveMaintenanceUI=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var FREQ_LABELS={daily:'Jour',weekly:'Semaine',monthly:'Mois'};
  function mount(win,hooks){
    var d=win.document,by=id=>d.getElementById(id),sites=[],current=null;
    var section=by('enterprise-preventive-maintenance'),state=by('enterprise-maintenance-state'),msg=by('enterprise-maintenance-message'),retry=by('enterprise-maintenance-retry');
    var summary=by('enterprise-maintenance-summary'),calendar=by('enterprise-maintenance-calendar'),plans=by('enterprise-maintenance-plans'),runs=by('enterprise-maintenance-runs'),empty=by('enterprise-maintenance-empty'),create=by('enterprise-maintenance-create'),mode=by('enterprise-maintenance-mode');
    var dlg=by('enterprise-maintenance-dialog'),title=by('enterprise-maintenance-dialog-title'),close=by('enterprise-maintenance-close'),cancel=by('enterprise-maintenance-cancel'),form=by('enterprise-maintenance-form');
    var pid=by('enterprise-maintenance-id'),site=by('enterprise-maintenance-site'),name=by('enterprise-maintenance-name'),category=by('enterprise-maintenance-category'),description=by('enterprise-maintenance-description'),urgency=by('enterprise-maintenance-urgency'),frequency=by('enterprise-maintenance-frequency'),interval=by('enterprise-maintenance-interval'),nextDue=by('enterprise-maintenance-next-due'),reminder=by('enterprise-maintenance-reminder'),status=by('enterprise-maintenance-status'),error=by('enterprise-maintenance-error'),submit=by('enterprise-maintenance-submit');

    function el(tag,cls,text){var n=d.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
    function api(){return win.FixeoEnterprisePreventiveMaintenance;}
    function client(){return hooks.getClient();}
    function eid(){return hooks.getEnterpriseId();}
    function role(){return hooks.getRole();}
    function canManage(){return api()&&api().canManage(role());}
    function setState(text,retryable){state.hidden=false;msg.textContent=text;retry.hidden=!retryable;}
    function fmt(v){if(!v)return'';var x=new Date(v);return Number.isNaN(x.getTime())?'':x.toLocaleString('fr-MA');}
    function siteLabel(id){var s=sites.find(x=>x.id===id);return s?[s.name,s.city].filter(Boolean).join(' · '):'Site';}
    function toLocalInput(iso){
      if(!iso)return'';
      var dte=new Date(iso);if(Number.isNaN(dte.getTime()))return'';
      var pad=n=>String(n).padStart(2,'0');
      return dte.getFullYear()+'-'+pad(dte.getMonth()+1)+'-'+pad(dte.getDate())+'T'+pad(dte.getHours())+':'+pad(dte.getMinutes());
    }
    function fromLocalInput(v){
      var x=new Date(v);if(Number.isNaN(x.getTime()))throw new Error('INVALID_DATE');return x.toISOString();
    }
    function setSites(rows){sites=Array.isArray(rows)?rows.slice():[];}
    function populateSites(selected){
      site.replaceChildren();
      sites.filter(s=>s.status==='active').forEach(s=>{
        var o=d.createElement('option');o.value=s.id;o.textContent=[s.name,s.city].filter(Boolean).join(' · ');if(s.id===selected)o.selected=true;site.append(o);
      });
    }
    function openPlan(plan){
      if(!canManage())return;
      form.reset();error.hidden=true;error.textContent='';pid.value=plan?plan.id:'';
      populateSites(plan&&plan.site_id||'');
      name.value=plan?plan.name:'';
      category.value=plan?plan.service_category:'';
      description.value=plan?plan.description:'';
      urgency.value=plan&&plan.urgency||'';
      frequency.value=plan?plan.frequency:'monthly';
      interval.value=plan?String(plan.interval_count):'1';
      nextDue.value=plan?toLocalInput(plan.next_due_at):toLocalInput(new Date(Date.now()+86400000).toISOString());
      reminder.value=plan?String(plan.reminder_hours):'24';
      status.value=plan?plan.status:'active';
      title.textContent=plan?'Modifier le plan':'Nouveau plan préventif';
      dlg.hidden=false;
    }
    function closeDlg(){dlg.hidden=true;error.hidden=true;error.textContent='';}
    async function save(ev){
      ev.preventDefault();submit.disabled=true;error.hidden=true;
      try{
        await api().upsertPlan(client(),eid(),{
          plan_id:pid.value||null,site_id:site.value,name:name.value,service_category:category.value,
          description:description.value,urgency:urgency.value||null,frequency:frequency.value,
          interval_count:Number(interval.value),next_due_at:fromLocalInput(nextDue.value),
          reminder_hours:Number(reminder.value),status:status.value
        });
        closeDlg();await refresh();
      }catch(e){
        var r=e&&(e.reason||e.message)||'';
        error.textContent=r==='site_not_available'?'Le site n’est plus disponible.':r==='INVALID_DATE'?'La prochaine échéance est invalide.':'Impossible d’enregistrer ce plan.';
        error.hidden=false;
      }finally{submit.disabled=false;}
    }
    function renderSummary(s){
      summary.replaceChildren();
      [['Plans actifs',s.active_plans||0],['Rappels',s.due_soon||0],['En retard',s.overdue||0],['En pause',s.paused||0]].forEach(x=>{
        var c=el('div','fxew-kpi');c.append(el('span','fxew-kpi-label',x[0]),el('strong','fxew-kpi-value',String(x[1])));summary.append(c);
      });
    }
    function renderPlans(rows){
      plans.replaceChildren();empty.hidden=rows.length!==0;
      rows.forEach(p=>{
        var card=el('article','fxew-maintenance-card'+(p.overdue?' fxew-maintenance-card--overdue':p.reminder_due?' fxew-maintenance-card--reminder':''));
        var head=el('div','fxew-workforce-head'),copy=el('div');
        copy.append(el('strong','',p.name||'Plan préventif'),el('span','',[p.site_name,p.city].filter(Boolean).join(' · ')));
        var badge=p.overdue?'En retard':p.reminder_due?'Rappel':p.status;
        head.append(copy,el('span','fxew-status',badge));card.append(head);
        card.append(el('p','fxew-workforce-meta',p.service_category+' · Tous les '+p.interval_count+' '+FREQ_LABELS[p.frequency].toLowerCase()+(p.interval_count>1?'s':'')+' · Prochaine '+fmt(p.next_due_at)));
        if(p.urgency)card.append(el('p','fxew-workforce-meta','Urgence · '+p.urgency+' · Rappel '+p.reminder_hours+' h avant'));
        if(canManage()){
          var a=el('div','fxew-site-actions'),b=el('button','fxew-site-action','Modifier');b.type='button';b.dataset.maintenanceAction='edit';b.dataset.planId=p.id;a.append(b);card.append(a);
        }
        plans.append(card);
      });
    }
    function renderCalendar(rows){
      calendar.replaceChildren();
      var active=(rows||[]).filter(p=>p.status==='active').slice().sort((a,b)=>(Date.parse(a.next_due_at||0)||0)-(Date.parse(b.next_due_at||0)||0)).slice(0,20);
      if(!active.length){calendar.append(el('p','fxew-report-empty','Aucune échéance active.'));return;}
      active.forEach(p=>{
        var row=el('div','fxew-maintenance-calendar-row');
        var copy=el('div');
        copy.append(el('strong','',fmt(p.next_due_at)||'Échéance'),el('span','',p.name+' · '+siteLabel(p.site_id)));
        row.append(copy);
        if(p.overdue)row.append(el('span','fxew-status','En retard'));
        else if(p.reminder_due)row.append(el('span','fxew-status','Rappel'));
        else row.append(el('span','fxew-status','Planifiée'));
        calendar.append(row);
      });
    }
    function renderRuns(rows){
      runs.replaceChildren();
      if(!rows.length){runs.append(el('p','fxew-report-empty','Aucune exécution préventive enregistrée.'));return;}
      rows.slice(0,100).forEach(r=>{
        var row=el('article','fxew-maintenance-run'),copy=el('div');
        copy.append(el('strong','',r.plan_name||'Plan'),el('span','',[r.site_name,fmt(r.due_at)].filter(Boolean).join(' · ')));
        row.append(copy,el('span','fxew-status',r.status));
        if(r.service_request_id)row.append(el('small','', 'Intervention · '+String(r.service_request_id).replace(/-/g,'').slice(-8)));
        if(r.error_code)row.append(el('small','', 'Erreur · '+r.error_code));
        runs.append(row);
      });
    }
    async function refresh(){
      if(!api()||!client()||!eid())return;
      section.hidden=false;mode.textContent=canManage()?'Gestion autorisée':'Lecture seule';create.hidden=!canManage();setState('Actualisation de la maintenance préventive…',false);
      try{
        current=await api().load(client(),eid(),100);
        renderSummary(current.summary||{});renderCalendar(current.plans||[]);renderPlans(current.plans||[]);renderRuns(current.runs||[]);state.hidden=true;
      }catch(_){setState('Impossible de charger la maintenance préventive. Réessayez.',true);}
    }
    function click(ev){
      var b=ev.target.closest('[data-maintenance-action]');if(!b||!current)return;
      if(b.dataset.maintenanceAction==='edit'){
        var p=(current.plans||[]).find(x=>x.id===b.dataset.planId);if(p)openPlan(p);
      }
    }
    create.addEventListener('click',()=>openPlan(null));retry.addEventListener('click',refresh);close.addEventListener('click',closeDlg);cancel.addEventListener('click',closeDlg);form.addEventListener('submit',save);d.addEventListener('click',click);
    return {refresh:refresh,setSites:setSites,destroy:function(){d.removeEventListener('click',click);}};
  }
  return Object.freeze({mount:mount});
});