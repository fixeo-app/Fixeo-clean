import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { semanticColors, spacing } from './tokens';
import { getScreenMetrics } from './screenMetrics';

type Props = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  floatingHeight?: number;
  keyboardOverlap?: number;
}>;

export function FixeoScreen({ children, style, padded = true, floatingHeight = 0, keyboardOverlap = 0 }: Props) {
  const insets = useSafeAreaInsets();
  const metrics = getScreenMetrics(insets, { padded, floatingHeight, keyboardOverlap });

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: metrics.paddingTop,
          paddingBottom: metrics.paddingBottom,
          // Preserve existing paddingHorizontal overrides on portrait screens.
          paddingHorizontal: padded ? spacing.lg : 0,
          ...((insets.left > 0 || insets.right > 0) && {
            paddingLeft: metrics.paddingLeft,
            paddingRight: metrics.paddingRight,
          }),
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
    backgroundColor: semanticColors.background.canvas,
  },
});
