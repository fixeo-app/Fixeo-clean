import type { ClientNotification } from './clientWorkspace';
const uuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
export function clientNotificationTarget(item: ClientNotification) {
  const id = item.related_entity_id || '';
  const mission = String(item.metadata?.mission_id || '');
  if (uuid.test(mission)) return { pathname: '/client-mission/[id]' as const, params: { id: mission } };
  if (!uuid.test(id)) return null;
  // Verified s1b events label the entity "mission" but canonically store the request UUID.
  if (item.related_entity_type === 'service_request' || (item.related_entity_type === 'mission' && item.metadata?.source === 's1b'))
    return { pathname: '/client-request/[id]' as const, params: { id } };
  if (item.related_entity_type === 'mission') return { pathname: '/client-mission/[id]' as const, params: { id } };
  return null;
}
