import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { createRequest } from '@/lib/magicLoop';
import {
  getClientRequestStatus,
  watchClientNotifications,
  watchClientRequest,
} from '@/lib/clientWatch';
import {
  getMyCurrentClientMission,
  getMyCurrentClientRequest,
} from '@/lib/missionTerrain';
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
  const submitLockRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const need = useMemo(() => understandLocally({ mode: 'text', text: problem }), [problem]);

  async function syncCurrentMission() {
    try {
      const mission = await getMyCurrentClientMission();
      if (!mission) return null;
      setLoop(current => transition(current, 'found', {
        requestId: mission.request_id,
        missionId: mission.mission_id,
        message: 'Artisan trouvé',
      }));
      return mission;
    } catch {
      return null;
    }
  }

  async function syncJourney() {
    const mission = await syncCurrentMission();
    if (mission) return;

    try {
      const request = await getMyCurrentClientRequest();
      if (!request) return;
      setProblem(request.description || '');
      setCity(request.city || '');
      setLoop(current => transition(current, 'matching', {
        requestId: request.request_id,
        message: 'FIXEO reprend votre recherche.',
      }));
    } catch {
      // Keep the current UI. Server state will be reconciled on the next foreground/poll.
    }
  }

  useEffect(() => {
    let channel: any;
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      if (!data.user) {
        router.replace('/sign-in');
        return;
      }

      void syncJourney();

      channel = watchClientNotifications(data.user.id, (payload: any) => {
        const notification = payload.new || {};
        if (/accept|assign|mission/i.test(String(notification.type || ''))) {
          setLoop(current => transition(current, 'found', {
            message: notification.title || notification.message || 'Artisan trouvé',
          }));
          void syncCurrentMission();
        }
      });
    });

    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') void syncJourney();
    });

    return () => {
      active = false;
      appState.remove();
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
        void syncCurrentMission();
      }
    });

    const interval = setInterval(() => {
      void getClientRequestStatus(requestId).then(status => {
        if (status && ASSIGNED_STATES.has(status)) {
          setLoop(current => transition(current, 'found', { message: 'Artisan trouvé' }));
          void syncCurrentMission();
        }
      }).catch(() => undefined);
    }, 5000);

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [loop.state, loop.requestId]);

  useEffect(() => {
    if (loop.state !== 'found' || loop.missionId) return;
    const timer = setInterval(() => void syncCurrentMission(), 1500);
    return () => clearInterval(timer);
  }, [loop.state, loop.missionId]);

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
    if (submitLockRef.current || loop.state === 'matching' || loop.state === 'found') return;
    submitLockRef.current = true;
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
      if (!idempotencyKeyRef.current) idempotencyKeyRef.current = Crypto.randomUUID();

      const data: any = await createRequest(
        need.serviceCategory,
        normalizedCity,
        need.description,
        idempotencyKeyRef.current,
      );
      const requestId = String(data?.id || data?.request_id || '');
      if (!requestId) throw new Error('REQUEST_ID_MISSING');
      setLoop(current => transition(current, 'matching', { requestId }));
    } catch {
      setLoop(current => transition(current, 'error', {
        message: 'Connexion interrompue. FIXEO vérifie votre demande avant toute nouvelle tentative.',
      }));
      void syncJourney();
    } finally {
      submitLockRef.current = false;
    }
  }

  const requestLocked = loop.state === 'creating' || loop.state === 'matching' || loop.state === 'found';

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
        editable={!requestLocked}
        placeholder="Décrivez le problème"
        style={styles.input}
      />
      <TextInput
        value={city}
        onChangeText={setCity}
        editable={!requestLocked}
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

      {loop.state !== 'found' && (
        <Pressable
          style={[styles.cta, requestLocked && styles.disabled]}
          onPress={() => void send()}
          disabled={!problem || requestLocked}
        >
          <Text style={styles.ctaText}>
            {loop.state === 'creating'
              ? 'RAFI prépare la demande…'
              : loop.state === 'matching'
                ? 'Recherche de l’artisan…'
                : 'Confirmer la demande'}
          </Text>
        </Pressable>
      )}

      {loop.state === 'matching' && (
        <Text style={styles.ok}>Demande confirmée · FIXEO cherche le bon artisan…</Text>
      )}

      {loop.state === 'found' && (
        <View style={styles.foundCard}>
          <Text style={styles.foundTitle}>✓ Artisan trouvé</Text>
          <Text style={styles.foundText}>FIXEO suit maintenant votre intervention jusqu’à sa clôture.</Text>
          {!!loop.missionId && (
            <Pressable
              style={styles.trackButton}
              onPress={() => router.push({
                pathname: '/client-mission/[id]',
                params: { id: loop.missionId },
              } as any)}
            >
              <Text style={styles.trackText}>Suivre l’intervention</Text>
            </Pressable>
          )}
        </View>
      )}

      {loop.state === 'error' && <Text style={styles.error}>{loop.message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, justifyContent: 'center', gap: 16, backgroundColor: '#f7f7f7' },
  brand: { fontSize: 18, fontWeight: '800', letterSpacing: 3, textAlign: 'center' },
  orb: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#111', alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 18, padding: 16, minHeight: 56, backgroundColor: '#fff' },
  rafiMessage: { textAlign: 'center', opacity: 0.72 },
  attachment: { textAlign: 'center', fontWeight: '600' },
  understood: { textAlign: 'center', fontWeight: '600' },
  cta: { backgroundColor: '#111', padding: 18, borderRadius: 18 },
  disabled: { opacity: 0.55 },
  ctaText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  ok: { textAlign: 'center', fontWeight: '700' },
  error: { textAlign: 'center', fontWeight: '600' },
  foundCard: { backgroundColor: '#111', borderRadius: 22, padding: 20, gap: 9 },
  foundTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  foundText: { color: '#ddd', lineHeight: 21 },
  trackButton: { backgroundColor: '#fff', borderRadius: 15, padding: 15, marginTop: 5 },
  trackText: { textAlign: 'center', fontWeight: '800' },
});
