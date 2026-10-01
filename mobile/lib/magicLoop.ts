import { supabase } from './supabase';

import { DispatchOffer, normalizeDispatchOffers } from './dispatchContract';

export async function createRequest(
  service: string,
  city: string,
  description: string,
  idempotencyKey: string,
) {
  const { data, error } = await supabase.rpc('create_my_service_request_v1', {
    p_service_category: service,
    p_city: city,
    p_description: description,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  const requestId = String((data as any)?.id || (data as any)?.request_id || '');
  if (requestId) {
    void supabase.functions.invoke('mobile-magic-loop-push', {
      body: { action: 'dispatch_opportunities', request_id: requestId },
    });
  }
  return data;
}

export async function getDispatchOffers(): Promise<DispatchOffer[]> {
  const { data, error } = await supabase.rpc('get_my_dispatch_offers_v1');
  if (error) throw error;
  return normalizeDispatchOffers(data);
}

export async function acceptDispatchOffer(requestId: string) {
  const { data, error } = await supabase.rpc('accept_my_dispatch_offer_v1', {
    p_request_id: requestId,
  });
  if (error) throw error;
  if (!data || data.ok !== true) {
    const reason = String(data?.reason || 'accept_failed');
    throw new Error(reason);
  }

  // Persist canonical Client/Artisan notification from verified DB facts.
  // Acceptance stays authoritative even if notification persistence is temporarily unavailable.
  const notification = await supabase.rpc('publish_notification_event_s1b', {
    p_event: 'mission_accepted',
    p_entity_id: requestId,
  });

  void supabase.functions.invoke('mobile-magic-loop-push', {
    body: { action: 'mission_accepted', request_id: requestId },
  });

  return {
    ...data,
    notification_published: !notification.error,
  };
}

// Legacy/Admin-targeted mission path remains available but is not the Magic Loop authority.
export async function getTargetedOffers() {
  const { data, error } = await supabase.rpc('get_my_mission_offers');
  if (error) throw error;
  return Array.isArray(data?.offers) ? data.offers : [];
}

export async function claimTargetedMission(id: string) {
  const { data, error } = await supabase.rpc('claim_mission', { p_mission_id: id });
  if (error) throw error;
  return data;
}

export async function declineTargetedMission(id: string) {
  const { data, error } = await supabase.rpc('decline_mission', { p_mission_id: id });
  if (error) throw error;
  return data;
}

export async function getMission(id: string) {
  const { data, error } = await supabase.rpc('get_accepted_mission_detail', { p_mission_id: id });
  if (error) throw error;
  return data;
}
