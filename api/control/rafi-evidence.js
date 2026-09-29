'use strict';
// B7.1: explicit evidence contracts over B2/B6 observations; no I/O or business authority.
const {createHash}=require('node:crypto');
const stable=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(stable(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(stable(v[k]??null))])):v??null);
const hash=v=>createHash('sha256').update(stable(v)).digest('hex');
const RULES=Object.freeze(Object.fromEntries([
 ['request.waiting','operations','P0 si urgence déclarée sans gagnant ≥120 min ; P1 si urgence/no_match/≥24 h ; sinon P2.'],
 ['mission.inconsistent','operations','P1 : relation ou cycle canonique incohérent.'],
 ['mission.aging','operations','P2 : dernier jalon observé depuis ≥24 h ; blocage seulement hypothétique.'],
 ['quote.review','operations','P1 après 24 h de soumission ; sinon P2 ; version canonique obligatoire.'],
 ['dispatch.failed','operations','P1 : échec enregistré dans l’outbox ; aucune livraison présumée.'],
 ['network.context_missing','network','P2 : ville ou métier inexploitable ; couverture inconnue.'],
 ['network.coverage','network','P1 si demandes urgentes, sinon P2 ; zéro disponibilité déclarée et aucune disponibilité inconnue.'],
 ['network.capacity','network','P3 : profils déclarés disponibles ; capacité réelle non prouvée.'],
 ['network.verify','network','P1 si demande urgente, sinon P2 ; onboarding et propriétaire présents, verified absent.'],
 ['network.activate','network','P2 si demande urgente, sinon P3 ; revendicable sans propriétaire ni claim pending.'],
 ['network.concentration','network','P3 : ≥10 demandes en attente, ≥50 % dans la cellule ; pas de causalité.'],
 ['claim.pending','trust','P1 après 24 h, sinon P2 ; pending ne prouve aucune faute.'],
 ['artisan.verification_conflict','trust','P2 : verified/is_verified divergent ; verified reste canonique.'],
 ['finance.price_missing','finance','P2 : fin canonique et prix absent ; demande source requise pour régler.'],
 ['finance.declared','finance','P2 : reversement déclaré, non rapproché.'],
 ['finance.overpaid','finance','P1 : montant confirmé supérieur à commission ; revue sans correction automatique.'],
 ['enterprise.sla','enterprise','P0 si SLA dépassé sans acceptation et urgence ; P2 si acceptation déjà enregistrée ; sinon P1.'],
 ['enterprise.internal_capacity','enterprise','P2 : offres internes valides en internal_first ; aucune affectation présumée.'],
 ['enterprise.fallback','enterprise','P1 : échéance atteinte en internal_first, état internal_offered/no_internal_candidate.'],
 ['enterprise.dispatch_failed','enterprise','P1 : external_failed canonique ; droits tenant requis.'],
 ['marketplace.conversion_review','network','P2 : fenêtres comparables, ≥30 observables chacune, intervalles Wilson disjoints, baisse observée.'],
].map(([id,source,priority])=>[id,Object.freeze({rule_id:id,version:'1',dependencies:[source],priority_rule:priority,enabled:true})])));
const LEVELS=Object.freeze(['OBSERVED','USER_DECLARED','CANONICAL','DERIVED','INFERRED','UNKNOWN']);
const FIELDS=new Set(['request_id','status','request_status','urgency','quote_version','review_status','reviewed_version','mission_id','amount','confirmed','commission_amount','attempt_count','location_known','profiles','available_profiles','availability_unknown','to_verify','unclaimed','urgent_count','total_waiting','claimable_only','cube_context','mode','valid_internal_offers','fallback_due_at','verified','is_verified','claimed','has_owner','onboarding_completed']);
const SLA_FIELDS=new Set(['acceptance_status','acceptance_due_at','acceptance_at','winner_conflict']);
function minimal(f){const out={};for(const [k,v] of Object.entries(f||{})){if(FIELDS.has(k)&&(v===null||['string','number','boolean'].includes(typeof v)))out[k]=typeof v==='string'?v.slice(0,160):v;if(k==='sla'&&v&&typeof v==='object')out.sla=Object.fromEntries(Object.entries(v).filter(([key,value])=>SLA_FIELDS.has(key)&&(value===null||['string','boolean','number'].includes(typeof value))));}
 if(f?.cohorts){const c=f.cohorts;out.cohorts={scope:c.scope?Object.fromEntries(['from','to','previous_from','days','horizon_hours','timezone'].map(k=>[k,c.scope[k]??null])):null,populations:(c.cohorts||[]).slice(0,2).map(x=>({label:x.label,requests:Object.fromEntries(['total','mature','censored','unknown_acceptance','observable_denominator','accepted_within_horizon'].map(k=>[k,x.requests?.[k]??null]))}))};}return out;}
const level=(field,value)=>value==null?'UNKNOWN':['urgency','availability'].includes(field)?'USER_DECLARED':['request_id','status','request_status','quote_version','review_status','reviewed_version','verified','mode','mission_id'].includes(field)?'CANONICAL':['amount'].includes(field)?'USER_DECLARED':typeof value==='number'||field==='sla'||field==='cohorts'?'DERIVED':'OBSERVED';
function evidence(d,e){
 const value={count:e.count,...minimal(e.facts)},scope={...e.scope,enterprise_id:d.recommended_action.context.enterprise_id??null,site_id:d.recommended_action.context.site_id??null};
 const identity={authority:e.reference,source:e.source,target_type:e.target_type,target_id:e.target_id,scope};
 const fingerprint=hash({identity,value});
 return {kind:'EvidenceRef',evidence_id:'ev_'+hash(identity).slice(0,24),...identity,field:'canonical_observation',value,provenance:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,level(k,v)])),observed_at:e.as_of,event_at:d.created_at,first_observed_at:null,first_observed_reason:'NOT_PERSISTED',fingerprint,quality:e.source_window,version:d.rule_version};
}
function enrich(snapshot,allDecisions,now){
 const groups=new Map();
 for(const d of allDecisions){const rule=RULES[d.decision_type];if(!rule)continue;const refs=d.evidence.map(e=>evidence(d,e));const prior=groups.get(d.decision_id);
  if(prior){for(const e of refs)if(!prior.evidence.some(x=>x.fingerprint===e.fingerprint))prior.evidence.push(e);continue;}
  groups.set(d.decision_id,{kind:'Signal',signal_id:d.decision_id,rule_id:rule.rule_id,rule_version:rule.version,target_type:d.target_type,target_id:d.target_id,scope:d.recommended_action.context,category:rule.dependencies[0],severity:d.priority,state:'active',first_observed_at:null,last_observed_at:d.updated_at,event_at:d.created_at,valid_until:d.expires_at,dependencies:rule.dependencies,evidence:refs,freshness:rule.dependencies.every(s=>snapshot.sources[s]?.status==='FRESH')?'FRESH':'PARTIAL',priority_reason:rule.priority_rule,confidence:'observed_facts',inference:d.impact,execution_authorized:false});
 }
 for(const s of groups.values()){
  s.conflicts=s.evidence.length>1?[{code:'CONTRADICTORY_OBSERVATIONS',evidence:s.evidence.map(e=>({id:e.evidence_id,fingerprint:e.fingerprint}))}]:[];
  if(s.rule_id==='artisan.verification_conflict'||s.evidence.some(e=>e.value.sla?.acceptance_status==='unknown_conflict'))s.conflicts.push({code:'CANONICAL_DIVERGENCE_REVIEW_REQUIRED',evidence:s.evidence.map(e=>({id:e.evidence_id,fingerprint:e.fingerprint}))});
  if(s.conflicts.length){s.state='unknown';s.confidence='conflicted';}
  if(Date.parse(s.valid_until)<=now){s.state='unknown';s.freshness='STALE';}
  s.evidence_fingerprint=hash(s.evidence.map(e=>e.fingerprint).sort());
 }
 for(const d of snapshot.decisions){const s=groups.get(d.decision_id);if(!s)continue;d.canonical_proof=d.evidence[0]?.proof||null;d.signal_id=s.signal_id;d.evidence_refs=s.evidence;d.evidence_fingerprint=s.evidence_fingerprint;d.priority_rule=RULES[s.rule_id];d.conflicts=s.conflicts;d.confidence=s.confidence;
  if(s.state!=='active'||s.freshness!=='FRESH'){d.actionability={...d.actionability,mode:'OPEN',status:'REVIEW_REQUIRED',capability:null,requires_confirmation:false,unavailable_reason:'Preuves incomplètes, divergentes ou périmées ; revue canonique requise.'};}
  d.recommendation={kind:'Recommendation',action_id:d.actionability.capability||'dossier.open',reason:d.reason,urgency:d.priority,impact:d.impact,evidence_ids:s.evidence.map(e=>e.evidence_id),alternatives:['dossier.open'],permission:d.actionability.capability?'SERVER_PREVIEW_REQUIRED':'ADMIN_READ',destination:d.recommended_action.context,valid_until:d.expires_at,preconditions:d.actionability.preconditions};
 }
 const health=Object.entries(snapshot.sources).filter(([,s])=>s.status!=='FRESH').map(([source,s])=>({kind:'Signal',signal_id:'health_'+source,rule_id:'source.degraded',rule_version:'1',category:'source_health',state:'unknown',severity:null,priority_reason:'Aucune priorité métier déduite d’une source absente.',freshness:s.status,error:s.error||null,dependencies:[source],evidence:[],last_observed_at:s.as_of,execution_authorized:false}));
 snapshot.rafi_version='3';snapshot.signals=[...groups.values(),...health];snapshot.rule_registry=Object.values(RULES);snapshot.provenance_levels=LEVELS;
 snapshot.dossier_groups=Object.values(snapshot.decisions.reduce((m,d)=>{const key=hash([d.target_type,d.target_id,d.target_id?null:d.recommended_action.context]);(m[key]??={target_type:d.target_type,target_id:d.target_id,decision_ids:[]}).decision_ids.push(d.decision_id);return m;},{}));
 return snapshot;
}
module.exports={RULES,LEVELS,hash,minimal,enrich};
