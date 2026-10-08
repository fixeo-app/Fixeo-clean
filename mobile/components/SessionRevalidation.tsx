import { Modal, StyleSheet, View } from 'react-native';
import { authCopy } from '@/lib/authContract';
import { resolveAuthSession, useAuthState } from '@/lib/authSession';
import { signOut } from '@/lib/auth';
import { FixeoText } from '@/ui/FixeoText';
import { FixeoAction } from '@/ui/FixeoAction';
import { RafiOrb } from '@/ui/RafiOrb';
import { semanticColors, space } from '@/ui/tokens';

export function SessionRevalidation() {
  const state = useAuthState();
  const visible = state.phase === 'ready' && (!!state.revalidating || !!state.issue);
  return <Modal visible={visible} transparent={false} animationType="none" onRequestClose={() => {}}>
    <View style={styles.root} accessibilityViewIsModal>
      <RafiOrb size={76} mode={state.issue ? 'attention' : 'working'} />
      <FixeoText variant="heading">{state.issue ? authCopy[state.issue].title : 'Vérification de votre accès.'}</FixeoText>
      <FixeoText tone="secondary">Votre besoin et votre progression sont conservés.</FixeoText>
      {state.issue && <>
        <FixeoAction label="Réessayer la connexion" onPress={() => void resolveAuthSession(true)} />
        <FixeoAction label="Se déconnecter" variant="ghost" onPress={() => void signOut().catch(() => undefined)} />
      </>}
    </View>
  </Modal>;
}
const styles = StyleSheet.create({ root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md,
  padding: space.lg, backgroundColor: semanticColors.background.canvas } });
