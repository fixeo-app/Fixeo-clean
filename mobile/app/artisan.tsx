import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { acceptDispatchOffer, getDispatchOffers } from '@/lib/magicLoop';
import type { DispatchOffer } from '@/lib/dispatchContract';
import { PushOptIn } from '@/components/PushOptIn';

const ACCEPT_MESSAGES: Record<string, string> = {
  already_claimed: 'Cette demande a déjà été prise en charge.',
  offer_not_found: 'Cette opportunité n’est plus disponible.',
  offer_not_active: 'Cette opportunité n’est plus active.',
  artisan_not_found: 'Profil artisan introuvable.',
  unauthenticated: 'Votre session a expiré.',
};

export default function Artisan() {
  const { requestId } = useLocalSearchParams<{requestId?:string}>();
  const [offers, setOffers] = useState<DispatchOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOffers(await getDispatchOffers());
    } catch {
      setMessage('Impossible de charger les opportunités.');
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
    try {
      setMessage('Acceptation en cours…');
      const result = await acceptDispatchOffer(requestId);
      setMessage(result.reason === 'already_accepted' ? 'Mission déjà acceptée.' : '✓ Mission acceptée.');
      await load();
    } catch (error: any) {
      const reason = String(error?.message || 'accept_failed');
      setMessage(ACCEPT_MESSAGES[reason] || 'Impossible d’accepter cette mission.');
      await load();
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.kicker}>FIXEO ARTISAN</Text>
      <Text style={styles.title}>Opportunités</Text>
      <PushOptIn />
      {!!message && <Text style={styles.message}>{message}</Text>}
      <FlatList
        data={[...offers].sort((a,b)=>String(a.request_id===requestId?0:1).localeCompare(String(b.request_id===requestId?0:1)))}
        keyExtractor={(item) => item.request_id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={<Text>Aucune opportunité active pour le moment.</Text>}
        renderItem={({ item }) => (
          <View style={[styles.card, item.request_id===requestId && styles.focusedCard]}>
            <Text style={styles.heading}>{item.service_category || 'Mission FIXEO'}</Text>
            <Text>{item.city || ''}{item.urgency ? ' · ' + item.urgency : ''}</Text>
            <Text style={styles.meta}>Rang de matching : {item.match_rank ?? '—'}</Text>
            <Pressable style={styles.accept} onPress={() => void accept(item.request_id)}>
              <Text style={styles.white}>Accepter</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, paddingTop: 70 },
  kicker: { fontWeight: '800', letterSpacing: 2 },
  title: { fontSize: 30, fontWeight: '800', marginVertical: 20 },
  message: { marginBottom: 14, fontWeight: '600' },
  card: { padding: 18, borderWidth: 1, borderColor: '#ddd', borderRadius: 18, marginBottom: 12 },
  focusedCard: { borderWidth: 2 },
  heading: { fontSize: 19, fontWeight: '700' },
  meta: { marginTop: 6, opacity: 0.65 },
  accept: { backgroundColor: '#111', padding: 14, borderRadius: 14, marginTop: 16 },
  white: { color: '#fff', textAlign: 'center', fontWeight: '700' },
});
