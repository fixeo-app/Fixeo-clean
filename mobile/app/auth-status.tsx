import { AuthFrame, AuthError } from '@/components/AuthFrame';
import { FixeoAction } from '@/ui/FixeoAction';
import { resolveAuthSession, useAuthState } from '@/lib/authSession';
import { signOut } from '@/lib/auth';
export default function AuthStatus() {
  const state = useAuthState(); const busy = state.phase === 'resolving' || state.phase === 'unknown';
  return <AuthFrame back={false} title={busy ? 'Un instant pour vous retrouver.' : 'Votre espace reste protégé.'} detail={busy ? 'Vérification de votre session et de votre espace.' : 'Nous avons besoin de vérifier vos accès avant de continuer.'}>
    <AuthError issue={state.issue} />
    {!busy && <><FixeoAction label="Réessayer" onPress={() => void resolveAuthSession(true)} /><FixeoAction label="Me déconnecter" variant="ghost" onPress={() => void signOut().catch(() => undefined)} /></>}
  </AuthFrame>;
}
