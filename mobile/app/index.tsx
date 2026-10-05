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
  type MissionSnapshot,
} from '@/lib/missionTerrain';
import { understandLocally } from '@/lib/rafi';
import { hasRafiServerGateway, transcribeRafiVoice } from '@/lib/rafiGateway';
import {
  analyzeMobileDiagnosticPhoto,
  type MobileDiagnosticResult,
} from '@/lib/mobileDiagnostic';
import { analyzePersistedMobilePhoto } from '@/lib/mobileDiagnosticReference';
import { ClientIntelligence } from '@/components/ClientIntelligence';
import { canonicalCity } from '@/lib/clientLocation';
import { wantsEstimate, type ClientIntelligenceContext } from '@/lib/clientIntelligence';
import { MagicLoopModel, transition } from '@/lib/magicLoopState';
import { RafiInputRail } from '@/components/RafiInputRail';
import { ClientDiagnostic } from '@/components/ClientDiagnostic';
import { canSendClientIntake } from '@/lib/clientDiagnostic';
import { ClientLocationField } from '@/components/ClientLocationField';
import { MobileShell } from '@/components/MobileShell';
import { EntryStage } from '@/components/EntryStage';
import { withMobileDeadline } from '@/lib/mobileResilience';
import { getStableSession, resolveRole } from '@/lib/auth';
import {
  getMyMobileDecisionContext,
  type MobileDecisionCue,
} from '@/lib/decisionCenter';
import { buildDeclaredContext } from '@/lib/rafiContext';
import { RAFI_PROVENANCE_LABELS } from '@/lib/rafiContext';
import { ClientHero, ClientSection, clientStyles } from '@/components/ClientEditorial';
import { clientHomeCopy } from '@/lib/clientExperience';
import { FixeoText } from '@/ui/FixeoText';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoScreen } from '@/ui/FixeoScreen';
import type { RafiOrbMode } from '@/ui/rafiOrbMotion';
import { getClientRafiPresence } from '@/ui/rafiPresence';
import { colors, semanticColors, space, typography, spacing } from '@/ui/tokens';

const ASSIGNED_STATES = new Set(['assigned', 'in_progress', 'completed', 'validated']);

type JourneyStatus = 'idle' | 'matching' | 'assigned' | 'in_progress' | 'completed';

export default function Home() {
  const [estimateContext, setEstimateContext] = useState<ClientIntelligenceContext | null>(null);
  const [diagnosticReference, setDiagnosticReference] = useState<string | undefined>();
  const [diagnosticCity, setDiagnosticCity] = useState('');
  const [persistPhoto, setPersistPhoto] = useState(false);
  const [safetyMessage, setSafetyMessage] = useState('Ne poursuivez pas cette intervention. Faites vérifier la situation par un professionnel.');
  const [safetyStopped, setSafetyStopped] = useState(false);
  const [confirmDirect, setConfirmDirect] = useState(false);
  const photoLock = useRef(false);
  const [writing, setWriting] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [missionSummary, setMissionSummary] = useState<MissionSnapshot | null>(null);
  const [problem, setProblem] = useState('');
  const [problemConfirmedFromRafi, setProblemConfirmedFromRafi] = useState(false);
  const [city, setCity] = useState('');
  const [rafiMessage, setRafiMessage] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoMimeType, setPhotoMimeType] = useState('image/jpeg');
  const [photoDiagnostic, setPhotoDiagnostic] = useState<MobileDiagnosticResult | null>(null);
  const [reviewedDiagnostic, setReviewedDiagnostic] = useState<MobileDiagnosticResult | null>(null);
  const [photoDiagnosticBusy, setPhotoDiagnosticBusy] = useState(false);
  const [loop, setLoop] = useState<MagicLoopModel>({ state: 'idle' });
  const [sessionError, setSessionError] = useState(false);
  const [sessionRetry, setSessionRetry] = useState(0);
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
      setMissionSummary(mission);
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
        const session = await withMobileDeadline(getStableSession());
        if (!active) return;

        if (!session) {
          router.replace('/sign-in');
          return;
        }

        const role = await withMobileDeadline(resolveRole(session.user.id));
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

        if (attempt >= 2) { setSessionError(true); return; }
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
  }, [sessionRetry]);

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
    if (idempotencyKeyRef.current || safetyStopped || photoLock.current) return;
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
    if (safetyStopped || photoLock.current || idempotencyKeyRef.current) return;
    setDiagnosticReference(undefined); setPersistPhoto(false); setReviewedDiagnostic(null);
    setPhotoUri(uri);
    setPhotoMimeType(mimeType);
    setPhotoDiagnostic(null);
    setRafiMessage('Photo prête. Vous décidez quand RAFI peut l’analyser.');
  }

  async function analyzePhoto() {
    if (!photoUri || photoLock.current || safetyStopped) return;
    if (!city.trim()) {
      setRafiMessage('Indiquez votre ville avant de lancer l’analyse photo.');
      return;
    }
    if (!hasRafiServerGateway()) {
      setRafiMessage('Analyse photo indisponible sur ce build.');
      return;
    }

    photoLock.current = true;
    setPhotoDiagnosticBusy(true);
    setRafiOrbOverride('understanding');
    setRafiMessage('RAFI analyse la photo de façon privée…');
    try {
      const input = { uri: photoUri, mimeType: photoMimeType, city: canonicalCity(city) || city.trim(), description: problem };
      const persisted = persistPhoto ? await analyzePersistedMobilePhoto({ ...input, consentVersion: 'diagnostic-privacy-v1' }) : null;
      const result = persisted ? persisted.result : await analyzeMobileDiagnosticPhoto(input);
      setDiagnosticReference(persisted?.diagnostic_reference || undefined);
      setDiagnosticCity(input.city);
      if (result.safety?.stop) setSafetyStopped(true);
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
      photoLock.current = false;
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
    } catch (error: any) {
      if (String(error?.message || '').includes('CITY_NOT_SUPPORTED')) {
        idempotencyKeyRef.current = null;
        setJourneyStatus('idle');
        setLoop(current => transition(current, 'error', { message: 'Cette ville n’est pas encore prise en charge. Choisissez une autre ville.' }));
        return;
      }
      setJourneyStatus('idle');
      setLoop(current => transition(current, 'error', {
        message: 'Connexion interrompue. FIXEO vérifie votre demande avant toute nouvelle tentative.',
      }));
      void syncJourney();
    } finally {
      submitLockRef.current = false;
    }
  }

  const intakeReady = !safetyStopped && canSendClientIntake({ busy: photoDiagnosticBusy, diagnostic: photoDiagnostic, reviewed: reviewedDiagnostic === photoDiagnostic });
  function sendQualifiedIntake() {
    if (!intakeReady) return;
    if (!city.trim()) { setRafiMessage('Indiquez le lieu d’intervention pour continuer.'); return; }
    if (need.needsConfirmation) { setRafiMessage('Précisez le problème ou demandez à RAFI de vous orienter.'); return; }
    setConfirmDirect(true);
  }

  function openEstimate() {
    if (!intakeReady || !problem.trim() || estimateContext || idempotencyKeyRef.current) return;
    const normalized = canonicalCity(city);
    if (!normalized) { setRafiMessage('Choisissez une ville FIXEO pour cette estimation.'); return; }
    if (diagnosticReference && diagnosticCity !== normalized) {
      setRafiMessage('Cette analyse correspond à une autre ville. Reprenez la photo pour le lieu choisi.'); return;
    }
    setEstimateContext({ city: normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '-'), description: problem.trim(), diagnosticReference });
  }
  function intelligenceCreated(requestId: string) {
    setEstimateContext(null); setJourneyStatus('matching');
    setLoop(current => transition(current, 'matching', { requestId }));
  }

  const requestLocked = loop.state === 'creating' || loop.state === 'matching' || loop.state === 'found';
  const isActiveJourney = journeyStatus !== 'idle';

  const effectiveOrbMode = getClientRafiPresence({
    override: rafiOrbOverride, loopState: loop.state, journeyStatus,
    photoDiagnosticBusy, safetyStop: !isActiveJourney && (safetyStopped || photoDiagnostic?.safety?.stop),
  });

  const hero = clientHomeCopy(journeyStatus, effectiveOrbMode, loop.state === 'creating');
  const inputExpanded = writing || !!problem || !!photoUri || !!rafiMessage;
  useEffect(() => {
    if (writing) problemInputRef.current?.focus();
  }, [writing]);

  if (!clientReady) {
    return (
      <FixeoScreen style={styles.loadingRoot}>
        <EntryStage
          eyebrow="RAFI · FIXEO"
          title={sessionError ? 'Votre espace est indisponible.' : 'Ouverture de votre espace.'}
          subtitle={sessionError ? 'Vérifiez votre connexion, puis réessayez.' : 'RAFI sécurise votre session et reprend exactement votre contexte.'}
          status={sessionError ? undefined : 'Synchronisation de votre univers…'}
          mode={sessionError ? 'attention' : 'working'}
          compact
        />
        {sessionError && <FixeoAction label="Réessayer l’ouverture de mon espace" onPress={() => { setSessionError(false); setSessionRetry(value => value + 1); }} />}
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
        {(isActiveJourney || !safetyStopped) && <ClientHero {...hero} compact={!!estimateContext || confirmDirect || inputExpanded} mode={effectiveOrbMode} eventKey={loop.missionId || loop.requestId} />}

        {!isActiveJourney && safetyStopped && !photoDiagnostic?.safety.stop && <ClientSection testID="client-safety-stop">
          <ClientHero eyebrow="RAFI · SÉCURITÉ" title="La sécurité d’abord." detail={safetyMessage} mode="attention" compact />
          <FixeoAction label="Revenir à mon espace" variant="secondary" onPress={() => router.push('/client-workspace')} />
        </ClientSection>}
        {!isActiveJourney && photoDiagnostic?.safety.stop && <ClientDiagnostic result={photoDiagnostic} confirmed={false} onConfirm={() => {}} onExit={() => router.push('/client-workspace')} />}
        {!isActiveJourney && !safetyStopped && (
          <View style={styles.inputStack}>
            {!estimateContext && !confirmDirect && !photoDiagnosticBusy && !idempotencyKeyRef.current && <RafiInputRail
              onWrite={() => { setWriting(true); problemInputRef.current?.focus(); }}
              onVoiceReady={(uri) => void handleVoice(uri)}
              onPhotoReady={(uri, mimeType) => handlePhoto(uri, mimeType)}
              onListeningChange={(listening) => {
                setRafiOrbOverride(listening ? 'listening' : null);
              }}
            />}

            {!inputExpanded && <FixeoText variant="caption" tone="tertiary" style={styles.center}>
              Une demande commence avec vous.
            </FixeoText>}
            {estimateContext && <ClientIntelligence context={estimateContext} onCreated={intelligenceCreated} onStop={message => { if (message) setSafetyMessage(message); setSafetyStopped(true); }} onClose={() => setEstimateContext(null)} />}
            {confirmDirect && <ClientSection testID="client-direct-confirmation" label="Votre demande">
              <FixeoText variant="heading">{problem}</FixeoText>
              <FixeoText tone="secondary">{city} · {need.serviceCategory}</FixeoText>
              <FixeoText variant="supporting">FIXEO recherche un artisan. Le prix sera annoncé avant intervention.</FixeoText>
              <FixeoAction label="Confirmer et chercher un artisan" disabled={requestLocked} onPress={() => { setConfirmDirect(false); void send(); }} />
              <FixeoAction label="Modifier ma demande" variant="ghost" onPress={() => setConfirmDirect(false)} />
            </ClientSection>}
            {inputExpanded && !estimateContext && !confirmDirect && <View testID="client-request-fields" style={styles.inputStack}>
            <TextInput
              ref={problemInputRef}
              accessibilityLabel="Décrivez le problème"
              value={problem}
              onChangeText={(value) => {
                setProblemConfirmedFromRafi(false);
                setProblem(value);
              }}
              editable={!requestLocked && !photoDiagnosticBusy && !(loop.state === 'error' && !!idempotencyKeyRef.current)}
              multiline
              placeholder="Décrivez simplement ce qui se passe"
              placeholderTextColor={colors.textMuted}
              style={clientStyles.input}
            />
            {(!!problem.trim() || !!photoUri) && <ClientLocationField city={city} onChangeCity={setCity} disabled={requestLocked || photoDiagnosticBusy || (loop.state === 'error' && !!idempotencyKeyRef.current)} />}

            {!!rafiMessage && (
              <ClientSection>
                <Text style={styles.rafiLabel}>RAFI</Text>
                <Text style={styles.rafiMessage} accessibilityLiveRegion="polite">{rafiMessage}</Text>
              </ClientSection>
            )}

            {!!photoUri && (
              <ClientSection surface>
                <Text style={styles.rafiLabel}>PHOTO PRIVÉE</Text>
                <Text style={styles.rafiMessage}>
                  La photo n’est pas une demande. Elle est analysée uniquement si vous le choisissez.
                </Text>
                {!photoDiagnostic && <FixeoAction label={persistPhoto ? '✓ Conserver l’analyse pour la suite' : 'Conserver l’analyse pour la suite'} variant="ghost" disabled={photoDiagnosticBusy} accessibilityRole="checkbox" accessibilityState={{ checked: persistPhoto }} onPress={() => setPersistPhoto(value => !value)} />}
                {!photoDiagnostic && persistPhoto && <FixeoText variant="caption" tone="secondary">J’accepte la conservation privée de la photo nettoyée et de l’analyse pour poursuivre ce besoin. La photo originale n’est pas conservée.</FixeoText>}
                {!photoDiagnostic && (
                  <FixeoAction
                    label={photoDiagnosticBusy ? 'RAFI analyse…' : 'Analyser la photo avec RAFI'}
                    variant="secondary"
                    disabled={photoDiagnosticBusy}
                    onPress={() => void analyzePhoto()}
                  />
                )}
              </ClientSection>
            )}

            {photoDiagnostic && !photoDiagnostic.safety.stop && <ClientDiagnostic
              key={photoUri}
              result={photoDiagnostic}
              confirmed={reviewedDiagnostic === photoDiagnostic}
              onConfirm={(description) => {
                confirmPhotoDiagnostic();
                setProblem(description);
                setReviewedDiagnostic(photoDiagnostic);
              }}
            />}

            {problem.length > 3 && (
              <>
                <View style={styles.understoodRow}>
                  <Text style={styles.understoodDot}>●</Text>
                  <Text style={styles.understood}>
                    {need.serviceCategory}{need.confidence === 'low' ? ' · à confirmer' : ' · compris'}
                  </Text>
                </View>
                <FixeoAction label={showContext ? 'Masquer le récapitulatif' : 'Ce que RAFI a compris'}
                  variant="ghost" accessibilityState={{ expanded: showContext }} onPress={() => setShowContext(value => !value)} />
                {showContext && <ClientSection label="Votre récapitulatif">
                  {rafiContext.facts.map((fact, index) => <View key={fact.label + index} style={styles.fact}>
                    <FixeoText variant="caption" tone="secondary">{fact.label} · {RAFI_PROVENANCE_LABELS[fact.provenance]}</FixeoText>
                    <FixeoText>{fact.value}</FixeoText>
                  </View>)}
                </ClientSection>}
              </>
            )}

            {problem.trim().length >= 8 && <FixeoAction label={wantsEstimate(problem) ? 'Obtenir mon estimation avec RAFI' : 'Voir aussi une estimation'} variant={wantsEstimate(problem) ? 'primary' : 'ghost'} disabled={requestLocked || !intakeReady} onPress={openEstimate} />}
            <FixeoAction
              label={
                loop.state === 'creating'
                  ? 'RAFI prépare votre demande…'
                  : need.needsConfirmation
                    ? 'Préciser le problème'
                    : 'Confier le problème à FIXEO'
              }
              variant={!intakeReady || wantsEstimate(problem) ? 'secondary' : 'primary'}
              onPress={sendQualifiedIntake}
              disabled={!problem || requestLocked || !intakeReady}
            />

            {loop.state === 'error' && (
              <Text accessibilityRole="alert" style={styles.error}>{loop.message}</Text>
            )}
            </View>}
          </View>
        )}

        {isActiveJourney && loop.state !== 'creating' && (
          <ClientSection testID="client-active-situation">
            {missionSummary?.artisan_name ? <View style={styles.artisan}>
              <FixeoText variant="caption" tone="secondary">VOTRE ARTISAN</FixeoText>
              <FixeoText variant="heading">{missionSummary.artisan_name}</FixeoText>
              <FixeoText variant="supporting" tone="secondary">
                {[missionSummary.service_category, missionSummary.city].filter(Boolean).join(' · ')}
              </FixeoText>
              {missionSummary.artisan_verified ? <FixeoText variant="caption" tone="secondary">Profil vérifié FIXEO</FixeoText> : null}
            </View> : null}
            {journeyStatus === 'matching' && (problem || city) ? <View style={styles.request}>
              <FixeoText variant="caption" tone="secondary">VOTRE DEMANDE</FixeoText>
              {!!problem && <FixeoText>{problem}</FixeoText>}
              {!!city && <FixeoText variant="supporting" tone="secondary">{city}</FixeoText>}
            </View> : null}
            {decisionCue ? <FixeoText variant="supporting" tone="secondary" style={styles.center}>{decisionCue.detail}</FixeoText> : null}
            {decisionCue?.action.kind === 'open_mission' ? <FixeoAction
              testID="client-primary-action"
              label={journeyStatus === 'completed' ? 'Vérifier et valider' : 'Suivre l’intervention'}
              onPress={() => actOnDecision(decisionCue)}
            /> : loop.missionId && journeyStatus !== 'matching' ? <FixeoAction
              testID="client-primary-action"
              label={journeyStatus === 'completed' ? 'Vérifier et valider' : 'Suivre l’intervention'}
              onPress={() => router.push({ pathname: '/client-mission/[id]', params: { id: loop.missionId } } as any)}
            /> : null}
          </ClientSection>
        )}
      </ScrollView>
    </FixeoScreen>
  );
}

const styles = StyleSheet.create({
  loadingRoot: { justifyContent: 'center', paddingHorizontal: spacing.lg },
  scrollContent: { ...clientStyles.content, gap: space.lg },
  inputStack: { gap: space.md },
  center: { textAlign: 'center' },
  rafiLabel: { ...typography.eyebrow, color: semanticColors.text.secondary },
  rafiMessage: { ...typography.supporting, color: semanticColors.text.primary },
  diagnosticTitle: { ...typography.heading, color: semanticColors.text.primary },
  diagnosticMetaRow: { gap: space.xxs },
  diagnosticMeta: { ...typography.supporting, color: semanticColors.text.secondary },
  observedBlock: { gap: space.xxs, paddingVertical: space.xs },
  observedLabel: { ...typography.eyebrow, color: semanticColors.text.secondary },
  observedText: { ...typography.supporting, color: semanticColors.text.primary },
  diagnosticDisclaimer: { ...typography.caption, color: semanticColors.text.secondary },
  understoodRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  understoodDot: { ...typography.caption, color: semanticColors.text.secondary },
  understood: { ...typography.supporting, color: semanticColors.text.secondary, flex: 1 },
  fact: { gap: space.xxs, paddingVertical: space.xs },
  error: { ...typography.supporting, color: semanticColors.status.danger.text },
  artisan: { gap: space.xs, paddingVertical: space.md, alignItems: 'center' },
  request: { gap: space.xs, padding: space.lg, borderRadius: 24, backgroundColor: semanticColors.background.surface },
});
