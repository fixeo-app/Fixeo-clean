import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { createMotionPreferenceStore } from './motionContract';

const preference = createMotionPreferenceStore({
  read: () => AccessibilityInfo.isReduceMotionEnabled(),
  listen: listener => {
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', listener);
    return () => subscription.remove();
  },
});

export function useReducedMotion() {
  return useSyncExternalStore(preference.subscribe, preference.getSnapshot, preference.getServerSnapshot);
}
