(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports) module.exports=factory(null);
  else root.FixeoEnterpriseProvisioning=factory(root);
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';

  var UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function clean(v){ return String(v==null?'':v).trim(); }
  function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);}); }
  function validEmail(v){ var s=clean(v).toLowerCase(); return s.length>=3&&s.length<=320&&s.indexOf('@')>0; }
  function validId(v){ return UUID_RE.test(clean(v)); }
  function uuid(){
    var c=root&&root.crypto;
    if(!c||typeof c.randomUUID!=='function') throw new Error('SECURE_UUID_UNAVAILABLE');
    return c.randomUUID();
  }
  async function client(){
    if(!root||!root.FixeoSupabaseClient||typeof root.FixeoSupabaseClient.ready!=='function') throw new Error('SUPABASE_UNAVAILABLE');
    var ready=await root.FixeoSupabaseClient.ready();
    if(!ready||!ready.client) throw new Error('SUPABASE_UNAVAILABLE');
    return ready.client;
  }
  async function rpc(name,args){
    var c=await client(),r=await c.rpc(name,args||{});
    if(!r||r.error) throw new Error((r&&r.error&&r.error.message)||'RPC_FAILED');
    var data=r.data;
    if(Array.isArray(data)&&name==='admin_find_enterprise_owner_v1') return data;
    if(!data||data.ok!==true){
      var e=new Error((data&&data.reason)||'RPC_REJECTED');
      e.reason=(data&&data.reason)||'RPC_REJECTED';
      throw e;
    }
    return data;
  }

  async function searchOwner(query){
    query=clean(query);
    if(query.length<3) throw new Error('SEARCH_TOO_SHORT');
    return rpc('admin_find_enterprise_owner_v1',{p_query:query});
  }
  async function provision(input){
    input=input||{};
    if(!clean(input.name)) throw new Error('NAME_REQUIRED');
    if(input.owner_mode==='existing'&&!validId(input.owner_user_id)) throw new Error('OWNER_USER_REQUIRED');
    if(input.owner_mode==='invite'&&!validEmail(input.owner_email)) throw new Error('OWNER_EMAIL_REQUIRED');
    return rpc('admin_provision_enterprise_v1',{
      p_name:clean(input.name),
      p_legal_name:clean(input.legal_name)||null,
      p_owner_user_id:input.owner_mode==='existing'?clean(input.owner_user_id):null,
      p_owner_email:input.owner_mode==='invite'?clean(input.owner_email).toLowerCase():null,
      p_idempotency_key:input.idempotency_key||uuid(),
      p_invitation_expires_at:null
    });
  }
  async function ownerState(enterpriseId){
    if(!validId(enterpriseId)) throw new Error('INVALID_ENTERPRISE_ID');
    return rpc('admin_get_enterprise_owner_state_v1',{p_enterprise_id:enterpriseId});
  }
  async function assignOwner(enterpriseId,input){
    input=input||{};
    if(!validId(enterpriseId)) throw new Error('INVALID_ENTERPRISE_ID');
    return rpc('admin_assign_founder_owner_v1',{
      p_enterprise_id:enterpriseId,
      p_owner_user_id:input.owner_mode==='existing'?clean(input.owner_user_id):null,
      p_owner_email:input.owner_mode==='invite'?clean(input.owner_email).toLowerCase():null,
      p_invitation_expires_at:null
    });
  }
  async function rotate(enterpriseId,invitationId){
    if(!validId(enterpriseId)||!validId(invitationId)) throw new Error('INVALID_ID');
    return rpc('admin_rotate_founder_invitation_v1',{
      p_enterprise_id:enterpriseId,p_invitation_id:invitationId,p_expires_at:null
    });
  }
  async function revoke(enterpriseId,invitationId){
    if(!validId(enterpriseId)||!validId(invitationId)) throw new Error('INVALID_ID');
    return rpc('admin_revoke_founder_invitation_v1',{
      p_enterprise_id:enterpriseId,p_invitation_id:invitationId
    });
  }

  var ui={
    mode:'create',step:1,busy:false,enterpriseId:null,result:null,
    draft:{name:'',legal_name:'',owner_mode:'existing',selected:null,owner_email:'',idempotency_key:null}
  };

  function q(id){ return root&&root.document?root.document.getElementById(id):null; }
  function dialog(){ return q('enterprise-provision-dialog'); }
  function body(){ return q('enterprise-provision-body'); }
  function stateEl(){ return q('enterprise-provision-state'); }

  function setState(text,tone){
    var e=stateEl(); if(!e)return;
    e.textContent=text||''; e.dataset.tone=tone||'';
  }
  function showDialog(){
    var d=dialog(); if(!d)return;
    if(typeof d.showModal==='function'&&!d.open)d.showModal(); else d.setAttribute('open','');
    root.document.documentElement.classList.add('enterprise-provision-open');
  }
  function closeDialog(){
    var d=dialog(); if(!d)return;
    if(typeof d.close==='function'&&d.open)d.close(); else d.removeAttribute('open');
    root.document.documentElement.classList.remove('enterprise-provision-open');
  }
  function stepDots(){
    if(ui.mode!=='create')return '<div class="ep-steps"><span class="active">GESTION</span></div>';
    return '<div class="ep-steps">'+[1,2,3].map(function(n){return '<span class="'+(n===ui.step?'active':n<ui.step?'done':'')+'">'+n+'</span>';}).join('<i></i>')+'</div>';
  }
  function renderShell(inner,title,subtitle){
    var b=body(); if(!b)return;
    b.innerHTML=stepDots()+'<div class="ep-heading"><span>CONTROL OS · ENTERPRISE PROVISIONING</span><h2>'+esc(title)+'</h2><p>'+esc(subtitle||'')+'</p></div>'+inner;
  }
  function renderStep1(){
    renderShell(
      '<form id="ep-company-form" class="ep-form"><label>Nom de l’entreprise<input class="control" name="name" maxlength="200" required value="'+esc(ui.draft.name)+'" placeholder="Ex. Atlas Facilities"></label>'+
      '<label>Raison sociale <em>optionnel</em><input class="control" name="legal_name" maxlength="300" value="'+esc(ui.draft.legal_name)+'" placeholder="Ex. Atlas Facilities SARL"></label>'+
      '<div class="ep-truth"><b>Autorité</b><span>L’entreprise sera créée par une commande Admin auditée. Votre compte Admin ne deviendra jamais propriétaire automatiquement.</span></div>'+
      '<div class="ep-actions"><button class="btn primary" type="submit">Continuer →</button></div></form>',
      'Créer une entreprise','Étape 1 · Identité du tenant Enterprise.');
  }
  function renderStep2(){
    var selected=ui.draft.selected;
    var selectedHtml=selected?'<div class="ep-owner-selected"><b>'+esc(selected.full_name||'Utilisateur FIXEO')+'</b><span>'+esc(selected.email||selected.phone||selected.user_id)+'</span><small>Rôle global · '+esc(selected.global_role||'client')+' · UUID '+esc(selected.user_id)+'</small><button class="btn" data-ep-clear-owner>Changer</button></div>':'';
    renderShell(
      '<div class="ep-tabs" role="tablist"><button class="btn '+(ui.draft.owner_mode==='existing'?'primary':'')+'" data-ep-mode="existing">Utilisateur FIXEO existant</button><button class="btn '+(ui.draft.owner_mode==='invite'?'primary':'')+'" data-ep-mode="invite">Inviter un nouveau propriétaire</button></div>'+
      (ui.draft.owner_mode==='existing'?
        '<form id="ep-owner-search" class="ep-form"><label>UUID, email ou téléphone exact<input class="control" name="query" minlength="3" required placeholder="Recherche exacte uniquement"></label><div class="ep-actions"><button class="btn" type="submit">Rechercher</button></div></form><div id="ep-owner-results"></div>'+selectedHtml
        :
        '<form id="ep-owner-email" class="ep-form"><label>Email du propriétaire<input class="control" name="email" type="email" required value="'+esc(ui.draft.owner_email)+'" placeholder="direction@entreprise.ma"></label><div class="ep-truth"><b>Invitation fondatrice</b><span>Le destinataire devra se connecter avec cette adresse et accepter le lien. Le token brut ne sera jamais stocké.</span></div></form>'
      )+
      '<div class="ep-actions split"><button class="btn" data-ep-back>← Retour</button><button class="btn primary" data-ep-next-owner '+((ui.draft.owner_mode==='existing'&&!selected)?'disabled':'')+'>Continuer →</button></div>',
      'Choisir le propriétaire','Étape 2 · Association explicite ou invitation sécurisée.');
  }
  function renderStep3(){
    var assigning=!!ui.draft.assign_existing;
    var owner=ui.draft.owner_mode==='existing'
      ? (ui.draft.selected?(ui.draft.selected.full_name||ui.draft.selected.email||ui.draft.selected.phone):'—')
      : ui.draft.owner_email;
    renderShell(
      '<div class="ep-review"><div><span>Entreprise</span><b>'+esc(ui.draft.name)+'</b><small>'+esc(ui.draft.legal_name||'Raison sociale non renseignée')+'</small></div>'+
      '<div><span>Propriétaire</span><b>'+esc(owner)+'</b><small>'+(ui.draft.owner_mode==='existing'?(assigning?'Activation immédiate sur ce tenant':'Activation immédiate après création'):'Invitation fondatrice · 7 jours')+'</small></div>'+
      '<div><span>Contrôle</span><b>'+(assigning?'Audit + garde owner':'Idempotence + audit')+'</b><small>'+(assigning?'L’assignation est refusée si un propriétaire courant existe.':'Une double validation ne crée pas deux entreprises.')+'</small></div></div>'+
      '<label class="ep-confirm"><input type="checkbox" id="ep-confirm-check"> Je confirme l’entreprise et le propriétaire ci-dessus.</label>'+
      '<div class="ep-actions split"><button class="btn" data-ep-back>← Retour</button><button class="btn primary" data-ep-submit disabled>'+(assigning?'Assigner le propriétaire':'Créer l’espace Entreprise')+'</button></div>',
      assigning?'Confirmer le propriétaire':'Confirmer le provisioning','Étape 3 · Dernière vérification avant mutation.');
  }
  function invitationLink(token){
    if(!token)return '';
    return (root&&root.location?root.location.origin:'https://www.fixeo.ma')+'/enterprise-invitation.html?token='+encodeURIComponent(token);
  }
  function renderSuccess(result){
    ui.result=result;ui.enterpriseId=result.enterprise_id;
    var invite=result.owner_state==='invitation_pending';
    var link=invite&&result.invitation_token?invitationLink(result.invitation_token):'';
    renderShell(
      '<div class="ep-success"><span>✓</span><h3>Espace Enterprise créé</h3><p>'+esc(result.enterprise_name||ui.draft.name)+'</p><code>'+esc(result.enterprise_id)+'</code></div>'+
      '<div class="ep-owner-status" data-state="'+esc(result.owner_state||'unknown')+'"><span>PROPRIÉTAIRE</span><b>'+esc(invite?'Invitation en attente':'Actif')+'</b><small>'+esc(result.owner_name||result.owner_email||ui.draft.owner_email||'')+'</small></div>'+
      (link?'<label>Lien d’invitation fondatrice<div class="ep-copy"><input id="ep-invite-link" class="control" readonly value="'+esc(link)+'"><button class="btn" data-ep-copy>Copier</button></div></label><p class="ep-note">Ce lien n’est affiché qu’après création ou rotation. FIXEO ne stocke pas le token brut.</p>':'')+
      '<div class="ep-actions split"><button class="btn" data-ep-open-dossier>Ouvrir le dossier</button>'+(invite?'<button class="btn" data-ep-rotate>Générer un nouveau lien</button><button class="btn danger" data-ep-revoke>Révoquer</button>':'')+'<button class="btn primary" data-ep-done>Terminer</button></div>',
      'Provisioning terminé','Le tenant est enregistré dans les sources canoniques.');
    setState('Provisioning vérifié.','success');
    try{root.FixeoRegisters&&root.FixeoRegisters.invalidate&&root.FixeoRegisters.invalidate();}catch(_){}
  }
  function renderManageLoading(){
    renderShell('<div class="ep-loading">Lecture du propriétaire fondateur…</div>','Gérer le propriétaire','Lecture canonique du tenant Enterprise.');
  }
  function renderManage(s){
    ui.enterpriseId=s.enterprise_id;ui.result=s;
    var pending=s.owner_state==='invitation_pending';
    var missing=s.owner_state==='missing';
    renderShell(
      '<div class="ep-review"><div><span>Entreprise</span><b>'+esc(s.enterprise_name||s.enterprise_id)+'</b><small>'+esc(s.enterprise_status||'')+'</small></div>'+
      '<div><span>Propriétaire</span><b>'+esc(missing?'À définir':pending?'Invitation en attente':s.owner_state||'—')+'</b><small>'+esc(s.owner_name||s.owner_email||s.invitation_email||'')+'</small></div></div>'+
      (pending?'<div class="ep-actions"><button class="btn" data-ep-rotate>Générer un nouveau lien</button><button class="btn danger" data-ep-revoke>Révoquer l’invitation</button></div>':'')+
      (missing?'<div class="ep-truth"><b>Propriétaire manquant</b><span>Utilisez “Assigner un propriétaire” pour rattacher un utilisateur existant ou émettre une nouvelle invitation fondatrice.</span></div><button class="btn primary" data-ep-assign>Assigner un propriétaire</button>':'')+
      '<div class="ep-actions split"><button class="btn" data-ep-open-dossier>Ouvrir le dossier</button><button class="btn primary" data-ep-done>Fermer</button></div>',
      'Gérer le propriétaire','Aucune élévation Admin vers Enterprise OS : seules les appartenances tenant actives ouvrent le workspace.');
  }
  async function loadManage(id){
    renderManageLoading();setState('Lecture…','');
    try{var s=await ownerState(id);renderManage(s);setState('État propriétaire vérifié.','success');}
    catch(e){setState('Lecture impossible · '+e.message,'error');}
  }
  function reset(){
    ui.mode='create';ui.step=1;ui.busy=false;ui.enterpriseId=null;ui.result=null;
    ui.draft={name:'',legal_name:'',owner_mode:'existing',selected:null,owner_email:'',idempotency_key:uuid()};
  }
  function openCreate(){ reset();renderStep1();setState('','');showDialog(); }
  function openManage(id){
    if(!validId(id))return;
    ui.mode='manage';ui.enterpriseId=id;ui.result=null;showDialog();loadManage(id);
  }
  function ownerError(e){
    var r=e&&(e.reason||e.message)||'';
    var map={
      forbidden:'Action réservée aux administrateurs FIXEO.',
      unauthenticated:'Session expirée.',
      owner_target_required:'Choisissez un seul propriétaire.',
      owner_user_not_found:'Utilisateur FIXEO introuvable.',
      invalid_owner_email:'Email propriétaire invalide.',
      founding_owner_already_set:'Un propriétaire fondateur est déjà défini.',
      idempotency_conflict:'La clé d’idempotence a été réutilisée avec un autre contenu.',
      provisioning_conflict:'Conflit de provisioning : relisez le registre avant de recommencer.',
      founder_invitation_not_pending:'Cette invitation n’est plus en attente.',
      enterprise_not_found:'Entreprise introuvable.',
      enterprise_not_active:'Entreprise inactive.'
    };
    return map[r]||('Action non confirmée · '+r);
  }
  async function doSubmit(button){
    if(ui.busy)return;
    ui.busy=true;button.disabled=true;setState('Création sécurisée en cours…','');
    try{
      var result=await provision({
        name:ui.draft.name,legal_name:ui.draft.legal_name,
        owner_mode:ui.draft.owner_mode,
        owner_user_id:ui.draft.selected&&ui.draft.selected.user_id,
        owner_email:ui.draft.owner_email,
        idempotency_key:ui.draft.idempotency_key
      });
      renderSuccess(result);
    }catch(e){setState(ownerError(e),'error');button.disabled=false;}
    finally{ui.busy=false;}
  }
  async function doRotate(button){
    var r=ui.result;if(!r||!validId(ui.enterpriseId)||!validId(r.invitation_id))return;
    button.disabled=true;setState('Rotation sécurisée du lien…','');
    try{
      var out=await rotate(ui.enterpriseId,r.invitation_id);
      ui.result=Object.assign({},r,out,{owner_state:'invitation_pending'});
      var link=invitationLink(out.invitation_token);
      renderManage(ui.result);
      var container=body();
      if(container){
        container.insertAdjacentHTML('beforeend','<label>Nouveau lien d’invitation<div class="ep-copy"><input id="ep-invite-link" class="control" readonly value="'+esc(link)+'"><button class="btn" data-ep-copy>Copier</button></div></label><p class="ep-note">L’ancien lien est immédiatement invalidé.</p>');
      }
      setState('Nouveau lien généré.','success');
    }catch(e){setState(ownerError(e),'error');button.disabled=false;}
  }
  async function doRevoke(button){
    var r=ui.result;if(!r||!validId(ui.enterpriseId)||!validId(r.invitation_id))return;
    if(root.confirm&&!root.confirm('Révoquer cette invitation propriétaire ? Le tenant restera actif mais sans propriétaire tant qu’un nouveau propriétaire n’est pas assigné.'))return;
    button.disabled=true;setState('Révocation…','');
    try{await revoke(ui.enterpriseId,r.invitation_id);await loadManage(ui.enterpriseId);setState('Invitation révoquée.','success');}
    catch(e){setState(ownerError(e),'error');button.disabled=false;}
  }
  async function copyLink(button){
    var input=q('ep-invite-link');if(!input)return;
    try{await root.navigator.clipboard.writeText(input.value);button.textContent='Copié ✓';}
    catch(_){input.focus();input.select();setState('Copie automatique indisponible : le lien est sélectionné.','');}
  }

  function bind(){
    if(!root||!root.document)return;
    root.document.addEventListener('click',function(e){
      var b=e.target.closest('button');if(!b)return;
      if(b.id==='enterprise-provision-open'){e.preventDefault();openCreate();return;}
      if(b.dataset.enterpriseProvisionManage){e.preventDefault();openManage(b.dataset.enterpriseProvisionManage);return;}
      if(b.hasAttribute('data-ep-close')||b.hasAttribute('data-ep-done')){closeDialog();return;}
      if(b.dataset.epMode){ui.draft.owner_mode=b.dataset.epMode;ui.draft.selected=null;renderStep2();return;}
      if(b.hasAttribute('data-ep-clear-owner')){ui.draft.selected=null;renderStep2();return;}
      if(b.hasAttribute('data-ep-back')){ui.step=Math.max(1,ui.step-1);ui.step===1?renderStep1():renderStep2();return;}
      if(b.hasAttribute('data-ep-next-owner')){
        if(ui.draft.owner_mode==='existing'&&!ui.draft.selected){setState('Sélectionnez un utilisateur FIXEO exact.','error');return;}
        var emailForm=q('ep-owner-email');
        if(ui.draft.owner_mode==='invite'){
          var email=emailForm&&new root.FormData(emailForm).get('email');
          if(!validEmail(email)){setState('Saisissez un email valide.','error');return;}
          ui.draft.owner_email=clean(email).toLowerCase();
        }
        ui.step=3;renderStep3();setState('','');return;
      }
      if(b.hasAttribute('data-ep-submit')){doSubmit(b);return;}
      if(b.hasAttribute('data-ep-copy')){copyLink(b);return;}
      if(b.hasAttribute('data-ep-rotate')){doRotate(b);return;}
      if(b.hasAttribute('data-ep-revoke')){doRevoke(b);return;}
      if(b.hasAttribute('data-ep-open-dossier')){closeDialog();root.FixeoDossier&&root.FixeoDossier.open&&root.FixeoDossier.open('enterprise',ui.enterpriseId);return;}
      if(b.hasAttribute('data-ep-assign')){ui.mode='create';ui.step=2;ui.draft={name:ui.result.enterprise_name||'',legal_name:ui.result.legal_name||'',owner_mode:'existing',selected:null,owner_email:'',idempotency_key:uuid(),assign_existing:true};renderStep2();return;}
      if(b.dataset.epOwnerId){
        var raw=b.dataset.epOwnerJson;
        try{ui.draft.selected=JSON.parse(decodeURIComponent(raw));renderStep2();setState('Utilisateur sélectionné.','success');}catch(_){setState('Sélection invalide.','error');}
      }
    });
    root.document.addEventListener('change',function(e){
      if(e.target&&e.target.id==='ep-confirm-check'){var b=root.document.querySelector('[data-ep-submit]');if(b)b.disabled=!e.target.checked;}
    });
    root.document.addEventListener('submit',async function(e){
      if(e.target.id==='ep-company-form'){
        e.preventDefault();var fd=new root.FormData(e.target),name=clean(fd.get('name')),legal=clean(fd.get('legal_name'));
        if(!name){setState('Le nom de l’entreprise est requis.','error');return;}
        ui.draft.name=name;ui.draft.legal_name=legal;ui.step=2;renderStep2();setState('','');return;
      }
      if(e.target.id==='ep-owner-search'){
        e.preventDefault();var fd2=new root.FormData(e.target),query=clean(fd2.get('query')),box=q('ep-owner-results');
        if(box)box.innerHTML='<div class="ep-loading">Recherche exacte…</div>';
        try{
          var rows=await searchOwner(query);
          if(box)box.innerHTML=rows.length?rows.map(function(x){
            return '<article class="ep-owner-result"><div><b>'+esc(x.full_name||'Utilisateur FIXEO')+'</b><span>'+esc(x.email||x.phone||x.user_id)+'</span><small>'+esc(x.global_role)+' · '+esc(x.user_id)+'</small></div><button type="button" class="btn" data-ep-owner-id="'+esc(x.user_id)+'" data-ep-owner-json="'+encodeURIComponent(JSON.stringify(x))+'">Choisir</button></article>';
          }).join(''):'<div class="ep-empty">Aucun utilisateur ne correspond exactement.</div>';
          setState(rows.length?'Résultat exact disponible.':'Aucun résultat exact.','');
        }catch(err){if(box)box.innerHTML='';setState(ownerError(err),'error');}
      }
    });
    var d=dialog();
    if(d)d.addEventListener('cancel',function(){closeDialog();});
  }

  async function assignFromDraft(){
    if(!ui.enterpriseId)throw new Error('INVALID_ENTERPRISE_ID');
    return assignOwner(ui.enterpriseId,{
      owner_mode:ui.draft.owner_mode,
      owner_user_id:ui.draft.selected&&ui.draft.selected.user_id,
      owner_email:ui.draft.owner_email
    });
  }

  // In manage mode, reuse step 2/3 but assign to the existing ownerless tenant.
  var originalDoSubmit=doSubmit;
  doSubmit=async function(button){
    if(ui.draft.assign_existing){
      if(ui.busy)return;ui.busy=true;button.disabled=true;setState('Assignation du propriétaire…','');
      try{var out=await assignFromDraft();ui.result=Object.assign({},out,{enterprise_id:ui.enterpriseId,enterprise_name:ui.draft.name});renderSuccess(ui.result);}
      catch(e){setState(ownerError(e),'error');button.disabled=false;}
      finally{ui.busy=false;}
      return;
    }
    return originalDoSubmit(button);
  };

  if(root&&root.document){
    if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
  }

  return Object.freeze({
    searchOwner:searchOwner,provision:provision,ownerState:ownerState,
    assignOwner:assignOwner,rotate:rotate,revoke:revoke,
    openCreate:openCreate,openManage:openManage,
    _test:{clean:clean,validEmail:validEmail,validId:validId,invitationLink:invitationLink}
  });
});
