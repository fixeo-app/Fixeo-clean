const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'../..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html'),patch=read('js/fixeo_homepage_premium_patch.js'),css=read('css/artisan-card-conversion-v1.css'),engine=read('js/reservation.js');

function sliceBetween(src,a,b){const i=src.indexOf(a),j=src.indexOf(b,i);return i>=0&&j>i?src.slice(i,j):'';}
const builder=sliceBetween(patch,'function _buildCard(a, idx) {','/* esc helper for v2 */');
const pricing=sliceBetween(patch,'function _getPricing(a) {','function _responseTimeLabel');
const doProfile=sliceBetween(patch,'function _doProfile(a) {','/* ── Event delegation');
const estimator=sliceBetween(patch,'function _buildCardEstimator','window.FixeoHomepagePremium');

test('Homepage restores canonical marketplace pipeline before Passport renderer',()=>{const main=html.indexOf('js/main.js?v=v2c6h-pf'),matching=html.indexOf('js/fixeo-matching-engine.js?v=me1'),loader=html.indexOf('js/fixeo-supabase-loader.js?v=sl2'),premium=html.indexOf('js/fixeo_homepage_premium_patch.js?v=fxhome-passport-v2');assert.ok(main>0&&matching>main&&loader>matching&&premium>loader);});

test('Homepage loads same targeted booking stack as certified discovery flow',()=>{for(const x of ['css/reservation.css?v=fxhome-res-passport-v1','css/reservation-v2.css?v=3','css/reservation-v2a.css?v=v2c','css/fixeo-reservation-v3.css?v=fxrv3-v1a','css/fixeo-reservation-flagship-v1.css?v=fxresf-v11a','css/fixeo-reservation-targeted-polish-v1.css?v=fxrt-v4','js/reservation.js?v=av1-card2','js/reservation-v2.js?v=v2c6f-c','js/fixeo-reservation-v3.js?v=fxrv3-v1a','js/fixeo-reservation-flagship-v1.js?v=fxresf-v11c','js/fixeo-reservation-supabase-bridge.js?v=v2'])assert.ok(html.includes(x),x);});

test('Homepage Passport V2 uses canonical UUID and real-photo to FIXEO-ID identity only',()=>{assert.match(builder,/a\._supabase_id \|\| a\.id/);assert.match(builder,/a\.photo_url \|\| a\.avatar \|\| a\.photo/);assert.match(builder,/_fixeoIdHtml/);assert.match(patch,/pvc-fixeo-id/);assert.doesNotMatch(builder,/FixeoHeroes|getCardAvatar|illustrative-metier|pvc-avatar-badge|pvc-avatar-silhouette/);});

test('Homepage Passport V2 price surface is truth-only',()=>{assert.match(pricing,/Tarif confirmé avant intervention/);assert.match(pricing,/Paiement après intervention/);assert.doesNotMatch(pricing,/À partir de|Budget indicatif|MAR_PRICES|price_from|priceFrom/);});

test('Homepage Passport V2 card removes legacy recommendation and availability claims',()=>{assert.match(builder,/PROFIL PROFESSIONNEL FIXEO/);assert.match(builder,/Profil référencé sur FIXEO/);assert.match(builder,/Disponibilité à confirmer/);assert.doesNotMatch(builder,/Top artisan|Très bien noté|Recommandé|Disponible aujourd|Disponible maintenant|Vérifié Fixeo|Nouveau sur FIXEO|Réponse rapide/);});

test('Homepage Passport V2 CTA and profile continuity are canonical',()=>{assert.match(builder,/Demander une intervention/);assert.doesNotMatch(builder,/Réserver maintenant|Réserver en 1 clic/);assert.match(builder,/artisan-profile\.html\?id=/);assert.match(builder,/pv=20261002cards2/);assert.match(patch,/FixeoReservation\.open\(a, false\)/);assert.match(doProfile,/a\._supabase_id \|\| a\.id/);assert.match(doProfile,/20261002cards2/);});

test('Homepage estimator adapter remains compatible with Passport V2 card',()=>{assert.match(estimator,/a\._supabase_id \|\| a\.id/);assert.match(estimator,/pvc-card fhp-card pvc-card--passport/);assert.match(estimator,/pvc-action-v3b pvc-action--passport/);assert.match(estimator,/Choisir cet artisan/);assert.match(estimator,/source=estimator&pv=20261002cards2/);});

test('Homepage Passport CSS neutralizes legacy fixed-height and provides FIXEO ID plus graphite CTA',()=>{assert.match(css,/HOMEPAGE ARTISAN CARD PASSPORT V2/);assert.match(css,/\.pvc-card--passport\{/);assert.match(css,/height:auto!important/);assert.match(css,/max-height:none!important/);assert.match(css,/\.pvc-fixeo-id/);assert.match(css,/\.pvc-btn--passport/);assert.match(css,/linear-gradient\(135deg,#17181e,#101116\) padding-box/);});

test('Homepage cutover adds no second reservation close owner',()=>{assert.doesNotMatch(patch,/fixeo-res-close|_fxResCloseCaptureBound|stopImmediatePropagation\(\).*close/);assert.match(engine,/_fxResCloseCaptureBound/);assert.match(engine,/\.fixeo-res-close/);assert.match(engine,/addEventListener\('click',[\s\S]*?true\)/);});

test('Homepage card CSS cache key is Passport V2',()=>{assert.match(html,/artisan-card-conversion-v1\.css\?v=fxhome-artisan-card-passport-v2/);});
