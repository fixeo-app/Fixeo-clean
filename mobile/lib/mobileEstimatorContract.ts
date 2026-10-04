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
  replayed?: boolean;
  qualification_limit_reached?: boolean;
};
export function validateMobileEstimatorResponse(value: unknown): MobileEstimatorResponse {
  const body = value as MobileEstimatorResponse;
  if (!body || typeof body !== 'object' || body.ok !== true ||
      (body.session && (typeof body.session.session_token !== 'string' || typeof body.session.state !== 'string')) ||
      (body.pricing_context_token != null && typeof body.pricing_context_token !== 'string')) throw new Error('ESTIMATOR_UNAVAILABLE');
  return body;
}
