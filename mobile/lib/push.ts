import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import { privateSessionGeneration } from './authEvents';

const INSTALLATION_KEY = 'fixeo_mobile_installation_id_v1';
const PUSH_ENABLED_KEY = 'fixeo_mobile_push_enabled_v1';

export type PushRegistrationResult =
  | { ok: true; token: string }
  | {
      ok: false;
      reason:
        | 'unsupported_platform'
        | 'physical_device_required'
        | 'permission_denied'
        | 'eas_project_id_missing'
        | 'token_unavailable'
        | 'registry_failed'
        | 'timeout';
    };

async function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('PUSH_TIMEOUT')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function getInstallationId() {
  const existing = await SecureStore.getItemAsync(INSTALLATION_KEY);
  if (existing) return existing;
  const created = Crypto.randomUUID();
  await SecureStore.setItemAsync(INSTALLATION_KEY, created);
  return created;
}

function getEasProjectId() {
  return (
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId ||
    ''
  );
}

export async function registerCurrentDeviceForPush(requestPermission = true): Promise<PushRegistrationResult> {
  const generation = privateSessionGeneration();
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return { ok: false, reason: 'unsupported_platform' };
  }
  if (!Device.isDevice) {
    return { ok: false, reason: 'physical_device_required' };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('fixeo-opportunities', {
      name: 'Opportunités FIXEO',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted' && requestPermission) {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') {
    return { ok: false, reason: 'permission_denied' };
  }

  const projectId = getEasProjectId();
  if (!projectId) {
    return { ok: false, reason: 'eas_project_id_missing' };
  }

  let token = '';
  try {
    token = (await withTimeout(
      Notifications.getExpoPushTokenAsync({ projectId }),
      12_000,
    )).data;
  } catch (error: any) {
    return {
      ok: false,
      reason: String(error?.message || '') === 'PUSH_TIMEOUT' ? 'timeout' : 'token_unavailable',
    };
  }
  if (!token) return { ok: false, reason: 'token_unavailable' };

  const installationId = await getInstallationId();
  if (generation !== privateSessionGeneration()) return { ok: false, reason: 'registry_failed' };
  let registry: any;
  try {
    registry = await withTimeout(
      supabase.rpc('register_mobile_device_v1', {
        p_installation_id: installationId,
        p_platform: Platform.OS,
        p_expo_push_token: token,
        p_device_model: Device.modelName || Device.deviceName || null,
        p_app_version: Constants.expoConfig?.version || null,
      }),
      12_000,
    );
  } catch (error: any) {
    return {
      ok: false,
      reason: String(error?.message || '') === 'PUSH_TIMEOUT' ? 'timeout' : 'registry_failed',
    };
  }

  const { data, error } = registry || {};
  if (error || !data || data.ok !== true) {
    return { ok: false, reason: 'registry_failed' };
  }

  if (generation !== privateSessionGeneration()) return { ok: false, reason: 'registry_failed' };
  await SecureStore.setItemAsync(PUSH_ENABLED_KEY, '1').catch(() => undefined);
  return { ok: true, token };
}

export async function isCurrentDevicePushEnabled() {
  if (Platform.OS === 'web') return false;
  try {
    const permission = await Notifications.getPermissionsAsync();
    return permission.status === 'granted';
  } catch {
    return false;
  }
}

export async function disableCurrentDevice() {
  if (Platform.OS === 'web') return;
  const installationId = await SecureStore.getItemAsync(INSTALLATION_KEY);
  await SecureStore.deleteItemAsync(PUSH_ENABLED_KEY).catch(() => undefined);
  if (!installationId) return;
  await supabase.rpc('disable_mobile_device_v1', {
    p_installation_id: installationId,
  });
}

export function configureForegroundNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}
