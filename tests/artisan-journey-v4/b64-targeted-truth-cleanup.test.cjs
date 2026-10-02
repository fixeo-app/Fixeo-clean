const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'../..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('artisan-profile.html'),engine=read('js/reservation.js'),rv2=read('js/reservation-v2.js'),conf=read('confirmation.html'),profile=read('js/fixeo-artisan-profile-v4.js');
const a=engine.indexOf('function renderTargetedStep2()'),b=engine.indexOf('function renderStep2()',a);const targeted=engine.slice(a,b);

test('targeted mode suppresses legacy V2 estimation card',()=>{assert.match(rv2,/Targeted artisan mode owns truth/);assert.match(rv2,/\[data-res-targeted-category\]/);assert.match(rv2,/tarifEl\.style\.display = 'none'/);});

test('targeted recap contains no local amount, 5 percent fee or payment selector',()=>{assert.match(targeted,/Confirmé avant intervention/);assert.match(targeted,/Aucun montant n’est inventé par FIXEO/);assert.match(targeted,/Confirmer ma demande/);assert.doesNotMatch(targeted,/Frais de service|5%|Total à payer|MAD|fixeo-payment-method-selector|Cash on Delivery|CMI/);});

test('targeted confirmation uses canonical request gate directly',()=>{assert.match(engine,/function _confirmTargetedRequest/);assert.match(engine,/_source\s*:\s*'reservation_targeted'/);assert.match(engine,/_canonicalPersistGate\(/);assert.match(engine,/confirmation\.html\?v=targeted1/);assert.doesNotMatch(engine.slice(engine.indexOf('function _confirmTargetedRequest'),engine.indexOf('function _proceedToPayment')),/processCOD|FixeoCOD/);});

test('canonical gate exposes ACK body and local source reflects actual path',()=>{assert.match(engine,/bookingData\._source \|\| 'reservation_cod'/);assert.match(engine,/raw\[i\]\.source\s*=\s*_requestSource/);assert.match(engine,/onConfirmed\(body\)/);});

test('confirmation hides amount when targeted request has no authoritative total',()=>{assert.match(conf,/order\.source === 'reservation_targeted' && !order\.total/);assert.match(conf,/totalRow\.style\.display = 'none'/);assert.match(conf,/tarif sera confirmé avant l\\'intervention/);});

test('generic and estimator legacy pricing branches remain isolated and available',()=>{const generic=engine.slice(engine.indexOf('function renderStep2()'));assert.match(generic,/Frais de service \(5%\)/);assert.match(generic,/fixeo-payment-method-selector/);assert.match(generic,/_useEstimator/);});

test('profile remains stable and Reservation V4 stays dormant',()=>{assert.match(profile,/FixeoReservation\.open\(artisan\(p\),false\)/);assert.doesNotMatch(html,/fixeo-reservation-v4\.(?:js|css)/);});

test('targeted truth cleanup assets and Safari document version are fresh',()=>{assert.match(html,/js\/reservation\.js\?v=av1-targeted2/);assert.match(html,/js\/reservation-v2\.js\?v=v2c6f-c/);assert.match(html,/PROFILE_PAGE_VERSION='20261002truth1'/);});
