import { useCallback, useRef } from 'react';
import { router, useFocusEffect, usePathname } from 'expo-router';
import { navigateShell, workspaceDockDestinations, type ContextDockSpec, type ShellUniverse } from '@/ui/shellContract';

/** Presentation only: counts are supplied by the existing workspace reads. */
export function useWorkspaceDock(universe: ShellUniverse, counts: Readonly<Record<string, number>> = {}): ContextDockSpec {
  const pathname = usePathname();
  const navigating = useRef(false);
  useFocusEffect(useCallback(() => { navigating.current = false; }, []));
  return { universe, items: workspaceDockDestinations(universe, pathname).map(item => ({
    key: item.key, label: item.label, icon: item.icon, accessibilityLabel: `Ouvrir ${item.label}`,
    badge: counts[item.key],
    action: () => {
      if (navigating.current) return;
      navigating.current = true;
      navigateShell(router, pathname, item.path, item.path === '/' || item.path === '/artisan' ? 'switch' : 'detail');
    },
  })) };
}
