/* FIXEO Artisan OS — shell controller v1a */
(function(w,d){'use strict';if(w.__fxaoShellV1)return;w.__fxaoShellV1=true;
function q(s){return d.querySelector(s)} function qa(s){return Array.prototype.slice.call(d.querySelectorAll(s))}
function nav(section){var b=q('.fxa-nav-link[data-section="'+section+'"]')||q('.fxa-bottom-btn[data-section="'+section+'"]');if(b){b.click();return true}return false}
function closeMenu(){var s=q('#fxav2-sidebar'),o=q('#fxav2-overlay'),h=q('#fxav2-hamburger');if(s)s.classList.remove('open');if(o)o.classList.remove('open');if(s)s.setAttribute('aria-hidden','true');if(h)h.setAttribute('aria-expanded','false')}
function groupMenu(){var navEl=q('.fxa-nav');if(!navEl||navEl.dataset.fxaoGrouped)return;navEl.dataset.fxaoGrouped='1';
var order=['rafi','dashboard','available','missions','quotes','history','profile','gallery','public-profile','performance','revenus','notifications','support'];
order.forEach(function(k){var x=q('.fxa-nav-link[data-section="'+k+'"]');if(x)navEl.appendChild(x)});
var labels={rafi:'Intelligence RAFI',dashboard:'Piloter',profile:'Développer mon activité',performance:'Analyser',notifications:'Aide & notifications'};
Object.keys(labels).forEach(function(k){var x=q('.fxa-nav-link[data-section="'+k+'"]');if(x){var g=d.createElement('div');g.className='fxao-menu-group';g.textContent=labels[k];navEl.insertBefore(g,x)}})}
function bind(){groupMenu();
var r=q('#fxao-rafi-head');if(r)r.addEventListener('click',function(){nav('rafi')});
var bell=q('#fxav2-bell');if(bell)bell.addEventListener('click',function(e){e.preventDefault();nav('notifications')});
qa('.fxa-nav-link,.fxa-bottom-btn').forEach(function(b){b.addEventListener('click',function(){if(innerWidth<768)closeMenu()})});
var o=q('#fxav2-overlay');if(o)o.addEventListener('click',closeMenu);
d.addEventListener('keydown',function(e){if(e.key==='Escape')closeMenu()});
var quotes=q('.fxa-nav-link[data-section="quotes"]');if(quotes)quotes.setAttribute('aria-label','Mes devis — ouvrir le centre de devis');
}
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',bind);else bind();
})(window,document);