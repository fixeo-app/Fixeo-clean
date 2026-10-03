import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatAgendaDateInput,
  formatAgendaTimeInput,
  parseAgendaDateTime,
} from '../lib/agendaDate';
import { isMobileUiTimeout, withMobileDeadline } from '../lib/mobileResilience';

test('Agenda inputs format naturally without technical ISO syntax', () => {
  assert.equal(formatAgendaDateInput('05102026'), '05/10/2026');
  assert.equal(formatAgendaDateInput('05-10-2026'), '05/10/2026');
  assert.equal(formatAgendaTimeInput('1430'), '14:30');
});

test('Agenda rejects impossible dates and invalid times', () => {
  assert.equal(parseAgendaDateTime('31/02/2026', '14:30'), null);
  assert.equal(parseAgendaDateTime('05/10/2026', '25:00'), null);
  assert.ok(parseAgendaDateTime('05/10/2026', '14:30'));
});

test('Mobile UI deadline resolves fast work and bounds stalled work', async () => {
  assert.equal(await withMobileDeadline(Promise.resolve('ok'), 50), 'ok');

  const started = Date.now();
  let error: unknown = null;
  try {
    await withMobileDeadline(
      new Promise(resolve => setTimeout(() => resolve('late'), 80)),
      15,
    );
  } catch (reason) {
    error = reason;
  }

  assert.equal(isMobileUiTimeout(error), true);
  assert.ok(Date.now() - started < 100);
});
