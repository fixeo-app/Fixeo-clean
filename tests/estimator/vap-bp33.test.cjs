const { test } = require('node:test');
const assert = require('node:assert/strict');
const { VERSION, commissionMinor, buildBreakdown } = require('../../data/pricing/engine/vap-bp33-v1');
const quote = (vapMinor, materialsMinor = 0) => buildBreakdown({ pricingVersion: VERSION, vapMinor, materialsMinor });

test('BP 3.3 reference examples, floor and cap', () => {
  for (const [vap, fee] of [[150,60],[250,60],[400,60],[600,90],[1000,150],[2000,300],[3000,400],[5000,600],[8000,810],[10000,950],[12000,1050],[20000,1450],[21000,1500],[30000,1500]]) {
    assert.equal(commissionMinor(vap * 100), fee * 100, 'VAP=' + vap);
  }
});

test('centime continuity around floor, band changes and cap', () => {
  for (const [vap, fee] of [[39999,6000],[40000,6000],[40004,6001],[199999,30000],[200000,30000],[200005,30001],[499999,60000],[500000,60000],[500008,60001],[999999,95000],[1000000,95000],[1000010,95001],[2099999,150000],[2100000,150000],[2100001,150000]]) {
    assert.equal(commissionMinor(vap), fee, 'centimes=' + vap);
  }
});

test('materials never increase commission; total reconciles and retention is explicit', () => {
  const r = quote(200000,800000);
  assert.equal(r.commissionMinor,30000);
  assert.equal(r.clientTotalMinor,1030000);
  assert.equal(r.artisanRetentionMinor,1000000);
  assert.equal(r.clientTotalMinor-r.commissionMinor,r.artisanRetentionMinor);
  assert.equal(quote(200000).commissionMinor,r.commissionMinor);
});

test('six pilot hypotheses reconcile without activating prices', () => {
  for (const [vap,total] of [[300,360],[250,310],[1000,1150],[300,360],[350,410],[500,575]]) {
    assert.equal(quote(vap*100).clientTotalMinor,total*100);
  }
});

test('invalid money and unknown/legacy versions fail rather than being coerced', () => {
  for (const value of [0,-1,1.5,'30000',null,undefined,NaN,Infinity,50000001]) {
    assert.throws(()=>commissionMinor(value));
  }
  for (const value of [-1,0.5,'0',null,undefined,NaN,Infinity]) {
    assert.throws(()=>buildBreakdown({pricingVersion:VERSION,vapMinor:30000,materialsMinor:value}));
  }
  for (const pricingVersion of [undefined,null,'legacy','vap-bp33-v2']) {
    assert.throws(()=>buildBreakdown({pricingVersion,vapMinor:30000,materialsMinor:0}));
  }
  assert.throws(()=>buildBreakdown({pricingVersion:VERSION,vapMinor:30000}));
  assert.throws(()=>buildBreakdown({pricingVersion:VERSION,vapMinor:30000,materialsMinor:0,clientTotalMinor:1}));
  assert.throws(()=>quote(50000000));
  assert.throws(()=>quote(30000,50000000));
});

test('calculation is repeatable, immutable, and does not mutate accepted legacy data', () => {
  const legacy = Object.freeze({final_price:300,commission_amount:45,artisan_net:255});
  assert.throws(()=>buildBreakdown(legacy));
  assert.equal(legacy.artisan_net,255);
  const input={pricingVersion:VERSION,vapMinor:30000,materialsMinor:0};
  const before=JSON.stringify(input), a=buildBreakdown(input), b=buildBreakdown(input);
  assert.deepEqual(a,b); assert.equal(JSON.stringify(input),before); assert.ok(Object.isFrozen(a));
});

test('commission and total stay monotonic across a broad range', () => {
  let previousFee=0,previousTotal=0;
  for(let vap=1;vap<=3000000;vap+=137){
    const r=quote(vap,1000);
    assert.ok(r.commissionMinor>=previousFee && r.commissionMinor>=6000 && r.commissionMinor<=150000);
    assert.ok(r.clientTotalMinor>previousTotal);
    assert.equal(r.clientTotalMinor,r.vapMinor+r.commissionMinor+r.materialsMinor);
    previousFee=r.commissionMinor;previousTotal=r.clientTotalMinor;
  }
});
