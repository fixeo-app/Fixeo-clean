import type { EstimatorDraft } from '@/lib/clientDrafts';
import { BackButton } from '@/ui/BackButton';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { mobileEstimator } from '@/lib/mobileEstimator';
import { getClientProfile } from '@/lib/clientWorkspace';
import { createRequest } from '@/lib/magicLoop';
import { canonicalOption, estimatorConfirmation, estimatorOutcome, estimatorStopped, intelligenceFailure, type ClientIntelligenceContext } from '@/lib/clientIntelligence';
import type { MobileEstimatorRequest, MobileEstimatorResponse } from '@/lib/mobileEstimatorContract';
import { ClientFixeoResult } from './ClientFixeoResult';
import { ClientSection, clientStyles } from './ClientEditorial';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoText } from '@/ui/FixeoText';
import optionLabels from '@/lib/clientEstimatorLabels.generated.json';
import type { RafiPresenceState } from '@/ui/rafiPresence';

const metierLabels: Record<string, string> = { plomberie: 'Plomberie', electricite: 'Électricité', serrurerie: 'Serrurerie', climatisation: 'Climatisation', bricolage: 'Bricolage', menuiserie: 'Menuiserie', peinture: 'Peinture', maconnerie: 'Maçonnerie', nettoyage: 'Nettoyage', jardinage: 'Jardinage', demenagement: 'Déménagement', carrelage: 'Carrelage', autre: 'Autre' };

/** One optional, server-owned journey. No price, token decoding or local STOP release. */
export function ClientIntelligence({ context, onCreated, onClose, onStop, onPresenceChange, visible = true, initialDraft, onDraftChange }: {
  initialDraft?: EstimatorDraft | null; onDraftChange?: (draft: EstimatorDraft) => void;
  visible?: boolean; context: ClientIntelligenceContext; onCreated: (id: string) => void; onClose: () => void; onStop: (message?: string) => void;
  onPresenceChange?: (state: RafiPresenceState | null) => void;
}) {
  const [result, setResult] = useState<MobileEstimatorResponse | null>(initialDraft?.result || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof intelligenceFailure> | null>(initialDraft?.error || null);
  const [answer, setAnswer] = useState<string | number | boolean>(initialDraft?.answer ?? '');
  const [started, setStarted] = useState(initialDraft?.started || false);
  const [history, setHistory] = useState<{ result: MobileEstimatorResponse; label: string; answer: string | number | boolean }[]>(initialDraft?.history || []);
  const [phone, setPhone] = useState(initialDraft?.phone || '');
  const [confirming, setConfirming] = useState(initialDraft?.confirming || false);
  const lock = useRef(false);
  const active = useRef(true);
  const stopped = useRef(initialDraft?.stopped || false);
  const lastAction = useRef<MobileEstimatorRequest | null>(initialDraft?.lastAction || null);
  // After an ambiguous confirmation only the identical payload may be retried.
  const pendingConfirmation = useRef<MobileEstimatorRequest | 'direct' | null>(initialDraft?.pendingConfirmation || null);
  const directKey = useRef<string | null>(initialDraft?.directKey || null);
  const initial = useRef(context).current;
  const outcome = estimatorOutcome(result);
  useEffect(() => {
    onDraftChange?.({ result, answer, started, history, phone, confirming, error, stopped: stopped.current,
      lastAction: lastAction.current, pendingConfirmation: pendingConfirmation.current, directKey: directKey.current });
  }, [result, answer, started, history, phone, confirming, error, busy, onDraftChange]);
  useEffect(() => {
    if (!visible) return;
    onPresenceChange?.(busy ? 'thinking' : error ? 'attention' : result ? 'success' : 'idle');
  }, [busy, error, result, onPresenceChange, visible]);

  async function run(action: MobileEstimatorRequest, choiceLabel?: string) {
    if (lock.current || stopped.current) return;
    lock.current = true; setBusy(true); setError(null); lastAction.current = action;
    try {
      const response = await mobileEstimator(action);
      if (!active.current) return;
      if (estimatorStopped(response)) { stopped.current = true; onStop(estimatorOutcome(response)?.scope_summary[0]); setResult(response); return; }
      if (!response.session && !response.next_step && !estimatorOutcome(response) && !response.request_id && !response.id) throw new Error('ESTIMATOR_UNAVAILABLE');
      if (result && ['start', 'answer', 'select_service', 'evaluate'].includes(action.action)) setHistory(items => [...items, { result, label: choiceLabel || '', answer }]);
      setResult(response); setAnswer('');
      if (action.action === 'confirm_request' || action.action === 'confirm_quote') {
        const id = response.request_id || response.id;
        if (!id) throw new Error('REQUEST_ID_MISSING');
        onCreated(id);
      }
    } catch (failure) {
      if (!active.current) return;
      const view = intelligenceFailure(failure); setError(view);
      if (['phone', 'expired', 'quota', 'city'].includes(view.kind)) pendingConfirmation.current = null;
      if (view.kind === 'safety') { stopped.current = true; onStop(); }
    } finally { lock.current = false; if (active.current) setBusy(false); }
  }
  function start(metier?: string) {
    setStarted(true);
    void run({ action: 'start', entry_context: { city_slug: initial.city, description: initial.description, ...(metier ? { metier_hint: metier } : {}),
      ...(initial.diagnosticReference ? { diagnostic_token: initial.diagnosticReference } : {}) } });
  }
  useEffect(() => {
    active.current = true;
    void getClientProfile().then(profile => { if (active.current) setPhone(current => current || profile.phone || ''); }).catch(() => undefined);
    return () => { active.current = false; };
  }, []);

  async function confirm() {
    if (lock.current || stopped.current || !result) return;
    const request = pendingConfirmation.current || estimatorConfirmation(result, initial, phone.trim());
    if (request && request !== 'direct') { pendingConfirmation.current = request; await run(request); return; }
    if (outcome?.outcome_type !== 'QUOTE_REQUIRED' || initial.diagnosticReference || !result.session?.metier) return;
    pendingConfirmation.current = 'direct'; lock.current = true; setBusy(true); setError(null);
    try {
      directKey.current ||= Crypto.randomUUID();
      const data = await createRequest(result.session.metier, initial.city,
        ('Demande de devis — aucun prix confirmé. ' + initial.description).slice(0, 1000), directKey.current);
      const id = String(data?.id || data?.request_id || '');
      if (!id) throw new Error('REQUEST_ID_MISSING');
      if (active.current) onCreated(id);
    } catch (failure) { if (active.current) setError(intelligenceFailure(failure)); }
    finally { lock.current = false; if (active.current) setBusy(false); }
  }

  const step = result?.next_step;
  const token = result?.session?.session_token;
  const options = (step?.options || []).map(canonicalOption).filter((item): item is NonNullable<typeof item> => !!item);
  const canConfirm = !!result && (!!estimatorConfirmation(result, initial, phone) ||
    (outcome?.outcome_type === 'QUOTE_REQUIRED' && !initial.diagnosticReference && !!result.session?.metier));
  const phoneRequired = outcome?.outcome_type !== 'QUOTE_REQUIRED' || !!initial.diagnosticReference;
  const phoneValid = /^(\+212|0)[5-7][0-9]{8}$/.test(phone.replace(/[\s().-]+/g, ''));
  const blocked = busy || (!!error && error.kind !== 'input' && error.kind !== 'phone') || stopped.current;
  function previous() {
    Keyboard.dismiss();
    if (busy || pendingConfirmation.current || stopped.current) return;
    setError(null);
    if (confirming) { setConfirming(false); return; }
    const prior = history[history.length - 1];
    if (prior) { setResult(prior.result); setAnswer(prior.answer); setHistory(items => items.slice(0, -1)); }
    else if (started) { setStarted(false); setResult(null); setAnswer(''); }
    else onClose();
  }
  const selections = step?.type === 'SERVICE_SELECTION' ? (step.candidate_services || []).map(service => ({ value: service.service_code, label: service.label_fr || 'Choisir cette intervention' })) : options;
  function continueStep() {
    Keyboard.dismiss();
    if (!token) { setError(intelligenceFailure(new Error('ESTIMATOR_SESSION_INVALID'))); return; }
    if (step?.type === 'SERVICE_SELECTION') { void run({ action: 'select_service', session_token: token, service_code: String(answer) }, selections.find(item => item.value === answer)?.label); return; }
    if (!step?.question_id) { setError(intelligenceFailure(new Error('ESTIMATOR_UNAVAILABLE'))); return; }
    const value = step.answer_type === 'number' ? Number(String(answer).replace(',', '.')) : answer;
    if (typeof value === 'number' && !Number.isFinite(value)) { setError({ kind: 'input', message: 'Indiquez un nombre valide.' }); return; }
    void run({ action: 'answer', session_token: token, question_id: step.question_id, answer: value }, selections.find(item => item.value === answer)?.label || String(answer));
  }
  return <ClientSection testID="client-intelligence" label="RAFI · LA SUITE POUR VOUS">
    <BackButton system={visible} label={history.length || started ? 'Précédent' : 'Retour au besoin'} onPress={previous} disabled={busy || !!pendingConfirmation.current || stopped.current} />
    <FixeoText variant="caption" tone="secondary">{!started ? 'Votre besoin' : outcome ? 'Votre estimation' : step?.type === 'READY' ? 'Récapitulatif' : `Étape ${history.filter(item => item.label).length + 1} · Précisons votre besoin`}</FixeoText>
    {!started && <ClientSection surface><FixeoText variant="heading">{initial.description}</FixeoText><FixeoText tone="secondary">{initial.city}</FixeoText>
      <FixeoText>Quelques précisions pour une estimation adaptée à votre intervention.</FixeoText>
      <FixeoAction label="Commencer l’estimation" onPress={() => start()} /></ClientSection>}
    {busy && <FixeoText accessibilityLiveRegion="polite">{confirming ? 'FIXEO prépare votre demande…' : 'RAFI prépare la suite…'}</FixeoText>}
    {error && <View style={{ gap: 12 }}>
      <FixeoText accessibilityRole="alert">{error.message}</FixeoText>
      {error.kind === 'auth' ? <FixeoAction label="Me reconnecter" onPress={() => router.replace('/sign-in')} /> :
        error.kind === 'retry' && <FixeoAction label={pendingConfirmation.current ? 'Vérifier et réessayer la confirmation' : 'Réessayer avec RAFI'} disabled={busy}
          onPress={() => pendingConfirmation.current ? void confirm() : lastAction.current && void run(lastAction.current)} />}
      {!pendingConfirmation.current && !stopped.current && ['retry', 'quota'].includes(error.kind) && <FixeoAction label="Continuer sans estimation" variant="secondary" disabled={busy} onPress={onClose} />}
      {pendingConfirmation.current && <FixeoText variant="supporting">Votre confirmation est conservée. Cette vérification ne crée pas une seconde demande.</FixeoText>}
      {error.kind === 'expired' && <FixeoAction label="Recommencer l’estimation" disabled={busy} onPress={() => { setResult(null); setHistory([]); setAnswer(''); setStarted(false); setConfirming(false); setError(null); }} />}
    </View>}
    {outcome && <ClientFixeoResult outcome={outcome} />}
    {!outcome && ['QUESTION', 'SERVICE_SELECTION'].includes(step?.type || '') && <ClientSection testID="client-estimator-question">
      <FixeoText variant="heading">{step?.prompt_fr || 'Quelle intervention correspond à votre besoin ?'}</FixeoText>
      {selections.length ? selections.map((option, i) => <FixeoAction key={i}
        label={(optionLabels as Record<string, string>)[String(option.value)] || option.label}
        variant="secondary" selected={answer === option.value} disabled={blocked}
        onPress={() => { setAnswer(option.value); setError(null); }} />) :
        <TextInput accessibilityLabel="Votre précision" style={clientStyles.input} value={String(answer)} onChangeText={value => { setAnswer(value); setError(null); }} editable={!busy}
          keyboardType={step?.answer_type === 'number' ? 'decimal-pad' : 'default'} returnKeyType="done" />}
      <FixeoAction label="Continuer" disabled={blocked || String(answer).trim() === ''} onPress={continueStep} />
    </ClientSection>}
    {!outcome && step?.type === 'READY' && <ClientSection testID="client-estimator-summary" label="VOTRE RÉCAPITULATIF">
      <FixeoText variant="heading">{initial.description}</FixeoText>
      {history.filter(item => item.label).map((item, index) => <View key={index} style={{ gap: 4 }}><FixeoText variant="caption" tone="secondary">{item.result.next_step?.prompt_fr || 'Intervention'}</FixeoText><FixeoText>{item.label}</FixeoText></View>)}
      <FixeoText variant="supporting">Vos réponses servent au calcul FIXEO. Aucune demande n’est encore créée.</FixeoText>
      <FixeoAction label="Voir mon estimation" disabled={blocked} onPress={() => token && void run({ action: 'evaluate', session_token: token })} />
    </ClientSection>}
    {!outcome && step?.type === 'METIER_SELECTION' && <ClientSection label="Précisons votre besoin">
      <FixeoText>Quel métier correspond à votre besoin ?</FixeoText>
      {step.candidate_metiers?.map(metier => <FixeoAction key={metier} label={metierLabels[metier] || metier} variant="secondary" disabled={blocked} onPress={() => start(metier)} />)}
    </ClientSection>}
    {canConfirm && !confirming && <FixeoAction label={outcome?.outcome_type === 'QUOTE_REQUIRED' ? 'Préparer ma demande de devis' : 'Continuer avec cette estimation'} disabled={blocked} onPress={() => setConfirming(true)} />}
    {confirming && <ClientSection testID="client-estimator-confirmation" label="Votre confirmation">
      <FixeoText>{initial.description}</FixeoText><FixeoText tone="secondary">{initial.city}</FixeoText>
      {phoneRequired && <TextInput accessibilityLabel="Téléphone de contact" keyboardType="phone-pad" style={clientStyles.input} value={phone} onChangeText={value => { setPhone(value); if (error?.kind === 'phone') setError(null); }} editable={!busy && !pendingConfirmation.current} />}
      <FixeoText variant="supporting">{outcome?.outcome_type === 'QUOTE_REQUIRED' ? 'Aucun prix n’est confirmé. Un devis est nécessaire avant intervention.' : 'En confirmant, vous autorisez FIXEO à rechercher un artisan pour cette intervention.'}</FixeoText>
      <FixeoAction label="Confirmer et chercher un artisan" disabled={blocked || (phoneRequired && !phoneValid)} onPress={() => void confirm()} />
    </ClientSection>}
    {!stopped.current && !pendingConfirmation.current && started && <FixeoAction label="Revenir à mon besoin" variant="ghost" disabled={busy} onPress={onClose} />}
  </ClientSection>;
}
