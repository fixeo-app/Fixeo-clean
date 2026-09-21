/* Same-visit cash credit is acknowledged by artisan AND client. No online charge. */
(function(){
 'use strict';
 var pilot=window.FixeoElectricityPilot;
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
  var body={action:'electricity_repair_'+action,tracking_ref:access.tracking_ref,guest_token:access.guest_token};
  if(p){body.proposal_id=p.id;body.diagnostic_paid_minor=p.diagnostic_paid_minor;body.consent_version='electricity-same-visit-v1';}
  var res=await fetch('/api/guest-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  var data=await res.json();if(!res.ok||!data.ok)throw Error('Proposition indisponible ou expirée. Actualisez le suivi avant de poursuivre.');return data.repair;
 }
 async function mountGuest(card,req,access){
  if(!access||String(req.service_category).toLowerCase()!=='electricite')return;
  var box=node('section');box.className='fx-electricity-repair';card.appendChild(box);
  async function load(){try{render(await guest(access,'read'));}catch(e){box.replaceChildren(node('p',e.message),button('Actualiser la réparation',load));}}
  function render(state){
   box.replaceChildren();box.removeAttribute('data-fx-electricity-review');if(!state||!state.proposal)return;
   var p=state.proposal;
   if(p.status==='PENDING'||p.status==='ACCEPTED')summary(box,p);
   if(p.status==='ACCEPTED'){box.appendChild(node('p','Réparation acceptée. Le diagnostic est inclus dans ce total ; il ne doit pas être refacturé.'));return;}
   if(p.status!=='PENDING'){box.appendChild(node('p',p.status==='DECLINED'?'Proposition refusée. Le diagnostic seul reste dû aux conditions acceptées.':'Proposition expirée. Demandez à l’artisan une nouvelle proposition avant tous travaux.'));line(box,'Total de la prestation actuellement acceptée',state.current_total_minor);box.appendChild(button('Actualiser',load));return;}
   box.dataset.fxElectricityReview='true';
   box.appendChild(node('p','Proposition valable jusqu’à '+new Date(p.expires_at).toLocaleTimeString('fr-MA')+'. Aucun paiement en ligne n’est déclenché.'));
   var consent=check(box,'Je confirme le montant déjà versé indiqué ci-dessus et j’accepte cette réparation, ce périmètre et ce total pendant la même visite, avant le début des travaux.');
   var error=node('p');error.setAttribute('role','status');box.appendChild(error);
   var accept=button('Accepter la réparation',function(){decide('accept');});accept.disabled=true;consent.addEventListener('change',function(){accept.disabled=!consent.checked;});
   var decline=button('Refuser ou signaler un montant incorrect',function(){decide('decline');});
   box.appendChild(accept);box.appendChild(decline);box.appendChild(button('Actualiser la proposition',load));
   async function decide(action){if(action==='accept'&&!consent.checked)return;accept.disabled=true;decline.disabled=true;try{render(await guest(access,action,p));}catch(e){error.textContent=e.message;accept.disabled=!consent.checked;decline.disabled=false;}}
  }
  await load();
 }
 async function openArtisan(sb,missionId,onChanged){
  var dialog=node('dialog');dialog.style.cssText='max-width:640px;width:90%;max-height:85vh;overflow:auto;padding:24px;border:1px solid #556;border-radius:12px;background:#172233;color:white';
  var content=node('div'),close=button('Fermer',function(){dialog.close();dialog.remove();});dialog.appendChild(close);dialog.appendChild(content);document.body.appendChild(dialog);dialog.showModal();dialog.addEventListener('cancel',function(){dialog.remove();});
  async function rpc(params){var result=await sb.rpc('electricity_repair_artisan_v1',Object.assign({p_mission_id:missionId},params||{}));if(result.error)throw Error('Opération impossible. Vérifiez que la mission est en cours et que la proposition est toujours valable.');return result.data;}
  async function load(){try{render(await rpc());}catch(e){content.replaceChildren(node('p',e.message),button('Réessayer',load));}}
  function render(state){
   content.replaceChildren();if(!state){content.appendChild(node('p','Cette mission ne relève pas du diagnostic electricite à 240 DH.'));return;}
   if(state.direct_service_code){
    var direct=pilot.services[state.direct_service_code];
    if(!direct){content.appendChild(node('p','Périmètre indisponible. Contactez FIXEO.'));return;}
    content.appendChild(node('h2','Vérifications avant réparation électrique'));
    content.appendChild(node('p',direct.scope));line(content,'Total accepté',state.current_total_minor);
    if(state.prework_confirmed){content.appendChild(node('p','Vérifications professionnelles enregistrées. Réalisez uniquement les travaux convenus ; tout écart impose un arrêt et un nouvel accord.'));return;}
    if(!state.can_confirm_prework){content.appendChild(node('p','Démarrez la visite depuis la mission avant de confirmer vos vérifications.'));return;}
    var pro=Object.keys(direct.professional_checks).map(function(k){return check(content,pilot.professionalPrompts[k]);});
    content.appendChild(node('p','Si une condition échoue, ne commencez pas la réparation et contactez FIXEO. Aucun supplément automatique.'));
    var status=node('p');status.setAttribute('role','status');content.appendChild(status);
    var save=button('Enregistrer mes vérifications avant travaux',async function(){
     if(pro.some(function(c){return !c.checked;})){status.textContent='Confirmez chaque vérification professionnelle.';return;}
     save.disabled=true;
     try{var result=await sb.rpc('electricity_prework_artisan_v1',{p_mission_id:missionId,p_professional_checks:direct.professional_checks});if(result.error)throw Error('Vérifications non enregistrées. Actualisez la mission avant de poursuivre.');render(result.data);if(onChanged)onChanged();}catch(e){status.textContent=e.message;save.disabled=false;}
    });content.appendChild(save);return;
   }
   content.appendChild(node('h2','Diagnostic et réparation, même visite'));
   if(state.proposal){summary(content,state.proposal);content.appendChild(node('p',{PENDING:'En attente de l’accord du client dans son suivi FIXEO. Ne commencez pas la réparation avant cet accord.',ACCEPTED:'Accord client enregistré. Facturez seulement le reste à payer indiqué.',DECLINED:'Le client a refusé. Vérifiez le périmètre et le montant déjà versé avant de proposer à nouveau.',EXPIRED:'La proposition a expiré.'}[state.proposal.status]));content.appendChild(button('Vérifier l’accord client',async function(){await load();if(onChanged)onChanged();}));}
   if(!state.can_propose){if(!state.proposal)content.appendChild(node('p','Démarrez la visite depuis la mission avant de proposer une réparation.'));return;}
   var select=node('select'),blank=node('option','Choisir la réparation');blank.value='';select.appendChild(blank);select.setAttribute('aria-label','Réparation');
   Object.keys(pilot.services).filter(function(k){return k!=='electricite.diagnostic';}).forEach(function(k){var opt=node('option',pilot.services[k].label+' — '+money(pilot.services[k].total_minor));opt.value=k;select.appendChild(opt);});content.appendChild(select);
   var details=node('div');content.appendChild(details);
   select.addEventListener('change',function(){
    details.replaceChildren();var s=pilot.services[select.value];if(!s)return;
    details.appendChild(node('p',s.scope));
    var checks=pilot.questions(select.value).map(function(q){return check(details,pilot.prompts[q.prompt_key]);});
    var professional=Object.keys(s.professional_checks).map(function(k){return check(details,pilot.professionalPrompts[k]);});
    var visit=check(details,'Je confirme qu’il s’agit de la même visite et de la même mission. La réparation attendra l’accord du client.');
    var paid=node('select');paid.setAttribute('aria-label','Diagnostic déjà encaissé');[['','Diagnostic déjà encaissé ?'],['0','Aucun encaissement (0 DH)'],['24000','Diagnostic reçu intégralement (240 DH)']].forEach(function(o){var opt=node('option',o[1]);opt.value=o[0];paid.appendChild(opt);});details.appendChild(paid);
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
 window.FixeoElectricityRepair={mountGuest:mountGuest,openArtisan:openArtisan};
})();
