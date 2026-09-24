(function(){
  'use strict';
  var message=document.getElementById('fxei-message');
  var actions=document.getElementById('fxei-actions');
  var accept=document.getElementById('fxei-accept');
  var login=document.getElementById('fxei-login');
  var workspace=document.getElementById('fxei-workspace');
  var token=(new URLSearchParams(location.search).get('token')||'').trim();

  function show(text){ message.textContent=text; actions.hidden=false; }
  function validToken(value){ return /^[0-9a-f]{64}$/i.test(value); }

  async function init(){
    if(!validToken(token)){
      accept.hidden=true; login.hidden=true; workspace.hidden=true;
      show('Ce lien d’invitation est invalide ou incomplet.');
      return;
    }
    try{
      var loader=window.FixeoSupabaseClient;
      if(!loader||!loader.CONFIGURED||!window.FixeoEnterpriseInvitationActions) throw new Error('UNAVAILABLE');
      var ready=await loader.ready();
      if(!ready||!ready.client) throw new Error('UNAVAILABLE');
      var session=await ready.client.auth.getSession();
      if(!session||session.error||!session.data||!session.data.session){
        accept.hidden=true; login.hidden=false; workspace.hidden=true;
        show('Connectez-vous avec l’adresse email qui a reçu cette invitation, puis ouvrez de nouveau ce lien.');
        return;
      }
      accept.hidden=false; login.hidden=true; workspace.hidden=true;
      show('Votre session est prête. L’adresse email du compte sera vérifiée côté serveur au moment de l’acceptation.');
      accept.addEventListener('click',async function(){
        accept.disabled=true;
        try{
          var result=await window.FixeoEnterpriseInvitationActions.accept(ready.client,token);
          history.replaceState(null,'','enterprise-invitation.html');
          accept.hidden=true; login.hidden=true;
          workspace.href='dashboard-enterprise.html?enterprise_id='+encodeURIComponent(result.enterprise_id);
          workspace.hidden=false;
          show('Invitation acceptée. Votre accès Enterprise est maintenant actif.');
        }catch(error){
          var reason=error&&(error.reason||error.message)||'';
          var text=reason==='invitation_identity_mismatch'?'Cette invitation ne correspond pas à l’adresse email de ce compte.'
            :reason==='invitation_expired'?'Cette invitation a expiré.'
            :reason==='invitation_not_pending'?'Cette invitation n’est plus en attente.'
            :reason==='membership_conflict'?'Ce compte dispose déjà d’un accès actif ou suspendu à cette entreprise.'
            :reason==='identity_not_ready'?'Ce compte doit terminer son initialisation FIXEO avant d’accepter l’invitation.'
            :reason==='invalid_token'||reason==='invitation_not_found'?'Cette invitation est invalide ou introuvable.'
            :'Impossible d’accepter cette invitation. Réessayez.';
          show(text);
        }finally{ accept.disabled=false; }
      },{once:true});
    }catch(_){
      accept.hidden=true; login.hidden=false; workspace.hidden=true;
      show('Le service d’invitation est momentanément indisponible.');
    }
  }
  init();
})();