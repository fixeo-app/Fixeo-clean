import assert from 'node:assert/strict';
import test from 'node:test';
import { clientAttentionRequest, clientHeroSize, clientHomeCopy, clientMissionPresentation, clientMissionSteps, clientNotificationSections } from '../lib/clientExperience';
import type { ClientNotification, ClientRequestHistory } from '../lib/clientWorkspace';
import { getClientContextualCockpit } from '../lib/contextualCockpit';

test('W4 Client priorities put validation before intervention, assignment, matching and alerts', () => {
  const items = ['new', 'assigned', 'in_progress', 'completed', 'validated'].map((status, index) => ({ id: String(index), status } as ClientRequestHistory));
  const order = [...items];
  const active = clientAttentionRequest(items);
  assert.equal(active?.status, 'completed');
  assert.equal(getClientContextualCockpit({ activeStatus: active?.status, unreadCount: 8 }).action, 'client_follow');
  assert.deepEqual(items, order);
  assert.equal(clientAttentionRequest(items.slice(4)), null);
  assert.equal(clientAttentionRequest([{ id: 'a', status: 'completed' }, { id: 'b', status: 'completed' }] as ClientRequestHistory[])?.id, 'a');
});

test('W4 creation and understanding cannot masquerade as an active artisan search', () => {
  assert.equal(clientHomeCopy('matching', 'working', true).eyebrow, 'VOTRE DEMANDE');
  assert.equal(clientHomeCopy('idle', 'understanding', false).eyebrow, 'RAFI COMPREND');
  assert.equal(clientHomeCopy('matching', 'matching', false).eyebrow, 'RECHERCHE EN COURS');
});

test('W4 larger RAFI fits both small and standard canvases without changing W3 geometry', () => {
  assert.equal(clientHeroSize(320, 568), 120);
  assert.equal(clientHeroSize(390, 844), 160);
  assert.ok(clientHeroSize(320, 568) * 1.5 < 320 - 48);
  assert.ok(clientHeroSize(390, 844) * 1.5 < 390 - 48);
});

test('W4 mission presentation never invents assignment or arrival while loading or unknown', () => {
  assert.equal(clientMissionPresentation(undefined).title, 'Ouverture du suivi.');
  assert.equal(clientMissionPresentation('new').orb, 'matching');
  assert.deepEqual(clientMissionSteps(undefined, false), []);
  assert.deepEqual(clientMissionSteps('cancelled', false), []);
  assert.ok(clientMissionSteps('new', false).every(step => !step.done));
  assert.equal(clientMissionSteps('assigned', false)[1].done, false);
  assert.equal(clientMissionSteps('assigned', true)[1].phase, 'now');
  assert.equal(clientMissionSteps('in_progress', false)[2].phase, 'now');
  assert.equal(clientMissionSteps('completed', false)[4].done, false);
  assert.equal(clientMissionPresentation('completed').orb, 'attention');
  assert.ok(clientMissionSteps('validated', false).every(step => step.done));
});

test('W4 notification grouping uses existing event types, read state, and known supersession only', () => {
  const event = (id: string, type: string, read = false, created_at = '2026-10-04T10:00:00Z') => ({ id, type, read, created_at, related_entity_id: 'request-1' } as ClientNotification);
  const items = [event('1', 'c_mission_completed'), event('2', 'c_mission_accepted'), event('3', 'other', true)];
  assert.deepEqual(clientNotificationSections(items).map(section => section.data.map(item => item.id)), [['1'], ['2'], ['3']]);
  assert.equal(clientNotificationSections([...items, event('4', 'c_mission_validated', false, '2026-10-04T11:00:00Z')])[0].title, 'Informations');
});
