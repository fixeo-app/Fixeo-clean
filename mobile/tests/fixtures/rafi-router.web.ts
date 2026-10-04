/** Test-only navigation boundary. Production uses Expo Router and the tested StackRouter. */
import { useEffect, useSyncExternalStore } from 'react';
const listeners = new Set<() => void>();
let current = new URLSearchParams(location.search).get('scene') === 'artisan' ? '/artisan' : '/';
const publish = (path: string) => { current = path; listeners.forEach(listener => listener()); };
export const router = { push: publish, dismissTo: publish, replace: publish };
export function usePathname() { return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => current); }
export function useFocusEffect(effect: () => void | (() => void)) { const path = usePathname(); useEffect(effect, [effect, path]); }
