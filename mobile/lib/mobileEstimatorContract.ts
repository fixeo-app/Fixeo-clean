import type { ClientEstimatorOutcome } from './clientEstimatorPresentation';
export type MobileEstimatorOutcome = ClientEstimatorOutcome & { absorption_possible?: boolean; parts_notice_required?: boolean; diagnostic_notice_required?: boolean };
export type EstimatorStep = {
  type: 'QUESTION' | 'READY' | 'SERVICE_SELECTION' | 'METIER_SELECTION' | string;
  question_id?: string;
  input_id?: string;
  prompt_fr?: string;
  answer_type?: string;
  options?: unknown[] | null;
  candidate_services?: Array<{ service_code: string; label_fr?: string }>;
  candidate_metiers?: string[];
};
export type EstimatorSession = {
  session_token: string;
  state: string;
  metier: string | null;
  service_code: string | null;
  outcome: MobileEstimatorOutcome | null;
};
export type MobileEstimatorRequest =
  | { action: 'start'; entry_context: { city_slug: string; description: string; metier_hint?: string; service_hint?: string; diagnostic_token?: string } }
  | { action: 'answer'; session_token: string; question_id: string; answer: string | number | boolean }
  | { action: 'select_service'; session_token: string; service_code: string }
  | { action: 'evaluate'; session_token: string }
  | { action: 'verify_pricing_context'; pricing_context_token: string }
  | { action: 'confirm_request'; pricing_context_token: string; client_phone: string; service_code: string; city_slug: string; confirmed: true }
  | { action: 'confirm_quote'; session_token: string; client_phone: string; confirmed: true };
export type MobileEstimatorResponse = {
  ok: true;
  session?: EstimatorSession;
  next_step?: EstimatorStep | null;
  outcome?: MobileEstimatorOutcome | null;
  pricing_context_token?: string | null;
  request_id?: string;
  id?: string;
  replayed?: boolean;
  qualification_limit_reached?: boolean;
};
export function validateMobileEstimatorResponse(value: unknown): MobileEstimatorResponse {
  const body = value as MobileEstimatorResponse;
  if (!body || typeof body !== 'object' || body.ok !== true ||
      (body.session && (typeof body.session.session_token !== 'string' || typeof body.session.state !== 'string')) ||
      (body.pricing_context_token != null && typeof body.pricing_context_token !== 'string')) throw new Error('ESTIMATOR_UNAVAILABLE');
  for (const outcome of [body.outcome, body.session?.outcome]) {
    if (outcome && (typeof outcome.outcome_type !== 'string' || (typeof outcome.service_code !== 'string' && !(outcome.service_code === null && ['SAFETY_STOP', 'QUOTE_REQUIRED', 'ROUTE_REQUIRED', 'REQUALIFY'].includes(outcome.outcome_type))) ||
      !Array.isArray(outcome.scope_summary) || !outcome.scope_summary.every(line => typeof line === 'string') ||
      !Array.isArray(outcome.exclusions_summary) || !outcome.exclusions_summary.every(line => typeof line === 'string'))) throw new Error('ESTIMATOR_UNAVAILABLE');
  }
  if (body.next_step && (typeof body.next_step.type !== 'string' ||
    (body.next_step.candidate_metiers != null && (!Array.isArray(body.next_step.candidate_metiers) || !body.next_step.candidate_metiers.every(item => typeof item === 'string'))) ||
    (body.next_step.options != null && !Array.isArray(body.next_step.options)) ||
    (body.next_step.candidate_services != null && (!Array.isArray(body.next_step.candidate_services) ||
      !body.next_step.candidate_services.every(item => item && typeof item.service_code === 'string'))))) throw new Error('ESTIMATOR_UNAVAILABLE');
  for (const id of [body.id, body.request_id]) if (id != null && (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id))) throw new Error('ESTIMATOR_UNAVAILABLE');
  return body;
}
