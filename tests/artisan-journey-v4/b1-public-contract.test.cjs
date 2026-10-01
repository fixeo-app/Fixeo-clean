const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261001204000_artisan_public_contract_v4.sql'),'utf8');

test('B1: public contract is security-definer with explicit grants',()=>{
  assert.match(sql,/SECURITY DEFINER/);
  assert.match(sql,/SET search_path = public, pg_temp/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.artisan_public_profile_v4\(uuid\) FROM PUBLIC/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.artisan_public_profile_v4\(uuid\) TO anon, authenticated, service_role/);
});

test('B1: truth doctrine separates claimed, onboarded and verified',()=>{
  assert.match(sql,/WHEN a\.verified IS TRUE OR a\.is_verified IS TRUE THEN 'verified'/);
  assert.match(sql,/WHEN a\.onboarding_completed IS TRUE AND a\.claimed IS TRUE/);
  assert.match(sql,/WHEN a\.claimed IS TRUE AND a\.owner_user_id IS NOT NULL THEN 'claimed'/);
  assert.match(sql,/'is_verified',b\.public_status='verified'/);
});

test('B1: legacy availability never becomes public live availability',()=>{
  assert.match(sql,/'status','confirmation_required'/);
  assert.match(sql,/'operational_capacity_proven',false/);
  assert.match(sql,/'legacy_declared_status'/);
  assert.doesNotMatch(sql,/'status',\s*b\.availability/);
});

test('B1: pricing is deliberately outside public profile contract',()=>{
  assert.match(sql,/'pricing','not_in_contract'/);
  assert.doesNotMatch(sql,/price_from/);
  assert.doesNotMatch(sql,/starting_price/);
  assert.doesNotMatch(sql,/MAR_PRICES|SERVICE_PRICING|150.?600/);
});

test('B1: public JSON never emits phone, owner UUID or Supply internals',()=>{
  const jsonSection=sql.slice(sql.indexOf("SELECT jsonb_build_object("));
  assert.doesNotMatch(jsonSection,/'phone'/);
  assert.doesNotMatch(jsonSection,/'phone_public'/);
  assert.doesNotMatch(jsonSection,/'owner_user_id'/);
  assert.doesNotMatch(jsonSection,/'priority_score'/);
  assert.doesNotMatch(jsonSection,/'source_evidence'/);
  assert.doesNotMatch(jsonSection,/'outreach_status'/);
});

test('B1: reviews are verified-only and empty evidence remains empty',()=>{
  assert.match(sql,/count\(\*\) FILTER \(WHERE r\.verified IS TRUE\)/);
  assert.match(sql,/avg\(r\.rating\) FILTER \(WHERE r\.verified IS TRUE\)/);
  assert.match(sql,/'verified_review_count',coalesce\(b\.verified_review_count,0\)/);
});

test('B1: portfolio and multi-service/city sources are normalized',()=>{
  assert.match(sql,/pi\.artisan_id=p_artisan_id::text/);
  assert.match(sql,/artisan_service_categories/);
  assert.match(sql,/artisan_service_cities/);
  assert.match(sql,/'additional',b\.extra_categories/);
  assert.match(sql,/'additional_cities',b\.extra_cities/);
});
