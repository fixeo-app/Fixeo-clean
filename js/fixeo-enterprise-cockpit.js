/* FIXEO Enterprise J3 — domain workspace router. Presentation only. */
(function(){'use strict';
const routes={
 'enterprise-workspace':'cockpit','enterprise-control-tower':'interventions','enterprise-sites':'sites',
 'enterprise-workforce-module':'teams','enterprise-my-workforce-module':'teams',
 'enterprise-preventive-maintenance':'maintenance','enterprise-equipment-module':'maintenance',
 'enterprise-governance-module':'governance','enterprise-finance-module':'finance',
 'enterprise-reporting':'reports','enterprise-team':'admin','enterprise-audit-module':'admin',
 'enterprise-rafi-module':'rafi'
};
function target(id,d){return d.getElementById(id)||(id==='enterprise-sites'?d.querySelector('.fxew-sites'):id==='enterprise-team'?d.querySelector('.fxew-team'):id==='enterprise-workforce-module'?d.querySelector('#enterprise-workforce-module,#enterprise-my-workforce-module'):null)}
function setWorkspace(name,d,nav){document.body.dataset.workspace=name;nav.querySelectorAll('.fxew-nav-item').forEach(b=>b.classList.toggle('is-active',routes[b.dataset.cockpitTarget]===name));var title=d.getElementById('j3-workspace-title');if(title)title.textContent=name==='cockpit'?'Cockpit':({interventions:'Interventions',sites:'Sites',teams:'Équipes',maintenance:'Maintenance',governance:'Gouvernance',finance:'Finance',reports:'Rapports',admin:'Administration',rafi:'RAFI'}[name]||'Cockpit');window.scrollTo({top:0,behavior:'smooth'})}
function syncJ2(){var d=document,txt=id=>{var e=d.getElementById(id);return e?e.textContent.trim():'—'},set=(id,v)=>{var e=d.getElementById(id);if(e)e.textContent=v||'0'};set('j2-open',txt('enterprise-interventions-count'));set('j2-sites',txt('enterprise-sites-count'));set('j2-approvals',txt('enterprise-governance-pending'));set('j2-workforce',String(d.querySelectorAll('#enterprise-workforce-list .fxew-workforce-card').length));var alerts=[...d.querySelectorAll('#enterprise-control-attention .fxew-control-alert')];set('j2-attention',String(alerts.length));var feed=d.getElementById('j2-attention-feed');if(feed){feed.innerHTML='';if(!alerts.length)feed.innerHTML='<p>Aucune priorité critique détectée pour le moment.</p>';else alerts.slice(0,3).forEach(a=>{var x=d.createElement('div');x.className='fxew-command-feed-item';x.textContent=(a.querySelector('strong')||a).textContent.trim();feed.appendChild(x)})}}
function mount(){var d=document,nav=d.getElementById('fxew-cockpit-nav'),toggle=d.getElementById('fxew-nav-toggle'),back=d.getElementById('fxew-nav-backdrop');if(!nav||!toggle)return;
var badge=d.createElement('div');badge.className='fxew-workspace-bar';badge.innerHTML='<span>Espace</span><strong id="j3-workspace-title">Cockpit</strong>';d.querySelector('.fxew-main')?.prepend(badge);
function close(){d.body.classList.remove('fxew-nav-open');toggle.setAttribute('aria-expanded','false');if(back)back.hidden=true}
toggle.addEventListener('click',()=>{var o=d.body.classList.toggle('fxew-nav-open');toggle.setAttribute('aria-expanded',String(o));if(back)back.hidden=!o});if(back)back.addEventListener('click',close);
function routeButton(b){var id=b.dataset.cockpitTarget,name=routes[id]||'cockpit';if(name==='rafi'){d.body.dataset.rafiOverlay='open';var t=target(id,d);if(t)t.scrollIntoView({behavior:'smooth',block:'start'});close();return}setWorkspace(name,d,nav);close()}
nav.addEventListener('click',e=>{var b=e.target.closest('[data-cockpit-target]');if(b)routeButton(b)});
d.addEventListener('click',e=>{var b=e.target.closest('.fxew-command-center [data-cockpit-target]');if(b){e.preventDefault();routeButton(b)}});
var brief=d.getElementById('j2-rafi-briefing');if(brief)brief.addEventListener('click',()=>{var b=d.getElementById('enterprise-rafi-briefing');if(b)b.click();d.body.dataset.rafiOverlay='open';d.getElementById('enterprise-rafi-module')?.scrollIntoView({behavior:'smooth',block:'start'})});
var root=d.getElementById('enterprise-workspace');if(root&&'MutationObserver'in window)new MutationObserver(syncJ2).observe(root,{subtree:true,childList:true,characterData:true});syncJ2();setWorkspace('cockpit',d,nav)}
d.readyState==='loading'?d.addEventListener('DOMContentLoaded',mount):mount();})();