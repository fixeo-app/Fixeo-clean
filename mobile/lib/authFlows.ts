import { canonicalCities } from './clientLocation';
import { supabase } from './supabase';
import { assertCallbackUrl, parseAuthCallback } from './authContract';
import { beginAuthOperation, clearAuthPresentation, enterPasswordRecovery, isPasswordRecovery, resolveAuthSession } from './authSession';
import { withMobileDeadline } from './mobileResilience';

export function callbackDestination() {
  // No implicit Site URL fallback, no Production URL and no inferred preview hostname.
  return assertCallbackUrl(process.env.EXPO_PUBLIC_AUTH_CALLBACK_URL);
}
function emailCallbackDestination() {
  // A syntactically valid URL can still fall back to Supabase's Site URL if it
  // is absent from the server allowlist. Certification must verify that first.
  if (process.env.EXPO_PUBLIC_AUTH_CALLBACK_APPROVED !== 'true') throw new Error('AUTH_CALLBACK_NOT_APPROVED');
  return callbackDestination();
}
let signupFlight: Promise<{ email: string }> | null = null;
export function createAccount(input: { role: 'client' | 'artisan'; name: string; email: string; password: string; phone?: string }) {
  if (signupFlight) return signupFlight;
  signupFlight = (async () => {
    const emailRedirectTo = emailCallbackDestination();
    const email = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || input.name.trim().length < 3 || input.password.length < 8)
      throw new Error('FORM_INVALID');
    // Role is an initial signup request only. The server trigger limits it and persists authority.
    const result = await supabase.auth.signUp({ email, password: input.password, options: {
      emailRedirectTo, data: { full_name: input.name.trim(), role: input.role, phone: input.phone?.trim() || null },
    } });
    if (result.error) throw result.error;
    if (!result.data.user) throw new Error('SIGNUP_FAILED');
    if (result.data.session) await resolveAuthSession();
    return { email };
  })().finally(() => { signupFlight = null; });
  return signupFlight;
}

export async function loginAccount(email: string, password: string) {
  beginAuthOperation();
  try {
    const result = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (result.error) throw result.error;
    await resolveAuthSession();
  } catch (error) { clearAuthPresentation(); throw error; }
}
let recoveryFlight: Promise<void> | null = null;
export function requestRecovery(email: string) {
  if (recoveryFlight) return recoveryFlight;
  recoveryFlight = (async () => {
    const redirectTo = emailCallbackDestination();
    const result = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
    if (result.error) throw result.error;
  })().finally(() => { recoveryFlight = null; });
  return recoveryFlight;
}

const consumedCodes = new Map<string, Promise<'signup' | 'recovery'>>();
export function consumeAuthCallback(url: string) {
  const input = parseAuthCallback(url, callbackDestination());
  if (input.error) return Promise.reject(new Error(input.error === 'expired' ? 'OTP_EXPIRED' : 'AUTH_CALLBACK_INVALID'));
  if (consumedCodes.has(input.code)) return consumedCodes.get(input.code)!;
  const task = (async () => {
    // Stop identity resolution until the Auth recovery event has been delivered.
    enterPasswordRecovery();
    let recoveryEvent = false;
    const listener = supabase.auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY') recoveryEvent = true; }).data.subscription;
    try {
      const result = await supabase.auth.exchangeCodeForSession(input.code);
      if (result.error) throw result.error;
      if (!result.data.session) throw new Error('AUTH_CALLBACK_INVALID');
      // The SDK emits recovery from the original PKCE verifier, never a URL role/type hint.
      const kind = recoveryEvent ? 'recovery' : 'signup';
      if (kind === 'recovery') return 'recovery' as const;
      await supabase.auth.signOut({ scope: 'local' });
      clearAuthPresentation();
      return 'signup' as const;
    } catch (error) { clearAuthPresentation(); throw error; }
    finally { listener.unsubscribe(); }
  })();
  consumedCodes.set(input.code, task);
  // Retain no bearer token; clear the single-use authorization code after completion.
  void task.finally(() => consumedCodes.delete(input.code)).catch(() => undefined);
  return task;
}

export async function saveRecoveredPassword(password: string) {
  if (!isPasswordRecovery()) throw new Error('AUTH_CALLBACK_INVALID');
  if (password.length < 8) throw new Error('PASSWORD_TOO_SHORT');
  const user = await supabase.auth.getUser();
  if (user.error || !user.data.user) throw user.error || new Error('SESSION_REVOKED');
  const changed = await supabase.auth.updateUser({ password });
  if (changed.error) throw changed.error;
  const ended = await supabase.auth.signOut();
  if (ended.error) throw ended.error;
  clearAuthPresentation();
}

let artisanFlight: Promise<void> | null = null;
export function finishArtisan(input: { name: string; phone: string; services: string[]; cities: string[]; available: boolean }) {
  if (artisanFlight) return artisanFlight;
  artisanFlight = (async () => {
    const me = await supabase.auth.getUser();
    if (me.error || !me.data.user) throw me.error || new Error('AUTH_REQUIRED');
    const authority = await supabase.from('users').select('role').eq('id', me.data.user.id).single();
    if (authority.error || authority.data?.role !== 'artisan') throw new Error('ROLE_INVALID');
    const result = await supabase.rpc('finalize_artisan_signup_v1', {
      p_full_name: input.name.trim(), p_phone: input.phone.trim(), p_services: input.services, p_cities: canonicalCities(input.cities),
    });
    if (result.error || result.data?.ok !== true) throw result.error || new Error('ARTISAN_PROFILE_INCOMPLETE');
    if (input.available) {
      const completed = await supabase.rpc('complete_artisan_onboarding');
      if (completed.error || completed.data?.ok !== true) throw completed.error || new Error('ARTISAN_ONBOARDING_INCOMPLETE');
    }
    const persisted = await withMobileDeadline(supabase.from('artisans').select('id,owner_user_id').eq('owner_user_id', me.data.user.id).single());
    if (persisted.error || !persisted.data?.id) throw new Error('IDENTITY_INCOMPLETE');
    await resolveAuthSession();
  })().finally(() => { artisanFlight = null; });
  return artisanFlight;
}
