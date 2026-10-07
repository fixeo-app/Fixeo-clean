import { clearClientDrafts } from './clientDrafts';
import { AppState } from 'react-native';
import { useSyncExternalStore } from 'react';
import { supabase, startSupabaseAuthLifecycle } from './supabase';
import { resolveRole } from './auth';
import { withMobileDeadline } from './mobileResilience';
import { onSessionRejected } from './authEvents';
import { clearPrivateNotificationState } from './notificationIntent';
import { authIssue, createAuthState, type AuthIssue } from './authContract';

export const authState = createAuthState();
export const useAuthState = () => useSyncExternalStore(authState.subscribe, authState.snapshot, authState.snapshot);
let recovery = false;
let users = 0;
let teardown: (() => void) | undefined;
let operation: { epoch: number; promise: Promise<void> } | null = null;
let expectedId: string | null = null;

export function beginAuthOperation() {
  recovery = false;
  expectedId = null;
  return authState.invalidate();
}
export function clearAuthPresentation(issue: AuthIssue | null = null) {
  recovery = false;
  expectedId = null;
  authState.invalidate('signed_out', issue);
  clearClientDrafts();
  void clearPrivateNotificationState().catch(() => undefined);
}
export function enterPasswordRecovery() {
  recovery = true;
  const epoch = authState.invalidate('recovery');
  return epoch;
}
export function isPasswordRecovery() { return recovery; }

export async function resolveAuthSession(refresh = false): Promise<void> {
  if (recovery) return;
  if (operation && authState.isCurrent(operation.epoch)) return operation.promise;
  const before = authState.snapshot();
  const preserving = refresh && before.phase === 'ready' && !!before.userId && !!before.role;
  const epoch = (preserving ? authState.revalidate() : null) ?? authState.invalidate();
  const task = async () => {
    try {
      const current = await withMobileDeadline(supabase.auth.getSession());
      if (!authState.isCurrent(epoch)) return;
      if (current.error) throw current.error;
      if (!current.data.session) {
        authState.publish(epoch, { phase: 'signed_out', userId: null, role: null, issue: null }); return;
      }
      expectedId = current.data.session.user.id;
      if (preserving && expectedId !== before.userId) throw new Error('SESSION_REVOKED');
      if (refresh) {
        const renewed = await withMobileDeadline(supabase.auth.refreshSession());
        if (!authState.isCurrent(epoch)) return;
        if (renewed.error) throw renewed.error;
        if (!renewed.data.session) throw new Error('SESSION_REVOKED');
      }
      const verified = await withMobileDeadline(supabase.auth.getUser());
      if (!authState.isCurrent(epoch)) return;
      if (verified.error) throw verified.error;
      const id = verified.data.user?.id;
      if (!id) throw new Error('SESSION_REVOKED');
      if (id !== expectedId) throw new Error('SESSION_REVOKED');
      const role = await withMobileDeadline(resolveRole(id));
      if (!authState.isCurrent(epoch)) return;
      if (preserving && role !== before.role) throw new Error('ROLE_INVALID');
      if (role === 'admin') throw new Error('UNSUPPORTED_MOBILE_ROLE');
      let onboarding = false;
      if (role === 'artisan') {
        const profile = await withMobileDeadline(supabase.from('artisans').select('id').eq('owner_user_id', id).maybeSingle());
        if (profile.error) throw profile.error;
        onboarding = !profile.data?.id;
      }
      if (!authState.isCurrent(epoch)) return;
      if (!preserving) await clearPrivateNotificationState();
      authState.publish(epoch, { phase: onboarding ? 'onboarding' : 'ready', userId: id, role, issue: null });
    } catch (error) {
      if (!authState.isCurrent(epoch)) return;
      const issue = authIssue(error);
      if (preserving && ['network', 'rate_limit', 'unknown'].includes(issue)) {
        // The veil stays closed; only retry/logout are exposed. No unsaved
        // intake or media is discarded because the network is unavailable.
        authState.publish(epoch, { phase: 'ready', userId: before.userId, role: before.role, issue, revalidating: false });
        return;
      }
      authState.publish(epoch, { phase: ['revoked', 'expired', 'disabled'].includes(issue) ? 'signed_out' : 'blocked', userId: null, role: null, issue });
      if (['revoked', 'expired', 'disabled'].includes(issue)) {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
        if (authState.snapshot().phase === 'signed_out') clearAuthPresentation(issue);
      }
    }
  };
  const promise = task().finally(() => { if (operation?.epoch === epoch) operation = null; });
  operation = { epoch, promise };
  return promise;
}

/** Registered once, before any private screen mounts. Never await Auth in its callback. */
export function startAuthOwner() {
  if (++users === 1) {
    const stopLifecycle = startSupabaseAuthLifecycle();
    const auth = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { enterPasswordRecovery(); return; }
      if (event === 'SIGNED_OUT') {
        const before = authState.snapshot();
        clearAuthPresentation(before.issue || (['ready', 'resolving'].includes(before.phase) ? 'expired' : null)); return;
      }
      if (recovery) return;
      if (event === 'SIGNED_IN' && session?.user.id !== (authState.snapshot().userId || expectedId)) {
        // Synchronous invalidation prevents a previous account flashing during async resolution.
        authState.invalidate();
        expectedId = session?.user.id || null;
        setTimeout(() => { void resolveAuthSession(); }, 0);
      }
    }).data.subscription;
    const rejected = onSessionRejected(reason => clearAuthPresentation(reason === 'logout' ? null : 'revoked'));
    const foreground = AppState.addEventListener('change', state => {
      if (state === 'active' && !recovery) void resolveAuthSession(true);
    });
    void resolveAuthSession(true);
    teardown = () => { auth.unsubscribe(); rejected(); foreground.remove(); stopLifecycle(); };
  }
  return () => { if (--users === 0) { teardown?.(); teardown = undefined; } };
}
