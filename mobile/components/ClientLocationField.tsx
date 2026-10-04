import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { detectInterventionCity } from '@/lib/clientLocationNative';
import { citySuggestions } from '@/lib/clientLocation';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoText } from '@/ui/FixeoText';
import { ShellControl, ShellIcon } from '@/ui/ShellControl';
import { semanticColors, space } from '@/ui/tokens';
import { clientStyles } from './ClientEditorial';

const MESSAGES = {
  unsupported: 'Sur cet appareil, saisissez votre ville ci-dessous.',
  denied: 'Localisation non autorisée. Vous pouvez saisir votre ville.',
  blocked: 'Localisation désactivée dans les réglages. La saisie manuelle reste disponible.',
  unavailable: 'Position indisponible. Saisissez votre ville pour continuer.',
  timeout: 'La localisation prend trop de temps. Saisissez votre ville.',
  no_city: 'La position ne permet pas d’identifier une ville. Saisissez-la ci-dessous.',
  cancelled: 'Choisissez votre ville pour continuer.',
};

export function ClientLocationField({ city, onChangeCity, disabled = false }: {
  city: string; onChangeCity: (city: string) => void; disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [detected, setDetected] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const generation = useRef(0);
  const locating = useRef(false);
  const input = useRef<TextInput>(null);
  useEffect(() => () => { generation.current++; }, []);

  function change(value: string) {
    generation.current++; locating.current = false; setBusy(false);
    setDetected(false); setMessage(''); onChangeCity(value);
  }
  async function locate() {
    if (disabled || locating.current) return;
    locating.current = true;
    const attempt = ++generation.current;
    setBusy(true); setDetected(false); setMessage('Recherche de votre ville…');
    try {
      const result = await detectInterventionCity(() => generation.current === attempt);
      if (generation.current !== attempt) return;
      if (result.ok) {
        onChangeCity(result.city); setDetected(true); setSuggesting(false); setMessage('Position détectée');
      } else setMessage(MESSAGES[result.reason]);
    } catch {
      if (generation.current === attempt) setMessage(MESSAGES.unavailable);
    } finally {
      if (generation.current === attempt) { locating.current = false; setBusy(false); }
    }
  }
  const suggestions = suggesting ? citySuggestions(city) : [];
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
      <FixeoAction label="Confirmer cette ville" variant="ghost" onPress={() => { setDetected(false); setMessage('Lieu confirmé. Vous pouvez encore le modifier.'); }} />
    </View>}
    <TextInput ref={input} accessibilityLabel="Votre ville" value={city}
      onChangeText={value => { change(value); setSuggesting(true); }} onFocus={() => setSuggesting(true)}
      editable={!disabled} placeholder="Choisir / saisir ma ville" placeholderTextColor={semanticColors.text.tertiary}
      autoCapitalize="words" style={clientStyles.input} />
    {detected && <FixeoAction label="Changer de ville" variant="ghost" onPress={() => { change(city); input.current?.focus(); }} />}
    {suggestions.map(item => <FixeoAction key={item.value} label={item.label} variant="ghost"
      accessibilityLabel={`Choisir ${item.label}`} onPress={() => { change(item.value); setSuggesting(false); input.current?.blur(); }} />)}
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: space.xs },
  locate: { flexDirection: 'row', gap: space.xs, alignSelf: 'flex-start', paddingHorizontal: space.xs },
  label: { flexShrink: 1 },
  detected: { gap: space.xxs },
});
