import type { PropsWithChildren } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { FixeoSurface } from './FixeoSurface';
import { semanticColors, spacing } from './tokens';

type Props = PropsWithChildren<{
  tone?: 'light' | 'dark' | 'muted';
  style?: StyleProp<ViewStyle>;
}>;

export function FixeoCard({ children, tone = 'light', style }: Props) {
  return (
    <FixeoSurface
      tone={tone === 'dark' ? 'focus' : tone === 'muted' ? 'subtle' : 'surface'}
      rounding="card"
      border="subtle"
      style={[
        styles.base,
        tone === 'dark' && styles.dark,
        tone === 'muted' && styles.muted,
        style,
      ]}
    >
      {children}
    </FixeoSurface>
  );
}

const styles = StyleSheet.create({
  base: {
    padding: spacing.lg,
  },
  dark: {
    borderColor: semanticColors.background.focus,
  },
  muted: {
    borderColor: semanticColors.background.subtle,
  },
});
