import type { ArtisanMission, ArtisanNotification } from './artisanOS';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Only objects returned by owner-scoped authorities become targets. No home fallback. */
export function artisanNotificationTarget(n: ArtisanNotification, missions: ArtisanMission[], offers: { request_id: string }[]) {
  const id = n.related_entity_id || '';
  if (!uuid.test(id) || !n.type.startsWith('a_')) return null;
  if (['mission', 'service_request'].includes(n.related_entity_type || '')) {
    const mission = missions.find(m => m.mission_id === id || m.request_id === id);
    if (mission) return { pathname: '/mission/[id]', params: { id: mission.mission_id } };
  }
  if (['service_request', 'opportunity'].includes(n.related_entity_type || '') && offers.some(o => o.request_id === id))
    return { pathname: '/artisan-workspace/opportunity/[id]', params: { id } };
  return null;
}
