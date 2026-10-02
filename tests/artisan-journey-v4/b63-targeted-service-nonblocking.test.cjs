const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'../..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('artisan-profile.html'),engine=read('js/reservation.js'),profile=read('js/fixeo-artisan-profile-v4.js');

test('targeted artisan booking records an explicit targeted mode',()=>{assert.match(engine,/isTargeted:\s*false/);assert.match(engine,/state\.isTargeted = !!\(artisanInput && state\.artisan\)/);});

test('targeted artisan booking derives the canonical category instead of forcing a detailed service',()=>{assert.match(engine,/CATEGORY_LABELS\[_targetCat\]/);assert.match(engine,/data-res-targeted-category/);assert.match(engine,/Pas besoin de choisir dans un catalogue/);});

test('targeted artisan booking requires a short need description instead of a service choice',()=>{assert.match(engine,/data-res-targeted-need/);assert.match(engine,/Que faut-il faire \? \*/);assert.match(engine,/Décrivez brièvement votre besoin pour continuer/);assert.match(engine,/!state\.isUrgent && !state\.isTargeted && !state\.selectedService/);});

test('generic and estimator booking contracts remain available',()=>{assert.match(engine,/Service souhaité \*/);assert.match(engine,/state\._estimatorCtx && state\._estimatorCtx\.valid/);assert.match(engine,/Veuillez choisir un service/);});

test('profile targeted handoff remains canonical and no V4 presentation layer is remounted',()=>{assert.match(profile,/FixeoReservation\.open\(artisan\(p\),false\)/);assert.doesNotMatch(html,/fixeo-reservation-v4\.(?:js|css)/);});

test('targeted service fix has a fresh reservation cache key',()=>{assert.match(html,/js\/reservation\.js\?v=av1-targeted5/);});
