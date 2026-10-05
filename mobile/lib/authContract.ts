/** W6 presentation decisions only. Supabase and the canonical profile own identity. */
export type AuthIssue = 'credentials' | 'unconfirmed' | 'expired' | 'revoked' | 'disabled' | 'network' | 'rate_limit' | 'role' | 'callback' | 'unknown';
export function authIssue(error: unknown): AuthIssue {
  const e = error as { code?: string; message?: string; status?: number } | null;
  const text = `${e?.code || ''} ${e?.message || ''}`.toLowerCase();
  if (/over_email|rate_limit|too many/.test(text) || e?.status === 429) return 'rate_limit';
  if (/email_not_confirmed|email not confirmed/.test(text)) return 'unconfirmed';
  if (/user_banned|user_not_found|user.*deleted|banned/.test(text)) return 'disabled';
  if (/session_not_found|session_revoked|refresh_token_not_found|refresh_token_already_used|invalid refresh token/.test(text)) return 'revoked';
  if (/otp_expired|token.*expired|session_expired|bad_jwt/.test(text)) return 'expired';
  if (/invalid_credentials|invalid login credentials/.test(text)) return 'credentials';
  if (/role_invalid|identity_incomplete|unsupported_mobile_role/.test(text)) return 'role';
  if (/callback|flow_state|code_verifier|pkce/.test(text)) return 'callback';
  if (/network|fetch|timeout|abort|failed to fetch/.test(text)) return 'network';
  return 'unknown';
}
export const authCopy: Record<AuthIssue, { title: string; detail: string }> = {
  credentials: { title: 'Vérifiez vos accès.', detail: 'L’email ou le mot de passe est incorrect.' },
  unconfirmed: { title: 'Votre email reste à confirmer.', detail: 'Ouvrez l’email de confirmation, puis revenez vous connecter.' },
  expired: { title: 'Votre session a expiré.', detail: 'Reconnectez-vous pour continuer.' },
  revoked: { title: 'Votre session a été fermée.', detail: 'Reconnectez-vous pour retrouver votre espace.' },
  disabled: { title: 'Ce compte n’est pas accessible.', detail: 'Vérifiez votre compte avant de vous reconnecter.' },
  network: { title: 'La connexion se fait attendre.', detail: 'Votre espace reste protégé. Vérifiez votre réseau, puis réessayez.' },
  rate_limit: { title: 'Un peu de patience.', detail: 'Le service limite temporairement les envois. Réessayez plus tard.' },
  role: { title: 'Votre espace doit être vérifié.', detail: 'Nous ne pouvons pas encore vous diriger vers un espace. Réessayez ou déconnectez-vous.' },
  callback: { title: 'Ce lien ne peut pas être ouvert ici.', detail: 'Revenez sur l’appareil où vous avez fait la demande, ou demandez un nouveau lien.' },
  unknown: { title: 'Cette action n’a pas abouti.', detail: 'Réessayez dans quelques instants.' },
};

export function assertCallbackUrl(value: string | undefined): string {
  if (!value) throw new Error('AUTH_CALLBACK_NOT_CONFIGURED');
  let url: URL; try { url = new URL(value); } catch { throw new Error('AUTH_CALLBACK_INVALID'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[)/.test(url.hostname) ||
      /(^|\.)fixeo\.ma$/i.test(url.hostname) || url.pathname !== '/auth-callback') {
    throw new Error('AUTH_CALLBACK_INVALID');
  }
  return url.toString();
}

export type CallbackInput = { code: string; error: AuthIssue | null; legacyTokenRejected: boolean };
/** Never return, exchange or display a bearer token from a legacy URL. */
export function parseAuthCallback(value: string, expectedUrl?: string): CallbackInput {
  const bad = { code: '', error: 'callback' as AuthIssue, legacyTokenRejected: false };
  try {
    const u = new URL(value);
    if (u.protocol === 'https:' && expectedUrl && u.origin !== new URL(assertCallbackUrl(expectedUrl)).origin) return bad;
    if (!((u.protocol === 'https:' && u.pathname === '/auth-callback') ||
      (u.protocol === 'fixeo:' && !u.username && !u.password && !u.port &&
        ((u.hostname === 'auth-callback' && (!u.pathname || u.pathname === '/')) || (!u.hostname && u.pathname === '/auth-callback'))))) return bad;
    const fragment = new URLSearchParams(u.hash.slice(1));
    if (['access_token', 'refresh_token'].some(k => u.searchParams.has(k) || fragment.has(k)))
      return { ...bad, legacyTokenRejected: true };
    if (u.searchParams.has('error') || fragment.has('error')) {
      const code = u.searchParams.get('error_code') || fragment.get('error_code') || '';
      return { ...bad, error: /expired/.test(code) ? 'expired' : 'callback' };
    }
    const code = u.searchParams.get('code') || '';
    return /^[A-Za-z0-9_-]{10,512}$/.test(code) ? { code, error: null, legacyTokenRejected: false } : bad;
  } catch { return bad; }
}

export type MobileRole = 'client' | 'artisan' | 'admin';
export type AuthPhase = 'unknown' | 'resolving' | 'signed_out' | 'ready' | 'onboarding' | 'recovery' | 'blocked';
export type AuthSnapshot = { phase: AuthPhase; userId: string | null; role: MobileRole | null; issue: AuthIssue | null; epoch: number };
/** An identity transition invalidates all in-flight publications before any await. */
export function createAuthState() {
  let state: AuthSnapshot = { phase: 'unknown', userId: null, role: null, issue: null, epoch: 0 };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(fn => fn());
  return {
    snapshot: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    invalidate(phase: AuthPhase = 'resolving', issue: AuthIssue | null = null) {
      state = { phase, userId: null, role: null, issue, epoch: state.epoch + 1 }; emit(); return state.epoch;
    },
    publish(epoch: number, next: Omit<AuthSnapshot, 'epoch'>) {
      if (epoch !== state.epoch) return false;
      state = { ...next, epoch }; emit(); return true;
    },
    isCurrent(epoch: number) { return epoch === state.epoch; },
  };
}
export function routeAllowed(path: string, state: AuthSnapshot) {
  if (['/entry', '/sign-in', '/sign-up', '/forgot-password', '/auth-callback'].includes(path)) return true;
  if (path === '/reset-password') return state.phase === 'recovery';
  if (path === '/complete-profile') return state.phase === 'onboarding' && state.role === 'artisan';
  if (state.phase !== 'ready') return false;
  return state.role === 'client'
    ? path === '/' || /^\/client-(workspace|mission)(\/|$)/.test(path)
    : state.role === 'artisan' && (path === '/artisan' || /^\/(artisan-workspace|mission)(\/|$)/.test(path));
}
