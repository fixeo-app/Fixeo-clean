import { RafiScrollView as ScrollView } from '@/ui/RafiScrollView';
import type { ComponentProps, Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { RafiOrb } from '@/ui/RafiOrb';
import { FixeoText } from '@/ui/FixeoText';
import { ShellControl, ShellIcon } from '@/ui/ShellControl';
import { getShellDestinations, type ShellDestination, type ShellUniverse } from '@/ui/shellContract';
import { radii, semanticColors, space } from '@/ui/tokens';

type Props = {
  universe: ShellUniverse; activeKey: string; statusLabel?: string;
  orbMode: ComponentProps<typeof RafiOrb>['mode']; signingOut: boolean;
  onClose: () => void; onNavigate: (destination: ShellDestination) => void; onLogout: () => void;
  closeRef?: Ref<View>;
};
export function PremiumDrawer({ universe, activeKey, statusLabel, orbMode, signingOut, onClose, onNavigate, onLogout, closeRef }: Props) {
  const items = getShellDestinations(universe);
  return <View style={styles.root} accessibilityViewIsModal onAccessibilityEscape={onClose}>
    <View style={styles.heading}>
      <FixeoText variant="eyebrow" tone="secondary" style={styles.grow}>
        {universe === 'client' ? 'Espace Client' : 'Espace Artisan'}
      </FixeoText>
      <ShellControl ref={closeRef} accessibilityLabel="Fermer le menu FIXEO" onPress={onClose}>
        <ShellIcon name="close-outline" color={semanticColors.text.primary} />
      </ShellControl>
    </View>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
      <View style={styles.identity}>
        <View style={styles.orb} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <RafiOrb size={44} mode={orbMode} subtle />
        </View>
        <View style={styles.grow}>
          <FixeoText variant="heading" tone="primary" style={styles.brand}>FIXEO</FixeoText>
          <FixeoText variant="supporting" tone="secondary">{statusLabel || 'Votre espace FIXEO'}</FixeoText>
        </View>
      </View>
      {items.map((item, index) => {
        const selected = activeKey === item.key;
        const color = semanticColors.text.primary;
        return <View key={item.key}>
          {item.section !== items[index - 1]?.section && <FixeoText variant="eyebrow" tone="secondary"
            style={styles.section}>{item.section}</FixeoText>}
          <ShellControl accessibilityLabel={item.label} accessibilityHint={item.meta}
            accessibilityState={{ selected, disabled: signingOut }} disabled={signingOut}
            onPress={() => onNavigate(item)} style={[styles.item, selected && styles.active]}>
            <ShellIcon name={item.icon} color={color} />
            <View style={styles.grow}>
              <FixeoText variant="body" tone="primary" style={styles.label}>{item.label}</FixeoText>
              <FixeoText variant="supporting" tone="secondary">{item.meta}</FixeoText>
            </View>
            {selected && <ShellIcon name="checkmark-outline" color={color} />}
          </ShellControl>
        </View>;
      })}
      <View style={styles.footer}>
        <ShellControl accessibilityLabel={signingOut ? 'Déconnexion en cours' : 'Se déconnecter'}
          accessibilityState={{ busy: signingOut, disabled: signingOut }} disabled={signingOut}
          onPress={onLogout} style={styles.logout}>
          <ShellIcon name="log-out-outline" color={semanticColors.text.secondary} />
          <FixeoText variant="supporting" tone="secondary" style={styles.grow}>
            {signingOut ? 'Déconnexion…' : 'Se déconnecter'}
          </FixeoText>
        </ShellControl>
      </View>
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md },
  grow: { flex: 1, minWidth: 0 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: space.sm, paddingBottom: space.md },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm, paddingVertical: space.lg },
  orb: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 28,
    backgroundColor: semanticColors.background.surface },
  brand: { letterSpacing: 2, marginBottom: space.xxs },
  section: { marginTop: space.lg, marginBottom: space.xs, marginHorizontal: space.sm },
  item: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.sm, paddingVertical: space.sm, marginBottom: space.xxs },
  active: { backgroundColor: '#EEEAE2', borderRadius: radii.control, borderWidth: StyleSheet.hairlineWidth, borderColor: '#D9D1C3' },
  label: { fontWeight: '600' },
  footer: { marginTop: space.lg, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: semanticColors.border.subtle },
  logout: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.sm, paddingVertical: space.sm },
});
