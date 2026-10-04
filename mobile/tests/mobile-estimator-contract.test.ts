import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMobileEstimatorResponse } from '../lib/mobileEstimatorContract';
import { readFileSync } from 'node:fs';
test('mobile gateway response preserves diagnostic and labour semantics without calculating or decoding', () => {
  const result = {ok:true as const, outcome:{outcome_type:'DIAGNOSTIC_READY',service_code:'electricite.diagnostic',scope_summary:[],exclusions_summary:[],next_action:null,diagnostic_price_mad:250,absorption_possible:false},pricing_context_token:'opaque'};
  assert.equal(validateMobileEstimatorResponse(result).outcome?.absorption_possible,false);
  assert.deepEqual(validateMobileEstimatorResponse(result),result);
  assert.throws(()=>validateMobileEstimatorResponse({ok:false}));
  assert.throws(()=>validateMobileEstimatorResponse({ok:true,pricing_context_token:42}));
  for(const file of ['lib/mobileEstimator.ts','lib/mobileEstimatorContract.ts','lib/mobileDiagnosticReference.ts']) {
    const source=readFileSync(file,'utf8');
    assert.doesNotMatch(source,/FIXEO_ESTIMATOR_SECRET|service_role|data\/pricing|unsealToken|sealToken|PRICE_MAP/);
  }
});
