import { useState } from 'react';
import { router } from 'expo-router';
import { AuthFrame, AuthField, AuthError } from '@/components/AuthFrame';
import { FixeoAction } from '@/ui/FixeoAction';
import { saveRecoveredPassword } from '@/lib/authFlows';
import { authIssue, type AuthIssue } from '@/lib/authContract';
export default function ResetPassword() {
  const [password, setPassword] = useState(''), [repeat, setRepeat] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState<AuthIssue | null>(null);
  async function submit() { if (busy || password !== repeat || password.length < 8) return; setBusy(true); setError(null);
    try { await saveRecoveredPassword(password); router.replace('/sign-in?reset=1'); } catch (e) { setError(authIssue(e)); } finally { setBusy(false); setPassword(''); setRepeat(''); } }
  return <AuthFrame back={false} title="Un nouveau départ." detail="Choisissez un nouveau mot de passe. Vous vous reconnecterez ensuite à votre espace.">
    <AuthError issue={error} />
    <AuthField label="Nouveau mot de passe · 8 caractères minimum" secret value={password} onChangeText={setPassword} autoComplete="new-password" editable={!busy} />
    <AuthField label="Confirmer le mot de passe" secret value={repeat} onChangeText={setRepeat} autoComplete="new-password" editable={!busy} onSubmitEditing={() => void submit()} />
    <FixeoAction label="Enregistrer mon mot de passe" busy={busy} busyLabel="Enregistrement…" disabled={password.length < 8 || password !== repeat} onPress={() => void submit()} />
  </AuthFrame>;
}
