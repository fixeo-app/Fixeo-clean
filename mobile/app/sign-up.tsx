import { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { AuthFrame, AuthField, AuthError, authStyles } from '@/components/AuthFrame';
import { FixeoAction } from '@/ui/FixeoAction';
import { createAccount } from '@/lib/authFlows';
import { authIssue, type AuthIssue } from '@/lib/authContract';
export default function SignUp() {
  const [role, setRole] = useState<'client' | 'artisan' | null>(null);
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState<AuthIssue | null>(null);
  const valid = name.trim().length >= 3 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && password.length >= 8;
  async function submit() { if (busy || !role || !valid) return; setBusy(true); setError(null);
    try { await createAccount({ name, email, password, role }); setPassword(''); setSent(true); } catch (e) { setError(authIssue(e)); } finally { setBusy(false); }
  }
  if (sent) return <AuthFrame title="Vérifiez votre email." detail="Si votre inscription est nouvelle, un email de confirmation vous attend. Ouvrez-le sur l’appareil où vous avez commencé.">
    <Text style={authStyles.detail}>Après confirmation, revenez vous connecter. Si ce compte existe déjà, utilisez vos accès habituels.</Text>
    <FixeoAction label="Aller à la connexion" onPress={() => router.replace('/sign-in')} />
  </AuthFrame>;
  if (!role) return <AuthFrame title="Un espace pour vous." detail="Comment souhaitez-vous utiliser FIXEO ? Ce choix sert à créer votre compte.">
    <FixeoAction label="Client · Trouver une solution chez moi" onPress={() => setRole('client')} />
    <FixeoAction label="Artisan · Développer mon activité" variant="secondary" onPress={() => setRole('artisan')} />
    <FixeoAction label="J’ai déjà un compte" variant="ghost" onPress={() => router.replace('/sign-in')} />
  </AuthFrame>;
  return <AuthFrame title={role === 'client' ? 'Votre maison a son allié.' : 'Votre savoir-faire, votre espace.'} detail={role === 'client' ? 'Créez votre compte Client. RAFI vous accompagne ensuite dans votre première demande.' : 'Créez vos accès Artisan. Après confirmation, vous renseignerez vos services et votre ville.'}>
    <AuthError issue={error} />
    <AuthField label="Nom complet" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" editable={!busy} />
    <AuthField label="Email" value={email} onChangeText={setEmail} autoComplete="email" keyboardType="email-address" editable={!busy} />
    <AuthField label="Mot de passe · 8 caractères minimum" secret value={password} onChangeText={setPassword} autoComplete="new-password" editable={!busy} onSubmitEditing={() => void submit()} />
    <FixeoAction label="Créer mon compte" busy={busy} busyLabel="Création en cours…" disabled={!valid} onPress={() => void submit()} />
    <FixeoAction label="Changer de type de compte" disabled={busy} variant="ghost" onPress={() => { setRole(null); setError(null); }} />
  </AuthFrame>;
}
