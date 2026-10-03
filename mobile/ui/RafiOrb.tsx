import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors } from './tokens';

type Mode = 'idle' | 'listening' | 'working' | 'success';

type Props = {
  mode?: Mode;
  size?: number;
};

export function RafiOrb({ mode = 'idle', size = 92 }: Props) {
  const phase = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    phase.stopAnimation();
    phase.setValue(0);

    if (mode === 'success') return;

    const duration = mode === 'working' ? 760 : mode === 'listening' ? 980 : 1800;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(phase, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(phase, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [mode, phase]);

  const animatedStyle = useMemo(
    () => ({
      transform: [
        {
          scale: phase.interpolate({
            inputRange: [0, 1],
            outputRange: mode === 'working' ? [0.96, 1.08] : [0.985, 1.035],
          }),
        },
      ],
      opacity: phase.interpolate({
        inputRange: [0, 1],
        outputRange: mode === 'working' ? [0.8, 1] : [0.9, 1],
      }),
    }),
    [mode, phase],
  );

  return (
    <View style={[styles.halo, { width: size * 1.36, height: size * 1.36, borderRadius: size }]}>
      <Animated.View
        accessibilityRole="image"
        accessibilityLabel={`RAFI ${mode}`}
        style={[
          styles.orb,
          { width: size, height: size, borderRadius: size / 2 },
          animatedStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  halo: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,11,12,0.045)',
  },
  orb: {
    backgroundColor: colors.ink,
  },
});
