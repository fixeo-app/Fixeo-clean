import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { RafiCoreMaterial } from './RafiCoreMaterial';
import { rafiVisualTokens as material, rafiMotionTokens } from './tokens';
import { useReducedMotion } from './useReducedMotion';
import { useRafiActivity } from './useRafiActivity';
import { useRafiViewport } from './RafiScrollView';
import { RafiSignalContext } from './RafiSignal';
import { motionEasing } from './motionEasing';
import { getRafiOrbAccessibilityLabel, getRafiOrbMotion, type RafiOrbMode } from './rafiOrbMotion';
import { createRafiSuccessLatch, getRafiGeometry, type RafiSettleState } from './rafiPresence';

type Props = {
  mode?: RafiOrbMode; size?: number; eventKey?: string; settleMode?: RafiSettleState;
  active?: boolean; subtle?: boolean;
  /** @internal Static material comparison / fallback verification only. */
  materialMode?: 'master' | 'procedural';
};

export const RafiOrb = memo(function RafiOrb({ mode: explicitMode, size = 92, eventKey: explicitKey,
  settleMode = 'idle', active = true, subtle = false, materialMode = 'master' }: Props) {
  const signal = useContext(RafiSignalContext);
  const mode = explicitMode ?? signal?.mode ?? 'idle', eventKey = explicitKey ?? signal?.eventKey ?? 'entry';
  const { size: diameter, compact, frame, halo } = getRafiGeometry(size);
  const hero = diameter >= 96, finish = hero ? material.finish.hero : material.finish.medium;
  const [coreFailed, setCoreFailed] = useState(false), [motionFailed, setMotionFailed] = useState(false);
  const onCoreError = useCallback(() => setCoreFailed(true), []);
  const useMaster = !compact && materialMode === 'master' && !coreFailed;
  const haloFinish = useMaster ? (hero ? material.masterHalo.hero : material.masterHalo.medium) : finish;
  const reduceMotion = useReducedMotion();
  const focused = useRafiActivity(active);
  const root = useRef<View | null>(null);
  const viewport = useRafiViewport(root, focused);
  const running = focused && viewport.visible && !motionFailed;
  const phase = useRef(new Animated.Value(0)).current, touch = useRef(new Animated.Value(1)).current;
  const latch = useRef(createRafiSuccessLatch()).current;
  const [settledEvent, setSettledEvent] = useState<string | null>(null);
  const pendingSuccess = mode === 'success' && settledEvent !== eventKey;
  const renderedMode = mode === 'success' && !pendingSuccess ? settleMode : mode;
  const profile = useMemo(() => getRafiOrbMotion(renderedMode, diameter, reduceMotion, subtle), [renderedMode, diameter, reduceMotion, subtle]);

  useEffect(() => {
    phase.stopAnimation(); phase.setValue(0);
    if (mode !== 'success') { latch.enter(mode, eventKey, running); setSettledEvent(null); }
    let animation: Animated.CompositeAnimation | undefined;
    const timing = (toValue: number, duration: number, easing = motionEasing.breathe) => Animated.timing(phase, {
      toValue, duration, easing, useNativeDriver: true, isInteraction: false,
    });
    try {
      if (pendingSuccess) {
        if (!viewport.measured) return;
        if (!latch.enter(mode, eventKey, running)) { setSettledEvent(eventKey); return; }
        animation = Animated.sequence([timing(1, rafiMotionTokens.completion.enter, motionEasing.enter), timing(0, rafiMotionTokens.completion.exit)]);
        animation.start(({ finished }) => { if (finished) setSettledEvent(eventKey); });
      } else if (running) {
        animation = Animated.loop(Animated.sequence([timing(1, profile.breathDuration), timing(0, profile.breathDuration)]));
        animation.start();
      }
    } catch { phase.setValue(0); setMotionFailed(true); }
    return () => { animation?.stop(); phase.stopAnimation(); phase.setValue(0); };
  }, [phase, mode, eventKey, running, latch, pendingSuccess, profile.breathDuration, viewport.measured]);

  useEffect(() => { if (!running) { touch.stopAnimation(); touch.setValue(1); } return () => touch.stopAnimation(); }, [running, touch]);
  function respond(pressed: boolean) {
    if (!running || reduceMotion) return;
    try { touch.stopAnimation(); Animated.timing(touch, { toValue: pressed ? 0.985 : 1,
      duration: pressed ? 90 : 240, easing: motionEasing.standard, useNativeDriver: true, isInteraction: false }).start(); }
    catch { touch.setValue(1); setMotionFailed(true); }
  }
  const animated = useMemo(() => {
    const interpolate = (pair: [number, number]) => phase.interpolate({ inputRange: [0, 1], outputRange: pair });
    return {
      core: { transform: [{ scale: interpolate(profile.coreScale) }, { translateY: interpolate([0, diameter * profile.lift]) }] },
      halo: { opacity: interpolate(profile.haloOpacity), transform: [{ scale: interpolate(profile.haloScale) }] },
      signature: { opacity: interpolate([1, reduceMotion ? 0.99 : 0.96]), transform: [{ scale: interpolate(profile.signatureScale) }] },
      reflection: { opacity: interpolate([0, profile.reflection]), transform: [{ translateX: interpolate([0, reduceMotion ? 0 : diameter * 0.045]) }] },
    };
  }, [phase, profile, diameter, reduceMotion]);
  const arcWidth = diameter * (compact ? 0.33 : finish.arcWidth), arcHeight = diameter * (compact ? 0.19 : finish.arcHeight);
  const arcStroke = Math.max(1.3, diameter * (compact ? 0.016 : finish.arcStroke));

  return <View ref={root} collapsable={false} onLayout={viewport.onLayout} testID="rafi-orb" accessible accessibilityRole="image"
    accessibilityLabel={getRafiOrbAccessibilityLabel(renderedMode)}
    onTouchStart={() => respond(true)} onTouchEnd={() => respond(false)} onTouchCancel={() => respond(false)}
    style={[styles.frame, { width: frame, height: frame, borderRadius: frame / 2, backgroundColor: compact ? material.core : material.transparent }]}>
    <Animated.View testID="rafi-touch" style={[styles.frame, { width: frame, height: frame, transform: [{ scale: touch }] }]}>
      <Animated.View testID="rafi-halo" pointerEvents="none" style={[styles.center, { width: halo, height: halo, borderRadius: halo / 2, backgroundColor: compact ? material.haloOuter : haloFinish.haloOuter }, animated.halo]}>
        <View style={[styles.center, { width: diameter * 1.16, height: diameter * 1.16, borderRadius: diameter, backgroundColor: compact ? material.haloMiddle : haloFinish.haloMiddle }]} />
        <View style={[styles.center, { width: diameter * 1.08, height: diameter * 1.08, borderRadius: diameter, backgroundColor: compact ? material.haloInner : haloFinish.haloInner }]} />
      </Animated.View>
      <Animated.View testID="rafi-core" pointerEvents="none" style={[styles.core, { width: diameter, height: diameter, borderRadius: diameter / 2 }, animated.core]}>
        <RafiCoreMaterial diameter={diameter} compact={compact} master={useMaster} onError={onCoreError}>
          {!compact && <Animated.View pointerEvents="none" testID="rafi-reflection" style={[styles.reflection, { width: diameter * 0.72, height: diameter * 0.3, top: diameter * 0.07, left: diameter * 0.06 }, animated.reflection]}>
            <LinearGradient colors={[material.highlight, material.highlightClear]} start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: diameter }]} />
          </Animated.View>}
          <Animated.View style={[styles.signature, { width: arcWidth, height: arcHeight }, animated.signature]}>
            {!compact && <View style={[styles.arc, { width: arcWidth * 1.10, height: arcHeight * 1.08, borderRadius: arcWidth,
              borderBottomWidth: arcStroke * 2.1, borderBottomColor: material.finish.signatureGlow }]} />}
            <View testID="rafi-signature" style={[styles.arc, { width: arcWidth, height: arcHeight, borderRadius: arcWidth,
              borderBottomWidth: arcStroke, borderBottomColor: compact ? material.signature : material.finish.signature }]} />
          </Animated.View>
        </RafiCoreMaterial>
      </Animated.View>
    </Animated.View>
  </View>;
});
const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  core: { overflow: 'hidden' }, reflection: { position: 'absolute' },
  signature: { alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-12deg' }] },
  arc: { position: 'absolute', transform: [{ rotate: '-12deg' }] },
});
