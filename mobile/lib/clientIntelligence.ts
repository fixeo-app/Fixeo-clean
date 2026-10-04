import type { MobileEstimatorResponse, MobileEstimatorRequest } from './mobileEstimatorContract';

export type ClientIntelligenceContext = { city: string; description: string; diagnosticReference?: string };
export function wantsEstimate(description: string) {
  return /estim|combien|co[uû]t|tarif|prix|budget/i.test(description);
}
export function estimatorOutcome(response: MobileEstimatorResponse | null) {
  return response?.outcome || response?.session?.outcome || null;
}
export function estimatorStopped(response: MobileEstimatorResponse | null) {
  return response?.session?.state === 'SAFETY_STOP' || estimatorOutcome(response)?.outcome_type === 'SAFETY_STOP';
}
export function estimatorConfirmation(response: MobileEstimatorResponse, context: ClientIntelligenceContext, phone: string): MobileEstimatorRequest | null {
  if (estimatorStopped(response)) return null;
  const outcome = estimatorOutcome(response);
  if (!outcome) return null;
  if (['PRICE_READY', 'DIAGNOSTIC_READY', 'LABOUR_PLUS_PART_READY'].includes(outcome.outcome_type) && response.pricing_context_token) {
    return { action: 'confirm_request', pricing_context_token: response.pricing_context_token, client_phone: phone,
      service_code: outcome.service_code, city_slug: context.city, confirmed: true };
  }
  if (outcome.outcome_type === 'QUOTE_REQUIRED' && context.diagnosticReference && response.session?.session_token) {
    return { action: 'confirm_quote', session_token: response.session.session_token, client_phone: phone, confirmed: true };
  }
  return null;
}
export function intelligenceFailure(error: unknown) {
  const code = String((error as { message?: string })?.message || '');
  if (/AUTH_|UNAUTHENTICATED|ROLE_FORBIDDEN/.test(code)) return { kind: 'auth', message: 'Votre session doit être renouvelée. Reconnectez-vous pour continuer.' };
  if (/SAFETY_STOP/.test(code)) return { kind: 'safety', message: 'Ne poursuivez pas cette intervention. Faites vérifier la situation par un professionnel.' };
  if (/EXPIRED|PRICING_CONTEXT_|DIAGNOSTIC_LINK|MOBILE_IDEMPOTENCY_CONFLICT/.test(code)) return { kind: 'expired', message: 'Ce résultat ne peut plus être confirmé. Reprenez l’analyse de votre besoin.' };
  if (/QUOTA/.test(code)) return { kind: 'quota', message: 'RAFI a atteint sa limite d’analyse pour le moment. Votre demande simple reste possible.' };
  if (/CITY_NOT_SUPPORTED/.test(code)) return { kind: 'city', message: 'Choisissez une ville FIXEO prise en charge.' };
  if (/INVALID_PHONE/.test(code)) return { kind: 'phone', message: 'Vérifiez votre numéro de téléphone marocain.' };
  return { kind: 'retry', message: 'La connexion avec RAFI est indisponible. Réessayez quand vous êtes connecté.' };
}

export function canonicalOption(option: unknown): { value: string | number | boolean; label: string } | null {
  if (typeof option === 'string' || typeof option === 'number' || typeof option === 'boolean') return { value: option, label: String(option) };
  if (!option || typeof option !== 'object') return null;
  const item = option as Record<string, unknown>;
  const value = item.value ?? item.id;
  if (!['string', 'number', 'boolean'].includes(typeof value)) return null;
  return { value: value as string | number | boolean, label: String(item.label_fr || item.label || value) };
}
