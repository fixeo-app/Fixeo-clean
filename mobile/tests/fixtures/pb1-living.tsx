// Real renderer and recording controls with a test-only hardware boundary.
import { createElement, useMemo, useState } from 'react';
import { Animated, AppState, View } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { RafiOrb } from '../../ui/RafiOrb';
import { RafiScrollView } from '../../ui/RafiScrollView';
import { RafiInputRail } from '../../components/RafiInputRail';
import { FixeoText } from '../../ui/FixeoText';
import { RAFI_LABELS, type RafiPresenceState } from '../../ui/rafiPresence';
import { semanticColors } from '../../ui/tokens';
const { createRoot } = require('react-dom/client');
const params = new URLSearchParams(location.search);
const stats={loopStarts:0,timingStarts:0,timingStops:0,activitySubscriptions:0,activityStops:0};
const loop=Animated.loop,timing=Animated.timing;
Animated.loop=(...args)=>{const a=loop(...args),start=a.start.bind(a);a.start=(...input)=>{stats.loopStarts++;start(...input);};return a;};
(Animated as {timing:typeof Animated.timing}).timing=(...args:Parameters<typeof Animated.timing>)=>{if(params.has('animationError'))throw Error('SYNTHETIC_ANIMATION_FAILURE');const a=timing(...args),start=a.start.bind(a),stop=a.stop.bind(a);a.start=(...input)=>{stats.timingStarts++;start(...input);};a.stop=()=>{stats.timingStops++;stop();};return a;};
const activityListeners=new Set<(state:string)=>void>();
Object.defineProperty(AppState,'currentState',{value:'active',configurable:true});
AppState.addEventListener=((_type:string,fn:(state:string)=>void)=>{stats.activitySubscriptions++;activityListeners.add(fn);return {remove:()=>{stats.activityStops++;activityListeners.delete(fn);}};}) as typeof AppState.addEventListener;
function Fixture(){
 const [mode,setMode]=useState<RafiPresenceState>('idle'),[eventKey,setEventKey]=useState('first'),[mounted,setMounted]=useState(true);
 const navigation=useMemo(()=>{let focused=true;const listeners={focus:new Set<()=>void>(),blur:new Set<()=>void>()};return {isFocused:()=>focused,addListener:(type:'focus'|'blur',fn:()=>void)=>{listeners[type].add(fn);return()=>{listeners[type].delete(fn);};},focus:(v:boolean)=>{focused=v;listeners[v?'focus':'blur'].forEach(fn=>fn());},listeners};},[]);
 (globalThis as any).__w3={stats,setMode,setEventKey,setMounted,focus:navigation.focus,navigationListeners:navigation.listeners,background:(active:boolean)=>activityListeners.forEach(fn=>fn(active?'active':'background'))};
 return <NavigationContext.Provider value={navigation as any}><View style={{height:'100%',backgroundColor:semanticColors.background.canvas}}>
  <RafiScrollView testID="living-scroll" style={{flex:1}}><View style={{padding:24,gap:16,alignItems:'center'}}>
   <FixeoText variant="eyebrow">FIXEO · RAFI</FixeoText>
   {mounted&&<RafiOrb mode={mode} eventKey={eventKey} size={params.has('compact')?44:156} materialMode={params.has('procedural')?'procedural':'master'} />}
   <FixeoText>{RAFI_LABELS[mode]}</FixeoText>
   {params.has('microphone')&&<RafiInputRail onListeningChange={v=>setMode(v?'listening':'idle')} onVoiceReady={()=>setMode('thinking')} onPhotoReady={()=>{}} />}
   <View style={{height:1200}} />
  </View></RafiScrollView>
 </View></NavigationContext.Provider>;
}
createRoot(document.getElementById('root')).render(createElement(Fixture));
