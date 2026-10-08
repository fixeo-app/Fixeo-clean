import { router } from 'expo-router';
import { AuthFrame } from '@/components/AuthFrame';
import { FixeoAction } from '@/ui/FixeoAction';
export default function Entry() {
  return <AuthFrame hero back={false} title="Le quotidien, en bonnes mains." detail="Un besoin à la maison, une activité à développer. RAFI vous guide, à votre rythme.">
    <FixeoAction label="Créer mon espace" onPress={() => router.push('/sign-up')} />
    <FixeoAction label="J’ai déjà un compte" variant="secondary" onPress={() => router.push('/sign-in')} />
  </AuthFrame>;
}
