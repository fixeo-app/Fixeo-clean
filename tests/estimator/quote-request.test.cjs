const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{webcrypto}=require('node:crypto');
const {JSDOM}=require('jsdom');
const src=fs.readFileSync(path.join(__dirname,'../../js/fixeo-estimator-v2.js'),'utf8');
const code=src.slice(src.indexOf('  EstimatorModal.prototype._renderQuoteRequest'),src.indexOf('  // Public API'));
function setup(fetcher){
 const dom=new JSDOM('<div id="body-slot"></div><div id="footer-slot"></div>',{url:'https://www.fixeo.ma'}),w=dom.window;
 Object.defineProperty(w,'crypto',{value:webcrypto});w.FIXEO_CITIES_MAP=[{value:'rabat',label:'Rabat'}];
 const calls=[];const STATE={session:{metier:'jardinage'},onClose(){}};
 function EstimatorModal(){this._entryContext={description:'Tailler la haie',city:'rabat'};}
 EstimatorModal.prototype._renderTerminalSession=function(){this.returned=true;};
 const el=(tag,cls,text)=>{const e=w.document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;};
 vm.runInNewContext(code,{EstimatorModal,window:w,document:w.document,STATE,el,resolveClientLabel:()=>({primary:'Projet jardin'}),TextEncoder,Uint8Array,sessionStorage:w.sessionStorage,fetch:async(url,opts)=>{calls.push({url,payload:JSON.parse(opts.body)});return fetcher(calls.length);}});
 const m=new EstimatorModal();m._renderQuoteRequest({service_code:'devis.jardinage',service_label:'Entretien jardin'});
 return {w,m,calls,submit:()=>w.document.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})),phone:w.document.getElementById('rafi-quote-phone')};
}
async function settle(done){const deadline=Date.now()+3000;while(!done()){if(Date.now()>deadline)throw Error('Expected quote state was not reached');await new Promise(r=>setTimeout(r,5));}}
test('quote opening does not submit; invalid phone is rejected',async()=>{const s=setup(()=>{throw Error('unexpected');});assert.equal(s.calls.length,0);s.phone.value='123';s.submit();assert.equal(s.calls.length,0);assert.match(s.w.document.body.textContent,/numéro marocain/);});
test('quote submits once, no price/artisan identity; success requires stored request id',async()=>{
 let finish;const s=setup(()=>new Promise(r=>finish=r));s.phone.value='0612345678';s.submit();s.submit();await settle(()=>s.calls.length===1);assert.equal(s.calls.length,1);
 const p=s.calls[0].payload;assert.equal(p.city,'Rabat');assert.equal(p.service_category,'jardinage');assert.match(p.description,/devis/);assert.equal(p.amount_mad,undefined);assert.equal(p.target_artisan_id,undefined);assert.match(p.idempotency_key,/^reservation:/);
 finish({ok:true,json:async()=>({ok:true,id:'abc',ref:'FX-ABC'})});await settle(()=>s.w.document.body.textContent.includes('enregistrée'));assert.match(s.w.document.body.textContent,/enregistrée/);assert.match(s.w.document.body.textContent,/Aucune intervention n’est réservée/);
});
test('lost response retries same payload and same idempotency key; back preserves fields',async()=>{
 const s=setup(n=>n===1?Promise.reject(Error('lost')):Promise.resolve({ok:true,json:async()=>({ok:true,id:'abc',replayed:true})}));s.phone.value='0612345678';s.submit();await settle(()=>s.m._quoteAttempt?.uncertain===true&&!s.m._quoteAttempt.pending);assert.equal(s.calls.length,1);assert.match(s.w.document.body.textContent,/pas été reçue/);s.submit();await settle(()=>s.w.document.body.textContent.includes('enregistrée'));assert.equal(s.calls.length,2);assert.deepEqual(s.calls[0].payload,s.calls[1].payload);
});
test('uncertain prior submit blocks changed payload instead of creating another request',async()=>{
 const s=setup(()=>Promise.reject(Error('lost')));s.phone.value='0612345678';s.submit();await settle(()=>s.m._quoteAttempt?.uncertain===true&&!s.m._quoteAttempt.pending);s.w.document.getElementById('rafi-quote-description').value='Autre projet';s.submit();await settle(()=>s.m._quoteAttempt?.uncertain===true&&!s.m._quoteAttempt.pending);assert.equal(s.calls.length,1);assert.match(s.w.document.body.textContent,/mêmes informations/);
});
test('same payload after modal recreation reuses key from session storage',async()=>{
 const s=setup(()=>Promise.reject(Error('lost')));s.phone.value='0612345678';s.submit();await settle(()=>s.m._quoteAttempt?.uncertain===true&&!s.m._quoteAttempt.pending);const old=s.calls[0].payload.idempotency_key;s.m._quoteAttempt=null;s.m._renderQuoteRequest({service_code:'devis.jardinage',service_label:'Entretien jardin'});s.submit();await settle(()=>s.calls.length===2&&!s.m._quoteAttempt.pending);assert.equal(s.calls.length,2);assert.equal(s.calls[1].payload.idempotency_key,old);
});
