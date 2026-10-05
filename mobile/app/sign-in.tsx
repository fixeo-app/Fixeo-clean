import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { AuthFrame, AuthField, AuthError, authStyles } from '@/components/AuthFrame';
import { FixeoAction } from '@/ui/FixeoAction';
import { loginAccount } from '@/lib/authFlows';
import { authIssue, type AuthIssue } from '@/lib/authContract';
import { useAuthState } from '@/lib/authSession';
export default function SignIn() {
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState<AuthIssue | null>(null);
  const state = useAuthState(); const { confirmed, reset } = useLocalSearchParams();
  async function submit() { if (busy || !email.trim() || !password) return; setBusy(true); setError(null);
    try { await loginAccount(email, password); } catch (e) { setError(authIssue(e)); } finally { setBusy(false); setPassword(''); }
  }
  return <AuthFrame title="Retrouvez votre espace." detail="Vos accès suffisent. FIXEO ouvre automatiquement votre espace Client ou Artisan.">
    {!!confirmed && <Text accessibilityLiveRegion="polite" style={authStyles.detail}>Votre email est confirmé. Vous pouvez vous connecter.</Text>}
    {!!reset && <Text accessibilityLiveRegion="polite" style={authStyles.detail}>Votre mot de passe a été changé. Connectez-vous avec le nouveau.</Text>}
    <AuthError issue={error || state.issue} />
    <AuthField label="Email" value={email} onChangeText={setEmail} autoComplete="email" keyboardType="email-address" editable={!busy} />
    <AuthField label="Mot de passe" secret value={password} onChangeText={setPassword} autoComplete="current-password" editable={!busy} returnKeyType="go" onSubmitEditing={() => void submit()} />
    <FixeoAction label="Me connecter" busy={busy} busyLabel="Vérification de vos accès…" disabled={!email.trim() || !password} onPress={() => void submit()} />
    <FixeoAction label="Mot de passe oublié ?" variant="ghost" onPress={() => router.push('/forgot-password')} />
    <FixeoAction label="Créer un compte" variant="ghost" onPress={() => router.push('/sign-up')} />
  </AuthFrame>;
}
