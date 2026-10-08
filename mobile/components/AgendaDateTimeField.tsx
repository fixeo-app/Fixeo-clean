import { useEffect, useRef, useState, type Ref } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Keyboard, Modal, Platform, View, TextInput } from 'react-native';
import { formatAgendaDateInput, formatAgendaTimeInput, agendaPickerValue, pickerDateParts } from '@/lib/agendaDate';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoText } from '@/ui/FixeoText';
import { ArtisanField } from './ArtisanEditorial';

export function AgendaDateTimeField({ date, time, onDate, onTime, errors, dateRef, timeRef }: {
  errors?: { date?: string; time?: string }; dateRef?: Ref<TextInput>; timeRef?: Ref<TextInput>;
  date: string; time: string; onDate: (value: string) => void; onTime: (value: string) => void;
}) {
  const mounted = useRef(true), opening = useRef(false);
  const [error, setError] = useState('');
  const [iosMode, setIosMode] = useState<'date' | 'time' | null>(null);
  const [iosValue, setIosValue] = useState(() => agendaPickerValue(date, time));
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function open(mode: 'date' | 'time') {
    if (Platform.OS === 'ios') { Keyboard.dismiss(); setIosValue(agendaPickerValue(date, time)); setIosMode(mode); return; }
    if (opening.current || Platform.OS !== 'android') return;
    opening.current = true; setError(''); Keyboard.dismiss();
    try {
      const { DateTimePickerAndroid } = await import('@react-native-community/datetimepicker');
      if (!mounted.current) return;
      DateTimePickerAndroid.open({ value: agendaPickerValue(date, time), mode, is24Hour: true,
        ...(mode === 'date' ? { minimumDate: new Date(2000, 0, 1), maximumDate: new Date(2100, 11, 31) } : {}),
        onChange: (event, selected) => {
          opening.current = false;
          if (!mounted.current || event.type !== 'set' || !selected) return;
          const parts = pickerDateParts(selected);
          if (mode === 'date') onDate(parts.date); else onTime(parts.time);
        },
        onError: () => { opening.current = false; if (mounted.current) setError('Le sélecteur est indisponible. La saisie manuelle reste disponible.'); },
      });
    } catch { opening.current = false; if (mounted.current) setError('La saisie manuelle reste disponible.'); }
  }
  return <View style={{ gap: 12 }}>
    <ArtisanField error={errors?.date} inputRef={dateRef} label="Date — JJ/MM/AAAA" value={date} keyboardType="number-pad" onChangeText={value => onDate(formatAgendaDateInput(value))} />
    {(Platform.OS === 'android' || Platform.OS === 'ios') && <FixeoAction label="Choisir la date" variant="secondary" onPress={() => void open('date')} />}
    <ArtisanField error={errors?.time} inputRef={timeRef} label="Heure — HH:MM" value={time} keyboardType="number-pad" onChangeText={value => onTime(formatAgendaTimeInput(value))} />
    {(Platform.OS === 'android' || Platform.OS === 'ios') && <FixeoAction label="Choisir l’heure" variant="secondary" onPress={() => void open('time')} />}
    {iosMode && <Modal visible transparent animationType="slide" onRequestClose={() => setIosMode(null)}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View style={{ backgroundColor: '#FAF8F4', borderRadius: 24, padding: 20, gap: 12 }}>
          <FixeoText variant="heading">{iosMode === 'date' ? 'Date de l’intervention' : 'Heure de l’intervention'}</FixeoText>
          <DateTimePicker value={iosValue} mode={iosMode} display="spinner" locale="fr-FR" themeVariant="light" is24Hour onChange={(_, value) => { if (value) setIosValue(value); }} />
          <FixeoAction label="Confirmer" onPress={() => { const parts = pickerDateParts(iosValue); if (iosMode === 'date') onDate(parts.date); else onTime(parts.time); setIosMode(null); }} />
          <FixeoAction label="Annuler" variant="ghost" onPress={() => setIosMode(null)} />
        </View>
      </View>
    </Modal>}
    {!!error && <FixeoText accessibilityLiveRegion="polite" tone="secondary">{error}</FixeoText>}
  </View>;
}
