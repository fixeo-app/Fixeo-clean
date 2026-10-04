import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { FixeoSurface } from './FixeoSurface';
import { FixeoText } from './FixeoText';
import { ShellControl, ShellIcon } from './ShellControl';
import { dockBadgeLabel, isDockVisible, validateDockItems, type ContextDockSpec } from './shellContract';
import { radii, semanticColors, space } from './tokens';

export function FixeoContextDock({ universe, items, hidden, fourActionReason, onLayout }: ContextDockSpec & {
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  validateDockItems(items, fourActionReason);
  if (!isDockVisible({ hidden, itemCount: items.length })) return null;
  return <FixeoSurface rounding="floating" elevation="floating" onLayout={onLayout}
    accessibilityRole="toolbar" accessibilityLabel={`Actions rapides ${universe === 'client' ? 'Client' : 'Artisan'}`}
    style={styles.dock}>
    {items.map(item => {
      const badge = dockBadgeLabel(item.badge);
      const foreground = item.disabled ? semanticColors.text.disabled
        : item.selected ? semanticColors.text.inverse : semanticColors.text.primary;
      return <ShellControl key={item.key} accessibilityLabel={item.accessibilityLabel}
        accessibilityState={{ selected: !!item.selected, disabled: !!item.disabled }}
        accessibilityValue={badge ? { text: `${item.badge} éléments` } : undefined}
        disabled={item.disabled} onPress={item.action}
        style={[styles.action, item.selected && styles.selected]}>
        <View style={styles.symbol}>
          <ShellIcon name={item.icon} color={foreground} />
          {!!badge && <View style={styles.badge}><FixeoText variant="caption" tone="inverse">{badge}</FixeoText></View>}
        </View>
        <FixeoText variant="caption" style={[styles.label, { color: foreground }]}>{item.label}</FixeoText>
      </ShellControl>;
    })}
  </FixeoSurface>;
}
const styles = StyleSheet.create({
  dock: { flexDirection: 'row', padding: space.xxs, gap: space.xxs, alignItems: 'stretch' },
  action: { flex: 1, paddingVertical: space.xs, paddingHorizontal: space.xxs, gap: space.xxs, borderRadius: radii.control },
  selected: { backgroundColor: semanticColors.background.focus },
  symbol: { minHeight: 28, justifyContent: 'center', alignItems: 'center' },
  label: { textAlign: 'center', alignSelf: 'stretch', width: '100%' },
  badge: { position: 'absolute', left: 18, top: -space.xxs, minWidth: 20, paddingHorizontal: space.xxs,
    borderRadius: radii.pill, backgroundColor: semanticColors.background.focus, alignItems: 'center' },
});
