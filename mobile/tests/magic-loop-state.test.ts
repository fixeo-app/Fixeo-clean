import assert from 'node:assert/strict';
import test from 'node:test';
import { transition } from '../lib/magicLoopState';

test('Magic Loop retains canonical request id across matching to found', () => {
  const matching=transition({state:'creating'},'matching',{requestId:'request-1'});
  const found=transition(matching,'found',{message:'Artisan trouvé'});
  assert.equal(found.requestId,'request-1');
  assert.equal(found.state,'found');
});
