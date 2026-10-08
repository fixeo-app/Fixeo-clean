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
      mission_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    }),
    'artisan',
  );
  assert.deepEqual(artisan, {
    pathname: '/mission/[id]',
    params: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  });

  const client = notificationDestinationForRole(
    normalizeNotificationIntent({
      screen: 'client_mission',
      mission_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    }),
    'client',
  );
  assert.deepEqual(client, {
    pathname: '/client-mission/[id]',
    params: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  });
});

test('notification routing never crosses Client and Artisan universes', () => {
  const artisanOpeningClient = notificationDestinationForRole(
    {
      screen: 'client-mission',
      mission_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    },
    'artisan',
  );
  assert.deepEqual(artisanOpeningClient, { pathname: '/artisan-workspace/notifications', params: { unavailable: '1' } });

  const clientOpeningArtisan = notificationDestinationForRole(
    {
      screen: 'artisan-mission',
      mission_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    },
    'client',
  );
  assert.deepEqual(clientOpeningArtisan, { pathname: '/client-workspace/notifications', params: { unavailable: '1' } });
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
    { pathname: '/client-workspace/notifications', params: { unavailable: '1' } },
  );
  assert.equal(
    notificationDestinationForRole({ screen: 'client' }, 'admin'),
    null,
  );
});


test('notification intents reject malformed IDs and open the exact opportunity without crossing universes', () => {
  const id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  assert.deepEqual(notificationDestinationForRole({screen:'opportunity',request_id:id},'artisan'), {pathname:'/artisan-workspace/opportunity/[id]',params:{id}});
  for (const intent of [{screen:'client-mission',mission_id:'../../private'}, {screen:'unknown',request_id:id}, {screen:'opportunity',request_id:id}])
    assert.deepEqual(notificationDestinationForRole(intent,'client'), {pathname:'/client-workspace/notifications',params:{unavailable:'1'}});
});
