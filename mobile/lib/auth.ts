import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { disableCurrentDevice } from './push';

export type FixeoRole = 'client' | 'artisan' | 'admin';

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  try {
    await disableCurrentDevice();
  } catch {
    // Sign-out must remain available even if device cleanup is temporarily unavailable.
  }
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getStableSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  let session = data.session;
  if (!session) return null;

  const expiresAtMs = Number(session.expires_at || 0) * 1000;
  const shouldRefresh = expiresAtMs > 0 && expiresAtMs - Date.now() <= 60_000;

  if (shouldRefresh) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.data.session) {
      session = refreshed.data.session;
    } else if (expiresAtMs <= Date.now()) {
      throw refreshed.error || new Error('SESSION_REFRESH_FAILED');
    }
  }

  return session;
}

export async function resolveRole(userId?: string): Promise<FixeoRole> {
  const id = userId || (await getStableSession())?.user.id;
  if (!id) throw new Error('AUTH_REQUIRED');

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', id)
    .single();
  if (error) throw error;

  const role = String(data?.role || '');
  if (!['client', 'artisan', 'admin'].includes(role)) throw new Error('ROLE_INVALID');
  return role as FixeoRole;
}
