import { useCallback } from 'react';
import { BackHandler, StyleSheet } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, usePathname } from 'expo-router';
import { logicalParent, type BackDestination } from './backContract';
import { ShellControl, ShellIcon } from './ShellControl';
import { FixeoText } from './FixeoText';
import { space } from './tokens';

export function BackButton({ destination, onPress, label = 'Retour', system = true, disabled = false }: {
  destination?: BackDestination; onPress?: () => void; label?: string; system?: boolean; disabled?: boolean;
}) {
  const path = usePathname();
  const params = useLocalSearchParams();
  const target = destination || logicalParent(path, params);
  const serialized = JSON.stringify(target);
  const go = useCallback(() => {
    if (disabled) return;
    if (onPress) onPress(); else router.dismissTo(JSON.parse(serialized));
  }, [disabled, onPress, serialized]);
  useFocusEffect(useCallback(() => {
    if (!system) return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { go(); return true; });
    return () => listener.remove();
  }, [go, system]));
  return <ShellControl accessibilityLabel={label} onPress={go} disabled={disabled} style={styles.back}>
    <ShellIcon name="chevron-back-outline" /><FixeoText variant="supporting">{label}</FixeoText>
  </ShellControl>;
}
const styles = StyleSheet.create({ back: { alignSelf: 'flex-start', flexDirection: 'row', gap: space.xxs,
  paddingHorizontal: space.xs, paddingVertical: 0, minHeight: 48, borderWidth: 0, backgroundColor: 'transparent' } });
