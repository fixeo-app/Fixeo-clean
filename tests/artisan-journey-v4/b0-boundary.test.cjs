const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');

function read(p){return fs.readFileSync(path.join(root,p),'utf8')}
function blobSha(p){
  const b=fs.readFileSync(path.join(root,p));
  const h=crypto.createHash('sha1');
  h.update(Buffer.from('blob '+b.length+'\0'));
  h.update(b);
  return h.digest('hex');
}

const protectedBlobs={
  'index.html':'309e85b46bcd0bd0d90134668cc1fb5b78317713',
  'js/fixeo-intake-v1.js':'4672fc11137fbe800643464ba181db3722bff936',
  'js/fixeo-estimator-v2.js':'8299df65ad21ceffea362f0fcc99b6cfa896ebd8',
  'js/fixeo-diagnostic-v1.js':'77a0ac452eafa91284284d609f88b413c6675258',
  'js/fixeo-estimator-reservation-bridge-v1.js':'db10f914318eb5bd1d2363889d2822989ede7953',
  'js/fixeo-hero-flagship-v1.js':'5ee8a1de71071455501d268e45268ee651b775ce',
  'js/fixeo-rafi-os-v1.js':'a7232cd48767d02454f07921b514d99ea37984e3',
  'js/fx-request-flow-v4.js':'b53a9c2ef39e90c33c1c9a2e094de284dc437b21'
};

test('B0: Homepage canonical surface is byte-identical to frozen baseline',()=>{
  for(const [p,sha] of Object.entries(protectedBlobs)) assert.equal(blobSha(p),sha,p);
});

test('B0: artisan profile retains targeted booking while V4 owns public rendering',()=>{
  const html=read('artisan-profile.html');
  const v4=read('js/fixeo-artisan-profile-v4.js');
  assert.match(v4,/id="public-artisan-action"/);
  assert.match(v4,/FixeoReservation\.open\(artisan\(p\),false\)/);
  assert.match(html,/js\/reservation\.js\?v=av1/);
  assert.match(html,/fixeo-artisan-profile-v4\.js\?v=fxp4-b21h1/);
  assert.doesNotMatch(html,/src=["'][^"']*fixeo-public-artisan-profile\.js/);
});

test('B0: canonical targeted-request persistence invariants remain present',()=>{
  const reservation=read('js/reservation.js');
  assert.match(reservation,/serverPayload\.target_artisan_id\s*=\s*_targetArtisanId/);
  assert.match(reservation,/idempotency_key:\s*idemKey/);
  assert.match(reservation,/fetch\('\/api\/create-request'/);
  assert.match(reservation,/if \(!body \|\| !body\.ok \|\| !body\.id\)/);
});

test('B0: profile route remains isolated from Homepage route',()=>{
  const home=read('index.html');
  assert.doesNotMatch(home,/artisan-journey-v4/i);
  const profile=read('artisan-profile.html');
  assert.ok(profile.length>1000);
});
