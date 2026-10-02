export type RafiProvenance =
  | 'observed'
  | 'user_declared'
  | 'ai_inferred'
  | 'user_confirmed';

export type RafiContextFact = {
  label: string;
  value: string;
  provenance: RafiProvenance;
  confidence?: 'low' | 'medium' | 'high';
};

export type RafiContextSnapshot = {
  facts: RafiContextFact[];
  safetySignals: string[];
};

export const RAFI_PROVENANCE_LABELS: Record<RafiProvenance, string> = {
  observed: 'Observé',
  user_declared: 'Déclaré par vous',
  ai_inferred: 'Hypothèse RAFI',
  user_confirmed: 'Confirmé',
};

export function buildDeclaredContext(input: {
  description?: string | null;
  descriptionProvenance?: RafiProvenance;
  city?: string | null;
  serviceCategory?: string | null;
  serviceConfidence?: 'low' | 'medium' | 'high';
}): RafiContextSnapshot {
  const facts: RafiContextFact[] = [];

  if (input.description?.trim()) {
    facts.push({
      label: 'Problème',
      value: input.description.trim(),
      provenance: input.descriptionProvenance || 'user_declared',
      confidence: 'high',
    });
  }

  if (input.city?.trim()) {
    facts.push({
      label: 'Ville',
      value: input.city.trim(),
      provenance: 'user_declared',
      confidence: 'high',
    });
  }

  return { facts, safetySignals: [] };
}
