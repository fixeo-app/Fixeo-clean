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
function load(file:string,deps:Record<string,unknown>){const exports:Record<string,any>={};vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:(name:string)=>name==='react'||name==='react/jsx-runtime'?require(name):deps[name]||{},setTimeout,clearTimeout,Promise});return exports;}
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
