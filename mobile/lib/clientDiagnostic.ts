import type { MobileDiagnosticResult } from './mobileDiagnostic';
import safetyQuestionIds from './diagnosticSafetyQuestions.generated.json';

// These fields already exist in the server question router. No new server contract.
type DiagnosticQuestion = MobileDiagnosticResult['questions'][number] & { hazard?: string; optional?: boolean };
const safetyIds = new Set(safetyQuestionIds);

const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** Conservative fallback for older results: observations alone, never the inferred trade. */
export function photoRelevance(result: MobileDiagnosticResult, description = ''): 'related' | 'unrelated' | 'uncertain' {
  const observed = fold(result.facts.filter(fact => fact.provenance === 'observed').map(fact => fact.value).join(' '));
  const declared = fold(description || result.facts.find(fact => fact.key === 'user_description')?.value || '');
  if (/chasse d['’ ]?eau|\bwc\b|toilett/.test(declared) && /ordinateur|ecran|informatique|clavier|moniteur/.test(observed)
      && !/chasse d['’ ]?eau|\bwc\b|toilett|cuvette|reservoir|sanitaire/.test(observed)) return 'unrelated';
  return result.photo_relevance?.value || 'uncertain';
}
const friendlyFacts: Record<string, string> = { onset: 'Début du problème', occurrence: 'Moment d’apparition', water_spreading: 'Propagation de l’eau', affected_area: 'Zone concernée' };
export function diagnosticFactText(fact: MobileDiagnosticResult['facts'][number]) {
  const value = String(fact.value || '').trim();
  const friendly = friendlyFacts[value];
  if (friendly) return friendly;
  if (/^[a-z]+(?:_[a-z]+)+$/.test(value)) return 'Précision enregistrée, à vérifier avec vous.';
  return value;
}

export const diagnosticProvenance = (value: string) => ({
  observed: 'OBSERVÉ', user_declared: 'DÉCLARÉ', ai_inferred: 'HYPOTHÈSE', user_confirmed: 'CONFIRMÉ',
}[value] || 'À CONFIRMER');

export function diagnosticQuestions(result: MobileDiagnosticResult) {
  const seen = new Set<string>();
  if (result.safety.stop) return [];
  return (result.questions as DiagnosticQuestion[]).filter(question => {
    // Optional preventive prompts are not risk findings. Only safety.stop blocks.
    if (question.hazard || (question.id && safetyIds.has(question.id))) return false;
    const label = question.label?.trim();
    if (!label || seen.has(label)) return false;
    seen.add(label); return true;
  }).slice(0, 1); // At most one useful clarification per analysis; never a local loop.
}

// Intake presentation guard only. No workflow, engine or service classification.
export function canSendClientIntake(input: { busy: boolean; diagnostic: MobileDiagnosticResult | null; reviewed: boolean }) {
  return !input.busy && !input.diagnostic?.safety?.stop
    && (!input.diagnostic || input.reviewed);
}

export function confirmedDiagnosticDescription(result: MobileDiagnosticResult, answers: string[]) {
  const questions = diagnosticQuestions(result);
  return [result.problem.value, ...questions.flatMap((question, index) => answers[index]?.trim() ? [`${question.label} ${answers[index].trim()}`] : [])].join('\n');
}

export function diagnosticSafetyMessage(result: MobileDiagnosticResult) {
  const safety = result.safety as MobileDiagnosticResult['safety'] & { messages?: string[] };
  return safety.messages?.find(message => typeof message === 'string' && message.trim())
    || 'Ne poursuivez pas cette manipulation. Faites vérifier la situation par un professionnel.';
}
