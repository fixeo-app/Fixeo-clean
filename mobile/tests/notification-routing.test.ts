import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeNotificationIntent,
  notificationDestinationForRole,
} from '../lib/notificationRouting';

test('notification routing opens the exact mission for the matching universe', () => {
  const artisan = notificationDestinationForRole(
    normalizeNotificationIntent({
      screen: 'artisan-mission',
      mission_id: 'mission-42',
    }),
    'artisan',
  );
  assert.deepEqual(artisan, {
    pathname: '/mission/[id]',
    params: { id: 'mission-42' },
  });

  const client = notificationDestinationForRole(
    normalizeNotificationIntent({
      screen: 'client_mission',
      mission_id: 'mission-42',
    }),
    'client',
  );
  assert.deepEqual(client, {
    pathname: '/client-mission/[id]',
    params: { id: 'mission-42' },
  });
});

test('notification routing never crosses Client and Artisan universes', () => {
  const artisanOpeningClient = notificationDestinationForRole(
    {
      screen: 'client-mission',
      mission_id: 'mission-42',
    },
    'artisan',
  );
  assert.deepEqual(artisanOpeningClient, { pathname: '/artisan' });

  const clientOpeningArtisan = notificationDestinationForRole(
    {
      screen: 'artisan-mission',
      mission_id: 'mission-42',
    },
    'client',
  );
  assert.deepEqual(clientOpeningArtisan, { pathname: '/' });
});

test('notification routing supports useful workspace destinations and safe fallback', () => {
  assert.deepEqual(
    notificationDestinationForRole({ screen: 'client-alerts' }, 'client'),
    { pathname: '/client-workspace/notifications' },
  );
  assert.deepEqual(
    notificationDestinationForRole({ screen: 'artisan-agenda' }, 'artisan'),
    { pathname: '/artisan-workspace/agenda' },
  );
  assert.deepEqual(
    notificationDestinationForRole({ screen: 'unknown' }, 'client'),
    { pathname: '/' },
  );
  assert.equal(
    notificationDestinationForRole({ screen: 'client' }, 'admin'),
    null,
  );
});
