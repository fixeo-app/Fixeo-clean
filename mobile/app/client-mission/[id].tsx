import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  confirmCompletedRequest,
  getMyCurrentClientMission,
  type MissionSnapshot,
} from '@/lib/missionTerrain';

const STEPS = [
  ['assigned', 'Artisan trouvé'],
  ['in_progress', 'Intervention en cours'],
  ['completed', 'Intervention terminée'],
  ['validated', 'Mission validée'],
] as const;

function rank(status: string) {
  const index = STEPS.findIndex(([key]) => key === status);
  return index < 0 ? 0 : index;
}

export default function ClientMission() {
  const params = useLocalSearchParams<{ id?: string }>();
  const missionId = String(params.id || '');
  const [mission, setMission] = useState<MissionSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const current = await getMyCurrentClientMission();
      if (!current || (missionId && current.mission_id !== missionId)) {
        setMessage('Cette mission n’est plus active.');
        return;
      }
      setMission(current);
    } catch {
      setMessage('Impossible de charger le suivi.');
    }
  }, [missionId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
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

  const currentRank = rank(String(mission?.request_status || 'assigned'));

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
        {STEPS.map(([key, label], index) => (
          <View key={key} style={styles.step}>
            <Text style={index <= currentRank ? styles.stepOn : styles.stepOff}>
              {index <= currentRank ? '●' : '○'}
            </Text>
            <Text style={index <= currentRank ? styles.stepLabelOn : styles.stepLabelOff}>{label}</Text>
          </View>
        ))}
      </View>

      {!!mission?.description && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Votre demande</Text>
          <Text style={styles.body}>{mission.description}</Text>
        </View>
      )}

      {mission?.request_status === 'completed' && (
        <Pressable style={styles.primary} disabled={busy} onPress={() => void validate()}>
          <Text style={styles.primaryText}>
            {busy ? 'Validation…' : 'Confirmer la fin de l’intervention'}
          </Text>
        </Pressable>
      )}

      {mission?.request_status === 'validated' && (
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
  body: { fontSize: 18, lineHeight: 26 },
  primary: { backgroundColor: '#111', padding: 18, borderRadius: 18 },
  primaryText: { color: '#fff', textAlign: 'center', fontWeight: '800', fontSize: 17 },
  doneCard: { backgroundColor: '#fff', borderRadius: 22, padding: 20, gap: 8 },
  doneTitle: { fontSize: 20, fontWeight: '800' },
  doneText: { opacity: 0.7 },
  promise: { textAlign: 'center', opacity: 0.6, lineHeight: 21 },
  message: { textAlign: 'center', fontWeight: '600' },
});
