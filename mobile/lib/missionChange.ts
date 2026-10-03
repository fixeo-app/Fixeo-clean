import { supabase } from './supabase';

export type MissionChangeProposal = {
  id: string;
  mission_id: string;
  proposed_price: number;
  reason: string;
  supplies?: string | null;
  estimated_duration?: string | null;
  version: number;
  status: 'submitted' | 'presented' | 'rejected_by_fixeo' | 'client_accepted' | 'client_rejected';
  review_reason?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export async function submitMissionChange(
  missionId: string,
  proposedPrice: number,
  reason: string,
  supplies?: string,
  estimatedDuration?: string,
) {
  const { data, error } = await supabase.rpc('submit_mobile_mission_change_v1', {
    p_mission_id: missionId,
    p_proposed_price: proposedPrice,
    p_reason: reason,
    p_supplies: supplies || null,
    p_estimated_duration: estimatedDuration || null,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(String(data?.reason || 'change_submit_failed'));
  return data;
}

export async function getMissionChange(missionId: string): Promise<MissionChangeProposal | null> {
  const { data, error } = await supabase.rpc('get_my_mobile_mission_change_v1', {
    p_mission_id: missionId,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(String(data?.reason || 'change_lookup_failed'));
  return data.proposal || null;
}

export async function respondMissionChange(proposalId: string, approve: boolean) {
  const { data, error } = await supabase.rpc('respond_mobile_mission_change_v1', {
    p_proposal_id: proposalId,
    p_approve: approve,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(String(data?.reason || 'change_response_failed'));
  return data;
}
