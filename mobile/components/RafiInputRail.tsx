import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { captureRafiPhoto } from '@/lib/rafiPhotoCapture';
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
  const captureLock = useRef(false), recording = useRef(false);
  const listeningChanged = useRef(onListeningChange);
  listeningChanged.current = onListeningChange;
  useEffect(() => {
    active.current = true;
    const stop = () => { recording.current = false; void recorder.stop().catch(() => undefined).finally(() => setAudioModeAsync({ allowsRecording: false }).catch(() => undefined)); };
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' || !recording.current) return;
      stop(); listeningChanged.current?.(false);
      setMessage('Enregistrement interrompu. Touchez le micro pour recommencer.');
    });
    return () => { active.current = false; subscription.remove(); stop(); };
  }, [recorder]);

  async function toggleVoice() {
    if (captureLock.current) return;
    captureLock.current = true;
    setVoiceBusy(true);

    try {
      if (recorderState.isRecording) {
        recording.current = false;
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

      if (!(await explainPermission('microphone')) || !active.current) return;
      const existing = await AudioModule.getRecordingPermissionsAsync();
      const permission = existing.granted ? existing : await AudioModule.requestRecordingPermissionsAsync();
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
      recording.current = true;
      onListeningChange?.(true);
      setMessage('RAFI écoute… Touchez Arrêter quand vous avez fini.');
    } catch {
      recording.current = false;
      if (active.current) { onListeningChange?.(false);
        setMessage('Le microphone n’a pas pu démarrer. Vérifiez son autorisation puis réessayez.'); }
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    } finally {
      captureLock.current = false;
      if (active.current) setVoiceBusy(false);
    }
  }

  async function takePhoto() {
    if (captureLock.current) return;
    if (recording.current) { setMessage('Arrêtez l’enregistrement avant de prendre une photo.'); return; }
    captureLock.current = true;
    try {
      const photo = await captureRafiPhoto('camera', () => active.current);
      if (photo) {
        setMessage('Photo prête. Vous choisissez quand l’analyser.');
        onPhotoReady(photo.uri, photo.mimeType);
      }
    } catch { if (active.current) setMessage('La caméra n’est pas disponible. Vous pouvez écrire votre demande.'); }
    finally { captureLock.current = false; }
  }

  return <RafiComposer recording={recorderState.isRecording} voiceBusy={voiceBusy} message={message}
    onVoice={() => void toggleVoice()} onPhoto={() => void takePhoto()} onWrite={onWrite} />;
}
