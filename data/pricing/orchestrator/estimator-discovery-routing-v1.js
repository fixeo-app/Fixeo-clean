'use strict';
const situations=require('./discovery-routing-v1.json').situations;
const resolver=require('./estimator-service-resolver-v1');
function getSituation(id){return typeof id==='string' && Object.prototype.hasOwnProperty.call(situations,id)?situations[id]:null;}
function quoteCode(session){return 'devis.'+(session.entry_context.situation_id||session.metier||'autre');}
function candidates(session){
 const situation=getSituation(session.entry_context.situation_id);
 let list=resolver.getCandidateServices(session.metier);
 if(situation)list=list.filter(s=>situation.candidate_services.includes(s.service_code));
 const label=list.length?'Autre intervention / besoin à préciser':(situation?.label||'Décrire mon projet pour un devis');
 return [...list,{service_code:quoteCode(session),label_fr:label,short_label_fr:label,commercial_output_type:'FIXEO_QUOTE_REQUIRED'}];
}
function quoteOutcome(session){
 const situation=getSituation(session.entry_context.situation_id);
 return {outcome_type:'QUOTE_REQUIRED',service_code:quoteCode(session),service_label:situation?.label||'Votre projet',commercial_output_type:'FIXEO_QUOTE_REQUIRED',scope_summary:[situation?.label||'Périmètre à préciser avec FIXEO'],exclusions_summary:['Aucun prix ni intervention confirmés à cette étape.'],quote_reason:'Un devis adapté est nécessaire pour ce périmètre.',next_action:'REQUEST_QUOTE'};
}
module.exports={getSituation,candidates,quoteCode,quoteOutcome};
