import { useEffect, useSyncExternalStore } from 'react';
let current = '/';
const listeners = new Set<() => void>();
function navigate(input: string | { pathname: string; params: Record<string, string> }) {
  current = typeof input === 'string' ? input : input.pathname.replace('[id]', input.params.id);
  listeners.forEach(fn => fn());
}
export const router = { push: navigate, replace: navigate, dismissTo: navigate };
export function usePathname() { return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => current); }
export function useLocalSearchParams() { return { id: current.split('/').at(-1) }; }
export function useFocusEffect(effect: () => void | (() => void)) { const path = usePathname(); useEffect(effect, [effect, path]); }
