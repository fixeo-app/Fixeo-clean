import { RafiScrollView as ScrollView } from '@/ui/RafiScrollView';
import { useWorkspaceDock } from '@/components/useWorkspaceDock';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { BackButton } from '@/ui/BackButton';
import { getClientProfile } from '@/lib/clientWorkspace';
import { createRequest } from '@/lib/magicLoop';
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
import { RafiPhotoPreview } from '@/components/RafiPhotoPreview';
import { RafiInputRail } from '@/components/RafiInputRail';
import { ClientDiagnostic } from '@/components/ClientDiagnostic';
import { canSendClientIntake } from '@/lib/clientDiagnostic';
import { ClientLocationField } from '@/components/ClientLocationField';
import { ServiceField } from '@/components/ServiceField';
import { MobileShell } from '@/components/MobileShell';
import { EntryStage } from '@/components/EntryStage';
import { withMobileDeadline } from '@/lib/mobileResilience';
import { getStableSession, resolveRole } from '@/lib/auth';
import { buildDeclaredContext, RAFI_PROVENANCE_LABELS } from '@/lib/rafiContext';
import { ClientHero, ClientSection, clientStyles } from '@/components/ClientEditorial';
import { clientHomeCopy } from '@/lib/clientExperience';
import { FixeoText } from '@/ui/FixeoText';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoScreen } from '@/ui/FixeoScreen';
import type { RafiOrbMode } from '@/ui/rafiOrbMotion';
import { getClientRafiPresence } from '@/ui/rafiPresence';
import { colors, semanticColors, space, typography, spacing } from '@/ui/tokens';


type JourneyStatus = 'idle' | 'matching' | 'assigned' | 'in_progress' | 'completed';

export default function ClientRequestComposer({ back = true }: { back?: boolean }) {
  const contextDock = useWorkspaceDock('client');
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [estimateContext, setEstimateContext] = useState<ClientIntelligenceContext | null>(null);
  const [diagnosticReference, setDiagnosticReference] = useState<string | undefined>();
  const [diagnosticCity, setDiagnosticCity] = useState('');
  const [persistPhoto, setPersistPhoto] = useState(false);
  const [safetyMessage, setSafetyMessage] = useState('Ne poursuivez pas cette intervention. Faites vérifier la situation par un professionnel.');
  const [safetyStopped, setSafetyStopped] = useState(false);
  const [confirmDirect, setConfirmDirect] = useState(false);
  const photoLock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [writing, setWriting] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [problem, setProblem] = useState('');
  const [declaredService, setDeclaredService] = useState('');
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
  const [rafiOrbOverride, setRafiOrbOverride] = useState<RafiOrbMode | null>(null);
  const [rafiCompletion, setRafiCompletion] = useState(0);
  const reportRafiPresence = useCallback((mode: RafiOrbMode | null) => {
    setRafiOrbOverride(mode);
    if (mode === 'success') setRafiCompletion(value => value + 1);
  }, []);
  const problemInputRef = useRef<TextInput>(null);
  const submitLockRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const need = useMemo(() => {
    const inferred = understandLocally({ mode: 'text', text: problem });
    return declaredService ? { ...inferred, serviceCategory: declaredService, needsConfirmation: problem.trim().length < 8 } : inferred;
  }, [problem, declaredService]);
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

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const session = await withMobileDeadline(getStableSession());
        if (!active) return;
        if (!session) { router.replace('/sign-in'); return; }
        const role = await withMobileDeadline(resolveRole(session.user.id));
        if (!active) return;
        if (role !== 'client') { router.replace(role === 'artisan' ? '/artisan' : '/sign-in'); return; }
        setClientReady(true);
        const profile = await getClientProfile().catch(() => null);
        if (active && profile?.city) setCity(value => value || profile.city!);
      } catch { if (active) setSessionError(true); }
    })();
    return () => { active = false; };
  }, [sessionRetry]);
  function openCreatedRequest(requestId: string) {
    if (mounted.current) router.replace({ pathname: '/client-request/[id]' as any, params: { id: requestId } });
  }

  async function handleVoice(uri: string) {
    if (idempotencyKeyRef.current || safetyStopped || photoLock.current) return;
    reportRafiPresence('thinking');
    if (!hasRafiServerGateway()) {
      setRafiMessage('Voix capturée. RAFI la traitera dès que le service est disponible.');
      setRafiOrbOverride(null);
      return;
    }
    try {
      setRafiMessage('RAFI transcrit votre message…');
      const transcript = await transcribeRafiVoice(uri);
      if (!mounted.current || idempotencyKeyRef.current) return;
      setProblemConfirmedFromRafi(false);
      setProblem(current => [current.trim(), transcript].filter(Boolean).join(' '));
      setRafiMessage('J’ai compris votre message.');
      reportRafiPresence('success');
    } catch {
      if (!mounted.current || idempotencyKeyRef.current) return;
      setRafiMessage('Je n’ai pas pu traiter cet enregistrement. Vous pouvez écrire à la place.');
      reportRafiPresence('attention');
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
    reportRafiPresence('thinking');
    setRafiMessage('RAFI analyse la photo de façon privée…');
    try {
      const input = { uri: photoUri, mimeType: photoMimeType, city: canonicalCity(city) || city.trim(), description: problem };
      const persisted = persistPhoto ? await analyzePersistedMobilePhoto({ ...input, consentVersion: 'diagnostic-privacy-v1' }) : null;
      const result = persisted ? persisted.result : await analyzeMobileDiagnosticPhoto(input);
      setDiagnosticReference(persisted?.diagnostic_reference || undefined);
      setDiagnosticCity(input.city);
      if (result.safety?.stop) setSafetyStopped(true);
      setPhotoDiagnostic(result);
      reportRafiPresence(result.safety?.stop ? 'attention' : 'success');
      setRafiMessage(
        result.safety?.stop
          ? 'RAFI a détecté un signal de sécurité à traiter en priorité.'
          : 'Analyse prête. Confirmez uniquement ce qui correspond à votre situation.',
      );
    } catch (error: any) {
      reportRafiPresence('attention');
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
      openCreatedRequest(requestId);
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
      // Keep the same idempotency key and payload for an explicit retry.
    } finally {
      submitLockRef.current = false;
    }
  }

  const intakeReady = !safetyStopped && canSendClientIntake({ busy: photoDiagnosticBusy, diagnostic: photoDiagnostic, reviewed: reviewedDiagnostic === photoDiagnostic || (!!photoDiagnostic && !need.needsConfirmation && problem !== photoDiagnostic.problem.value) });
  function sendQualifiedIntake() {
    if (!intakeReady) { setRafiMessage('Vérifiez l’analyse avant de poursuivre.'); return; }
    if (!city.trim()) { setRafiMessage('Indiquez le lieu d’intervention pour continuer.'); return; }
    if (need.needsConfirmation) { setWriting(true); problemInputRef.current?.focus(); setRafiMessage('Décrivez ce qui ne fonctionne pas, par exemple une fuite ou une prise en panne.'); return; }
    setConfirmDirect(true);
  }

  function openEstimate() {
    if (!intakeReady || !problem.trim() || idempotencyKeyRef.current) return;
    const normalized = canonicalCity(city);
    if (!normalized) { setRafiMessage('Choisissez une ville FIXEO pour cette estimation.'); return; }
    if (diagnosticReference && diagnosticCity !== normalized) {
      setRafiMessage('Cette analyse correspond à une autre ville. Reprenez la photo pour le lieu choisi.'); return;
    }
    const citySlug = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '-');
    setEstimateOpen(true);
    if (estimateContext?.city === citySlug && estimateContext.description === problem.trim() && estimateContext.diagnosticReference === diagnosticReference) return;
    setEstimateContext({ city: citySlug, description: problem.trim(), diagnosticReference });
  }
  function intelligenceCreated(requestId: string) {
    reportRafiPresence('success');
    setEstimateContext(null); setEstimateOpen(false); setJourneyStatus('matching');
    setLoop(current => transition(current, 'matching', { requestId }));
    openCreatedRequest(requestId);
  }

  const requestLocked = loop.state === 'creating' || loop.state === 'matching' || loop.state === 'found';
  const isActiveJourney = journeyStatus !== 'idle';

  const effectiveOrbMode = getClientRafiPresence({
    override: rafiOrbOverride, loopState: loop.state, journeyStatus,
    photoDiagnosticBusy, safetyStop: !isActiveJourney && (safetyStopped || photoDiagnostic?.safety?.stop),
  });

  const hero = clientHomeCopy(journeyStatus, effectiveOrbMode, loop.state === 'creating');
  const inputExpanded = writing || !!problem || !!photoUri || !!rafiMessage;
  const previousLoopState = useRef(loop.state);
  useEffect(() => {
    if (writing) problemInputRef.current?.focus();
  }, [writing]);
  useEffect(() => {
    if (previousLoopState.current === 'creating' && loop.state === 'matching') reportRafiPresence('success');
    previousLoopState.current = loop.state;
  }, [loop.state, reportRafiPresence]);

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
    <FixeoScreen padded={false} contextDock={contextDock} header={
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
        {back && !estimateOpen && <BackButton disabled={loop.state === 'creating'} onPress={confirmDirect ? () => setConfirmDirect(false) : undefined} />}
        {(isActiveJourney || !safetyStopped) && <ClientHero {...hero} compact={!!estimateOpen || confirmDirect || inputExpanded} mode={effectiveOrbMode} eventKey={`${loop.missionId || loop.requestId || 'need'}:${rafiCompletion}`} />}

        {!isActiveJourney && safetyStopped && !photoDiagnostic?.safety.stop && <ClientSection testID="client-safety-stop">
          <ClientHero eyebrow="RAFI · SÉCURITÉ" title="La sécurité d’abord." detail={safetyMessage} mode="attention" compact />
          <FixeoAction label="Revenir à mon espace" variant="secondary" onPress={() => router.push('/client-workspace')} />
        </ClientSection>}
        {!isActiveJourney && photoDiagnostic?.safety.stop && <>
          {!!photoUri && <RafiPhotoPreview uri={photoUri} readOnly onChange={() => {}} onRemove={() => {}} onClarify={() => {}} />}
          <ClientDiagnostic result={photoDiagnostic} confirmed={false} onConfirm={() => {}} onExit={() => router.push('/client-workspace')} />
        </>}
        {!isActiveJourney && !safetyStopped && (
          <View style={styles.inputStack}>
            {!estimateOpen && !confirmDirect && !photoDiagnosticBusy && !idempotencyKeyRef.current && <RafiInputRail
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
            {estimateContext && <View style={!estimateOpen ? { display: 'none' } : undefined}><ClientIntelligence key={`${estimateContext.city}:${estimateContext.description}`} visible={estimateOpen} context={estimateContext} onPresenceChange={reportRafiPresence} onCreated={intelligenceCreated} onStop={message => { if (message) setSafetyMessage(message); setSafetyStopped(true); }} onClose={() => { setEstimateOpen(false); reportRafiPresence(null); }} /></View>}
            {confirmDirect && <ClientSection testID="client-direct-confirmation" label="Votre demande">
              <FixeoText variant="heading">{problem}</FixeoText>
              <FixeoText tone="secondary">{city} · {need.serviceCategory}</FixeoText>
              <FixeoText variant="supporting">FIXEO recherche un artisan. Le prix sera annoncé avant intervention.</FixeoText>
              <FixeoAction label="Confirmer et chercher un artisan" disabled={requestLocked} onPress={() => { setConfirmDirect(false); void send(); }} />
              <FixeoAction label="Modifier ma demande" variant="ghost" onPress={() => setConfirmDirect(false)} />
            </ClientSection>}
            {inputExpanded && !estimateOpen && !confirmDirect && <View testID="client-request-fields" style={styles.inputStack}>
            <TextInput
              ref={problemInputRef}
              accessibilityLabel="Décrivez le problème"
              value={problem}
              onChangeText={(value) => {
                setProblemConfirmedFromRafi(false);
                setProblem(value);
                setDeclaredService('');
                setReviewedDiagnostic(null); // Preserve observations; the new text remains user-declared.
              }}
              editable={!requestLocked && !photoDiagnosticBusy && !(loop.state === 'error' && !!idempotencyKeyRef.current)}
              multiline
              placeholder="Décrivez simplement ce qui se passe"
              placeholderTextColor={colors.textMuted}
              style={clientStyles.input}
            />
            {(!!problem.trim() || !!photoUri) && <ClientLocationField city={city} onChangeCity={setCity} onPresenceChange={reportRafiPresence} disabled={requestLocked || photoDiagnosticBusy || (loop.state === 'error' && !!idempotencyKeyRef.current)} />}
            {problem.trim().length >= 8 && <ServiceField values={declaredService ? [declaredService] : []} onChange={values => setDeclaredService(values[0] || '')} disabled={requestLocked || photoDiagnosticBusy || !!idempotencyKeyRef.current} />}

            {!!rafiMessage && (
              <ClientSection>
                <Text style={styles.rafiLabel}>RAFI</Text>
                <Text style={styles.rafiMessage} accessibilityLiveRegion="polite">{rafiMessage}</Text>
              </ClientSection>
            )}

            {!!photoUri && (
              <ClientSection surface>
                <Text style={styles.rafiLabel}>PHOTO PRIVÉE</Text>
                <RafiPhotoPreview uri={photoUri} busy={photoDiagnosticBusy || requestLocked}
                  onChange={handlePhoto} onClarify={() => { setWriting(true); problemInputRef.current?.focus(); }}
                  onRemove={() => { if (photoLock.current) return; setPhotoUri(null); setPhotoDiagnostic(null); setReviewedDiagnostic(null); setDiagnosticReference(undefined); setPersistPhoto(false); setRafiMessage('Photo retirée. Vous pouvez continuer avec votre description.'); }} />
                <Text style={styles.rafiMessage}>
                  La photo n’est pas une demande. Elle est analysée uniquement si vous le choisissez.
                </Text>
                {!photoDiagnostic && <FixeoAction label={persistPhoto ? '✓ Conserver l’analyse pour la suite' : 'Conserver l’analyse pour la suite'} variant="ghost" disabled={photoDiagnosticBusy} accessibilityRole="checkbox" accessibilityState={{ checked: persistPhoto }} onPress={() => setPersistPhoto(value => !value)} />}
                {!photoDiagnostic && persistPhoto && <FixeoText variant="caption" tone="secondary">J’accepte la conservation privée de la photo nettoyée et de l’analyse pour poursuivre ce besoin. La photo originale n’est pas conservée.</FixeoText>}
                {!photoDiagnostic && (
                  <FixeoAction
                    label={photoDiagnosticBusy ? 'RAFI analyse…' : !city.trim() ? 'Choisir la ville pour analyser' : 'Analyser la photo avec RAFI'}
                    variant="primary"
                    disabled={photoDiagnosticBusy}
                    onPress={() => void analyzePhoto()}
                  />
                )}
              </ClientSection>
            )}

            {photoDiagnostic && !photoDiagnostic.safety.stop && <ClientDiagnostic
              key={photoUri}
              result={photoDiagnostic}
              onClarify={() => { setWriting(true); problemInputRef.current?.focus(); setRafiMessage('Quel problème avez-vous constaté ? La photo et votre ville sont conservées.'); }}
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
                    {declaredService ? `${declaredService} · choisi par vous` : need.confidence === 'low' ? 'Choisissez le métier ou poursuivez avec une estimation' : `${need.serviceCategory} · compris`}
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

            {problem.trim().length >= 8 && <FixeoAction label={wantsEstimate(problem) ? 'Obtenir mon estimation avec RAFI' : 'Voir aussi une estimation'} variant={wantsEstimate(problem) ? 'primary' : 'ghost'} disabled={requestLocked || !intakeReady || !!idempotencyKeyRef.current} onPress={openEstimate} />}
            <FixeoAction
              label={
                loop.state === 'creating'
                  ? 'RAFI prépare votre demande…'
                  : idempotencyKeyRef.current && loop.state === 'error' ? 'Vérifier et réessayer la demande' : need.needsConfirmation
                    ? 'Préciser le problème'
                    : 'Confier le problème à FIXEO'
              }
              variant={!intakeReady || wantsEstimate(problem) ? 'secondary' : 'primary'}
              onPress={idempotencyKeyRef.current && loop.state === 'error' ? () => void send() : sendQualifiedIntake}
              disabled={!problem || requestLocked || !intakeReady}
            />

            {loop.state === 'error' && (
              <Text accessibilityRole="alert" style={styles.error}>{loop.message}</Text>
            )}
            </View>}
          </View>
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
