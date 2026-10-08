import type { FixeoRole } from './auth';

export type NotificationIntentData = {
  screen?: string;
  mission_id?: string;
  request_id?: string;
};

export type NotificationDestination = {
  pathname: string;
  params?: Record<string, string>;
};

export function normalizeNotificationIntent(
  input: Record<string, unknown> | null | undefined,
): NotificationIntentData {
  return {
    screen: String(input?.screen || '').trim().toLowerCase(),
    mission_id: String(input?.mission_id || '').trim(),
    request_id: String(input?.request_id || '').trim(),
  };
}

function unavailable(role: FixeoRole): NotificationDestination | null {
  if (role === 'client') return { pathname: '/client-workspace/notifications', params: { unavailable: '1' } };
  if (role === 'artisan') return { pathname: '/artisan-workspace/notifications', params: { unavailable: '1' } };
  return null;
}

export function notificationDestinationForRole(
  data: NotificationIntentData,
  role: FixeoRole,
): NotificationDestination | null {
  if (role === 'admin') return null;

  const screen = String(data.screen || '').replace(/_/g, '-');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const missionId = uuid.test(data.mission_id || '') ? data.mission_id : '';
  const requestId = uuid.test(data.request_id || '') ? data.request_id : '';

  const artisanMission = ['artisan-mission', 'mission-artisan'].includes(screen);
  const clientMission = ['client-mission', 'mission-client'].includes(screen);

  if (role === 'artisan') {
    if (clientMission || screen.startsWith('client')) return unavailable(role);

    if ((artisanMission || (!screen && missionId)) && missionId) {
      return {
        pathname: '/mission/[id]',
        params: { id: missionId },
      };
    }

    if (screen === 'artisan-workspace') return { pathname: '/artisan-workspace' };
    if (screen === 'artisan-agenda') return { pathname: '/artisan-workspace/agenda' };
    if (screen === 'opportunity' && requestId) return { pathname: '/artisan-workspace/opportunity/[id]', params: { id: requestId } };
    if (screen === 'artisan-alerts' || screen === 'alerts') return { pathname: '/artisan-workspace/notifications' };
    if (screen === 'artisan' || screen === 'opportunities') {
      return { pathname: '/artisan' };
    }

    return unavailable(role);
  }

  if (artisanMission || screen.startsWith('artisan') || screen.startsWith('opportunit')) return unavailable(role);

  if ((clientMission || (!screen && missionId)) && missionId) {
    return {
      pathname: '/client-mission/[id]',
      params: { id: missionId },
    };
  }

  if (requestId && (!screen || screen === 'client-request')) return { pathname: '/client-request/[id]', params: { id: requestId } };
  if (screen === 'client-workspace') return { pathname: '/client-workspace' };
  if (screen === 'client-alerts' || screen === 'alerts') {
    return { pathname: '/client-workspace/notifications' };
  }
  if (screen === 'client') return { pathname: '/' };

  return unavailable(role);
}
