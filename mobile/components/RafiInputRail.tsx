import { useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { explainPermission, permissionRefused } from '@/lib/permissionPrompt';
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
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; void recorder.stop().catch(() => undefined); }; }, [recorder]);

  async function toggleVoice() {
    if (voiceBusy) return;
    setVoiceBusy(true);

    try {
      if (recorderState.isRecording) {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
        if (!active.current) return;

        onListeningChange?.(false);

        if (recorder.uri) {
          setMessage('Voix prête pour RAFI.');
          onVoiceReady(recorder.uri);
        } else {
          setMessage('Enregistrement introuvable. Réessayez.');
        }
        return;
      }

      if (!(await explainPermission('microphone'))) return;
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!active.current) return;
      if (!permission.granted) {
        setMessage(permissionRefused('microphone', permission.canAskAgain !== false));
        return;
      }

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
      await recorder.prepareToRecordAsync();
      if (!active.current) return;
      recorder.record();
      onListeningChange?.(true);
      setMessage('RAFI écoute… Touchez Arrêter quand vous avez fini.');
    } catch {
      onListeningChange?.(false);
      setMessage('Le microphone n’a pas pu démarrer. Vérifiez son autorisation puis réessayez.');
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    } finally {
      setVoiceBusy(false);
    }
  }

  async function takePhoto() {
    if (!(await explainPermission('camera'))) return;
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!active.current) return;
      if (!permission.granted) { setMessage(permissionRefused('camera', permission.canAskAgain !== false)); return; }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.72, allowsEditing: false });
      if (!active.current) return;
      if (!result.canceled && result.assets[0]?.uri) {
        setMessage('Photo prête pour RAFI.');
        onPhotoReady(result.assets[0].uri, result.assets[0].mimeType || 'image/jpeg');
      }
    } catch { setMessage('La caméra n’est pas disponible. Vous pouvez écrire votre demande.'); }
  }

  return <RafiComposer recording={recorderState.isRecording} voiceBusy={voiceBusy} message={message}
    onVoice={() => void toggleVoice()} onPhoto={() => void takePhoto()} onWrite={onWrite} />;
}
