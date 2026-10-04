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
import {
  analyzeMobileDiagnosticPhoto,
  type MobileDiagnosticResult,
} from '@/lib/mobileDiagnostic';
import { MagicLoopModel, transition } from '@/lib/magicLoopState';
import { RafiInputRail } from '@/components/RafiInputRail';
import { PushOptIn } from '@/components/PushOptIn';
import { MobileShell } from '@/components/MobileShell';
import { EntryStage } from '@/components/EntryStage';
import { getStableSession, resolveRole } from '@/lib/auth';
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
import type { RafiOrbMode } from '@/ui/rafiOrbMotion';
import { getClientRafiPresence } from '@/ui/rafiPresence';
import { colors, radius, spacing, type } from '@/ui/tokens';

const ASSIGNED_STATES = new Set(['assigned', 'in_progress', 'completed', 'validated']);

type JourneyStatus = 'idle' | 'matching' | 'assigned' | 'in_progress' | 'completed';

export default function Home() {
  const [problem, setProblem] = useState('');
  const [problemConfirmedFromRafi, setProblemConfirmedFromRafi] = useState(false);
  const [city, setCity] = useState('');
  const [rafiMessage, setRafiMessage] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoMimeType, setPhotoMimeType] = useState('image/jpeg');
  const [photoDiagnostic, setPhotoDiagnostic] = useState<MobileDiagnosticResult | null>(null);
  const [photoDiagnosticBusy, setPhotoDiagnosticBusy] = useState(false);
  const [loop, setLoop] = useState<MagicLoopModel>({ state: 'idle' });
  const [clientReady, setClientReady] = useState(false);
  const [journeyStatus, setJourneyStatus] = useState<JourneyStatus>('idle');
  const [decisionCue, setDecisionCue] = useState<MobileDecisionCue | null>(null);
  const [rafiOrbOverride, setRafiOrbOverride] = useState<RafiOrbMode | null>(null);
  const problemInputRef = useRef<TextInput>(null);
  const submitLockRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const need = useMemo(() => understandLocally({ mode: 'text', text: problem }), [problem]);
  const rafiContext = useMemo(
    () => buildDeclaredContext({
      description: problem,
      descriptionProvenance: problemConfirmedFromRafi ? 'user_confirmed' : 'user_declared',
      city,
      serviceCategory: need.serviceCategory,
      serviceConfidence: need.confidence,
    }),
    [problem, problemConfirmedFromRafi, city, need.serviceCategory, need.confidence],
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
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    async function bootstrap(attempt = 0) {
      try {
        const session = await getStableSession();
        if (!active) return;

        if (!session) {
          router.replace('/sign-in');
          return;
        }

        const role = await resolveRole(session.user.id);
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

        channel = watchClientNotifications(session.user.id, (payload: any) => {
          const notification = payload.new || {};
          if (/accept|assign|mission/i.test(String(notification.type || ''))) {
            setLoop(current => transition(current, 'found', {
              message: notification.title || notification.message || 'Artisan trouvé',
            }));
            void Promise.all([syncCurrentMission(), syncDecision()]);
          }
        });
      } catch (error: any) {
        if (!active) return;

        const reason = String(error?.message || '');
        if (reason === 'AUTH_REQUIRED' || reason === 'ROLE_INVALID') {
          router.replace('/sign-in');
          return;
        }

        retryTimer = setTimeout(
          () => void bootstrap(attempt + 1),
          Math.min(3000, 700 + attempt * 500),
        );
      }
    }

    void bootstrap();

    const appState = AppState.addEventListener('change', state => {
      if (state === 'active' && isClient) void syncJourney();
    });

    return () => {
      active = false;
      appState.remove();
      if (retryTimer) clearTimeout(retryTimer);
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
    setRafiOrbOverride('understanding');
    if (!hasRafiServerGateway()) {
      setRafiMessage('Voix capturée. RAFI la traitera dès que le service est disponible.');
      setRafiOrbOverride(null);
      return;
    }
    try {
      setRafiMessage('RAFI transcrit votre message…');
      const transcript = await transcribeRafiVoice(uri);
      setProblemConfirmedFromRafi(false);
      setProblem(current => [current.trim(), transcript].filter(Boolean).join(' '));
      setRafiMessage('J’ai compris votre message.');
    } catch {
      setRafiMessage('Je n’ai pas pu traiter cet enregistrement. Vous pouvez écrire à la place.');
    } finally {
      setRafiOrbOverride(null);
    }
  }

  function handlePhoto(uri: string, mimeType = 'image/jpeg') {
    setPhotoUri(uri);
    setPhotoMimeType(mimeType);
    setPhotoDiagnostic(null);
    setRafiMessage('Photo prête. Vous décidez quand RAFI peut l’analyser.');
  }

  async function analyzePhoto() {
    if (!photoUri || photoDiagnosticBusy) return;
    if (!city.trim()) {
      setRafiMessage('Indiquez votre ville avant de lancer l’analyse photo.');
      return;
    }
    if (!hasRafiServerGateway()) {
      setRafiMessage('Analyse photo indisponible sur ce build.');
      return;
    }

    setPhotoDiagnosticBusy(true);
    setRafiOrbOverride('understanding');
    setRafiMessage('RAFI analyse la photo de façon privée…');
    try {
      const result = await analyzeMobileDiagnosticPhoto({
        uri: photoUri,
        mimeType: photoMimeType,
        city,
        description: problem,
      });
      setPhotoDiagnostic(result);
      setRafiMessage(
        result.safety?.stop
          ? 'RAFI a détecté un signal de sécurité à traiter en priorité.'
          : 'Analyse prête. Confirmez uniquement ce qui correspond à votre situation.',
      );
    } catch (error: any) {
      const code = String(error?.message || '');
      setRafiMessage(
        code === 'CITY_NOT_SUPPORTED'
          ? 'Choisissez une ville FIXEO prise en charge pour lancer l’analyse.'
          : code === 'DIAGNOSTIC_QUOTA_EXCEEDED'
            ? 'Le quota d’analyse est atteint pour aujourd’hui. Vous pouvez continuer en texte.'
            : 'RAFI n’a pas pu analyser cette photo. Vous pouvez continuer sans elle.',
      );
    } finally {
      setPhotoDiagnosticBusy(false);
      setRafiOrbOverride(null);
    }
  }

  function confirmPhotoDiagnostic() {
    if (!photoDiagnostic?.problem?.value) return;
    setProblem(photoDiagnostic.problem.value);
    setProblemConfirmedFromRafi(true);
    setRafiMessage('✓ Description confirmée par vous à partir de l’analyse RAFI.');
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

      if (need.needsConfirmation) {
        setRafiMessage(
          'RAFI a besoin d\'un detail avant de chercher. Precisez le probleme avant la recherche.',
        );
        setJourneyStatus('idle');
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
      };
    }
    if (journeyStatus === 'in_progress') {
      return {
        eyebrow: 'INTERVENTION EN COURS',
        title: 'FIXEO suit chaque étape.',
        subtitle: 'Votre artisan est sur la mission. Vous gardez le contrôle.',
      };
    }
    if (journeyStatus === 'completed') {
      return {
        eyebrow: 'INTERVENTION TERMINÉE',
        title: 'Une dernière vérification.',
        subtitle: 'Consultez les preuves puis confirmez la bonne fin de mission.',
      };
    }
    if (journeyStatus === 'assigned') {
      return {
        eyebrow: 'ARTISAN TROUVÉ',
        title: 'FIXEO a pris le relais.',
        subtitle: 'Votre intervention est désormais suivie jusqu’à sa clôture.',
      };
    }
    return {
      eyebrow: 'RAFI · VOTRE ASSISTANT FIXEO',
      title: 'Que puis-je régler pour vous ?',
      subtitle: 'Parlez, montrez ou écrivez. RAFI comprend, FIXEO agit.',
    };
  }, [journeyStatus]);

  const effectiveOrbMode = getClientRafiPresence({
    override: rafiOrbOverride, loopState: loop.state, journeyStatus,
    photoDiagnosticBusy, safetyStop: !isActiveJourney && photoDiagnostic?.safety?.stop,
  });

  if (!clientReady) {
    return (
      <FixeoScreen style={styles.loadingRoot}>
        <EntryStage
          eyebrow="RAFI · FIXEO"
          title="Ouverture de votre espace."
          subtitle="RAFI sécurise votre session et reprend exactement votre contexte."
          status="Synchronisation de votre univers…"
          mode="working"
          compact
        />
      </FixeoScreen>
    );
  }

  return (
    <FixeoScreen padded={false} header={
        <MobileShell
          universe="client"
          activeKey="rafi"
          orbMode={effectiveOrbMode}
          statusLabel={
            journeyStatus === 'matching'
              ? 'Recherche en cours'
              : journeyStatus === 'assigned'
                ? 'Artisan affecté'
                : journeyStatus === 'in_progress'
                  ? 'Intervention en cours'
                  : journeyStatus === 'completed'
                    ? 'Validation requise'
                    : 'RAFI est prêt'
          }
          rightActionLabel="Mon espace"
          rightDestination="/client-workspace"
          rightNavigation="detail"
        />
      }>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <RafiOrb size={96} mode={effectiveOrbMode} eventKey={loop.missionId || loop.requestId} />
          <Text style={styles.eyebrow}>{hero.eyebrow}</Text>
          <Text style={styles.title}>{hero.title}</Text>
          <Text style={styles.subtitle}>{hero.subtitle}</Text>
        </View>

        {!isActiveJourney && (
          <View style={styles.inputStack}>
            <RafiInputRail
              onWrite={() => problemInputRef.current?.focus()}
              onVoiceReady={(uri) => void handleVoice(uri)}
              onPhotoReady={(uri, mimeType) => handlePhoto(uri, mimeType)}
              onListeningChange={(listening) => {
                setRafiOrbOverride(listening ? 'listening' : null);
              }}
            />

            <TextInput
              ref={problemInputRef}
              accessibilityLabel="Décrivez le problème"
              value={problem}
              onChangeText={(value) => {
                setProblemConfirmedFromRafi(false);
                setProblem(value);
              }}
              editable={!requestLocked}
              placeholder="Décrivez simplement ce qui se passe"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <TextInput
              accessibilityLabel="Votre ville"
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

            {!!photoUri && (
              <FixeoCard tone="muted" style={styles.photoCard}>
                <Text style={styles.rafiLabel}>PHOTO PRIVÉE</Text>
                <Text style={styles.rafiMessage}>
                  La photo n’est pas une demande. Elle est analysée uniquement si vous le choisissez.
                </Text>
                {!photoDiagnostic && (
                  <FixeoAction
                    label={photoDiagnosticBusy ? 'RAFI analyse…' : 'Analyser la photo avec RAFI'}
                    variant="secondary"
                    disabled={photoDiagnosticBusy}
                    onPress={() => void analyzePhoto()}
                  />
                )}
              </FixeoCard>
            )}

            {!!photoDiagnostic && (
              <FixeoCard style={styles.diagnosticCard}>
                <Text style={styles.rafiLabel}>RAFI · ANALYSE INDICATIVE</Text>
                <Text style={styles.diagnosticTitle}>
                  {photoDiagnostic.problem?.value || 'Analyse à confirmer'}
                </Text>
                <View style={styles.diagnosticMetaRow}>
                  <Text style={styles.diagnosticMeta}>
                    Métier pressenti · {photoDiagnostic.trade?.value || 'à confirmer'}
                  </Text>
                  <Text style={styles.diagnosticMeta}>
                    Urgence · {photoDiagnostic.urgency?.value || 'à confirmer'}
                  </Text>
                </View>
                {!!photoDiagnostic.facts?.filter(fact => fact.provenance === 'observed').length && (
                  <View style={styles.observedBlock}>
                    <Text style={styles.observedLabel}>OBSERVÉ SUR LA PHOTO</Text>
                    {photoDiagnostic.facts
                      .filter(fact => fact.provenance === 'observed')
                      .slice(0, 3)
                      .map((fact, index) => (
                        <Text key={fact.key + index} style={styles.observedText}>• {fact.value}</Text>
                      ))}
                  </View>
                )}
                <Text style={styles.diagnosticDisclaimer}>
                  Hypothèse RAFI — jamais un diagnostic professionnel ni un prix confirmé.
                </Text>
                <FixeoAction
                  label="Cette description correspond"
                  onPress={confirmPhotoDiagnostic}
                />
              </FixeoCard>
            )}

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
                  : need.needsConfirmation
                    ? 'Préciser le problème'
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
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  hero: {
    alignItems: 'center',
    paddingTop: spacing.sm,
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
  photoCard: {
    gap: spacing.md,
  },
  diagnosticCard: {
    gap: spacing.md,
  },
  diagnosticTitle: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
    color: colors.text,
  },
  diagnosticMetaRow: {
    gap: spacing.xs,
  },
  diagnosticMeta: {
    color: colors.textMuted,
    fontWeight: '700',
  },
  observedBlock: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  observedLabel: {
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: colors.textMuted,
  },
  observedText: {
    color: colors.text,
    lineHeight: 20,
  },
  diagnosticDisclaimer: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
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
