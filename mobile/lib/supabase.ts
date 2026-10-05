import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

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

const storage = {
  getItem: (keyName: string) => SecureStore.getItemAsync(keyName),
  setItem: (keyName: string, value: string) => SecureStore.setItemAsync(keyName, value),
  removeItem: (keyName: string) => SecureStore.deleteItemAsync(keyName),
};

export const supabase = createClient(url, key, {
  auth: {
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
