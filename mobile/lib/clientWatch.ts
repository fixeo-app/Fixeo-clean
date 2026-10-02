import { supabase } from './supabase';

export function watchClientNotifications(userId: string, onEvent: (payload: any) => void) {
  return supabase
    .channel('mobile-client-notifications-' + userId)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'recipient_user_id=eq.' + userId },
      onEvent,
    )
    .subscribe();
}

export function watchClientRequest(requestId: string, onEvent: (payload: any) => void) {
  return supabase
    .channel('mobile-client-request-' + requestId)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'service_requests', filter: 'id=eq.' + requestId },
      onEvent,
    )
    .subscribe();
}

export async function getClientRequestStatus(requestId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('service_requests')
    .select('status')
    .eq('id', requestId)
    .maybeSingle();
  if (error) return null;
  return data?.status ? String(data.status) : null;
}
