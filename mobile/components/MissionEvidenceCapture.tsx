import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploadMissionEvidence } from '@/lib/missionEvidence';
import { triggerFixeoFeedback } from '@/lib/feedback';
import { colors, radius, spacing } from '@/ui/tokens';

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
      triggerFixeoFeedback('warning');
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
      triggerFixeoFeedback('success');
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
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.button,
          pressed && !busy && styles.pressed,
          busy && styles.disabled,
        ]}
        disabled={busy}
        onPress={() => void capture()}
      >
        <View style={styles.iconShell}>
          <Text style={styles.icon}>◉</Text>
        </View>
        <View style={styles.copy}>
          <Text style={styles.text}>{busy ? 'Envoi en cours…' : label}</Text>
          <Text style={styles.meta}>
            {kind === 'before' ? 'État initial' : 'État après intervention'} · stockage privé FIXEO
          </Text>
        </View>
        <Text style={styles.arrow}>→</Text>
      </Pressable>
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {message}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
  button: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    opacity: 0.55,
  },
  iconShell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  icon: {
    color: colors.text,
    fontWeight: '900',
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  text: {
    color: colors.text,
    fontWeight: '900',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  arrow: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
  },
  message: {
    textAlign: 'center',
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '700',
  },
});
