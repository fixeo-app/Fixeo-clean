/* FIXEO Enterprise Block E — Finance UI. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.FixeoEnterpriseFinanceUI=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function mount(win,hooks){
    var d=win.document,by=id=>d.getElementById(id),context={sites:[],members:[],workforce:{workers:[]},interventions:[]},data=null;
    var section=by('enterprise-finance-module'),state=by('enterprise-finance-state'),msg=by('enterprise-finance-message'),retry=by('enterprise-finance-retry');
    var summary=by('enterprise-finance-summary'),rows=by('enterprise-finance-rows'),centers=by('enterprise-finance-centers'),
      budgets=by('enterprise-finance-budgets'),pos=by('enterprise-finance-pos'),rates=by('enterprise-finance-rates');
    var exportBtn=by('enterprise-finance-export'),manage=by('enterprise-finance-manage'),tag=by('enterprise-finance-tag');
    var from=by('enterprise-finance-from'),to=by('enterprise-finance-to');

    var dlg=by('enterprise-finance-dialog'),dlgTitle=by('enterprise-finance-dialog-title'),dlgType=by('enterprise-finance-dialog-type'),close=by('enterprise-finance-close'),
      cancel=by('enterprise-finance-cancel'),form=by('enterprise-finance-form'),error=by('enterprise-finance-error'),submit=by('enterprise-finance-submit');
    var dynamic=by('enterprise-finance-fields');

    function api(){return win.FixeoEnterpriseFinance;}
    function client(){return hooks.getClient();}
    function eid(){return hooks.getEnterpriseId();}
    function role(){return hooks.getRole();}
    function el(tag,cls,text){var n=d.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
    function money(v){return Number(v||0).toLocaleString('fr-MA',{minimumFractionDigits:2,maximumFractionDigits:2})+' MAD';}
    function setState(t,r){state.hidden=false;msg.textContent=t;retry.hidden=!r;}
    function setErr(t){error.textContent=t||'';error.hidden=!t;}
    function canManage(){return api()&&api().canManage(role());}
    function canTag(){return api()&&api().canTag(role());}

    function field(label,type,name,value,options){
      var l=el('label','',label),node;
      if(type==='select'){node=d.createElement('select');(options||[]).forEach(o=>{var x=d.createElement('option');x.value=o.value;x.textContent=o.label;if(String(o.value)===String(value||''))x.selected=true;node.append(x);});}
      else if(type==='textarea'){node=d.createElement('textarea');node.rows=3;node.value=value||'';}
      else{node=d.createElement('input');node.type=type||'text';node.value=value==null?'':value;}
      node.name=name;l.append(node);return l;
    }
    function siteOptions(includeGlobal){
      var a=[];if(includeGlobal)a.push({value:'',label:'Toute l’entreprise'});
      (context.sites||[]).forEach(s=>a.push({value:s.id,label:[s.name,s.city].filter(Boolean).join(' · ')}));return a;
    }
    function centerOptions(){
      return [{value:'',label:'Aucun'}].concat((data&&data.cost_centers||[]).map(c=>({value:c.id,label:c.code+' · '+c.name})));
    }
    function poOptions(){
      return [{value:'',label:'Aucun'}].concat((data&&data.purchase_orders||[]).filter(x=>x.status==='open').map(x=>({value:x.id,label:x.reference})));
    }
    function workerOptions(){
      return (context.workforce&&context.workforce.workers||[]).map(w=>({value:w.id,label:w.display_label}));
    }
    function requestOptions(){
      return (context.interventions||[]).map(x=>({value:x.id,label:[x.service_category,x.site_name,x.city].filter(Boolean).join(' · ')}));
    }

    function renderSummary(s){
      summary.replaceChildren();
      [['Coût externe',money(s.external_cost)],['Coût interne',money(s.internal_cost)],['Coût opérationnel',money(s.operational_cost)],['Commission FIXEO',money(s.fixeo_commission)]].forEach(x=>{
        var c=el('div','fxew-kpi');c.append(el('span','fxew-kpi-label',x[0]),el('strong','fxew-kpi-value',x[1]));summary.append(c);
      });
    }
    function renderRows(list){
      rows.replaceChildren();
      (list||[]).slice(0,200).forEach(r=>{
        var card=el('article','fxew-finance-row'),copy=el('div');
        copy.append(el('strong','',r.service_category||'Intervention'),el('span','',[r.site_name,r.city,r.cost_center_code||'Sans centre'].filter(Boolean).join(' · ')));
        card.append(copy,el('span','fxew-status',money(r.total_operational_cost)));
        card.append(el('small','', 'Externe '+money(r.external_cost)+' · Interne '+money(r.internal_cost)+' · Commission '+money(r.fixeo_commission)));
        rows.append(card);
      });
      if(!rows.children.length)rows.append(el('p','fxew-report-empty','Aucune donnée financière sur cette période.'));
    }
    function renderCenters(list){
      centers.replaceChildren();(list||[]).forEach(c=>{
        var x=el('article','fxew-finance-card');x.append(el('strong','',c.code+' · '+c.name),el('span','',[c.department||'',c.status].filter(Boolean).join(' · ')));centers.append(x);
      });
    }
    function renderBudgets(list){
      budgets.replaceChildren();(list||[]).forEach(b=>{
        var c=(data.cost_centers||[]).find(x=>x.id===b.cost_center_id),spent=Number(b.spent||0),amount=Number(b.amount||0);
        var x=el('article','fxew-finance-card'),pct=amount>0?Math.round(spent/amount*100):0;
        x.append(el('strong','',c?c.code:'Budget'),el('span','',money(spent)+' / '+money(amount)+' · '+pct+' %'),el('small','',String(b.period_start)+' → '+String(b.period_end)));budgets.append(x);
      });
    }
    function renderPOs(list){
      pos.replaceChildren();(list||[]).forEach(p=>{
        var x=el('article','fxew-finance-card');x.append(el('strong','',p.reference),el('span','',[p.status,p.approved_amount!=null?money(p.approved_amount):'Sans plafond'].join(' · ')));pos.append(x);
      });
    }
    function renderRates(list){
      rates.replaceChildren();(list||[]).forEach(r=>{
        var x=el('article','fxew-finance-card');x.append(el('strong','',r.display_label),el('span','',money(r.hourly_cost)+' / h'));rates.append(x);
      });
    }
    function render(x){
      data=x||{};renderSummary(data.summary||{});renderRows(data.rows||[]);renderCenters(data.cost_centers||[]);renderBudgets(data.budgets||[]);
      renderPOs(data.purchase_orders||[]);renderRates(data.worker_rates||[]);
      manage.hidden=!canManage();tag.hidden=!canTag();exportBtn.disabled=!(data.rows||[]).length;state.hidden=true;
    }
    async function refresh(){
      if(!api()||!client()||!eid()||!api().canView(role())){section.hidden=true;return;}
      section.hidden=false;setState('Actualisation de la finance Enterprise…',false);
      try{render(await api().load(client(),eid(),from.value||null,to.value||null,500));}
      catch(_){setState('Impossible de charger la finance Enterprise. Réessayez.',true);}
    }
    function setContext(m){context=m||context;}

    function openDialog(type){
      if(type==='tag'){if(!canTag())return;}
      else if(!canManage())return;
      setErr('');dynamic.replaceChildren();dlgType.value=type;dlgTitle.textContent={
        center:'Nouveau centre de coût',budget:'Nouveau budget',po:'Nouveau BC / PO',rate:'Coût horaire interne',tag:'Rattacher une intervention'
      }[type]||'Finance';
      if(type==='center'){
        dynamic.append(field('Code','text','code',''),field('Nom','text','name',''),field('Département','text','department',''),field('Site','select','site_id','',siteOptions(true)),field('Statut','select','status','active',[{value:'active',label:'Actif'},{value:'inactive',label:'Inactif'}]));
      }else if(type==='budget'){
        dynamic.append(field('Centre de coût','select','cost_center_id','',centerOptions()),field('Début','date','period_start',''),field('Fin','date','period_end',''),field('Montant MAD','number','amount','0'),field('Statut','select','status','active',[{value:'active',label:'Actif'},{value:'inactive',label:'Inactif'}]));
      }else if(type==='po'){
        dynamic.append(field('Référence','text','reference',''),field('Centre de coût','select','cost_center_id','',centerOptions()),field('Site','select','site_id','',siteOptions(true)),field('Plafond MAD','number','approved_amount',''),field('Statut','select','status','open',[{value:'open',label:'Ouvert'},{value:'closed',label:'Clôturé'},{value:'cancelled',label:'Annulé'}]),field('Notes','textarea','notes',''));
      }else if(type==='rate'){
        dynamic.append(field('Technicien','select','worker_id','',workerOptions()),field('Coût horaire MAD','number','hourly_cost','0'));
      }else if(type==='tag'){
        dynamic.append(field('Intervention','select','request_id','',requestOptions()),field('Centre de coût','select','cost_center_id','',centerOptions()),field('BC / PO','select','purchase_order_id','',poOptions()));
      }
      dlg.hidden=false;
    }
    function closeDlg(){dlg.hidden=true;setErr('');}
    async function save(ev){
      ev.preventDefault();submit.disabled=true;setErr('');
      try{
        var fd=new win.FormData(form),type=dlgType.value,o=Object.fromEntries(fd.entries());
        if(type==='center')await api().upsertCostCenter(client(),eid(),o);
        else if(type==='budget')await api().upsertBudget(client(),eid(),o);
        else if(type==='po')await api().upsertPurchaseOrder(client(),eid(),o);
        else if(type==='rate')await api().setWorkerRate(client(),eid(),o.worker_id,o.hourly_cost);
        else if(type==='tag')await api().setRequestContext(client(),eid(),o.request_id,o.cost_center_id||null,o.purchase_order_id||null);
        closeDlg();await refresh();
      }catch(e){setErr('Impossible d’enregistrer cette opération Finance.');}
      finally{submit.disabled=false;}
    }
    function exportCsv(){
      if(!data)return;var blob=new win.Blob([api().csv(data)],{type:'text/csv;charset=utf-8'}),url=win.URL.createObjectURL(blob),a=d.createElement('a');
      a.href=url;a.download='fixeo-enterprise-finance-'+new Date().toISOString().slice(0,10)+'.csv';d.body.append(a);a.click();a.remove();win.URL.revokeObjectURL(url);
    }

    retry.addEventListener('click',refresh);from.addEventListener('change',refresh);to.addEventListener('change',refresh);
    exportBtn.addEventListener('click',exportCsv);manage.addEventListener('click',()=>openDialog('center'));tag.addEventListener('click',()=>openDialog('tag'));
    close.addEventListener('click',closeDlg);cancel.addEventListener('click',closeDlg);form.addEventListener('submit',save);
    d.addEventListener('click',ev=>{var b=ev.target.closest('[data-finance-action]');if(b)openDialog(b.dataset.financeAction);});
    return {refresh:refresh,setContext:setContext,destroy:function(){}};
  }
  return Object.freeze({mount:mount});
});