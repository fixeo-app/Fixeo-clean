import { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
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

const metierLabels: Record<string, string> = { plomberie: 'Plomberie', electricite: 'Électricité', serrurerie: 'Serrurerie', climatisation: 'Climatisation', bricolage: 'Bricolage', menuiserie: 'Menuiserie', peinture: 'Peinture', maconnerie: 'Maçonnerie', nettoyage: 'Nettoyage', jardinage: 'Jardinage', demenagement: 'Déménagement', carrelage: 'Carrelage', autre: 'Autre' };

/** One optional, server-owned journey. No price, token decoding or local STOP release. */
export function ClientIntelligence({ context, onCreated, onClose, onStop }: {
  context: ClientIntelligenceContext; onCreated: (id: string) => void; onClose: () => void; onStop: (message?: string) => void;
}) {
  const [result, setResult] = useState<MobileEstimatorResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof intelligenceFailure> | null>(null);
  const [answer, setAnswer] = useState('');
  const [phone, setPhone] = useState('');
  const [confirming, setConfirming] = useState(false);
  const lock = useRef(false);
  const active = useRef(true);
  const stopped = useRef(false);
  const lastAction = useRef<MobileEstimatorRequest | null>(null);
  // After an ambiguous confirmation only the identical payload may be retried.
  const pendingConfirmation = useRef<MobileEstimatorRequest | 'direct' | null>(null);
  const directKey = useRef<string | null>(null);
  const initial = useRef(context).current;
  const outcome = estimatorOutcome(result);

  async function run(action: MobileEstimatorRequest) {
    if (lock.current || stopped.current) return;
    lock.current = true; setBusy(true); setError(null); lastAction.current = action;
    try {
      let response = await mobileEstimator(action);
      if (!active.current) return;
      if (estimatorStopped(response)) { stopped.current = true; onStop(estimatorOutcome(response)?.scope_summary[0]); setResult(response); return; }
      if (response.next_step?.type === 'READY' && !estimatorOutcome(response) && response.session?.session_token) {
        response = await mobileEstimator({ action: 'evaluate', session_token: response.session.session_token });
      }
      if (!active.current) return;
      if (estimatorStopped(response)) { stopped.current = true; onStop(estimatorOutcome(response)?.scope_summary[0]); }
      if (!response.session && !estimatorOutcome(response) && !response.request_id && !response.id) throw new Error('ESTIMATOR_UNAVAILABLE');
      setResult(response); setAnswer('');
      if (action.action === 'confirm_request' || action.action === 'confirm_quote') {
        const id = response.request_id || response.id;
        if (!id) throw new Error('REQUEST_ID_MISSING');
        onCreated(id);
      }
    } catch (failure) {
      if (!active.current) return;
      const view = intelligenceFailure(failure); setError(view);
      if (view.kind === 'safety') { stopped.current = true; onStop(); }
    } finally { lock.current = false; if (active.current) setBusy(false); }
  }
  function start(metier?: string) {
    void run({ action: 'start', entry_context: { city_slug: initial.city, description: initial.description, ...(metier ? { metier_hint: metier } : {}),
      ...(initial.diagnosticReference ? { diagnostic_token: initial.diagnosticReference } : {}) } });
  }
  useEffect(() => {
    active.current = true; start();
    void getClientProfile().then(profile => { if (active.current) setPhone(profile.phone || ''); }).catch(() => undefined);
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
  const blocked = busy || !!error || stopped.current;
  return <ClientSection testID="client-intelligence" label="RAFI · LA SUITE POUR VOUS">
    {busy && <FixeoText accessibilityLiveRegion="polite">{confirming ? 'FIXEO prépare votre demande…' : 'RAFI prépare la suite…'}</FixeoText>}
    {error && <View style={{ gap: 12 }}>
      <FixeoText accessibilityRole="alert">{error.message}</FixeoText>
      {error.kind === 'auth' ? <FixeoAction label="Me reconnecter" onPress={() => router.replace('/sign-in')} /> :
        error.kind === 'retry' && <FixeoAction label={pendingConfirmation.current ? 'Vérifier et réessayer la confirmation' : 'Réessayer avec RAFI'} disabled={busy}
          onPress={() => pendingConfirmation.current ? void confirm() : lastAction.current && void run(lastAction.current)} />}
      {pendingConfirmation.current && <FixeoText variant="supporting">Votre confirmation est conservée. Cette vérification ne crée pas une seconde demande.</FixeoText>}
    </View>}
    {outcome && <ClientFixeoResult outcome={outcome} />}
    {!outcome && step?.type === 'SERVICE_SELECTION' && <ClientSection label="Précisons votre besoin">
      <FixeoText>{step.prompt_fr || 'Quelle intervention correspond à votre besoin ?'}</FixeoText>
      {step.candidate_services?.map(service => <FixeoAction key={service.service_code} label={service.label_fr || 'Choisir cette intervention'} variant="secondary" disabled={blocked}
        onPress={() => token && void run({ action: 'select_service', session_token: token, service_code: service.service_code })} />)}
    </ClientSection>}
    {!outcome && step?.type === 'QUESTION' && <ClientSection testID="client-estimator-question">
      <FixeoText variant="heading">{step.prompt_fr || 'Précisez votre besoin.'}</FixeoText>
      {options.length ? options.map((option, i) => <FixeoAction key={i} label={(optionLabels as Record<string, string>)[String(option.value)] || option.label} variant="secondary" disabled={blocked}
        onPress={() => token && step.question_id && void run({ action: 'answer', session_token: token, question_id: step.question_id, answer: option.value })} />) : <>
        <TextInput accessibilityLabel="Votre précision" style={clientStyles.input} value={answer} onChangeText={setAnswer} editable={!blocked} keyboardType={step.answer_type === 'number' ? 'numeric' : 'default'} />
        <FixeoAction label="Continuer" disabled={blocked || !answer.trim()} onPress={() => token && step.question_id && void run({ action: 'answer', session_token: token,
          question_id: step.question_id, answer: step.answer_type === 'number' ? Number(answer) : answer })} />
      </>}
    </ClientSection>}
    {!outcome && step?.type === 'METIER_SELECTION' && <ClientSection label="Précisons votre besoin">
      <FixeoText>Quel métier correspond à votre besoin ?</FixeoText>
      {step.candidate_metiers?.map(metier => <FixeoAction key={metier} label={metierLabels[metier] || metier} variant="secondary" disabled={blocked} onPress={() => start(metier)} />)}
    </ClientSection>}
    {canConfirm && !confirming && <FixeoAction label={outcome?.outcome_type === 'QUOTE_REQUIRED' ? 'Préparer ma demande de devis' : 'Continuer avec cette estimation'} disabled={blocked} onPress={() => setConfirming(true)} />}
    {confirming && <ClientSection testID="client-estimator-confirmation" label="Votre confirmation">
      <FixeoText>{initial.description}</FixeoText><FixeoText tone="secondary">{initial.city}</FixeoText>
      {phoneRequired && <TextInput accessibilityLabel="Téléphone de contact" keyboardType="phone-pad" style={clientStyles.input} value={phone} onChangeText={setPhone} editable={!busy && !pendingConfirmation.current} />}
      <FixeoText variant="supporting">{outcome?.outcome_type === 'QUOTE_REQUIRED' ? 'Aucun prix n’est confirmé. Un devis est nécessaire avant intervention.' : 'En confirmant, vous autorisez FIXEO à rechercher un artisan pour cette intervention.'}</FixeoText>
      <FixeoAction label="Confirmer et chercher un artisan" disabled={blocked || (phoneRequired && !phoneValid)} onPress={() => void confirm()} />
    </ClientSection>}
    {!stopped.current && !pendingConfirmation.current && <FixeoAction label="Revenir à mon besoin" variant="ghost" disabled={busy} onPress={onClose} />}
  </ClientSection>;
}
