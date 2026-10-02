const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'../..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('artisan-profile.html'),engine=read('js/reservation.js'),shell=read('css/fixeo-reservation-targeted-polish-v1.css'),conf=read('confirmation.html'),coord=read('js/fixeo-coordination-v1i.js'),confCss=read('css/fixeo-confirmation-targeted-v2.css');

test('A recap uses artisan initials instead of a generic F card',()=>{assert.match(engine,/artisanInitials/);assert.match(engine,/fxrt-recap-artisan-id/);assert.match(engine,/\$\{sanitize\(artisanInitials\)\}/);assert.match(shell,/\.fxrt-recap-artisan-id/);});

test('A recap composes date and slot on distinct visual lines',()=>{assert.match(engine,/fxrt-when-date/);assert.match(engine,/fxrt-when-slot/);assert.match(shell,/\.fxrt-recap-when strong/);assert.match(shell,/\.fxrt-when-slot/);});

test('A confirm CTA is explicitly graphite with FIXEO gradient border',()=>{assert.match(shell,/#fixeo-reservation-modal \.fxrt-actions \.fixeo-res-btn-primary\[data-res-targeted-confirm\]/);assert.match(shell,/linear-gradient\(135deg,#17181e,#0f1015\) padding-box/);assert.match(shell,/rgba\(237,61,145,.74\)/);});

test('B targeted confirmation removes duplicated artisan métier and client rows',()=>{assert.match(conf,/var isTargeted = order\.source === 'reservation_targeted'/);assert.match(conf,/if \(isTargeted\) \{/);assert.doesNotMatch(conf.slice(conf.indexOf('if (isTargeted) {'),conf.indexOf('} else {',conf.indexOf('if (isTargeted) {'))),/order\.artisan|order\.service|order\.client|order\.orderID/);});

test('B targeted confirmation has compact four-item request grid',()=>{const block=conf.slice(conf.indexOf('if (isTargeted) {'),conf.indexOf('} else {',conf.indexOf('if (isTargeted) {')));for(const x of ['order.date','order.timeSlot','order.address','order.phone'])assert.ok(block.includes(x),x);assert.match(conf,/conf-info-grid--targeted/);assert.match(confCss,/\.conf-info-grid--targeted/);});

test('B WhatsApp action is promoted directly below artisan identity',()=>{assert.match(coord,/fxci-wa-promoted/);assert.match(coord,/idCardEl\.insertAdjacentElement\('afterend', waSection\)/);assert.match(confCss,/\.fxci-wa-promoted/);});

test('B targeted coordination removes the three redundant coordination cards',()=>{assert.match(coord,/var coordHtml = isTargeted \? '' :/);assert.match(coord,/fxci-next-step--targeted/);assert.match(coord,/Cr\\u00e9neau demand\\u00e9/);});

test('B targeted tariff notice is compact and truthful',()=>{assert.match(conf,/Tarif confirmé avant intervention/);assert.match(conf,/Aucun paiement maintenant/);assert.doesNotMatch(conf.slice(conf.indexOf("if (order.source === 'reservation_targeted'"),conf.indexOf('/* ── Référence commande',conf.indexOf("if (order.source === 'reservation_targeted'"))),/montant en espèces|payer à la livraison/i);});

test('final freeze cache keys are fresh',()=>{assert.match(html,/PROFILE_PAGE_VERSION='20261002ux3'/);assert.match(html,/js\/reservation\.js\?v=av1-targeted5/);assert.match(html,/fixeo-reservation-targeted-polish-v1\.css\?v=fxrt-v3/);assert.match(engine,/confirmation\.html\?v=targeted4/);assert.match(conf,/fixeo-coordination-v1i\.js\?v=v1i3/);assert.match(conf,/fixeo-confirmation-targeted-v2\.css\?v=fxc2-v2/);});
