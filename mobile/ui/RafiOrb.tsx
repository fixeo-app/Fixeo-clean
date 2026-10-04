import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { rafiVisualTokens as material, rafiMotionTokens } from './tokens';
import { useReducedMotion } from './useReducedMotion';
import { useRafiActivity } from './useRafiActivity';
import { motionEasing } from './motionEasing';
import { getRafiOrbAccessibilityLabel, getRafiOrbMotion, type RafiOrbMode } from './rafiOrbMotion';
import { createRafiSuccessLatch, getRafiGeometry, type RafiSettleState } from './rafiPresence';

type Props = {
  mode?: RafiOrbMode; size?: number;
  /** Stable identity of a real completion. Polling the same event must not replay it. */
  eventKey?: string; settleMode?: RafiSettleState;
  /** Visibility owned by a parent when known (e.g. a virtualized scene). */
  active?: boolean;
};

export const RafiOrb = memo(function RafiOrb({ mode = 'idle', size = 92, eventKey = 'entry', settleMode = 'idle', active = true }: Props) {
  const geometry = getRafiGeometry(size);
  const { size: diameter, compact, frame, halo } = geometry;
  const reduceMotion = useReducedMotion();
  const running = useRafiActivity(active && !compact && !reduceMotion);
  const phase = useRef(new Animated.Value(0)).current;
  const latch = useRef(createRafiSuccessLatch()).current;
  const [settledEvent, setSettledEvent] = useState<string | null>(null);
  const renderedMode = mode === 'success' && (settledEvent === eventKey || reduceMotion || compact) ? settleMode : mode;
  const profile = getRafiOrbMotion(renderedMode);

  useEffect(() => {
    phase.stopAnimation(); phase.setValue(0);
    const playSuccess = latch.enter(mode, eventKey, running);
    if (mode === 'success' && !playSuccess) {
      setSettledEvent(eventKey);
      return;
    }
    if (mode !== 'success') setSettledEvent(null);
    if (!running) return;
    const timing = (toValue: number, duration: number, easing = motionEasing.breathe) => Animated.timing(phase, {
      toValue, duration, easing, useNativeDriver: true, isInteraction: false,
    });
    let animation: Animated.CompositeAnimation;
    if (playSuccess) {
      setSettledEvent(null);
      animation = Animated.sequence([
        timing(1, rafiMotionTokens.completion.enter, motionEasing.enter),
        timing(0, rafiMotionTokens.completion.exit),
      ]);
      animation.start(({ finished }) => { if (finished) setSettledEvent(eventKey); });
    } else {
      const motion = getRafiOrbMotion(mode);
      animation = mode === 'matching'
        ? Animated.loop(timing(1, motion.orbitDuration, motionEasing.linear))
        : Animated.loop(Animated.sequence([timing(1, motion.breathDuration), timing(0, motion.breathDuration)]));
      animation.start();
    }
    return () => { animation.stop(); phase.stopAnimation(); phase.setValue(0); };
  }, [phase, mode, eventKey, running, latch]);

  const animated = useMemo(() => {
    // Matching shares its one orbital clock with the breath envelope. No second loop.
    const inputRange = renderedMode === 'matching' ? [0, 0.5, 1] : [0, 1];
    const range = (pair: [number, number]) => renderedMode === 'matching' ? [pair[0], pair[1], pair[0]] : pair;
    const interpolate = (pair: [number, number]) => phase.interpolate({ inputRange, outputRange: range(pair) });
    return {
      core: { transform: [{ scale: interpolate(profile.coreScale) }] },
      halo: { opacity: interpolate(profile.haloOpacity), transform: [{ scale: interpolate(profile.haloScale) }] },
      signature: { transform: [{ scale: interpolate(profile.signatureScale) }, { translateY: diameter * profile.signatureLift }] },
      orbit: { opacity: profile.orbitOpacity, transform: [{ rotate: phase.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] },
    };
  }, [phase, profile, renderedMode, diameter]);
  const arcWidth = diameter * 0.33;
  const arcHeight = diameter * 0.19;
  const arcStroke = Math.max(1.3, diameter * 0.016);

  return <View testID="rafi-orb" accessible accessibilityRole="image"
    accessibilityLabel={getRafiOrbAccessibilityLabel(mode)}
    style={[styles.frame, { width: frame, height: frame, borderRadius: frame / 2, backgroundColor: compact ? material.core : material.transparent }]}>
    <Animated.View testID="rafi-halo" pointerEvents="none" style={[styles.center, { width: halo, height: halo, borderRadius: halo / 2, backgroundColor: material.haloOuter }, animated.halo]}>
      <View style={[styles.center, { width: diameter * 1.16, height: diameter * 1.16, borderRadius: diameter, backgroundColor: material.haloMiddle }]} />
      <View style={[styles.center, { width: diameter * 1.08, height: diameter * 1.08, borderRadius: diameter, backgroundColor: material.haloInner }]} />
    </Animated.View>
    {!compact && renderedMode === 'matching' && <Animated.View pointerEvents="none" testID="rafi-orbit"
      style={[styles.orbit, { width: diameter * 1.18, height: diameter * 1.18, borderRadius: diameter, borderColor: material.orbit }, animated.orbit]}>
      <View style={[styles.orbitLight, { left: diameter * 0.59 - 1.5, backgroundColor: material.champagne }]} />
    </Animated.View>}
    <Animated.View testID="rafi-core" pointerEvents="none" style={[styles.core, { width: diameter, height: diameter, borderRadius: diameter / 2 }, animated.core]}>
      <LinearGradient colors={[material.rim, material.deepRim, material.core, material.champagne]} locations={[0, 0.28, 0.82, 1]}
        start={{ x: 0.12, y: 0 }} end={{ x: 0.85, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.inset, { borderRadius: diameter / 2, backgroundColor: material.core }]}>
        {!compact && <LinearGradient colors={[material.graphiteLight, material.graphite, material.core, material.core]}
          locations={[0, 0.21, 0.57, 1]} start={{ x: 0.14, y: 0 }} end={{ x: 0.73, y: 0.88 }} style={StyleSheet.absoluteFill} />}
        {!compact && <LinearGradient colors={[material.highlight, material.highlightClear]} start={{ x: 0.2, y: 0 }} end={{ x: 0.45, y: 1 }}
          style={[styles.reflection, { top: -diameter * 0.22, left: -diameter * 0.14, width: diameter * 1.04, height: diameter * 0.67,
            borderRadius: diameter }]} />}
        <Animated.View style={[styles.signature, { width: arcWidth, height: arcHeight }, animated.signature]}>
          {!compact && <View style={[styles.arc, { width: arcWidth * 1.12, height: arcHeight * 1.15, borderRadius: arcWidth,
            borderBottomWidth: arcStroke * 4, borderBottomColor: material.signatureGlow }]} />}
          <View testID="rafi-signature" style={[styles.arc, { width: arcWidth, height: arcHeight, borderRadius: arcWidth,
            borderBottomWidth: arcStroke, borderBottomColor: material.signature }]} />
        </Animated.View>
      </View>
    </Animated.View>
  </View>;
});
const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  core: { overflow: 'hidden' },
  inset: { position: 'absolute', top: 0.8, left: 0.8, bottom: 0.8, right: 0.8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  reflection: { position: 'absolute', transform: [{ rotate: '-24deg' }] },
  signature: { alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-12deg' }] },
  arc: { position: 'absolute', transform: [{ rotate: '-12deg' }] },
  orbit: { position: 'absolute', borderWidth: 0.5 },
  orbitLight: { position: 'absolute', top: -1.5, width: 3, height: 3, borderRadius: 2 },
});
