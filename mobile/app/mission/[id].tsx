import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  completeMission,
  getArtisanMissionDetail,
  getMissionTimeline,
  markMissionArrived,
  startMission,
  type MissionSnapshot,
} from '@/lib/missionTerrain';
import { listMissionEvidence, type MissionEvidence } from '@/lib/missionEvidence';
import {
  getMissionChange,
  submitMissionChange,
  type MissionChangeProposal,
} from '@/lib/missionChange';
import { getTerrainGuidance } from '@/lib/rafiTerrain';
import { triggerFixeoFeedback } from '@/lib/feedback';
import { MissionEvidenceCapture } from '@/components/MissionEvidenceCapture';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoCard } from '@/ui/FixeoCard';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { RafiOrb } from '@/ui/RafiOrb';
import { colors, radius, spacing, type } from '@/ui/tokens';

const STATUS_LABELS: Record<string, string> = {
  assigned: 'Mission acceptée',
  in_progress: 'Intervention en cours',
  completed: 'Validation client en attente',
  validated: 'Mission validée',
};

const CHANGE_LABELS: Record<string, string> = {
  submitted: 'FIXEO vérifie votre ajustement',
  presented: 'En attente de la décision du client',
  rejected_by_fixeo: 'Ajustement non retenu par FIXEO',
  client_accepted: 'Ajustement accepté par le client',
  client_rejected: 'Ajustement refusé par le client',
};

export default function MissionTerrain() {
  const params = useLocalSearchParams<{ id?: string }>();
  const missionId = String(params.id || '');
  const [mission, setMission] = useState<MissionSnapshot | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<MissionEvidence[]>([]);
  const [change, setChange] = useState<MissionChangeProposal | null>(null);
  const [changeOpen, setChangeOpen] = useState(false);
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('');
  const [supplies, setSupplies] = useState('');
  const [duration, setDuration] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!missionId) return;
    try {
      const detail = await getArtisanMissionDetail(missionId);
      setMission(detail);

      const [eventsResult, evidenceResult, changeResult] = await Promise.allSettled([
        getMissionTimeline(missionId),
        listMissionEvidence(missionId),
        getMissionChange(missionId),
      ]);

      if (eventsResult.status === 'fulfilled') setTimeline(eventsResult.value);
      if (evidenceResult.status === 'fulfilled') setEvidence(evidenceResult.value);
      if (changeResult.status === 'fulfilled') setChange(changeResult.value);
    } catch {
      setMessage('Connexion instable. FIXEO garde votre mission et réessaiera.');
    }
  }, [missionId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 6000);
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') void load();
    });
    return () => {
      clearInterval(timer);
      appState.remove();
    };
  }, [load]);

  const arrived = timeline.some(item => item?.event_type === 'arrived');
  const beforeCount = evidence.filter(item => item.kind === 'before').length;
  const afterCount = evidence.filter(item => item.kind === 'after').length;
  const guidance = useMemo(
    () => getTerrainGuidance(mission?.service_category),
    [mission?.service_category],
  );

  async function arrive() {
    if (!missionId || busy) return;
    setBusy(true);
    setMessage('FIXEO informe le client de votre arrivée…');
    try {
      await markMissionArrived(missionId);
      await load();
      triggerFixeoFeedback('success');
      setMessage('✓ Arrivée enregistrée.');
    } catch {
      setMessage('Impossible d’enregistrer l’arrivée. Réessayez.');
    } finally {
      setBusy(false);
    }
  }

  async function begin() {
    if (!missionId || busy) return;
    if (!arrived) {
      triggerFixeoFeedback('warning');
      setMessage('Indiquez d’abord que vous êtes arrivé sur place.');
      return;
    }

    setBusy(true);
    setMessage('FIXEO démarre le suivi terrain…');
    try {
      await startMission(missionId);
      await load();
      triggerFixeoFeedback('success');
      setMessage('✓ Intervention démarrée.');
    } catch (error: any) {
      setMessage(String(error?.message || '') === 'not_accepted'
        ? 'Cette mission n’est plus disponible.'
        : 'Impossible de démarrer pour le moment.');
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!missionId || busy) return;
    setBusy(true);
    setMessage('FIXEO clôture votre intervention…');
    try {
      await completeMission(missionId);
      await load();
      triggerFixeoFeedback('success');
      setMessage('✓ Intervention terminée. Validation client en attente.');
    } catch {
      setMessage('Impossible de terminer pour le moment.');
    } finally {
      setBusy(false);
    }
  }

  async function proposeChange() {
    if (!missionId || busy) return;
    const amount = Number(price.trim().replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0 || reason.trim().length < 5) {
      setMessage('Indiquez un montant valide et la raison de l’ajustement.');
      return;
    }

    setBusy(true);
    setMessage('FIXEO vérifie l’ajustement…');
    try {
      await submitMissionChange(
        missionId,
        amount,
        reason.trim(),
        supplies.trim(),
        duration.trim(),
      );
      setChangeOpen(false);
      await load();
      triggerFixeoFeedback('success');
      setMessage('✓ Ajustement transmis à FIXEO avant présentation au client.');
    } catch {
      setMessage('Impossible de transmettre l’ajustement pour le moment.');
    } finally {
      setBusy(false);
    }
  }

  async function callClient() {
    const phone = String(mission?.client_phone || '').trim();
    if (!phone) {
      setMessage('Numéro client indisponible.');
      return;
    }
    await Linking.openURL(`tel:${phone}`);
  }

  const requestStatus = String(mission?.request_status || '');
  const statusLabel = STATUS_LABELS[requestStatus] || 'Mission FIXEO';

  const stateCopy =
    requestStatus === 'validated'
      ? { eyebrow: 'MISSION VALIDÉE', title: 'Mission clôturée.', subtitle: 'FIXEO a enregistré la validation du client.', orb: 'success' as const }
      : requestStatus === 'completed'
        ? { eyebrow: 'VALIDATION CLIENT', title: 'Votre intervention est terminée.', subtitle: 'FIXEO attend maintenant la confirmation du client.', orb: 'success' as const }
        : requestStatus === 'in_progress'
          ? { eyebrow: 'INTERVENTION EN COURS', title: 'Restez concentré sur le terrain.', subtitle: 'RAFI garde le contexte et FIXEO suit les prochaines étapes.', orb: 'working' as const }
          : arrived
            ? { eyebrow: 'SUR PLACE', title: 'Vous êtes arrivé.', subtitle: 'Ajoutez la preuve initiale puis démarrez l’intervention.', orb: 'working' as const }
            : { eyebrow: 'MISSION ACCEPTÉE', title: 'La prochaine action est simple.', subtitle: 'Confirmez votre arrivée dès que vous êtes sur place.', orb: 'idle' as const };

  return (
    <FixeoScreen padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable onPress={() => router.replace('/artisan')}>
            <Text style={styles.back}>‹ Cockpit</Text>
          </Pressable>
          <Text style={styles.brand}>FIXEO TERRAIN</Text>
        </View>

        <View style={styles.stateHero}>
          <RafiOrb mode={stateCopy.orb} size={72} />
          <Text style={styles.eyebrow}>{stateCopy.eyebrow}</Text>
          <Text style={styles.title}>{stateCopy.title}</Text>
          <Text style={styles.subtitle}>{stateCopy.subtitle}</Text>
        </View>

        <FixeoCard tone="dark" style={styles.missionCard}>
          <Text style={styles.inverseEyebrow}>{statusLabel.toUpperCase()}</Text>
          <Text style={styles.missionTitle}>{mission?.service_category || 'Mission FIXEO'}</Text>
          <Text style={styles.missionMeta}>
            {mission?.city || ''}{mission?.urgency ? ` · ${mission.urgency}` : ''}
          </Text>
          {!!mission?.description && (
            <Text style={styles.missionDescription}>{mission.description}</Text>
          )}
        </FixeoCard>

        <FixeoCard tone="muted" style={styles.rafiCard}>
          <Text style={styles.rafiTitle}>{guidance.title}</Text>
          {guidance.checks.map(check => (
            <View key={check} style={styles.checkRow}>
              <View style={styles.checkDot} />
              <Text style={styles.rafiCheck}>{check}</Text>
            </View>
          ))}
        </FixeoCard>

        {!!mission?.agreed_price && (
          <FixeoCard style={styles.card}>
            <Text style={styles.cardLabel}>MONTANT CONVENU</Text>
            <Text style={styles.price}>{mission.agreed_price} DH</Text>
          </FixeoCard>
        )}

        <FixeoAction
          label="Appeler le client"
          variant="secondary"
          onPress={() => void callClient()}
        />

        {requestStatus === 'assigned' && !arrived && (
          <FixeoAction
            label={busy ? 'Enregistrement…' : 'Je suis arrivé'}
            disabled={busy}
            onPress={() => void arrive()}
          />
        )}

        {requestStatus === 'assigned' && arrived && (
          <FixeoCard tone="muted" style={styles.card}>
            <Text style={styles.doneTitle}>✓ Arrivée enregistrée</Text>
            <Text style={styles.doneText}>Le client sait que vous êtes sur place.</Text>
          </FixeoCard>
        )}

        {(requestStatus === 'assigned' || requestStatus === 'in_progress') && (
          <MissionEvidenceCapture
            missionId={missionId}
            kind="before"
            label={beforeCount ? `Ajouter une photo avant · ${beforeCount}` : 'Photo avant intervention'}
            onUploaded={() => void load()}
          />
        )}

        {requestStatus === 'assigned' && (
          <FixeoAction
            label={busy ? 'Démarrage…' : 'Démarrer l’intervention'}
            disabled={busy || !arrived}
            onPress={() => void begin()}
          />
        )}

        {requestStatus === 'in_progress' && (
          <>
            <MissionEvidenceCapture
              missionId={missionId}
              kind="after"
              label={afterCount ? `Ajouter une photo après · ${afterCount}` : 'Photo après intervention'}
              onUploaded={() => void load()}
            />

            {!!change && (
              <FixeoCard style={styles.changeCard}>
                <Text style={styles.cardLabel}>AJUSTEMENT TERRAIN</Text>
                <Text style={styles.changePrice}>{change.proposed_price} DH</Text>
                <Text style={styles.body}>{CHANGE_LABELS[change.status] || change.status}</Text>
                {!!change.review_reason && (
                  <Text style={styles.changeReason}>{change.review_reason}</Text>
                )}
              </FixeoCard>
            )}

            {(!change || ['rejected_by_fixeo', 'client_rejected'].includes(change.status)) && (
              <>
                {!changeOpen ? (
                  <FixeoAction
                    label="Le problème est différent ?"
                    variant="secondary"
                    onPress={() => setChangeOpen(true)}
                  />
                ) : (
                  <FixeoCard style={styles.changeCard}>
                    <Text style={styles.cardLabel}>PROPOSER UN AJUSTEMENT</Text>
                    <Text style={styles.changeHelp}>
                      FIXEO le vérifie avant qu’il soit présenté au client.
                    </Text>
                    <TextInput
                      value={price}
                      onChangeText={setPrice}
                      keyboardType="decimal-pad"
                      placeholder="Nouveau montant en DH"
                      placeholderTextColor={colors.textMuted}
                      style={styles.input}
                    />
                    <TextInput
                      value={reason}
                      onChangeText={setReason}
                      placeholder="Pourquoi le périmètre change ?"
                      placeholderTextColor={colors.textMuted}
                      multiline
                      style={[styles.input, styles.multiline]}
                    />
                    <TextInput
                      value={supplies}
                      onChangeText={setSupplies}
                      placeholder="Fournitures nécessaires (optionnel)"
                      placeholderTextColor={colors.textMuted}
                      style={styles.input}
                    />
                    <TextInput
                      value={duration}
                      onChangeText={setDuration}
                      placeholder="Durée estimée (optionnel)"
                      placeholderTextColor={colors.textMuted}
                      style={styles.input}
                    />
                    <FixeoAction
                      label={busy ? 'Transmission…' : 'Envoyer à FIXEO'}
                      disabled={busy}
                      onPress={() => void proposeChange()}
                    />
                  </FixeoCard>
                )}
              </>
            )}

            <FixeoCard tone="dark" style={styles.finishCard}>
              <Text style={styles.finishTitle}>Intervention prête à être terminée ?</Text>
              <Text style={styles.finishBody}>
                Vérifiez que les preuves et tout ajustement nécessaire sont enregistrés.
              </Text>
              <FixeoAction
                label={busy ? 'Clôture…' : 'Terminer l’intervention'}
                variant="secondary"
                disabled={busy}
                onPress={() => void finish()}
              />
            </FixeoCard>
          </>
        )}

        {requestStatus === 'completed' && (
          <FixeoCard tone="muted" style={styles.card}>
            <Text style={styles.doneTitle}>✓ Intervention terminée</Text>
            <Text style={styles.doneText}>
              Le client peut maintenant confirmer la bonne fin de la mission.
            </Text>
          </FixeoCard>
        )}

        {requestStatus === 'validated' && (
          <FixeoCard tone="muted" style={styles.card}>
            <Text style={styles.doneTitle}>✓ Mission validée</Text>
            <Text style={styles.doneText}>La mission est clôturée côté FIXEO.</Text>
          </FixeoCard>
        )}

        {!!message && (
          <FixeoCard tone="muted">
            <Text style={styles.message}>{message}</Text>
          </FixeoCard>
        )}
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
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  back: {
    fontSize: type.body,
    fontWeight: '800',
    color: colors.textMuted,
  },
  brand: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2.2,
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
    fontSize: 35,
    lineHeight: 39,
    fontWeight: '900',
    letterSpacing: -1.1,
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
  missionCard: {
    gap: spacing.sm,
  },
  inverseEyebrow: {
    color: '#A8A8AC',
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  missionTitle: {
    color: colors.inverse,
    fontSize: 29,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  missionMeta: {
    color: '#D8D8DA',
    fontSize: type.body,
  },
  missionDescription: {
    marginTop: spacing.xs,
    color: colors.inverse,
    lineHeight: 22,
  },
  rafiCard: {
    gap: spacing.sm,
  },
  rafiTitle: {
    fontWeight: '900',
    fontSize: 20,
    color: colors.text,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  checkDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 7,
    backgroundColor: colors.ink,
  },
  rafiCheck: {
    flex: 1,
    lineHeight: 21,
    color: colors.textMuted,
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
  price: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.text,
  },
  doneTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: colors.text,
  },
  doneText: {
    color: colors.textMuted,
    lineHeight: 21,
  },
  changeCard: {
    gap: spacing.md,
  },
  changePrice: {
    fontSize: 30,
    fontWeight: '900',
    color: colors.text,
  },
  body: {
    fontSize: type.body,
    lineHeight: 22,
    color: colors.text,
  },
  changeReason: {
    color: colors.textMuted,
  },
  changeHelp: {
    color: colors.textMuted,
    lineHeight: 20,
  },
  input: {
    minHeight: 55,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: type.body,
  },
  multiline: {
    minHeight: 94,
    textAlignVertical: 'top',
  },
  finishCard: {
    gap: spacing.md,
  },
  finishTitle: {
    color: colors.inverse,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '900',
  },
  finishBody: {
    color: '#D8D8DA',
    lineHeight: 21,
  },
  message: {
    textAlign: 'center',
    color: colors.text,
    fontWeight: '800',
  },
});
