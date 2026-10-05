import { useState } from 'react';
import { router } from 'expo-router';
import { AuthFrame, AuthField, AuthError } from '@/components/AuthFrame';
import { FixeoAction } from '@/ui/FixeoAction';
import { requestRecovery } from '@/lib/authFlows';
import { authIssue, type AuthIssue } from '@/lib/authContract';
export default function ForgotPassword() {
  const [email, setEmail] = useState(''), [sent, setSent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<AuthIssue | null>(null);
  async function submit() { if (busy) return; setBusy(true); setError(null); try { await requestRecovery(email); setSent(true); } catch (e) { setError(authIssue(e)); } finally { setBusy(false); } }
  return <AuthFrame back="/sign-in" title={sent ? 'Consultez votre messagerie.' : 'Retrouvons vos accès.'} detail={sent ? 'Si un compte correspond à cet email, vous recevrez un lien. Ouvrez-le sur l’appareil où vous avez fait la demande.' : 'Saisissez l’email de votre compte pour choisir un nouveau mot de passe.'}>
    <AuthError issue={error} />
    {!sent && <><AuthField label="Email" value={email} onChangeText={setEmail} autoComplete="email" keyboardType="email-address" editable={!busy} onSubmitEditing={() => void submit()} />
    <FixeoAction label="Recevoir un lien" busy={busy} busyLabel="Demande en cours…" disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())} onPress={() => void submit()} /></>}
    <FixeoAction label="Retour à la connexion" variant={sent ? 'primary' : 'ghost'} onPress={() => router.replace('/sign-in')} />
  </AuthFrame>;
}
