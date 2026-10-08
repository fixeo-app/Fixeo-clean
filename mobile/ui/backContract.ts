export type BackDestination = string | { pathname: string; params: Record<string, string> };
const uuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
/** A detail's parent belongs to its own universe, never to incidental history. */
export function logicalParent(path: string, params: Record<string, unknown> = {}): BackDestination {
  if (path.startsWith('/artisan-workspace/quote/')) return typeof params.clientId === 'string' && uuid.test(params.clientId)
    ? { pathname: '/artisan-workspace/client/[id]', params: { id: params.clientId } } : '/artisan-workspace/quotes';
  if (path === '/artisan-workspace/agenda' && typeof params.clientId === 'string' && uuid.test(params.clientId))
    return { pathname: '/artisan-workspace/client/[id]', params: { id: params.clientId } };
  if (path.startsWith('/artisan-workspace/client/')) return '/artisan-workspace/clients';
  if (path.startsWith('/artisan-workspace/opportunity/')) return '/artisan-workspace/opportunities';
  if (path.startsWith('/artisan-workspace/evidence/') || path.startsWith('/mission/')) return '/artisan-workspace/missions';
  if (path === '/artisan-workspace/profile' && params.from === 'availability') return '/artisan-workspace';
  if (path.startsWith('/artisan')) return '/artisan';
  if (path.startsWith('/client-mission/') || path.startsWith('/client-request/')) return '/client-workspace/history';
  return '/';
}
