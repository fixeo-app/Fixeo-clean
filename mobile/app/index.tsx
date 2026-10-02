import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { createRequest } from '@/lib/magicLoop';
import {
  getClientRequestStatus,
  watchClientNotifications,
  watchClientRequest,
} from '@/lib/clientWatch';
import { understandLocally } from '@/lib/rafi';
import { hasRafiServerGateway, transcribeRafiVoice } from '@/lib/rafiGateway';
import { MagicLoopModel, transition } from '@/lib/magicLoopState';
import { RafiInputRail } from '@/components/RafiInputRail';
import { PushOptIn } from '@/components/PushOptIn';

const ASSIGNED_STATES = new Set(['assigned', 'in_progress', 'completed', 'validated']);

export default function Home() {
  const [problem, setProblem] = useState('');
  const [city, setCity] = useState('');
  const [rafiMessage, setRafiMessage] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
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

  useEffect(() => {
    if (loop.state !== 'matching' || !loop.requestId) return;

    const requestId = loop.requestId;
    const channel = watchClientRequest(requestId, (payload: any) => {
      const status = String(payload?.new?.status || '');
      if (ASSIGNED_STATES.has(status)) {
        setLoop(current => transition(current, 'found', { message: 'Artisan trouvé' }));
      }
    });

    const interval = setInterval(() => {
      void getClientRequestStatus(requestId).then(status => {
        if (status && ASSIGNED_STATES.has(status)) {
          setLoop(current => transition(current, 'found', { message: 'Artisan trouvé' }));
        }
      });
    }, 5000);

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [loop.state, loop.requestId]);

  async function handleVoice(uri: string) {
    if (!hasRafiServerGateway()) {
      setRafiMessage('Voix capturée. La transcription serveur sera activée sur le build Staging signé.');
      return;
    }
    try {
      setRafiMessage('RAFI transcrit…');
      const transcript = await transcribeRafiVoice(uri);
      setProblem(current => [current.trim(), transcript].filter(Boolean).join(' '));
      setRafiMessage('Transcription prête.');
    } catch {
      setRafiMessage('Impossible de transcrire cet enregistrement.');
    }
  }

  function handlePhoto(uri: string) {
    setPhotoUri(uri);
    setRafiMessage('Photo jointe. Le diagnostic serveur sera activé sur le build Staging signé.');
  }

  async function send() {
    try {
      const normalizedCity = city.trim();
      if (!normalizedCity) {
        setLoop(current => transition(current, 'error', { message: 'Indiquez votre ville.' }));
        return;
      }
      if (!need.description.trim()) {
        setLoop(current => transition(current, 'error', { message: 'Décrivez le problème à RAFI.' }));
        return;
      }
      setLoop(current => transition(current, 'creating'));
      const idempotencyKey = Crypto.randomUUID();
      const data: any = await createRequest(
        need.serviceCategory,
        normalizedCity,
        need.description,
        idempotencyKey,
      );
      const requestId = String(data?.id || data?.request_id || '');
      if (!requestId) throw new Error('REQUEST_ID_MISSING');
      setLoop(current => transition(current, 'matching', { requestId }));
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

      <RafiInputRail
        onVoiceReady={(uri) => void handleVoice(uri)}
        onPhotoReady={handlePhoto}
      />

      <PushOptIn compact />

      <TextInput
        value={problem}
        onChangeText={setProblem}
        placeholder="Décrivez le problème"
        style={styles.input}
      />
      <TextInput
        value={city}
        onChangeText={setCity}
        placeholder="Votre ville"
        autoCapitalize="words"
        style={styles.input}
      />

      {!!rafiMessage && <Text style={styles.rafiMessage}>{rafiMessage}</Text>}
      {!!photoUri && <Text style={styles.attachment}>📷 Photo prête pour RAFI</Text>}

      {problem.length > 3 && (
        <Text style={styles.understood}>
          RAFI · {need.serviceCategory}{need.confidence === 'low' ? ' · à confirmer' : ''}
        </Text>
      )}
      <Pressable
        style={styles.cta}
        onPress={() => void send()}
        disabled={!problem || loop.state === 'creating'}
      >
        <Text style={styles.ctaText}>
          {loop.state === 'creating' ? 'RAFI prépare la demande…' : 'Confirmer la demande'}
        </Text>
      </Pressable>
      {loop.state === 'matching' && <Text style={styles.ok}>Demande confirmée · recherche d’un artisan…</Text>}
      {loop.state === 'found' && <Text style={styles.ok}>✓ {loop.message}</Text>}
      {loop.state === 'error' && <Text>{loop.message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, justifyContent: 'center', gap: 16 },
  brand: { fontSize: 18, fontWeight: '800', letterSpacing: 3, textAlign: 'center' },
  orb: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#111', alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 18, padding: 16, minHeight: 56 },
  rafiMessage: { textAlign: 'center', opacity: 0.72 },
  attachment: { textAlign: 'center', fontWeight: '600' },
  understood: { textAlign: 'center', fontWeight: '600' },
  cta: { backgroundColor: '#111', padding: 18, borderRadius: 18 },
  ctaText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  ok: { textAlign: 'center', fontWeight: '700' },
});
