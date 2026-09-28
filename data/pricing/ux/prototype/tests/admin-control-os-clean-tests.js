'use strict';
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'../../..');
const H=fs.readFileSync(path.join(root,'admin-control-os.html'),'utf8');
const J=fs.readFileSync(path.join(root,'js/admin-control-os-clean.js'),'utf8');
const C=fs.readFileSync(path.join(root,'css/admin-control-os-clean.css'),'utf8');
let n=0,fail=0;function t(name,v){n++;if(!v){fail++;console.error('FAIL',name)}else console.log('PASS',name)}
t('clean page excludes legacy admin CSS',!H.includes('css/admin.css')&&!H.includes('admin-command-center'));
t('legacy AI excluded',!H.includes('admin-command-center-v4')&&!H.includes('suggestions-fixeo'));
t('canonical auth guard',H.includes('fixeo-auth-guard.js?v=guard-v15'));
t('canonical repository authority',H.includes('fixeo-repository.js'));
['overview','operations','reservations','network','finance','trust','intelligence','rafi','governance'].forEach(x=>t('section '+x,H.includes('sec-'+x)));
t('bounded timeout',J.includes('withTimeout')&&J.includes('12000'));
t('visibility-aware refresh',J.includes("document.visibilityState==='visible'"));
t('dispatch server API',J.includes('/api/admin/requests/assign'));
t('artisan verification server API',J.includes('/api/admin/artisans/verify'));
t('claim RPC repository',J.includes('approveClaimRequest')&&J.includes('rejectClaimRequest'));
t('no service role browser',!J.includes('SERVICE_ROLE'));
t('no direct browser insert/update/delete',!J.includes('.insert(')&&!J.includes('.update(')&&!J.includes('.delete('));
t('supply demand intelligence',J.includes("Demandes '+d+' · Artisans"));
t('RAFI next action',J.includes('rafi-next'));
t('responsive breakpoint',C.includes('@media(max-width:900px)'));
try{new Function(J);t('controller parses',true)}catch(e){t('controller parses',false)}
console.log('TOTAL',n,'PASS',n-fail,'FAIL',fail);if(fail)process.exit(1);
