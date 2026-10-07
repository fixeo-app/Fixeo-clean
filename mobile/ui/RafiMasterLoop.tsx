import { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { createMasterPlayback, rafiMasterVariant } from './rafiMasterPlayback';
const assets = {
 hero: { loop: require('../assets/rafi/master-loop-v1/rafi-hero.webp'), poster: require('../assets/rafi/master-loop-v1/rafi-hero-poster.png') },
 medium: { loop: require('../assets/rafi/master-loop-v1/rafi-medium.webp'), poster: require('../assets/rafi/master-loop-v1/rafi-medium-poster.png') },
 mini: { loop: require('../assets/rafi/master-loop-v1/rafi-mini.webp'), poster: require('../assets/rafi/master-loop-v1/rafi-mini-poster.png') },
};
export function RafiMasterLoop({ diameter, active, reduced }: { diameter: number; active: boolean; reduced: boolean }) {
 const variant=rafiMasterVariant(diameter);
 const [failed,setFailed]=useState(false), [started,setStarted]=useState(false);
 const current=useRef({active,reduced});current.current={active,reduced};
 const playback=useRef<ReturnType<typeof createMasterPlayback>|null>(null);
 const source=assets[variant], animate=started&&!reduced&&!failed;
 const attach=useCallback((image:Image|null)=>{
  playback.current?.dispose();playback.current=null;
  if(image){const driver=createMasterPlayback(()=>setFailed(true));playback.current=driver;driver.attach(image);driver.setActivity(current.current.active,current.current.reduced);}
 },[]);
 useEffect(()=>{if(active&&!reduced)setStarted(true);playback.current?.setActivity(active,reduced);},[active,reduced]);
 useEffect(()=>()=>{playback.current?.dispose();playback.current=null;},[]);
 return <Image ref={attach} testID={`rafi-master-${variant}`} source={animate?source.loop:source.poster}
  style={{width:diameter*1.5,height:diameter*1.5}} contentFit="contain" contentPosition="center"
  autoplay={false} transition={0} cachePolicy="none" useAppleWebpCodec={false}
  recyclingKey={`${variant}-${animate?'loop':'poster'}`} accessible={false} pointerEvents="none"
  onLoad={()=>{playback.current?.setActivity(current.current.active&&animate,current.current.reduced);playback.current?.loaded();}}
  onError={()=>setFailed(true)}/>;
}
