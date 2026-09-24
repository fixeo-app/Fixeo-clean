/* FIXEO Enterprise Block D — Equipment UI. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.FixeoEnterpriseEquipmentUI=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  var CRIT={low:'Faible',medium:'Moyenne',high:'Haute',critical:'Critique'};
  var STATUS={active:'Actif',out_of_service:'Hors service',retired:'Retiré'};

  function mount(win,hooks){
    var d=win.document,by=id=>d.getElementById(id),context={sites:[],interventions:[]},fleet=null,currentDetail=null;
    var section=by('enterprise-equipment-module'),state=by('enterprise-equipment-state'),msg=by('enterprise-equipment-message'),retry=by('enterprise-equipment-retry');
    var summary=by('enterprise-equipment-summary'),list=by('enterprise-equipment-list'),empty=by('enterprise-equipment-empty'),create=by('enterprise-equipment-create'),mode=by('enterprise-equipment-mode');

    var dlg=by('enterprise-equipment-dialog'),dlgTitle=by('enterprise-equipment-dialog-title'),close=by('enterprise-equipment-close'),cancel=by('enterprise-equipment-cancel'),form=by('enterprise-equipment-form');
    var id=by('enterprise-equipment-id'),site=by('enterprise-equipment-site'),name=by('enterprise-equipment-name'),category=by('enterprise-equipment-category'),assetCode=by('enterprise-equipment-code');
    var manufacturer=by('enterprise-equipment-manufacturer'),model=by('enterprise-equipment-model'),serial=by('enterprise-equipment-serial'),installed=by('enterprise-equipment-installed');
    var criticality=by('enterprise-equipment-criticality'),status=by('enterprise-equipment-status'),notes=by('enterprise-equipment-notes'),error=by('enterprise-equipment-error'),submit=by('enterprise-equipment-submit');

    var detailDlg=by('enterprise-equipment-detail-dialog'),detailClose=by('enterprise-equipment-detail-close'),detailDismiss=by('enterprise-equipment-detail-dismiss'),detail=by('enterprise-equipment-detail');
    var requestSelect=by('enterprise-equipment-request-select'),requestLink=by('enterprise-equipment-request-link');
    var planSelect=by('enterprise-equipment-plan-select'),planLink=by('enterprise-equipment-plan-link');
    var assetType=by('enterprise-equipment-asset-type'),assetTitle=by('enterprise-equipment-asset-title'),assetFile=by('enterprise-equipment-asset-file'),assetUpload=by('enterprise-equipment-asset-upload'),assetError=by('enterprise-equipment-asset-error');

    function api(){return win.FixeoEnterpriseEquipment;}
    function client(){return hooks.getClient();}
    function eid(){return hooks.getEnterpriseId();}
    function role(){return hooks.getRole();}
    function canManage(){return api()&&api().canManage(role());}
    function el(tag,cls,text){var n=d.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
    function fmt(v){if(!v)return '—';var x=new Date(v);return Number.isNaN(x.getTime())?String(v):x.toLocaleDateString('fr-MA');}
    function setState(t,retryable){state.hidden=false;msg.textContent=t;retry.hidden=!retryable;}
    function setErr(node,t){node.textContent=t||'';node.hidden=!t;}
    function siteLabel(sid){var s=(context.sites||[]).find(x=>x.id===sid);return s?[s.name,s.city].filter(Boolean).join(' · '):'Site';}
    function itemById(x){return fleet&&fleet.equipment&&fleet.equipment.find(e=>e.id===x);}

    function renderSummary(s){
      summary.replaceChildren();
      [['Équipements',s.total||0],['Actifs',s.active||0],['Hors service',s.out_of_service||0],['Pannes récurrentes',s.recurring_failure||0]].forEach(x=>{
        var c=el('div','fxew-kpi');c.append(el('span','fxew-kpi-label',x[0]),el('strong','fxew-kpi-value',String(x[1])));summary.append(c);
      });
    }
    function renderFleet(rows){
      list.replaceChildren();empty.hidden=rows.length!==0;
      rows.forEach(e=>{
        var c=el('article','fxew-equipment-card'+(e.recurring_failure?' fxew-equipment-card--recurring':'')+(e.criticality==='critical'?' fxew-equipment-card--critical':''));
        var h=el('div','fxew-workforce-head'),copy=el('div');
        copy.append(el('strong','',e.name),el('span','',[e.asset_code||'',e.category,siteLabel(e.site_id)].filter(Boolean).join(' · ')));
        h.append(copy,el('span','fxew-status',STATUS[e.status]||e.status));c.append(h);
        c.append(el('p','fxew-workforce-meta','Criticité · '+(CRIT[e.criticality]||e.criticality)+' · Interventions '+e.intervention_count+' · Plans '+e.maintenance_plan_count+' · Médias '+e.asset_count));
        if(e.recurring_failure)c.append(el('p','fxew-equipment-warning','Panne récurrente détectée · '+e.failure_count_90d+' interventions sur 90 jours'));
        var actions=el('div','fxew-site-actions'),view=el('button','fxew-site-action','Ouvrir');
        view.type='button';view.dataset.equipmentAction='detail';view.dataset.id=e.id;actions.append(view);
        if(canManage()){var edit=el('button','fxew-site-action','Modifier');edit.type='button';edit.dataset.equipmentAction='edit';edit.dataset.id=e.id;actions.append(edit);}
        c.append(actions);list.append(c);
      });
    }
    async function refresh(){
      if(!api()||!client()||!eid())return;
      section.hidden=false;mode.textContent=canManage()?'Gestion autorisée':'Lecture seule';create.hidden=!canManage();setState('Actualisation du parc d’équipements…',false);
      try{fleet=await api().loadFleet(client(),eid());renderSummary(fleet.summary||{});renderFleet(fleet.equipment||[]);state.hidden=true;}
      catch(_){setState('Impossible de charger le parc d’équipements. Réessayez.',true);}
    }
    function setContext(model){context=model||{sites:[],interventions:[]};}

    function populateSites(selected){
      site.replaceChildren();(context.sites||[]).filter(s=>s.status==='active').forEach(s=>{
        var o=d.createElement('option');o.value=s.id;o.textContent=[s.name,s.city].filter(Boolean).join(' · ');if(s.id===selected)o.selected=true;site.append(o);
      });
    }
    function openEditor(e){
      if(!canManage())return;form.reset();setErr(error,'');id.value=e?e.id:'';
      populateSites(e&&e.site_id||'');name.value=e?e.name:'';category.value=e?e.category:'';
      assetCode.value=e&&e.asset_code||'';manufacturer.value=e&&e.manufacturer||'';model.value=e&&e.model||'';serial.value=e&&e.serial_number||'';
      installed.value=e&&e.installed_at||'';criticality.value=e?e.criticality:'medium';status.value=e?e.status:'active';notes.value=e&&e.notes||'';
      dlgTitle.textContent=e?'Modifier l’équipement':'Nouvel équipement';dlg.hidden=false;
    }
    function closeEditor(){dlg.hidden=true;setErr(error,'');}
    async function save(ev){
      ev.preventDefault();submit.disabled=true;setErr(error,'');
      try{
        await api().upsert(client(),eid(),{
          equipment_id:id.value||null,site_id:site.value,name:name.value,category:category.value,asset_code:assetCode.value,
          manufacturer:manufacturer.value,model:model.value,serial_number:serial.value,installed_at:installed.value||null,
          criticality:criticality.value,status:status.value,notes:notes.value
        });
        closeEditor();await refresh();
      }catch(e){
        var r=e&&(e.reason||e.message)||'';
        setErr(error,r==='asset_code_exists'?'Ce code équipement est déjà utilisé.':r==='site_not_available'?'Le site sélectionné n’est plus disponible.':'Impossible d’enregistrer cet équipement.');
      }finally{submit.disabled=false;}
    }

    function detailRow(label,value){var row=el('div','fxew-detail-row');var dt=el('dt','',label),dd=el('dd','',value==null||value===''?'—':String(value));row.append(dt,dd);return row;}
    async function loadPlans(){
      if(!win.FixeoEnterprisePreventiveMaintenance||typeof win.FixeoEnterprisePreventiveMaintenance.load!=='function')return[];
      try{var x=await win.FixeoEnterprisePreventiveMaintenance.load(client(),eid(),200);return x.plans||[];}catch(_){return[];}
    }
    async function openDetail(equipmentId){
      try{
        currentDetail=await api().loadDetail(client(),eid(),equipmentId,100);
        renderDetail(currentDetail);
        detailDlg.hidden=false;
      }catch(_){}
    }
    async function renderDetail(data){
      detail.replaceChildren();
      var e=data.equipment||{},grid=el('dl','fxew-detail-grid');
      grid.append(detailRow('Nom',e.name),detailRow('Site',[e.site_name,e.city].filter(Boolean).join(' · ')),detailRow('Catégorie',e.category),
        detailRow('Code',e.asset_code),detailRow('Fabricant',e.manufacturer),detailRow('Modèle',e.model),detailRow('Série',e.serial_number),
        detailRow('Installation',fmt(e.installed_at)),detailRow('Criticité',CRIT[e.criticality]||e.criticality),detailRow('Statut',STATUS[e.status]||e.status));
      detail.append(grid);
      if(e.notes)detail.append(el('p','fxew-detail-muted',e.notes));

      var history=el('section','fxew-equipment-detail-section');history.append(el('h3','','Historique des interventions'));
      (data.interventions||[]).forEach(r=>{
        var row=el('div','fxew-maintenance-run'),copy=el('div');
        copy.append(el('strong','',r.service_category||'Intervention'),el('span','',[fmt(r.created_at),r.urgency].filter(Boolean).join(' · ')));
        row.append(copy,el('span','fxew-status',r.status||''));history.append(row);
      });
      if(!(data.interventions||[]).length)history.append(el('p','fxew-report-empty','Aucune intervention liée.'));
      detail.append(history);

      var plans=el('section','fxew-equipment-detail-section');plans.append(el('h3','','Maintenance préventive'));
      (data.maintenance_plans||[]).forEach(p=>{
        var row=el('div','fxew-maintenance-run'),copy=el('div');
        copy.append(el('strong','',p.name),el('span','',p.service_category+' · prochaine '+fmt(p.next_due_at)));
        row.append(copy,el('span','fxew-status',p.status));plans.append(row);
      });
      if(!(data.maintenance_plans||[]).length)plans.append(el('p','fxew-report-empty','Aucun plan lié.'));
      detail.append(plans);

      var assets=el('section','fxew-equipment-detail-section');assets.append(el('h3','','Photos & documents'));
      (data.assets||[]).forEach(a=>{
        var row=el('div','fxew-equipment-asset'),copy=el('div');
        copy.append(el('strong','',a.title),el('span','',a.asset_type+' · '+Math.ceil(a.size_bytes/1024)+' Ko'));
        var aa=el('div','fxew-site-actions'),open=el('button','fxew-site-action','Ouvrir');
        open.type='button';open.dataset.equipmentAction='asset-open';open.dataset.assetId=a.id;aa.append(open);
        if(canManage()){var rem=el('button','fxew-site-action','Supprimer');rem.type='button';rem.dataset.equipmentAction='asset-remove';rem.dataset.assetId=a.id;aa.append(rem);}
        row.append(copy,aa);assets.append(row);
      });
      if(!(data.assets||[]).length)assets.append(el('p','fxew-report-empty','Aucun média.'));
      detail.append(assets);

      requestSelect.replaceChildren();
      var linkedReq=new Set((data.interventions||[]).map(x=>x.request_id));
      (context.interventions||[]).filter(x=>x.site_id===e.site_id&&!linkedReq.has(x.id)).forEach(x=>{
        var o=d.createElement('option');o.value=x.id;o.textContent=[x.service_category,fmt(x.created_at),x.request_status].filter(Boolean).join(' · ');requestSelect.append(o);
      });
      requestLink.disabled=!canManage()||!requestSelect.options.length;

      planSelect.replaceChildren();
      var allPlans=await loadPlans(),linkedPlans=new Set((data.maintenance_plans||[]).map(x=>x.plan_id));
      allPlans.filter(x=>x.site_id===e.site_id&&!linkedPlans.has(x.id)).forEach(x=>{
        var o=d.createElement('option');o.value=x.id;o.textContent=[x.name,fmt(x.next_due_at)].filter(Boolean).join(' · ');planSelect.append(o);
      });
      planLink.disabled=!canManage()||!planSelect.options.length;
      assetUpload.disabled=!canManage();
    }
    function closeDetail(){detailDlg.hidden=true;currentDetail=null;setErr(assetError,'');}
    function assetById(id){return currentDetail&&(currentDetail.assets||[]).find(x=>x.id===id);}

    async function click(ev){
      var b=ev.target.closest('[data-equipment-action]');if(!b)return;
      var action=b.dataset.equipmentAction;
      try{
        b.disabled=true;
        if(action==='edit')openEditor(itemById(b.dataset.id));
        else if(action==='detail')await openDetail(b.dataset.id);
        else if(action==='asset-open'){
          var a=assetById(b.dataset.assetId);if(a){var url=await api().signedAssetUrl(client(),a.storage_path,300);win.open(url,'_blank','noopener');}
        }else if(action==='asset-remove'){
          var ar=assetById(b.dataset.assetId);if(ar){await api().removeAsset(client(),eid(),ar);await openDetail(currentDetail.equipment.id);await refresh();}
        }
      }catch(_){}
      finally{b.disabled=false;}
    }
    async function linkRequest(){
      if(!currentDetail||!requestSelect.value)return;requestLink.disabled=true;
      try{await api().setRequestLink(client(),eid(),currentDetail.equipment.id,requestSelect.value,true);await openDetail(currentDetail.equipment.id);await refresh();}catch(_){}
      finally{requestLink.disabled=false;}
    }
    async function linkPlan(){
      if(!currentDetail||!planSelect.value)return;planLink.disabled=true;
      try{await api().setMaintenanceLink(client(),eid(),currentDetail.equipment.id,planSelect.value,true);await openDetail(currentDetail.equipment.id);await refresh();}catch(_){}
      finally{planLink.disabled=false;}
    }
    async function upload(){
      if(!currentDetail||!assetFile.files||!assetFile.files[0])return;
      assetUpload.disabled=true;setErr(assetError,'');
      try{
        var file=assetFile.files[0];
        await api().uploadAsset(client(),eid(),currentDetail.equipment.id,file,assetType.value,assetTitle.value||file.name);
        assetFile.value='';assetTitle.value='';await openDetail(currentDetail.equipment.id);await refresh();
      }catch(e){
        var r=e&&e.message||'';
        setErr(assetError,r==='INVALID_SIZE'?'Fichier trop volumineux (10 Mo maximum).':r==='INVALID_MIME_TYPE'?'Format accepté : JPG, PNG, WebP ou PDF.':'Impossible d’ajouter ce fichier.');
      }finally{assetUpload.disabled=!canManage();}
    }

    create.addEventListener('click',()=>openEditor(null));retry.addEventListener('click',refresh);
    close.addEventListener('click',closeEditor);cancel.addEventListener('click',closeEditor);form.addEventListener('submit',save);
    detailClose.addEventListener('click',closeDetail);detailDismiss.addEventListener('click',closeDetail);
    requestLink.addEventListener('click',linkRequest);planLink.addEventListener('click',linkPlan);assetUpload.addEventListener('click',upload);
    d.addEventListener('click',click);

    return {refresh:refresh,setContext:setContext,destroy:function(){d.removeEventListener('click',click);}};
  }
  return Object.freeze({mount:mount});
});