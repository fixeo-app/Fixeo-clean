import { useCallback, useContext, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { createRafiActivityStore } from './rafiPresence';

const activity = createRafiActivityStore({
  read: () => AppState.currentState === 'active',
  listen: listener => {
    const subscription = AppState.addEventListener('change', state => listener(state === 'active'));
    return () => subscription.remove();
  },
});
const noSubscribe = () => () => {};
const inactive = () => false;

export function useRafiActivity(enabled: boolean) {
  // Optional NavigationContext also permits genuine component fixtures outside a router.
  const navigation = useContext(NavigationContext);
  const subscribe = useCallback((notify: () => void) => {
    if (!enabled || !navigation) return () => {};
    const stopFocus = navigation.addListener('focus', notify);
    const stopBlur = navigation.addListener('blur', notify);
    return () => { stopFocus(); stopBlur(); };
  }, [navigation, enabled]);
  const getFocused = useCallback(() => enabled && (navigation?.isFocused() ?? true), [navigation, enabled]);
  const focused = useSyncExternalStore(subscribe, getFocused, inactive);
  const active = useSyncExternalStore(enabled ? activity.subscribe : noSubscribe, enabled ? activity.getSnapshot : inactive, inactive);
  return active && focused;
}
