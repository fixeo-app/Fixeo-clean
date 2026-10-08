import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { focusedScrollDelta, keyboardGeometry } from '../ui/keyboardGeometry';
import { parseAgendaDateTime, agendaPickerValue, pickerDateParts } from '../lib/agendaDate';
import { ledgerTotals, calculateQuote } from '../lib/artisanExperience';
import { validISODate } from '../lib/dateValidation';
import { quoteDocumentHtml, type QuoteDocument } from '../lib/quoteDocument';
import { workspaceDockDestinations, validateDockItems } from '../ui/shellContract';
const require=createRequire(import.meta.url),React=require('react'),renderer=require('react-test-renderer');
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const component=(name:string)=>function Component(props:any){return React.createElement(name,props,props.children)};
function load(file:string,deps:Record<string,unknown>,globals:Record<string,unknown>={}){const exports:Record<string,any>={};vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:(name:string)=>name==='react'||name==='react/jsx-runtime'?require(name):deps[name]||(name==='@/lib/useUnsavedChanges'?{useUnsavedChanges:()=>{}}:name==='@/lib/usePendingBusinessForm'?{usePendingBusinessForm:()=>({ready:true,frozen:false,error:'',lock(){},settle:async()=>{},refresh:async()=>{}})}:name==='./authEvents'?{privateSessionGeneration:()=>0,onSessionRejected:()=>()=>{}}:name==='./pendingBusinessWrite'?{guardedBusinessWrite:(_o:any,_s:any,_p:any,fn:any)=>fn()}: {}),setTimeout,clearTimeout,Promise,...globals});return exports;}

test('PB1.1 instrumented native scroll: small Android resize/overlay, last and multiline fields, focus changes and cleanup',async()=>{
 for(const label of ['Décrivez le problème','Votre précision','Téléphone de contact','Réponse diagnostic','Titre du devis','Désignation','Prix unitaire','Notes client','Note du mouvement','Notes de l’intervention','Présentation professionnelle']) {
  for(const resized of [true,false]) {
   const listeners:Record<string,Function>={},frames=new Map<number,Function>();let seq=0,offset=0;
   const native:any={View:'view',TextInput:'input',ScrollView:'scroll',StyleSheet:{create:(v:any)=>v,flatten:(v:any)=>v},Dimensions:{get:()=>({height:640}),addEventListener:()=>({remove(){}})},Keyboard:{addListener:(name:string,fn:Function)=>{listeners[name]=fn;return {remove(){delete listeners[name]}}}}};
   const geometry={keyboardGeometry,focusedScrollDelta};
   const scrollModule=load('ui/RafiScrollView.tsx',{'react-native':native,'./keyboardGeometry':geometry,'./rafiPresence':{}},{requestAnimationFrame:(fn:Function)=>{frames.set(++seq,fn);return seq},cancelAnimationFrame:(n:number)=>frames.delete(n)});
   const fields=load('components/ArtisanEditorial.tsx',{'react-native':native,'@/ui/RafiScrollView':scrollModule,'@/ui/tokens':await import('../ui/tokens'),'@/ui/pageLayout':await import('../ui/pageLayout'),'@/ui/FixeoText':{FixeoText:component('text')}});
   const clientFields=load('ui/KeyboardInput.tsx',{'react-native':native,'./RafiScrollView':scrollModule});
   const inputComponent=['Décrivez le problème','Votre précision','Téléphone de contact','Réponse diagnostic'].includes(label) ? clientFields.KeyboardInput : fields.ArtisanField;
   let tree:any;
   await renderer.act(async()=>{tree=renderer.create(React.createElement(scrollModule.RafiScrollView,{contentContainerStyle:{paddingBottom:16}},React.createElement(inputComponent,{label,accessibilityLabel:label,value:'Valeur conservée',multiline:label.includes('Note')||label.includes('Présentation'),hint:'83 / 4 000 caractères'})),{createNodeMock:(el:any)=>el.type==='scroll'?{getNativeScrollRef:()=>({measureInWindow:(fn:Function)=>fn(0,80,360,resized?240:540)}),scrollTo:({y}:any)=>{offset=y;tree.root.findByType('scroll').props.onScroll({nativeEvent:{contentOffset:{y}}})}}:el.type==='view'?{measureInWindow:(fn:Function)=>fn(20,1100-offset,320,156)}:{}})});
   await renderer.act(async()=>{tree.root.findByType('input').props.onFocus({nativeEvent:{}});listeners.keyboardDidShow({endCoordinates:{screenY:320}});for(const [id,fn] of [...frames]){frames.delete(id);fn();}});
   assert.ok(1100-offset+156<=296,label);assert.ok(1100-offset>=104,label);
   assert.equal(tree.root.findByType('input').props.value,'Valeur conservée');
   await renderer.act(async()=>{tree.root.findByType('input').props.onSelectionChange({nativeEvent:{selection:{start:0,end:0}}});for(const [id,fn] of [...frames]){frames.delete(id);fn();}});
   assert.ok(1100-offset+156<=296,'selection change keeps the bounded native caret viewport exposed');
   const padding=tree.root.findByType('scroll').props.contentContainerStyle.at(-1).paddingBottom;
   assert.equal(padding,resized?40:340,'native resize is not counted twice');
   await renderer.act(async()=>{listeners.keyboardDidHide();});
   assert.equal(tree.root.findByType('scroll').props.contentContainerStyle.at(-1).paddingBottom,40);
   await renderer.act(async()=>tree.unmount());assert.equal(Object.keys(listeners).length,0);assert.equal(frames.size,0);
  }
 }
});

test('PB1.1 Casablanca 09/10/2026 14:00 survives device TZ changes; real dates and money precision',()=>{
 const previous=process.env.TZ;
 try{for(const tz of ['UTC','Africa/Casablanca','America/New_York','Asia/Tokyo']){process.env.TZ=tz;assert.equal(parseAgendaDateTime('09/10/2026','14:00'),'2026-10-09T13:00:00.000Z');assert.deepEqual(pickerDateParts(agendaPickerValue('09/10/2026','14:00')),{date:'09/10/2026',time:'14:00'});}}
 finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
 assert.equal(validISODate('2026-02-31'),false);assert.equal(validISODate('2028-02-29'),true);
 assert.deepEqual(ledgerTotals([{entry_type:'income',amount:.1,occurred_on:'2026-10-08'},{entry_type:'income',amount:.2,occurred_on:'2026-10-08'},{entry_type:'expense',amount:120,occurred_on:'2026-10-08'}]),{income:.3,expense:120});
 const dock=workspaceDockDestinations('artisan','/artisan');assert.deepEqual(dock.map(x=>x.label),['Opportunités','RAFI','Agenda','Disponibilité']);
 assert.equal(dock.at(-1)?.path,'/artisan-workspace');validateDockItems(dock.map(x=>({...x,accessibilityLabel:x.label,action(){}})),'PB1.1 approved availability');
});

export const sampleQuote:QuoteDocument={number:'DEV-2026-0002',status:'Brouillon',title:'Devis test PB1 - Plomberie',updatedAt:'2026-10-08T14:00:00Z',issuer:{name:'PB1 Artisan Test',city:'Fès'},client:{full_name:'PB1 Client Test',city:'Fès'},...calculateQuote([{type:'service',label:'Réparation chasse d’eau qui coule en continu',quantity:1,unit_price:250}]),validity:'2026-10-22',notes:'Prix annoncé avant intervention.'};
test('PB1.1 PDF model uses exact editor totals, escaped content, accents and honest personal provenance',()=>{
 const html=quoteDocumentHtml(sampleQuote);assert.match(html,/250 MAD/);assert.match(html,/Réparation chasse d’eau/);assert.match(html,/TVA non calculée/);assert.match(html,/FIXEO n’est pas le prestataire/);
 assert.doesNotMatch(html,/<script|https?:\/\//);const escaped=quoteDocumentHtml({...sampleQuote,notes:'<script>alert("X")</script>'});assert.match(escaped,/&lt;script&gt;/);assert.doesNotMatch(escaped,/<script>/);
});

test('PB1.1 PDF export refuses invalid bytes and never declares sending when share closes',async()=>{
 let shared=0,deleted=0,valid=true;const printOptions:any[]=[];
 const module=load('lib/quotePdf.ts',{'expo-print':{printToFileAsync:async(options:any)=>{printOptions.push(options);return {uri:'file:///cache/test.pdf',numberOfPages:1}}},'expo-sharing':{isAvailableAsync:async()=>true,shareAsync:async()=>{shared++}},'expo-file-system':{File:class{exists=true;async bytes(){return new TextEncoder().encode((valid?'%PDF-':'wrong')+' '.repeat(100))}delete(){deleted++}}},'./quoteDocument':{quoteDocumentHtml}});
 const result=await module.shareQuotePdf(sampleQuote);assert.equal(result.pages,1);assert.equal(shared,1);assert.equal(deleted,0);
 const fifty={...sampleQuote,...calculateQuote(Array.from({length:50},(_,i)=>({type:'service' as const,label:`Ligne ${i+1} — Réparation à Fès, étanchéité et fournitures`,quantity:1,unit_price:250})))};
 await module.shareQuotePdf(fifty);assert.equal(fifty.total,12500);assert.equal(printOptions[1].width,595);assert.equal(printOptions[1].height,842);
 assert.equal((printOptions[1].html.match(/<tr><td>/g)||[]).length,50);assert.match(printOptions[1].html,/Ligne 50 — Réparation à Fès/);assert.match(printOptions[1].html,/table-header-group/);assert.match(printOptions[1].html,/break-inside: avoid/);
 valid=false;await assert.rejects(module.shareQuotePdf(sampleQuote),/PDF_INVALID/);assert.equal(shared,2);assert.equal(deleted,1);
});

test('PB1.1 quote drafts survive cold reload, isolate owners and scopes, and purge on explicit logout',async()=>{
 const memory=new Map<string,string>();let generation=0;const rejected:Function[]=[];
 const storage={getItem:async(k:string)=>memory.get(k)||null,setItem:async(k:string,v:string)=>{memory.set(k,v)},removeItem:async(k:string)=>{memory.delete(k)},getAllKeys:async()=>[...memory.keys()],multiRemove:async(keys:string[])=>keys.forEach(k=>memory.delete(k))};
 const deps={'@react-native-async-storage/async-storage':{default:storage},'./authEvents':{privateSessionGeneration:()=>generation,onSessionRejected:(fn:Function)=>rejected.push(fn)}};
 const first=load('lib/quoteDrafts.ts',deps),draft={id:'stable-id',origin:'personal',clientId:'client-a',requestId:'',title:'Devis 250',lines:[{type:'service',label:'Réparation',quantity:'1',price:'250'}],discount:'',notes:'Notes préservées',validity:'2026-10-22',duration:'',section:2};
 await first.saveQuoteDraft('owner-a','new:personal:client-a',draft);
 const cold=load('lib/quoteDrafts.ts',deps);
 assert.equal(JSON.stringify(await cold.loadQuoteDraft('owner-a','new:personal:client-a')),JSON.stringify(draft));
 assert.equal(await cold.loadQuoteDraft('owner-b','new:personal:client-a'),null);assert.equal(await cold.loadQuoteDraft('owner-a','quote-b'),null);
 await cold.removeQuoteDraft('owner-a','new:personal:client-a');assert.equal(await cold.loadQuoteDraft('owner-a','new:personal:client-a'),null);
 await cold.saveQuoteDraft('owner-a','new',draft);generation++;rejected.forEach(fn=>fn('revoked'));
 assert.equal((await cold.loadQuoteDraft('owner-a','new')).id,'stable-id');
 const pending=cold.saveQuoteDraft('owner-a','new',{...draft,title:'stale'});generation++;rejected.forEach(fn=>fn('logout'));await assert.rejects(pending,/DRAFT_SESSION_CHANGED/);
 assert.equal(await cold.loadQuoteDraft('owner-a','new'),null);
});

test('PB1.1 actual Devis 250: wizard, cold remount, preview, idempotent draft, reopen, edit and CRM association',async()=>{
 const {validateQuote}=await import('../lib/quoteValidation');const experience=await import('../lib/artisanExperience'),presentation=await import('../lib/workspacePresentation');
 let diskFull=false,loseResponse=false;const memory=new Map<string,string>();const drafts=load('lib/quoteDrafts.ts',{'@react-native-async-storage/async-storage':{default:{getItem:async(k:string)=>memory.get(k)||null,setItem:async(k:string,v:string)=>{if(diskFull)throw Error('DISK_FULL');memory.set(k,v)},removeItem:async(k:string)=>{memory.delete(k)},getAllKeys:async()=>[...memory.keys()],multiRemove:async(keys:string[])=>keys.forEach(k=>memory.delete(k))}},'./authEvents':{privateSessionGeneration:()=>0,onSessionRejected:()=>{}}});
 const clients=[{id:'client-a',full_name:'PB1 Client Test',city:'Fès'}],quotes:any[]=[],calls:any[]=[];let params:any={id:'new',clientId:'client-a'},tree:any,seq=0;
 const data=()=>({clients,quotes:[...quotes],offers:[],profile:{owner_user_id:'owner-a',name:'PB1 Artisan Test',city:'Fès'}});
 const deps:any={'react-native':{View:'view',Keyboard:{dismiss(){}},Modal:component('modal'),ScrollView:component('scroll')},'expo-crypto':{randomUUID:()=>`new-id-${++seq}`},'expo-router':{router:{replace:(p:any)=>{params=p.params}},useLocalSearchParams:()=>params},'@/lib/magicLoop':{},'@/lib/quoteDrafts':drafts,'@/lib/dateValidation':{validISODate},'@/lib/quoteValidation':{validateQuote},'@/lib/workspacePresentation':presentation,'@/lib/artisanExperience':experience,
 '@/lib/artisanOS':{saveBusinessQuote:async(input:any,edit:boolean,expectedUpdatedAt?:string)=>{calls.push({input,edit,expectedUpdatedAt});const row={...input,status:'draft',source:'personal',quote_number:'DEV-2026-0002',updated_at:`2026-10-08T14:00:0${calls.length}Z`,...calculateQuote(input.items,input.discount)};const index=quotes.findIndex(x=>x.id===input.id);if(index<0)quotes.push(row);else quotes[index]=row;if(loseResponse){loseResponse=false;throw Error('NETWORK_AFTER_COMMIT')}return row}},
 '@/components/ArtisanEditorial':{ArtisanPage:component('page'),ArtisanSection:component('section'),ArtisanCue:component('cue'),ArtisanMessage:component('message'),ArtisanField:component('field'),ArtisanChoices:component('choices'),art:{},useArtisanQuery:()=>{const [value,set]=React.useState(data);return {data:value,loading:false,reload:async()=>set(data())}},useArtisanAction:()=>({busy:false,rafi:{},run:async(fn:any)=>{try{return await fn()}catch{return undefined}},setMessage(){}})},'@/ui/FixeoText':{FixeoText:component('text')},'@/ui/FixeoAction':{FixeoAction:component('action')},'@/components/QuoteProposal':{QuoteProposal:component('proposal')},'@/components/QuoteBreakdown':{QuoteBreakdown:component('breakdown')},'@/components/DateField':{DateField:component('date')}};
 const {default:Quote}=load('app/artisan-workspace/quote/[id].tsx',deps);
 const mount=async()=>{await renderer.act(async()=>{tree=renderer.create(React.createElement(Quote))})};
 const tap=async(label:string)=>{const a=tree.root.findAllByType('action').find((x:any)=>x.props.label===label);assert.ok(a,label);assert.ok(!a.props.disabled,label);await renderer.act(async()=>a.props.onPress())};
 const type=async(label:string,value:string)=>{await renderer.act(async()=>tree.root.findAllByType('field').find((x:any)=>x.props.label===label).props.onChangeText(value))};
 await mount();await type('Titre du devis','Devis test PB1 - Plomberie');await tap('Continuer vers les lignes');await type('Désignation 1','Réparation chasse d’eau qui coule en continu');await type('Prix unitaire 1 en MAD','250');await tap('Continuer vers les conditions');
 await renderer.act(async()=>tree.unmount());await mount();assert.equal(tree.root.findAllByType('choices').find((x:any)=>x.props.label==='Étapes du devis').props.value,'2');
 await tap('Voir l’aperçu');let doc=tree.root.findByType('proposal').props.document;assert.equal(doc.total,250);assert.equal(doc.client.full_name,'PB1 Client Test');assert.equal(calls.length,0);
 await tap('Enregistrer le brouillon');assert.equal(quotes.length,1);assert.equal(quotes[0].id,'new-id-1');assert.equal(quotes[0].client_id,'client-a');assert.equal(quotes[0].status,'draft');
 await renderer.act(async()=>tree.unmount());await mount();assert.equal(tree.root.findByType('proposal').props.document.total,250);await tap('Modifier les détails');
 await renderer.act(async()=>tree.root.findAllByType('choices').find((x:any)=>x.props.label==='Étapes du devis').props.onChange('0'));await type('Titre du devis','Devis test PB1 - Plomberie corrigé');
 await renderer.act(async()=>tree.root.findAllByType('choices').find((x:any)=>x.props.label==='Étapes du devis').props.onChange('2'));await tap('Voir l’aperçu');await tap('Enregistrer les modifications');
 assert.equal(quotes.length,1);assert.equal(calls[1].edit,true);assert.equal(quotes[0].total,250);assert.equal(quotes[0].status,'draft');assert.match(quotes[0].title,/corrigé/);assert.equal(quotes.filter(x=>x.client_id==='client-a').length,1);
 assert.equal(calls[1].expectedUpdatedAt,'2026-10-08T14:00:01Z');
 await tap('Modifier les détails');await renderer.act(async()=>tree.root.findAllByType('choices').find((x:any)=>x.props.label==='Étapes du devis').props.onChange('0'));
 diskFull=true;await type('Titre du devis','Modification locale conservée');
 assert.match(JSON.stringify(tree.toJSON()),/Copie locale non enregistrée/);assert.doesNotMatch(JSON.stringify(tree.toJSON()),/Brouillon enregistré sur cet appareil/);
 quotes[0]={...quotes[0],title:'Nouvelle version distante',updated_at:'2026-10-08T15:00:00Z'};
 await renderer.act(async()=>tree.root.findByType('page').props.onRefresh());
 assert.equal(tree.root.findAllByType('field').find((x:any)=>x.props.label==='Titre du devis').props.value,'Modification locale conservée');
 assert.match(JSON.stringify(tree.toJSON()),/VERSION SERVEUR MODIFIÉE/);assert.equal(calls.length,2);
 await tap('Voir la version serveur');assert.equal(tree.root.findByType('proposal').props.document.title,'Nouvelle version distante');await tap('Fermer la version serveur');
 await tap('Réappliquer explicitement mes modifications');diskFull=false;
 await renderer.act(async()=>tree.root.findAllByType('choices').find((x:any)=>x.props.label==='Étapes du devis').props.onChange('2'));await tap('Voir l’aperçu');await tap('Enregistrer les modifications');
 assert.equal(calls[2].expectedUpdatedAt,'2026-10-08T15:00:00Z');assert.equal(quotes.length,1);assert.equal(quotes[0].title,'Modification locale conservée');
 await tap('Modifier les détails');await renderer.act(async()=>tree.root.findAllByType('choices').find((x:any)=>x.props.label==='Étapes du devis').props.onChange('0'));await type('Titre du devis','Réponse perdue après commit');
 await renderer.act(async()=>tree.root.findAllByType('choices').find((x:any)=>x.props.label==='Étapes du devis').props.onChange('2'));loseResponse=true;await tap('Enregistrer les modifications');
 assert.equal(tree.root.findAllByType('field').length,0,'pending write freezes editing');assert.match(JSON.stringify(tree.toJSON()),/SAUVEGARDE À VÉRIFIER/);assert.equal(quotes.length,1);
 await renderer.act(async()=>tree.unmount());await mount();assert.match(JSON.stringify(tree.toJSON()),/SAUVEGARDE À VÉRIFIER/,'cold restart retains pending intent');
 await tap('Vérifier et réessayer le devis');assert.equal(quotes.length,1);assert.deepEqual(calls[3].input,calls[4].input);assert.equal(calls[3].expectedUpdatedAt,calls[4].expectedUpdatedAt);
 await renderer.act(async()=>tree.unmount());
});

test('PB1.1 actual CRM cancel restores values, survives foreground refresh and performs zero writes',async()=>{
 const client={id:'client-a',full_name:'PB1 Client Test',city:'Fès',notes:'Notes initiales',address:'Adresse initiale'},initial=JSON.stringify(client);let tree:any,refresh:any,writes=0;
 const deps:any={'react-native':{View:'view',Linking:{}},'expo-crypto':{randomUUID:()=> 'new'},'expo-router':{router:{},useLocalSearchParams:()=>({id:'client-a'})},'@/lib/artisanOS':{saveBusinessClient:async()=>writes++},'@/lib/artisanExperience':await import('../lib/artisanExperience'),'@/lib/workspacePresentation':await import('../lib/workspacePresentation'),'@/components/CityField':{CityField:component('city')},'@/ui/FixeoText':{FixeoText:component('text')},'@/ui/FixeoAction':{FixeoAction:component('action')},'@/components/ArtisanEditorial':{ArtisanPage:component('page'),ArtisanSection:component('section'),ArtisanCue:component('cue'),ArtisanMessage:component('message'),ArtisanField:component('field'),art:{},useArtisanQuery:()=>{const [data,set]=React.useState({client:{...client},quotes:[],jobs:[],ledger:[]});refresh=()=>set({...data,client:{...client}});return {data,loading:false,reload:async()=>refresh()}},useArtisanAction:()=>({busy:false,run:async(fn:any)=>fn(),setMessage(){}})}};
 const {default:CRM}=load('app/artisan-workspace/client/[id].tsx',deps);await renderer.act(async()=>{tree=renderer.create(React.createElement(CRM))});
 const tap=async(label:string)=>renderer.act(async()=>tree.root.findAllByType('action').find((x:any)=>x.props.label===label).props.onPress());
 const notes=()=>tree.root.findAllByType('field').find((x:any)=>x.props.label==='Notes client');
 await tap('Modifier la fiche');assert.ok(tree.root.findAllByType('action').find((x:any)=>x.props.label==='Enregistrer les modifications'));await renderer.act(async()=>notes().props.onChangeText('Modification temporaire'));await renderer.act(async()=>refresh());assert.equal(notes().props.value,'Modification temporaire');
 await tap('Annuler la modification');await tap('Modifier la fiche');assert.equal(notes().props.value,'Notes initiales');assert.equal(writes,0);assert.equal(JSON.stringify(client),initial);await renderer.act(async()=>tree.unmount());
});

test('PB1.1 actual Finance close writes nothing; client changes clear incompatible job and preserve 500/120',async()=>{
 let tree:any,writes=0;const ledger=[{id:'income',entry_type:'income',amount:500,occurred_on:'2026-10-08',source:'personal'},{id:'expense',entry_type:'expense',amount:120,occurred_on:'2026-10-08',source:'personal'}];const before=JSON.stringify(ledger);
 const deps:any={'react-native':{View:'view'},'expo-crypto':{randomUUID:()=> 'entry'},'expo-router':{useLocalSearchParams:()=>({})},'@/lib/dateValidation':{validISODate},'@/lib/artisanExperience':{...await import('../lib/artisanExperience'),localDay:()=> '2026-10-08'},'@/lib/workspacePresentation':await import('../lib/workspacePresentation'),'@/lib/ledgerPresentation':await import('../lib/ledgerPresentation'),'@/components/DateField':{DateField:component('date')},'@/lib/artisanOS':{saveLedgerEntry:async()=>writes++},'@/ui/FixeoText':{FixeoText:component('text')},'@/ui/FixeoAction':{FixeoAction:component('action')},'@/components/ArtisanEditorial':{ArtisanPage:component('page'),ArtisanSection:component('section'),ArtisanCue:component('cue'),ArtisanEmpty:component('empty'),ArtisanMessage:component('message'),ArtisanField:component('field'),ArtisanChoices:component('choices'),art:{},useArtisanQuery:()=>({data:{ledger,clients:[{id:'a',full_name:'A'},{id:'b',full_name:'B'}],jobs:[{id:'job-a',client_id:'a',source:'personal',title:'A'},{id:'job-b',client_id:'b',source:'personal',title:'B'}]},loading:false,reload:async()=>{}}),useArtisanAction:()=>({busy:false,run:async(fn:any)=>fn(),setMessage(){}})}};
 const {default:Finance}=load('app/artisan-workspace/finance.tsx',deps);await renderer.act(async()=>{tree=renderer.create(React.createElement(Finance))});
 const tap=async(label:string)=>renderer.act(async()=>tree.root.findAllByType('action').find((x:any)=>x.props.label===label).props.onPress()),choice=(label:string)=>tree.root.findAllByType('choices').find((x:any)=>x.props.label===label);
 await tap('Ajouter un mouvement');await renderer.act(async()=>choice('Client lié au mouvement').props.onChange('a'));assert.deepEqual(Array.from(choice('Intervention liée').props.options,(o:any)=>o.value),['','job-a']);await renderer.act(async()=>choice('Intervention liée').props.onChange('job-a'));await renderer.act(async()=>choice('Client lié au mouvement').props.onChange('b'));assert.equal(choice('Intervention liée').props.value,'');assert.deepEqual(Array.from(choice('Intervention liée').props.options,(o:any)=>o.value),['','job-b']);
 await tap('Fermer la saisie');assert.equal(writes,0);assert.equal(JSON.stringify(ledger),before);assert.deepEqual(ledgerTotals(ledger),{income:500,expense:120});await renderer.act(async()=>tree.unmount());
});
