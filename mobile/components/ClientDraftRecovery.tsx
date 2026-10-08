import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { getStableSession } from '@/lib/auth';
import { clientDrafts, loadClientDrafts, subscribeDrafts, type ClientDraft } from '@/lib/clientDrafts';
import { ClientSection } from './ClientEditorial';
import { FixeoText } from '@/ui/FixeoText';
import { FixeoAction } from '@/ui/FixeoAction';

export function ClientDraftRecovery({ excludeId }: { excludeId?: string }) {
  const [drafts, setDrafts] = useState<ClientDraft[]>([]);
  useFocusEffect(useCallback(() => {
    let active = true, owner = '';
    const update = () => { if (active && owner) setDrafts(clientDrafts(owner).filter(item => item.id !== excludeId)); };
    const stop = subscribeDrafts(update);
    void getStableSession().then(async session => {
      if (!session || !active) return;
      owner = session.user.id; await loadClientDrafts(owner); update();
    }).catch(() => { if (active) setDrafts([]); });
    return () => { active = false; stop(); };
  }, [excludeId]));
  return <>{drafts.map(draft => <ClientSection key={draft.id} surface testID="client-draft-recovery">
    <FixeoText variant="eyebrow">VOTRE DEMANDE EN PRÉPARATION</FixeoText>
    <FixeoText variant="heading">{draft.problem || 'Votre demande avec photo'}</FixeoText>
    <FixeoText tone="secondary">{draft.city || 'Ville à choisir'} · {draft.submissionKey || draft.estimator?.pendingConfirmation ? 'Confirmation à vérifier' : 'Rien n’est encore confirmé'}</FixeoText>
    <FixeoAction label="Reprendre votre demande" variant="secondary" onPress={() => router.push({ pathname: '/new-request', params: { draftId: draft.id } } as any)} />
  </ClientSection>)}</>;
}
