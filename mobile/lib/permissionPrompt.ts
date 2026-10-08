import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking, Platform } from 'react-native';
export type CapturePermission = 'microphone' | 'camera' | 'photos';
const descriptions: Record<CapturePermission, string> = {
  microphone: 'RAFI utilise le microphone pendant votre enregistrement. Vous pouvez aussi écrire votre demande.',
  camera: 'FIXEO utilise la caméra pour la photo que vous choisissez de transmettre. Vous pouvez continuer sans photo.',
  photos: 'Choisissez uniquement la photo utile à votre demande. Vous pouvez continuer sans partager de photo.',
};
export async function explainPermission(kind: CapturePermission): Promise<boolean> {
  const key = 'fixeo:permission-explanation:v1:' + kind;
  if (await AsyncStorage.getItem(key).catch(() => null) === 'accepted') return true;
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm(descriptions[kind]));
  const accepted = await new Promise<boolean>(resolve => Alert.alert('Vous gardez le choix.', descriptions[kind], [
    { text: 'Pas maintenant', style: 'cancel', onPress: () => resolve(false) },
    { text: 'Continuer', onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) }));
  if (accepted) await AsyncStorage.setItem(key, 'accepted').catch(() => undefined);
  return accepted;
}
export function permissionRefused(kind: CapturePermission, canAskAgain: boolean) {
  const title = kind === 'microphone' ? 'Microphone non autorisé.' : kind === 'photos' ? 'Photos non autorisées.' : 'Caméra non autorisée.';
  if (!canAskAgain && Platform.OS !== 'web') Alert.alert(title, 'Vous pouvez autoriser cet accès dans les réglages, ou continuer sans l’utiliser.', [
    { text: 'Continuer sans', style: 'cancel' }, { text: 'Ouvrir les réglages', onPress: () => { void Linking.openSettings().catch(() => undefined); } },
  ]);
  return title + (canAskAgain ? ' Vous pouvez réessayer ou continuer sans.' : ' Modifiez l’autorisation dans les réglages, ou continuez sans.');
}
