import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from './tokens';

type Props = PropsWithChildren<{
  tone?: 'light' | 'dark' | 'muted';
  style?: ViewStyle;
}>;

export function FixeoCard({ children, tone = 'light', style }: Props) {
  return (
    <View
      style={[
        styles.base,
        tone === 'dark' && styles.dark,
        tone === 'muted' && styles.muted,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dark: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  muted: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.surfaceMuted,
  },
});
