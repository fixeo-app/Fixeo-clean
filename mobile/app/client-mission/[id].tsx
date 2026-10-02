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
  const steps = [
    { label: 'Artisan trouvé', done: true },
    { label: 'Artisan arrivé', done: arrived },
    { label: 'Intervention en cours', done: inProgress },
    { label: 'Intervention terminée', done: completed },
    { label: 'Mission validée', done: validated },
  ];

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Pressable onPress={() => router.replace('/')}>
        <Text style={styles.back}>‹ RAFI</Text>
      </Pressable>

      <Text style={styles.kicker}>FIXEO S’OCCUPE DE TOUT</Text>
      <Text style={styles.title}>{mission?.service_category || 'Votre intervention'}</Text>
      <Text style={styles.city}>{mission?.city || ''}</Text>

      <View style={styles.hero}>
        <Text style={styles.heroSmall}>VOTRE ARTISAN</Text>
        <Text style={styles.heroName}>{mission?.artisan_name || 'Artisan FIXEO'}</Text>
        {mission?.artisan_verified && <Text style={styles.verified}>✓ Profil vérifié FIXEO</Text>}
      </View>

      <View style={styles.timeline}>
        {steps.map(step => (
          <View key={step.label} style={styles.step}>
            <Text style={step.done ? styles.stepOn : styles.stepOff}>{step.done ? '●' : '○'}</Text>
            <Text style={step.done ? styles.stepLabelOn : styles.stepLabelOff}>{step.label}</Text>
          </View>
        ))}
      </View>

      {!!mission?.description && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Votre demande</Text>
          <Text style={styles.body}>{mission.description}</Text>
        </View>
      )}

      {!!mission?.agreed_price && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Montant validé</Text>
          <Text style={styles.price}>{mission.agreed_price} DH</Text>
        </View>
      )}

      {change?.status === 'presented' && (
        <View style={styles.changeCard}>
          <Text style={styles.changeEyebrow}>AJUSTEMENT VÉRIFIÉ PAR FIXEO</Text>
          <Text style={styles.changePrice}>{change.proposed_price} DH</Text>
          <Text style={styles.body}>{change.reason}</Text>
          {!!change.supplies && <Text style={styles.changeMeta}>Fournitures : {change.supplies}</Text>}
          {!!change.estimated_duration && <Text style={styles.changeMeta}>Durée : {change.estimated_duration}</Text>}
          <View style={styles.decisionRow}>
            <Pressable style={styles.reject} disabled={busy} onPress={() => void decideChange(false)}>
              <Text style={styles.rejectText}>Refuser</Text>
            </Pressable>
            <Pressable style={styles.accept} disabled={busy} onPress={() => void decideChange(true)}>
              <Text style={styles.acceptText}>Accepter</Text>
            </Pressable>
          </View>
        </View>
      )}

      {change?.status === 'client_accepted' && (
        <View style={styles.doneCard}>
          <Text style={styles.doneTitle}>✓ Ajustement accepté</Text>
          <Text style={styles.doneText}>Le nouveau montant validé est {change.proposed_price} DH.</Text>
        </View>
      )}

      {!!evidence.length && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Preuves terrain</Text>
          <Text style={styles.evidenceCount}>
            {evidence.filter(item => item.kind === 'before').length} avant · {evidence.filter(item => item.kind === 'after').length} après
          </Text>
          <View style={styles.evidenceRow}>
            {evidence.slice(0, 3).map(item => item.signed_url ? (
              <Image key={item.id} source={{ uri: item.signed_url }} style={styles.evidenceImage} />
            ) : null)}
          </View>
        </View>
      )}

      {status === 'completed' && (
        <Pressable style={styles.primary} disabled={busy} onPress={() => void validate()}>
          <Text style={styles.primaryText}>
            {busy ? 'Validation…' : 'Confirmer la fin de l’intervention'}
          </Text>
        </Pressable>
      )}

      {status === 'validated' && (
        <View style={styles.doneCard}>
          <Text style={styles.doneTitle}>✓ Mission terminée</Text>
          <Text style={styles.doneText}>FIXEO a enregistré votre validation.</Text>
        </View>
      )}

      <Text style={styles.promise}>FIXEO reste présent jusqu’à la clôture de l’intervention.</Text>
      {!!message && <Text style={styles.message}>{message}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, padding: 24, paddingTop: 64, gap: 16, backgroundColor: '#f7f7f7' },
  back: { fontSize: 16, fontWeight: '700' },
  kicker: { marginTop: 12, fontWeight: '800', letterSpacing: 1.5 },
  title: { fontSize: 34, fontWeight: '800' },
  city: { fontSize: 18, opacity: 0.6 },
  hero: { backgroundColor: '#111', borderRadius: 26, padding: 22, gap: 7 },
  heroSmall: { color: '#aaa', fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
  heroName: { color: '#fff', fontSize: 25, fontWeight: '800' },
  verified: { color: '#fff', opacity: 0.8, fontWeight: '700' },
  timeline: { backgroundColor: '#fff', borderRadius: 22, padding: 20, gap: 15 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepOn: { fontSize: 18 },
  stepOff: { fontSize: 18, opacity: 0.25 },
  stepLabelOn: { fontSize: 17, fontWeight: '700' },
  stepLabelOff: { fontSize: 17, opacity: 0.35 },
  card: { backgroundColor: '#fff', borderRadius: 22, padding: 20, gap: 8 },
  cardLabel: { fontWeight: '800', opacity: 0.55 },
  body: { fontSize: 17, lineHeight: 24 },
  price: { fontSize: 28, fontWeight: '800' },
  changeCard: { backgroundColor: '#fff', borderRadius: 22, padding: 20, gap: 10, borderWidth: 1, borderColor: '#d9d9d9' },
  changeEyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, opacity: 0.55 },
  changePrice: { fontSize: 30, fontWeight: '800' },
  changeMeta: { opacity: 0.65 },
  decisionRow: { flexDirection: 'row', gap: 10, marginTop: 5 },
  reject: { flex: 1, borderWidth: 1, borderColor: '#d5d5d5', borderRadius: 15, padding: 15 },
  rejectText: { textAlign: 'center', fontWeight: '800' },
  accept: { flex: 1, backgroundColor: '#111', borderRadius: 15, padding: 15 },
  acceptText: { textAlign: 'center', color: '#fff', fontWeight: '800' },
  evidenceCount: { fontWeight: '700' },
  evidenceRow: { flexDirection: 'row', gap: 8, marginTop: 5 },
  evidenceImage: { width: 78, height: 78, borderRadius: 14, backgroundColor: '#eee' },
  primary: { backgroundColor: '#111', padding: 18, borderRadius: 18 },
  primaryText: { color: '#fff', textAlign: 'center', fontWeight: '800', fontSize: 17 },
  doneCard: { backgroundColor: '#fff', borderRadius: 22, padding: 20, gap: 8 },
  doneTitle: { fontSize: 20, fontWeight: '800' },
  doneText: { opacity: 0.7 },
  promise: { textAlign: 'center', opacity: 0.6, lineHeight: 21 },
  message: { textAlign: 'center', fontWeight: '600' },
});
