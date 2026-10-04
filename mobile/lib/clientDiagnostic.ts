import type { MobileDiagnosticResult } from './mobileDiagnostic';

export const diagnosticProvenance = (value: string) => ({
  observed: 'OBSERVÉ', user_declared: 'DÉCLARÉ', ai_inferred: 'HYPOTHÈSE', user_confirmed: 'CONFIRMÉ',
}[value] || 'À CONFIRMER');

export function diagnosticQuestions(result: MobileDiagnosticResult) {
  const seen = new Set<string>();
  return result.questions.filter(question => {
    const label = question.label?.trim();
    if (!label || seen.has(label)) return false;
    seen.add(label); return true;
  });
}

// Intake presentation guard only. No workflow, engine or service classification.
export function canSendClientIntake(input: { busy: boolean; diagnostic: MobileDiagnosticResult | null; reviewed: boolean }) {
  return !input.busy && !input.diagnostic?.safety?.stop
    && !input.diagnostic?.questions.some(question => question.type === 'choice')
    && (!input.diagnostic || input.reviewed);
}

export function confirmedDiagnosticDescription(result: MobileDiagnosticResult, answers: string[]) {
  const questions = diagnosticQuestions(result);
  return [result.problem.value, ...questions.map((question, index) => `${question.label} ${answers[index]?.trim() || ''}`)].join('\n');
}
