// Shape fixtures based on api/diagnostic/engine.js and tests/diagnostic/photo-grounding.test.cjs.
// Illustrative multimodal evidence, never a real customer's diagnosis or a commercial offer.
import type { MobileDiagnosticResult } from '../../lib/mobileDiagnostic';
export const diagnosticResult: MobileDiagnosticResult = {
  version: 'fixeo-diagnostic-v1', indicative: 'Diagnostic indicatif — à confirmer par l’artisan si nécessaire.',
  trade: { value: 'plomberie', provenance: 'ai_inferred' },
  problem: { value: 'Selon votre description, fuite possible au raccord du siphon.', provenance: 'ai_inferred' },
  facts: [
    { key: 'user_description', value: 'De l’eau goutte au raccord sous le lavabo.', provenance: 'user_declared' },
    { key: 'observation_0', value: 'Un tuyau blanc forme un U sous un évier.', provenance: 'observed', media_ids: ['fixture-photo'] },
    { key: 'access', value: 'Le meuble est accessible.', provenance: 'user_confirmed' },
  ],
  hypotheses: [{ value: 'Joint possiblement usé', provenance: 'ai_inferred' }],
  possible_parts: [{ value: 'Joint de siphon', provenance: 'ai_inferred', certain: false }],
  checks: ['Étanchéité du raccord à confirmer sur place.'],
  questions: [{ id: 'occurrence', label: 'À quel moment le problème apparaît-il ?', type: 'text' }, { id: 'onset', label: 'Depuis quand constatez-vous ce problème ?', type: 'text' }],
  safety: { stop: false, level: 'NORMAL', signals: [] },
  urgency: { value: 'moderate', provenance: 'ai_inferred', reason: 'Écoulement localisé déclaré par le client.' }, next: 'questions',
};
export const diagnosticSafety: MobileDiagnosticResult = {
  ...diagnosticResult, problem: {value: 'Danger immédiat signalé — évaluation professionnelle nécessaire après mise en sécurité.', provenance: 'ai_inferred'},
  facts: [], hypotheses: [], possible_parts: [], checks: [], questions: [],
  safety: { stop: true, level: 'CRITICAL', signals: ['electrical_risk'] }, urgency: {value:'critical',provenance:'ai_inferred'}, next:'safety_stop',
};
