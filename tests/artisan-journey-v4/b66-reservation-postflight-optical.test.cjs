const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'../..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('artisan-profile.html'),engine=read('js/reservation.js'),shell=read('css/fixeo-reservation-targeted-polish-v1.css'),resFlag=read('js/fixeo-reservation-flagship-v1.js'),conf=read('confirmation.html'),confFlag=read('js/fixeo-confirmation-flagship-v1.js');

test('postflight: targeted CTAs no longer use sticky overlay positioning',()=>{const s1i=shell.lastIndexOf('#res-step1-cta[data-res-targeted-cta="1"]{'),s1=shell.slice(s1i,shell.indexOf('}',s1i)+1);const a1i=shell.lastIndexOf('body.fixeo-targeted-booking-open .fxrt-actions{'),a1=shell.slice(a1i,shell.indexOf('}',a1i)+1);assert.ok(s1i>=0&&a1i>=0);assert.match(s1,/position:relative!important/);assert.doesNotMatch(s1,/position:sticky/);assert.match(a1,/position:relative!important/);assert.doesNotMatch(a1,/position:sticky/);});

test('postflight: targeted reservation header sources identity from canonical V4 profile',()=>{assert.match(resFlag,/window\.__fixeoProfileV4/);assert.match(resFlag,/pi\.photo_url \|\| ''/);assert.match(resFlag,/document\.body\.classList\.contains\('fixeo-targeted-booking-open'\)\) return null/);assert.match(resFlag,/fxresf-hav-fixeo-id/);});

test('postflight: targeted fallback never uses FixeoHeroes artwork as artisan identity',()=>{const a=resFlag.indexOf('function _resolveAvatar'),b=resFlag.indexOf('function _getCategoryEmoji',a),block=resFlag.slice(a,b);const guard=block.indexOf("if (document.body.classList.contains('fixeo-targeted-booking-open')) return null");const heroes=block.indexOf('window.FixeoHeroes');assert.ok(guard>=0&&heroes>guard);});

test('postflight: targeted recap header uses FIXEO mark and truthful availability',()=>{assert.match(engine,/fxrt-header-mark">F</);assert.match(engine,/state\.isTargeted\s*\?\s*'◷ Disponibilité à confirmer'/);});

test('postflight: confirmation uses the existing production logo asset',()=>{assert.match(confFlag,/\/img\/logo\.png/);assert.doesNotMatch(confFlag,/\/img\/fixeo-logo\.webp/);});

test('postflight: Safari/document cache keys are fresh',()=>{assert.match(html,/PROFILE_PAGE_VERSION='20261002ux4'/);assert.match(html,/js\/reservation\.js\?v=av1-targeted6/);assert.match(html,/fixeo-reservation-targeted-polish-v1\.css\?v=fxrt-v3/);assert.match(html,/fixeo-reservation-flagship-v1\.js\?v=fxresf-v11c/);assert.match(conf,/fixeo-confirmation-flagship-v1\.js\?v=fxcf-v3/);assert.match(engine,/confirmation\.html\?v=targeted4/);});
