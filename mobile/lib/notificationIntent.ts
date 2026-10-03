import * as SecureStore from 'expo-secure-store';
import type { FixeoRole } from './auth';

const PENDING_NOTIFICATION_KEY = 'fixeo_pending_notification_intent_v1';
const LAST_NOTIFICATION_RESPONSE_KEY = 'fixeo_last_notification_response_v1';
const MAX_PENDING_AGE_MS = 24 * 60 * 60 * 1000;

export type NotificationIntentData = {
  screen?: string;
  mission_id?: string;
  request_id?: string;
};

export type NotificationDestination = {
  pathname: string;
  params?: Record<string, string>;
};

type StoredNotificationIntent = {
  data: NotificationIntentData;
  savedAt: number;
};

export function normalizeNotificationIntent(
  input: Record<string, unknown> | null | undefined,
): NotificationIntentData {
  return {
    screen: String(input?.screen || '').trim().toLowerCase(),
    mission_id: String(input?.mission_id || '').trim(),
    request_id: String(input?.request_id || '').trim(),
  };
}

function roleHome(role: FixeoRole): NotificationDestination | null {
  if (role === 'client') return { pathname: '/' };
  if (role === 'artisan') return { pathname: '/artisan' };
  return null;
}

export function notificationDestinationForRole(
  data: NotificationIntentData,
  role: FixeoRole,
): NotificationDestination | null {
  if (role === 'admin') return null;

  const screen = String(data.screen || '').replace(/_/g, '-');
  const missionId = String(data.mission_id || '');

  const artisanMission = ['artisan-mission', 'mission-artisan'].includes(screen);
  const clientMission = ['client-mission', 'mission-client'].includes(screen);

  if (role === 'artisan') {
    if (clientMission) return roleHome(role);
    if ((artisanMission || (!screen && missionId)) && missionId) {
      return {
        pathname: '/mission/[id]',
        params: { id: missionId },
      };
    }
    if (screen === 'artisan-workspace') return { pathname: '/artisan-workspace' };
    if (screen === 'artisan-agenda') return { pathname: '/artisan-workspace/agenda' };
    if (screen === 'artisan' || screen === 'opportunity' || screen === 'opportunities') {
      return { pathname: '/artisan' };
    }
    return roleHome(role);
  }

  if (artisanMission) return roleHome(role);
  if ((clientMission || (!screen && missionId)) && missionId) {
    return {
      pathname: '/client-mission/[id]',
      params: { id: missionId },
    };
  }
  if (screen === 'client-workspace') return { pathname: '/client-workspace' };
  if (screen === 'client-alerts' || screen === 'alerts') {
    return { pathname: '/client-workspace/notifications' };
  }
  if (screen === 'client') return { pathname: '/' };
  return roleHome(role);
}

export async function persistPendingNotificationIntent(
  input: Record<string, unknown> | null | undefined,
) {
  const value: StoredNotificationIntent = {
    data: normalizeNotificationIntent(input),
    savedAt: Date.now(),
  };
  await SecureStore.setItemAsync(PENDING_NOTIFICATION_KEY, JSON.stringify(value));
}

export async function consumePendingNotificationIntent(): Promise<NotificationIntentData | null> {
  const raw = await SecureStore.getItemAsync(PENDING_NOTIFICATION_KEY);
  if (!raw) return null;

  await SecureStore.deleteItemAsync(PENDING_NOTIFICATION_KEY).catch(() => undefined);

  try {
    const value = JSON.parse(raw) as StoredNotificationIntent;
    if (!value?.savedAt || Date.now() - value.savedAt > MAX_PENDING_AGE_MS) return null;
    return normalizeNotificationIntent(value.data as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function shouldHandleNotificationResponse(responseId: string) {
  if (!responseId) return true;

  const previous = await SecureStore.getItemAsync(LAST_NOTIFICATION_RESPONSE_KEY);
  if (previous === responseId) return false;

  await SecureStore.setItemAsync(LAST_NOTIFICATION_RESPONSE_KEY, responseId);
  return true;
}
