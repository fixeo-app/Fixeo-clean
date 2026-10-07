import { memo, useContext, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { RafiMasterLoop } from './RafiMasterLoop';
import { useReducedMotion } from './useReducedMotion';
import { useRafiActivity } from './useRafiActivity';
import { useRafiViewport } from './RafiScrollView';
import { RafiSignalContext } from './RafiSignal';
import { getRafiOrbAccessibilityLabel, type RafiOrbMode } from './rafiOrbMotion';
import { getRafiGeometry, type RafiSettleState } from './rafiPresence';
type Props={mode?:RafiOrbMode;size?:number;eventKey?:string;settleMode?:RafiSettleState;active?:boolean;subtle?:boolean;materialMode?:'master'|'procedural'};
/** Every role/state/size uses the certified source. Legacy props cannot select old material. */
export const RafiOrb=memo(function RafiOrb({mode:explicitMode,size=92,active=true}:Props){
 const signal=useContext(RafiSignalContext),mode=explicitMode??signal?.mode??'idle';
 const {size:diameter}=getRafiGeometry(size),frame=diameter*1.5;
 const reduced=useReducedMotion(),focused=useRafiActivity(active);
 const root=useRef<View|null>(null),viewport=useRafiViewport(root,focused);
 return <View ref={root} collapsable={false} onLayout={viewport.onLayout} testID="rafi-orb"
  accessible accessibilityRole="image" accessibilityLabel={getRafiOrbAccessibilityLabel(mode)}
  style={[styles.frame,{width:frame,height:frame}]}>
  <RafiMasterLoop diameter={diameter} active={focused&&viewport.visible} reduced={reduced}/>
 </View>;
});
const styles=StyleSheet.create({frame:{alignItems:'center',justifyContent:'center',flexShrink:0}});
