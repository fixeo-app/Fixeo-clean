import { type PropsWithChildren, useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { useReducedMotion } from '@/ui/useReducedMotion';
import { resolveMotion } from '@/ui/motionContract';
import { motionEasing } from '@/ui/motionEasing';
import { motionGeometry } from '@/ui/tokens';

type Props = PropsWithChildren<{
  motionKey?: string;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  preset?: 'reveal' | 'orchestration';
}>;

export function MotionReveal({
  children,
  motionKey = 'default',
  delay = 0,
  style,
  preset = 'reveal',
}: Props) {
  const progress = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReducedMotion();
  const geometry = motionGeometry[preset];

  useEffect(() => {
    progress.stopAnimation();

    if (reduceMotion) {
      progress.setValue(1);
      return;
    }

    progress.setValue(0);
    const timing = resolveMotion(preset, reduceMotion, delay);
    const animation = Animated.timing(progress, {
      toValue: 1,
      delay: timing.delay,
      duration: timing.duration,
      easing: motionEasing[timing.easing],
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [delay, motionKey, preset, progress, reduceMotion]);

  return (
    <Animated.View
      style={[
        styles.root,
        style,
        {
          opacity: reduceMotion ? 1 : progress,
          transform: reduceMotion ? [] : [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [geometry.translateY, 0],
              }),
            },
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [geometry.scale, 1],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
});
