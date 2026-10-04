/** Hardware adapter for callback tests only, never included in the Expo app. */
import { useSyncExternalStore } from 'react';
const listeners = new Set<() => void>();
let recording = false;
let snapshot = { isRecording: false };
const publish = (value: boolean) => { recording = value; snapshot = { isRecording: value }; listeners.forEach(fn => fn()); };
const params = new URLSearchParams(location.search);
export const captureCalls: string[] = [];
export const AudioModule = { requestRecordingPermissionsAsync: async () => {
  captureCalls.push('micro-permission'); return { granted: !params.has('denied'), canAskAgain: true };
} };
export const RecordingPresets = { HIGH_QUALITY: {} };
export async function setAudioModeAsync(mode: { allowsRecording?: boolean }) { captureCalls.push(`audio-mode:${mode.allowsRecording}`); }
const recorder = { uri: 'fixture://voice.m4a', prepareToRecordAsync: async () => { captureCalls.push('prepare'); },
  record: () => { captureCalls.push('record'); publish(true); }, stop: async () => { captureCalls.push('stop'); publish(false); } };
export function useAudioRecorder() { return recorder; }
export function useAudioRecorderState() { return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => snapshot); }
export async function requestCameraPermissionsAsync() { captureCalls.push('camera-permission'); return { granted: !params.has('denied') }; }
export async function launchCameraAsync(options: unknown) { captureCalls.push('camera:' + JSON.stringify(options)); return { canceled: false, assets: [{ uri: 'fixture://photo.jpg', mimeType: 'image/jpeg' }] }; }
