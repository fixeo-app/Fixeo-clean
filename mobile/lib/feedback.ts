import { Platform, Vibration } from 'react-native';

export type FixeoFeedbackKind =
  | 'selection'
  | 'impact'
  | 'success'
  | 'warning'
  | 'error'
  | 'none';

let lastFeedbackAt = 0;

const ANDROID_PATTERN: Record<Exclude<FixeoFeedbackKind, 'none'>, number | number[]> = {
  selection: 8,
  impact: 16,
  success: [0, 18, 55, 24],
  warning: [0, 28, 70, 28],
  error: [0, 35, 55, 35, 55, 35],
};

export function triggerFixeoFeedback(kind: FixeoFeedbackKind = 'selection') {
  if (kind === 'none' || Platform.OS === 'web') return;

  const now = Date.now();
  if (now - lastFeedbackAt < 70) return;
  lastFeedbackAt = now;

  try {
    if (Platform.OS === 'ios') {
      Vibration.vibrate();
      return;
    }

    Vibration.vibrate(ANDROID_PATTERN[kind] as any);
  } catch {
    // Feedback is an enhancement. Never block a product action if the device rejects it.
  }
}
