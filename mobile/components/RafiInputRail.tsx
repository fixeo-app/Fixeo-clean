import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { colors, radius, spacing, type } from '@/ui/tokens';

type Props = {
  onVoiceReady: (uri: string) => void;
  onPhotoReady: (uri: string, mimeType?: string) => void;
  onWrite?: () => void;
};

export function RafiInputRail({ onVoiceReady, onPhotoReady, onWrite }: Props) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [message, setMessage] = useState('');
  const [voiceBusy, setVoiceBusy] = useState(false);

  async function toggleVoice() {
    if (voiceBusy) return;
    setVoiceBusy(true);

    try {
      if (recorderState.isRecording) {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);

        if (recorder.uri) {
          setMessage('Voix prête pour RAFI.');
          onVoiceReady(recorder.uri);
        } else {
          setMessage('Enregistrement introuvable. Réessayez.');
        }
        return;
      }

      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setMessage(
          permission.canAskAgain === false
            ? 'Microphone bloqué. Autorisez FIXEO dans les réglages Android.'
            : 'Microphone non autorisé.',
        );
        return;
      }

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setMessage('RAFI écoute… Touchez Arrêter quand vous avez fini.');
    } catch (error: any) {
      console.warn(
        JSON.stringify({
          event: 'mobile_rafi_voice_capture_failed',
          code: String(error?.message || 'unknown').slice(0, 120),
        }),
      );
      setMessage('Le microphone n’a pas pu démarrer. Vérifiez son autorisation puis réessayez.');
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    } finally {
      setVoiceBusy(false);
    }
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setMessage('Caméra non autorisée.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.72,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      setMessage('Photo prête pour RAFI.');
      onPhotoReady(result.assets[0].uri, result.assets[0].mimeType || 'image/jpeg');
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            selected: recorderState.isRecording,
            busy: voiceBusy,
            disabled: voiceBusy,
          }}
          disabled={voiceBusy}
          style={({ pressed }) => [
            styles.mode,
            recorderState.isRecording && styles.recording,
            pressed && !voiceBusy && styles.pressed,
            voiceBusy && styles.busy,
          ]}
          onPress={() => void toggleVoice()}
        >
          <Text style={[styles.icon, recorderState.isRecording && styles.inverse]}>
            {recorderState.isRecording ? '■' : '●'}
          </Text>
          <Text style={[styles.label, recorderState.isRecording && styles.inverse]}>
            {recorderState.isRecording
              ? 'Arrêter'
              : voiceBusy
                ? 'Préparation…'
                : 'Parler'}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.mode, pressed && styles.pressed]}
          onPress={() => void takePhoto()}
        >
          <Text style={styles.icon}>◉</Text>
          <Text style={styles.label}>Montrer</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.mode, pressed && styles.pressed]}
          onPress={onWrite}
        >
          <Text style={styles.icon}>⌨</Text>
          <Text style={styles.label}>Écrire</Text>
        </Pressable>
      </View>

      {!!message && (
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {message}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  mode: {
    flex: 1,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  recording: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.86,
  },
  busy: {
    opacity: 0.62,
  },
  icon: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  label: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: '800',
  },
  inverse: {
    color: colors.inverse,
  },
  message: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
});
