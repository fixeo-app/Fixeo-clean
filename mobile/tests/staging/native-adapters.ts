// Synthetic hardware only. RAFI and every business service remain the real application modules.
import { useSyncExternalStore } from 'react';
const listeners = new Set<() => void>();
let state = { isRecording: false };
function publish(value: boolean) { state = { isRecording: value }; listeners.forEach(fn => fn()); }
export const AudioModule = { requestRecordingPermissionsAsync: async () => ({ granted: true, canAskAgain: true }) };
export const RecordingPresets = { HIGH_QUALITY: {} };
export async function setAudioModeAsync() {}
const recorder = { uri: 'synthetic://voice.wav', prepareToRecordAsync: async () => {}, record: () => publish(true), stop: async () => publish(false) };
export function useAudioRecorder() { return recorder; }
export function useAudioRecorderState() { return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => state); }
export async function requestCameraPermissionsAsync() { return { granted: true }; }
export async function launchCameraAsync() { return { canceled: false, assets: [{ uri: 'synthetic://photo.png', mimeType: 'image/png' }] }; }
