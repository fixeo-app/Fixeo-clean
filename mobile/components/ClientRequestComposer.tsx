import { cityProposal, needFacts, confirmedMetierHint } from '@/lib/clientNeedFacts';
import { KeyboardInput } from '@/ui/KeyboardInput';
import { RafiScrollView as ScrollView } from '@/ui/RafiScrollView';
import { ClientDraftRecovery } from './ClientDraftRecovery';
import { loadClientDrafts, saveClientDraft, removeClientDraft, draftStorageGeneration, type EstimatorDraft } from '@/lib/clientDrafts';
import { onSessionRejected, privateSessionGeneration } from '@/lib/authEvents';
import { applyVoiceProposal, type PreviousDescription, type VoiceCommitMode } from '@/lib/voiceDraft';
import { useWorkspaceDock } from '@/components/useWorkspaceDock';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Keyboard, StyleSheet, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
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
import { type ClientIntelligenceContext } from '@/lib/clientIntelligence';
import { MagicLoopModel, transition } from '@/lib/magicLoopState';
import { RafiPhotoPreview } from '@/components/RafiPhotoPreview';
import { RafiInputRail } from '@/components/RafiInputRail';
import { ClientDiagnostic } from '@/components/ClientDiagnostic';
import { canSendClientIntake, photoRelevance } from '@/lib/clientDiagnostic';
import { ClientLocationField } from '@/components/ClientLocationField';
import { ServiceField } from '@/components/ServiceField';
import { MobileShell } from '@/components/MobileShell';
import { EntryStage } from '@/components/EntryStage';
import { withMobileDeadline } from '@/lib/mobileResilience';
import { getStableSession, resolveRole } from '@/lib/auth';
import { RAFI_PROVENANCE_LABELS } from '@/lib/rafiContext';
import { ClientHero, ClientSection, clientStyles } from '@/components/ClientEditorial';
import { clientHomeCopy } from '@/lib/clientExperience';
import { FixeoText } from '@/ui/FixeoText';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoScreen } from '@/ui/FixeoScreen';
import type { RafiOrbMode } from '@/ui/rafiOrbMotion';
import { getClientRafiPresence } from '@/ui/rafiPresence';
import { semanticColors, space, typography, spacing } from '@/ui/tokens';


type JourneyStatus = 'idle' | 'matching' | 'assigned' | 'in_progress' | 'completed';

export default function ClientRequestComposer({ back = true, resumeDraftId }: { back?: boolean; resumeDraftId?: string }) {
  const [draftId] = useState(() => resumeDraftId || Crypto.randomUUID());
  const draftOwner = useRef('');
  const draftStorageEpoch = useRef(draftStorageGeneration());
  const draftGeneration = useRef(privateSessionGeneration());
  const draftFinished = useRef(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [estimatorDraft, setEstimatorDraft] = useState<EstimatorDraft | null>(null);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const [cityError, setCityError] = useState(false);
  const [cityFocus, setCityFocus] = useState(0);
  const scrollRef = useRef<import('react-native').ScrollView>(null);
  const cityAnchor = useRef<View>(null), scrollOffset = useRef(0);
  const needCity = () => {
    setCityError(true); setCityFocus(value => value + 1);
    cityAnchor.current?.measureInWindow((_x, fieldY) => {
      scrollRef.current?.getNativeScrollRef()?.measureInWindow((_sx, viewportY) => {
        scrollRef.current?.scrollTo({ y: Math.max(0, scrollOffset.current + fieldY - viewportY - 16), animated: true });
      });
    });
  };
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
  const photoEpoch = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [writing, setWriting] = useState(false);
  const [stage, setStage] = useState<'NEED' | 'UNDERSTANDING' | 'SUMMARY'>('NEED');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [cityChosen, setCityChosen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [problem, setProblem] = useState('');
  const [declaredService, setDeclaredService] = useState('');
  const [problemConfirmedFromRafi, setProblemConfirmedFromRafi] = useState(false);
  const [voiceProposal, setVoiceProposal] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState<VoiceCommitMode>('replace');
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [previousDescription, setPreviousDescription] = useState<PreviousDescription | null>(null);
  const voiceEpoch = useRef(0), voiceLock = useRef(false), focused = useRef(true);
  const discardVoice = useCallback(() => {
    voiceEpoch.current++; voiceLock.current = false;
    if (mounted.current) { setVoiceProposal(null); setVoiceBusy(false); setVoiceListening(false); setRafiOrbOverride(null); }
  }, []);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; discardVoice(); };
  }, [discardVoice]));
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') discardVoice(); });
    const unsubscribe = onSessionRejected(discardVoice);
    return () => { listener.remove(); unsubscribe(); };
  }, [discardVoice]);
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
  const proposal = cityProposal(problem, city, cityChosen);
  const facts = needFacts({ revision, description: problem, descriptionConfirmed: problemConfirmedFromRafi,
    city, cityConfirmed: cityChosen, cityProposed: proposal.suggested === city, service: need.serviceCategory, serviceConfirmed: !!declaredService, media: photoUri || undefined });
  const chooseCity = (value: string) => {
    if (idempotencyKeyRef.current || photoLock.current || safetyStopped) return;
    if (value !== city) { setDiagnosticReference(undefined); setPhotoDiagnostic(null); setReviewedDiagnostic(null); setEstimateContext(null); setEstimatorDraft(null); }
    setCity(value); setCityChosen(true); setCityError(false); setRevision(v => v + 1);
  };
  function understand() {
    Keyboard.dismiss();
    if (idempotencyKeyRef.current || safetyStopped || voiceBusy || voiceProposal || voiceListening) return;
    const location = cityProposal(problem, city, cityChosen);
    if (!cityChosen && location.value) setCity(location.value);
    setStage('UNDERSTANDING'); setOptionsOpen(false);
  }
  function confirmUnderstanding() {
    if (!canonicalCity(city)) { needCity(); return; }
    if (need.needsConfirmation) { setStage('NEED'); setWriting(true); setRafiMessage('Précisez votre problème ou choisissez le métier.'); return; }
    setCityChosen(true); setDeclaredService(need.serviceCategory); setProblemConfirmedFromRafi(true);
    setRevision(v => v + 1); setStage('SUMMARY'); setOptionsOpen(false);
  }

  useEffect(() => {
    let active = true;
    const generation = privateSessionGeneration(), storageEpoch = draftStorageGeneration();
    void (async () => {
      try {
        const session = await withMobileDeadline(getStableSession());
        if (!active || draftGeneration.current !== privateSessionGeneration() || draftStorageEpoch.current !== draftStorageGeneration()) return;
        if (!session) { router.replace('/sign-in'); return; }
        const role = await withMobileDeadline(resolveRole(session.user.id));
        if (!active || generation !== privateSessionGeneration() || storageEpoch !== draftStorageGeneration()) return;
        if (role !== 'client') { router.replace(role === 'artisan' ? '/artisan' : '/sign-in'); return; }
        draftOwner.current = session.user.id;
        draftGeneration.current = generation; draftStorageEpoch.current = storageEpoch;
        const drafts = await loadClientDrafts(session.user.id);
        if (!active || generation !== privateSessionGeneration() || storageEpoch !== draftStorageGeneration()) return;
        const saved = resumeDraftId && drafts.find(item => item.id === resumeDraftId);
        if (saved) {
          setProblem(saved.problem); setCity(saved.city); setDeclaredService(saved.declaredService);
          setCityChosen(saved.cityChosen ?? !!saved.city); setRevision(saved.revision || 0); setStage(saved.uiStage || 'NEED');
          setProblemConfirmedFromRafi(saved.problemConfirmedFromRafi); setWriting(true);
          setPreviousDescription(saved.previousDescription || null);
          setPhotoUri(saved.photoUri); setPhotoMimeType(saved.photoMimeType);
          setPhotoDiagnostic(saved.photoDiagnostic); setReviewedDiagnostic(saved.photoReviewed ? saved.photoDiagnostic : null);
          setDiagnosticReference(saved.diagnosticReference); setDiagnosticCity(saved.diagnosticCity); setPersistPhoto(saved.persistPhoto);
          setSafetyStopped(saved.safetyStopped); setSafetyMessage(saved.safetyMessage);
          setEstimateContext(saved.estimateContext); setEstimateOpen(saved.estimateOpen);
          setEstimatorDraft(saved.estimator ? { ...saved.estimator, needsRevalidation: !!saved.estimator.started && !saved.estimator.pendingConfirmation } : null);
          idempotencyKeyRef.current = saved.submissionKey;
          if (saved.submissionKey) setLoop({ state: 'error', message: 'Votre confirmation est conservée. Vérifiez la demande avant de poursuivre.' });
        }
        setDraftLoaded(true); setClientReady(true);
        const profile = await getClientProfile().catch(() => null);
        if (active && profile?.city) setCity(value => value || profile.city!);
      } catch { if (active) setSessionError(true); }
    })();
    return () => { active = false; };
  }, [sessionRetry, resumeDraftId]);
  useEffect(() => {
    if (!draftLoaded || draftFinished.current || draftGeneration.current !== privateSessionGeneration() || draftStorageEpoch.current !== draftStorageGeneration()) return;
    saveClientDraft(draftOwner.current, { id: draftId, updatedAt: Date.now(), problem, city, declaredService,
      problemConfirmedFromRafi, previousDescription, cityChosen, revision, uiStage: stage, photoUri, photoMimeType, photoDiagnostic, photoReviewed: !!photoDiagnostic && reviewedDiagnostic === photoDiagnostic,
      diagnosticReference, diagnosticCity, persistPhoto, safetyStopped, safetyMessage, estimateContext, estimateOpen, estimator: estimatorDraft, submissionKey: idempotencyKeyRef.current });
  }, [draftLoaded, draftId, problem, city, declaredService, problemConfirmedFromRafi, previousDescription, photoUri, photoMimeType, photoDiagnostic, reviewedDiagnostic, diagnosticReference, diagnosticCity, persistPhoto, safetyStopped, safetyMessage, estimateContext, estimateOpen, estimatorDraft, loop.state, cityChosen, revision, stage]);
  function openCreatedRequest(requestId: string) {
    if (draftGeneration.current !== privateSessionGeneration() || draftStorageEpoch.current !== draftStorageGeneration()) return;
    draftFinished.current = true; removeClientDraft(draftOwner.current, draftId);
    if (mounted.current) router.replace({ pathname: '/client-request/[id]' as any, params: { id: requestId } });
  }

  async function handleVoice(uri: string) {
    if (idempotencyKeyRef.current || safetyStopped || photoLock.current || voiceLock.current || voiceProposal || !focused.current) return;
    voiceLock.current = true; setVoiceBusy(true);
    const epoch = ++voiceEpoch.current, generation = privateSessionGeneration();
    const valid = () => mounted.current && focused.current && epoch === voiceEpoch.current && generation === privateSessionGeneration() && !idempotencyKeyRef.current;
    reportRafiPresence('thinking');
    if (!hasRafiServerGateway()) {
      setRafiMessage('Voix capturée. RAFI la traitera dès que le service est disponible.');
      setRafiOrbOverride(null);
      voiceLock.current = false; setVoiceBusy(false);
      return;
    }
    try {
      setRafiMessage('RAFI transcrit votre message…');
      const transcript = await transcribeRafiVoice(uri);
      if (!valid()) return;
      if (!transcript.trim()) { setRafiMessage('Aucune parole utilisable. Votre texte est conservé.'); return; }
      setVoiceMode('replace'); setVoiceProposal(transcript.trim());
      setRafiMessage('Vérifiez la transcription. Votre brouillon reste inchangé tant que vous ne l’acceptez pas.');
      reportRafiPresence('attention');
    } catch {
      if (!valid()) return;
      setRafiMessage('Je n’ai pas pu traiter cet enregistrement. Vous pouvez écrire à la place.');
      reportRafiPresence('attention');
    } finally {
      if (epoch === voiceEpoch.current) { voiceLock.current = false; if (mounted.current) setVoiceBusy(false); }
    }
  }

  function changeDescription(value: string, confirmed = false) {
    discardVoice(); setRevision(v => v + 1); setStage('NEED'); setProblem(value); setProblemConfirmedFromRafi(confirmed);
    setDeclaredService(''); setReviewedDiagnostic(null); setConfirmDirect(false);
    setDiagnosticReference(undefined); setEstimateContext(null); setEstimatorDraft(null); setEstimateOpen(false);
    photoEpoch.current++; setPhotoDiagnostic(null);
  }
  function acceptVoice() {
    if (!voiceProposal || voiceLock.current || !focused.current || idempotencyKeyRef.current || draftGeneration.current !== privateSessionGeneration()) return;
    const next = applyVoiceProposal(problem, voiceProposal, voiceMode);
    setPreviousDescription({ problem, declaredService, problemConfirmedFromRafi });
    changeDescription(next, true);
    const location = cityProposal(next, city, cityChosen);
    if (!cityChosen && location.value) setCity(location.value);
    setStage('UNDERSTANDING');
    setRafiMessage('Transcription acceptée. Vous pouvez restaurer le texte précédent.');
  }

  function handlePhoto(uri: string, mimeType = 'image/jpeg') {
    if (safetyStopped || photoLock.current || idempotencyKeyRef.current) return;
    setDiagnosticReference(undefined); setPersistPhoto(false); setReviewedDiagnostic(null);
    photoEpoch.current++; setEstimateContext(null); setEstimatorDraft(null);
    setPhotoUri(uri);
    setPhotoMimeType(mimeType);
    setPhotoDiagnostic(null);
    setConfirmDirect(false); setEstimateOpen(false); setStage('UNDERSTANDING');
    setRafiMessage('Photo prête. Vous décidez quand RAFI peut l’analyser.');
  }

  function removePhoto() {
    if (photoLock.current || safetyStopped || idempotencyKeyRef.current) return;
    photoEpoch.current++; setPhotoUri(null); setPhotoDiagnostic(null); setReviewedDiagnostic(null);
    setDiagnosticReference(undefined); setPersistPhoto(false); setEstimateContext(null); setEstimatorDraft(null);
    setStage(problem.trim().length >= 8 ? 'UNDERSTANDING' : 'NEED');
    setRafiMessage('Photo retirée. Votre description est conservée.');
  }

  async function analyzePhoto() {
    if (!photoUri || photoLock.current || safetyStopped) return;
    if (!city.trim()) {
      needCity();
      return;
    }
    if (!hasRafiServerGateway()) {
      setRafiMessage('Analyse photo indisponible sur ce build.');
      return;
    }

    photoLock.current = true;
    const epoch = photoEpoch.current, generation = privateSessionGeneration();
    setPhotoDiagnosticBusy(true);
    reportRafiPresence('thinking');
    setRafiMessage('RAFI analyse la photo de façon privée…');
    try {
      const input = { uri: photoUri, mimeType: photoMimeType, city: canonicalCity(city) || city.trim(), description: problem };
      const persisted = persistPhoto ? await analyzePersistedMobilePhoto({ ...input, consentVersion: 'diagnostic-privacy-v1' }) : null;
      const result = persisted ? persisted.result : await analyzeMobileDiagnosticPhoto(input);
      if (!mounted.current || epoch !== photoEpoch.current || generation !== privateSessionGeneration()) return;
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

  function confirmPhotoDiagnostic(description: string) {
    if (!photoDiagnostic?.problem?.value || photoRelevance(photoDiagnostic, problem) === 'unrelated' || idempotencyKeyRef.current) return false;
    setPreviousDescription({ problem, declaredService, problemConfirmedFromRafi });
    setProblem(description); setDeclaredService(''); setProblemConfirmedFromRafi(true);
    setEstimateContext(null); setEstimatorDraft(null);
    setRafiMessage('✓ Description confirmée par vous à partir de l’analyse RAFI.');
    return true;
  }

  async function send() {
    if (safetyStopped || photoDiagnostic?.safety.stop || voiceProposal || voiceBusy || voiceListening || submitLockRef.current || loop.state === 'matching' || loop.state === 'found') return;
    submitLockRef.current = true;
    try {
      const normalizedCity = city.trim();
      if (!normalizedCity) {
        needCity();
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

  const intakeReady = !voiceProposal && !voiceBusy && !voiceListening && !safetyStopped && canSendClientIntake({ busy: photoDiagnosticBusy, diagnostic: photoDiagnostic, reviewed: reviewedDiagnostic === photoDiagnostic });
  function confirmExplicit() {
    if (!confirmDirect || !intakeReady || idempotencyKeyRef.current) return;
    void send();
  }
  function retryPending() {
    if (!idempotencyKeyRef.current || loop.state !== 'error') return;
    void send();
  }
  function sendQualifiedIntake() {
    if (!intakeReady) { setRafiMessage('Vérifiez l’analyse avant de poursuivre.'); return; }
    if (!canonicalCity(city)) { needCity(); return; }
    if (need.needsConfirmation) { setWriting(true); problemInputRef.current?.focus(); setRafiMessage('Décrivez ce qui ne fonctionne pas, par exemple une fuite ou une prise en panne.'); return; }
    setConfirmDirect(true);
  }

  function openEstimate() {
    if (!intakeReady || !problem.trim() || idempotencyKeyRef.current) return;
    const normalized = canonicalCity(city);
    if (!normalized) { needCity(); return; }
    if (diagnosticReference && diagnosticCity !== normalized) {
      setRafiMessage('Cette analyse correspond à une autre ville. Reprenez la photo pour le lieu choisi.'); return;
    }
    const citySlug = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '-');
    setEstimateOpen(true);
    if (estimateContext?.city === citySlug && estimateContext.description === problem.trim() && estimateContext.diagnosticReference === diagnosticReference && estimateContext.metierHint === confirmedMetierHint(declaredService)) return;
    setEstimatorDraft(null);
    setEstimateContext({ city: citySlug, description: problem.trim(), diagnosticReference,
      ...(declaredService ? { metierHint: confirmedMetierHint(declaredService), metierProvenance: 'user_confirmed' as const } : {}) });
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
  const uiStage = safetyStopped || photoDiagnostic?.safety.stop ? 'SAFETY_STOP' : idempotencyKeyRef.current ? 'CONFIRMATION_PENDING' : estimateOpen ? 'ESTIMATE' : confirmDirect ? 'EXPLICIT_CONFIRM' : voiceProposal ? 'VOICE_REVIEW' : voiceBusy ? 'VOICE_PROCESSING' : photoUri && (!photoDiagnostic || reviewedDiagnostic !== photoDiagnostic) ? 'PHOTO_REVIEW' : stage;
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
    <FixeoScreen padded={false} contextDock={contextDock} transactional header={
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
        ref={scrollRef}
        onScroll={event => { scrollOffset.current = event.nativeEvent.contentOffset.y; }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {back && uiStage !== 'ESTIMATE' && <BackButton disabled={requestLocked} onPress={uiStage === 'EXPLICIT_CONFIRM' ? () => setConfirmDirect(false) : uiStage === 'SUMMARY' ? () => setStage('UNDERSTANDING') : uiStage === 'UNDERSTANDING' ? () => setStage('NEED') : undefined} />}
        <ClientHero {...hero} family="request" compact mode={effectiveOrbMode} eventKey={`${loop.requestId || 'need'}:${rafiCompletion}`} />
        <View testID={`client-stage-${uiStage}`} accessibilityElementsHidden={optionsOpen} importantForAccessibility={optionsOpen ? 'no-hide-descendants' : 'auto'} style={[styles.inputStack, optionsOpen && { display: 'none' }]}>
          {uiStage === 'SAFETY_STOP' && <ClientSection testID="client-safety-stop">
            <FixeoText accessibilityRole="alert">{safetyMessage}</FixeoText>
            {photoDiagnostic?.safety.stop && <ClientDiagnostic result={photoDiagnostic} confirmed={false} onConfirm={() => {}} />}
            <FixeoAction label="Revenir à mon espace" variant="secondary" onPress={() => router.push('/client-workspace')} />
          </ClientSection>}
          {uiStage === 'NEED' && <ClientSection testID="client-request-fields" surface>
            <KeyboardInput ref={problemInputRef} accessibilityLabel="Décrivez le problème" value={problem}
              onChangeText={value => { setPreviousDescription(null); changeDescription(value); }}
              multiline editable={!voiceListening} placeholder="Décrivez simplement ce qui se passe" style={clientStyles.input} />
            <RafiInputRail compact onWrite={() => { setWriting(true); problemInputRef.current?.focus(); }}
              onVoiceReady={uri => void handleVoice(uri)} onPhotoReady={handlePhoto}
              onListeningChange={listening => { setVoiceListening(listening); setRafiOrbOverride(listening ? 'listening' : null); }} />
            {!voiceListening && <FixeoAction label="Continuer" disabled={problem.trim().length < 8} onPress={understand} />}
          </ClientSection>}
          {uiStage === 'VOICE_PROCESSING' && <FixeoText accessibilityLiveRegion="polite">RAFI transcrit votre message… Votre texte reste conservé.</FixeoText>}
          {uiStage === 'VOICE_REVIEW' && <ClientSection testID="voice-proposal" label="TRANSCRIPTION À VÉRIFIER">
            <FixeoText>{voiceProposal}</FixeoText>
            <FixeoText variant="supporting" tone="secondary">Votre texte reste intact jusqu’à votre choix.</FixeoText>
            {!!problem.trim() && <View style={styles.inputStack}>
              <FixeoAction label="Remplacer le texte" variant="ghost" selected={voiceMode === 'replace'} onPress={() => setVoiceMode('replace')} />
              <FixeoAction label="Compléter le texte" variant="ghost" selected={voiceMode === 'append'} onPress={() => setVoiceMode('append')} />
            </View>}
            <FixeoAction label="Utiliser cette transcription" onPress={acceptVoice} />
            <FixeoAction label="Ignorer et conserver mon texte" variant="ghost" onPress={() => { discardVoice(); setStage('NEED'); }} />
          </ClientSection>}
          {uiStage === 'UNDERSTANDING' && <ClientSection testID="client-understanding" label="VOICI CE QUE RAFI A COMPRIS">
            <FixeoText>{problem}</FixeoText>
            <FixeoText variant="caption" tone="secondary">{RAFI_PROVENANCE_LABELS[facts.description.provenance]}</FixeoText>
            {proposal.suggested && <FixeoText accessibilityLiveRegion="polite">{proposal.conflict && cityChosen ? `${proposal.suggested} est mentionnée, mais votre choix ${city} est conservé. Modifiez-le uniquement si nécessaire.` : `Ville proposée : ${proposal.suggested} · à confirmer`}</FixeoText>}
            <View ref={cityAnchor} collapsable={false}><ClientLocationField city={city} error={cityError ? 'Choisissez votre ville pour continuer.' : undefined} focusRequest={cityFocus} onChangeCity={chooseCity} onPresenceChange={reportRafiPresence} /></View>
            <ServiceField values={declaredService ? [declaredService] : []} suggestion={need.confidence === 'high' ? need.serviceCategory : undefined} onChange={values => { setDeclaredService(values[0] || ''); setRevision(v => v + 1); }} />
            <FixeoText variant="supporting" tone="secondary">{declaredService ? `${declaredService} · choisi par vous` : `${need.serviceCategory} · proposition RAFI à confirmer`}</FixeoText>
            <FixeoAction label={city && !cityChosen ? `Confirmer ${city} et mon besoin` : 'Confirmer mon besoin'} onPress={confirmUnderstanding} />
            <FixeoAction label="Modifier mon texte" variant="ghost" onPress={() => setStage('NEED')} />
          </ClientSection>}
          {uiStage === 'PHOTO_REVIEW' && <ClientSection testID="client-photo-step" surface>
            {!!photoUri && <RafiPhotoPreview uri={photoUri} busy={photoDiagnosticBusy} onChange={handlePhoto} onRemove={removePhoto} onClarify={() => { removePhoto(); setStage('NEED'); }} />}
            {!photoDiagnostic && <>
              <View ref={cityAnchor} collapsable={false}><ClientLocationField city={city} error={cityError ? 'Choisissez votre ville pour analyser.' : undefined} focusRequest={cityFocus} onChangeCity={chooseCity} disabled={photoDiagnosticBusy} /></View>
              <FixeoText variant="supporting">L’analyse ne crée aucune demande. La conservation est un choix distinct.</FixeoText>
              <FixeoAction label={persistPhoto ? '✓ Conserver l’analyse pour la suite' : 'Conserver l’analyse pour la suite'} variant="ghost" disabled={photoDiagnosticBusy} accessibilityRole="checkbox" accessibilityState={{ checked: persistPhoto }} onPress={() => setPersistPhoto(value => !value)} />
              {persistPhoto && <FixeoText variant="caption">J’accepte la conservation privée de la photo nettoyée et de l’analyse. La photo originale n’est pas conservée.</FixeoText>}
              <FixeoAction label={photoDiagnosticBusy ? 'RAFI analyse…' : 'Analyser la photo avec RAFI'} disabled={photoDiagnosticBusy} onPress={() => void analyzePhoto()} />
            </>}
            {photoDiagnostic && <ClientDiagnostic key={photoUri} result={photoDiagnostic} description={problem} confirmed={false}
              onContinueText={removePhoto} onClarify={() => { removePhoto(); setStage('NEED'); }}
              onConfirm={description => { if (confirmPhotoDiagnostic(description)) { setReviewedDiagnostic(photoDiagnostic); setStage('UNDERSTANDING'); } }} />}
          </ClientSection>}
          {uiStage === 'SUMMARY' && <ClientSection testID="client-summary" label="VOTRE DEMANDE">
            <FixeoText variant="heading">{problem}</FixeoText><FixeoText>{city} · {need.serviceCategory}</FixeoText>
            <FixeoText variant="supporting">Le prix sera annoncé avant intervention. Vous pouvez d’abord consulter une estimation.</FixeoText>
            <FixeoAction label="Préparer ma demande" disabled={!intakeReady} onPress={sendQualifiedIntake} />
            <FixeoAction label="Voir une estimation" variant="ghost" disabled={!intakeReady} onPress={openEstimate} />
          </ClientSection>}
          {uiStage === 'EXPLICIT_CONFIRM' && <ClientSection testID="client-direct-confirmation" label="CONFIRMATION">
            <FixeoText variant="heading">{problem}</FixeoText><FixeoText>{city} · {need.serviceCategory}</FixeoText>
            <FixeoText>En confirmant, vous autorisez FIXEO à rechercher un artisan. Aucun prix définitif n’est confirmé.</FixeoText>
            <FixeoAction label="Confirmer et chercher un artisan" disabled={requestLocked || !intakeReady} onPress={confirmExplicit} />
            <FixeoAction label="Modifier ma demande" variant="ghost" onPress={() => { setConfirmDirect(false); setStage('UNDERSTANDING'); }} />
          </ClientSection>}
          {uiStage === 'CONFIRMATION_PENDING' && <ClientSection testID="client-confirmation-pending">
            <FixeoText accessibilityLiveRegion="polite">{loop.state === 'creating' ? 'FIXEO prépare votre demande…' : loop.message || 'Votre confirmation reste à vérifier.'}</FixeoText>
            {loop.state === 'error' && <><FixeoAction label="Vérifier et réessayer la demande" onPress={retryPending} /><FixeoAction label="Vérifier mes demandes" variant="ghost" onPress={() => router.push('/client-workspace/history')} /></>}
          </ClientSection>}
        </View>
        {estimateContext && <View accessibilityElementsHidden={!estimateOpen} importantForAccessibility={estimateOpen ? 'auto' : 'no-hide-descendants'} style={!estimateOpen ? { display: 'none' } : undefined}>
          <ClientIntelligence key={`${estimateContext.city}:${estimateContext.description}`} visible={estimateOpen} context={estimateContext} initialDraft={estimatorDraft} onDraftChange={setEstimatorDraft} onPresenceChange={reportRafiPresence} onCreated={intelligenceCreated}
            onStop={message => { if (message) setSafetyMessage(message); setSafetyStopped(true); }} onClose={() => { setEstimateOpen(false); setStage('SUMMARY'); reportRafiPresence(null); }} />
        </View>}
        {!!rafiMessage && !['SAFETY_STOP', 'VOICE_PROCESSING'].includes(uiStage) && <FixeoText variant="supporting" accessibilityLiveRegion="polite">{rafiMessage}</FixeoText>}
        {!requestLocked && !idempotencyKeyRef.current && !estimatorDraft?.pendingConfirmation && !['SAFETY_STOP','ESTIMATE','VOICE_PROCESSING'].includes(uiStage) && <>
          <FixeoAction label={optionsOpen ? 'Fermer les options' : 'Plus'} variant="ghost" accessibilityState={{ expanded: optionsOpen }} onPress={() => setOptionsOpen(v => !v)} />
          {optionsOpen && <ClientSection label="OPTIONS">
            {previousDescription && <FixeoAction label="Restaurer le texte précédent" variant="ghost" onPress={() => { const prior = previousDescription; changeDescription(prior.problem, prior.problemConfirmedFromRafi); setDeclaredService(prior.declaredService); setPreviousDescription(null); setOptionsOpen(false); }} />}
            {uiStage === 'VOICE_REVIEW' && <FixeoAction label="Réessayer" variant="ghost" onPress={() => { discardVoice(); setStage('NEED'); setOptionsOpen(false); }} />}
            <ClientDraftRecovery excludeId={draftId} />
            <FixeoAction label="Abandonner ce brouillon" variant="ghost" onPress={() => setDiscardPrompt(true)} />
            {discardPrompt && <ClientSection label="ABANDONNER CE BROUILLON ?"><FixeoText>Vos demandes confirmées restent intactes.</FixeoText>
              <FixeoAction label="Confirmer l’abandon" onPress={() => { draftFinished.current = true; removeClientDraft(draftOwner.current, draftId); router.replace('/' as any); }} />
              <FixeoAction label="Garder mon brouillon" variant="secondary" onPress={() => setDiscardPrompt(false)} /></ClientSection>}
          </ClientSection>}
        </>}
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
