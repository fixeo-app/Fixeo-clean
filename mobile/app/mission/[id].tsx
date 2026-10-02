import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  completeMission,
  getArtisanMissionDetail,
  startMission,
  type MissionSnapshot,
} from '@/lib/missionTerrain';

const STATUS_LABELS: Record<string, string> = {
  assigned: 'Mission acceptée',
  in_progress: 'Intervention en cours',
  completed: 'Intervention terminée',
  validated: 'Mission validée',
};

export default function MissionTerrain() {
  const params = useLocalSearchParams<{ id?: string }>();
  const missionId = String(params.id || '');
  const [mission, setMission] = useState<MissionSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!missionId) return;
    try {
      setMission(await getArtisanMissionDetail(missionId));
    } catch {
      setMessage('Impossible de charger cette mission.');
    }
  }, [missionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function begin() {
    if (!missionId || busy) return;
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
      <Text style={styles.city}>{mission?.city || ''}{mission?.urgency ? ` · ${mission.urgency}` : ''}</Text>

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

      {!!mission?.agreed_price && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Montant convenu</Text>
          <Text style={styles.price}>{mission.agreed_price} DH</Text>
        </View>
      )}

      <Pressable style={styles.secondary} onPress={() => void callClient()}>
        <Text style={styles.secondaryText}>Appeler le client</Text>
      </Pressable>

      {requestStatus === 'assigned' && (
        <Pressable style={styles.primary} disabled={busy} onPress={() => void begin()}>
          <Text style={styles.primaryText}>{busy ? 'Démarrage…' : 'Démarrer l’intervention'}</Text>
        </Pressable>
      )}

      {requestStatus === 'in_progress' && (
        <Pressable style={styles.primary} disabled={busy} onPress={() => void finish()}>
          <Text style={styles.primaryText}>{busy ? 'Clôture…' : 'Terminer l’intervention'}</Text>
        </Pressable>
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
  card: { backgroundColor: '#fff', borderRadius: 22, padding: 20, gap: 8 },
  cardLabel: { fontWeight: '800', opacity: 0.55 },
  body: { fontSize: 18, lineHeight: 26 },
  price: { fontSize: 28, fontWeight: '800' },
  primary: { backgroundColor: '#111', padding: 18, borderRadius: 18 },
  primaryText: { color: '#fff', textAlign: 'center', fontWeight: '800', fontSize: 17 },
  secondary: { borderWidth: 1, borderColor: '#d5d5d5', padding: 17, borderRadius: 18, backgroundColor: '#fff' },
  secondaryText: { textAlign: 'center', fontWeight: '700' },
  doneCard: { backgroundColor: '#fff', borderRadius: 22, padding: 20, gap: 8 },
  doneTitle: { fontSize: 20, fontWeight: '800' },
  doneText: { lineHeight: 22, opacity: 0.7 },
  message: { textAlign: 'center', fontWeight: '600', marginTop: 4 },
});
