import { canonicalOption, estimatorOutcome, estimatorStopped, type ClientIntelligenceContext } from './clientIntelligence';
import type { EstimatorDraft } from './clientDrafts';
import type { MobileEstimatorRequest, MobileEstimatorResponse } from './mobileEstimatorContract';

const signature = (result: MobileEstimatorResponse) => JSON.stringify({
  metier: result.session?.metier, service: result.session?.service_code,
  type: result.next_step?.type, id: result.next_step?.question_id, input: result.next_step?.input_id,
  prompt: result.next_step?.prompt_fr, answerType: result.next_step?.answer_type,
  options: result.next_step?.options, services: result.next_step?.candidate_services,
});

/** Replays declared answers against NEW server questions. Never sends cached authority or confirms a request. */
export async function recoverEstimator(draft: EstimatorDraft, context: ClientIntelligenceContext,
  request: (action: MobileEstimatorRequest) => Promise<MobileEstimatorResponse>, valid: () => boolean = () => true) {
  const metier = draft.result?.session?.metier || (context.metierProvenance === 'user_confirmed' ? context.metierHint : undefined);
  let result = await request({ action: 'start', entry_context: { city_slug: context.city, description: context.description,
    ...(metier ? { metier_hint: metier } : {}), ...(context.diagnosticReference ? { diagnostic_token: context.diagnosticReference } : {}) } });
  const history: EstimatorDraft['history'] = [];
  for (const prior of draft.history.slice(0, 64)) {
    if (!valid() || estimatorStopped(result) || estimatorOutcome(result)) break;
    if (signature(prior.result) !== signature(result) || !result.session?.session_token) break;
    const step = result.next_step, token = result.session.session_token;
    let action: MobileEstimatorRequest | null = null;
    if (step?.type === 'SERVICE_SELECTION' && step.candidate_services?.some(item => item.service_code === prior.answer))
      action = { action: 'select_service', session_token: token, service_code: String(prior.answer) };
    if (step?.type === 'QUESTION' && step.question_id) {
      const options = (step.options || []).map(canonicalOption).filter(Boolean);
      if (options.length && !options.some(item => item?.value === prior.answer)) break;
      const answer = step.answer_type === 'number' ? Number(String(prior.answer).replace(',', '.')) : prior.answer;
      if (typeof answer === 'number' && !Number.isFinite(answer)) break;
      action = { action: 'answer', session_token: token, question_id: step.question_id, answer };
    }
    if (!action) break;
    history.push({ result, answer: prior.answer, label: prior.label });
    result = await request(action);
  }
  if (valid() && !estimatorStopped(result) && result.next_step?.type === 'READY' && result.session?.session_token && estimatorOutcome(draft.result)) {
    history.push({ result, label: '', answer: '' });
    result = await request({ action: 'evaluate', session_token: result.session.session_token });
  }
  return { result, history, answer: draft.result && signature(draft.result) === signature(result) ? draft.answer : '' };
}
