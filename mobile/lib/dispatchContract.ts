export type DispatchOffer = {
  request_id: string;
  queue_status: 'QUEUED' | 'CONTACTED';
  match_rank?: number | null;
  batch_number?: number | null;
  position_in_batch?: number | null;
  service_category?: string | null;
  city?: string | null;
  urgency?: string | null;
  request_created_at?: string | null;
};

export function normalizeDispatchOffers(payload: any): DispatchOffer[] {
  if (!payload || payload.ok !== true || !Array.isArray(payload.offers)) return [];
  return payload.offers.filter((offer: any) =>
    offer &&
    typeof offer.request_id === 'string' &&
    (offer.queue_status === 'QUEUED' || offer.queue_status === 'CONTACTED')
  );
}
