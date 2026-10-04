import { Platform, Vibration } from 'react-native';
import { feedbackContract, type FixeoFeedbackKind } from './feedbackContract';
export type { FixeoFeedbackKind } from './feedbackContract';

let lastFeedbackAt = 0;

export function triggerFixeoFeedback(kind: FixeoFeedbackKind = 'selection') {
  if (kind === 'none' || Platform.OS === 'web') return;

  const now = Date.now();
  if (now - lastFeedbackAt < feedbackContract.minimumInterval) return;
  lastFeedbackAt = now;

  try {
    if (Platform.OS === 'ios') {
      if (kind === 'selection') return;
      Vibration.vibrate();
      return;
    }

    Vibration.vibrate(feedbackContract.android[kind]);
  } catch {
    // Feedback is an enhancement. Never block a product action if the device rejects it.
  }
}
