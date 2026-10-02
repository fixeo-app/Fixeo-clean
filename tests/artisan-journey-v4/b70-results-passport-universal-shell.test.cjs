const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'../..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const main=read('js/main.js'),css=read('css/artisan-card-conversion-v1.css'),results=read('results.html'),engine=read('js/reservation.js'),shell=read('css/fixeo-reservation-targeted-polish-v1.css'),index=read('index.html');

function between(src,a,b){const i=src.indexOf(a),j=src.indexOf(b,i);assert.ok(i>=0&&j>i,a+' bounds');return src.slice(i,j)}

test('Results active renderer is Passport V2 truth-first',()=>{const b=between(main,'function buildOtherArtisanCard(a, opts) {','/* 7C.9L.3C: expose for estimator-origin artisan picker');for(const x of ['homepass-card','PROFIL PROFESSIONNEL FIXEO','Tarif confirmé avant intervention','Paiement après intervention','Demander une intervention','Disponibilité à confirmer','a._supabase_id || a.id'])assert.ok(b.includes(x),x);});

test('Results active renderer has no generic métier avatar or fabricated signals',()=>{const b=between(main,'function buildOtherArtisanCard(a, opts) {','/* 7C.9L.3C: expose for estimator-origin artisan picker');for(const x of ['FixeoHeroes','Disponible maintenant','Réponse rapide','23 réservations','À partir de','trustScore','Nouveau sur FIXEO'])assert.equal(b.includes(x),false,x);});

test('Results avatar contract is real photo then deterministic FIXEO ID',()=>{const b=between(main,'function _homepagePassportAvatar','function _homepagePassportDescription');assert.match(b,/a\.photo_url \|\| a\.avatar \|\| a\.photo/);assert.match(b,/_homepagePassportFixeoId/);assert.doesNotMatch(b,/FixeoHeroes|getAvatar|getCardAvatar/);assert.match(css,/HOMEPAGE \/ RESULTS PASSPORT V2/);assert.match(css,/\.homepass-fixeo-id/);});

test('Results booking resolves canonical Supabase UUID to full artisan object',()=>{const i=main.indexOf('function openHomepageArtisanBooking'),b=main.slice(i,i+3800);assert.ok(i>=0);assert.match(b,/artisan\._supabase_id/);assert.match(b,/FixeoReservation\.open\(artisanObj, false\)/);});

test('Results page loads fresh Passport renderer and full targeted booking stack',()=>{for(const x of ['js/main.js?v=homepass-v2','artisan-card-conversion-v1.css?v=homepass-v2','js/reservation.js?v=av1-card3','js/reservation-v2.js?v=v2c6f-c','js/fixeo-reservation-v3.js?v=fxrv3-v1a','js/fixeo-reservation-supabase-bridge.js?v=v2','js/fixeo-reservation-flagship-v1.js?v=fxresf-v11c','css/fixeo-reservation-targeted-polish-v1.css?v=fxrt-v5'])assert.ok(results.includes(x),x);});

test('Targeted shell hides the real universal global header in CSS and bootstrap',()=>{for(const x of ['.fixeo-gh-universal-shell','.fixeo-gh-source-shell','#fixeo-gh-menu-portal'])assert.ok(shell.includes(x),x);for(const x of ['fixeo-gh-universal-shell','fixeo-gh-source-shell','fixeo-gh-menu-portal'])assert.ok(engine.includes(x),x);assert.match(engine,/fixeo-reservation-targeted-polish-v1\.css\?v=fxrt-v5/);});

test('Homepage certified Passport from B69 remains mounted and only shared shell version changed',()=>{assert.match(index,/fixeo_homepage_premium_patch\.js\?v=fxhome-passport-v2a/);assert.match(index,/js\/reservation\.js\?v=av1-card3/);assert.match(index,/fixeo-reservation-targeted-polish-v1\.css\?v=fxrt-v5/);assert.doesNotMatch(index,/fixeo-reservation-v4\.(?:js|css)/);});
