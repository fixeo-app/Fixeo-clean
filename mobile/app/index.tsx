import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { resolveRole } from '@/lib/auth';
import {
  getMyMobileDecisionContext,
  type MobileDecisionCue,
} from '@/lib/decisionCenter';
import { buildDeclaredContext } from '@/lib/rafiContext';
import { DecisionCueCard } from '@/components/DecisionCueCard';
import { RafiContextCard } from '@/components/RafiContextCard';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoCard } from '@/ui/FixeoCard';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { RafiOrb } from '@/ui/RafiOrb';
import { colors, radius, spacing, type } from '@/ui/tokens';

const ASSIGNED_STATES = new Set(['assigned', 'in_progress', 'completed', 'validated']);

type JourneyStatus = 'idle' | 'matching' | 'assigned' | 'in_progress' | 'completed';

export default function Home() {
  const [problem, setProblem] = useState('');
  const [city, setCity] = useState('');
  const [rafiMessage, setRafiMessage] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loop, setLoop] = useState<MagicLoopModel>({ state: 'idle' });
  const [clientReady, setClientReady] = useState(false);
  const [journeyStatus, setJourneyStatus] = useState<JourneyStatus>('idle');
  const [decisionCue, setDecisionCue] = useState<MobileDecisionCue | null>(null);
  const submitLockRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const need = useMemo(() => understandLocally({ mode: 'text', text: problem }), [problem]);
  const rafiContext = useMemo(
    () => buildDeclaredContext({
      description: problem,
      city,
      serviceCategory: need.serviceCategory,
      serviceConfidence: need.confidence,
    }),
    [problem, city, need.serviceCategory, need.confidence],
  );

  async function syncDecision() {
    try {
      const context = await getMyMobileDecisionContext();
      setDecisionCue(context.cue);
      return context.cue;
    } catch {
      setDecisionCue(null);
      return null;
    }
  }

  function actOnDecision(cue: MobileDecisionCue) {
    if (cue.action.kind === 'open_mission') {
      router.push({
        pathname: '/client-mission/[id]',
        params: { id: cue.action.mission_id },
      } as any);
    }
  }

  async function syncCurrentMission() {
    try {
      const mission = await getMyCurrentClientMission();
      if (!mission) {
        setJourneyStatus(current => current === 'matching' ? current : 'idle');
        return null;
      }

      const status = String(mission.request_status || 'assigned') as JourneyStatus;
      setJourneyStatus(
        status === 'in_progress' || status === 'completed' ? status : 'assigned',
      );
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
    await syncDecision();
    const mission = await syncCurrentMission();
    if (mission) return;

    try {
      const request = await getMyCurrentClientRequest();
      if (!request) {
        setJourneyStatus('idle');
        return;
      }
      setProblem(request.description || '');
      setCity(request.city || '');
      setJourneyStatus('matching');
      setLoop(current => transition(current, 'matching', {
        requestId: request.request_id,
        message: 'FIXEO reprend votre recherche.',
      }));
    } catch {
      // Keep the current UI. Server state will be reconciled on next foreground.
    }
  }

  useEffect(() => {
    let channel: any;
    let active = true;
    let isClient = false;

    async function bootstrap() {
      try {
        const { data } = await supabase.auth.getUser();
        if (!active) return;

        if (!data.user) {
          router.replace('/sign-in');
          return;
        }

        const role = await resolveRole();
        if (!active) return;

        if (role === 'artisan') {
          router.replace('/artisan');
          return;
        }

        if (role !== 'client') {
          router.replace('/sign-in');
          return;
        }

        isClient = true;
        setClientReady(true);
        await syncJourney();

        channel = watchClientNotifications(data.user.id, (payload: any) => {
          const notification = payload.new || {};
          if (/accept|assign|mission/i.test(String(notification.type || ''))) {
            setLoop(current => transition(current, 'found', {
              message: notification.title || notification.message || 'Artisan trouvé',
            }));
            void Promise.all([syncCurrentMission(), syncDecision()]);
          }
        });
      } catch {
        if (active) router.replace('/sign-in');
      }
    }

    void bootstrap();

    const appState = AppState.addEventListener('change', state => {
      if (state === 'active' && isClient) void syncJourney();
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
      setRafiMessage('Voix capturée. RAFI la traitera dès que le service est disponible.');
      return;
    }
    try {
      setRafiMessage('RAFI écoute…');
      const transcript = await transcribeRafiVoice(uri);
      setProblem(current => [current.trim(), transcript].filter(Boolean).join(' '));
      setRafiMessage('J’ai compris votre message.');
    } catch {
      setRafiMessage('Je n’ai pas pu traiter cet enregistrement. Vous pouvez écrire à la place.');
    }
  }

  function handlePhoto(uri: string) {
    setPhotoUri(uri);
    setRafiMessage('Photo prête. RAFI peut l’utiliser pour comprendre le problème.');
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
      setJourneyStatus('matching');
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
      setJourneyStatus('idle');
      setLoop(current => transition(current, 'error', {
        message: 'Connexion interrompue. FIXEO vérifie votre demande avant toute nouvelle tentative.',
      }));
      void syncJourney();
    } finally {
      submitLockRef.current = false;
    }
  }

  const requestLocked = loop.state === 'creating' || loop.state === 'matching' || loop.state === 'found';
  const isActiveJourney = journeyStatus !== 'idle';

  const hero = useMemo(() => {
    if (journeyStatus === 'matching') {
      return {
        eyebrow: 'FIXEO CHERCHE POUR VOUS',
        title: 'On trouve le bon artisan.',
        subtitle: 'Vous pouvez poser le téléphone. FIXEO suit la recherche.',
        orb: 'working' as const,
      };
    }
    if (journeyStatus === 'in_progress') {
      return {
        eyebrow: 'INTERVENTION EN COURS',
        title: 'FIXEO suit chaque étape.',
        subtitle: 'Votre artisan est sur la mission. Vous gardez le contrôle.',
        orb: 'working' as const,
      };
    }
    if (journeyStatus === 'completed') {
      return {
        eyebrow: 'INTERVENTION TERMINÉE',
        title: 'Une dernière vérification.',
        subtitle: 'Consultez les preuves puis confirmez la bonne fin de mission.',
        orb: 'success' as const,
      };
    }
    if (journeyStatus === 'assigned') {
      return {
        eyebrow: 'ARTISAN TROUVÉ',
        title: 'FIXEO a pris le relais.',
        subtitle: 'Votre intervention est désormais suivie jusqu’à sa clôture.',
        orb: 'success' as const,
      };
    }
    return {
      eyebrow: 'RAFI · VOTRE ASSISTANT FIXEO',
      title: 'Que puis-je régler pour vous ?',
      subtitle: 'Parlez, montrez ou écrivez. RAFI comprend, FIXEO agit.',
      orb: 'idle' as const,
    };
  }, [journeyStatus]);

  if (!clientReady) {
    return (
      <FixeoScreen style={styles.loadingRoot}>
        <Text style={styles.brand}>FIXEO</Text>
        <RafiOrb size={72} mode="working" />
        <Text style={styles.loadingText}>Ouverture de votre espace…</Text>
      </FixeoScreen>
    );
  }

  return (
    <FixeoScreen padded={false}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.brand}>FIXEO</Text>
          <RafiOrb size={96} mode={hero.orb} />
          <Text style={styles.eyebrow}>{hero.eyebrow}</Text>
          <Text style={styles.title}>{hero.title}</Text>
          <Text style={styles.subtitle}>{hero.subtitle}</Text>
        </View>

        {!isActiveJourney && (
          <View style={styles.inputStack}>
            <RafiInputRail
              onVoiceReady={(uri) => void handleVoice(uri)}
              onPhotoReady={handlePhoto}
            />

            <TextInput
              value={problem}
              onChangeText={setProblem}
              editable={!requestLocked}
              placeholder="Décrivez simplement ce qui se passe"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <TextInput
              value={city}
              onChangeText={setCity}
              editable={!requestLocked}
              placeholder="Votre ville"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
              style={styles.input}
            />

            {!!rafiMessage && (
              <FixeoCard tone="muted" style={styles.rafiCard}>
                <Text style={styles.rafiLabel}>RAFI</Text>
                <Text style={styles.rafiMessage}>{rafiMessage}</Text>
              </FixeoCard>
            )}

            {!!photoUri && <Text style={styles.attachment}>✓ Photo ajoutée au contexte</Text>}

            {problem.length > 3 && (
              <>
                <View style={styles.understoodRow}>
                  <Text style={styles.understoodDot}>●</Text>
                  <Text style={styles.understood}>
                    {need.serviceCategory}{need.confidence === 'low' ? ' · à confirmer' : ' · compris'}
                  </Text>
                </View>
                <RafiContextCard snapshot={rafiContext} />
              </>
            )}

            <FixeoAction
              label={
                loop.state === 'creating'
                  ? 'RAFI prépare votre demande…'
                  : 'Confier le problème à FIXEO'
              }
              onPress={() => void send()}
              disabled={!problem || requestLocked}
            />

            {loop.state === 'error' && (
              <Text style={styles.error}>{loop.message}</Text>
            )}
          </View>
        )}

        {isActiveJourney && decisionCue && (
          <DecisionCueCard
            cue={decisionCue}
            onAction={() => actOnDecision(decisionCue)}
          />
        )}

        {isActiveJourney && !decisionCue && journeyStatus === 'matching' && (
          <FixeoCard tone="dark" style={styles.journeyCard}>
            <Text style={styles.inverseEyebrow}>RECHERCHE ACTIVE</Text>
            <Text style={styles.inverseTitle}>Le réseau FIXEO travaille.</Text>
            <Text style={styles.inverseBody}>
              {problem || 'Votre demande'}{city ? ` · ${city}` : ''}
            </Text>
            <View style={styles.pulseLine}>
              <View style={styles.pulseDot} />
              <Text style={styles.pulseText}>Matching en cours</Text>
            </View>
          </FixeoCard>
        )}

        {isActiveJourney && !decisionCue && journeyStatus !== 'matching' && loop.missionId && (
          <FixeoCard tone="dark" style={styles.journeyCard}>
            <Text style={styles.inverseEyebrow}>VOTRE INTERVENTION</Text>
            <Text style={styles.inverseTitle}>
              {journeyStatus === 'completed' ? 'À vous de confirmer.' : 'FIXEO reste aux commandes.'}
            </Text>
            <FixeoAction
              label={journeyStatus === 'completed' ? 'Vérifier et valider' : 'Suivre l’intervention'}
              variant="secondary"
              onPress={() => router.push({
                pathname: '/client-mission/[id]',
                params: { id: loop.missionId },
              } as any)}
            />
          </FixeoCard>
        )}

        <View style={styles.pushWrap}>
          <PushOptIn compact />
        </View>
      </ScrollView>
    </FixeoScreen>
  );
}

const styles = StyleSheet.create({
  loadingRoot: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  loadingText: {
    fontSize: type.body,
    fontWeight: '700',
    color: colors.textMuted,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  hero: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  brand: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 4,
    color: colors.text,
  },
  eyebrow: {
    marginTop: spacing.sm,
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.8,
    color: colors.textMuted,
    textAlign: 'center',
  },
  title: {
    fontSize: type.display,
    lineHeight: 47,
    fontWeight: '900',
    letterSpacing: -1.6,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    maxWidth: 330,
    fontSize: type.body,
    lineHeight: 23,
    color: colors.textMuted,
    textAlign: 'center',
  },
  inputStack: {
    gap: spacing.md,
  },
  input: {
    minHeight: 62,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    fontSize: type.body,
  },
  rafiCard: {
    gap: spacing.xs,
  },
  rafiLabel: {
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: colors.textMuted,
  },
  rafiMessage: {
    fontSize: type.body,
    lineHeight: 22,
    color: colors.text,
  },
  attachment: {
    textAlign: 'center',
    color: colors.success,
    fontWeight: '800',
  },
  understoodRow: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  understoodDot: {
    fontSize: 10,
    color: colors.success,
  },
  understood: {
    fontWeight: '800',
    color: colors.text,
  },
  error: {
    textAlign: 'center',
    color: colors.danger,
    fontWeight: '700',
    lineHeight: 21,
  },
  journeyCard: {
    gap: spacing.md,
  },
  inverseEyebrow: {
    color: '#9B9B9F',
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.7,
  },
  inverseTitle: {
    color: colors.inverse,
    fontSize: 27,
    lineHeight: 32,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  inverseBody: {
    color: '#D8D8DA',
    fontSize: type.body,
    lineHeight: 22,
  },
  pulseLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.inverse,
  },
  pulseText: {
    color: colors.inverse,
    fontWeight: '800',
  },
  pushWrap: {
    paddingTop: spacing.xs,
  },
});
