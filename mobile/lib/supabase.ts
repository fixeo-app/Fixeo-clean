import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { rejectPrivateSession } from './authEvents';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const appEnv = process.env.EXPO_PUBLIC_APP_ENV || 'staging';
const GATE_AB_STAGING_REF = 'kqyhusnbybsukbcaoqtu';

if (!url || !key) {
  throw new Error('FIXEO Mobile staging environment is not configured');
}

const projectRef = /^https:\/\/([^.]+)\.supabase\.co/i.exec(url)?.[1] || '';

if (appEnv !== 'staging') {
  throw new Error('FIXEO Gate A/B candidate is staging-only');
}
if (projectRef !== GATE_AB_STAGING_REF) {
  throw new Error('FIXEO Gate A/B staging lock rejected this Supabase project');
}
if (!/^sb_publishable_/i.test(key)) {
  throw new Error('FIXEO Mobile requires a publishable Supabase key');
}

const webStorage = (name: string) => name.endsWith('-code-verifier') ? globalThis.localStorage : globalThis.sessionStorage;
const storage = {
  getItem: async (keyName: string) => Platform.OS === 'web' ? webStorage(keyName)?.getItem(keyName) ?? null : SecureStore.getItemAsync(keyName),
  setItem: async (keyName: string, value: string) => { if (Platform.OS === 'web') webStorage(keyName)?.setItem(keyName, value); else await SecureStore.setItemAsync(keyName, value); },
  removeItem: async (keyName: string) => { if (Platform.OS === 'web') webStorage(keyName)?.removeItem(keyName); else await SecureStore.deleteItemAsync(keyName); },
};
export async function hasCallbackVerifier() {
  return !!(await storage.getItem(`sb-${GATE_AB_STAGING_REF}-auth-token-code-verifier`));
}
export async function discardLocalAuthStorage() {
  await Promise.all(['', '-user', '-code-verifier'].map(suffix => storage.removeItem(`sb-${GATE_AB_STAGING_REF}-auth-token${suffix}`)));
}

const nativeFetch = globalThis.fetch.bind(globalThis);
async function guardedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  init?.signal?.addEventListener('abort', abort, { once: true });
  if (init?.signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 15000);
  let response: Response;
  try { response = await nativeFetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); init?.signal?.removeEventListener('abort', abort); }
  const path = String(input);
  if (path.includes('/auth/v1/token') && response.status >= 400 && response.status < 500) {
    const body = await response.clone().json().catch(() => null);
    if (/refresh_token_not_found|refresh_token_already_used|session_not_found/.test(String(body?.code || ''))) rejectPrivateSession();
  }
  if (!path.includes('/auth/v1/') && (response.status === 401 || response.status === 403)) {
    const body = await response.clone().json().catch(() => null);
    if (response.status === 401 || /SESSION_REVOKED|session_not_found|JWT expired/.test(String(body?.message || body?.code || '')))
      rejectPrivateSession();
  }
  return response;
}

export const supabase = createClient(url, key, {
  global: { fetch: guardedFetch },
  auth: {
    flowType: 'pkce',
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});


export function startSupabaseAuthLifecycle() {
  if (Platform.OS === 'web') return () => undefined;

  if (AppState.currentState === 'active') {
    supabase.auth.startAutoRefresh();
  }

  const subscription = AppState.addEventListener('change', state => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });

  return () => {
    subscription.remove();
    supabase.auth.stopAutoRefresh();
  };
}
