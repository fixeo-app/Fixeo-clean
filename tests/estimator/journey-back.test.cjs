const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'), vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../../js/fixeo-estimator-v2.js'),'utf8');
function setup(){
 const STATE={};function EstimatorModal(){this._history=[];this._view=null;this._entryContext={description:'روبيني كيسرب',city:'Rabat'};this._requestEpoch=0;}
 for(const name of ['_renderUnderstand','_renderStep','_renderOutcome','_showError']) EstimatorModal.prototype[name]=function(){this.rendered=name;};
 let detectedText;
 const context={EstimatorModal,STATE,document:{getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[]},updateCTA(){},window:{FixeoRafiLanguage:{normalize:t=>t+' robinet fuite plomberie'},FixeoAIRE:{detect:t=>{detectedText=t;return {cat:t.includes('prise')?'electricite':'plomberie'};}}}};
 vm.runInNewContext(src.slice(src.indexOf('  EstimatorModal.prototype._prepareDescription'),src.indexOf('  // Public API')),context);
 return {m:new EstimatorModal(),STATE,get detectedText(){return detectedText;}};
}
test('dictated Darija is normalized for recognition without replacing the original description',()=>{const s=setup();s.m._prepareDescription(s.m._entryContext.description);assert.equal(s.m._entryContext.metier_hint,'plomberie');assert.match(s.detectedText,/robinet fuite/);assert.equal(s.m._entryContext.description,'روبيني كيسرب');});
test('editing the need removes stale métier and service hints',()=>{const {m}=setup();m._prepareDescription('robinet');m._entryContext.service_hint='plomberie.old';m._prepareDescription('prise');assert.equal(m._entryContext.metier_hint,'electricite');assert.equal(m._entryContext.service_hint,null);});
test('back restores the previous server token, answers and context without an API call',()=>{
 const {m,STATE}=setup();m._renderUnderstand();STATE.sessionToken='opaque-before-answer';m._renderStep({metier:'plomberie'},{type:'QUESTION',question_id:'one'});m._view.answer=false;
 STATE.sessionToken='opaque-after-answer';m._renderStep({metier:'plomberie'},{type:'QUESTION',question_id:'two'});m._pricingContextToken='old-price';m._back();
 assert.equal(STATE.sessionToken,'opaque-before-answer');assert.equal(STATE.pendingAnswer,false);assert.equal(m._view.step.question_id,'one');assert.equal(m._entryContext.city,'Rabat');assert.equal(m._pricingContextToken,null);assert.equal(m._requestEpoch,1);assert.equal(m._history.length,1);
 m._back();assert.equal(m.rendered,'_renderUnderstand');assert.equal(m._entryContext.description,'روبيني كيسرب');
});
test('back from outcome returns to last question and clears the price authorization',()=>{const {m,STATE}=setup();STATE.sessionToken='question-token';m._renderStep({}, {type:'QUESTION',question_id:'last'});m._view.answer=4;STATE.sessionToken='evaluated';m._pricingContextToken='price';m._renderOutcome({}, {outcome_type:'PRICE_READY'});m._back();assert.equal(STATE.sessionToken,'question-token');assert.equal(STATE.pendingAnswer,4);assert.equal(m._pricingContextToken,null);});
test('editing after back forks history instead of returning to the abandoned answer',()=>{const {m,STATE}=setup();m._renderUnderstand();STATE.sessionToken='a';m._renderStep({}, {type:'QUESTION',question_id:'one'});STATE.sessionToken='b';m._renderStep({}, {type:'QUESTION',question_id:'two'});m._back();STATE.sessionToken='c';m._renderStep({}, {type:'QUESTION',question_id:'different'});assert.equal(m._history.length,2);assert.equal(m._view.step.question_id,'different');});
