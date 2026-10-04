import test from 'node:test';
import assert from 'node:assert/strict';
import { estimatorConfirmation, estimatorStopped, intelligenceFailure, wantsEstimate, canonicalOption } from '../lib/clientIntelligence';
import { validateMobileEstimatorResponse, type MobileEstimatorResponse } from '../lib/mobileEstimatorContract';
import fixtures from './fixtures/estimator-canonical.json';
const context = { city: 'rabat', description: 'Une fuite sous le lavabo.' };
const session = { session_token: 'opaque-session', state: 'READY', metier: 'plomberie', service_code: null, outcome: null };

test('an explicit estimate intent is optional; ordinary requests do not select it', () => {
  assert.equal(wantsEstimate(context.description), false);
  assert.equal(wantsEstimate('Combien coûte cette intervention ?'), true);
});
test('confirmation preserves opaque server scope and never supplies a local amount or identity', () => {
  for (const outcome of [fixtures.outcomes.price, fixtures.outcomes.diagnostic, fixtures.outcomes.labour]) {
    const result = { ok: true as const, session, outcome, pricing_context_token: 'opaque-pricing' };
    const before = JSON.stringify(result);
    assert.deepEqual(estimatorConfirmation(result, context, '0612345678'), { action: 'confirm_request', pricing_context_token: 'opaque-pricing', city_slug: 'rabat',
      service_code: outcome.service_code, client_phone: '0612345678', confirmed: true });
    assert.equal(JSON.stringify(result), before);
    assert.equal(estimatorConfirmation({ ...result, pricing_context_token: null }, context, '0612345678'), null);
  }
});
test('quote bridge requires persisted diagnostic; direct unpriced quote stays distinct', () => {
  const result: MobileEstimatorResponse = { ok: true, session, outcome: fixtures.outcomes.quote };
  assert.equal(estimatorConfirmation(result, context, '0612345678'), null);
  assert.deepEqual(estimatorConfirmation(result, { ...context, diagnosticReference: 'opaque-reference' }, '0612345678'), {
    action: 'confirm_quote', session_token: 'opaque-session', client_phone: '0612345678', confirmed: true,
  });
});
test('server STOP denies confirmation even when accompanied by a pricing token', () => {
  for (const result of [
    { ok: true as const, session: { ...session, state: 'SAFETY_STOP' }, outcome: fixtures.outcomes.price, pricing_context_token: 'opaque' },
    { ok: true as const, session, outcome: fixtures.outcomes.safety, pricing_context_token: 'opaque' },
  ]) { assert.equal(estimatorStopped(result), true); assert.equal(estimatorConfirmation(result, context, '0612345678'), null); }
});
test('only recognized server outcomes permit handoff', () => {
  for (const outcome of [fixtures.outcomes.route, fixtures.outcomes.more, fixtures.outcomes.addon])
    assert.equal(estimatorConfirmation({ ok: true, session, outcome, pricing_context_token: 'opaque' }, context, '0612345678'), null);
});
test('error copy contains no server internals and separates auth, expiry, safety and recoverable failures', () => {
  for (const code of ['DIAGNOSTIC_LINK_EXPIRED', 'PRICING_CONTEXT_INVALID']) assert.equal(intelligenceFailure(new Error(code)).kind, 'expired');
  assert.equal(intelligenceFailure(new Error('AUTH_REQUIRED')).kind, 'auth');
  assert.equal(intelligenceFailure(new Error('DIAGNOSTIC_SAFETY_STOP')).kind, 'safety');
  for (const code of ['GATEWAY_UNAVAILABLE', 'Failed to fetch', 'offline', 'internal-token-secret']) {
    const error = intelligenceFailure(new Error(code)); assert.equal(error.kind, 'retry'); assert.ok(!error.message.includes(code));
  }
});
test('malformed server output fails closed, canonical quote id is accepted', () => {
  assert.throws(() => validateMobileEstimatorResponse({ ok: true, outcome: { outcome_type: 'PRICE_READY' } }));
  assert.throws(() => validateMobileEstimatorResponse({ ok: true, request_id: 'not-a-request' }));
  assert.throws(() => validateMobileEstimatorResponse({ ok: true, next_step: { type: 'QUESTION', options: {} } }));
  assert.equal(validateMobileEstimatorResponse({ ok: true, id: '00000000-0000-4000-8000-000000000001' }).id, '00000000-0000-4000-8000-000000000001');
  assert.deepEqual(canonicalOption({ value: false, label_fr: 'Non' }), { value: false, label: 'Non' });
  assert.equal(canonicalOption({ unexpected: true }), null);
});
