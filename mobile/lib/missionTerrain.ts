import { supabase } from './supabase';

export type MissionSnapshot = {
  mission_id: string;
  request_id: string;
  mission_status: string;
  request_status: string;
  accepted_at?: string | null;
  service_category?: string | null;
  city?: string | null;
  urgency?: string | null;
  description?: string | null;
  client_phone?: string | null;
  artisan_name?: string | null;
  artisan_verified?: boolean | null;
  agreed_price?: number | null;
};

function unwrapMission(data: any): MissionSnapshot | null {
  if (!data?.ok) {
    const reason = String(data?.reason || 'mission_unavailable');
    if (reason === 'mission_unavailable') return null;
    throw new Error(reason);
  }
  return data.mission || null;
}

export async function getMyCurrentArtisanMission(): Promise<MissionSnapshot | null> {
  const { data, error } = await supabase.rpc('get_my_current_artisan_mission_v1');
  if (error) throw error;
  return unwrapMission(data);
}

export async function getMyCurrentClientMission(): Promise<MissionSnapshot | null> {
  const { data, error } = await supabase.rpc('get_my_current_client_mission_v1');
  if (error) throw error;
  return unwrapMission(data);
}

export async function getArtisanMissionDetail(missionId: string): Promise<MissionSnapshot> {
  const { data, error } = await supabase.rpc('get_accepted_mission_detail', {
    p_mission_id: missionId,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(String(data?.reason || 'mission_unavailable'));
  return data as MissionSnapshot;
}

export async function startMission(missionId: string) {
  const { data, error } = await supabase.rpc('start_mission', {
    p_mission_id: missionId,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(String(data?.reason || 'start_failed'));
  return data;
}

export async function completeMission(missionId: string) {
  const { data, error } = await supabase.rpc('complete_mission', {
    p_mission_id: missionId,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(String(data?.reason || 'complete_failed'));
  return data;
}

export async function confirmCompletedRequest(requestId: string) {
  const { data, error } = await supabase.rpc('confirm_completed_mission', {
    p_request_id: requestId,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(String(data?.reason || 'validation_failed'));
  return data;
}
