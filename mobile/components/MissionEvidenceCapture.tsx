import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploadMissionEvidence } from '@/lib/missionEvidence';

type Props = {
  missionId: string;
  kind: 'before' | 'after';
  label: string;
  onUploaded?: () => void;
};

export function MissionEvidenceCapture({ missionId, kind, label, onUploaded }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function capture() {
    if (busy) return;

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setMessage('Caméra non autorisée.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.72,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]?.uri) return;

    setBusy(true);
    setMessage('Envoi sécurisé à FIXEO…');
    try {
      const asset = result.assets[0];
      await uploadMissionEvidence(
        missionId,
        kind,
        asset.uri,
        asset.mimeType || 'image/jpeg',
      );
      setMessage('✓ Preuve enregistrée.');
      onUploaded?.();
    } catch {
      setMessage('Impossible d’envoyer la preuve. Réessayez quand le réseau revient.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.button} disabled={busy} onPress={() => void capture()}>
        <Text style={styles.text}>{busy ? 'Envoi…' : label}</Text>
      </Pressable>
      {!!message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 7 },
  button: { borderWidth: 1, borderColor: '#d5d5d5', backgroundColor: '#fff', padding: 16, borderRadius: 17 },
  text: { textAlign: 'center', fontWeight: '800' },
  message: { textAlign: 'center', fontSize: 13, opacity: 0.65 },
});
