import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { quoteEconomics } from '../lib/moneyContract';
import { calculateQuote } from '../lib/artisanExperience';
import { validateQuote } from '../lib/quoteValidation';
import { formatWorkspaceDate } from '../lib/workspacePresentation';
import { logicalParent } from '../ui/backContract';
import { clientAttentionRequest } from '../lib/clientExperience';
const require=createRequire(import.meta.url), React=require('react'), renderer=require('react-test-renderer');
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const component=(name:string)=>function Component(props:any){return React.createElement(name,props,props.children)};
function load(file:string,deps:Record<string,unknown>){const exports:Record<string,any>={};vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:(name:string)=>name==='react'||name==='react/jsx-runtime'?require(name):deps[name]||{},setTimeout,clearTimeout,setInterval,clearInterval,Promise});return exports;}
const uuidA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',uuidB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('Post-audit P0 actual composer: proposal, ignore/replace/append/undo, parasite, double tap, network, blur, session loss and restart',async()=>{
 let seq=0,fail=false,generation=0;const rows:any[]=[],calls:any[]=[],nav:any[]=[];
 let blur:()=>void=()=>{},release:(value:string)=>void=()=>{},reject:(reason:Error)=>void=()=>{};
 const background=new Set<(state:string)=>void>(),rejections=new Set<()=>void>();
 let transcriptionCalls=0;
 const storage=new Map<string,string>();
 const drafts=load('lib/clientDrafts.ts',{'@react-native-async-storage/async-storage':{default:{getItem:async(k:string)=>storage.get(k)||null,setItem:async(k:string,v:string)=>{storage.set(k,v)},getAllKeys:async()=>[...storage.keys()],multiRemove:async(keys:string[])=>keys.forEach(k=>storage.delete(k))}},'./authEvents':{privateSessionGeneration:()=>generation,onSessionRejected:()=>{}}});
 const deps:any={'@/components/ClientIntelligence':{ClientIntelligence:component('intelligence')},'@/lib/clientNeedFacts':await import('../lib/clientNeedFacts'),'@/lib/authEvents':{privateSessionGeneration:()=>generation,onSessionRejected:(fn:any)=>{rejections.add(fn);return ()=>rejections.delete(fn)}},'@/lib/clientDrafts':drafts,'./ClientDraftRecovery':{ClientDraftRecovery:component('drafts')},'react-native':{View:'view',Text:'text',TextInput:'input',Keyboard:{dismiss(){}},AppState:{addEventListener:(_e:string,fn:any)=>{background.add(fn);return {remove:()=>background.delete(fn)}}},StyleSheet:{create:(v:any)=>v}},'expo-router':{router:{replace:(p:any)=>nav.push(p),push:()=>{}},useFocusEffect:(fn:any)=>React.useEffect(()=>{blur=fn();return blur},[fn])},'expo-crypto':{randomUUID:()=>`draft-${++seq}`},
 '@/lib/clientWorkspace':{getClientProfile:async()=>({city:'Fès'})},'@/lib/auth':{getStableSession:async()=>({user:{id:uuidA}}),resolveRole:async()=>'client'},'@/lib/mobileResilience':{withMobileDeadline:(p:any)=>p},
 '@/lib/voiceDraft':await import('../lib/voiceDraft'),'@/lib/rafi':await import('../lib/rafi'),'@/lib/magicLoopState':await import('../lib/magicLoopState'),'@/lib/rafiContext':await import('../lib/rafiContext'),'@/lib/clientDiagnostic':await import('../lib/clientDiagnostic'),'@/lib/clientIntelligence':await import('../lib/clientIntelligence'),'@/lib/clientLocation':await import('../lib/clientLocation'),
 '@/lib/clientExperience':{clientHomeCopy:()=>({})},'@/ui/rafiPresence':{getClientRafiPresence:()=> 'idle'},'@/ui/tokens':await import('../ui/tokens'),'@/components/useWorkspaceDock':{useWorkspaceDock:()=>({items:[]})},'@/components/ClientDraftRecovery':{ClientDraftRecovery:component('drafts')},'@/components/ClientEditorial':{ClientHero:component('hero'),ClientSection:component('section'),clientStyles:{content:{}}},
 '@/lib/magicLoop':{createRequest:async(service:string,city:string,description:string,key:string)=>{calls.push({service,city,description,key});let row=rows.find(r=>r.key===key);if(!row){row={id:rows.length?uuidB:uuidA,service,city,description,key,status:'new'};rows.push(row);}if(fail){fail=false;throw new Error('NETWORK');}return row;}}};
 for(const [module,name,tag] of [['@/ui/KeyboardInput','KeyboardInput','input'],['@/components/EntryStage','EntryStage','entry'],['@/ui/BackButton','BackButton','back'],['@/ui/RafiScrollView','RafiScrollView','scroll'],['@/components/RafiInputRail','RafiInputRail','rail'],['@/components/MobileShell','MobileShell','shell'],['@/ui/FixeoScreen','FixeoScreen','screen'],['@/ui/FixeoAction','FixeoAction','action'],['@/ui/FixeoText','FixeoText','text'],['@/components/ClientLocationField','ClientLocationField','location'],['@/components/ServiceField','ServiceField','services']])deps[module]={[name]:component(tag)};

 deps['@/lib/rafiGateway']={hasRafiServerGateway:()=>true,transcribeRafiVoice:()=>{transcriptionCalls++;return new Promise<string>((resolve,no)=>{release=resolve;reject=no})}};
 const {default:Composer}=load('components/ClientRequestComposer.tsx',deps);let tree:any;
 const actions=()=>tree.root.findAllByType('action');
 const tap=async(label:string)=>{const a=actions().find((x:any)=>x.props.label===label);assert.ok(a,label);assert.ok(!a.props.disabled,label);await renderer.act(async()=>a.props.onPress())};
 const value=()=>tree.root.findAllByType('input')[0]?.props.value ?? drafts.clientDrafts(uuidA)[0]?.problem;
 const mount=async(id?:string)=>{await renderer.act(async()=>{tree=renderer.create(React.createElement(Composer,{resumeDraftId:id}))});if(!id)await renderer.act(async()=>tree.root.findByType('rail').props.onWrite())};
 const type=async(text:string)=>{if(!tree.root.findAllByType('input').length)await tap('Modifier mon texte');await renderer.act(async()=>tree.root.findByType('input').props.onChangeText(text));};
 const voice=async()=>{await renderer.act(async()=>{const cb=tree.root.findByType('rail').props.onVoiceReady;cb('fixture:voice');cb('fixture:voice')})};
 const proposal=async(text:string)=>{await voice();await renderer.act(async()=>release(text))};
 const A='Ma chasse d’eau coule sans arrêt.',B='Une prise électrique ne fonctionne plus.';
 await mount();await type(A);const id=drafts.clientDrafts(uuidA)[0].id;
 await proposal(B);assert.equal(transcriptionCalls,1);assert.equal(value(),A);assert.equal(drafts.clientDrafts(uuidA)[0].problem,A);assert.equal(rows.length,0);
 assert.equal(actions().some((x:any)=>/Confier|Préparer ma demande|Confirmer et chercher/.test(x.props.label)),false,'voice review excludes every creation action');
 await tap('Ignorer et conserver mon texte');assert.equal(value(),A);
 await proposal(B);await tap('Utiliser cette transcription');assert.equal(value(),B);assert.equal(drafts.clientDrafts(uuidA)[0].problem,B);
 await tap('Plus');await tap('Restaurer le texte précédent');assert.equal(value(),A);
 await proposal(B);await tap('Compléter le texte');await tap('Utiliser cette transcription');assert.equal(value(),A+' '+B);
 await tap('Plus');await tap('Restaurer le texte précédent');
 await proposal('Les entreprises publiques françaises, entre 500 millions et 1 milliard. En France.');assert.equal(value(),A);await tap('Utiliser cette transcription');
 assert.match(tree.root.findAllByType('text').map((x:any)=>x.children.filter((c:any)=>typeof c==='string').join(' ')).join(' '),/Autre · proposition/);assert.doesNotMatch(tree.root.findAllByType('text').map((x:any)=>x.children.filter((c:any)=>typeof c==='string').join(' ')).join(' '),/Électricité · suggéré/);
 await type(A);assert.equal(value(),A);
 await voice();await renderer.act(async()=>reject(new Error('NETWORK')));assert.equal(value(),A);
 await voice();await renderer.act(async()=>background.forEach(fn=>fn('background')));await renderer.act(async()=>release(B));assert.equal(value(),A);
 await voice();await renderer.act(async()=>blur());await renderer.act(async()=>release(B));assert.equal(value(),A);
 await renderer.act(async()=>tree.unmount());await mount(id);assert.equal(value(),A);
 await proposal(B);await renderer.act(async()=>tree.unmount());await mount(id);assert.equal(value(),A);assert.equal(tree.root.findAllByType('section').some((x:any)=>x.props.testID==='voice-proposal'),false);
 await voice();generation++;await renderer.act(async()=>rejections.forEach(fn=>fn()));await renderer.act(async()=>release(B));assert.equal(value(),A);assert.equal(rows.length,0);
 await renderer.act(async()=>tree.unmount());
 // B2: physical audit reproduction in the actual composer (provider controlled).
 await mount();await type(A);await proposal('J’ai une fuite sous l’évier et je cherche un plombier à Fès');await tap('Utiliser cette transcription');
 assert.equal(tree.root.findByType('location').props.city,'Fès');assert.equal(rows.length,0);
 assert.equal(tree.root.findAllByType('input').length,0,'review replaces the composer');
 await renderer.act(async()=>tree.root.findByType('location').props.onChangeCity('Rabat'));
 await tap('Modifier mon texte');await proposal('J’ai une fuite sous l’évier à Fès');await tap('Utiliser cette transcription');
 assert.equal(tree.root.findByType('location').props.city,'Rabat','explicit city wins over a spoken proposal');
 await tap('Confirmer mon besoin');assert.equal(rows.length,0);
 await tap('Voir une estimation');const intelligence=tree.root.findByType('intelligence');
 assert.equal(intelligence.props.context.metierHint,'plomberie');assert.equal(intelligence.props.context.metierProvenance,'user_confirmed');
 assert.equal(intelligence.props.context.city,'rabat');assert.equal(rows.length,0,'estimating does not create');
 await renderer.act(async()=>intelligence.props.onClose());await tap('Préparer ma demande');assert.equal(rows.length,0,'summary is not confirmation');
 fail=true;const confirm=actions().find((x:any)=>x.props.label==='Confirmer et chercher un artisan');
 await renderer.act(async()=>{confirm.props.onPress();confirm.props.onPress();});assert.equal(calls.length,1);assert.equal(rows.length,1);
 assert.equal(tree.root.findAllByType('input').length,0,'unknown confirmation cannot be edited');
 await tap('Vérifier et réessayer la demande');assert.equal(calls.length,2);assert.equal(rows.length,1);assert.deepEqual(calls[0],calls[1],'unknown result retries an immutable payload/key');
 await renderer.act(async()=>tree.unmount());
});
