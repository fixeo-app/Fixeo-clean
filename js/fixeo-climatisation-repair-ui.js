/* Same-visit cash credit is acknowledged by artisan AND client. No online charge. */
(function(){
 'use strict';
 var pilot=window.FixeoClimatisationPilot;
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
  var body={action:'climatisation_repair_'+action,tracking_ref:access.tracking_ref,guest_token:access.guest_token};
  if(p){body.proposal_id=p.id;body.diagnostic_paid_minor=p.diagnostic_paid_minor;body.consent_version='climatisation-same-visit-v1';}
  var res=await fetch('/api/guest-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  var data=await res.json();if(!res.ok||!data.ok)throw Error('Proposition indisponible ou expirée. Actualisez le suivi avant de poursuivre.');return data.repair;
 }
 async function mountGuest(card,req,access){
  if(!access||String(req.service_category).toLowerCase()!=='climatisation')return;
  var box=node('section');box.className='fx-climatisation-repair';card.appendChild(box);
  async function load(){try{render(await guest(access,'read'));}catch(e){box.replaceChildren(node('p',e.message),button('Actualiser la proposition',load));}}
  function render(state){
   box.replaceChildren();box.removeAttribute('data-fx-climatisation-review');if(!state||!state.proposal)return;
   var p=state.proposal;
   if(p.status==='PENDING'||p.status==='ACCEPTED')summary(box,p);
   if(p.status==='ACCEPTED'){box.appendChild(node('p','Entretien accepté. Le diagnostic est inclus dans ce total ; il ne doit pas être refacturé.'));return;}
   if(p.status!=='PENDING'){box.appendChild(node('p',p.status==='DECLINED'?'Proposition refusée. Le diagnostic seul reste dû aux conditions acceptées.':'Proposition expirée. Demandez à l’artisan une nouvelle proposition avant tous travaux.'));line(box,'Total de la prestation actuellement acceptée',state.current_total_minor);box.appendChild(button('Actualiser',load));return;}
   box.dataset.fxClimatisationReview='true';
   box.appendChild(node('p','Proposition valable jusqu’à '+new Date(p.expires_at).toLocaleTimeString('fr-MA')+'. Aucun paiement en ligne n’est déclenché.'));
   var consent=check(box,'Je confirme le montant déjà versé indiqué ci-dessus et j’accepte cet entretien, ce périmètre et ce total pendant la même visite, avant le début des travaux.');
   var error=node('p');error.setAttribute('role','status');box.appendChild(error);
   var accept=button('Accepter l’entretien',function(){decide('accept');});accept.disabled=true;consent.addEventListener('change',function(){accept.disabled=!consent.checked;});
   var decline=button('Refuser ou signaler un montant incorrect',function(){decide('decline');});
   box.appendChild(accept);box.appendChild(decline);box.appendChild(button('Actualiser la proposition',load));
   async function decide(action){if(action==='accept'&&!consent.checked)return;accept.disabled=true;decline.disabled=true;try{render(await guest(access,action,p));}catch(e){error.textContent=e.message;accept.disabled=!consent.checked;decline.disabled=false;}}
  }
  await load();
 }
 async function openArtisan(sb,missionId,onChanged){
  var dialog=node('dialog');dialog.style.cssText='max-width:640px;width:90%;max-height:85vh;overflow:auto;padding:24px;border:1px solid #556;border-radius:12px;background:#172233;color:white';
  var content=node('div'),close=button('Fermer',function(){dialog.close();dialog.remove();});dialog.appendChild(close);dialog.appendChild(content);document.body.appendChild(dialog);dialog.showModal();dialog.addEventListener('cancel',function(){dialog.remove();});
  async function rpc(params){var result=await sb.rpc('climatisation_repair_artisan_v1',Object.assign({p_mission_id:missionId},params||{}));if(result.error)throw Error('Opération impossible. Vérifiez que la mission est en cours et que la proposition est toujours valable.');return result.data;}
  async function load(){try{render(await rpc());}catch(e){content.replaceChildren(node('p',e.message),button('Réessayer',load));}}
  function render(state){
   content.replaceChildren();if(!state){content.appendChild(node('p','Cette mission ne relève pas du pilote climatisation.'));return;}
   if(state.direct_service_code){
    var direct=pilot.services[state.direct_service_code];
    if(!direct){content.appendChild(node('p','Périmètre indisponible. Contactez FIXEO.'));return;}
    content.appendChild(node('h2','Vérifications avant intervention'));
    content.appendChild(node('p',direct.scope));line(content,'Total accepté',state.current_total_minor);line(content,'Prestation artisan avant coûts et charges',direct.vap_minor);if(direct.materials_minor)line(content,'Fournitures incluses',direct.materials_minor);line(content,'Frais FIXEO',direct.commission_minor);
    if(state.prework_confirmed){
     content.appendChild(node('p','Vérifications professionnelles enregistrées. Réalisez uniquement les travaux convenus ; tout écart impose un arrêt et un nouvel accord.'));
     if(!state.completion_required)return;
     if(state.completion_confirmed){content.appendChild(node('p','Contrôles de mise en service enregistrés.'));return;}
     if(!state.can_confirm_prework){content.appendChild(node('p','Cette mission ne permet plus de nouvelles attestations.'));return;}
     content.appendChild(node('h3','Après la pose : contrôles réellement effectués'));
     var doneChecks={tightness_verified:true,vacuum_completed:true,commissioning_successful:true};
     var donePrompts=['J’ai effectué les contrôles d’étanchéité prescrits et constaté un résultat satisfaisant.','J’ai effectué le tirage au vide selon les prescriptions du fabricant.','J’ai effectué la mise en service et les essais avec succès ; aucun supplément ni appoint de fluide n’a été nécessaire.'];
     var finished=donePrompts.map(function(t){return check(content,t);}),feedback=node('p');feedback.setAttribute('role','status');content.appendChild(feedback);
     var finish=button('Enregistrer la mise en service',async function(){if(finished.some(function(c){return !c.checked;})){feedback.textContent='Confirmez les trois contrôles réellement effectués.';return;}finish.disabled=true;try{var result=await sb.rpc('climatisation_completion_artisan_v1',{p_mission_id:missionId,p_professional_checks:doneChecks});if(result.error)throw Error('Mise en service non enregistrée. Actualisez la mission.');render(result.data);if(onChanged)onChanged();}catch(e){feedback.textContent=e.message;finish.disabled=false;}});content.appendChild(finish);return;
    }
    if(!state.can_confirm_prework){content.appendChild(node('p','Démarrez la visite depuis la mission avant de confirmer vos vérifications.'));return;}
    var pro=Object.keys(direct.professional_checks).map(function(k){return check(content,pilot.professionalPrompts[k]);});
    content.appendChild(node('p','Si une condition échoue, ne commencez pas l’entretien et contactez FIXEO. Aucun supplément automatique.'));
    var status=node('p');status.setAttribute('role','status');content.appendChild(status);
    var save=button('Enregistrer mes vérifications avant travaux',async function(){
     if(pro.some(function(c){return !c.checked;})){status.textContent='Confirmez chaque vérification professionnelle.';return;}
     save.disabled=true;
     try{var result=await sb.rpc('climatisation_prework_artisan_v1',{p_mission_id:missionId,p_professional_checks:direct.professional_checks});if(result.error)throw Error('Vérifications non enregistrées. Actualisez la mission avant de poursuivre.');render(result.data);if(onChanged)onChanged();}catch(e){status.textContent=e.message;save.disabled=false;}
    });content.appendChild(save);return;
   }
   content.appendChild(node('h2','Diagnostic et entretien, même visite'));
   if(state.proposal){summary(content,state.proposal);content.appendChild(node('p',{PENDING:'En attente de l’accord du client dans son suivi FIXEO. Ne commencez pas l’entretien avant cet accord.',ACCEPTED:'Accord client enregistré. Facturez seulement le reste à payer indiqué.',DECLINED:'Le client a refusé. Vérifiez le périmètre et le montant déjà versé avant de proposer à nouveau.',EXPIRED:'La proposition a expiré.'}[state.proposal.status]));content.appendChild(button('Vérifier l’accord client',async function(){await load();if(onChanged)onChanged();}));}
   if(!state.can_propose){if(!state.proposal)content.appendChild(node('p','Démarrez la visite depuis la mission avant de proposer un entretien.'));return;}
   var select=node('select'),blank=node('option','Choisir l’entretien');blank.value='';select.appendChild(blank);select.setAttribute('aria-label','Entretien');
   Object.keys(pilot.services).filter(function(k){return pilot.services[k].followup;}).forEach(function(k){var opt=node('option',pilot.services[k].label+' — '+money(pilot.services[k].total_minor));opt.value=k;select.appendChild(opt);});content.appendChild(select);
   var details=node('div');content.appendChild(details);
   select.addEventListener('change',function(){
    details.replaceChildren();var s=pilot.services[select.value];if(!s)return;
    details.appendChild(node('p',s.scope));
    var checks=pilot.questions(select.value).map(function(q){return check(details,'Périmètre constaté : '+pilot.labels[s.inputs[q.input_id]]+'.');});
    var professional=Object.keys(s.professional_checks).map(function(k){return check(details,pilot.professionalPrompts[k]);});
    var visit=check(details,'Je confirme qu’il s’agit du même appareil, de la même visite et de la même mission. L’entretien attendra l’accord du client.');
    var paid=node('select');paid.setAttribute('aria-label','Diagnostic déjà encaissé');[['','Diagnostic déjà encaissé ?'],['0','Aucun encaissement (0 DH)'],['26000','Diagnostic reçu intégralement (260 DH)']].forEach(function(o){var opt=node('option',o[1]);opt.value=o[0];paid.appendChild(opt);});details.appendChild(paid);
    details.appendChild(node('p','Montant partiel, désaccord, seconde visite ou besoin hors périmètre : contactez FIXEO avant tous travaux.'));
    var err=node('p');err.setAttribute('role','status');details.appendChild(err);
    var proposalId=window.crypto.randomUUID();
    var send=button('Soumettre au client dans son suivi',async function(){
     if(paid.value===''||!visit.checked||checks.concat(professional).some(function(c){return !c.checked;})){err.textContent='Confirmez chaque condition et le montant déjà reçu.';return;}
     send.disabled=true;try{render(await rpc({p_service_code:select.value,p_inputs:s.inputs,p_paid_minor:Number(paid.value),p_proposal_id:proposalId,p_same_visit:true,p_professional_checks:s.professional_checks}));if(onChanged)onChanged();}catch(e){err.textContent=e.message;send.disabled=false;}
    });details.appendChild(send);
   });
  }
  await load();
 }

 async function checkOffer(sb,requestId){
  var result=await sb.rpc('climatisation_offer_artisan_v1',{p_request_id:requestId});
  if(result.error)throw Error('Vérification du périmètre de l’offre indisponible. Réessayez avant acceptation.');
  var state=result.data;if(!state||state.confirmed)return true;
  var service=pilot.services[state.service_code];if(!service||!service.installation)throw Error('Périmètre de pose indisponible.');
  return new Promise(function(resolve){
   var dialog=node('dialog');dialog.style.cssText='max-width:640px;width:90%;max-height:85vh;overflow:auto;padding:24px;border:1px solid #556;border-radius:12px;background:#172233;color:white';
   var resolved=false;function close(ok){if(resolved)return;resolved=true;dialog.close();dialog.remove();resolve(ok);}
   dialog.appendChild(node('h2','Confirmer la pose avant acceptation'));dialog.appendChild(node('p',state.scope));
   line(dialog,'Total client',state.client_total_minor);line(dialog,'Prestation artisan avant coûts et charges',state.vap_minor);line(dialog,'Fournitures incluses',state.materials_minor);line(dialog,'Frais FIXEO',state.commission_minor);
   dialog.appendChild(node('p','Confirmez le modèle et la faisabilité avec FIXEO avant de cocher. Si une information ou fourniture manque, demandez une qualification ou un devis. Aucun supplément automatique.'));
   var checks=Object.keys(service.offer_checks).map(function(k){return check(dialog,pilot.professionalPrompts[k]);});
   var error=node('p');error.setAttribute('role','status');dialog.appendChild(error);
   var save=button('Confirmer le kit et poursuivre l’acceptation',async function(){
    if(checks.some(function(c){return !c.checked;})){error.textContent='Confirmez chaque condition avant d’accepter.';return;}
    save.disabled=true;try{var reply=await sb.rpc('climatisation_offer_artisan_v1',{p_request_id:requestId,p_professional_checks:service.offer_checks});if(reply.error||!reply.data||!reply.data.confirmed)throw Error('Confirmation non enregistrée. Actualisez l’offre.');close(true);}catch(e){error.textContent=e.message;save.disabled=false;}
   });dialog.appendChild(save);dialog.appendChild(button('Fermer sans accepter',function(){close(false);}));dialog.addEventListener('cancel',function(e){e.preventDefault();close(false);});document.body.appendChild(dialog);dialog.showModal();
  });
 }
 window.FixeoClimatisationRepair={mountGuest:mountGuest,openArtisan:openArtisan,checkOffer:checkOffer};
})();
