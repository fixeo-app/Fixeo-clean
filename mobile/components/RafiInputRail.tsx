import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { RafiComposer } from './RafiComposer';

type Props = {
  onVoiceReady: (uri: string) => void;
  onPhotoReady: (uri: string, mimeType?: string) => void;
  onWrite?: () => void;
  onListeningChange?: (listening: boolean) => void;
};

export function RafiInputRail({
  onVoiceReady,
  onPhotoReady,
  onWrite,
  onListeningChange,
}: Props) {
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

        onListeningChange?.(false);

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
      onListeningChange?.(true);
      setMessage('RAFI écoute… Touchez Arrêter quand vous avez fini.');
    } catch (error: any) {
      console.warn(
        JSON.stringify({
          event: 'mobile_rafi_voice_capture_failed',
          code: String(error?.message || 'unknown').slice(0, 120),
        }),
      );
      onListeningChange?.(false);
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

  return <RafiComposer recording={recorderState.isRecording} voiceBusy={voiceBusy} message={message}
    onVoice={() => void toggleVoice()} onPhoto={() => void takePhoto()} onWrite={onWrite} />;
}
