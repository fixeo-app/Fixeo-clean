import { requireCanonicalCity, withCanonicalCity } from './clientLocation';
import { supabase } from './supabase';

export type ClientProfile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  city: string | null;
  email: string | null;
};

export type ClientRequestHistory = {
  id: string;
  service_category: string | null;
  city: string | null;
  description: string | null;
  status: string;
  created_at: string;
};

export type ClientNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
};

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error || new Error('UNAUTHENTICATED');
  return data.user.id;
}

export async function getClientProfile(): Promise<ClientProfile> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('profiles')
    .select('id,full_name,phone,city,email')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return withCanonicalCity(data as ClientProfile);
}

export async function updateClientProfile(input: {
  phone?: string | null;
  city?: string | null;
}): Promise<ClientProfile> {
  const userId = await currentUserId();
  const patch: Record<string, string | null> = {};
  if ('phone' in input) patch.phone = input.phone?.trim() || null;
  if ('city' in input) patch.city = input.city?.trim() ? requireCanonicalCity(input.city) : null;

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select('id,full_name,phone,city,email')
    .single();
  if (error) throw error;
  return withCanonicalCity(data as ClientProfile);
}

export async function listClientRequestHistory(limit = 50): Promise<ClientRequestHistory[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('service_requests')
    .select('id,service_category,city,description,status,created_at')
    .eq('client_profile_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(withCanonicalCity) as ClientRequestHistory[];
}

export async function listClientNotifications(limit = 60): Promise<ClientNotification[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('notifications')
    .select('id,type,title,message,read,related_entity_type,related_entity_id,created_at,metadata')
    .eq('recipient_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as ClientNotification[];
}

export async function markClientNotificationRead(id: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', id)
    .eq('recipient_user_id', userId);
  if (error) throw error;
}

export type ClientRequestDetail = ClientRequestHistory & { mission_id: string | null };
/** Exact owned request first; a global latest-mission lookup is never a detail authority. */
export async function getClientRequestDetail(id: string): Promise<ClientRequestDetail> {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) throw new Error('REQUEST_INVALID');
  const userId = await currentUserId();
  const { data, error } = await supabase.from('service_requests')
    .select('id,service_category,city,description,status,created_at').eq('id', id).eq('client_profile_id', userId).single();
  if (error || !data) throw error || new Error('REQUEST_NOT_FOUND');
  const missions = await supabase.from('missions').select('id').eq('request_id', id)
    .in('status', ['pending', 'done', 'validated']).order('accepted_at', { ascending: false }).limit(1);
  if (missions.error) throw missions.error;
  return withCanonicalCity({ ...data, mission_id: missions.data?.[0]?.id || null }) as ClientRequestDetail;
}
