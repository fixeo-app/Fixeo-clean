'use strict';
// Deterministic foundations for Bloc 7. No LLM, network call or execution authority.
const C=require('./contracts');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const destinations=new Set(['urgent','operations','trust','finance']);
const abstain=reason=>({status:'abstained',reason,action:null});
function recommendation(signalId,states){
 const signal=C.signals(states).signals.find(s=>s.id===signalId);
 if(!signal||!destinations.has(signal.destination))return abstain('CURRENT_EVIDENCE_REQUIRED');
 return {kind:'Recommendation',status:'admissible',signal_id:signal.id,rule_version:signal.rule_version,reason:signal.title,destination:signal.destination,evidence:signal.evidence,expires_at:new Date(Math.min(...signal.evidence.map(e=>Date.parse(e.as_of)+(C.FRESHNESS[e.source]||60000)))).toISOString(),action:null};
}
function actionProposal(capability,dossier,permissions){
 const cap=Object.hasOwn(C.CAPABILITIES,capability)?C.CAPABILITIES[capability]:null;
 if(!cap||!Array.isArray(permissions)||!permissions.includes(capability))return abstain('CAPABILITY_REQUIRED');
 if(!dossier||dossier.entity_type!==cap.entity||!UUID.test(dossier.id||'')||dossier.summary?.id!==dossier.id)return abstain('CANONICAL_TARGET_REQUIRED');
 const age=Date.now()-Date.parse(dossier.as_of);if(!Number.isFinite(age)||age< -5000||age>60000)return abstain('CURRENT_CONTEXT_REQUIRED');
 // Human input and all domain preconditions are checked by the existing server preview.
 return {kind:'ActionProposal',status:'requires_preview',capability,target_id:dossier.id,authority:cap.authority,requires_confirmation:true,execution_authorized:false};
}
function decisionResult(result,expectedTarget){
 if(result?.ok!==true)return {kind:'DecisionResult',status:'rejected',code:result?.code||'RESULT_UNKNOWN'};
 if(result.verified?.id!==expectedTarget||!UUID.test(result.audit_id||'')||!UUID.test(result.correlation_id||'')||!UUID.test(result.idempotency_key||''))return abstain('VERIFIED_AUDITED_RESULT_REQUIRED');
 return {kind:'DecisionResult',status:'verified',target_id:expectedTarget,audit_id:result.audit_id,correlation_id:result.correlation_id,idempotency_key:result.idempotency_key};
}
module.exports={recommendation,actionProposal,decisionResult};
