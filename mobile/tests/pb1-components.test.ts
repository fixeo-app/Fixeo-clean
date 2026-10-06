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
const component=(name:string)=>(props:any)=>React.createElement(name,props,props.children);

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
