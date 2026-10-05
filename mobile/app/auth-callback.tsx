import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { AuthFrame, AuthError } from '@/components/AuthFrame';
import { FixeoAction } from '@/ui/FixeoAction';
import { consumeAuthCallback } from '@/lib/authFlows';
import { authIssue, parseAuthCallback, type AuthIssue } from '@/lib/authContract';
import { hasCallbackVerifier } from '@/lib/supabase';

export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [error, setError] = useState<AuthIssue | null>(null); const started = useRef<string | null>(null);
  const [nativeReturn, setNativeReturn] = useState<string | null>(null);
  useEffect(() => {
    const attempt = Platform.OS === 'web' ? 'web' : code || 'missing';
    if (started.current === attempt) return; started.current = attempt;
    // Remove credentials/codes before any network request, error rendering or navigation.
    const initial = Platform.OS === 'web' ? (globalThis as any).__FIXEO_AUTH_CALLBACK || globalThis.location?.href : null;
    delete (globalThis as any).__FIXEO_AUTH_CALLBACK;
    if (Platform.OS === 'web') globalThis.history?.replaceState(null, '', '/auth-callback');
    async function finish() {
      try {
        const url = initial || (typeof code === 'string' ? 'fixeo://auth-callback?code=' + encodeURIComponent(code) : null);
        if (!url) throw new Error('AUTH_CALLBACK_INVALID');
        const parsed = parseAuthCallback(url);
        if (Platform.OS === 'web' && !parsed.error && !(await hasCallbackVerifier())) {
          setNativeReturn('fixeo://auth-callback?code=' + encodeURIComponent(parsed.code));
          setError('callback'); return;
        }
        const kind = await consumeAuthCallback(url);
        router.replace(kind === 'recovery' ? '/reset-password' : '/sign-in?confirmed=1');
      } catch (e) { setError(authIssue(e)); }
    }
    void finish();
  }, [code]);
  return <AuthFrame back={false} title={error ? 'Reprenons sereinement.' : 'Vérification de votre lien.'} detail={error ? 'Votre espace reste protégé.' : 'Un instant, nous vérifions votre accès.'}>
    <AuthError issue={error} />
    {nativeReturn && <FixeoAction label="Ouvrir dans l’application FIXEO" onPress={() => void Linking.openURL(nativeReturn).catch(() => setError('callback'))} />}
    {error && <FixeoAction label="Retour à la connexion" onPress={() => router.replace('/sign-in')} />}
  </AuthFrame>;
}
