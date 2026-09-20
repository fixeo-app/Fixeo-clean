const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../../js/fixeo-estimation-voice-v1.js'),'utf8');
const flush=()=>new Promise(r=>setImmediate(r));
class El {
 constructor(){this.children=[];this.dataset={};this.listeners={};this.value='';this.maxLength=2000;this.isConnected=true;this.attributes={};}
 appendChild(e){this.children.push(e);e.parentNode=this;}
 insertBefore(e){this.appendChild(e);}
 setAttribute(k,v){this.attributes[k]=v;}
 addEventListener(k,f){this.listeners[k]=f;}
 dispatchEvent(e){this.listeners[e.type]?.(e);}
 getClientRects(){return [1];}
}
function setup({permission, response, supported=true}={}){
 const input=new El(), parent=new El();parent.appendChild(input);
 const document=new El();document.documentElement=new El();document.createElement=()=>new El();
 document.querySelectorAll=()=>[input];
 let stopped=0, requests=0, recorder;
 const stream={getTracks:()=>[{stop(){stopped++;}}]};
 class Recorder extends El {constructor(){super();recorder=this;this.mimeType='audio/mp4';}start(){this.state='recording';}stop(){this.state='inactive';this.listeners.dataavailable({data:new Blob(['audio'])});this.listeners.stop();}}
 const window=new El();window.MediaRecorder=supported?Recorder:undefined;
 const sandbox={window,document,navigator:{mediaDevices:{getUserMedia:permission||(()=>Promise.resolve(stream))}},MediaRecorder:Recorder,MutationObserver:class{observe(){}},Blob,FormData,AbortController,Event,setTimeout,clearTimeout,fetch:async(url,opts)=>{requests++;assert.equal(url,'/api/rafi-transcribe');assert.equal(opts.body.get('language'),'ar-MA');return response?response():{ok:true,json:async()=>({ok:true,text:'تسرب الماء'})};}};
 vm.runInNewContext(source,sandbox);
 const bar=parent.children[1], [button,language,status]=bar.children;language.value='ar-MA';
 return {input,button,language,status,document,stream,get stopped(){return stopped;},get requests(){return requests;},click:()=>button.listeners.click(),stop:()=>recorder.stop()};
}
test('Darija dictation appends to current edited text and releases microphone',async()=>{
 const s=setup();s.input.value='Déjà saisi';await s.click();s.input.value='Texte corrigé';s.stop();await flush();
 assert.equal(s.input.value,'Texte corrigé\nتسرب الماء');assert.equal(s.requests,1);assert.ok(s.stopped);assert.equal(s.button.disabled,false);
});
test('permission refusal leaves text intact and shows actionable error',async()=>{
 const s=setup({permission:()=>Promise.reject(Error())});s.input.value='Mon besoin';await s.click();assert.equal(s.input.value,'Mon besoin');assert.match(s.status.textContent,/Micro inaccessible/);assert.equal(s.requests,0);
});
test('cancellation during permission prompt releases late stream without upload',async()=>{
 let resolve;const s=setup({permission:()=>new Promise(r=>resolve=r)});const pending=s.click();s.input._rafiCancelDictation();resolve(s.stream);await pending;assert.ok(s.stopped);assert.equal(s.requests,0);
});
test('cancel during transcription ignores late response',async()=>{
 let resolve;const s=setup({response:()=>new Promise(r=>resolve=r)});s.input.value='Conserver';await s.click();s.stop();s.input._rafiCancelDictation();resolve({ok:true,json:async()=>({ok:true,text:'late'})});await flush();assert.equal(s.input.value,'Conserver');
});
test('unsupported microphone leaves manual input available',()=>{const s=setup({supported:false});assert.equal(s.button.disabled,true);assert.match(s.status.textContent,/écrire/);});
test('contextual suggestion adds precision without replacing the existing description',()=>{
 const page=fs.readFileSync(require('node:path').join(__dirname,'../../js/fixeo-estimation-page-v1.js'),'utf8');
 const build=page.slice(page.indexOf('  function _buildSuggestions('),page.indexOf('\n  /*',page.indexOf('  function _buildSuggestions(')));
 const refresh=page.slice(page.indexOf('  function _refreshSuggestions('),page.indexOf('\n  /*',page.indexOf('  function _refreshSuggestions(')));
 const make=()=>({children:[],appendChild(n){if(n.owner)n.owner.children.shift();this.children.push(n);n.owner=this;},get firstChild(){return this.children[0];},replaceChildren(){this.children=[];},addEventListener(k,fn){this[k]=fn;}});
 const input={value:'Mon robinet fuit depuis lundi',maxLength:2000,dispatchEvent(){},focus(){}};
 const context={MAX_CHIPS:3,GENERAL_SUGGESTIONS:[],_el:()=>make(),_esc:x=>x,Event};vm.createContext(context);vm.runInContext(build+refresh,context);
 const wrap=make();context._refreshSuggestions(wrap,input,input.value);wrap.children[0].click();assert.equal(input.value,'Mon robinet fuit depuis lundi\nLa fuite se situe sous l’évier.');
 context._refreshSuggestions(wrap,input,input.value);assert.equal(wrap.children.length,2);
});
