import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { RafiOrb } from '@/ui/RafiOrb';
import type { RafiOrbMode } from '@/ui/rafiOrbMotion';
import { colors, radius, spacing, type } from '@/ui/tokens';

type Props = {
  eyebrow?: string;
  title: string;
  subtitle: string;
  status?: string;
  mode?: RafiOrbMode;
  compact?: boolean;
};

export function EntryStage({
  eyebrow = 'RAFI · FIXEO',
  title,
  subtitle,
  status,
  mode = 'idle',
  compact = false,
}: Props) {
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    entrance.setValue(0);
    Animated.timing(entrance, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  return (
    <Animated.View
      style={[
        styles.root,
        compact && styles.compact,
        {
          opacity: entrance,
          transform: [{
            translateY: entrance.interpolate({
              inputRange: [0, 1],
              outputRange: [10, 0],
            }),
          }],
        },
      ]}
    >
      <Text style={styles.brand}>FIXEO</Text>
      <RafiOrb size={compact ? 76 : 96} mode={mode} />
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      {!!status && (
        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>{status}</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  compact: {
    gap: spacing.xs,
  },
  brand: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 4.4,
    color: colors.text,
  },
  eyebrow: {
    marginTop: spacing.xs,
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.8,
    color: colors.textMuted,
    textAlign: 'center',
  },
  title: {
    maxWidth: 340,
    fontSize: 38,
    lineHeight: 42,
    fontWeight: '900',
    letterSpacing: -1.3,
    color: colors.text,
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: 32,
    lineHeight: 36,
  },
  subtitle: {
    maxWidth: 335,
    fontSize: type.body,
    lineHeight: 23,
    color: colors.textMuted,
    textAlign: 'center',
  },
  statusPill: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.ink,
  },
  statusText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
});
