import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';
import { interaction, layout, space, typography } from './tokens';

export type ShellUniverse = 'client' | 'artisan';
export type ShellIcon = ComponentProps<typeof Ionicons>['name'];
export type ShellPath = '/' | '/client-workspace' | '/client-workspace/history' |
  '/client-workspace/notifications' | '/client-workspace/account' | '/artisan' |
  '/artisan-workspace' | '/artisan-workspace/clients' | '/artisan-workspace/quotes' |
  '/artisan-workspace/agenda' | '/artisan-workspace/finance';
export type ShellDestination = {
  key: string; label: string; meta: string; path: ShellPath; icon: ShellIcon;
  section: string;
};

const CLIENT_ITEMS: readonly ShellDestination[] = [
  { key: 'rafi', label: 'RAFI', meta: 'Votre assistant FIXEO', path: '/', icon: 'sparkles-outline', section: 'Votre quotidien' },
  { key: 'space', label: 'Mon espace', meta: 'Vue d’ensemble', path: '/client-workspace', icon: 'grid-outline', section: 'Votre quotidien' },
  { key: 'history', label: 'Interventions', meta: 'Historique et suivi', path: '/client-workspace/history', icon: 'time-outline', section: 'Votre quotidien' },
  { key: 'alerts', label: 'Alertes', meta: 'Messages et informations', path: '/client-workspace/notifications', icon: 'notifications-outline', section: 'Votre quotidien' },
  { key: 'account', label: 'Mon compte', meta: 'Coordonnées et préférences', path: '/client-workspace/account', icon: 'person-outline', section: 'Personnel' },
];
const ARTISAN_ITEMS: readonly ShellDestination[] = [
  { key: 'cockpit', label: 'Cockpit', meta: 'Priorités et opportunités', path: '/artisan', icon: 'compass-outline', section: 'Pilotage' },
  { key: 'workspace', label: 'Artisan OS', meta: 'Vue d’ensemble de l’activité', path: '/artisan-workspace', icon: 'grid-outline', section: 'Pilotage' },
  { key: 'clients', label: 'Clients', meta: 'Vos relations professionnelles', path: '/artisan-workspace/clients', icon: 'people-outline', section: 'Votre activité' },
  { key: 'quotes', label: 'Devis', meta: 'Devis Studio', path: '/artisan-workspace/quotes', icon: 'document-text-outline', section: 'Votre activité' },
  { key: 'agenda', label: 'Agenda', meta: 'Interventions personnelles', path: '/artisan-workspace/agenda', icon: 'calendar-outline', section: 'Votre activité' },
  { key: 'finance', label: 'Finance', meta: 'Encaissements et dépenses', path: '/artisan-workspace/finance', icon: 'wallet-outline', section: 'Votre activité' },
];
export function getShellDestinations(universe: ShellUniverse) {
  return universe === 'client' ? CLIENT_ITEMS : ARTISAN_ITEMS;
}
export function normalizeShellPath(path: string) {
  return path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
}
export function activeShellKey(universe: ShellUniverse, pathname: string, fallback = '') {
  return getShellDestinations(universe).find(item => item.path === normalizeShellPath(pathname))?.key ?? fallback;
}

export type ShellRouter = { dismissTo: (path: ShellPath) => void; push: (path: ShellPath) => void };
/** Drawer/root: pop to an existing destination, otherwise replace. Detail links
 * from a workspace retain its return path. Mission/notification intents are separate. */
export function navigateShell(router: ShellRouter, current: string, target: ShellPath, kind: 'switch' | 'detail' = 'switch') {
  if (normalizeShellPath(current) === target) return false;
  if (kind === 'detail') router.push(target);
  else router.dismissTo(target);
  return true;
}

export type ContextDockItem = {
  key: string; label: string; icon: ShellIcon; accessibilityLabel: string;
  selected?: boolean; disabled?: boolean; badge?: number; action: () => void;
};
export type ContextDockSpec = {
  universe: ShellUniverse; items: readonly ContextDockItem[]; hidden?: boolean;
  /** Four actions require an explicit, reviewable UX reason. W2 uses three. */
  fourActionReason?: string;
};
export function validateDockItems(items: readonly ContextDockItem[], fourActionReason?: string) {
  if (items.length > 4 || (items.length === 4 && !fourActionReason?.trim())) {
    throw new Error('FIXEO Context Dock: maximum 3 actions, or 4 with a UX reason.');
  }
  if (new Set(items.map(item => item.key)).size !== items.length) throw new Error('FIXEO Context Dock: duplicate action key.');
}
export function isDockVisible({ hidden = false, keyboardVisible = false, itemCount = 0 }) {
  return !hidden && !keyboardVisible && itemCount > 0;
}
export function dockBadgeLabel(badge?: number) {
  return badge && Number.isFinite(badge) && badge > 0 ? (badge > 99 ? '99+' : String(Math.floor(badge))) : '';
}
/** W2 intentionally opts in only the two workspace overviews. */
export function workspaceDockDestinations(universe: ShellUniverse, pathname: string) {
  const current = normalizeShellPath(pathname);
  const allowed = universe === 'client' ? '/client-workspace' : '/artisan-workspace';
  if (current !== allowed) return [];
  const keys = universe === 'client' ? ['rafi', 'history', 'alerts'] : ['cockpit', 'agenda', 'quotes'];
  return keys.map(key => getShellDestinations(universe).find(item => item.key === key)!);
}
/** Conservative first-layout reservation. Actual height replaces it on layout. */
export function dockMinimumHeight(fontScale: number) {
  const scale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  return Math.max(layout.floating.minHeight,
    interaction.minTarget + typography.caption.lineHeight * scale + space.xs * 2);
}

/** Keep at least three touch targets and their gaps available to page content. */
export function dockHasRoom(viewportHeight: number, topPadding: number, headerHeight: number, bottomReservation: number) {
  return viewportHeight - topPadding - headerHeight - bottomReservation >= interaction.minTarget * 3 + space.sm * 3;
}
