import { useState } from 'react';
import { FlatList, Keyboard, Modal, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SERVICE_CATALOG } from '@/lib/serviceCatalog';
import { ShellControl, ShellIcon } from '@/ui/ShellControl';
import { FixeoText } from '@/ui/FixeoText';
import { semanticColors, space } from '@/ui/tokens';
import { clientStyles } from './ClientEditorial';

export function ServiceField({ values, onChange, multiple = false, disabled = false, suggestion }: {
  values: string[]; onChange: (values: string[]) => void; multiple?: boolean; disabled?: boolean; suggestion?: string;
}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();
  const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const options = [...new Set([...SERVICE_CATALOG, ...values, ...(!multiple ? ['Autre'] : [])])].filter(value => normalize(value).includes(normalize(query)));
  const close = () => { Keyboard.dismiss(); setOpen(false); };
  return <View style={{ gap: space.xs }}>
    <FixeoText variant="caption" tone="secondary">{multiple ? 'Vos métiers' : values.length ? 'Métier choisi par vous' : suggestion ? 'Métier suggéré par RAFI' : 'Métier à préciser'}</FixeoText>
    <ShellControl disabled={disabled} accessibilityLabel={multiple ? 'Choisir mes métiers' : 'Choisir le métier'}
      onPress={() => { setQuery(''); setOpen(true); }} style={clientStyles.input}>
      <FixeoText>{values.join(' · ') || (suggestion ? `${suggestion} · Modifier` : 'Choisir le métier')}</FixeoText>
    </ShellControl>
    <Modal visible={open && !disabled} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: semanticColors.background.canvas, paddingHorizontal: space.lg, paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 16), gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><FixeoText variant="heading">{multiple ? 'Vos métiers' : 'Votre besoin'}</FixeoText>
          <ShellControl accessibilityLabel={multiple ? 'Terminer la sélection' : 'Fermer les métiers'} onPress={close}><ShellIcon name="checkmark-outline" /></ShellControl></View>
        <TextInput accessibilityLabel="Rechercher un métier" placeholder="Rechercher un métier" value={query} onChangeText={setQuery} style={clientStyles.input} />
        <FlatList data={options} keyExtractor={item => item} keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<FixeoText>Aucun métier trouvé. Modifiez votre recherche.</FixeoText>}
          renderItem={({ item }) => <ShellControl accessibilityLabel={`Choisir ${item}`} accessibilityRole={multiple ? 'checkbox' : 'radio'}
            accessibilityState={{ checked: values.includes(item) }} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.sm }}
            onPress={() => { onChange(multiple ? values.includes(item) ? values.filter(value => value !== item) : [...values, item] : [item]); if (!multiple) close(); }}>
            <FixeoText>{item}</FixeoText>{values.includes(item) && <ShellIcon name="checkmark-outline" />}
          </ShellControl>} />
      </View>
    </Modal>
  </View>;
}
