import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { createRequest } from '@/lib/magicLoop';
import { watchClientNotifications } from '@/lib/clientWatch';
import { understandLocally } from '@/lib/rafi';
import { MagicLoopModel, transition } from '@/lib/magicLoopState';

export default function Home() {
  const [problem, setProblem] = useState('');
  const [loop, setLoop] = useState<MagicLoopModel>({ state: 'idle' });
  const need = useMemo(() => understandLocally({ mode: 'text', text: problem }), [problem]);

  useEffect(() => {
    let channel: any;
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      if (!data.user) {
        router.replace('/sign-in');
        return;
      }
      channel = watchClientNotifications(data.user.id, (payload: any) => {
        const notification = payload.new || {};
        if (/accept|assign|mission/i.test(String(notification.type || ''))) {
          setLoop(current => transition(current, 'found', {
            message: notification.title || notification.message || 'Artisan trouvé',
          }));
        }
      });
    });
    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  async function send() {
    try {
      setLoop(current => transition(current, 'creating'));
      const idempotencyKey = globalThis.crypto.randomUUID();
      const data: any = await createRequest(
        need.serviceCategory,
        'Rabat',
        need.description,
        idempotencyKey,
      );
      setLoop(current => transition(current, 'matching', {
        requestId: String(data?.id || data?.request_id || ''),
      }));
    } catch {
      setLoop(current => transition(current, 'error', {
        message: 'Impossible de confirmer pour le moment.',
      }));
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.brand}>FIXEO</Text>
      <View style={styles.orb} />
      <Text style={styles.title}>Que puis-je régler pour vous ?</Text>
      <View style={styles.modes}>
        <Text>🎙 Parler</Text><Text>📷 Montrer</Text><Text>⌨️ Écrire</Text>
      </View>
      <TextInput value={problem} onChangeText={setProblem} placeholder="Décrivez le problème" style={styles.input} />
      {problem.length > 3 && (
        <Text style={styles.understood}>
          RAFI · {need.serviceCategory}{need.confidence === 'low' ? ' · à confirmer' : ''}
        </Text>
      )}
      <Pressable style={styles.cta} onPress={send} disabled={!problem || loop.state === 'creating'}>
        <Text style={styles.ctaText}>{loop.state === 'creating' ? 'RAFI prépare la demande…' : 'Confirmer la demande'}</Text>
      </Pressable>
      {loop.state === 'matching' && <Text style={styles.ok}>Demande confirmée · recherche d’un artisan…</Text>}
      {loop.state === 'found' && <Text style={styles.ok}>✓ {loop.message}</Text>}
      {loop.state === 'error' && <Text>{loop.message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, justifyContent: 'center', gap: 18 },
  brand: { fontSize: 18, fontWeight: '800', letterSpacing: 3, textAlign: 'center' },
  orb: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#111', alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center' },
  modes: { flexDirection: 'row', justifyContent: 'space-around' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 18, padding: 16, minHeight: 64 },
  understood: { textAlign: 'center', fontWeight: '600' },
  cta: { backgroundColor: '#111', padding: 18, borderRadius: 18 },
  ctaText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  ok: { textAlign: 'center', fontWeight: '700' },
});
