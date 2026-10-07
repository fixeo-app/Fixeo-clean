import { useState } from 'react';
import { FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { canonicalCity, citySuggestions } from '@/lib/clientLocation';
import { FixeoText } from '@/ui/FixeoText';
import { ShellControl, ShellIcon } from '@/ui/ShellControl';
import { semanticColors, space, radii } from '@/ui/tokens';
import { clientStyles } from './ClientEditorial';

/** Shared canonical catalogue; selection and submission use the same backend value. */
export function CityField({ value, onChange, label = 'Votre ville', disabled = false }: {
  value: string; onChange: (value: string) => void; label?: string; disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();
  const close = () => { Keyboard.dismiss(); setExpanded(false); };
  const options = citySuggestions(query);
  return <View style={styles.root}>
    <FixeoText variant="supporting" tone="secondary">{label}</FixeoText>
    <View style={styles.inputRow}>
      <ShellControl accessibilityLabel={label} style={[clientStyles.input, styles.input]}
        accessibilityState={{ expanded }} disabled={disabled} onPress={() => { setQuery(''); setExpanded(!expanded); }}>
        <FixeoText>{canonicalCity(value) || value || 'Choisir une ville'}</FixeoText>
      </ShellControl>
      <ShellControl accessibilityLabel={expanded ? 'Fermer la liste des villes' : 'Afficher les villes'}
        accessibilityState={{ expanded }} disabled={disabled} onPress={() => { setQuery(''); setExpanded(!expanded); }}>
        <ShellIcon name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'} />
      </ShellControl>
    </View>
    <Modal visible={expanded && !disabled} animationType="slide" onRequestClose={close} presentationStyle="pageSheet">
    <KeyboardAvoidingView style={[styles.sheet, { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 16) }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.heading}><FixeoText variant="heading">{label}</FixeoText>
        <ShellControl accessibilityLabel="Fermer la liste des villes" onPress={close}><ShellIcon name="close-outline" /></ShellControl>
      </View>
      <TextInput accessibilityLabel="Rechercher une ville" placeholder="Rechercher une ville : Fès, Rabat…"
        value={query} autoCorrect={false} autoCapitalize="none" onChangeText={setQuery}
        returnKeyType="search" onSubmitEditing={() => { const city = canonicalCity(query); if(city) { onChange(city); close(); } }}
        style={clientStyles.input} />
      <FlatList data={options} keyExtractor={item => item.value} keyboardShouldPersistTaps="handled" style={styles.list}
        renderItem={({ item }) => <ShellControl accessibilityLabel={`Choisir ${item.label}`}
          accessibilityState={{ selected: canonicalCity(value) === item.value }}
          style={styles.option} onPress={() => { onChange(item.value); close(); }}>
          <FixeoText>{item.label}</FixeoText>
          {canonicalCity(value) === item.value && <ShellIcon name="checkmark-outline" />}
        </ShellControl>} ListEmptyComponent={<View><FixeoText style={styles.empty} tone="secondary">Aucune ville trouvée. Essayez un autre nom.</FixeoText><ShellControl accessibilityLabel="Effacer la recherche" onPress={() => setQuery('')}><FixeoText>Effacer la recherche</FixeoText></ShellControl></View>} />
    </KeyboardAvoidingView></Modal>
  </View>;
}

export function CityZonesField({ values, onChange, disabled = false }: {
  values: string[]; onChange: (values: string[]) => void; disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  return <View style={styles.root}>
    {values.map((city, index) => <View key={city} style={styles.zone}>
      <View style={styles.input}><FixeoText>{canonicalCity(city) || city}</FixeoText>
        <FixeoText variant="caption" tone="secondary">{index === 0 ? 'Ville principale' : 'Zone de travail'}</FixeoText></View>
      <ShellControl accessibilityLabel={`Retirer ${city}`} disabled={disabled} onPress={() => onChange(values.filter((_, i) => i !== index))}>
        <ShellIcon name="close-outline" />
      </ShellControl>
    </View>)}
    <CityField label={values.length ? 'Ajouter une zone de travail' : 'Ville principale'} value={query} disabled={disabled}
      onChange={value => {
        const city = canonicalCity(value);
        if (city) { onChange([...new Set([...values, city])]); setQuery(''); }
        else setQuery(value);
      }} />
  </View>;
}
const styles = StyleSheet.create({
  root: { gap: space.xs }, inputRow: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  input: { flex: 1, minWidth: 0 }, list: { flex: 1 },
  sheet: { flex: 1, paddingHorizontal: space.lg, gap: space.md, backgroundColor: semanticColors.background.canvas },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  options: { backgroundColor: semanticColors.background.surface, borderWidth: 1, borderColor: semanticColors.border.subtle, borderRadius: radii.control, overflow: 'hidden' },
  option: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.md, paddingVertical: space.sm },
  empty: { padding: space.md }, zone: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
