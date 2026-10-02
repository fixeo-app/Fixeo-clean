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
import { MissionEvidenceCapture } from '@/components/MissionEvidenceCapture';

const STATUS_LABELS: Record<string, string> = {
  assigned: 'Mission acceptée',
  in_progress: 'Intervention en cours',
  completed: 'Intervention terminée',
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
      setMessage('Indiquez d’abord que vous êtes arrivé sur place.');
      return;
    }

    setBusy(true);
    setMessage('FIXEO démarre le suivi terrain…');
    try {
      await startMission(missionId);
      await load();
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

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Pressable onPress={() => router.replace('/artisan')}>
        <Text style={styles.back}>‹ Opportunités</Text>
      </Pressable>

      <Text style={styles.kicker}>FIXEO TERRAIN</Text>
      <Text style={styles.title}>{mission?.service_category || 'Mission'}</Text>
      <Text style={styles.city}>
        {mission?.city || ''}{mission?.urgency ? ` · ${mission.urgency}` : ''}
      </Text>

      <View style={styles.statusCard}>
        <Text style={styles.statusEyebrow}>ÉTAT DE LA MISSION</Text>
        <Text style={styles.status}>{statusLabel}</Text>
        <Text style={styles.support}>FIXEO suit l’intervention avec vous.</Text>
      </View>

      {!!mission?.description && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Demande du client</Text>
          <Text style={styles.body}>{mission.description}</Text>
        </View>
      )}

      <View style={styles.rafiCard}>
        <Text style={styles.rafiTitle}>{guidance.title}</Text>
        {guidance.checks.map(check => (
          <Text key={check} style={styles.rafiCheck}>• {check}</Text>
        ))}
      </View>

      {!!mission?.agreed_price && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Montant convenu</Text>
          <Text style={styles.price}>{mission.agreed_price} DH</Text>
        </View>
      )}

      <Pressable style={styles.secondary} onPress={() => void callClient()}>
        <Text style={styles.secondaryText}>Appeler le client</Text>
      </Pressable>

      {requestStatus === 'assigned' && !arrived && (
        <Pressable style={styles.primary} disabled={busy} onPress={() => void arrive()}>
          <Text style={styles.primaryText}>{busy ? 'Enregistrement…' : 'Je suis arrivé'}</Text>
        </Pressable>
      )}

      {requestStatus === 'assigned' && arrived && (
        <View style={styles.doneCard}>
          <Text style={styles.doneTitle}>✓ Arrivée enregistrée</Text>
          <Text style={styles.doneText}>Le client sait que vous êtes sur place.</Text>
        </View>
      )}

      {(requestStatus === 'assigned' || requestStatus === 'in_progress') && (
        <MissionEvidenceCapture
          missionId={missionId}
          kind="before"
          label={beforeCount ? `📷 Ajouter une photo avant · ${beforeCount}` : '📷 Photo avant intervention'}
          onUploaded={() => void load()}
        />
      )}

      {requestStatus === 'assigned' && (
        <Pressable
          style={[styles.primary, !arrived && styles.disabled]}
          disabled={busy || !arrived}
          onPress={() => void begin()}
        >
          <Text style={styles.primaryText}>
            {busy ? 'Démarrage…' : 'Démarrer l’intervention'}
          </Text>
        </Pressable>
      )}

      {requestStatus === 'in_progress' && (
        <>
          <MissionEvidenceCapture
            missionId={missionId}
            kind="after"
            label={afterCount ? `📷 Ajouter une photo après · ${afterCount}` : '📷 Photo après intervention'}
            onUploaded={() => void load()}
          />

          {!!change && (
            <View style={styles.changeCard}>
              <Text style={styles.cardLabel}>Ajustement terrain</Text>
              <Text style={styles.changePrice}>{change.proposed_price} DH</Text>
              <Text style={styles.body}>{CHANGE_LABELS[change.status] || change.status}</Text>
              {!!change.review_reason && <Text style={styles.changeReason}>{change.review_reason}</Text>}
            </View>
          )}

          {(!change || ['rejected_by_fixeo', 'client_rejected'].includes(change.status)) && (
            <>
              {!changeOpen ? (
                <Pressable style={styles.secondary} onPress={() => setChangeOpen(true)}>
                  <Text style={styles.secondaryText}>Le problème est différent ?</Text>
                </Pressable>
              ) : (
                <View style={styles.card}>
                  <Text style={styles.cardLabel}>Proposer un ajustement</Text>
                  <Text style={styles.changeHelp}>
                    FIXEO le vérifie avant qu’il soit présenté au client.
                  </Text>
                  <TextInput
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="decimal-pad"
                    placeholder="Nouveau montant en DH"
                    style={styles.input}
                  />
                  <TextInput
                    value={reason}
                    onChangeText={setReason}
                    placeholder="Pourquoi le périmètre change ?"
                    multiline
                    style={[styles.input, styles.multiline]}
                  />
                  <TextInput
                    value={supplies}
                    onChangeText={setSupplies}
                    placeholder="Fournitures nécessaires (optionnel)"
                    style={styles.input}
                  />
                  <TextInput
                    value={duration}
                    onChangeText={setDuration}
                    placeholder="Durée estimée (optionnel)"
                    style={styles.input}
                  />
                  <Pressable style={styles.primary} disabled={busy} onPress={() => void proposeChange()}>
                    <Text style={styles.primaryText}>Envoyer à FIXEO</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}

          <Pressable style={styles.primary} disabled={busy} onPress={() => void finish()}>
            <Text style={styles.primaryText}>{busy ? 'Clôture…' : 'Terminer l’intervention'}</Text>
          </Pressable>
        </>
      )}

      {requestStatus === 'completed' && (
        <View style={styles.doneCard}>
          <Text style={styles.doneTitle}>✓ Intervention terminée</Text>
          <Text style={styles.doneText}>Le client peut maintenant confirmer la bonne fin de la mission.</Text>
        </View>
      )}

      {requestStatus === 'validated' && (
        <View style={styles.doneCard}>
          <Text style={styles.doneTitle}>✓ Mission validée</Text>
          <Text style={styles.doneText}>La mission est clôturée côté FIXEO.</Text>
        </View>
      )}

      {!!message && <Text style={styles.message}>{message}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, padding: 24, paddingTop: 64, gap: 16, backgroundColor: '#f7f7f7' },
  back: { fontSize: 16, fontWeight: '700' },
  kicker: { marginTop: 12, fontWeight: '800', letterSpacing: 2 },
  title: { fontSize: 34, fontWeight: '800' },
  city: { fontSize: 18, opacity: 0.62 },
  statusCard: { backgroundColor: '#111', borderRadius: 24, padding: 22, gap: 8 },
  statusEyebrow: { color: '#aaa', fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  status: { color: '#fff', fontSize: 24, fontWeight: '800' },
  support: { color: '#ddd' },
  card: { backgroundColor: '#fff', borderRadius: 22, padding: 20, gap: 10 },
  cardLabel: { fontWeight: '800', opacity: 0.55 },
  body: { fontSize: 17, lineHeight: 24 },
  price: { fontSize: 28, fontWeight: '800' },
  rafiCard: { backgroundColor: '#fff', borderRadius: 22, padding: 20, gap: 8, borderWidth: 1, borderColor: '#e8e8e8' },
  rafiTitle: { fontWeight: '800', fontSize: 18 },
  rafiCheck: { lineHeight: 21, opacity: 0.75 },
  primary: { backgroundColor: '#111', padding: 18, borderRadius: 18 },
  primaryText: { color: '#fff', textAlign: 'center', fontWeight: '800', fontSize: 17 },
  secondary: { borderWidth: 1, borderColor: '#d5d5d5', padding: 17, borderRadius: 18, backgroundColor: '#fff' },
  secondaryText: { textAlign: 'center', fontWeight: '700' },
  disabled: { opacity: 0.35 },
  doneCard: { backgroundColor: '#fff', borderRadius: 22, padding: 20, gap: 8 },
  doneTitle: { fontSize: 20, fontWeight: '800' },
  doneText: { lineHeight: 22, opacity: 0.7 },
  changeCard: { backgroundColor: '#fff', borderRadius: 22, padding: 20, gap: 7 },
  changePrice: { fontSize: 26, fontWeight: '800' },
  changeReason: { opacity: 0.65 },
  changeHelp: { opacity: 0.65, lineHeight: 20 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 14, padding: 14, backgroundColor: '#fafafa' },
  multiline: { minHeight: 86, textAlignVertical: 'top' },
  message: { textAlign: 'center', fontWeight: '600', marginTop: 4 },
});
