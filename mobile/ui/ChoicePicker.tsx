import { useState } from 'react';
import { FlatList, Modal, SafeAreaView, View } from 'react-native';
import { KeyboardInput } from './KeyboardInput';
import { FixeoText } from './FixeoText';
import { FixeoAction } from './FixeoAction';
import { semanticColors, space, typography } from './tokens';

type Value = string | number | boolean;
type Option = { value: Value; label: string; disabled?: boolean };
const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** Keeps every canonical option; virtualized search never creates a new value. */
export function ChoicePicker({ label, options, value, onChange, disabled = false }: {
  label: string; options: Option[]; value: Value; onChange: (value: Value) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const selected = options.find(option => option.value === value);
  const short = options.slice(0, 3);
  if (selected && !short.includes(selected)) short[2] = selected;
  const choose = (option: Option) => { if (disabled || option.disabled) return; onChange(option.value); setOpen(false); };
  return <View style={{ gap: space.sm }}>
    <FixeoText variant="supporting">{label}</FixeoText>
    {short.map(option => <FixeoAction key={`${typeof option.value}:${option.value}`} label={option.label}
      variant="secondary" selected={value === option.value} disabled={disabled || option.disabled} onPress={() => choose(option)} />)}
    {options.length > 3 && <FixeoAction label={`Voir toutes les options (${options.length})`} variant="ghost" disabled={disabled}
      accessibilityLabel={`Rechercher parmi ${options.length} options : ${label}`} onPress={() => { setQuery(''); setOpen(true); }} />}
    <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: semanticColors.background.canvas }}>
        <View style={{ padding: space.lg, gap: space.sm }}>
          <FixeoText accessibilityRole="header" variant="title">{label}</FixeoText>
          <FixeoAction label="Fermer la sélection" variant="ghost" onPress={() => setOpen(false)} />
          <KeyboardInput accessibilityLabel={`Rechercher : ${label}`} placeholder="Rechercher" value={query} onChangeText={setQuery}
            style={{ ...typography.body, minHeight: 56, padding: space.md, color: semanticColors.text.primary, backgroundColor: semanticColors.background.surface }} />
        </View>
        <FlatList data={options.filter(option => fold(option.label).includes(fold(query)))}
          keyboardShouldPersistTaps="handled" keyExtractor={option => `${typeof option.value}:${option.value}`}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.sm }}
          ListEmptyComponent={<FixeoText>Aucune option correspondante. Modifiez votre recherche.</FixeoText>}
          renderItem={({ item }) => <FixeoAction label={item.label} variant="secondary" selected={value === item.value}
            disabled={disabled || item.disabled} onPress={() => choose(item)} />} />
      </SafeAreaView>
    </Modal>
  </View>;
}
