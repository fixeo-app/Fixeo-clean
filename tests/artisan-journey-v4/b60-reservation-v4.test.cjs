const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'../..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('artisan-profile.html'),engine=read('js/reservation.js'),v4=read('js/fixeo-reservation-v4.js'),css=read('css/fixeo-reservation-v4.css'),profile=read('js/fixeo-artisan-profile-v4.js');

test('R1 canonical contract stays targeted, idempotent and price-free at create-request boundary',()=>{assert.match(engine,/fetch\('\/api\/create-request'/);assert.match(engine,/serverPayload\.target_artisan_id\s*=\s*_targetArtisanId/);assert.match(engine,/idempotency_key:\s*idemKey/);assert.match(engine,/bookingData\._source \|\| 'reservation_cod'/);assert.match(engine,/onConfirmed\(body\)/);assert.match(engine,/'demenagement','carrelage','autre'/);});

test('R2 reservation identity comes from canonical profile and never generic FixeoHeroes',()=>{for(const x of ['skills:a(s.additional)','status_label:t.label','availability_label:av.label','fixeo_id_variant:idVariant'])assert.ok(profile.includes(x),x);assert.match(v4,/photo_url \|\| a\.avatar \|\| a\.photo/);assert.match(v4,/FIXEO ID/);assert.doesNotMatch(v4,/FixeoHeroes|getCardAvatar|generated.*face|portrait.*ai/i);});

test('R3 targeted flow removes mandatory detailed service selection',()=>{assert.match(v4,/setHiddenCategory/);assert.match(v4,/categoryLabel\(state\.artisan/);assert.match(v4,/Décrivez brièvement votre besoin pour continuer/);assert.match(v4,/#res-svc-pills/);assert.match(css,/#res-svc-pills[\s\S]*display:none!important/);assert.doesNotMatch(v4,/Veuillez choisir un service/);});

test('R4 V4 has no local price authority and uses verified estimator only when present',()=>{assert.match(v4,/TARIF/);assert.match(v4,/Confirmé avant intervention/);assert.match(v4,/data-estimator-context/);assert.match(v4,/ESTIMATION FIXEO VÉRIFIÉE/);assert.doesNotMatch(v4,/SERVICE_PRICING|Frais de service \(5%\)|prix du marché|Prix recommandé/i);});

test('R5 targeted no-estimator confirmation bypasses legacy COD amount and uses canonical gate',()=>{assert.match(v4,/_canonicalPersistGate/);assert.match(v4,/reservation_targeted_v4/);assert.match(v4,/Confirmer ma demande/);assert.match(v4,/localStorage\.setItem\('lastOrder'/);assert.match(v4,/window\.location\.href = 'confirmation\.html'/);assert.match(v4,/_proceedToPayment\(amount\)/);});

test('R6 profile loads one Reservation V4 presentation layer',()=>{for(const x of ['css/fixeo-reservation-v4.css?v=fxrv4-v1','js/fixeo-reservation-v4.js?v=fxrv4-v1','js/reservation.js?v=av2'])assert.ok(html.includes(x),x);for(const x of ['reservation-v2.js','fixeo-reservation-v3.js','fixeo-reservation-flagship-v1.js','reservation-v2.css','reservation-v2a.css','fixeo-reservation-v3.css','fixeo-reservation-flagship-v1.css'])assert.equal(html.includes(x),false,x);});

test('R6 mobile sheet owns viewport and Safari keyboard offset',()=>{assert.match(css,/height:100dvh!important/);assert.match(css,/safe-area-inset-top/);assert.match(css,/safe-area-inset-bottom/);assert.match(css,/var\(--fxrv4-vv-bottom,0px\)/);assert.match(v4,/window\.visualViewport/);});

test('targeted profile handoff remains exactly canonical',()=>{assert.match(profile,/FixeoReservation\.open\(artisan\(p\),false\)/);assert.doesNotMatch(profile,/FixeoClientRequest\.open/);});
