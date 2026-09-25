/* FIXEO Enterprise J3-v2 — view router. Presentation only; no observers/data/auth coupling. */
(function(){'use strict';
function mount(){var d=document,nav=d.getElementById('fxew-cockpit-nav'),toggle=d.getElementById('fxew-nav-toggle'),back=d.getElementById('fxew-nav-backdrop'),root=d.getElementById('enterprise-workspace');if(!nav||!toggle||!root)return;
var aliases={'enterprise-sites':'.fxew-sites','enterprise-team':'.fxew-team','enterprise-workforce-module':'#enterprise-workforce-module,#enterprise-my-workforce-module'};
var ids=['enterprise-control-tower','enterprise-sites','enterprise-workforce-module','enterprise-preventive-maintenance','enterprise-governance-module','enterprise-finance-module','enterprise-reporting','enterprise-team','enterprise-rafi-module'];
function close(){d.body.classList.remove('fxew-nav-open');toggle.setAttribute('aria-expanded','false');if(back)back.hidden=true}
function open(){d.body.classList.add('fxew-nav-open');toggle.setAttribute('aria-expanded','true');if(back)back.hidden=false}
toggle.addEventListener('click',function(){d.body.classList.contains('fxew-nav-open')?close():open()});if(back)back.addEventListener('click',close);
function target(id){return d.getElementById(id)||(aliases[id]?d.querySelector(aliases[id]):null)}
function route(id){if(id==='enterprise-workspace'){root.removeAttribute('data-j3-view')}else if(ids.indexOf(id)>-1&&target(id)){root.setAttribute('data-j3-view',id)}else return;nav.querySelectorAll('.fxew-nav-item').forEach(function(n){n.classList.toggle('is-active',n.dataset.cockpitTarget===id)});root.scrollIntoView({behavior:'auto',block:'start'});close()}
function go(b){if(b)route(b.dataset.cockpitTarget)}
nav.addEventListener('click',function(e){go(e.target.closest('[data-cockpit-target]'))});d.addEventListener('click',function(e){var b=e.target.closest('.fxew-j2v2-home [data-cockpit-target],.fxew-nav-rafi[data-cockpit-target]');if(b)go(b)});
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount):mount();})();