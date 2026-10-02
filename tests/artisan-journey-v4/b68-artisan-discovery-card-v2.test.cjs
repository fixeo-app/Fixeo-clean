const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'../..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const artisans=read('artisans.html');
const profileHtml=read('artisan-profile.html');
const engine=read('js/reservation.js');
const dir=read('js/fixeo-artisan-directory-v1.js');
const css=read('css/fixeo-artisan-directory-v1.css');
const shell=read('css/fixeo-reservation-targeted-polish-v1.css');
const profile=read('js/fixeo-artisan-profile-v4.js');

const cardStart=dir.indexOf('function _buildCard(a)');
const cardEnd=dir.indexOf('HEADER / CONTEXT UI',cardStart);
const card=dir.slice(cardStart,cardEnd);
const resolverStart=engine.indexOf('function getArtisanById');
const resolverEnd=engine.indexOf('function normalizeArtisan',resolverStart);
const resolver=engine.slice(resolverStart,resolverEnd);

test('Block 1 directory uses the same targeted reservation stack as public profile',()=>{for(const x of ['js/reservation.js?v=av1-cardv2','js/reservation-v2.js?v=v2c6f-c','js/fixeo-reservation-v3.js?v=fxrv3-v1a','js/fixeo-reservation-flagship-v1.js?v=fxresf-v11b','css/fixeo-reservation-targeted-polish-v1.css?v=fxrt-v4'])assert.ok(artisans.includes(x),x);assert.match(profileHtml,/js\/reservation\.js\?v=av1-cardv2/);assert.match(profileHtml,/fixeo-reservation-targeted-polish-v1\.css\?v=fxrt-v4/);});

test('Block 1 primitive public IDs resolve to a complete artisan object through every known id alias',()=>{for(const x of ['a._artisan_id_canonical','a._supabase_id','a.id','a.legacy_id','a.artisan_id','a.public_id','a.source_ids'])assert.ok(resolver.includes(x),x);});

test('Block 1 directory reserve recovers the selected object then opens the canonical targeted engine',()=>{assert.match(dir,/var ids = \[a\._supabase_id, a\._artisan_id_canonical, a\.id, a\.legacy_id, a\.artisan_id, a\.public_id\]/);assert.match(dir,/FixeoReservation\.open\(selected, false\)/);});

test('Block 2 close button is owned by a capture-phase engine handler',()=>{assert.match(engine,/_fxResCloseCaptureBound/);assert.match(engine,/closest\('#' \+ MODAL_ID \+ ' \.fixeo-res-close'\)/);assert.match(engine,/stopImmediatePropagation/);assert.match(engine,/close\(\);\n    \}, true\)/);});

test('Block 2 targeted close control remains above decorative layers and tappable',()=>{const i=shell.indexOf('body.fixeo-targeted-booking-open #fixeo-reservation-modal .fixeo-res-close{'),b=shell.indexOf('}',i),x=shell.slice(i,b+1);assert.match(x,/z-index:120!important/);assert.match(x,/pointer-events:auto!important/);assert.match(x,/touch-action:manipulation!important/);});

test('Block 3 card identity is real photo or FIXEO ID only',()=>{assert.match(dir,/function _fixeoIdHtml/);assert.match(dir,/artdir-fixeo-id/);assert.match(dir,/artdir-avatar-real/);assert.doesNotMatch(dir,/FixeoHeroes/);assert.doesNotMatch(card,/artdir-avatar-badge|metier-webp|metier-png|silhouette/);});

test('Block 3 FIXEO ID uses first and last name initials and deterministic variants',()=>{assert.match(dir,/p\[p\.length - 1\]/);assert.match(dir,/function _fixeoIdVariant/);assert.match(css,/\.artdir-fixeo-id-v0/);assert.match(css,/\.artdir-fixeo-id-v5/);});

test('Block 3 cards publish only canonical verified proof fields',()=>{assert.match(dir,/verified_review_count/);assert.match(dir,/verified_average_rating/);assert.match(dir,/completed_interventions/);assert.doesNotMatch(dir.slice(dir.indexOf('function _proofs'),dir.indexOf('function _buildCard')),/reviewCount|completed_missions|a\.rating\s*\|\|/);});

test('Block 4 cards never fabricate availability price response time or local demand',()=>{assert.match(card,/Disponibilité à confirmer/);assert.match(card,/Réputation en construction/);assert.match(card,/Confirmé avant intervention/);for(const bad of ['Disponible maintenant','Réponse rapide','23 réservations','À partir de 150','Réserver maintenant'])assert.equal(card.includes(bad),false,bad);});

test('Block 4 card CTA and profile continuity use the current FIXEO journey',()=>{assert.match(card,/Demander une intervention/);assert.match(card,/Voir le profil complet/);assert.match(card,/20261002card1/);assert.match(profileHtml,/PROFILE_PAGE_VERSION='20261002card1'/);assert.match(profile,/FixeoReservation\.open\(artisan\(p\),false\)/);});

test('Block 4 V2 CSS exposes passport hierarchy and graphite FIXEO CTA',()=>{for(const x of ['ARTISAN CARD V2 — FIXEO Professional Passport','.artdir-card.artdir-card-v2','.artdir-v2-signals','.artdir-v2-proof','.artdir-v2-tariff','.artdir-v2-reserve'])assert.ok(css.includes(x),x);assert.match(css,/linear-gradient\(135deg,#17181e,#101116\) padding-box/);});
