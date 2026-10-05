import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getArtisanContextualCockpit,
  getClientContextualCockpit,
} from '../lib/contextualCockpit';

test('Client cockpit always prioritizes an active intervention over alerts', () => {
  const completed = getClientContextualCockpit({
    activeStatus: 'completed',
    unreadCount: 9,
    subject: 'Plomberie',
    city: 'Fès',
  });

  assert.equal(completed.action, 'client_follow');
  assert.equal(completed.status, 'Validation requise');
  assert.equal(completed.tone, 'dark');
  assert.equal(completed.context, 'Plomberie · Fès');

  const alerts = getClientContextualCockpit({
    activeStatus: null,
    unreadCount: 3,
  });
  assert.equal(alerts.action, 'client_alerts');
  assert.match(alerts.title, /3 alertes/);
});

test('Artisan cockpit prioritizes mission, then offers, then availability and private activity', () => {
  const mission = getArtisanContextualCockpit({
    missionStatus: 'in_progress',
    offersCount: 4,
    availability: 'available',
    jobsCount: 2,
    quotesCount: 3,
    missionSubject: 'Climatisation',
    missionCity: 'Rabat',
  });
  assert.equal(mission.action, 'artisan_mission');
  assert.equal(mission.status, 'Mission active');
  assert.equal(mission.context, 'Climatisation · Rabat');

  const offers = getArtisanContextualCockpit({
    offersCount: 2,
    availability: 'available',
    jobsCount: 2,
    quotesCount: 3,
  });
  assert.equal(offers.action, 'none');
  assert.equal(offers.status, 'À décider');

  const unavailable = getArtisanContextualCockpit({
    offersCount: 0,
    availability: 'unavailable',
    jobsCount: 2,
    quotesCount: 3,
  });
  assert.equal(unavailable.action, 'artisan_workspace');
  assert.equal(unavailable.status, 'Indisponible');

  const agenda = getArtisanContextualCockpit({
    offersCount: 0,
    availability: 'available',
    jobsCount: 2,
    quotesCount: 3,
  });
  assert.equal(agenda.action, 'artisan_agenda');
  assert.equal(agenda.status, 'Agenda à suivre');
});
