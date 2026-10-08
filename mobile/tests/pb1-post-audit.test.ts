import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { validateQuote } from '../lib/quoteValidation';
import { calculateQuote, money, businessStatus } from '../lib/artisanExperience';
import { formatWorkspaceDate, clientGreetingName, clientProfileTitle } from '../lib/workspacePresentation';
const require=createRequire(import.meta.url), React=require('react'), renderer=require('react-test-renderer');
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const component=(name:string)=>function Component(props:any){return React.createElement(name,props,props.children)};
function load(file:string,deps:Record<string,unknown>){const exports:Record<string,any>={};vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:(name:string)=>name==='react'||name==='react/jsx-runtime'?require(name):deps[name]||(name==='@/lib/useUnsavedChanges'?{useUnsavedChanges:()=>{}}:name==='@/lib/usePendingBusinessForm'?{usePendingBusinessForm:()=>({ready:true,frozen:false,error:'',lock(){},settle:async()=>{},refresh:async()=>{}})}:name==='./authEvents'?{privateSessionGeneration:()=>0,onSessionRejected:()=>()=>{}}:name==='./pendingBusinessWrite'?{guardedBusinessWrite:(_o:any,_s:any,_p:any,fn:any)=>fn()}: {}),setTimeout,clearTimeout,Promise});return exports;}
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));

test('PB1 account validates required coordinates, retains edits on foreground and cancels without a write',async()=>{
 let refresh:any,writes=0;const profile={id:'client',full_name:'Client',phone:'0612345678',city:'Fès',email:'fixture@example.invalid'};
 const deps:any={'react-native':{View:'view',TextInput:'input',StyleSheet:{create:(x:any)=>x}},'@/lib/clientProfileValidation':await import('../lib/clientProfileValidation'),'@/lib/clientWorkspace':{getClientProfile:async()=>profile,updateClientProfile:async(input:any)=>{writes++;Object.assign(profile,input);return {...profile}}},'@/lib/mobileResilience':{withMobileDeadline:(p:any)=>p,isMobileUiTimeout:()=>false},'@/lib/useForegroundRefresh':{useForegroundRefresh:(fn:any)=>{refresh=fn}},'@/lib/workspacePresentation':await import('../lib/workspacePresentation'),'@/ui/tokens':await import('../ui/tokens'),'@/components/useWorkspaceDock':{useWorkspaceDock:()=>({items:[]})},'@/components/ClientEditorial':{ClientPageIntro:component('intro'),ClientSection:component('section'),clientStyles:{}}};
 for(const [module,name] of Object.entries({'@/ui/RafiOrb':'RafiOrb','@/ui/RafiScrollView':'RafiScrollView','@/components/CityField':'CityField','@/ui/BackButton':'BackButton','@/ui/FixeoAction':'FixeoAction','@/ui/FixeoText':'FixeoText','@/ui/FixeoScreen':'FixeoScreen','@/components/MobileShell':'MobileShell'}))deps[module]={[name]:component(name)};
 const {default:Account}=load('app/client-workspace/account.tsx',deps);let tree:any;await renderer.act(async()=>{tree=renderer.create(React.createElement(Account))});
 const action=(label:string)=>tree.root.findAllByType('FixeoAction').find((x:any)=>x.props.label===label);
 await renderer.act(async()=>action('Modifier mes coordonnées').props.onPress());
 await renderer.act(async()=>tree.root.findByType('input').props.onChangeText('bad'));
 await renderer.act(async()=>refresh());assert.equal(tree.root.findByType('input').props.value,'bad');
 await renderer.act(async()=>action('Enregistrer les coordonnées').props.onPress());assert.equal(writes,0);assert.ok(tree.root.findAllByType('FixeoText').some((x:any)=>String(x.props.children).includes('numéro marocain valide')));
 await renderer.act(async()=>tree.root.findByType('BackButton').props.onPress());
 await renderer.act(async()=>action('Modifier mes coordonnées').props.onPress());assert.equal(tree.root.findByType('input').props.value,profile.phone);
 await renderer.act(async()=>tree.root.findByType('CityField').props.onChange(''));
 await renderer.act(async()=>action('Enregistrer les coordonnées').props.onPress());assert.equal(writes,0);assert.ok(tree.root.findAllByType('FixeoText').some((x:any)=>String(x.props.children).includes('Choisissez votre ville')));
 await renderer.act(async()=>tree.root.findByType('CityField').props.onChange('Rabat'));
 await renderer.act(async()=>action('Enregistrer les coordonnées').props.onPress());assert.equal(writes,1);assert.equal(profile.city,'Rabat');assert.equal(tree.root.findAllByType('input').length,0);await renderer.act(async()=>tree.unmount());
});

test('PB1 drafts survive a cold reload, stay owner-scoped, and cannot return after removal or session invalidation',async()=>{
 const memory=new Map<string,string>();let generation=0;const rejected:Function[]=[];
 const storage={getItem:async(k:string)=>memory.get(k)||null,setItem:async(k:string,v:string)=>{memory.set(k,v)},getAllKeys:async()=>[...memory.keys()],multiRemove:async(keys:string[])=>keys.forEach(k=>memory.delete(k))};
 const deps={'@react-native-async-storage/async-storage':{default:storage},'./authEvents':{privateSessionGeneration:()=>generation,onSessionRejected:(fn:Function)=>rejected.push(fn)}};
 const first=load('lib/clientDrafts.ts',deps);
 const draft={id:'chauffe-eau',problem:'Chauffe-eau en panne',city:'Fès',estimator:{history:[{answer:'gaz'}],answer:'50',error:{kind:'retry',message:'Temporairement indisponible'}},submissionKey:null};
 await first.loadClientDrafts('client-a');first.saveClientDraft('client-a',draft);await flush();
 const cold=load('lib/clientDrafts.ts',deps);assert.equal((await cold.loadClientDrafts('client-b')).length,0);
 assert.equal(JSON.stringify((await cold.loadClientDrafts('client-a'))[0]),JSON.stringify(draft));
 cold.removeClientDraft('client-a',draft.id);cold.saveClientDraft('client-a',draft);assert.equal(cold.clientDrafts('client-a').length,0,'stale mounted composer cannot revive abandoned draft');await flush();
 assert.equal((await load('lib/clientDrafts.ts',deps).loadClientDrafts('client-a')).length,0);
 let finish:(v:string)=>void=()=>{};
 const late=load('lib/clientDrafts.ts',{...deps,'@react-native-async-storage/async-storage':{default:{...storage,getItem:()=>new Promise<string>(resolve=>{finish=resolve})}}});
 const read=late.loadClientDrafts('client-a');generation++;rejected.forEach(fn=>fn());finish(JSON.stringify([draft]));await read;await flush();
 assert.equal(late.clientDrafts('client-a').length,0);
 const session=load('lib/clientDrafts.ts',deps);await session.loadClientDrafts('client-a');session.saveClientDraft('client-a',draft);await flush();
 generation++;rejected.forEach(fn=>fn('revoked'));await flush();
 assert.equal(session.clientDrafts('client-a').length,0,'rejected session closes in-memory access');
 const recovered=load('lib/clientDrafts.ts',deps);assert.equal((await recovered.loadClientDrafts('client-b')).length,0);
 assert.equal((await recovered.loadClientDrafts('client-a'))[0].problem,draft.problem,'same owner recovers after reauthentication');
 generation++;rejected.forEach(fn=>fn('logout'));await flush();assert.equal(memory.size,0,'explicit logout purges persisted drafts');
});

test('PB1 estimator restores question answers and offers an exit after failure without creating a request',async()=>{
 const fixture=JSON.parse(readFileSync('tests/fixtures/estimator-canonical.json','utf8'));let saved:any,closed=0,calls=0;
 const first={ok:true,session:{session_token:'opaque',metier:'plomberie',state:'QUALIFYING'},next_step:fixture.question};
 const {ClientIntelligence}=load('components/ClientIntelligence.tsx',{'@/ui/ChoicePicker':{ChoicePicker:({options,value,onChange}:any)=>React.createElement('choices',{},options.map((o:any)=>React.createElement('action',{key:o.value,label:o.label,selected:value===o.value,onPress:()=>onChange(o.value)})))},'@/ui/KeyboardInput':{KeyboardInput:component('input')},'react-native':{View:'view',TextInput:'input',Keyboard:{dismiss(){}}},'expo-router':{router:{}},'expo-crypto':{randomUUID:()=> 'unused'},'@/lib/clientIntelligence':await import('../lib/clientIntelligence'),'@/lib/clientWorkspace':{getClientProfile:async()=>({phone:''})},'@/lib/mobileEstimator':{mobileEstimator:async()=>{calls++;throw new Error('NETWORK')}},'@/lib/magicLoop':{createRequest:()=>assert.fail('no business creation')},'@/ui/BackButton':{BackButton:component('back')},'@/ui/FixeoAction':{FixeoAction:component('action')},'@/ui/FixeoText':{FixeoText:component('text')},'./ClientEditorial':{ClientSection:component('section'),clientStyles:{}},'./ClientFixeoResult':{ClientFixeoResult:component('result')},'@/lib/clientEstimatorLabels.generated.json':{default:{}}});
 const props={context:{city:'fes',description:'Chauffe-eau en panne'},onCreated:()=>assert.fail('no request'),onStop:()=>assert.fail('no safety change'),onClose:()=>closed++,onDraftChange:(x:any)=>{saved=x}};
 let tree:any;const mount=async(initialDraft:any)=>{await renderer.act(async()=>{tree=renderer.create(React.createElement(ClientIntelligence,{...props,initialDraft}))})};
 await mount({result:first,answer:'LOCAL_ACCESSIBLE',started:true,history:[],phone:'',confirming:false,error:null});
 const actions=()=>tree.root.findAllByType('action');assert.equal(actions().find((x:any)=>x.props.label==='LOCAL_ACCESSIBLE').props.selected,true);assert.equal(calls,0);
 await renderer.act(async()=>actions().find((x:any)=>x.props.label==='Continuer').props.onPress());assert.equal(saved.error.kind,'retry');const checkpoint=structuredClone(saved);
 await renderer.act(async()=>tree.unmount());await mount(checkpoint);assert.equal(actions().find((x:any)=>x.props.label==='LOCAL_ACCESSIBLE').props.selected,true);
 await renderer.act(async()=>actions().find((x:any)=>x.props.label==='Continuer sans estimation').props.onPress());assert.equal(closed,1);assert.equal(calls,1);assert.equal(saved.lastAction.session_token,'opaque');await renderer.act(async()=>tree.unmount());
});

test('PB1 real Devis tabs, preview and confirmation reject forged sources and require each preceding stage',async()=>{
 let offers:any[]=[];const writes:any[]=[];let refresh:any;
 const deps:any={'react-native':{View:'view',Modal:component('modal'),ScrollView:component('scroll')},'expo-crypto':{randomUUID:()=> 'quote-id'},'expo-router':{router:{push(){}},useLocalSearchParams:()=>({id:'new',origin:'fixeo',requestId:'forged'})},'@/lib/magicLoop':{},'@/lib/artisanOS':{submitMarketplaceQuote:async(x:any)=>{writes.push(x);return {id:'created'}}},'@/lib/quoteValidation':{validateQuote},'@/lib/workspacePresentation':{formatWorkspaceDate},'@/lib/artisanExperience':{calculateQuote,money,businessStatus},'@/ui/FixeoText':{FixeoText:component('text')},'@/ui/FixeoAction':{FixeoAction:component('action')},'@/components/QuoteBreakdown':{QuoteBreakdown:component('breakdown')},'@/components/DateField':{DateField:component('date')}};
 deps['@/components/ArtisanEditorial']={ArtisanPage:component('page'),ArtisanSection:component('section'),ArtisanCue:component('cue'),ArtisanMessage:component('message'),ArtisanField:component('field'),ArtisanChoices:component('choices'),art:{},useArtisanQuery:()=>{const [data,set]=React.useState({quotes:[],clients:[],offers});refresh=()=>set({quotes:[],clients:[],offers});return {data,loading:false,reload:async()=>refresh()}},useArtisanAction:()=>({busy:false,rafi:{},run:async(fn:any)=>fn(),setMessage(){}})};
 const {default:Quote}=load('app/artisan-workspace/quote/[id].tsx',deps);let tree:any;await renderer.act(async()=>{tree=renderer.create(React.createElement(Quote))});
 const tabs=()=>tree.root.findAllByType('choices').find((x:any)=>x.props.label==='Étapes du devis');
 const action=(label:string)=>tree.root.findAllByType('action').find((x:any)=>x.props.label===label);
 await renderer.act(async()=>tabs().props.onChange('2'));assert.equal(tabs().props.value,'0');assert.ok(action('Continuer vers les lignes').props.disabled);
 assert.equal(tree.root.findByType('page').props.dock,undefined,'no secondary navigation bar');assert.doesNotMatch(JSON.stringify(tree.toJSON()),/Lié à une opportunité FIXEO/);
 offers=[{request_id:'forged'}];await renderer.act(async()=>refresh());assert.equal(tabs().props.value,'0');
 const title=tree.root.findAllByType('field').find((x:any)=>x.props.label.toLowerCase().includes('titre'));await renderer.act(async()=>title.props.onChangeText('Réparation chauffe-eau'));
 await renderer.act(async()=>tabs().props.onChange('2'));assert.equal(tabs().props.value,'0','empty lines cannot reach conditions');await renderer.act(async()=>tabs().props.onChange('1'));assert.equal(tabs().props.value,'1');
 const fields=()=>tree.root.findAllByType('field');await renderer.act(async()=>fields().find((x:any)=>x.props.label==='Désignation 1').props.onChangeText('Réparation'));
 await renderer.act(async()=>fields().find((x:any)=>/Prix/.test(x.props.label)).props.onChangeText('500'));await renderer.act(async()=>tabs().props.onChange('2'));assert.equal(tabs().props.value,'2');
 await renderer.act(async()=>action('Voir l’aperçu').props.onPress());assert.match(JSON.stringify(tree.toJSON()),/Lié à une opportunité FIXEO/);assert.equal(writes.length,0);
 offers=[];await renderer.act(async()=>refresh());assert.doesNotMatch(JSON.stringify(tree.toJSON()),/Lié à une opportunité FIXEO/);assert.equal(tabs().props.value,'0');assert.equal(writes.length,0);await renderer.act(async()=>tree.unmount());
});

test('PB1 generic names are omitted and dates remain local calendar dates',()=>{
 for(const name of ['Utilisateur','User','client','unknown']){assert.equal(clientGreetingName(name),null);assert.equal(clientProfileTitle(name),'Votre profil FIXEO');}
 assert.equal(clientGreetingName('Youness El Alaoui'),'Youness');assert.ok(formatWorkspaceDate('2026-10-07').includes('07'));
});

test('PB1 Mon espace shows every active request and resolves a multi-request follow action explicitly',async()=>{
 const nav:any[]=[];let rows:any[]=[{id:'a',description:'Fuite',service_category:'Plomberie',city:'Fès',status:'new'},{id:'b',description:'Prise',service_category:'Électricité',city:'Fès',status:'assigned'}],refresh:any;
 const {default:Home}=load('app/client-workspace/index.tsx',{'react-native':{View:'view',RefreshControl:component('refresh'),StyleSheet:{create:(v:any)=>v}},'expo-router':{router:{push:(p:any)=>nav.push(p)},useFocusEffect:(fn:any)=>React.useEffect(fn,[fn])},'@/lib/clientWorkspace':{getClientProfile:async()=>({full_name:'Utilisateur'}),listClientNotifications:async()=>[],listClientRequestHistory:async()=>rows},'@/lib/mobileResilience':{withMobileDeadline:(p:any)=>p,isMobileUiTimeout:()=>false},'@/lib/useForegroundRefresh':{useForegroundRefresh:(fn:any)=>{refresh=fn}},'@/lib/workspacePresentation':await import('../lib/workspacePresentation'),'@/lib/clientExperience':await import('../lib/clientExperience'),'@/lib/contextualCockpit':await import('../lib/contextualCockpit'),'@/ui/rafiPresence':{getClientRafiPresence:()=> 'idle'},'@/ui/tokens':await import('../ui/tokens'),'@/components/useWorkspaceDock':{useWorkspaceDock:()=>({items:[]})},'@/components/MobileShell':{MobileShell:component('shell')},'@/components/ClientDraftRecovery':{ClientDraftRecovery:component('drafts')},'@/components/ClientEditorial':{ClientPageIntro:component('intro'),ClientSection:component('section'),clientStyles:{}},'@/ui/FixeoScreen':{FixeoScreen:component('screen')},'@/ui/RafiScrollView':{RafiScrollView:component('scroll')},'@/ui/RafiOrb':{RafiOrb:component('orb')},'@/ui/FixeoText':{FixeoText:component('text')},'@/ui/FixeoAction':{FixeoAction:component('action')}});
 let tree:any;await renderer.act(async()=>{tree=renderer.create(React.createElement(Home))});assert.equal(tree.root.findByType('intro').props.title,'Bonjour.');
 const actions=()=>tree.root.findAllByType('action'),follows=()=>actions().filter((x:any)=>x.props.label.startsWith('Suivre ·'));
 assert.equal(follows().length,2);await renderer.act(async()=>actions().find((x:any)=>x.props.testID==='client-primary-action').props.onPress());assert.equal(nav[0],'/client-workspace/history');
 for(const action of follows())await renderer.act(async()=>action.props.onPress());assert.deepEqual(nav.slice(1).map(x=>x.params.id),['a','b']);
 rows=[{...rows[0],status:'validated'},rows[1]];await renderer.act(async()=>refresh());await renderer.act(async()=>actions().find((x:any)=>x.props.testID==='client-primary-action').props.onPress());assert.equal(nav.at(-1).params.id,'b');await renderer.act(async()=>tree.unmount());
});

test('PB1 Agenda identifies each invalid field, focuses it and creates only after complete input',async()=>{
 let saved=0,focus='';const {default:Agenda}=load('app/artisan-workspace/agenda.tsx',{'react-native':{View:'view'},'expo-router':{router:{},useLocalSearchParams:()=>({new:'1',clientId:'crm-client'})},'expo-crypto':{randomUUID:()=> 'job-id'},'@/lib/artisanOS':{saveBusinessJob:async(x:any)=>{assert.equal(x.client_id,'crm-client');saved++}},'@/lib/artisanExperience':await import('../lib/artisanExperience'),'@/lib/agendaDate':await import('../lib/agendaDate'),'@/components/AgendaDateTimeField':{AgendaDateTimeField:component('datetime')},'@/ui/FixeoText':{FixeoText:component('text')},'@/ui/FixeoAction':{FixeoAction:component('action')},'@/components/ArtisanEditorial':{ArtisanPage:component('page'),ArtisanSection:component('section'),ArtisanCue:component('cue'),ArtisanEmpty:component('empty'),ArtisanMessage:component('message'),ArtisanField:component('field'),ArtisanChoices:component('choices'),art:{},useArtisanQuery:()=>({data:{jobs:[],clients:[{id:'crm-client',full_name:'Client'}],missions:[]},loading:false,reload:async()=>{}}),useArtisanAction:()=>({busy:false,run:async(fn:any)=>fn(),setMessage(){}})}});
 let tree:any;await renderer.act(async()=>{tree=renderer.create(React.createElement(Agenda))});const title=()=>tree.root.findAllByType('field').find((x:any)=>x.props.label==='Titre de l’intervention');const date=()=>tree.root.findByType('datetime');
 title().props.inputRef.current={focus:()=>{focus='title'}};date().props.dateRef.current={focus:()=>{focus='date'}};date().props.timeRef.current={focus:()=>{focus='time'}};
 const save=async()=>{await renderer.act(async()=>tree.root.findAllByType('action').find((x:any)=>x.props.label==='Enregistrer l’intervention').props.onPress())};
 await save();assert.equal(saved,0);assert.equal(focus,'title');assert.ok(title().props.error);assert.ok(date().props.errors.date);assert.ok(date().props.errors.time);
 await renderer.act(async()=>title().props.onChangeText('Entretien chauffe-eau'));await save();assert.equal(focus,'date');
 await renderer.act(async()=>date().props.onDate('08/10/2026'));await save();assert.equal(focus,'time');assert.equal(saved,0);
 await renderer.act(async()=>date().props.onTime('14:30'));await save();assert.equal(saved,1);assert.equal(tree.root.findAllByType('datetime').length,0);await renderer.act(async()=>tree.unmount());
});

test('PB1 native page structure keeps one dock, contextual CTA inside scroll and compact Auth hierarchy',async()=>{
 const tokens=await import('../ui/tokens');let viewport={width:320,height:568,fontScale:1};
 const native={View:'view',Text:'text',TextInput:'input',KeyboardAvoidingView:component('keyboard'),Platform:{OS:'android'},StyleSheet:{create:(v:any)=>v},useWindowDimensions:()=>viewport};
 const shared={'react-native':native,'@/ui/tokens':tokens,'@/ui/BackButton':{BackButton:component('back')},'@/ui/FixeoScreen':{FixeoScreen:component('screen')},'@/ui/RafiScrollView':{RafiScrollView:component('scroll')},'@/ui/RafiOrb':{RafiOrb:component('orb')},'@/ui/FixeoAction':{FixeoAction:component('action')},'@/ui/FixeoText':{FixeoText:component('text')}};
 const {AuthFrame}=load('components/AuthFrame.tsx',{...shared,'@/lib/authContract':{authCopy:{}}});
 for(const size of [[320,568,1],[360,640,1.3],[360,380,2],[412,915,1]]){viewport={width:size[0],height:size[1],fontScale:size[2]};let tree:any;await renderer.act(async()=>{tree=renderer.create(React.createElement(AuthFrame,{title:'Retrouvez votre espace',detail:'Connectez-vous'},React.createElement('action',{label:'Connexion'})))});assert.equal(tree.root.findByType('back').props.iconOnly,true);const orb=tree.root.findByType('orb');assert.ok(orb.props.size>=84&&orb.props.size<=108);assert.equal(tree.root.findByType('scroll').findAllByType('action').length,1);const order=JSON.stringify(tree.toJSON());assert.ok(order.indexOf('FIXEO')<order.indexOf('orb'));assert.ok(order.indexOf('orb')<order.indexOf('Retrouvez'));await renderer.act(async()=>tree.unmount());}
 const dock={items:[{key:'offers',label:'Opportunités'},{key:'rafi',label:'RAFI'},{key:'agenda',label:'Agenda'}]};
 const {ArtisanPage}=load('components/ArtisanEditorial.tsx',{...shared,'@/ui/pageLayout':await import('../ui/pageLayout'),'@/ui/RafiSignal':{RafiSignalContext:React.createContext(null)},'./useWorkspaceDock':{useWorkspaceDock:()=>dock},'./MobileShell':{MobileShell:component('shell')}});
 let tree:any;await renderer.act(async()=>{tree=renderer.create(React.createElement(ArtisanPage,{title:'Votre journée, en confiance.',back:false,hero:React.createElement('orb'),dock:{items:[...dock.items,{key:'quote',label:'Créer un devis'}]}},React.createElement('action',{label:'Enregistrer l’intervention'})))});
 assert.equal(tree.root.findByType('screen').props.contextDock,dock);const scroll=tree.root.findByType('scroll');assert.deepEqual(scroll.findAllByType('action').map((x:any)=>x.props.label),['Créer un devis','Enregistrer l’intervention']);assert.equal(scroll.props.style.flex,1);assert.ok(scroll.findAll((node:any)=>node.type==='orb'||(node.type==='text'&&node.props.children==='Votre journée, en confiance.'))[0].type==='orb');await renderer.act(async()=>tree.unmount());
});
