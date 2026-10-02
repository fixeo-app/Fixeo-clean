const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'../..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const index=read('index.html'),patch=read('js/fixeo_homepage_premium_patch.js'),css=read('css/fixeo-homepage-passport-v2.css'),engine=read('js/reservation.js'),resFlag=read('js/fixeo-reservation-flagship-v1.js');

test('Homepage Premium is explicitly mounted with Supabase pipeline',()=>{for(const x of ['fixeo-supabase-loader.js?v=sl2','fixeo-matching-engine.js?v=me1','fixeo_homepage_premium_patch.js?v=fxhome-passport-v2a'])assert.ok(index.includes(x),x);const l=index.indexOf('fixeo-supabase-loader.js?v=sl2'),m=index.indexOf('fixeo-matching-engine.js?v=me1'),p=index.indexOf('fixeo_homepage_premium_patch.js?v=fxhome-passport-v2a');assert.ok(l<m&&m<p);});

test('Homepage uses same certified targeted reservation stack as artisan directory',()=>{for(const x of ['js/reservation.js?v=av1-card2','js/reservation-v2.js?v=v2c6f-c','js/fixeo-reservation-v3.js?v=fxrv3-v1a','js/fixeo-reservation-flagship-v1.js?v=fxresf-v11c','js/fixeo-reservation-supabase-bridge.js?v=v2','css/fixeo-reservation-targeted-polish-v1.css?v=fxrt-v4'])assert.ok(index.includes(x),x);});

test('Homepage normal card renderer is Passport V2 with real photo then FIXEO ID only',()=>{const a=patch.indexOf('function _buildCard(a, idx)'),b=patch.indexOf('/* esc helper for v2 */',a),block=patch.slice(a,b);assert.ok(a>=0&&b>a);assert.match(block,/fxhome-passport-card/);assert.match(block,/_buildPassportAvatar/);assert.match(block,/PROFIL PROFESSIONNEL FIXEO/);assert.doesNotMatch(block,/FixeoHeroes|getCardAvatar|illustrative-metier|pvc-avatar-badge|pvc-avatar-silhouette/);assert.match(css,/\.fxhome-passport-card \.pvc-fixeo-id/);});

test('Homepage card truth contract has no legacy starting price',()=>{const a=patch.indexOf('function _buildCard(a, idx)'),b=patch.indexOf('/* esc helper for v2 */',a),block=patch.slice(a,b);assert.match(block,/Tarif confirmé avant intervention|_getPricing/);assert.match(patch,/main: 'Tarif confirmé avant intervention'/);assert.match(patch,/hint: 'Paiement après intervention'/);assert.doesNotMatch(block,/À partir de|Budget indicatif|Tarif renseigné/);});

test('Homepage CTA and profile continuity match Passport product',()=>{const a=patch.indexOf('function _buildCard(a, idx)'),b=patch.indexOf('/* esc helper for v2 */',a),block=patch.slice(a,b);assert.match(block,/Demander une intervention →/);assert.match(block,/Voir le profil complet/);assert.match(block,/a\._supabase_id \|\| a\.id/);assert.match(block,/20261002cards2/);});

test('Homepage reservation entry passes exact card artisan object to canonical API',()=>{assert.match(patch,/function _doReserve\(a\)/);assert.match(patch,/FixeoReservation\.open\(a, false\)/);assert.match(patch,/JSON\.stringify\(a\)/);assert.match(engine,/_fixeoCurrentReservationArtisan = state\.artisan/);assert.match(resFlag,/window\._fixeoCurrentReservationArtisan/);});

test('Homepage card copy suppresses internal sourcing notes',()=>{assert.match(patch,/sourc\[ée\].*facebook/);});

test('Targeted shell and iOS close owner remain canonical',()=>{assert.match(engine,/function _ensureTargetedShellAssets/);assert.match(engine,/_fxResCloseCaptureBound/);const i=engine.indexOf('P0 close owner: dedicated capture listener');assert.ok(i>=0);const block=engine.slice(i,i+1600);assert.match(block,/stopImmediatePropagation/);assert.match(block,/close\(\)/);assert.match(block,/\}, true\);/);});

test('Homepage keeps Reservation V4 dormant',()=>{assert.doesNotMatch(index,/fixeo-reservation-v4\.(?:js|css)/);});
