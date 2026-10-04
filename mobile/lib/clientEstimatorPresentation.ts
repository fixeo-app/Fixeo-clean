/** Public normalized server view only. No transport, token storage, pricing engine or reservation. */
export type ClientEstimatorOutcome = {
  outcome_type: string;
  service_code: string | null;
  service_label?: string | null;
  scope_summary: string[];
  exclusions_summary: string[];
  next_action: string | null;
  price?: { amount_mad?: number | null; labour_amount_mad?: number | null; currency: string };
  diagnostic_price_mad?: number | null;
  variable_part_separate?: boolean;
  route?: string | { target_service: string | null; target_external: string | null; message: string } | null;
};
export function clientEstimatorPresentation(outcome: ClientEstimatorOutcome) {
  const titles: Record<string, string> = {PRICE_READY:'Prix FIXEO', DIAGNOSTIC_READY:'Diagnostic FIXEO', LABOUR_PLUS_PART_READY:'Main-d’œuvre FIXEO', ADD_ON_READY:'Option FIXEO', QUOTE_REQUIRED:'Votre intervention nécessite un devis.', ROUTE_REQUIRED:'Voici la prochaine étape.', SAFETY_STOP:'La sécurité d’abord.', REQUALIFY:'Une précision utile.'};
  const priced = ['PRICE_READY', 'DIAGNOSTIC_READY', 'LABOUR_PLUS_PART_READY', 'ADD_ON_READY'].includes(outcome.outcome_type);
  const amount = outcome.outcome_type === 'LABOUR_PLUS_PART_READY' ? outcome.price?.labour_amount_mad : outcome.outcome_type === 'DIAGNOSTIC_READY' ? outcome.diagnostic_price_mad : outcome.price?.amount_mad;
  return {
    title: titles[outcome.outcome_type] || 'FIXEO prépare la suite.',
    amount: priced && typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 ? amount : null,
    safety: outcome.outcome_type === 'SAFETY_STOP',
    moreInformation: outcome.next_action === 'PROVIDE_MORE_INFORMATION',
    route: typeof outcome.route === 'string' ? outcome.route : outcome.route?.message,
    // A result alone is never authority to create a request. Secure mobile handoff absent.
    canCreateRequest: false as const,
  };
}
