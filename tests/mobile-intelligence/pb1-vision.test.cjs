'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createOpenAIAdapter}=require('../../api/diagnostic/providers/openai');
const {sanitizePhoto}=require('../../api/diagnostic/media');
const {analyze}=require('../../api/diagnostic/engine');
const {hash}=require('../../api/diagnostic/auth');
const {photoInstructions,descriptivePhotoInstructions}=require('../../api/diagnostic/photo-grounding');
const id='dc986e10-b315-4000-8000-2d458b457704';
const respond=value=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}],usage:{}});
test('PB1 image: actual repository photograph survives sanitization and arrives byte-identical at vision boundary',async()=>{
 const raw=fs.readFileSync(path.join(__dirname,'../../img/blog/plomberie-blog.webp'));
 const safe=await sanitizePhoto(raw,'image/webp',raw.length);let vision=0,synthesis=0;
 const provider=createOpenAIAdapter({env:{OPENAI_API_KEY:'fixture-only',FIXEO_DIAGNOSTIC_MODEL:'fixture'},photoPolicy:'descriptive',fetchImpl:async(_url,init)=>{
  const body=JSON.parse(init.body);assert.equal(body.store,false);
  if(body.text.format.name==='fixeo_photo_evidence_v1'){
   vision++;const image=body.input[0].content.find(c=>c.type==='input_image');assert.ok(image);assert.equal(image.detail,'high');
   assert.equal(hash(Buffer.from(image.image_url.split(',')[1],'base64')),safe.sha256);
   assert.equal(body.instructions,descriptivePhotoInstructions);
   assert.ok(!JSON.stringify(body.input).includes('fixture declaration'));
   return respond({photos:[{media_id:id,status:'informative',observations:[{text:'Un tuyau blanc se trouve sous un évier.',location:'au centre'}],safety_signals:[]}]});
  }
  synthesis++;return respond({trade:'plomberie',problem:'Aucun défaut identifiable uniquement à partir de cette image.',observations:[],hypotheses:[],urgency:'low',urgency_reason:'Aucun problème déclaré.',checks:['Précisez le problème rencontré.'],possible_parts:[],question_ids:[],safety_signals:[]});
 }});
 const result=await analyze({input:{description:'',answers:{},safety_signals:[]},media:[{id,path:'memory:'+id,sha256:safe.sha256}]},{provider,mediaStore:{download:async()=>safe.bytes}});
 assert.equal(vision,1);assert.equal(synthesis,1);assert.ok(result.result.facts.some(f=>f.provenance==='observed'&&f.media_ids.includes(id)));
 assert.equal(result.result.facts.find(f=>f.provenance==='user_declared').value,'');
 assert.match(result.result.problem.value,/Aucun défaut identifiable/);
});
test('PB1 descriptive photo policy is opt-in; web safety and provenance are retained',()=>{
 assert.match(photoInstructions,/an unrelated scene/);assert.doesNotMatch(descriptivePhotoInstructions,/an unrelated scene/);
 for(const term of ['Ignore people and personal data','No repair instructions','No visible defect is different from no visible object'])assert.ok(descriptivePhotoInstructions.includes(term));
});
test('PB1 live proof gate rejects generic fallback, declarations used as observations and lost privacy',()=>{
 const {verifyResult}=require('./pb1-vision-live.cjs');
 const body={ok:true,privacy:{persisted:false,raw_photo_retained:false,sanitized_photo_retained:false},result:{
  facts:[{key:'user_description',value:'',provenance:'user_declared'},{value:'Des bâtiments sont visibles.',provenance:'observed',media_ids:[id]}],
  photo_assessments:[{media_id:id,status:'informative'}],hypotheses:[],problem:{value:'Aucun défaut identifiable uniquement à partir de cette image.'},checks:[],safety:{stop:false}}};
 assert.equal(verifyResult(body).generic_fallback,false);
 const fallback=structuredClone(body);fallback.result.problem.value='Aucune observation photo claire disponible. À confirmer sur place.';
 assert.throws(()=>verifyResult(fallback),/GENERIC_PHOTO_FALLBACK/);
 const declaration=structuredClone(body);declaration.result.facts[1].provenance='user_declared';
 assert.throws(()=>verifyResult(declaration),/OBSERVED_EMPTY/);
 const retained=structuredClone(body);retained.privacy.persisted=true;
 assert.throws(()=>verifyResult(retained),/EPHEMERAL_PRIVACY/);
});

test('PB1 calibrated image-to-result: an unused socket keeps OBSERVED/DECLARED/HYPOTHESIS/UNCERTAINTY without invented electrical urgency',async()=>{
 const raw=fs.readFileSync(path.join(__dirname,'../../img/blog/plomberie-blog.webp'));
 const safe=await sanitizePhoto(raw,'image/webp',raw.length);
 let calls=0;
 const provider=createOpenAIAdapter({env:{OPENAI_API_KEY:'fixture-only',FIXEO_DIAGNOSTIC_MODEL:'fixture'},photoPolicy:'descriptive',fetchImpl:async(_url,init)=>{
  const body=JSON.parse(init.body);calls++;
  if(body.text.format.name==='fixeo_photo_evidence_v1'){
   assert.match(body.instructions,/unused wall socket/);
   const image=body.input[0].content.find(c=>c.type==='input_image');assert.equal(hash(Buffer.from(image.image_url.split(',')[1],'base64')),safe.sha256);
   // Provider boundary fixture, not a claim that this photograph depicts a socket.
   return respond({photos:[{media_id:id,status:'informative',observations:[{text:'Une prise murale sans câble branché.',location:'au centre'}],safety_signals:[]}]});
  }
  assert.match(body.instructions,/Absence of information is never a technical defect/);
  return respond({trade:'electricite',problem:'Risque électrique potentiel.',observations:[],hypotheses:['La prise non utilisée pourrait présenter un risque électrique.'],urgency:'high',urgency_reason:'Risque potentiel.',checks:[],possible_parts:[],question_ids:[],safety_signals:['electrical_risk']});
 }});
 const output=await analyze({input:{description:'',answers:{},safety_signals:[]},media:[{id,path:'memory:'+id,sha256:safe.sha256}]},{provider,mediaStore:{download:async()=>safe.bytes}});
 const r=output.result;assert.equal(calls,2);
 assert.equal(r.facts.find(f=>f.provenance==='observed').value,'Une prise murale sans câble branché. (au centre)');
 assert.equal(r.facts.find(f=>f.provenance==='user_declared').value,'');
 assert.ok(r.hypotheses.every(h=>h.provenance==='ai_inferred'));assert.match(r.hypotheses[0].value,/indéterminé/);
 assert.match(r.checks.join(' '),/ne permet pas de conclure/);assert.equal(r.urgency.value,'low');assert.equal(r.safety.stop,false);assert.deepEqual(r.safety.signals,[]);
 assert.doesNotMatch(JSON.stringify(r),/risque électrique potentiel|aucune observation photo claire disponible/i);
});
test('PB1 socket calibration never removes declared symptoms, damaged equipment or isolated hazards',()=>{
 const {calibrateDescriptiveSynthesis}=require('../../api/diagnostic/mobile-calibration');
 const result={safety_signals:['electricity'],urgency:'critical'};
 const photos=[{status:'informative',observations:[{text:'Une prise murale sans câble branché.'}],safety_signals:[]}];
 assert.equal(calibrateDescriptiveSynthesis(result,photos,{description:'Une odeur de brûlé.',answers:{}}),result);
 assert.equal(calibrateDescriptiveSynthesis(result,photos,{description:'',answers:{smoke_sparks:'yes'}}),result);
 for(const hazard of ['electricity','electrical_risk','fire','gas','flood','structure'])assert.equal(calibrateDescriptiveSynthesis(result,[{...photos[0],safety_signals:[hazard]}],{}),result);
 assert.equal(calibrateDescriptiveSynthesis(result,[{...photos[0],observations:[{text:'Une prise cassée sans câble branché.'}]}],{}),result);
});
