import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, View } from 'react-native';
import { formatAgendaDateInput, formatAgendaTimeInput, agendaPickerValue, pickerDateParts } from '@/lib/agendaDate';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoText } from '@/ui/FixeoText';
import { ArtisanField } from './ArtisanEditorial';

export function AgendaDateTimeField({ date, time, onDate, onTime }: {
  date: string; time: string; onDate: (value: string) => void; onTime: (value: string) => void;
}) {
  const mounted = useRef(true), opening = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function open(mode: 'date' | 'time') {
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
    <ArtisanField label="Date — JJ/MM/AAAA" value={date} keyboardType="number-pad" onChangeText={value => onDate(formatAgendaDateInput(value))} />
    {Platform.OS === 'android' && <FixeoAction label="Choisir la date" variant="secondary" onPress={() => void open('date')} />}
    <ArtisanField label="Heure — HH:MM" value={time} keyboardType="number-pad" onChangeText={value => onTime(formatAgendaTimeInput(value))} />
    {Platform.OS === 'android' && <FixeoAction label="Choisir l’heure" variant="secondary" onPress={() => void open('time')} />}
    {!!error && <FixeoText accessibilityLiveRegion="polite" tone="secondary">{error}</FixeoText>}
  </View>;
}
