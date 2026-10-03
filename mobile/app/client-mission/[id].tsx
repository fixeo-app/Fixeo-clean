import { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
import {
  getMissionChange,
  respondMissionChange,
  type MissionChangeProposal,
} from '@/lib/missionChange';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoCard } from '@/ui/FixeoCard';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { RafiOrb } from '@/ui/RafiOrb';
import { colors, radius, spacing, type } from '@/ui/tokens';

export default function ClientMission() {
  const params = useLocalSearchParams<{ id?: string }>();
  const missionId = String(params.id || '');
  const [mission, setMission] = useState<MissionSnapshot | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
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

  const status = String(mission?.request_status || 'assigned');
  const arrived = timeline.some(item => item?.event_type === 'arrived') || status !== 'assigned';
  const inProgress = ['in_progress', 'completed', 'validated'].includes(status);
  const completed = ['completed', 'validated'].includes(status);
  const validated = status === 'validated';
  const beforeCount = evidence.filter(item => item.kind === 'before').length;
  const afterCount = evidence.filter(item => item.kind === 'after').length;

  const steps = [
    { label: 'Artisan trouvé', done: true },
    { label: 'Artisan arrivé', done: arrived },
    { label: 'Intervention en cours', done: inProgress },
    { label: 'Intervention terminée', done: completed },
    { label: 'Mission validée', done: validated },
  ];

  const stateCopy =
    status === 'validated'
      ? { eyebrow: 'MISSION VALIDÉE', title: 'C’est terminé.', subtitle: 'Votre intervention est clôturée côté FIXEO.', orb: 'success' as const }
      : status === 'completed'
        ? { eyebrow: 'À VOUS DE CONFIRMER', title: 'Vérifiez avant de valider.', subtitle: 'Les preuves terrain sont disponibles ci-dessous.', orb: 'success' as const }
        : status === 'in_progress'
          ? { eyebrow: 'INTERVENTION EN COURS', title: 'FIXEO suit chaque étape.', subtitle: 'Vous gardez une vue claire sur l’avancement.', orb: 'working' as const }
          : { eyebrow: 'ARTISAN AFFECTÉ', title: 'Votre intervention est prise en charge.', subtitle: 'FIXEO suit l’arrivée et la suite de la mission.', orb: 'working' as const };

  return (
    <FixeoScreen padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable onPress={() => router.replace('/')}>
            <Text style={styles.back}>‹ RAFI</Text>
          </Pressable>
          <Text style={styles.brand}>FIXEO</Text>
        </View>

        <View style={styles.stateHero}>
          <RafiOrb mode={stateCopy.orb} size={72} />
          <Text style={styles.eyebrow}>{stateCopy.eyebrow}</Text>
          <Text style={styles.title}>{stateCopy.title}</Text>
          <Text style={styles.subtitle}>{stateCopy.subtitle}</Text>
        </View>

        <FixeoCard tone="dark" style={styles.artisanCard}>
          <Text style={styles.inverseEyebrow}>VOTRE ARTISAN</Text>
          <Text style={styles.artisanName}>{mission?.artisan_name || 'Artisan FIXEO'}</Text>
          <Text style={styles.artisanMeta}>
            {[mission?.service_category, mission?.city].filter(Boolean).join(' · ')}
          </Text>
          {mission?.artisan_verified && (
            <Text style={styles.verified}>✓ Profil vérifié FIXEO</Text>
          )}
        </FixeoCard>

        <FixeoCard style={styles.timeline}>
          <Text style={styles.sectionKicker}>SUIVI EN DIRECT</Text>
          {steps.map((step, index) => (
            <View key={step.label} style={styles.step}>
              <View style={styles.stepRail}>
                <View style={[styles.stepDot, step.done && styles.stepDotDone]} />
                {index < steps.length - 1 && (
                  <View style={[styles.stepLine, step.done && steps[index + 1]?.done && styles.stepLineDone]} />
                )}
              </View>
              <Text style={[styles.stepLabel, !step.done && styles.stepLabelOff]}>
                {step.label}
              </Text>
            </View>
          ))}
        </FixeoCard>

        {!!mission?.description && (
          <FixeoCard tone="muted" style={styles.card}>
            <Text style={styles.cardLabel}>VOTRE DEMANDE</Text>
            <Text style={styles.body}>{mission.description}</Text>
          </FixeoCard>
        )}

        {!!mission?.agreed_price && (
          <FixeoCard style={styles.card}>
            <Text style={styles.cardLabel}>MONTANT VALIDÉ</Text>
            <Text style={styles.price}>{mission.agreed_price} DH</Text>
          </FixeoCard>
        )}

        {change?.status === 'presented' && (
          <FixeoCard style={styles.changeCard}>
            <Text style={styles.changeEyebrow}>AJUSTEMENT VÉRIFIÉ PAR FIXEO</Text>
            <Text style={styles.changePrice}>{change.proposed_price} DH</Text>
            <Text style={styles.body}>{change.reason}</Text>
            {!!change.supplies && (
              <Text style={styles.changeMeta}>Fournitures : {change.supplies}</Text>
            )}
            {!!change.estimated_duration && (
              <Text style={styles.changeMeta}>Durée : {change.estimated_duration}</Text>
            )}
            <View style={styles.decisionRow}>
              <View style={styles.decisionButton}>
                <FixeoAction
                  label="Refuser"
                  variant="secondary"
                  disabled={busy}
                  onPress={() => void decideChange(false)}
                />
              </View>
              <View style={styles.decisionButton}>
                <FixeoAction
                  label="Accepter"
                  disabled={busy}
                  onPress={() => void decideChange(true)}
                />
              </View>
            </View>
          </FixeoCard>
        )}

        {change?.status === 'client_accepted' && (
          <FixeoCard tone="muted" style={styles.card}>
            <Text style={styles.doneTitle}>✓ Ajustement accepté</Text>
            <Text style={styles.doneText}>
              Le nouveau montant validé est {change.proposed_price} DH.
            </Text>
          </FixeoCard>
        )}

        {!!evidence.length && (
          <FixeoCard style={styles.card}>
            <View style={styles.evidenceHeader}>
              <View style={styles.evidenceCopy}>
                <Text style={styles.cardLabel}>PREUVES TERRAIN</Text>
                <Text style={styles.evidenceCount}>{beforeCount} avant · {afterCount} après</Text>
              </View>
              <Text style={styles.privateLabel}>PRIVÉ</Text>
            </View>
            <View style={styles.evidenceRow}>
              {evidence.slice(0, 4).map(item => item.signed_url ? (
                <Image
                  key={item.id}
                  source={{ uri: item.signed_url }}
                  style={styles.evidenceImage}
                />
              ) : null)}
            </View>
          </FixeoCard>
        )}

        {status === 'completed' && (
          <FixeoCard tone="dark" style={styles.validationCard}>
            <Text style={styles.validationTitle}>Tout est prêt pour votre validation.</Text>
            <Text style={styles.validationBody}>
              Confirmez uniquement après avoir vérifié la bonne fin de l’intervention.
            </Text>
            <FixeoAction
              label={busy ? 'Validation…' : 'Confirmer la fin de l’intervention'}
              variant="secondary"
              disabled={busy}
              onPress={() => void validate()}
            />
          </FixeoCard>
        )}

        {status === 'validated' && (
          <FixeoCard tone="muted" style={styles.card}>
            <Text style={styles.doneTitle}>✓ Mission terminée</Text>
            <Text style={styles.doneText}>FIXEO a enregistré votre validation.</Text>
          </FixeoCard>
        )}

        {!!message && (
          <FixeoCard tone="muted">
            <Text style={styles.message}>{message}</Text>
          </FixeoCard>
        )}

        <Text style={styles.promise}>FIXEO reste présent jusqu’à la clôture de l’intervention.</Text>
      </ScrollView>
    </FixeoScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  topBar: {
    paddingTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: {
    fontSize: type.body,
    fontWeight: '800',
    color: colors.textMuted,
  },
  brand: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 3,
    color: colors.text,
  },
  stateHero: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  eyebrow: {
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.6,
    color: colors.textMuted,
    textAlign: 'center',
  },
  title: {
    maxWidth: 340,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '900',
    letterSpacing: -1.2,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    maxWidth: 330,
    fontSize: type.body,
    lineHeight: 22,
    color: colors.textMuted,
    textAlign: 'center',
  },
  artisanCard: {
    gap: spacing.sm,
  },
  inverseEyebrow: {
    color: '#A8A8AC',
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  artisanName: {
    color: colors.inverse,
    fontSize: 27,
    lineHeight: 31,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  artisanMeta: {
    color: '#D8D8DA',
    fontSize: type.body,
  },
  verified: {
    color: colors.inverse,
    fontWeight: '800',
  },
  timeline: {
    gap: 0,
  },
  sectionKicker: {
    marginBottom: spacing.md,
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: colors.textMuted,
  },
  step: {
    minHeight: 54,
    flexDirection: 'row',
    gap: spacing.md,
  },
  stepRail: {
    width: 18,
    alignItems: 'center',
  },
  stepDot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  stepDotDone: {
    borderColor: colors.ink,
    backgroundColor: colors.ink,
  },
  stepLine: {
    flex: 1,
    width: 2,
    backgroundColor: colors.line,
  },
  stepLineDone: {
    backgroundColor: colors.ink,
  },
  stepLabel: {
    paddingTop: 0,
    flex: 1,
    fontSize: type.body,
    fontWeight: '800',
    color: colors.text,
  },
  stepLabelOff: {
    color: colors.textMuted,
    fontWeight: '600',
  },
  card: {
    gap: spacing.sm,
  },
  cardLabel: {
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.3,
    color: colors.textMuted,
  },
  body: {
    fontSize: type.bodyLarge,
    lineHeight: 25,
    color: colors.text,
  },
  price: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.text,
  },
  changeCard: {
    gap: spacing.md,
  },
  changeEyebrow: {
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: colors.textMuted,
  },
  changePrice: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.text,
  },
  changeMeta: {
    color: colors.textMuted,
    lineHeight: 20,
  },
  decisionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  decisionButton: {
    flex: 1,
  },
  doneTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
  },
  doneText: {
    color: colors.textMuted,
    lineHeight: 21,
  },
  evidenceHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  evidenceCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  evidenceCount: {
    fontWeight: '900',
    color: colors.text,
  },
  privateLabel: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
    color: colors.textMuted,
  },
  evidenceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  evidenceImage: {
    width: 86,
    height: 86,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  validationCard: {
    gap: spacing.md,
  },
  validationTitle: {
    color: colors.inverse,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
  },
  validationBody: {
    color: '#D8D8DA',
    lineHeight: 21,
  },
  message: {
    textAlign: 'center',
    fontWeight: '800',
    color: colors.text,
  },
  promise: {
    textAlign: 'center',
    color: colors.textMuted,
    lineHeight: 21,
    paddingBottom: spacing.md,
  },
});
