import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url), React=require('react'), renderer=require('react-test-renderer');
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
function load(file:string,deps:Record<string,unknown>) {
 const exports:Record<string,any>={};
 vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
 {exports,require:(name:string)=>name==='react'||name==='react/jsx-runtime'?require(name):deps[name]||{},setTimeout,clearTimeout,Promise});
 return exports;
}
const component=(name:string)=>function MockComponent(props:any){return React.createElement(name,props,props.children)};

test('PB1 canonical CTA variants remain visible buttons and block duplicate busy actions',async()=>{
 const tokens=await import('../ui/tokens'), contract=await import('../ui/interactionContract');
 const flatten=(value:any):any=>Array.isArray(value)?Object.assign({},...value.filter(Boolean).map(flatten)):value||{};
 const {FixeoAction}=load('ui/FixeoAction.tsx',{'react-native':{Pressable:'pressable',ActivityIndicator:'spinner',StyleSheet:{create:(v:any)=>v,flatten}},
  '@/lib/feedback':{triggerFixeoFeedback:()=>{}},'./FixeoText':{FixeoText:component('text')},'./interactionContract':contract,
  './useReducedMotion':{useReducedMotion:()=>true},'./tokens':tokens});
 for(const variant of ['primary','secondary','tertiary','ghost']){
  let calls=0,tree:any;const props={label:'Ouvrir mon agenda',variant,onPress:()=>calls++};
  await renderer.act(async()=>{tree=renderer.create(React.createElement(FixeoAction,props))});
  const button=()=>tree.root.findByType('pressable').props;
  const style=flatten(button().style({pressed:false}));assert.equal(button().accessibilityRole,'button');assert.ok(style.minHeight>=48);
  if(variant==='primary')assert.equal(style.backgroundColor,tokens.semanticColors.background.focus);
  else {assert.equal(style.backgroundColor,tokens.semanticColors.background.canvas);assert.ok(style.borderWidth>=1);assert.equal(style.borderColor,tokens.semanticColors.border.strong);}
  await renderer.act(async()=>button().onPress({}));assert.equal(calls,1);
  await renderer.act(async()=>tree.update(React.createElement(FixeoAction,{...props,busy:true})));
  await renderer.act(async()=>button().onPress({}));assert.equal(calls,1);assert.equal(button().disabled,true);
  await renderer.act(async()=>tree.unmount());
 }
});

test('PB1 actual city selector renders the entire supported registry and selects canonical accented values',async()=>{
 const cities=await import('../lib/clientLocation'),tokens=await import('../ui/tokens');
 const {CityField}=load('components/CityField.tsx',{'react-native':{View:'view',ScrollView:'scroll',TextInput:'input',StyleSheet:{create:(v:any)=>v}},
  '@/lib/clientLocation':cities,'@/ui/FixeoText':{FixeoText:component('text')},'@/ui/ShellControl':{ShellControl:component('control'),ShellIcon:component('icon')},
  '@/ui/tokens':tokens,'./ClientEditorial':{clientStyles:{input:{}}}});
 let selected='',tree:any;await renderer.act(async()=>{tree=renderer.create(React.createElement(CityField,{value:'',onChange:(v:string)=>selected=v}))});
 const controls=()=>tree.root.findAllByType('control');
 await renderer.act(async()=>controls().find((n:any)=>n.props.accessibilityLabel==='Afficher les villes').props.onPress());
 assert.equal(controls().filter((n:any)=>n.props.accessibilityLabel.startsWith('Choisir ')).length,21);
 assert.equal(tree.root.findByType('scroll').props.nestedScrollEnabled,true);
 assert.match(tree.root.findByType('input').props.placeholder,/Fès, Rabat/);
 await renderer.act(async()=>tree.root.findByType('input').props.onChangeText('Tetouan'));
 await renderer.act(async()=>controls().find((n:any)=>n.props.accessibilityLabel==='Choisir Tétouan').props.onPress());
 assert.equal(selected,'Tétouan');await renderer.act(async()=>tree.unmount());
});

test('PB1 V2 actual microphone component survives permission-return rerender, transmits only on Stop, cleans background and unmount',async()=>{
 let recording=false,stops=0,requests=0;const delivered:string[]=[],listening:boolean[]=[];
 const nativeListeners=new Set<(state:string)=>void>();
 const recorder={uri:'file:///synthetic-recording.m4a',prepareToRecordAsync:async()=>{},record:()=>{recording=true},stop:async()=>{stops++;recording=false}};
 const audio={AudioModule:{getRecordingPermissionsAsync:async()=>({granted:true}),requestRecordingPermissionsAsync:async()=>{requests++;return {granted:true}}},
   RecordingPresets:{HIGH_QUALITY:{}},setAudioModeAsync:async()=>{},useAudioRecorder:()=>recorder,useAudioRecorderState:()=>({isRecording:recording})};
 const {RafiInputRail}=load('components/RafiInputRail.tsx',{'expo-audio':audio,'react-native':{AppState:{addEventListener:(_event:string,fn:any)=>{nativeListeners.add(fn);return {remove:()=>nativeListeners.delete(fn)}}}},
   '@/lib/permissionPrompt':{explainPermission:async()=>true},'./RafiComposer':{RafiComposer:component('composer')}});
 const props=()=>({onVoiceReady:(uri:string)=>delivered.push(uri),onPhotoReady:()=>{},onListeningChange:(value:boolean)=>listening.push(value)});
 let tree:any;await renderer.act(async()=>{tree=renderer.create(React.createElement(RafiInputRail,props()))});
 await renderer.act(async()=>tree.root.findByType('composer').props.onVoice());
 assert.equal(recording,true);assert.deepEqual(listening,[true]);assert.equal(requests,0);assert.equal(delivered.length,0);
 await renderer.act(async()=>tree.update(React.createElement(RafiInputRail,props())));
 assert.equal(recording,true);assert.equal(stops,0,'fresh callback props must not tear down the recorder');
 await renderer.act(async()=>tree.root.findByType('composer').props.onVoice());
 assert.deepEqual(delivered,['file:///synthetic-recording.m4a']);assert.equal(recording,false);
 await renderer.act(async()=>tree.root.findByType('composer').props.onVoice());
 await renderer.act(async()=>nativeListeners.forEach(fn=>fn('background')));
 assert.equal(recording,false);assert.equal(delivered.length,1,'background must not send an unfinished recording');
 await renderer.act(async()=>tree.unmount());assert.equal(nativeListeners.size,0);assert.ok(stops>=3);
});

test('PB1 V2 actual capture normalizes the selected bytes source and handles cancellation and late completion',async()=>{
 let cancelled=false,active=true,normalizations=0,permissions=0;const inputs:any[]=[];
 const picker={getCameraPermissionsAsync:async()=>({granted:true}),requestCameraPermissionsAsync:async()=>{permissions++;return {granted:true}},
   launchCameraAsync:async()=>({canceled:cancelled,assets:[{uri:'file:///camera-source.jpg',width:4000,height:3000}]})};
 const {captureRafiPhoto}=load('lib/rafiPhotoCapture.ts',{'expo-image-picker':picker,'./permissionPrompt':{explainPermission:async()=>true},
 'expo-image-manipulator':{SaveFormat:{JPEG:'jpeg'},manipulateAsync:async(...args:any[])=>{normalizations++;inputs.push(args);return {uri:'file:///normalized-photo.jpg'}}}});
 const photo=await captureRafiPhoto('camera',()=>active);assert.equal(photo.uri,'file:///normalized-photo.jpg');assert.equal(photo.mimeType,'image/jpeg');
 assert.equal(inputs[0][0],'file:///camera-source.jpg');assert.equal(inputs[0][1][0].resize.width,1600);assert.equal(inputs[0][2].format,'jpeg');assert.equal(permissions,0);
 cancelled=true;assert.equal(await captureRafiPhoto('camera',()=>active),null);assert.equal(normalizations,1);
 cancelled=false;picker.launchCameraAsync=async()=>{active=false;return {canceled:false,assets:[{uri:'file:///late.jpg',width:10,height:10}]}};
 assert.equal(await captureRafiPhoto('camera',()=>active),null);assert.equal(normalizations,1);
});

test('PB1 V2 actual photo preview renders selected URI, viewing and correction controls without analysis',async()=>{
 let changed='',removed=0,clarifications=0,captures=0;
 const native={Image:'Image',Modal:'Modal',View:'View',StyleSheet:{create:(s:any)=>s}};
 const {RafiPhotoPreview}=load('components/RafiPhotoPreview.tsx',{'react-native':native,
   '@/lib/rafiPhotoCapture':{captureRafiPhoto:async()=>{captures++;return {uri:'file:///replacement.jpg',mimeType:'image/jpeg'}}},
   '@/ui/FixeoText':{FixeoText:component('text')},'@/ui/FixeoAction':{FixeoAction:component('action')},'@/ui/tokens':{semanticColors:{background:{surface:'#fff'}},space:{sm:8}}});
 let tree:any;const props={uri:'file:///selected.jpg',onChange:(uri:string)=>{changed=uri},onRemove:()=>removed++,onClarify:()=>clarifications++};
 await renderer.act(async()=>{tree=renderer.create(React.createElement(RafiPhotoPreview,props))});
 assert.equal(tree.root.findAllByType('Image')[0].props.source.uri,props.uri);assert.equal(captures,0);
 const action=(label:string)=>tree.root.findAllByType('action').find((node:any)=>node.props.label===label).props;
 await renderer.act(async()=>action('Voir la photo').onPress());assert.equal(tree.root.findByType('Modal').props.visible,true);
 await renderer.act(async()=>action('Reprendre').onPress());assert.equal(changed,'file:///replacement.jpg');
 await renderer.act(async()=>action('Ajouter une précision').onPress());assert.equal(clarifications,1);
 await renderer.act(async()=>action('Continuer sans photo').onPress());assert.equal(removed,1);
 await renderer.act(async()=>tree.update(React.createElement(RafiPhotoPreview,{...props,busy:true})));
 assert.equal(action('Changer').disabled,true);assert.equal(action('Supprimer').disabled,true);
 await renderer.act(async()=>tree.update(React.createElement(RafiPhotoPreview,{...props,readOnly:true})));
 assert.equal(tree.root.findAllByType('Image')[0].props.source.uri,props.uri);
 assert.equal(tree.root.findAllByType('action').some((node:any)=>node.props.label==='Supprimer'),false);
 await renderer.act(async()=>tree.unmount());
});

test('PB1 V2 microphone explanation is accepted once per installation across roles; native permission remains independent',async()=>{
 const values=new Map<string,string>();let prompts=0;
 const {explainPermission}=load('lib/permissionPrompt.ts',{'@react-native-async-storage/async-storage':{default:{getItem:async(k:string)=>values.get(k),setItem:async(k:string,v:string)=>values.set(k,v)}},
 'react-native':{Platform:{OS:'android'},Alert:{alert:(_t:string,_m:string,buttons:any[])=>{prompts++;buttons[1].onPress()}}}});
 assert.equal(await explainPermission('microphone'),true);assert.equal(await explainPermission('microphone'),true);assert.equal(prompts,1);
});

test('PB1 final real canonical loop component selects native alpha sources and never decodes an unseen MINI',async()=>{
 const {createMasterPlayback,rafiMasterVariant}=await import('../ui/rafiMasterPlayback');
 let starts=0,stops=0;
 const NativeImage=React.forwardRef(function NativeImage(props:any,ref:any){
  React.useImperativeHandle(ref,()=>({startAnimating:async()=>{starts++;},stopAnimating:async()=>{stops++;}}),[]);
  return React.createElement('native-image',props);
 });
 const deps:any={'expo-image':{Image:NativeImage},'./rafiMasterPlayback':{createMasterPlayback,rafiMasterVariant}};
 for(const size of ['hero','medium','mini'])for(const suffix of ['.webp','-poster.png'])deps[`../assets/rafi/master-loop-v1/rafi-${size}${suffix}`]=`${size}${suffix}`;
 const {RafiMasterLoop}=load('ui/RafiMasterLoop.tsx',deps);
 let tree:any;await renderer.act(async()=>{tree=renderer.create(React.createElement(RafiMasterLoop,{diameter:44,active:false,reduced:false}))});
 const native=()=>tree.root.findByType('native-image').props;
 assert.equal(native().source,'mini-poster.png');assert.equal(starts,0);assert.equal(native().autoplay,false);assert.equal(native().transition,0);assert.equal(native().cachePolicy,'none');
 await renderer.act(async()=>tree.update(React.createElement(RafiMasterLoop,{diameter:44,active:true,reduced:false})));
 assert.equal(native().source,'mini.webp');await renderer.act(async()=>native().onLoad());assert.ok(starts>0);
 const before=starts;await renderer.act(async()=>tree.update(React.createElement(RafiMasterLoop,{diameter:44,active:false,reduced:false})));
 assert.ok(stops>0);await renderer.act(async()=>native().onLoad());assert.equal(starts,before);
 await renderer.act(async()=>tree.update(React.createElement(RafiMasterLoop,{diameter:96,active:true,reduced:true})));
 assert.equal(native().source,'hero-poster.png');
 await renderer.act(async()=>tree.update(React.createElement(RafiMasterLoop,{diameter:76,active:true,reduced:false})));
 assert.equal(native().source,'medium.webp');await renderer.act(async()=>native().onError());assert.equal(native().source,'medium-poster.png');
 await renderer.act(async()=>tree.unmount());
});

test('PB1 final real Artisan Copilot answers before navigation and consumes execution/cancellation',async()=>{
 const copilot=await import('../lib/artisanCopilot');
 const now=new Date();now.setHours(11,30,0,0);
 const jobs=[{id:'job',scheduled_at:now.toISOString(),status:'scheduled',client_id:'client',title:'Intervention'}];
 const clients=[{id:'client',full_name:'PB1 Client Test'}];
 const opened:any[]=[];let pending:Promise<any>=Promise.resolve();
 const action={busy:false,message:'',setMessage:()=>{},rafi:{mode:'idle'},run:(fn:any)=>{pending=Promise.resolve().then(fn);return pending;}};
 const editorial:any={art:{},useArtisanAction:()=>action};
 for(const name of ['ArtisanPage','ArtisanSection','ArtisanCue','ArtisanMessage','ArtisanField','ArtisanModuleStatus'])editorial[name]=component(name);
 const q={data:{profile:{city:'Fès'},jobs,offers:[],quotes:[],ledger:[],mission:null},authority:{status:'ready'},modules:{jobs:{status:'ready'},quotes:{status:'ready'},ledger:{status:'ready'},mission:{status:'ready'},offers:{status:'ready'},profile:{status:'ready'}},retry:async()=>{},reload:async()=>{}};
 const {default:Screen}=load('app/artisan-workspace/rafi.tsx',{
  'react-native':{View:'View'},'expo-router':{router:{push:(x:any)=>opened.push(x)}},'@/lib/artisanCopilot':copilot,
  '@/lib/artisanOS':{loadBusinessClients:async()=>clients,loadBusinessQuotes:async()=>[],loadBusinessJobs:async()=>jobs},
  '@/lib/useArtisanHome':{useArtisanHome:()=>q},'@/lib/rafiGateway':{transcribeRafiVoice:async()=>"Qu’est-ce que j’ai aujourd’hui ?"},
  '@/lib/artisanExperience':{businessStatus:()=>'',when:()=>'',artisanError:()=>''},'@/components/ArtisanEditorial':editorial,
  '@/components/RafiInputRail':{RafiInputRail:component('rail')},'@/ui/RafiOrb':{RafiOrb:component('orb')},
  '@/ui/FixeoText':{FixeoText:component('text')},'@/ui/FixeoAction':{FixeoAction:component('action')},
 });
 let tree:any;await renderer.act(async()=>{tree=renderer.create(React.createElement(Screen))});
 const voice=async()=>{await renderer.act(async()=>{tree.root.findByType('rail').props.onVoiceReady('fixture://voice');await pending;});};
 await voice();assert.equal(opened.length,0);
 const actions=()=>tree.root.findAllByType('action');
 assert.ok(JSON.stringify(tree.toJSON()).includes('PB1 Client Test'));
 assert.ok(!actions().some((x:any)=>x.props.label==='Comprendre ma commande'));
 const open=actions().find((x:any)=>x.props.label==='Ouvrir mon agenda').props.onPress;
 await renderer.act(async()=>{open();open();});assert.equal(opened.length,1);
 assert.ok(!tree.root.findAllByType('ArtisanSection').some((x:any)=>['PROPOSITION RAFI','RÉPONSE RAFI','VOTRE NOTE · À CONFIRMER'].includes(x.props.label)));
 await voice();await renderer.act(async()=>actions().find((x:any)=>x.props.label==='Annuler la proposition').props.onPress());
 assert.equal(tree.root.findAllByType('ArtisanField').length,0);assert.ok(!actions().some((x:any)=>x.props.label==='Comprendre ma commande'));assert.equal(opened.length,1);
 await renderer.act(async()=>tree.unmount());
});
