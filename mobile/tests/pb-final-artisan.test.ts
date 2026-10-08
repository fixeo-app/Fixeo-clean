import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { artisanNotificationTarget } from '../lib/artisanNotificationTarget';
import { createArtisanProgressive } from '../lib/artisanProgressive';
const require=createRequire(import.meta.url), React=require('react'), renderer=require('react-test-renderer');
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const component=(name:string)=>function Component(props:any){return React.createElement(name,props,props.children)};
function load(file:string,deps:Record<string,unknown>){const exports:Record<string,any>={};vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:(name:string)=>name==='react'||name==='react/jsx-runtime'?require(name):deps[name]||(name==='@/lib/useUnsavedChanges'?{useUnsavedChanges:()=>{}}:name==='@/lib/usePendingBusinessForm'?{usePendingBusinessForm:()=>({ready:true,frozen:false,error:'',lock(){},settle:async()=>{},refresh:async()=>{}})}:name==='./authEvents'?{privateSessionGeneration:()=>0,onSessionRejected:()=>()=>{}}:name==='./pendingBusinessWrite'?{guardedBusinessWrite:(_o:any,_s:any,_p:any,fn:any)=>fn()}: {}),setTimeout,clearTimeout,Promise});return exports;}
const idA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',idB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('B4 notification targets are owner-read objects of the correct type; missing and cross-role never fall home',()=>{
 const n:any={type:'a_mission_completed',related_entity_type:'mission',related_entity_id:idB};
 const missions:any=[{mission_id:idA,request_id:idB}];
 assert.deepEqual(artisanNotificationTarget(n,missions,[]),{pathname:'/mission/[id]',params:{id:idA}});
 assert.equal(artisanNotificationTarget(n,[],[]),null);
 assert.equal(artisanNotificationTarget({...n,type:'c_mission_completed'},missions,[]),null);
 assert.equal(artisanNotificationTarget({...n,related_entity_type:'claim_request'},missions,[]),null);
 assert.deepEqual(artisanNotificationTarget({...n,related_entity_type:'service_request'},[],[{request_id:idB}]),{pathname:'/artisan-workspace/opportunity/[id]',params:{id:idB}});
});

test('B4 Home keeps dated module data after network failure only while fresh canonical authority succeeds',async()=>{
 let offline=false,revoked=false;
 const c=createArtisanProgressive(async()=>{if(revoked)throw Error('SESSION_REVOKED');return 'owner-a'}, {ledger:async()=>{if(offline)throw Error('NETWORK');return [500,120]}},()=>{});
 await c.refresh();const timestamp=c.state.modules.ledger.lastUpdatedAt;assert.ok(timestamp);
 offline=true;await c.refresh(true);assert.deepEqual(c.state.modules.ledger.data,[500,120]);assert.equal(c.state.modules.ledger.status,'unavailable');assert.equal(c.state.modules.ledger.lastUpdatedAt,timestamp);
 revoked=true;await c.refresh(true);assert.equal(c.state.modules.ledger.data,null);
});

test('B4 actual shared query keeps dated data on failed refresh and immediately purges revoked identity; failed action never reports success',async()=>{
 let fail=false,generation=0,reject:()=>void=()=>{},snapshot:any,action:any;
 const fetcher=async()=>{if(fail)throw Error('NETWORK');return {amount:500}};
 const deps:any={'react-native':{StyleSheet:{create:(v:any)=>v}},'expo-router':{useFocusEffect:(fn:any)=>React.useEffect(fn,[fn])},'@/lib/authEvents':{privateSessionGeneration:()=>generation,onSessionRejected:(fn:any)=>{reject=fn;return ()=>{}}},'@/lib/mobileResilience':{withMobileDeadline:(x:any)=>x},'@/lib/artisanExperience':{artisanError:()=> 'Connexion indisponible.'},'@/lib/useForegroundRefresh':{useForegroundRefresh:()=>{}},'@/ui/rafiPresence':{rafiActionState:()=> 'idle'},'@/ui/tokens':await import('../ui/tokens'),'@/ui/pageLayout':await import('../ui/pageLayout')};
 const api=load('components/ArtisanEditorial.tsx',deps);function Host(){snapshot=api.useArtisanQuery(fetcher);action=api.useArtisanAction();return null}let tree:any;
 await renderer.act(async()=>{tree=renderer.create(React.createElement(Host))});assert.equal(snapshot.data.amount,500);const at=snapshot.lastUpdatedAt;
 fail=true;await renderer.act(async()=>snapshot.reload());assert.equal(snapshot.data.amount,500);assert.equal(snapshot.lastUpdatedAt,at);assert.match(snapshot.error,/Dernières données/);
 await renderer.act(async()=>action.run(async()=>{throw Error('WRITE_FAILED')},'Lecture enregistrée.'));assert.doesNotMatch(action.message,/Lecture enregistrée/);
 await renderer.act(async()=>{generation++;reject()});assert.equal(snapshot.data,null);await renderer.act(async()=>tree.unmount());
});

test('B4 actual Clients retains all 50 owner rows, searchable without resetting on rerender, with a virtualized page contract',async()=>{
 const clients=Array.from({length:50},(_,i)=>({id:'client-'+i,full_name:'Client '+i,city:'Fès'}));const nav:any[]=[];
 const {default:Clients}=load('app/artisan-workspace/clients.tsx',{'react-native':{View:'view'},'expo-router':{router:{push:(p:any)=>nav.push(p)}},'@/lib/artisanOS':{},'@/ui/FixeoText':{FixeoText:component('text')},'@/ui/FixeoAction':{FixeoAction:component('action')},'@/components/ArtisanEditorial':{ArtisanPage:component('page'),ArtisanField:component('field'),ArtisanEmpty:component('empty'),ArtisanMessage:component('message'),ArtisanCue:component('cue'),art:{},useArtisanQuery:()=>({data:clients,loading:false,reload:async()=>{}})}});
 let tree:any;await renderer.act(async()=>{tree=renderer.create(React.createElement(Clients))});assert.equal(tree.root.findByType('page').props.list.data.length,50);
 await renderer.act(async()=>tree.root.findByType('field').props.onChangeText('Client 49'));assert.equal(tree.root.findByType('page').props.list.data.length,1);
 await renderer.act(async()=>tree.update(React.createElement(Clients)));assert.equal(tree.root.findByType('field').props.value,'Client 49');assert.equal(tree.root.findByType('page').props.list.data[0].id,'client-49');
 const shell=readFileSync('components/ArtisanEditorial.tsx','utf8');assert.match(shell,/<FlatList data=\{list.data\}/);assert.match(shell,/renderScrollComponent=\{props => <ScrollView/);
 await renderer.act(async()=>tree.unmount());
});

test('B5 quote writes compare owner, draft status and version atomically; stale conflict and lost-response retry never overwrite twice',async()=>{
 const {calculateQuote}=await import('../lib/artisanExperience');const {sameQuoteContent}=await import('../lib/quoteVersion');
 const input={id:idA,title:'Réparation 250',client_id:idB,items:[{type:'service',label:'Réparation',quantity:1,unit_price:250}],discount:0,notes:'',validity_date:null,estimated_duration:''};
 let row:any={...input,...calculateQuote(input.items as any,0),owner_user_id:'owner-a',source:'personal',status:'draft',updated_at:'2026-10-08T14:00:00Z'},writes=0,actor='owner-a';const predicates:any[]=[];
 const api=load('lib/artisanOS.ts',{'./quoteVersion':{sameQuoteContent},'./artisanProgressive':{inFlightRead:(fn:any)=>fn},'./dateValidation':await import('../lib/dateValidation'),'./moneyContract':await import('../lib/moneyContract'),'./artisanExperience':{calculateQuote},'./supabase':{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'synthetic-only'}}})},rpc:async()=>({data:{ok:true,user_id:actor}}),from:()=>{
  const filters:any={},q:any={eq:(k:string,v:any)=>{filters[k]=v;return q},select:()=>q,update:(payload:any)=>{q.payload=payload;return q},single:async()=>{
    const match=Object.entries(filters).every(([k,v])=>row[k]===v);
    if(q.payload){predicates.push({...filters});if(!match)return {data:null,error:{code:'PGRST116'}};row={...row,...q.payload};writes++;}
    return match?{data:{...row}}:{data:null,error:{code:'PGRST116'}};
  }};return q;
 }}}});
 const baseline=row.updated_at;await assert.rejects(api.saveBusinessQuote(input,true),/QUOTE_VERSION_REQUIRED/);assert.equal(writes,0);
 await api.saveBusinessQuote({...input,title:'Ma modification'},true,baseline);assert.equal(writes,1);assert.equal(row.total,250);
 assert.deepEqual(predicates[0],{id:idA,owner_user_id:'owner-a',source:'personal',status:'draft',updated_at:baseline});
 await assert.rejects(api.saveBusinessQuote({...input,title:'Écrasement obsolète'},true,baseline),/QUOTE_VERSION_CONFLICT/);assert.equal(writes,1);assert.equal(row.title,'Ma modification');
 const reconciled=await api.saveBusinessQuote({...input,title:'Ma modification'},true,baseline);assert.equal(reconciled.title,'Ma modification');assert.equal(writes,1);
 actor='owner-b';await assert.rejects(api.saveBusinessQuote(input,true,row.updated_at),/QUOTE_VERSION_CONFLICT/);assert.equal(writes,1);
});

test('B6 actual profile preserves dirty phone/zones across refresh and bio save; remote conflicts require an explicit choice and section-only writes',async()=>{
 const draftLib=await import('../lib/sectionDraft');const hooks=load('lib/useSectionDraft.ts',{'./sectionDraft':draftLib});
 let profile:any={id:idA,owner_user_id:'owner-a',name:'PB1 Artisan Test',city:'Fès',phone_public:'0612345678',services:['Électricité','Plomberie'],description:'Présentation initiale',availability:'available',work_zone:'Fès, Rabat'};
 const writes:any[]=[];let tree:any;
 const activity=(p:any)=>p.work_zone.split(', ').filter(Boolean);
 const deps:any={'react-native':{View:'view',Image:'image'},'@/lib/clientLocation':await import('../lib/clientLocation'),'@/lib/sectionDraft':draftLib,'@/lib/useSectionDraft':hooks,'@/lib/artisanExperience':await import('../lib/artisanExperience'),
 '@/lib/artisanOS':{loadArtisanProfile:async()=>structuredClone(profile),artisanProfileCities:activity,saveArtisanBio:async(description:string)=>{profile={...profile,description};return {description}},saveArtisanProfile:async(input:any,previous:any)=>{writes.push({input,previous});profile={...profile,phone_public:input.phone,services:input.services,city:input.cities[0],work_zone:input.cities.join(', ')}}},
 '@/components/ArtisanProfileChecklist':{ArtisanProfileChecklist:component('checklist')},'@/components/CityField':{CityZonesField:component('cities')},'@/components/ServiceField':{ServiceField:component('services')},'@/ui/FixeoText':{FixeoText:component('text')},'@/ui/FixeoAction':{FixeoAction:component('action')},
 '@/components/ArtisanEditorial':{ArtisanPage:component('page'),ArtisanSection:component('section'),ArtisanChoices:component('choices'),ArtisanField:component('field'),ArtisanMessage:component('message'),art:{},useArtisanQuery:()=>{const [data,set]=React.useState({profile:structuredClone(profile)});return {data,loading:false,reload:async()=>set({profile:structuredClone(profile)})}},useArtisanAction:()=>({rafi:{},busy:false,setMessage(){},run:async(fn:any)=>{try{return await fn()}catch{return undefined}}})}};
 const {default:Profile}=load('app/artisan-workspace/profile.tsx',deps);
 await renderer.act(async()=>{tree=renderer.create(React.createElement(Profile))});
 const select=async(value:string)=>renderer.act(async()=>tree.root.findByType('choices').props.onChange(value));
 const field=()=>tree.root.findByType('field');const tap=async(label:string)=>{const a=tree.root.findAllByType('action').find((x:any)=>x.props.label===label);assert.ok(a&&!a.props.disabled,label);await renderer.act(async()=>a.props.onPress())};
 await renderer.act(async()=>field().props.onChangeText('0622222222'));await renderer.act(async()=>tree.root.findByType('page').props.onRefresh());assert.equal(field().props.value,'0622222222');
 await select('activity');await renderer.act(async()=>tree.root.findByType('cities').props.onChange(['Fès','Rabat','Meknès']));
 await select('bio');await renderer.act(async()=>field().props.onChangeText('Présentation enrichie'));await tap('Enregistrer ma présentation');assert.equal(profile.description,'Présentation enrichie');assert.equal(writes.length,0);
 await select('activity');assert.deepEqual(Array.from(tree.root.findByType('cities').props.values),['Fès','Rabat','Meknès']);assert.deepEqual(Array.from(tree.root.findByType('services').props.values),['Électricité','Plomberie']);
 await select('contact');assert.equal(field().props.value,'0622222222');profile={...profile,phone_public:'0633333333'};await renderer.act(async()=>tree.root.findByType('page').props.onRefresh());
 assert.equal(field().props.value,'0622222222');assert.equal(tree.root.findAllByType('action').find((x:any)=>x.props.label==='Enregistrer mes coordonnées').props.disabled,true);
 await tap('Conserver explicitement ma saisie');await tap('Enregistrer mes coordonnées');assert.equal(writes.length,1);assert.deepEqual(Array.from(writes[0].input.cities),['Fès','Rabat'],'saving phone does not submit dirty zones');
 await select('activity');assert.deepEqual(Array.from(tree.root.findByType('cities').props.values),['Fès','Rabat','Meknès']);await tap('Annuler les modifications de cette section');assert.deepEqual(Array.from(tree.root.findByType('cities').props.values),['Fès','Rabat']);
 await renderer.act(async()=>tree.unmount());
});

test('B6 durable pending intent survives cold reload, rejects changed payload and disk failure before mutation, and stays owner isolated',async()=>{
 const memory=new Map<string,string>();let full=false,generation=0,mutations=0;
 const deps:any={'@react-native-async-storage/async-storage':{default:{getItem:async(k:string)=>memory.get(k)||null,setItem:async(k:string,v:string)=>{if(full)throw Error('DISK_FULL');memory.set(k,v)},removeItem:async(k:string)=>memory.delete(k)}},'./authEvents':{privateSessionGeneration:()=>generation}};
 const api=load('lib/pendingBusinessWrite.ts',deps),payload={id:idA,amount:500,client_id:idB,note:'Fixture'};
 await assert.rejects(api.guardedBusinessWrite('owner-a','finance',payload,async()=>{mutations++;throw Error('NETWORK_AFTER_COMMIT')}),/NETWORK/);assert.equal(mutations,1);
 const cold=load('lib/pendingBusinessWrite.ts',deps);assert.equal(JSON.stringify(await cold.readPendingBusinessWrite('owner-a','finance')),JSON.stringify(payload));assert.equal(await cold.readPendingBusinessWrite('owner-b','finance'),null);
 await assert.rejects(cold.guardedBusinessWrite('owner-a','finance',{...payload,amount:120},async()=>mutations++),/PENDING_WRITE_LOCKED/);assert.equal(mutations,1);
 await cold.guardedBusinessWrite('owner-a','finance',payload,async()=>({id:idA,amount:500}));assert.equal(await cold.readPendingBusinessWrite('owner-a','finance'),null);
 full=true;await assert.rejects(cold.guardedBusinessWrite('owner-a','finance',payload,async()=>mutations++),/DISK_FULL/);assert.equal(mutations,1);
 full=false;const pending=cold.guardedBusinessWrite('owner-a','finance',payload,async()=>mutations++);generation++;await assert.rejects(pending,/SESSION_REVOKED/);assert.equal(mutations,1);
});

test('B6 native navigation guard keeps edits on Cancel, supports durable exit, and never blocks revocation',async()=>{
 let enabled=false,block:any,reject:any,buttons:any[]=[];const actions:any[]=[];const navigation={dispatch:(a:any)=>actions.push(a)};
 const {useUnsavedChanges}=load('lib/useUnsavedChanges.ts',{'@react-navigation/native':{useNavigation:()=>navigation,usePreventRemove:(on:boolean,fn:any)=>{enabled=on;block=fn}},'react-native':{Alert:{alert:(_t:string,_m:string,b:any[])=>buttons=b}},'./authEvents':{onSessionRejected:(fn:any)=>{reject=fn;return ()=>{}}}});
 function Host(){useUnsavedChanges(true,true);return null}let tree:any;await renderer.act(async()=>{tree=renderer.create(React.createElement(Host))});assert.equal(enabled,true);
 await renderer.act(async()=>block({data:{action:{type:'GO_BACK'}}}));assert.equal(actions.length,0);assert.equal(buttons[0].style,'cancel');assert.match(buttons[1].text,/conservé/);
 await renderer.act(async()=>buttons[1].onPress());assert.equal(enabled,false);assert.equal(actions.length,1);await renderer.act(async()=>tree.unmount());
 actions.length=0;await renderer.act(async()=>{tree=renderer.create(React.createElement(Host))});await renderer.act(async()=>reject('revoked'));assert.equal(enabled,false);await renderer.act(async()=>tree.unmount());
});

test('B6 actual Agenda API retries an existing stable ID without resetting its later completed status',async()=>{
 const row={id:idA,owner_user_id:'owner-a',source:'personal',status:'completed',title:'Intervention',client_id:idB,scheduled_at:'2026-10-09T13:00:00+00:00',notes:'Fixture'};let mutations=0;
 const api=load('lib/artisanOS.ts',{'./artisanProgressive':{inFlightRead:(fn:any)=>fn},'./supabase':{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'synthetic-only'}}})},rpc:async()=>({data:{ok:true,user_id:'owner-a'}}),from:()=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:row}),insert:()=>{mutations++;return q},update:()=>{mutations++;return q}};return q;}}}});
 const {owner_user_id:_,source:__,status:___,...payload}=row;
 const result=await api.saveBusinessJob({...payload,scheduled_at:'2026-10-09T13:00:00.000Z'});assert.equal(result.status,'completed');assert.equal(mutations,0);
 await assert.rejects(api.saveBusinessJob({...payload,title:'Autre contenu'}),/BUSINESS_PENDING_CONFLICT/);assert.equal(mutations,0);
});

test('B6 pending form loads only the canonical owner payload, freezes editing and releases after canonical settlement',async()=>{
 let stored:any={id:idA,amount:500},restored:any,state:any;let rejected:any;
 const {usePendingBusinessForm}=load('lib/usePendingBusinessForm.ts',{'react-native':{Keyboard:{dismiss(){}}},'./artisanOS':{artisanAccess:async()=>({user_id:'owner-a'})},'./authEvents':{onSessionRejected:(fn:any)=>{rejected=fn;return ()=>{}}},'./pendingBusinessWrite':{readPendingBusinessWrite:async(owner:string,scope:string)=>{assert.equal(owner,'owner-a');assert.equal(scope,'finance');return stored}}});
 function Host(){state=usePendingBusinessForm('finance',(p:any)=>restored=p);return null}let tree:any;
 await renderer.act(async()=>{tree=renderer.create(React.createElement(Host))});assert.equal(restored.id,idA);assert.equal(state.frozen,true);assert.equal(state.ready,true);
 stored=null;await renderer.act(async()=>state.settle());assert.equal(state.frozen,false);
 await renderer.act(async()=>rejected('revoked'));assert.equal(state.ready,false);assert.equal(state.frozen,true);await renderer.act(async()=>tree.unmount());
});
