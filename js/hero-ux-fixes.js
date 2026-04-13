/**
 * hero-ux-fixes.js
 * 1. Replace 🌆 emoji city icon with premium SVG pin (Lucide MapPin)
 * 2. Mobile bottom sheet for city picker
 *    - Works on both #qsm-select-city (hero bar) and #ssb2-select-city (secondary)
 *    - Delegates change events to native selects — zero logic changes
 */
(function (window, document) {
  'use strict';

  var MOBILE_BP = 768;

  /* ── SVG pin icon (Lucide MapPin) ── */
  var PIN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';

  /* Config: which segments to upgrade */
  var SEGS = [
    { segClass: 'qsm-segment-city',  selectId: 'qsm-select-city',  iconClass: 'qsm-city-icon-svg',  triggerClass: 'qsm-city-trigger'  },
    { segClass: 'ssb2-segment-city', selectId: 'ssb2-select-city', iconClass: 'ssb2-city-icon-svg', triggerClass: 'ssb2-city-trigger', segId: 'ssb2-seg-city' }
  ];

  function _esc(str) {
    return String(str||'').replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function _isMobile() { return window.innerWidth <= MOBILE_BP; }

  /* ── Get trigger label from select ── */
  function _label(select) {
    var opt = select.options[select.selectedIndex];
    if (!opt) return 'Choisir une ville';
    var t = (opt.textContent || opt.text || '').trim().replace(/^📍\s*/,'');
    return (!t || t === 'Choisir une ville' || t === 'Toutes les villes') ? 'Choisir une ville' : t;
  }

  /* ── Get options from select ── */
  function _getOpts(select) {
    return Array.from(select.options).map(function(o){
      return { value: o.value, label: (o.textContent||o.text||'').trim().replace(/^📍\s*/,'') };
    });
  }

  /* ── Upgrade a single segment ── */
  function _upgradeSeg(cfg) {
    var seg = cfg.segId ? document.getElementById(cfg.segId) : document.querySelector('.'+cfg.segClass);
    var select = document.getElementById(cfg.selectId);
    if (!seg || !select || seg.dataset.huxDone) return;
    seg.dataset.huxDone = '1';

    /* 1. Replace emoji icon with SVG */
    var emojiIcon = seg.querySelector('.qsm-seg-icon, .ssb2-seg-icon');
    if (emojiIcon) {
      var svgEl = document.createElement('span');
      svgEl.className = cfg.iconClass;
      svgEl.style.cssText = 'display:flex;align-items:center;flex-shrink:0;';
      svgEl.innerHTML = PIN_SVG;
      emojiIcon.style.display = 'none';
      emojiIcon.parentNode.insertBefore(svgEl, emojiIcon);
    }

    /* 2. Inject trigger (mobile only) */
    if (!seg.querySelector('.'+cfg.triggerClass)) {
      var trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = cfg.triggerClass;
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-label', 'Choisir une ville');
      trigger.textContent = _label(select);
      /* Insert in seg-body before the select */
      var body = seg.querySelector('.qsm-seg-body, .ssb2-seg-body');
      if (body) body.insertBefore(trigger, select);
      else seg.insertBefore(trigger, select);

      trigger.addEventListener('click', function(e) {
        e.stopPropagation();
        if (_isMobile()) _openSheet(select, trigger);
      });
      select.addEventListener('change', function() {
        trigger.textContent = _label(select);
      });
    }
  }

  /* ── Try upgrade all segments ── */
  function _upgradeAll() {
    SEGS.forEach(_upgradeSeg);
  }

  /* ════════════════════════════════════════════
     BOTTOM SHEET
  ════════════════════════════════════════════ */
  var _open   = false;
  var _backdrop = null;
  var _sheet    = null;
  var _curSelect  = null;
  var _curTrigger = null;

  function _buildSheet() {
    if (_backdrop) return;

    _backdrop = document.createElement('div');
    _backdrop.className = 'ssb2-city-sheet-backdrop';
    _backdrop.setAttribute('aria-hidden','true');
    _backdrop.addEventListener('click', _closeSheet);

    _sheet = document.createElement('div');
    _sheet.className = 'ssb2-city-sheet';
    _sheet.setAttribute('role','dialog');
    _sheet.setAttribute('aria-modal','true');
    _sheet.setAttribute('aria-label','Choisir une ville');
    _sheet.innerHTML =
      '<div class="ssb2-city-sheet-handle" aria-hidden="true"></div>'+
      '<div class="ssb2-city-sheet-header">'+
        '<span class="ssb2-city-sheet-title">'+
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E1306C" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>'+
          'Choisir une ville'+
        '</span>'+
        '<button class="ssb2-city-sheet-close" type="button" aria-label="Fermer">&#10005;</button>'+
      '</div>'+
      '<div class="ssb2-city-sheet-list" role="listbox"></div>';

    document.body.appendChild(_backdrop);
    document.body.appendChild(_sheet);
    _sheet.querySelector('.ssb2-city-sheet-close').addEventListener('click', _closeSheet);

    /* Swipe down to close */
    var _ty = 0;
    _sheet.addEventListener('touchstart', function(e){ _ty = e.touches[0].clientY; }, {passive:true});
    _sheet.addEventListener('touchmove',  function(e){ if(e.touches[0].clientY - _ty > 72) _closeSheet(); }, {passive:true});
  }

  function _openSheet(select, trigger) {
    _buildSheet();
    _curSelect  = select;
    _curTrigger = trigger;

    /* Populate options */
    var list = _sheet.querySelector('.ssb2-city-sheet-list');
    var opts = _getOpts(select);
    var cur  = select.value;
    list.innerHTML = opts.map(function(o){
      var icon = o.value ? '📍' : '🌍';
      return '<button class="ssb2-city-sheet-option'+(o.value===cur?' is-selected':'')+'"'+
        ' type="button" role="option" data-value="'+_esc(o.value)+'"'+
        ' aria-selected="'+(o.value===cur)+'">'+
        '<span class="ssb2-city-option-icon">'+icon+'</span>'+
        _esc(o.label)+
      '</button>';
    }).join('');

    /* New click listener each open */
    list.onclick = function(e){
      var btn = e.target.closest('.ssb2-city-sheet-option');
      if (!btn) return;
      _curSelect.value = btn.dataset.value;
      _curSelect.dispatchEvent(new Event('change', {bubbles:true}));
      if (_curTrigger) _curTrigger.textContent = _label(_curSelect);
      _closeSheet();
    };

    requestAnimationFrame(function(){
      _backdrop.classList.add('is-open');
      _sheet.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      _open = true;
    });
  }

  function _closeSheet() {
    if (!_open || !_sheet) return;
    _backdrop.classList.remove('is-open');
    _sheet.classList.remove('is-open');
    document.body.style.overflow = '';
    _open = false;
  }

  document.addEventListener('keydown', function(e){
    if (e.key==='Escape' && _open) _closeSheet();
  });

  /* ── Init ── */
  function init() {
    _upgradeAll();
    /* Watch for dynamic render of QSM bar */
    if (window.MutationObserver) {
      var obs = new MutationObserver(function(){
        var needsUpgrade = SEGS.some(function(cfg){
          var seg = cfg.segId ? document.getElementById(cfg.segId) : document.querySelector('.'+cfg.segClass);
          return seg && !seg.dataset.huxDone;
        });
        if (needsUpgrade) _upgradeAll();
      });
      obs.observe(document.body, {childList:true, subtree:true});
    }
  }

  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window, document);
