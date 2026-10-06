import { RafiScrollView as ScrollView } from '@/ui/RafiScrollView';
import { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  StyleSheet,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  confirmCompletedRequest,
  getClientMissionDetail,
  getMissionTimeline,
  type MissionSnapshot,
} from '@/lib/missionTerrain';
import { listMissionEvidence, type MissionEvidence } from '@/lib/missionEvidence';
import { triggerFixeoFeedback } from '@/lib/feedback';
import {
  getMissionChange,
  respondMissionChange,
  type MissionChangeProposal,
} from '@/lib/missionChange';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoText } from '@/ui/FixeoText';
import { ClientHero, ClientSection, clientStyles } from '@/components/ClientEditorial';
import { ClientMissionEvidence } from '@/components/ClientMissionEvidence';
import { clientMissionPresentation, clientMissionSteps } from '@/lib/clientExperience';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { semanticColors, space } from '@/ui/tokens';

export default function ClientMission() {
  const params = useLocalSearchParams<{ id?: string }>();
  const missionId = String(params.id || '');
  const [mission, setMission] = useState<MissionSnapshot | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [evidenceState, setEvidenceState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [evidence, setEvidence] = useState<MissionEvidence[]>([]);
  const [change, setChange] = useState<MissionChangeProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!missionId) return;
    try {
      const detail = await getClientMissionDetail(missionId);
      setMission(detail);
      setMessage('');

      const [eventsResult, evidenceResult, changeResult] = await Promise.allSettled([
        getMissionTimeline(missionId),
        listMissionEvidence(missionId),
        getMissionChange(missionId),
      ]);
      if (eventsResult.status === 'fulfilled') setTimeline(eventsResult.value);
      if (evidenceResult.status === 'fulfilled') setEvidence(evidenceResult.value);
      setEvidenceState(evidenceResult.status === 'fulfilled' ? 'ready' : 'unavailable');
      if (changeResult.status === 'fulfilled') setChange(changeResult.value);
    } catch {
      setMessage('Connexion instable. Votre suivi FIXEO reste conservé.');
    }
  }, [missionId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') void load();
    });
    return () => {
      clearInterval(timer);
      appState.remove();
    };
  }, [load]);

  async function validate() {
    if (!mission?.request_id || busy) return;
    setBusy(true);
    setMessage('FIXEO valide la clôture…');
    try {
      await confirmCompletedRequest(mission.request_id);
      await load();
      triggerFixeoFeedback('success');
      setMessage('✓ Mission validée. Merci.');
    } catch {
      setMessage('Impossible de valider pour le moment.');
    } finally {
      setBusy(false);
    }
  }

  async function decideChange(approve: boolean) {
    if (!change?.id || busy) return;
    setBusy(true);
    setMessage(approve ? 'Validation de l’ajustement…' : 'Refus de l’ajustement…');
    try {
      await respondMissionChange(change.id, approve);
      await load();
      triggerFixeoFeedback(approve ? 'success' : 'impact');
      setMessage(approve ? '✓ Ajustement accepté.' : 'Ajustement refusé.');
    } catch {
      setMessage('Impossible d’enregistrer votre décision pour le moment.');
    } finally {
      setBusy(false);
    }
  }

  const status = mission?.request_status;
  const stateCopy = clientMissionPresentation(status);
  const steps = clientMissionSteps(status, timeline.some(item => item?.event_type === 'arrived'));
  const assigned = ['assigned', 'in_progress', 'completed', 'validated'].includes(status || '');
  const validation = status === 'completed';
  const photos = <ClientMissionEvidence evidence={evidence} state={evidenceState} />;

  return (
    <FixeoScreen padded={false} header={<View style={styles.topBar}>
      <FixeoAction label="Retour à RAFI" variant="ghost" onPress={() => router.replace('/')} style={styles.back} />
      <FixeoText variant="eyebrow">FIXEO</FixeoText>
    </View>}>
      <ScrollView contentContainerStyle={clientStyles.content} showsVerticalScrollIndicator={false}>
        <ClientHero {...stateCopy} mode={stateCopy.orb} compact eventKey={missionId} />
        {!!message && <FixeoText accessibilityLiveRegion="polite" variant="supporting" tone="secondary">{message}</FixeoText>}

        {validation && <>
          {photos}
          <ClientSection testID="client-validation">
            <FixeoText variant="supporting" tone="secondary">Vérifiez la bonne fin de l’intervention avant de confirmer.</FixeoText>
            <FixeoAction testID="client-primary-action" label={busy ? 'Validation…' : 'Confirmer la fin de l’intervention'}
              busy={busy} disabled={busy} onPress={() => void validate()} />
          </ClientSection>
        </>}

        {assigned && <ClientSection label="Votre artisan">
          <FixeoText variant="heading">{mission?.artisan_name || 'Identité non disponible'}</FixeoText>
          <FixeoText variant="supporting" tone="secondary">{[mission?.service_category, mission?.city].filter(Boolean).join(' · ')}</FixeoText>
          {mission?.artisan_verified && <FixeoText variant="caption" tone="secondary">Profil vérifié FIXEO</FixeoText>}
        </ClientSection>}

        {change?.status === 'presented' && <ClientSection label="Un ajustement à décider" surface>
          <FixeoText variant="title">{change.proposed_price} DH</FixeoText>
          <FixeoText>{change.reason}</FixeoText>
          {!!change.supplies && <FixeoText variant="supporting" tone="secondary">Fournitures : {change.supplies}</FixeoText>}
          {!!change.estimated_duration && <FixeoText variant="supporting" tone="secondary">Durée : {change.estimated_duration}</FixeoText>}
          <FixeoAction label="Accepter l’ajustement" variant={validation ? 'secondary' : 'primary'} disabled={busy} onPress={() => void decideChange(true)} />
          <FixeoAction label="Refuser l’ajustement" variant="ghost" disabled={busy} onPress={() => void decideChange(false)} />
        </ClientSection>}
        {change?.status === 'client_accepted' && <ClientSection label="Ajustement accepté">
          <FixeoText>Le nouveau montant validé est {change.proposed_price} DH.</FixeoText>
        </ClientSection>}

        {!!steps.length && <ClientSection label="Votre suivi" testID="client-mission-timeline">
          {steps.map((step, index) => <View key={step.label} style={styles.step}>
            <View style={styles.rail}>
              <View style={[styles.dot, step.done && styles.doneDot, step.phase === 'now' && styles.currentDot]} />
              {index < steps.length - 1 && <View style={styles.line} />}
            </View>
            <View style={styles.stepCopy}>
              <FixeoText variant={step.phase === 'now' ? 'bodyLarge' : 'supporting'} tone={step.phase === 'now' ? 'primary' : 'secondary'}>{step.label}</FixeoText>
              <FixeoText variant="caption" tone="tertiary">{step.phase === 'now' ? 'Maintenant' : step.phase === 'past' ? 'Terminé' : 'À venir'}</FixeoText>
            </View>
          </View>)}
        </ClientSection>}

        {!!mission?.description && <ClientSection label="Votre demande"><FixeoText>{mission.description}</FixeoText></ClientSection>}
        {!!mission?.agreed_price && <ClientSection label="Montant validé"><FixeoText variant="title">{mission.agreed_price} DH</FixeoText></ClientSection>}
        {mission && !validation && photos}
      </ScrollView>
    </FixeoScreen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  back: { paddingHorizontal: 0, minHeight: 48, flexShrink: 1 },
  step: { flexDirection: 'row', gap: space.md, minHeight: 60 },
  rail: { width: 12, alignItems: 'center', paddingTop: space.xs },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: semanticColors.border.subtle },
  doneDot: { backgroundColor: semanticColors.text.secondary },
  currentDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: semanticColors.text.primary },
  line: { width: 1, flex: 1, marginTop: space.xs, backgroundColor: semanticColors.border.subtle },
  stepCopy: { flex: 1, gap: space.xxs, paddingBottom: space.sm },
});
