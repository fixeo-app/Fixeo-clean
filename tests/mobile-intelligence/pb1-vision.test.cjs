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
