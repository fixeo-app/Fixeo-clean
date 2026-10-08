import { useRef, useState } from 'react';
import { Keyboard, Platform, View } from 'react-native';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoText } from '@/ui/FixeoText';
import { ArtisanField } from './ArtisanEditorial';
import { validISODate } from '@/lib/dateValidation';
export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (date: string) => void }) {
  const [manual, setManual] = useState(Platform.OS !== 'android');
  const opening = useRef(false);
  const validDate = validISODate(value);
  const display = validDate ? value.split('-').reverse().join('/') : value;
  async function choose() {
    if (opening.current) return;
    opening.current = true; Keyboard.dismiss();
    try {
      const { DateTimePickerAndroid } = await import('@react-native-community/datetimepicker');
      DateTimePickerAndroid.open({ value: validDate ? new Date(value + 'T12:00:00') : new Date(), mode: 'date',
        onChange: (event, date) => { opening.current = false; if (event.type === 'set' && date) onChange(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`); },
        onError: () => { opening.current = false; setManual(true); } });
    } catch { opening.current = false; setManual(true); }
  }
  return <View style={{ gap: 8 }}><FixeoText variant="supporting">{label}</FixeoText>
    {manual ? <ArtisanField label="Date · JJ/MM/AAAA" value={display} keyboardType="number-pad" onChangeText={text => { const d = text.replace(/[^\d]/g, '').slice(0, 8); onChange(d.length === 8 ? `${d.slice(4)}-${d.slice(2, 4)}-${d.slice(0, 2)}` : text); }} /> :
      <FixeoAction label={display || 'Choisir une date'} variant="secondary" onPress={() => void choose()} />}
  </View>;
}
