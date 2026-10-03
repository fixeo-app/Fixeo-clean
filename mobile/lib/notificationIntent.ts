import * as SecureStore from 'expo-secure-store';
import {
  normalizeNotificationIntent,
  type NotificationIntentData,
} from './notificationRouting';

export { notificationDestinationForRole } from './notificationRouting';

const PENDING_NOTIFICATION_KEY = 'fixeo_pending_notification_intent_v1';
const LAST_NOTIFICATION_RESPONSE_KEY = 'fixeo_last_notification_response_v1';
const MAX_PENDING_AGE_MS = 24 * 60 * 60 * 1000;

type StoredNotificationIntent = {
  data: NotificationIntentData;
  savedAt: number;
};

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
