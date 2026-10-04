import type { MobileDiagnosticResult } from './mobileDiagnostic';
import safetyQuestionIds from './diagnosticSafetyQuestions.generated.json';

// These fields already exist in the server question router. No new server contract.
type DiagnosticQuestion = MobileDiagnosticResult['questions'][number] & { hazard?: string; optional?: boolean };
const safetyIds = new Set(safetyQuestionIds);

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
