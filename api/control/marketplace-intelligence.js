'use strict';
const {createHash}=require('node:crypto');
const VERSION='marketplace-intelligence-v1',SOURCES=Object.freeze(['operations','network','commerce']);
const stamp=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
function sourceState(source,data,error,now=Date.now()){
 if(error)return {source,status:error.code==='FORBIDDEN'?'FORBIDDEN':'UNAVAILABLE',error:error.code||'DEPENDENCY_UNAVAILABLE',as_of:null,data:null};
 const at=stamp(data?.as_of);
 if(data?.contract_version!==VERSION||data.source!==source||at===null||at>now+5000||!data.scope_hash||!Array.isArray(data.items)||!Number.isSafeInteger(data.total_cells)||data.total_cells<data.items.length||typeof data.has_more!=='boolean'||data.items.some(x=>typeof x.key!=='string'||!x.facts))return {source,status:'UNAVAILABLE',error:'INVALID_SOURCE_PROVENANCE',as_of:null,data:null};
 return {source,status:now-at>60000?'STALE':'FRESH',error:null,as_of:data.as_of,data};
}
function build(sources,{now=Date.now()}={}){
 const usable=SOURCES.filter(s=>sources[s]?.status==='FRESH');
 const first=usable.length?sources[usable[0]].data:null;
 const states=Object.fromEntries(SOURCES.map(s=>[s,sources[s]||sourceState(s,null,{code:'SOURCE_UNAVAILABLE'},now)]));
 for(const s of usable)if(states[s].data.scope_hash!==first.scope_hash||JSON.stringify(states[s].data.items.map(x=>x.key))!==JSON.stringify(first.items.map(x=>x.key))){states[s]={...states[s],status:'PARTIAL',error:'CONCURRENT_SOURCE_WINDOW',data:null};}
 const cells=first?first.items.map(x=>({key:x.key,city:x.city,trade:x.trade,...Object.fromEntries(SOURCES.map(s=>[s,states[s].status==='FRESH'?states[s].data.items.find(y=>y.key===x.key)?.facts??null:null]))})):[];
 return {contract_version:VERSION,generated_at:new Date(now).toISOString(),status:SOURCES.every(s=>states[s].status==='FRESH')?'FRESH':SOURCES.every(s=>states[s].data===null||states[s].status==='STALE')?'UNAVAILABLE':'PARTIAL',
 sources:states,scope:first?.scope??null,scope_hash:first?.scope_hash??null,cells,opportunities:opportunities(cells),total_cells:first?.total_cells??null,has_more:first?.has_more??false,next_cursor:first?.next_cursor??null,
 unattributed_missions:states.operations.status==='FRESH'?states.operations.data.unattributed_missions:null,
 completeness:'exact cell facts; paginated cell selection; unavailable sources remain null',execution_authorized:false};
}
function opportunities(cells){
 const out=[],valid=n=>Number.isSafeInteger(n)&&n>=0;
 for(const c of cells){const o=c.operations,n=c.network;
  if(!valid(o?.waiting)||o.waiting===0||!valid(o.urgent_waiting))continue;
  const add=(type,priority,title,fact,impact,action,population)=>out.push({id:'growth_'+createHash('sha256').update(c.key+':'+type).digest('hex').slice(0,20),type,priority,cell_key:c.key,city:c.city,trade:c.trade,
   title,evidence:{kind:'FACT',text:fact,request_count:o.waiting,source:'control_marketplace_requests_v1 / control_marketplace_artisans_v1'},reason:`${o.waiting} demande(s) sans engagement dans le stock réel ; ${o.urgent_waiting} urgente(s).`,
   impact:{kind:'INFERENCE',text:impact},recommended_action:{kind:'RECOMMENDATION',text:action,population},authority:'Control read projections → Universal Dossier → canonical authority',execution_authorized:false});
  if(c.city===null||c.trade===null){add('context','P2','Contexte à qualifier','Ville ou métier non résolu par la source canonique.','La correspondance locale peut rester impossible.','Examiner les demandes dont le contexte manque.','waiting');continue;}
  if(!n||!['referenced','available_declared','availability_unknown','claimable','verification_ready'].every(k=>valid(n[k])))continue;
  if(n.referenced===0)add('recruitment',o.urgent_waiting?'P1':'P2','Aucun profil local référencé',`${o.waiting} demandes ; aucun profil ne déclare cette ville et ce métier.`, 'Un manque structurel local est possible ; les proximités Dispatch doivent encore être vérifiées.','Vérifier les demandes et le pool canonique avant de prioriser un recrutement.','waiting');
  else if(n.available_declared===0&&n.availability_unknown===0)add('availability',o.urgent_waiting?'P1':'P2','Réseau local déclaré indisponible',`${n.referenced} profils ; aucun disponible déclaré, aucune disponibilité inconnue.`, 'Une indisponibilité temporaire du réseau local est possible, sans preuve de durée ni de capacité distante.','Examiner la disponibilité déclarée et vérifier la couverture autorisée.','profiles');
  if(n.verification_ready>0)add('verify',o.urgent_waiting?'P1':'P2','Prioriser la revue Trust',`${n.verification_ready} profils revendiqués avec onboarding terminé, non vérifiés.`, 'Une revue de confiance peut aider le réseau sollicité ; elle ne garantit ni disponibilité ni conversion.','Ouvrir les profils, vérifier leurs preuves et préparer la vérification canonique.','verification_ready');
  if(n.claimable>0)add('activate',o.urgent_waiting?'P2':'P3','Examiner les profils à activer',`${n.claimable} profils revendicables sans propriétaire ni claim en attente.`, 'Une revendication légitime pourrait renforcer le réseau local.','Examiner les profils prioritaires ; aucune revendication ni campagne automatique.','claimable');
 }
 return out.sort((a,b)=>a.priority.localeCompare(b.priority)||b.evidence.request_count-a.evidence.request_count||a.id.localeCompare(b.id));
}
module.exports={VERSION,SOURCES,sourceState,build,opportunities};
