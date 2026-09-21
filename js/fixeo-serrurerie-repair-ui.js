/* Same-visit cash credit is acknowledged by artisan AND client. No online charge. */
(function(){
 'use strict';
 var pilot=window.FixeoSerrureriePilot;
 function node(tag,text){var n=document.createElement(tag);if(text!=null)n.textContent=text;return n;}
 function money(minor){return (minor/100).toLocaleString('fr-MA')+' DH';}
 function button(text,fn){var b=node('button',text);b.type='button';b.className='fxa-btn fxa-btn-primary';b.addEventListener('click',fn);return b;}
 function line(root,label,value){root.appendChild(node('p',label+' : '+money(value)));}
 function summary(root,p){
  root.appendChild(node('h3',p.label));root.appendChild(node('p',p.scope));
  root.appendChild(node('p','Déplacement en ville inclus. Tout travail supplémentaire exige un devis accepté.'));
  line(root,'Total final de cette intervention, diagnostic compris',p.client_total_minor);
  line(root,'Montant artisan',p.vap_minor);line(root,'Frais FIXEO, facturés une seule fois',p.commission_minor);
  line(root,'Diagnostic déjà versé à l’artisan',p.diagnostic_paid_minor);line(root,'Reste à payer à l’artisan',p.remaining_due_minor);
 }
 function check(root,text){var label=node('label'),c=node('input');c.type='checkbox';label.style.display='block';label.style.margin='14px 0';label.appendChild(c);label.appendChild(document.createTextNode(' '+text));root.appendChild(label);return c;}
 async function guest(access,action,p){
  var body={action:'serrurerie_repair_'+action,tracking_ref:access.tracking_ref,guest_token:access.guest_token};
  if(p){body.proposal_id=p.id;body.diagnostic_paid_minor=p.diagnostic_paid_minor;body.consent_version='serrurerie-same-visit-v1';}
  var res=await fetch('/api/guest-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  var data=await res.json();if(!res.ok||!data.ok)throw Error('Proposition indisponible ou expirée. Actualisez le suivi avant de poursuivre.');return data.repair;
 }
 async function mountGuest(card,req,access){
  if(!access||String(req.service_category).toLowerCase()!=='serrurerie')return;
  var box=node('section');box.className='fx-serrurerie-repair';card.appendChild(box);
  async function load(){try{render(await guest(access,'read'));}catch(e){box.replaceChildren(node('p',e.message),button('Actualiser la proposition',load));}}
  function render(state){
   box.replaceChildren();box.removeAttribute('data-fx-serrurerie-review');if(!state||!state.proposal)return;
   var p=state.proposal;
   if(p.status==='PENDING'||p.status==='ACCEPTED')summary(box,p);
   if(p.status==='ACCEPTED'){box.appendChild(node('p','Intervention acceptée. Le diagnostic est inclus dans ce total ; il ne doit pas être refacturé.'));return;}
   if(p.status!=='PENDING'){box.appendChild(node('p',p.status==='DECLINED'?'Proposition refusée. Le diagnostic seul reste dû aux conditions acceptées.':'Proposition expirée. Demandez à l’artisan une nouvelle proposition avant tous travaux.'));line(box,'Total de la prestation actuellement acceptée',state.current_total_minor);box.appendChild(button('Actualiser',load));return;}
   box.dataset.fxSerrurerieReview='true';
   box.appendChild(node('p','Proposition valable jusqu’à '+new Date(p.expires_at).toLocaleTimeString('fr-MA')+'. Aucun paiement en ligne n’est déclenché.'));
   var consent=check(box,'Je confirme le montant déjà versé indiqué ci-dessus et j’accepte cette intervention, ce périmètre et ce total pendant la même visite, avant le début des travaux.');
   var error=node('p');error.setAttribute('role','status');box.appendChild(error);
   var accept=button('Accepter l’intervention',function(){decide('accept');});accept.disabled=true;consent.addEventListener('change',function(){accept.disabled=!consent.checked;});
   var decline=button('Refuser ou signaler un montant incorrect',function(){decide('decline');});
   box.appendChild(accept);box.appendChild(decline);box.appendChild(button('Actualiser la proposition',load));
   async function decide(action){if(action==='accept'&&!consent.checked)return;accept.disabled=true;decline.disabled=true;try{render(await guest(access,action,p));}catch(e){error.textContent=e.message;accept.disabled=!consent.checked;decline.disabled=false;}}
  }
  await load();
 }
 async function openArtisan(sb,missionId,onChanged){
  var dialog=node('dialog');dialog.style.cssText='max-width:640px;width:90%;max-height:85vh;overflow:auto;padding:24px;border:1px solid #556;border-radius:12px;background:#172233;color:white';
  var content=node('div');dialog.appendChild(button('Fermer',function(){dialog.close();dialog.remove();}));dialog.appendChild(content);document.body.appendChild(dialog);dialog.showModal();dialog.addEventListener('cancel',function(){dialog.remove();});
  async function rpc(params){var result=await sb.rpc('serrurerie_repair_artisan_v1',Object.assign({p_mission_id:missionId},params||{}));if(result.error)throw Error('Opération impossible. Vérifiez la mission, les conditions d’accès et la validité de la proposition.');return result.data;}
  async function load(){try{render(await rpc());}catch(e){content.replaceChildren(node('p',e.message),button('Réessayer',load));}}
  function status(root){var n=node('p');n.setAttribute('role','status');root.appendChild(n);return n;}
  function render(state){
   content.replaceChildren();if(!state){content.appendChild(node('p','Cette mission ne relève pas du pilote serrurerie.'));return;}
   var service=pilot.services[state.direct_service_code];if(!service){content.appendChild(node('p','Périmètre indisponible. Contactez FIXEO.'));return;}
   content.appendChild(node('h2',service.label));content.appendChild(node('p',service.scope));
   line(content,'Total accepté, déplacement compris',state.current_total_minor);line(content,'Prestation artisan avant coûts et charges',service.vap_minor);line(content,'Frais FIXEO',service.commission_minor);
   if(service.client_part)content.appendChild(node('p','Pièce compatible fournie par le client. Aucune fourniture incluse dans ce total.'));
   if(state.proposal){summary(content,state.proposal);content.appendChild(node('p',{PENDING:'En attente de l’accord du client dans son suivi FIXEO. Ne commencez pas l’intervention proposée.',ACCEPTED:'Accord client enregistré. Facturez uniquement le reste à payer indiqué après réalisation.',DECLINED:'Proposition refusée. Vérifiez le périmètre et le montant déjà versé.',EXPIRED:'La proposition a expiré.'}[state.proposal.status]));content.appendChild(button('Actualiser l’accord client',load));}
   if(!state.prework_confirmed){
    content.appendChild(node('h3','Avant toute ouverture ou modification'));
    content.appendChild(node('p','Vérifiez visuellement l’identité et le droit d’accès avant intervention. Aucun litige d’occupation ni ouverture pour aller chercher des justificatifs. Ne téléversez aucun document et ne relevez aucun numéro de pièce d’identité. Si le droit n’est pas établi, arrêtez et contactez FIXEO.'));
    if(!state.can_confirm_prework){content.appendChild(node('p','Démarrez la visite depuis la mission pour enregistrer les vérifications, avant tout travail.'));return;}
    var method=node('select');method.setAttribute('aria-label','Type de vérification du droit d’accès');
    [['','Choisir le contrôle réellement effectué'],['OCCUPANT_DOCUMENTS','Identité et justificatif nominatif d’occupation vérifiés'],['AUTHORIZED_MANDATE','Identité, droit du mandant et mandat vérifiés']].forEach(function(o){var option=node('option',o[1]);option.value=o[0];method.appendChild(option);});content.appendChild(method);
    var checks=Object.keys(service.professional_checks).map(function(k){return check(content,pilot.professionalPrompts[k]);}),feedback=status(content);
    var save=button('Enregistrer les vérifications avant intervention',async function(){
     if(!method.value||checks.some(function(c){return !c.checked;})){feedback.textContent='Choisissez le contrôle d’accès effectué et confirmez chaque vérification réelle.';return;}
     save.disabled=true;try{var reply=await sb.rpc('serrurerie_prework_artisan_v1',{p_mission_id:missionId,p_professional_checks:service.professional_checks,p_access_check_type:method.value});if(reply.error)throw Error('Vérifications non enregistrées. Actualisez la mission.');render(reply.data);if(onChanged)onChanged();}catch(e){feedback.textContent=e.message;save.disabled=false;}
    });content.appendChild(save);return;
   }
   content.appendChild(node('p','Vérifications avant intervention enregistrées. Respectez uniquement le périmètre accepté ; tout écart impose un arrêt et un nouvel accord.'));
   if(!state.completion_confirmed){
    if(!state.can_confirm_prework){content.appendChild(node('p','Cette mission ne permet plus de nouvelles attestations.'));return;}
    content.appendChild(node('h3','Après réalisation : résultat effectivement obtenu'));
    var finished=Object.keys(service.completion_checks).map(function(k){return check(content,pilot.professionalPrompts[k]);}),resultStatus=status(content);
    content.appendChild(node('p','Si le résultat convenu n’est pas obtenu, ne confirmez pas une réussite et contactez FIXEO. Aucun diagnostic ou déplacement ajouté rétroactivement.'));
    var done=button('Enregistrer le résultat réalisé',async function(){
     if(finished.some(function(c){return !c.checked;})){resultStatus.textContent='Confirmez uniquement les résultats réellement obtenus.';return;}done.disabled=true;
     try{var reply=await sb.rpc('serrurerie_completion_artisan_v1',{p_mission_id:missionId,p_professional_checks:service.completion_checks});if(reply.error)throw Error('Résultat non enregistré. Actualisez la mission.');render(reply.data);if(onChanged)onChanged();}catch(e){resultStatus.textContent=e.message;done.disabled=false;}
    });content.appendChild(done);return;
   }
   content.appendChild(node('p','Résultat de la prestation acceptée enregistré.'));
   if(!state.can_propose)return;
   content.appendChild(node('h3','Proposer une intervention pendant cette même visite'));
   var select=node('select');select.setAttribute('aria-label','Intervention après diagnostic');var blank=node('option','Choisir l’intervention');blank.value='';select.appendChild(blank);
   Object.keys(pilot.services).filter(function(k){return pilot.services[k].followup;}).forEach(function(k){var opt=node('option',pilot.services[k].label+' — '+money(pilot.services[k].total_minor));opt.value=k;select.appendChild(opt);});content.appendChild(select);
   var details=node('div');content.appendChild(details);
   select.addEventListener('change',function(){
    details.replaceChildren();var s=pilot.services[select.value];if(!s)return;details.appendChild(node('p',s.scope));
    var scope=check(details,'J’ai constaté ce périmètre complet : une porte de logement, créneau 8 h–20 h confirmé, droit d’accès vérifié et, si nécessaire, pièce client compatible déjà disponible.');
    var pro=Object.keys(s.professional_checks).map(function(k){return check(details,pilot.professionalPrompts[k]);});
    var visit=check(details,'Même porte, même artisan, même mission et même visite. Je ne commence pas ces travaux avant l’accord explicite du client.');
    var paid=node('select');paid.setAttribute('aria-label','Diagnostic déjà encaissé');[['','Diagnostic déjà encaissé ?'],['0','Aucun encaissement (0 DH)'],['22000','Diagnostic reçu intégralement (220 DH)']].forEach(function(o){var opt=node('option',o[1]);opt.value=o[0];paid.appendChild(opt);});details.appendChild(paid);
    details.appendChild(node('p','Montant partiel, désaccord, pièce manquante, seconde visite ou ouverture avec remplacement : qualification et devis, sans addition automatique de forfaits.'));
    var feedback=status(details),proposalId=window.crypto.randomUUID();
    var send=button('Soumettre au client dans son suivi',async function(){
     if(paid.value===''||!scope.checked||!visit.checked||pro.some(function(c){return !c.checked;})){feedback.textContent='Confirmez chaque condition et le montant déjà reçu.';return;}send.disabled=true;
     try{render(await rpc({p_service_code:select.value,p_inputs:s.inputs,p_paid_minor:Number(paid.value),p_proposal_id:proposalId,p_same_visit:true,p_professional_checks:s.professional_checks}));if(onChanged)onChanged();}catch(e){feedback.textContent=e.message;send.disabled=false;}
    });details.appendChild(send);
   });
  }
  await load();
 }

 async function checkOffer(sb,requestId){
  var result=await sb.rpc('serrurerie_offer_artisan_v1',{p_request_id:requestId});
  if(result.error)throw Error('Vérification du périmètre de l’offre indisponible. Réessayez avant acceptation.');
  var state=result.data;if(!state||state.confirmed)return true;
  var service=pilot.services[state.service_code];if(!service)throw Error('Périmètre serrurerie indisponible.');
  return new Promise(function(resolve){
   var dialog=node('dialog');dialog.style.cssText='max-width:640px;width:90%;max-height:85vh;overflow:auto;padding:24px;border:1px solid #556;border-radius:12px;background:#172233;color:white';
   var resolved=false;function close(ok){if(resolved)return;resolved=true;dialog.close();dialog.remove();resolve(ok);}
   dialog.appendChild(node('h2','Confirmer le périmètre avant acceptation'));dialog.appendChild(node('p',state.scope));
   line(dialog,'Total client',state.client_total_minor);line(dialog,'Prestation artisan avant coûts et charges',state.vap_minor);if(service.client_part)dialog.appendChild(node('p','Pièce client compatible à fournir ; elle n’est pas comprise dans le total.'));line(dialog,'Frais FIXEO',state.commission_minor);
   dialog.appendChild(node('p','Confirmez le modèle, le créneau et la faisabilité au prix fixe avant de cocher. Pour un remplacement, la pièce client compatible doit déjà être validée. Si une condition manque, demandez une qualification ou un devis. Le droit d’accès sera vérifié sur place avant intervention.'));
   var checks=Object.keys(service.offer_checks).map(function(k){return check(dialog,pilot.professionalPrompts[k]);});
   var error=node('p');error.setAttribute('role','status');dialog.appendChild(error);
   var save=button('Confirmer le périmètre et poursuivre l’acceptation',async function(){
    if(checks.some(function(c){return !c.checked;})){error.textContent='Confirmez chaque condition avant d’accepter.';return;}
    save.disabled=true;try{var reply=await sb.rpc('serrurerie_offer_artisan_v1',{p_request_id:requestId,p_professional_checks:service.offer_checks});if(reply.error||!reply.data||!reply.data.confirmed)throw Error('Confirmation non enregistrée. Actualisez l’offre.');close(true);}catch(e){error.textContent=e.message;save.disabled=false;}
   });dialog.appendChild(save);dialog.appendChild(button('Fermer sans accepter',function(){close(false);}));dialog.addEventListener('cancel',function(e){e.preventDefault();close(false);});document.body.appendChild(dialog);dialog.showModal();
  });
 }
 window.FixeoSerrurerieRepair={mountGuest:mountGuest,openArtisan:openArtisan,checkOffer:checkOffer};
})();
