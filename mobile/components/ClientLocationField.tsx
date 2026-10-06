import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { detectInterventionCity } from '@/lib/clientLocationNative';
import { CityField } from './CityField';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoText } from '@/ui/FixeoText';
import { ShellControl, ShellIcon } from '@/ui/ShellControl';
import { space } from '@/ui/tokens';
import type { RafiPresenceState } from '@/ui/rafiPresence';

const MESSAGES = {
  unsupported: 'Sur cet appareil, saisissez votre ville ci-dessous.',
  denied: 'Localisation non autorisée. Vous pouvez saisir votre ville.',
  blocked: 'Localisation désactivée dans les réglages. La saisie manuelle reste disponible.',
  unavailable: 'Position indisponible. Saisissez votre ville pour continuer.',
  timeout: 'La localisation prend trop de temps. Saisissez votre ville.',
  no_city: 'La position ne permet pas d’identifier une ville. Saisissez-la ci-dessous.',
  cancelled: 'Choisissez votre ville pour continuer.',
};

export function ClientLocationField({ city, onChangeCity, disabled = false, onPresenceChange }: {
  city: string; onChangeCity: (city: string) => void; disabled?: boolean;
  onPresenceChange?: (state: RafiPresenceState | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [detected, setDetected] = useState(false);
  const generation = useRef(0);
  const locating = useRef(false);
  useEffect(() => () => { generation.current++; }, []);

  function change(value: string) {
    onPresenceChange?.(null);
    generation.current++; locating.current = false; setBusy(false);
    setDetected(false); setMessage(''); onChangeCity(value);
  }
  async function locate() {
    if (disabled || locating.current) return;
    locating.current = true;
    const attempt = ++generation.current;
    setBusy(true); setDetected(false); setMessage('Recherche de votre ville…');
    onPresenceChange?.('thinking');
    try {
      const result = await detectInterventionCity(() => generation.current === attempt);
      if (generation.current !== attempt) return;
      if (result.ok) {
        onChangeCity(result.city); setDetected(true); setMessage('Position détectée');
        onPresenceChange?.('success');
      } else { setMessage(MESSAGES[result.reason]); onPresenceChange?.('attention'); }
    } catch {
      if (generation.current === attempt) { setMessage(MESSAGES.unavailable); onPresenceChange?.('attention'); }
    } finally {
      if (generation.current === attempt) { locating.current = false; setBusy(false); }
    }
  }
  return <View testID="client-location" style={styles.root}>
    <FixeoText variant="caption" tone="secondary">Lieu d’intervention</FixeoText>
    <ShellControl accessibilityLabel="Utiliser ma position" disabled={disabled || busy}
      accessibilityState={{ busy, disabled: disabled || busy }} onPress={() => void locate()} style={styles.locate}>
      <ShellIcon name="location-outline" />
      <FixeoText variant="supporting" style={styles.label}>{busy ? 'Localisation…' : 'Utiliser ma position'}</FixeoText>
    </ShellControl>
    {!!message && <FixeoText accessibilityLiveRegion="polite" variant="supporting" tone="secondary">{message}</FixeoText>}
    {detected && <View style={styles.detected}>
      <FixeoText variant="heading">{city}</FixeoText>
      <FixeoAction label="Confirmer cette ville" variant="ghost" onPress={() => { setDetected(false); setMessage('Lieu confirmé. Vous pouvez encore le modifier.'); onPresenceChange?.('success'); }} />
    </View>}
    <CityField label="Votre ville" value={city} onChange={change} disabled={disabled} />
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: space.xs },
  locate: { flexDirection: 'row', gap: space.xs, alignSelf: 'flex-start', paddingHorizontal: space.xs },
  label: { flexShrink: 1 },
  detected: { gap: space.xxs },
});
