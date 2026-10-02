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

type Props = {
  onVoiceReady: (uri: string) => void;
  onPhotoReady: (uri: string) => void;
};

export function RafiInputRail({ onVoiceReady, onPhotoReady }: Props) {
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [message, setMessage] = useState('');

  async function toggleVoice() {
    if (recorderState.isRecording) {
      await recorder.stop();
      if (recorder.uri) {
        setMessage('Enregistrement prêt.');
        onVoiceReady(recorder.uri);
      }
      return;
    }

    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setMessage('Microphone non autorisé.');
      return;
    }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setMessage('RAFI écoute…');
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
      setMessage('Photo prête.');
      onPhotoReady(result.assets[0].uri);
    }
  }

  return (
    <View>
      <View style={styles.row}>
        <Pressable style={styles.mode} onPress={() => void toggleVoice()}>
          <Text>{recorderState.isRecording ? '⏹ Arrêter' : '🎙 Parler'}</Text>
        </Pressable>
        <Pressable style={styles.mode} onPress={() => void takePhoto()}>
          <Text>📷 Montrer</Text>
        </Pressable>
        <View style={styles.mode}>
          <Text>⌨️ Écrire</Text>
        </View>
      </View>
      {!!message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  mode: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 14,
  },
  message: { textAlign: 'center', marginTop: 8, opacity: 0.65 },
});
