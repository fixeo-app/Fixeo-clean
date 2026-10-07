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

function roleHome(role: FixeoRole): NotificationDestination | null {
  if (role === 'client') return { pathname: '/' };
  if (role === 'artisan') return { pathname: '/artisan' };
  return null;
}

export function notificationDestinationForRole(
  data: NotificationIntentData,
  role: FixeoRole,
): NotificationDestination | null {
  if (role === 'admin') return null;

  const screen = String(data.screen || '').replace(/_/g, '-');
  const missionId = String(data.mission_id || '');

  const artisanMission = ['artisan-mission', 'mission-artisan'].includes(screen);
  const clientMission = ['client-mission', 'mission-client'].includes(screen);

  if (role === 'artisan') {
    if (clientMission) return roleHome(role);

    if ((artisanMission || (!screen && missionId)) && missionId) {
      return {
        pathname: '/mission/[id]',
        params: { id: missionId },
      };
    }

    if (screen === 'artisan-workspace') return { pathname: '/artisan-workspace' };
    if (screen === 'artisan-agenda') return { pathname: '/artisan-workspace/agenda' };
    if (screen === 'artisan' || screen === 'opportunity' || screen === 'opportunities') {
      return { pathname: '/artisan' };
    }

    return roleHome(role);
  }

  if (artisanMission) return roleHome(role);

  if ((clientMission || (!screen && missionId)) && missionId) {
    return {
      pathname: '/client-mission/[id]',
      params: { id: missionId },
    };
  }

  if (data.request_id && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(data.request_id)) return { pathname: '/client-request/[id]', params: { id: data.request_id } };
  if (screen === 'client-workspace') return { pathname: '/client-workspace' };
  if (screen === 'client-alerts' || screen === 'alerts') {
    return { pathname: '/client-workspace/notifications' };
  }
  if (screen === 'client') return { pathname: '/' };

  return roleHome(role);
}
