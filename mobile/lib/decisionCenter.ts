import { supabase } from './supabase';

export type MobileDecisionEvidence = {
  field: string;
  value: string | number | boolean | null;
};

export type MobileDecisionAction =
  | { kind: 'none' }
  | { kind: 'open_mission'; mission_id: string }
  | { kind: 'accept_offer'; request_id: string };

export type MobileDecisionCue = {
  id: string;
  source: 'canonical' | 'decision_center';
  authority: 'workflow' | 'dispatch' | 'decision_center';
  priority: 'low' | 'normal' | 'high' | 'critical';
  headline: string;
  detail: string;
  action: MobileDecisionAction;
  evidence: MobileDecisionEvidence[];
};

export type MobileDecisionContext = {
  ok: boolean;
  version: number;
  role: string;
  cue: MobileDecisionCue | null;
  reason?: string;
};

export async function getMyMobileDecisionContext(): Promise<MobileDecisionContext> {
  const { data, error } = await supabase.rpc('get_my_mobile_decision_context_v1');
  if (error) throw error;

  const value = data as MobileDecisionContext | null;
  if (!value || value.ok !== true) {
    throw new Error(value?.reason || 'DECISION_CONTEXT_UNAVAILABLE');
  }

  return {
    ok: true,
    version: Number(value.version || 1),
    role: String(value.role || ''),
    cue: value.cue || null,
  };
}
