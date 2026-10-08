import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverEstimator } from '../lib/estimatorRecovery';
import { photoRelevance, diagnosticFactText } from '../lib/clientDiagnostic';
import { understandLocally } from '../lib/rafi';
import { requestProgress } from '../lib/requestProgress';
import type { EstimatorDraft } from '../lib/clientDrafts';
import type { MobileEstimatorResponse } from '../lib/mobileEstimatorContract';
const result=(token:string,type:string,extra:any={}):MobileEstimatorResponse=>({ok:true,session:{session_token:token,state:'QUALIFYING',metier:'plomberie',service_code:'plomberie.fuite',outcome:null},next_step:{type,...extra}});
const first=result('expired-first','SERVICE_SELECTION',{candidate_services:[{service_code:'plomberie.fuite',label_fr:'Autre intervention'}]}),question=result('expired-q','QUESTION',{question_id:'onset',prompt_fr:'Depuis quand ?',answer_type:'choice',options:[{value:'today',label_fr:'Aujourd’hui'}]}),ready=result('expired-ready','READY');
const outcome:any={outcome_type:'QUOTE_REQUIRED',service_code:null,scope_summary:['À vérifier'],exclusions_summary:[],next_action:null};
const draft:EstimatorDraft={result:{...ready,outcome},history:[{result:first,answer:'plomberie.fuite',label:'Autre intervention'},{result:question,answer:'today',label:'Aujourd’hui'},{result:ready,answer:'',label:''}],answer:'',started:true,confirming:false,phone:'',stopped:false,lastAction:null,pendingConfirmation:null,directKey:null,error:null};
test('Client progress cannot invent assignment or advance a search based on elapsed time',()=>{
 assert.deepEqual(requestProgress('new'),['Demande reçue','Recherche en cours · aucun artisan affecté pour le moment']);
 assert.deepEqual(requestProgress('assigned',null),['Demande reçue']);
 assert.ok(requestProgress('assigned','confirmed-mission').includes('Artisan affecté par FIXEO'));
 assert.ok(!requestProgress('cancelled','old-mission').includes('Artisan affecté par FIXEO'));
});
test('Expired estimator reuses matching answers with fresh authority and never confirms a request',async()=>{
 const calls:any[]=[];
 const r=await recoverEstimator(draft,{city:'fes',description:'Ma chasse d’eau coule sans arrêt.'},async action=>{calls.push(action);switch(action.action){case 'start':return {...first,session:{...first.session!,session_token:'fresh-first'}};case 'select_service':assert.equal(action.session_token,'fresh-first');return {...question,session:{...question.session!,session_token:'fresh-q'}};case 'answer':assert.equal(action.session_token,'fresh-q');assert.equal(action.answer,'today');return {...ready,session:{...ready.session!,session_token:'fresh-ready'}};case 'evaluate':assert.equal(action.session_token,'fresh-ready');return {...ready,session:{...ready.session!,session_token:'fresh-result'},outcome};default:assert.fail('No confirmation is permitted during recovery')}});
 assert.equal(r.result.outcome?.outcome_type,'QUOTE_REQUIRED');assert.deepEqual(calls.map(x=>x.action),['start','select_service','answer','evaluate']);assert.doesNotMatch(JSON.stringify(calls),/expired|confirmed/);
});
test('Changed question, option or safety stop is never replayed blindly',async()=>{
 for(const response of [{...question,next_step:{...question.next_step,prompt_fr:'Une nouvelle question ?'}},{...question,next_step:{...question.next_step,options:[{value:'other'}]}},{ok:true,session:{...question.session,state:'SAFETY_STOP'},outcome:{...outcome,outcome_type:'SAFETY_STOP'}}]){
  let calls=0;const r=await recoverEstimator({...draft,history:draft.history.slice(1)},{city:'fes',description:'Fuite'},async()=>{calls++;return response as MobileEstimatorResponse});assert.equal(calls,1);assert.equal(r.history.length,0);
 }
});
test('Audited television text cannot be misclassified from the substring entreprises',()=>{
 assert.equal(understandLocally({mode:'text',text:'Les entreprises publiques françaises, entre 500 millions et 1 milliard. En France.'}).needsConfirmation,true);
 assert.equal(understandLocally({mode:'text',text:'Ma chasse d’eau coule sans arrêt.'}).serviceCategory,'Plomberie');
});
test('Vision compares only observations with declared need and keeps raw keys out of client prose',()=>{
 const r:any={facts:[{key:'observation_0',value:'Écrans d’ordinateur, clavier et bureau.',provenance:'observed'},{key:'user_description',value:'Ma chasse d’eau coule.',provenance:'user_declared'}],trade:{value:'plomberie',provenance:'ai_inferred'}};
 assert.equal(photoRelevance(r),'unrelated');assert.equal(photoRelevance({...r,facts:[r.facts[1]]}),'uncertain');
 for(const value of ['onset','occurrence','water_spreading'])assert.notEqual(diagnosticFactText({key:'answer',value,provenance:'user_declared'}),value);
});
