import { memo, useCallback, useContext, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { RafiCoreMaterial } from './RafiCoreMaterial';
import { RafiLivingMaterial } from './RafiLivingMaterial';
import { createMaterialMotion } from './rafiMaterialMotion';
import { useReducedMotion } from './useReducedMotion';
import { useRafiActivity } from './useRafiActivity';
import { useRafiViewport } from './RafiScrollView';
import { RafiSignalContext } from './RafiSignal';
import { getRafiOrbAccessibilityLabel, type RafiOrbMode } from './rafiOrbMotion';
import { getRafiGeometry, type RafiSettleState } from './rafiPresence';

type Props = { mode?: RafiOrbMode; size?: number; eventKey?: string; settleMode?: RafiSettleState;
  active?: boolean; subtle?: boolean; materialMode?: 'master' | 'procedural' };
export const RafiOrb = memo(function RafiOrb({ mode: explicitMode, size = 92, active = true, subtle = false }: Props) {
  const signal = useContext(RafiSignalContext);
  const mode = explicitMode ?? signal?.mode ?? 'idle';
  const { size: diameter, compact, frame } = getRafiGeometry(size);
  const reduced = useReducedMotion(), focused = useRafiActivity(active);
  const root = useRef<View | null>(null), controller = useRef<ReturnType<typeof createMaterialMotion> | null>(null);
  const viewport = useRafiViewport(root, focused);
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);
  return <View ref={root} collapsable={false} onLayout={viewport.onLayout} testID="rafi-orb"
    accessible accessibilityRole="image" accessibilityLabel={getRafiOrbAccessibilityLabel(mode)}
    onTouchStart={event => {
      const { locationX, locationY } = event.nativeEvent;
      controller.current?.touch((locationX-frame/2)/(diameter/2), -(locationY-frame/2)/(diameter/2));
    }}
    style={[styles.frame, { width: frame, height: frame }]}>
    {failed ? <View testID="rafi-static-fallback" style={{ width: diameter, height: diameter, borderRadius: diameter/2, overflow: 'hidden' }}>
      <RafiCoreMaterial diameter={diameter} compact={compact} master={!compact} onError={() => {}}>{null}</RafiCoreMaterial>
    </View> : <RafiLivingMaterial diameter={diameter} compact={compact} active={focused && viewport.visible}
      reduced={reduced} mode={mode} subtle={subtle} controller={controller} onError={onError} />}
  </View>;
});
const styles = StyleSheet.create({ frame: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 } });
