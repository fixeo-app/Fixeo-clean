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
test('PB1 money: canonical cents, discounts, large and zero totals, commission included only for FIXEO, no fiscal inference',()=>{
 for(const [total,commission,net] of [[500,75,425],[0,0,0],[0.1,0.02,0.08],[499999.99,75000,424999.99]])assert.deepEqual(quoteEconomics(total,'fixeo'),{total,commission,net});
 assert.deepEqual(quoteEconomics(500,'personal'),{total:500,commission:null,net:null});
 const q=calculateQuote([{type:'labor',label:'Main-d’œuvre',quantity:3,unit_price:0.335},{type:'supply',label:'Joint',quantity:1,unit_price:100}],1.01);
 assert.equal(q.items[0].total,1.01);assert.equal(q.total,100);assert.equal(quoteEconomics(q.total,'fixeo').net,85);
 assert.throws(()=>calculateQuote([{type:'labor',label:'x',quantity:1,unit_price:1}],2));
 assert.deepEqual(quoteEconomics(500,'fixeo',60),{total:500,commission:60,net:440});
});
test('PB1 deterministic parents preserve CRM context and availability; no cross-universe incidental back',()=>{
 assert.equal(logicalParent('/artisan-workspace/agenda'),'/artisan');
 assert.equal(logicalParent('/artisan-workspace/profile',{from:'availability'}),'/artisan-workspace');
 assert.deepEqual(logicalParent('/artisan-workspace/quote/new',{clientId:uuidA}),{pathname:'/artisan-workspace/client/[id]',params:{id:uuidA}});
 assert.deepEqual(logicalParent('/artisan-workspace/agenda',{clientId:uuidA}),{pathname:'/artisan-workspace/client/[id]',params:{id:uuidA}});
 assert.equal(logicalParent('/client-request/'+uuidB),'/client-workspace/history');
});
test('PB1 actual Client home: A+B separate, correct follow targets, independent new intent, refresh and status priority',async()=>{
 const source:any[]=[{id:uuidA,service_category:'Plomberie',description:'Fuite sous évier',city:'Fès',status:'new'},{id:uuidB,service_category:'Électricité',description:'Prise en panne',city:'Fès',status:'new'}];
 let rows=source,refresh:()=>void=()=>{}; const navigation:any[]=[];
 const {default:Home}=load('app/index.tsx',{'react-native':{View:'view',RefreshControl:component('refresh')},'expo-router':{router:{push:(path:any)=>navigation.push(path)},useFocusEffect:(fn:any)=>React.useEffect(fn,[fn])},
 '@/lib/clientWorkspace':{listClientRequestHistory:async()=>structuredClone(rows)},'@/lib/clientExperience':{clientAttentionRequest,clientHomeCopy:()=>({}),CLIENT_STATUS:{new:'Recherche en cours',validated:'Terminée'}},'@/lib/mobileResilience':{withMobileDeadline:(x:any)=>x},'@/lib/useForegroundRefresh':{useForegroundRefresh:(fn:any)=>{refresh=fn}},'@/lib/workspacePresentation':{isTechnicalRequestContent:()=>false},
 '@/components/ClientDraftRecovery':{ClientDraftRecovery:component('drafts')},'@/components/ClientEditorial':{ClientHero:component('hero'),ClientSection:component('section'),clientStyles:{}},'@/components/ClientRequestComposer':{default:component('composer')},'@/components/MobileShell':{MobileShell:component('shell')},'@/components/useWorkspaceDock':{useWorkspaceDock:()=>({items:[]})},'@/ui/FixeoScreen':{FixeoScreen:component('screen')},'@/ui/FixeoAction':{FixeoAction:component('action')},'@/ui/FixeoText':{FixeoText:component('text')},'@/ui/RafiScrollView':{RafiScrollView:component('scroll')}});
 let tree:any;await renderer.act(async()=>{tree=renderer.create(React.createElement(Home))});
 const actions=()=>tree.root.findAllByType('action');
 const follows=actions().filter((x:any)=>x.props.label==='Voir le suivi');assert.equal(follows.length,2);
 await renderer.act(async()=>follows[0].props.onPress());await renderer.act(async()=>follows[1].props.onPress());
 assert.deepEqual(navigation.map(n=>n.params.id),[uuidA,uuidB]);
 await renderer.act(async()=>actions().find((x:any)=>x.props.label==='+ Nouvelle demande').props.onPress());assert.equal(navigation[2],'/new-request');
 assert.equal(source[0].status,'new');assert.equal(source.length,2);
 rows=[{...source[0],status:'validated'},source[1]];await renderer.act(async()=>refresh());
 assert.equal(actions().filter((x:any)=>x.props.label==='Voir le suivi').length,1);
 await renderer.act(async()=>tree.unmount());
 rows=[];await renderer.act(async()=>{tree=renderer.create(React.createElement(Home))});assert.equal(tree.root.findAllByType('composer').length,1);
 await renderer.act(async()=>tree.unmount());
});

test('PB1 quote acceptance/refusal buttons open a visible confirmation and invoke the chosen decision',async()=>{
 for(const decision of ['accepted','rejected']) {
  const calls:any[]=[];
  let quote:any={id:uuidA,source:'personal',status:'sent',title:'Réparation',client_id:uuidB,items:[{type:'service',label:'Réparation',quantity:1,unit_price:500}],discount:0,total:500};
  const {default:Quote}=load('app/artisan-workspace/quote/[id].tsx',{'react-native':{View:'view',Modal:component('modal'),ScrollView:component('scroll')},'expo-crypto':{randomUUID:()=>uuidB},'expo-router':{router:{},useLocalSearchParams:()=>({id:uuidA})},'@/lib/magicLoop':{getDispatchOffers:async()=>[]},'@/lib/artisanOS':{recordQuoteDecision:async(id:string,status:string)=>{calls.push([id,status]);quote={...quote,status};return quote;}},'@/lib/quoteValidation':{validateQuote},'@/lib/workspacePresentation':{formatWorkspaceDate},'@/lib/artisanExperience':{calculateQuote,money:(x:number)=>String(x),businessStatus:{}},'@/components/ArtisanEditorial':{ArtisanPage:component('page'),ArtisanSection:component('section'),ArtisanCue:component('cue'),ArtisanMessage:component('message'),ArtisanField:component('field'),ArtisanChoices:component('choices'),art:{},useArtisanQuery:()=>{const [data,setData]=React.useState({quotes:[quote],clients:[],offers:[]});return {data,loading:false,error:'',reload:async()=>setData({quotes:[quote],clients:[],offers:[]})}},useArtisanAction:()=>({busy:false,rafi:{},message:'',run:async(fn:any)=>fn(),setMessage:()=>{}})},'@/ui/FixeoText':{FixeoText:component('text')},'@/ui/FixeoAction':{FixeoAction:component('action')},'@/components/QuoteBreakdown':{QuoteBreakdown:component('breakdown')},'@/components/DateField':{DateField:component('date')}});
  let tree:any;await renderer.act(async()=>{tree=renderer.create(React.createElement(Quote))});
  const action=(label:string)=>tree.root.findAllByType('action').find((x:any)=>x.props.label===label);
  await renderer.act(async()=>action(decision==='accepted'?'Enregistrer un accord reçu hors FIXEO':'Enregistrer un refus reçu hors FIXEO').props.onPress());
  assert.equal(tree.root.findByType('modal').props.visible,true);assert.equal(calls.length,0);
  await renderer.act(async()=>action('Confirmer').props.onPress());assert.deepEqual(calls,[[uuidA,decision]]);
  assert.equal(tree.root.findAllByType('modal').length,0);assert.equal(action('Enregistrer un accord reçu hors FIXEO'),undefined);
  await renderer.act(async()=>tree.unmount());
 }
});

test('PB1 actual composer isolates drafts A/B and abandoned C; ambiguous retry keeps the identical key',async()=>{
 let seq=0,fail=false;const rows:any[]=[],calls:any[]=[],nav:any[]=[];
 const storage=new Map<string,string>();
 const drafts=load('lib/clientDrafts.ts',{'@react-native-async-storage/async-storage':{default:{getItem:async(k:string)=>storage.get(k)||null,setItem:async(k:string,v:string)=>{storage.set(k,v)},getAllKeys:async()=>[...storage.keys()],multiRemove:async(keys:string[])=>keys.forEach(k=>storage.delete(k))}},'./authEvents':{privateSessionGeneration:()=>0,onSessionRejected:()=>{}}});
 const deps:any={'@/lib/clientNeedFacts':await import('../lib/clientNeedFacts'),'@/lib/authEvents':{privateSessionGeneration:()=>0,onSessionRejected:()=>()=>{}},'@/lib/clientDrafts':drafts,'./ClientDraftRecovery':{ClientDraftRecovery:component('drafts')},'react-native':{View:'view',Text:'text',TextInput:'input',Keyboard:{dismiss(){}},AppState:{addEventListener:()=>({remove(){}})},StyleSheet:{create:(v:any)=>v}},'expo-router':{router:{replace:(p:any)=>nav.push(p),push:()=>{}},useFocusEffect:(fn:any)=>React.useEffect(fn,[fn])},'expo-crypto':{randomUUID:()=>`draft-${++seq}`},
 '@/lib/clientWorkspace':{getClientProfile:async()=>({city:'Fès'})},'@/lib/auth':{getStableSession:async()=>({user:{id:uuidA}}),resolveRole:async()=>'client'},'@/lib/mobileResilience':{withMobileDeadline:(p:any)=>p},
 '@/lib/voiceDraft':await import('../lib/voiceDraft'),'@/lib/rafi':await import('../lib/rafi'),'@/lib/magicLoopState':await import('../lib/magicLoopState'),'@/lib/rafiContext':await import('../lib/rafiContext'),'@/lib/clientDiagnostic':await import('../lib/clientDiagnostic'),'@/lib/clientIntelligence':await import('../lib/clientIntelligence'),'@/lib/clientLocation':await import('../lib/clientLocation'),
 '@/lib/clientExperience':{clientHomeCopy:()=>({})},'@/ui/rafiPresence':{getClientRafiPresence:()=> 'idle'},'@/ui/tokens':await import('../ui/tokens'),'@/components/useWorkspaceDock':{useWorkspaceDock:()=>({items:[]})},'@/components/ClientDraftRecovery':{ClientDraftRecovery:component('drafts')},'@/components/ClientEditorial':{ClientHero:component('hero'),ClientSection:component('section'),clientStyles:{content:{}}},
 '@/lib/magicLoop':{createRequest:async(service:string,city:string,description:string,key:string)=>{calls.push({service,city,description,key});let row=rows.find(r=>r.key===key);if(!row){row={id:rows.length?uuidB:uuidA,service,city,description,key,status:'new'};rows.push(row);}if(fail){fail=false;throw new Error('NETWORK');}return row;}}};
 for(const [module,name,tag] of [['@/ui/KeyboardInput','KeyboardInput','input'],['@/components/EntryStage','EntryStage','entry'],['@/ui/BackButton','BackButton','back'],['@/ui/RafiScrollView','RafiScrollView','scroll'],['@/components/RafiInputRail','RafiInputRail','rail'],['@/components/MobileShell','MobileShell','shell'],['@/ui/FixeoScreen','FixeoScreen','screen'],['@/ui/FixeoAction','FixeoAction','action'],['@/ui/FixeoText','FixeoText','text'],['@/components/ClientLocationField','ClientLocationField','location'],['@/components/ServiceField','ServiceField','services']])deps[module]={[name]:component(tag)};
 const {default:Composer}=load('components/ClientRequestComposer.tsx',deps);let tree:any;
 const tap=async(label:string)=>{const a=tree.root.findAllByType('action').find((x:any)=>x.props.label===label);assert.ok(a,label);assert.ok(!a.props.disabled,label);await renderer.act(async()=>a.props.onPress());};
 const mount=async(resumeDraftId?:string)=>{await renderer.act(async()=>{tree=renderer.create(React.createElement(Composer,{resumeDraftId}))});if(!resumeDraftId){await renderer.act(async()=>tree.root.findByType('rail').props.onWrite());assert.equal(tree.root.findByType('input').props.value,'');}};
 const type=async(value:string)=>{await renderer.act(async()=>tree.root.findByType('input').props.onChangeText(value));};
 await mount();await type('J’ai une fuite sous l’évier');await tap('Continuer');assert.equal(tree.root.findByType('location').props.city,'Fès');assert.equal(rows.length,0);
 await tap('Confirmer Fès et mon besoin');await tap('Préparer ma demande');assert.equal(rows.length,0);await tap('Confirmer et chercher un artisan');assert.equal(rows.length,1);const before=JSON.stringify(rows[0]);await renderer.act(async()=>tree.unmount());
 await mount();await type('J’ai aussi une panne électrique');await tap('Continuer');fail=true;await tap('Confirmer Fès et mon besoin');await tap('Préparer ma demande');await tap('Confirmer et chercher un artisan');assert.equal(rows.length,2);assert.equal(tree.root.findAllByType('input').length,0);
 await tap('Vérifier et réessayer la demande');assert.equal(rows.length,2);assert.deepEqual(calls[1],calls[2]);assert.notEqual(rows[0].key,rows[1].key);assert.equal(JSON.stringify(rows[0]),before);assert.deepEqual(nav.map(x=>x.params.id),[uuidA,uuidB]);
 await renderer.act(async()=>tree.unmount());assert.equal(drafts.clientDrafts(uuidA).length,0,'confirmed drafts removed');
 await mount();await type('Mon chauffe-eau ne fonctionne plus');await tap('Continuer');await renderer.act(async()=>tree.root.findByType('services').props.onChange(['Plomberie']));
 const pending=drafts.clientDrafts(uuidA)[0];assert.equal(pending.city,'Fès');assert.equal(pending.declaredService,'Plomberie');
 await renderer.act(async()=>tree.unmount());assert.equal(rows.length,2);assert.equal(JSON.stringify(rows[0]),before);
 await mount(pending.id);assert.equal(drafts.clientDrafts(uuidA)[0].problem,'Mon chauffe-eau ne fonctionne plus');assert.deepEqual(Array.from(tree.root.findByType('services').props.values),['Plomberie']);assert.equal(rows.length,2);
 await tap('Plus');await tap('Abandonner ce brouillon');assert.equal(drafts.clientDrafts(uuidA).length,1,'abandon requires confirmation');await tap('Confirmer l’abandon');assert.equal(drafts.clientDrafts(uuidA).length,0);assert.equal(rows.length,2);
 await renderer.act(async()=>tree.unmount());
});

test('PB1 actual estimator steps, restored answer, recap, result, confirmation and identical retry',async()=>{
 const fixture=JSON.parse(readFileSync('tests/fixtures/estimator-canonical.json','utf8'));const calls:any[]=[],created:string[]=[];let fail=true;
 const session=(token:string)=>({session_token:token,state:'QUALIFYING',metier:'plomberie',service_code:'plomberie.fuite_simple',outcome:null});
 const first={ok:true,session:session('first'),next_step:fixture.question},second={ok:true,session:session('second'),next_step:{type:'QUESTION',question_id:'q2',prompt_fr:'Quel équipement ?',options:[{value:'sink',label_fr:'Évier'}]}},ready={ok:true,session:session('ready'),next_step:{type:'READY'}},priced={ok:true,session:session('priced'),outcome:fixture.outcomes.price,pricing_context_token:'opaque-pricing'};
 const {ClientIntelligence}=load('components/ClientIntelligence.tsx',{'@/ui/ChoicePicker':{ChoicePicker:({options,value,onChange}:any)=>React.createElement('choices',{},options.map((o:any)=>React.createElement('action',{key:o.value,label:o.label,selected:value===o.value,onPress:()=>onChange(o.value)})))},'@/ui/KeyboardInput':{KeyboardInput:component('input')},'react-native':{View:'view',TextInput:'input',Keyboard:{dismiss(){}}},'expo-crypto':{randomUUID:()=>uuidA},'expo-router':{router:{}},'@/lib/clientIntelligence':await import('../lib/clientIntelligence'),'@/lib/clientWorkspace':{getClientProfile:async()=>({phone:'0612345678'})},
 '@/lib/mobileEstimator':{mobileEstimator:async(a:any)=>{calls.push(a);if(a.action==='start')return first;if(a.action==='answer')return a.session_token==='first'?second:ready;if(a.action==='evaluate')return priced;if(fail){fail=false;throw new Error('NETWORK');}return {ok:true,request_id:uuidB,replayed:true};}},
 '@/ui/BackButton':{BackButton:component('back')},'@/ui/FixeoAction':{FixeoAction:component('action')},'@/ui/FixeoText':{FixeoText:component('text')},'./ClientEditorial':{ClientSection:component('section'),clientStyles:{}},'./ClientFixeoResult':{ClientFixeoResult:component('result')},'@/lib/clientEstimatorLabels.generated.json':{default:{}}});
 let tree:any;await renderer.act(async()=>{tree=renderer.create(React.createElement(ClientIntelligence,{context:{city:'fes',description:'Fuite sous l’évier',metierHint:'plomberie',metierProvenance:'user_confirmed'},onCreated:(id:string)=>created.push(id),onClose:()=>{},onStop:()=>assert.fail('Unexpected safety stop')}))});
 const actions=()=>tree.root.findAllByType('action');const tap=async(label:string)=>{const a=actions().find((x:any)=>x.props.label===label);assert.ok(a,label);assert.ok(!a.props.disabled,label);await renderer.act(async()=>a.props.onPress());};
 assert.equal(calls.length,1,'entry starts the chosen estimate once, without a redundant CTA');assert.equal(calls[0].entry_context.metier_hint,'plomberie');await tap('LOCAL_ACCESSIBLE');await tap('Continuer');assert.equal(tree.root.findAllByType('section').filter((x:any)=>x.props.testID==='client-estimator-question').length,1);
 await renderer.act(async()=>tree.root.findByType('back').props.onPress());assert.equal(actions().find((x:any)=>x.props.label==='LOCAL_ACCESSIBLE').props.selected,true);
 await tap('Continuer');await tap('Évier');await tap('Continuer');assert.equal(tree.root.findAllByType('section').filter((x:any)=>x.props.testID==='client-estimator-summary').length,1);assert.equal(created.length,0);
 await tap('Voir mon estimation');assert.equal(tree.root.findByType('result').props.outcome.price.amount_mad,280);assert.equal(created.length,0);await tap('Continuer avec cette estimation');await tap('Confirmer et chercher un artisan');assert.equal(created.length,0);assert.equal(tree.root.findByType('input').props.editable,false);
 await tap('Vérifier et réessayer la confirmation');assert.deepEqual(calls.at(-1),calls.at(-2));assert.deepEqual(created,[uuidB]);await renderer.act(async()=>tree.unmount());
});

test('PB1 push permission rehydrates across logins and registers without another OS prompt',async()=>{
 const calls:boolean[]=[];const {PushOptIn}=load('components/PushOptIn.tsx',{'react-native':{View:'view',Text:'text',Pressable:'pressable',StyleSheet:{create:(v:any)=>v}},'expo-router':{useFocusEffect:(fn:any)=>React.useEffect(fn,[fn])},'@/lib/push':{isCurrentDevicePushEnabled:async()=>true,registerCurrentDeviceForPush:async(prompt:boolean)=>{calls.push(prompt);return {ok:true};}},'@/lib/mobileResilience':{withMobileDeadline:(p:any)=>p},'@/lib/feedback':{triggerFixeoFeedback:()=>{}},'@/ui/tokens':await import('../ui/tokens')});
 for(let login=0;login<2;login++){let tree:any;await renderer.act(async()=>{tree=renderer.create(React.createElement(PushOptIn))});assert.equal(tree.root.findAllByType('pressable').length,0);assert.match(JSON.stringify(tree.toJSON()),/activées pour ce compte/);await renderer.act(async()=>tree.unmount());}assert.deepEqual(calls,[false,false]);
});

test('PB1 notification destinations respect s1b request identities, M4 mission metadata and absent targets',async()=>{
 const {clientNotificationTarget}=await import('../lib/clientNotificationTarget');
 const row:any={related_entity_type:'mission',related_entity_id:uuidA,metadata:{source:'s1b'}};
 assert.deepEqual(clientNotificationTarget(row),{pathname:'/client-request/[id]',params:{id:uuidA}});
 assert.deepEqual(clientNotificationTarget({...row,related_entity_type:'mission_change',metadata:{source:'mobile_m4',mission_id:uuidB}}),{pathname:'/client-mission/[id]',params:{id:uuidB}});
 assert.equal(clientNotificationTarget({...row,related_entity_id:'',metadata:null}),null);
});
