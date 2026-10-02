const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'../..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const artisans=read('artisans.html'),profileHtml=read('artisan-profile.html'),engine=read('js/reservation.js'),flag=read('js/fixeo-reservation-flagship-v1.js'),dir=read('js/fixeo-artisan-directory-v1.js'),dirCss=read('css/fixeo-artisan-directory-v1.css'),profile=read('js/fixeo-artisan-profile-v4.js');
const avA=dir.indexOf('function _buildAvatar'),avB=dir.indexOf('function _buildCard',avA),avatar=dir.slice(avA,avB);const cardA=dir.indexOf('function _buildCard'),cardB=dir.indexOf('AVATAR STAGED FALLBACK',cardA),card=dir.slice(cardA,cardB);

test('Block 1 directory loads the same targeted reservation shell as public profile',()=>{for(const x of ['js/reservation.js?v=av1-targeted6','js/reservation-v2.js?v=v2c6f-c','js/fixeo-reservation-v3.js?v=fxrv3-v1a','js/fixeo-reservation-flagship-v1.js?v=fxresf-v11c','js/fixeo-reservation-supabase-bridge.js?v=v2','css/fixeo-reservation-targeted-polish-v1.css?v=fxrt-v3'])assert.ok(artisans.includes(x),x);assert.match(profileHtml,/js\/reservation\.js\?v=av1-targeted6/);assert.match(profileHtml,/fixeo-reservation-flagship-v1\.js\?v=fxresf-v11c/);});

test('Block 1 every targeted entry publishes one canonical artisan context',()=>{assert.match(engine,/window\.__fixeoTargetedReservationArtisan = state\.isTargeted \? state\.artisan : null/);assert.match(engine,/window\.__fixeoTargetedReservationArtisan = null/);assert.match(flag,/window\.__fixeoTargetedReservationArtisan/);assert.match(dir,/window\.__fixeoTargetedReservationArtisan = selected/);});

test('Block 2 close button has a capture-phase delegated safety handler',()=>{assert.match(engine,/_fxResCloseListenerBound/);assert.match(engine,/closest\('\.fixeo-res-close'\)/);assert.match(engine,/stopImmediatePropagation/);assert.match(engine,/close\(\);[\s\S]*?\}, true\);/);});

test('Block 2 directory modal can own viewport above navbar',()=>{assert.match(artisans,/fixeo-reservation-targeted-polish-v1\.css\?v=fxrt-v3/);const shell=read('css/fixeo-reservation-targeted-polish-v1.css');assert.match(shell,/body\.fixeo-targeted-booking-open \.navbar/);assert.match(shell,/height:100dvh!important/);});

test('Block 3 card avatar accepts only canonical photo_url then FIXEO ID',()=>{assert.match(avatar,/typeof a\.photo_url === 'string'/);assert.doesNotMatch(avatar,/a\.avatar|FixeoHeroes|getCardAvatar|metier-webp|metier-png/);assert.match(avatar,/artdir-fixeo-id/);assert.match(avatar,/FIXEO ID/);});

test('Block 3 failed real photo falls back to FIXEO ID, never trade portrait or silhouette',()=>{const a=dir.indexOf('function _artdirAvStage'),b=dir.indexOf('Expose for inline onerror',a),stage=dir.slice(a,b);assert.match(stage,/artdir-fixeo-id/);assert.doesNotMatch(stage,/data-webp|data-png|metier-webp|metier-png|artdir-avatar-silhouette/);});

test('Block 3 artisan card uses professional passport hierarchy',()=>{for(const x of ['PASSEPORT PROFESSIONNEL','artdir-card-v2','artdir-v2-signals','Disponibilité à confirmer'])assert.ok(card.includes(x),x);assert.doesNotMatch(card,/artdir-avatar-badge|catIcon/);assert.match(dirCss,/ARTISAN CARD V2 — FIXEO PROFESSIONAL PASSPORT/);});

test('Block 4 card removes price authority and uses truthful intervention copy',()=>{assert.doesNotMatch(card,/_buildPricing|price_from|priceFrom|À partir de|MAD/);assert.match(card,/Tarif confirmé avant intervention/);assert.match(card,/Paiement après intervention/);assert.match(card,/Demander une intervention/);});

test('Block 4 card uses FIXEO signature CTA and current profile version',()=>{assert.match(card,/artdir-btn-mark/);assert.match(dirCss,/artdir-btn-reserve-v2/);assert.match(dirCss,/linear-gradient\(135deg,#17181e,#0f1015\) padding-box/);assert.equal((dir.match(/20261002ux4/g)||[]).length,3);assert.match(profileHtml,/PROFILE_PAGE_VERSION='20261002ux4'/);});

test('public profile booking handoff remains canonical and unchanged',()=>{assert.match(profile,/FixeoReservation\.open\(artisan\(p\),false\)/);});
