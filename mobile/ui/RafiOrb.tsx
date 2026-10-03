import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
} from 'react-native';
import { colors } from './tokens';
import {
  getRafiOrbAccessibilityLabel,
  getRafiOrbMotion,
  type RafiOrbMode,
} from './rafiOrbMotion';

type Props = {
  mode?: RafiOrbMode;
  size?: number;
};

export function RafiOrb({ mode = 'idle', size = 92 }: Props) {
  const breath = useRef(new Animated.Value(0)).current;
  const orbit = useRef(new Animated.Value(0)).current;
  const success = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const motion = getRafiOrbMotion(mode);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted) setReduceMotion(Boolean(value));
    });
    const listener = AccessibilityInfo.addEventListener?.('reduceMotionChanged', value => {
      setReduceMotion(Boolean(value));
    });
    return () => {
      mounted = false;
      listener?.remove?.();
    };
  }, []);

  useEffect(() => {
    breath.stopAnimation();
    orbit.stopAnimation();
    success.stopAnimation();
    breath.setValue(0);
    orbit.setValue(0);
    success.setValue(0);

    if (reduceMotion) return;

    const breathAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: motion.breathDuration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: motion.breathDuration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    const orbitAnimation = Animated.loop(
      Animated.timing(orbit, {
        toValue: 1,
        duration: motion.orbitDuration,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    breathAnimation.start();
    orbitAnimation.start();

    let successAnimation: Animated.CompositeAnimation | null = null;
    if (mode === 'success') {
      successAnimation = Animated.sequence([
        Animated.delay(70),
        Animated.timing(success, {
          toValue: 1,
          duration: 360,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(success, {
          toValue: 0,
          duration: 620,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]);
      successAnimation.start();
    }

    return () => {
      breathAnimation.stop();
      orbitAnimation.stop();
      successAnimation?.stop();
    };
  }, [breath, mode, motion.breathDuration, motion.orbitDuration, orbit, reduceMotion, success]);

  const coreStyle = useMemo(
    () => ({
      transform: [
        {
          scale: breath.interpolate({
            inputRange: [0, 1],
            outputRange: motion.coreScale,
          }),
        },
        {
          scale: success.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.08],
          }),
        },
      ],
    }),
    [breath, motion.coreScale, success],
  );

  const haloStyle = useMemo(
    () => ({
      opacity: breath.interpolate({
        inputRange: [0, 1],
        outputRange: motion.haloOpacity,
      }),
      transform: [
        {
          scale: breath.interpolate({
            inputRange: [0, 1],
            outputRange: motion.haloScale,
          }),
        },
        {
          scale: success.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.12],
          }),
        },
      ],
    }),
    [breath, motion.haloOpacity, motion.haloScale, success],
  );

  const orbitStyle = useMemo(
    () => ({
      opacity: motion.orbitOpacity,
      transform: [
        {
          rotate: orbit.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '360deg'],
          }),
        },
      ],
    }),
    [motion.orbitOpacity, orbit],
  );

  const echoStyle = useMemo(
    () => ({
      opacity: success.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.36],
      }),
      transform: [
        {
          scale: success.interpolate({
            inputRange: [0, 1],
            outputRange: [0.84, 1.34],
          }),
        },
      ],
    }),
    [success],
  );

  const frameSize = size * 1.48;
  const haloSize = size * 1.28;
  const orbitSize = size * 1.18;
  const innerRingSize = size * 0.76;
  const satellite = Math.max(5, size * 0.075);

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={getRafiOrbAccessibilityLabel(mode)}
      style={[styles.frame, {
        width: frameSize,
        height: frameSize,
        borderRadius: frameSize / 2,
      }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.echo,
          {
            width: haloSize,
            height: haloSize,
            borderRadius: haloSize / 2,
          },
          echoStyle,
        ]}
      />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          {
            width: haloSize,
            height: haloSize,
            borderRadius: haloSize / 2,
          },
          haloStyle,
        ]}
      />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.orbit,
          {
            width: orbitSize,
            height: orbitSize,
            borderRadius: orbitSize / 2,
            borderColor: `rgba(11,11,12,${motion.ringOpacity})`,
          },
          orbitStyle,
        ]}
      >
        <View
          style={[
            styles.satellite,
            {
              width: satellite,
              height: satellite,
              borderRadius: satellite / 2,
              top: -satellite / 2,
              left: orbitSize / 2 - satellite / 2,
            },
          ]}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.core,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
          coreStyle,
        ]}
      >
        <View
          pointerEvents="none"
          style={[
            styles.innerRing,
            {
              width: innerRingSize,
              height: innerRingSize,
              borderRadius: innerRingSize / 2,
            },
          ]}
        />
        <View
          pointerEvents="none"
          style={[
            styles.glint,
            {
              width: size * 0.22,
              height: size * 0.22,
              borderRadius: size * 0.11,
              top: size * 0.17,
              left: size * 0.18,
            },
          ]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    backgroundColor: 'rgba(11,11,12,0.09)',
  },
  echo: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(11,11,12,0.20)',
  },
  orbit: {
    position: 'absolute',
    borderWidth: 1,
  },
  satellite: {
    position: 'absolute',
    backgroundColor: colors.ink,
  },
  core: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.ink,
  },
  innerRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  glint: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.055)',
  },
});
