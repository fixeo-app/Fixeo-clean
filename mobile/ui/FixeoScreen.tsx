import { useEffect, useState, type PropsWithChildren, type ReactNode } from 'react';
import { Keyboard, Platform, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { semanticColors, spacing, space, layout } from './tokens';
import { getScreenMetrics } from './screenMetrics';
import { dockHasRoom, dockMinimumHeight, isDockVisible, type ContextDockSpec } from './shellContract';
import { FixeoContextDock } from './FixeoContextDock';

type Props = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  floatingHeight?: number;
  keyboardOverlap?: number;
  /** Shell lives outside the scroller; its safe area is owned here. */
  header?: ReactNode;
  contextDock?: ContextDockSpec;
}>;

export function FixeoScreen(props: Props) {
  // Legacy screens keep their original hierarchy and zero keyboard listeners.
  return props.contextDock ? <DockScreen {...props} contextDock={props.contextDock} /> : <ScreenFrame {...props} />;
}

function DockScreen({ contextDock, ...props }: Props & { contextDock: ContextDockSpec }) {
  const { fontScale, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(props.header ? 76 : 0);
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  const initialHeight = dockMinimumHeight(fontScale);
  const [measurement, setMeasurement] = useState({ height: initialHeight, fontScale });
  const dockHeight = Math.max(initialHeight, measurement.fontScale === fontScale ? measurement.height : initialHeight);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  // At extreme text/landscape sizes keep room for content; the Drawer remains available.
  const reservedBottom = getScreenMetrics(insets, { floatingHeight: dockHeight }).paddingBottom;
  const fits = dockHasRoom(height, Math.max(insets.top, layout.screen.edge), headerHeight, reservedBottom);
  const visible = isDockVisible({ hidden: contextDock.hidden || !fits, keyboardVisible, itemCount: contextDock.items.length });
  return <ScreenFrame {...props} onHeaderLayout={event => setHeaderHeight(Math.ceil(event.nativeEvent.layout.height))} floatingHeight={visible ? Math.max(props.floatingHeight ?? 0, dockHeight) : props.floatingHeight}
    floating={visible ? <FixeoContextDock {...contextDock} onLayout={event => {
      const measured = Math.ceil(event.nativeEvent.layout.height);
      setMeasurement(previous => previous.height === measured && previous.fontScale === fontScale ? previous : { height: measured, fontScale });
    }} /> : undefined} />;
}

function ScreenFrame({ children, style, padded = true, floatingHeight = 0, keyboardOverlap = 0, header, floating, onHeaderLayout }: Props & { floating?: ReactNode; onHeaderLayout?: (event: LayoutChangeEvent) => void }) {
  const insets = useSafeAreaInsets();
  const metrics = getScreenMetrics(insets, { padded, floatingHeight, keyboardOverlap });
  return <View style={[
    styles.root,
    {
      paddingTop: metrics.paddingTop,
      paddingBottom: metrics.paddingBottom,
      paddingHorizontal: padded ? spacing.lg : 0,
      ...((insets.left > 0 || insets.right > 0) && { paddingLeft: metrics.paddingLeft, paddingRight: metrics.paddingRight }),
    }, style,
    // A screen-level style must never cancel the dock's measured reservation.
    floating ? { paddingBottom: metrics.paddingBottom } : undefined,
  ]}>
    {header && <View onLayout={onHeaderLayout} style={[styles.header, !padded && { paddingHorizontal: spacing.lg }]}>{header}</View>}
    {children}
    {floating && <View pointerEvents="box-none" style={[styles.floating, {
      left: Math.max(insets.left, space.md), right: Math.max(insets.right, space.md), bottom: metrics.floatingBottom,
    }]}>
      <View style={styles.dockWidth}>{floating}</View>
    </View>}
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semanticColors.background.canvas },
  header: { paddingBottom: space.sm },
  floating: { position: 'absolute', alignItems: 'center' },
  dockWidth: { width: '100%', maxWidth: layout.screen.maxContentWidth },
});
