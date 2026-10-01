import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDispatchOffers } from '../lib/dispatchContract';

test('dispatch feed accepts only canonical active queue offers', () => {
  const offers=normalizeDispatchOffers({ok:true,offers:[
    {request_id:'a',queue_status:'QUEUED'},
    {request_id:'b',queue_status:'CONTACTED'},
    {request_id:'c',queue_status:'CANCELLED'},
    {queue_status:'QUEUED'}
  ]});
  assert.deepEqual(offers.map(x=>x.request_id),['a','b']);
});

test('dispatch feed fails closed on malformed RPC payload', () => {
  assert.deepEqual(normalizeDispatchOffers(null),[]);
  assert.deepEqual(normalizeDispatchOffers({ok:false,offers:[]}),[]);
  assert.deepEqual(normalizeDispatchOffers({ok:true,offers:{}}),[]);
});
