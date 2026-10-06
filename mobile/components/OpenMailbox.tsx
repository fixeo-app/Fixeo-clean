import { useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoText } from '@/ui/FixeoText';

/** Opens the inbox app, never a composer or a new recovery request. */
export function OpenMailbox() {
  const [message, setMessage] = useState('');
  if (Platform.OS === 'web') return null;
  async function open() {
    try {
      if (Platform.OS === 'android') {
        const { startActivityAsync } = await import('expo-intent-launcher');
        await startActivityAsync('android.intent.action.MAIN', { category: 'android.intent.category.APP_EMAIL' });
      } else await Linking.openURL('message://');
    } catch { setMessage('Ouvrez votre application de messagerie pour consulter le lien FIXEO.'); }
  }
  return <><FixeoAction label="Ouvrir ma messagerie" onPress={() => void open()} />
    {!!message && <FixeoText accessibilityLiveRegion="polite" tone="secondary">{message}</FixeoText>}</>;
}
