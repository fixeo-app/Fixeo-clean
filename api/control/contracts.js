'use strict';
const VERSION='control-v1';
const SOURCES=Object.freeze(['requests','missions','artisans','trust','network','finance']);
const ENTITY_TYPES=Object.freeze(['request','mission','quote','artisan','client','claim','enterprise','site','worker','internal_assignment','pricing_offer','diagnostic_summary']);
const CAPABILITIES=Object.freeze({
 'artisan.verify':{authority:'Trust',entity:'artisan',effect:'Vérifier le profil Marketplace et aligner le drapeau historique.'},
 'claim.approve':{authority:'Claims',entity:'claim',effect:'Attribuer le profil au demandeur selon les verrous Claims.'},
 'claim.reject':{authority:'Claims',entity:'claim',effect:'Refuser la revendication sans modifier le propriétaire.'},
 'quote.approve':{authority:'Quotes',entity:'quote',effect:'Approuver cette version et la présenter au client.'},
 'quote.reject':{authority:'Quotes',entity:'quote',effect:'Refuser cette version ; aucune présentation client.'},
 'mission.settle':{authority:'Finance + Pricing',entity:'mission',effect:'Enregistrer le prix final. Aucun reversement n’est déclaré payé.'},
 'finance.declare':{authority:'Finance',entity:'mission',effect:'Déclarer un reversement documenté, en attente de rapprochement.'},
 'finance.confirm':{authority:'Finance',entity:'mission',effect:'Confirmer le rapprochement de ce reversement.'},
 'finance.cancel':{authority:'Finance',entity:'mission',effect:'Annuler le reversement en conservant son historique.'},
 'finance.correct':{authority:'Finance',entity:'mission',effect:'Annuler la déclaration précédente et créer une nouvelle déclaration à rapprocher.'},
 'request.dispatch':{authority:'Dispatch',entity:'request',effect:'Proposer la demande à cet artisan ; son acceptation reste nécessaire.'},
 'request.classify':{authority:'Service Requests',entity:'request',effect:'Changer explicitement la classification utilisée par les métriques.'},
 'artisan.classify':{authority:'Artisans',entity:'artisan',effect:'Changer la classification de ce profil Marketplace.'},
 'enterprise.classify':{authority:'Enterprise',entity:'enterprise',effect:'Changer la classification du compte ; aucun membership créé.'},
});
// The manifest is descriptive. Every RPC re-authorizes public.users.role and domain preconditions.
const MANIFEST=Object.freeze({version:VERSION,roleAuthority:'public.users.role',reads:ENTITY_TYPES,actions:CAPABILITIES,
 privateBusiness:'excluded',sensitiveMedia:'denied',enterprise:{globalRead:'minimal_operational_projection',tenantMutations:'not_delegated'},
 humanAuthority:['READ','UNDERSTAND','RECOMMEND','PREVIEW','CONFIRM','EXECUTE','VERIFY','AUDIT']});
function sourceState(source,{status='unknown',data=null,error=null,startedAt=Date.now(),lastSuccessAt=null,asOf=null,completeness='unknown'}={}){
 if(!['healthy','stale','partial','forbidden','unavailable','unknown'].includes(status))throw Error('INVALID_SOURCE_STATE');
 return {source,status,data,error,last_success_at:lastSuccessAt,as_of:asOf,latency_ms:Math.max(0,Date.now()-startedAt),completeness};
}
function failSource(source,error,previous,startedAt){
 const forbidden=error.code==='FORBIDDEN';
 const keep=!forbidden&&previous?.data!=null;
 return sourceState(source,{status:forbidden?'forbidden':keep?'stale':'unavailable',data:keep?previous.data:null,error:error.code||'DEPENDENCY_UNAVAILABLE',startedAt,lastSuccessAt:keep?previous.last_success_at:null,asOf:keep?previous.as_of:null,completeness:keep?previous.completeness:'unknown'});
}
function metricValue(states,id){
 for(const state of Object.values(states||{})){if(state.status!=='healthy'||state.completeness!=='complete')continue;
 if(state.data?.metric_quality?.[id]&&state.data.metric_quality[id]!=='complete')continue;
 const value=state.data?.metrics?.[id];if(typeof value==='number'&&Number.isFinite(value))return value;
 }return null;
}
function signals(states){
 const out=[];const add=(id,metric,severity,title,destination)=>{const value=metricValue(states,metric);if(value>0)out.push({id,rule_version:'1',severity,title,count:value,evidence:[{metric,value}],destination,action:null});};
 add('urgent.active','urgency.active','high','Demandes urgentes actives','urgent');
 add('requests.waiting','requests.new','medium','Demandes nouvelles à qualifier','operations');
 add('claims.pending','trust.claims.pending','medium','Revendications en attente de revue','trust');
 add('verification.conflict','artisans.verification_conflict','medium','Drapeaux de vérification incohérents','trust');
 add('mission.inconsistent','missions.inconsistent','high','Cycles mission/demande à réconcilier','operations');
 add('finance.price','finance.price_missing','medium','Prix finaux à vérifier','finance');
 const degraded=SOURCES.filter(x=>states[x]?.status!=='healthy');
 return {contract_version:VERSION,signals:out,coverage:degraded.length?'partial':'complete',unknown_sources:degraded,
 briefing:degraded.length?'Synthèse partielle : certaines sources ne sont pas disponibles.':out.length?'Des dossiers nécessitent une revue.':'Aucun signal détecté par les règles couvertes.',llm_required:false};
}
module.exports={VERSION,SOURCES,ENTITY_TYPES,CAPABILITIES,MANIFEST,sourceState,failSource,metricValue,signals};
