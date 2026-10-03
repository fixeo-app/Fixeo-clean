import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from './tokens';

type Props = PropsWithChildren<{
  style?: ViewStyle;
  padded?: boolean;
}>;

export function FixeoScreen({ children, style, padded = true }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: Math.max(insets.top, spacing.md),
          paddingBottom: Math.max(insets.bottom, spacing.md),
          paddingHorizontal: padded ? spacing.lg : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
  },
});
