import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { acceptDispatchOffer, getDispatchOffers } from '@/lib/magicLoop';
import type { DispatchOffer } from '@/lib/dispatchContract';
import { getMyCurrentArtisanMission, type MissionSnapshot } from '@/lib/missionTerrain';
import { PushOptIn } from '@/components/PushOptIn';

const ACCEPT_MESSAGES: Record<string, string> = {
  already_claimed: 'Cette demande a déjà été prise en charge.',
  offer_not_found: 'Cette opportunité n’est plus disponible.',
  offer_not_active: 'Cette opportunité n’est plus active.',
  artisan_not_found: 'Profil artisan introuvable.',
  unauthenticated: 'Votre session a expiré.',
};

const ACTIVE_LABELS: Record<string, string> = {
  assigned: 'Mission acceptée',
  in_progress: 'Intervention en cours',
  completed: 'Validation client en attente',
};

export default function Artisan() {
  const [offers, setOffers] = useState<DispatchOffer[]>([]);
  const [currentMission, setCurrentMission] = useState<MissionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [acceptingRequestId, setAcceptingRequestId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextOffers, mission] = await Promise.all([
        getDispatchOffers(),
        getMyCurrentArtisanMission(),
      ]);
      setOffers(nextOffers);
      setCurrentMission(mission);
    } catch {
      setMessage('Impossible de charger votre activité FIXEO.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => clearInterval(timer);
  }, [load]);

  async function accept(requestId: string) {
    if (acceptingRequestId) return;
    setAcceptingRequestId(requestId);
    try {
      setMessage('Acceptation en cours…');
      const result = await acceptDispatchOffer(requestId);
      setMessage(result.reason === 'already_accepted' ? 'Mission déjà acceptée.' : '✓ Mission acceptée.');
      await load();
      const missionId = String(result?.mission_id || '');
      if (missionId) {
        router.push({ pathname: '/mission/[id]', params: { id: missionId } } as any);
      }
    } catch (error: any) {
      const reason = String(error?.message || 'accept_failed');
      setMessage(ACCEPT_MESSAGES[reason] || 'Impossible d’accepter cette mission.');
      await load();
    } finally {
      setAcceptingRequestId(null);
    }
  }

  const header = (
    <View>
      <Text style={styles.kicker}>FIXEO ARTISAN</Text>
      <Text style={styles.title}>Opportunités</Text>
      <PushOptIn />
      {!!message && <Text style={styles.message}>{message}</Text>}

      {!!currentMission && (
        <View style={styles.activeCard}>
          <Text style={styles.activeEyebrow}>MISSION EN COURS</Text>
          <Text style={styles.activeTitle}>{currentMission.service_category || 'Mission FIXEO'}</Text>
          <Text style={styles.activeMeta}>
            {currentMission.city || ''} · {ACTIVE_LABELS[currentMission.request_status] || 'Suivi FIXEO'}
          </Text>
          <Pressable
            style={styles.openMission}
            onPress={() => router.push({
              pathname: '/mission/[id]',
              params: { id: currentMission.mission_id },
            } as any)}
          >
            <Text style={styles.white}>Ouvrir la mission</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.sectionTitle}>Nouvelles opportunités</Text>
    </View>
  );

  return (
    <View style={styles.root}>
      <FlatList
        data={offers}
        keyExtractor={(item) => item.request_id}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={<Text style={styles.empty}>Aucune opportunité active pour le moment.</Text>}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => {
          const accepting = acceptingRequestId === item.request_id;
          return (
            <View style={styles.card}>
              <Text style={styles.heading}>{item.service_category || 'Mission FIXEO'}</Text>
              <Text>{item.city || ''}{item.urgency ? ' · ' + item.urgency : ''}</Text>
              <Text style={styles.meta}>Rang de matching : {item.match_rank ?? '—'}</Text>
              <Pressable
                style={[styles.accept, accepting && styles.disabled]}
                disabled={!!acceptingRequestId}
                onPress={() => void accept(item.request_id)}
              >
                <Text style={styles.white}>{accepting ? 'Acceptation…' : 'Accepter'}</Text>
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f7f7' },
  content: { padding: 24, paddingTop: 70, paddingBottom: 40 },
  kicker: { fontWeight: '800', letterSpacing: 2 },
  title: { fontSize: 30, fontWeight: '800', marginVertical: 20 },
  message: { marginVertical: 14, fontWeight: '600' },
  activeCard: { backgroundColor: '#111', padding: 20, borderRadius: 22, marginTop: 18, marginBottom: 26, gap: 7 },
  activeEyebrow: { color: '#aaa', fontWeight: '800', letterSpacing: 1.3, fontSize: 12 },
  activeTitle: { color: '#fff', fontWeight: '800', fontSize: 23 },
  activeMeta: { color: '#ddd' },
  openMission: { marginTop: 10, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#555' },
  sectionTitle: { fontWeight: '800', marginBottom: 12, opacity: 0.55, letterSpacing: 1 },
  empty: { opacity: 0.6 },
  card: { padding: 18, backgroundColor: '#fff', borderRadius: 18, marginBottom: 12 },
  heading: { fontSize: 19, fontWeight: '700' },
  meta: { marginTop: 6, opacity: 0.65 },
  accept: { backgroundColor: '#111', padding: 14, borderRadius: 14, marginTop: 16 },
  disabled: { opacity: 0.55 },
  white: { color: '#fff', textAlign: 'center', fontWeight: '700' },
});
