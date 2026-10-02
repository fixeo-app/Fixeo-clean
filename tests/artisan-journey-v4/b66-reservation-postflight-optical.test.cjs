const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'../..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('artisan-profile.html'),engine=read('js/reservation.js'),shell=read('css/fixeo-reservation-targeted-polish-v1.css'),resFlag=read('js/fixeo-reservation-flagship-v1.js'),conf=read('confirmation.html'),confFlag=read('js/fixeo-confirmation-flagship-v1.js');

test('postflight: targeted CTAs no longer use sticky overlay positioning',()=>{assert.doesNotMatch(shell,/position:sticky!important/);assert.match(shell,/#res-step1-cta\[data-res-targeted-cta="1"\]\{[\s\S]*?position:relative!important/);assert.match(shell,/body\.fixeo-targeted-booking-open \.fxrt-actions\{[\s\S]*?position:relative!important/);});

test('postflight: targeted reservation header sources identity from canonical V4 profile',()=>{assert.match(resFlag,/window\.__fixeoProfileV4/);assert.match(resFlag,/pi\.photo_url \|\| ''/);assert.match(resFlag,/document\.body\.classList\.contains\('fixeo-targeted-booking-open'\)\) return null/);assert.match(resFlag,/fxresf-hav-fixeo-id/);});

test('postflight: targeted fallback never uses FixeoHeroes artwork as artisan identity',()=>{const a=resFlag.indexOf('function _resolveAvatar'),b=resFlag.indexOf('function _getCategoryEmoji',a),block=resFlag.slice(a,b);const guard=block.indexOf("if (document.body.classList.contains('fixeo-targeted-booking-open')) return null");const heroes=block.indexOf('window.FixeoHeroes');assert.ok(guard>=0&&heroes>guard);});

test('postflight: targeted recap header uses FIXEO mark and truthful availability',()=>{assert.match(engine,/fxrt-header-mark">F</);assert.match(engine,/state\.isTargeted\s*\?\s*'◷ Disponibilité à confirmer'/);});

test('postflight: confirmation uses the existing production logo asset',()=>{assert.match(confFlag,/\/img\/logo\.png/);assert.doesNotMatch(confFlag,/\/img\/fixeo-logo\.webp/);});

test('postflight: Safari/document cache keys are fresh',()=>{assert.match(html,/PROFILE_PAGE_VERSION='20261002ux2'/);assert.match(html,/js\/reservation\.js\?v=av1-targeted4/);assert.match(html,/fixeo-reservation-targeted-polish-v1\.css\?v=fxrt-v2/);assert.match(html,/fixeo-reservation-flagship-v1\.js\?v=fxresf-v11b/);assert.match(conf,/fixeo-confirmation-flagship-v1\.js\?v=fxcf-v3/);assert.match(engine,/confirmation\.html\?v=targeted3/);});
