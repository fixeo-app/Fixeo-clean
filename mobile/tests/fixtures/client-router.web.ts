import { useEffect, useSyncExternalStore } from 'react';
const params = new URLSearchParams(location.search);
const routes: Record<string, string> = { workspace: '/client-workspace', history: '/client-workspace/history', alerts: '/client-workspace/notifications', account: '/client-workspace/account', mission: '/client-mission/00000000-0000-4000-8000-000000000002' };
let current = routes[params.get('scene') || ''] || '/';
const listeners = new Set<() => void>();
export const navigations: unknown[] = [];
function publish(path: string | { pathname: string; params: Record<string, string> }) {
  navigations.push(path);
  current = typeof path === 'string' ? path : path.pathname.replace('[id]', path.params.id);
  listeners.forEach(listener => listener());
}
export const router = { push: publish, dismissTo: publish, replace: publish };
export function usePathname() { return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => current); }
export function useFocusEffect(effect: () => void | (() => void)) { const path = usePathname(); useEffect(effect, [effect, path]); }
export function useLocalSearchParams() { return { id: '00000000-0000-4000-8000-000000000002' }; }
