/* ============================================================
   FIXEO Reservation V4 — Targeted Intervention Flow
   Scope: artisan-profile.html only
   Presentation/orchestration layer over canonical FixeoReservation.
   No DB authority. No local pricing authority.
   ============================================================ */
(function (window, document) {
  'use strict';

  window.FIXEO_RESERVATION_V4_TARGETED = true;
  if (window._fxReservationV4Loaded) return;
  window._fxReservationV4Loaded = true;

  var state = {
    artisan: null,
    orderRef: null,
    description: '',
    address: '',
    phone: '',
    dateISO: '',
    slot: 'matin',
    slotLabel: 'Matin',
    serviceLabel: '',
    observer: null,
    bodyObserver: null,
    vvBound: false
  };

  function esc(v) {
    var d = document.createElement('div');
    d.textContent = String(v == null ? '' : v);
    return d.innerHTML;
  }

  function clean(v) { return String(v == null ? '' : v).trim(); }

  function initials(name) {
    var p = clean(name).split(/\s+/).filter(Boolean);
    if (!p.length) return 'FX';
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return ((p[0][0] || '') + (p[p.length - 1][0] || '')).toUpperCase();
  }

  function categoryLabel(a) {
    var raw = clean(a && (a.service_category || a.category || a.specialty));
    if (!raw) return 'Intervention';
    var key = raw.toLowerCase()
      .replace(/é|è|ê/g, 'e').replace(/à|â/g, 'a').replace(/ç/g, 'c');
    var map = {
      plomberie:'Plomberie', electricite:'Électricité', serrurerie:'Serrurerie',
      climatisation:'Climatisation', menuiserie:'Menuiserie', peinture:'Peinture',
      maconnerie:'Maçonnerie', 'maçonnerie':'Maçonnerie', nettoyage:'Nettoyage',
      jardinage:'Jardinage', demenagement:'Déménagement', bricolage:'Bricolage',
      carrelage:'Carrelage', toiture:'Toiture', vitrerie:'Vitrerie',
      chauffage:'Chauffage', securite:'Sécurité', energie_solaire:'Énergie solaire'
    };
    return map[key] || raw;
  }

  function statusLabel(a) {
    if (clean(a && a.status_label)) return clean(a.status_label);
    if (a && a.verified === true) return 'Profil vérifié sur FIXEO';
    if (a && a.claimed === true) return 'Profil revendiqué sur FIXEO';
    if (a && a.onboarding_completed === true) return 'Profil complété sur FIXEO';
    return 'Profil référencé sur FIXEO';
  }

  function availabilityLabel(a) {
    return clean(a && a.availability_label) || 'Disponibilité à confirmer';
  }

  function variant(a) {
    var n = Number(a && a.fixeo_id_variant);
    if (Number.isFinite(n)) return Math.abs(Math.round(n)) % 6;
    var s = clean(a && (a.id || a.name || 'FIXEO')), h = 0;
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h) % 6;
  }

  function identityVisual(a) {
    var photo = clean(a && (a.photo_url || a.avatar || a.photo));
    var name = clean(a && (a.name || a.full_name)) || 'Artisan FIXEO';
    if (photo) {
      return '<div class="fxrv4-id fxrv4-id-photo"><img src="' + esc(photo) +
        '" alt="' + esc(name) + '"></div>';
    }
    return '<div class="fxrv4-id fxrv4-id-mono fxrv4-v' + variant(a) + '">' +
      '<span class="fxrv4-id-f">F</span><strong>' + esc(initials(name)) +
      '</strong><small>FIXEO ID</small></div>';
  }

  function identityCard(a) {
    var name = clean(a && (a.name || a.full_name)) || 'Artisan FIXEO';
    var city = clean(a && a.city);
    var meta = [categoryLabel(a), city].filter(Boolean).join(' · ');
    return '<section class="fxrv4-identity" aria-label="Professionnel ciblé">' +
      identityVisual(a) +
      '<div class="fxrv4-identity-copy">' +
        '<span class="fxrv4-eyebrow">INTERVENTION CIBLÉE</span>' +
        '<h1>' + esc(name) + '</h1>' +
        '<p>' + esc(meta) + '</p>' +
        '<div class="fxrv4-signals">' +
          '<span>' + esc(statusLabel(a)) + '</span>' +
          '<span>' + esc(availabilityLabel(a)) + '</span>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function makeTopbar(step) {
    return '<div class="fxrv4-topbar-copy">' +
      '<span class="fxrv4-topmark">F</span>' +
      '<div><strong>Intervention FIXEO</strong><small>' +
      (step === 2 ? 'Récapitulatif · 2 sur 2' : 'Votre intervention · 1 sur 2') +
      '</small></div></div>';
  }

  function setStepLabels(modal, step) {
    var labels = modal.querySelectorAll('.fixeo-res-step-label');
    if (labels[0]) labels[0].textContent = 'Votre intervention';
    if (labels[1]) labels[1].textContent = 'Récapitulatif';
    var dots = modal.querySelectorAll('.fixeo-res-step-dot');
    if (dots[0]) dots[0].textContent = step === 2 ? '✓' : '1';
    if (dots[1]) dots[1].textContent = '2';
  }

  function setTopbar(modal, step) {
    var header = modal.querySelector('.fixeo-res-header');
    if (!header) return;
    header.classList.add('fxrv4-header');
    var old = header.querySelector('.fxrv4-topbar-copy');
    if (old) old.remove();
    header.insertAdjacentHTML('afterbegin', makeTopbar(step));
  }

  function ensureIdentity(modal) {
    var old = modal.querySelector('.fxrv4-identity');
    if (old) old.remove();
    var steps = modal.querySelector('.fixeo-res-steps');
    if (steps) steps.insertAdjacentHTML('afterend', identityCard(state.artisan || {}));
  }

  function suggestedServices(a) {
    var raw = a && Array.isArray(a.skills) ? a.skills : [];
    var seen = Object.create(null), out = [];
    raw.forEach(function (v) {
      v = clean(v);
      if (!v) return;
      var k = v.toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      out.push(v);
    });
    return out.slice(0, 4);
  }

  function buildNeedPanel(modal, form) {
    if (form.querySelector('.fxrv4-need')) return;
    var desc = modal.querySelector('#res-desc');
    if (!desc) return;
    var legacyField = desc.closest('.fixeo-res-field');
    var panel = document.createElement('section');
    panel.className = 'fxrv4-panel fxrv4-need';
    panel.innerHTML =
      '<div class="fxrv4-section-head"><span>01</span><div><small>VOTRE BESOIN</small>' +
      '<h2>Que faut-il faire ?</h2></div></div>' +
      '<p class="fxrv4-help">Décrivez le problème ou le travail souhaité en quelques mots.</p>';

    var suggestions = suggestedServices(state.artisan);
    if (suggestions.length) {
      var quick = document.createElement('div');
      quick.className = 'fxrv4-quick';
      quick.setAttribute('aria-label', 'Services renseignés sur le profil');
      suggestions.forEach(function (label) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'fxrv4-quick-chip';
        b.textContent = label;
        b.addEventListener('click', function () {
          desc.value = label;
          state.description = label;
          desc.dispatchEvent(new Event('input', { bubbles:true }));
          quick.querySelectorAll('.fxrv4-quick-chip').forEach(function (x) {
            x.classList.toggle('active', x === b);
          });
          desc.focus({ preventScroll:true });
        });
        quick.appendChild(b);
      });
      panel.appendChild(quick);
    }

    var wrap = document.createElement('div');
    wrap.className = 'fxrv4-need-input';
    desc.rows = 3;
    desc.placeholder = 'Ex. fuite sous l’évier, chauffe-eau en panne, prise qui ne fonctionne plus…';
    desc.removeAttribute('style');
    wrap.appendChild(desc);
    panel.appendChild(wrap);

    if (legacyField && legacyField.parentNode) legacyField.remove();
    form.insertBefore(panel, form.firstChild);
  }

  function groupWhen(modal, form) {
    if (form.querySelector('.fxrv4-when')) return;
    var date = modal.querySelector('#res-date');
    var slots = modal.querySelector('#res-slot-grid');
    if (!date || !slots) return;
    var dateField = date.closest('.fixeo-res-field');
    var slotField = slots.closest('.fixeo-res-field');
    if (!dateField || !slotField) return;

    var panel = document.createElement('section');
    panel.className = 'fxrv4-panel fxrv4-when';
    panel.innerHTML =
      '<div class="fxrv4-section-head"><span>02</span><div><small>QUAND ?</small>' +
      '<h2>Choisissez votre disponibilité.</h2></div></div>';
    dateField.classList.add('fxrv4-date-field');
    slotField.classList.add('fxrv4-slot-field');
    var dl = dateField.querySelector('.fixeo-res-label');
    var sl = slotField.querySelector('.fixeo-res-label');
    if (dl) dl.textContent = 'Date souhaitée';
    if (sl) sl.textContent = 'Créneau';
    panel.appendChild(dateField);
    panel.appendChild(slotField);

    var afterNeed = form.querySelector('.fxrv4-need');
    if (afterNeed && afterNeed.nextSibling) form.insertBefore(panel, afterNeed.nextSibling);
    else form.appendChild(panel);
  }

  function decorateContactFields(modal) {
    var addr = modal.querySelector('#res-address');
    var phone = modal.querySelector('#res-phone');
    if (addr) {
      var af = addr.closest('.fixeo-res-field');
      if (af) {
        af.classList.add('fxrv4-panel','fxrv4-address');
        var al = af.querySelector('.fixeo-res-label');
        if (al) al.innerHTML = '<span class="fxrv4-num">03</span><span><small>OÙ ?</small><strong>Adresse d’intervention</strong></span>';
      }
    }
    if (phone) {
      var pf = phone.closest('.fixeo-res-field');
      if (pf) {
        pf.classList.add('fxrv4-panel','fxrv4-phone');
        var pl = pf.querySelector('.fixeo-res-label');
        if (pl) pl.innerHTML = '<span class="fxrv4-num">04</span><span><small>CONTACT</small><strong>Votre téléphone</strong></span>';
      }
    }
  }

  function hideLegacyStep1(modal) {
    var legacyCard = modal.querySelector('.fixeo-res-artisan-card');
    if (legacyCard) legacyCard.classList.add('fxrv4-hide');
    var coord = modal.querySelector('.fxrva-artisan-coord');
    if (coord) coord.classList.add('fxrv4-hide');
    var svc = modal.querySelector('#res-svc-pills');
    if (svc) {
      var f = svc.closest('.fixeo-res-field');
      if (f) f.classList.add('fxrv4-hide');
    }
    var hint = modal.querySelector('[data-res-svc-hint]');
    if (hint) hint.classList.add('fxrv4-hide');
    var price = modal.querySelector('#res-tarif-estime');
    if (price) price.classList.add('fxrv4-hide');
    var footer = modal.querySelector('.fixeo-res-footer');
    if (footer) footer.classList.add('fxrv4-hide');
  }

  function priceTruth(modal, form) {
    var existing = form.querySelector('.fxrv4-price-truth');
    if (existing) existing.remove();
    var est = modal.getAttribute('data-estimator-context') === 'true';
    var amount = '';
    var pe = modal.querySelector('#res-price-display');
    if (est && pe) amount = clean(pe.textContent);
    var el = document.createElement('div');
    el.className = 'fxrv4-price-truth' + (est ? ' verified' : '');
    el.innerHTML = est && amount
      ? '<span class="fxrv4-truth-icon">F</span><div><small>ESTIMATION FIXEO VÉRIFIÉE</small><strong>' +
        esc(amount) + '</strong><p>Cette estimation provient du contexte FIXEO validé.</p></div>'
      : '<span class="fxrv4-truth-icon">F</span><div><small>TARIF</small><strong>Confirmé avant intervention</strong>' +
        '<p>Aucun paiement maintenant. Le professionnel confirme le tarif avant de commencer.</p></div>';
    var error = form.querySelector('#res-error');
    if (error) form.insertBefore(el, error);
    else form.appendChild(el);
  }

  function setHiddenCategory(modal) {
    var input = modal.querySelector('#res-service');
    if (!input) return;
    var label = categoryLabel(state.artisan || {});
    if (!clean(input.value)) input.value = label;
    state.serviceLabel = clean(input.value) || label;
  }

  function syncFromStep1(modal) {
    var desc = modal.querySelector('#res-desc');
    var addr = modal.querySelector('#res-address');
    var phone = modal.querySelector('#res-phone');
    var date = modal.querySelector('#res-date');
    var svc = modal.querySelector('#res-service');
    var slot = modal.querySelector('#res-slot-grid .fixeo-res-slot.active');
    if (desc) state.description = clean(desc.value);
    if (addr) state.address = clean(addr.value);
    if (phone) state.phone = clean(phone.value);
    if (date) state.dateISO = clean(date.value);
    if (svc) state.serviceLabel = clean(svc.value) || categoryLabel(state.artisan || {});
    if (slot) {
      state.slot = clean(slot.getAttribute('data-slot')) || state.slot;
      state.slotLabel = clean(slot.textContent).replace(/\s+/g,' ');
    }
  }

  function validateNeed(modal, ev) {
    syncFromStep1(modal);
    if (state.description.length >= 3) return true;
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
    }
    var error = modal.querySelector('#res-error');
    if (error) {
      error.textContent = 'Décrivez brièvement votre besoin pour continuer.';
      error.style.display = 'block';
    }
    var desc = modal.querySelector('#res-desc');
    if (desc) {
      desc.classList.add('fxrv4-invalid');
      desc.focus({ preventScroll:true });
      setTimeout(function () { desc.scrollIntoView({ behavior:'smooth', block:'center' }); }, 50);
    }
    return false;
  }

  function styleContinue(modal) {
    var cta = modal.querySelector('#res-step1-cta');
    if (!cta) return;
    cta.classList.add('fxrv4-primary');
    cta.innerHTML = '<span class="fxrv4-btn-mark">F</span><span><strong>Continuer</strong>' +
      '<small>Vérifier ma demande</small></span><b>→</b>';
    if (!cta.dataset.fxrv4Bound) {
      cta.dataset.fxrv4Bound = '1';
      cta.addEventListener('click', function (ev) {
        if (!validateNeed(modal, ev)) return;
        syncFromStep1(modal);
      }, true);
    }
  }

  function maskPhone(v) {
    var s = clean(v).replace(/\s+/g,'');
    if (s.length < 6) return s;
    return s.slice(0,2) + '••••••' + s.slice(-2);
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', {
        day:'numeric', month:'short', year:'numeric'
      });
    } catch (_) { return iso; }
  }

  function readEstimatorAmount(modal) {
    if (modal.getAttribute('data-estimator-context') !== 'true') return 0;
    var rows = modal.querySelectorAll('.fixeo-res-summary-row');
    for (var i=0;i<rows.length;i++) {
      var label = clean(rows[i].querySelector('.fixeo-res-summary-label') && rows[i].querySelector('.fixeo-res-summary-label').textContent);
      var val = clean(rows[i].querySelector('.fixeo-res-summary-val') && rows[i].querySelector('.fixeo-res-summary-val').textContent);
      if (/Prix FIXEO/i.test(label)) {
        var n = parseFloat(val.replace(/[^0-9,.-]/g,'').replace(',','.'));
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
    return 0;
  }

  function recapHtml(estimatorAmount) {
    var a = state.artisan || {};
    var service = state.serviceLabel || categoryLabel(a);
    var when = [formatDate(state.dateISO), state.slotLabel].filter(Boolean).join(' · ');
    var rows = [
      ['Votre besoin', state.description || service],
      ['Quand', when || 'À confirmer'],
      ['Adresse', state.address || 'À préciser'],
      ['Contact', maskPhone(state.phone) || 'À préciser']
    ];
    return '<div class="fxrv4-recap-list">' + rows.map(function (r) {
      return '<div class="fxrv4-recap-row"><div><small>' + esc(r[0]) + '</small><strong>' +
        esc(r[1]) + '</strong></div><button type="button" data-res-back="step1">Modifier</button></div>';
    }).join('') + '</div>' +
      (estimatorAmount > 0
        ? '<div class="fxrv4-price-truth verified"><span class="fxrv4-truth-icon">F</span><div>' +
          '<small>ESTIMATION FIXEO VÉRIFIÉE</small><strong>' + estimatorAmount.toLocaleString('fr-FR') +
          ' MAD</strong><p>Montant issu du contexte Estimator validé.</p></div></div>'
        : '<div class="fxrv4-price-truth"><span class="fxrv4-truth-icon">F</span><div>' +
          '<small>TARIF</small><strong>Confirmé avant intervention</strong>' +
          '<p>Aucun montant n’est inventé par FIXEO.</p></div></div>');
  }

  function ensureOrderRef() {
    if (state.orderRef) return state.orderRef;
    var suffix = '';
    try {
      suffix = window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID().replace(/-/g,'').slice(0,10).toUpperCase()
        : Math.random().toString(36).slice(2,12).toUpperCase();
    } catch (_) {
      suffix = String(Date.now()).slice(-10);
    }
    state.orderRef = 'REQ-' + suffix;
    return state.orderRef;
  }

  function saveLastOrder(body, booking, orderID) {
    try {
      var a = state.artisan || {};
      var record = {
        orderID: orderID,
        bookingRef: body && body.ref ? body.ref : '',
        canonical_request_id: body && body.id ? body.id : '',
        artisan: clean(a.name || a.full_name) || 'Artisan FIXEO',
        artisanId: clean(a._artisan_id_canonical || a._supabase_id || a.id),
        service: booking.service,
        date: booking.date,
        timeSlot: booking.timeSlot,
        address: booking.address,
        phone: booking.phone,
        client: localStorage.getItem('fixeo_user_name') || 'Client',
        status: 'new',
        payStatus: 'pending_request',
        paymentMethod: 'Paiement après intervention'
      };
      localStorage.setItem('lastOrder', JSON.stringify(record));
    } catch (_) {}
  }

  function directConfirm(modal, btn) {
    if (!window.FixeoReservation || typeof window.FixeoReservation._canonicalPersistGate !== 'function') return;
    var a = state.artisan || {};
    var orderID = ensureOrderRef();
    var booking = {
      _source: 'reservation_targeted_v4',
      artisanName: clean(a.name || a.full_name) || 'Artisan FIXEO',
      artisanId: a._artisan_id_canonical || a._supabase_id || a.id || '',
      artisanCity: clean(a.city),
      service: state.serviceLabel || categoryLabel(a),
      description: state.description,
      date: formatDate(state.dateISO),
      timeSlot: state.slotLabel,
      address: state.address,
      phone: state.phone,
      isExpress: false
    };

    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.innerHTML = '<span class="fxrv4-btn-mark">F</span><span><strong>Enregistrement…</strong>' +
      '<small>FIXEO sécurise votre demande</small></span>';

    window.FixeoReservation._canonicalPersistGate(
      booking,
      orderID,
      clean(a.city),
      function (body) {
        saveLastOrder(body || {}, booking, orderID);
        try {
          if (window.FixeoSlotLock && typeof window.FixeoSlotLock.onReservationCreated === 'function') {
            window.FixeoSlotLock.onReservationCreated({
              artisanId: booking.artisanId,
              artisanName: booking.artisanName,
              service: booking.service,
              date: booking.date,
              time: booking.timeSlot,
              timeSlot: booking.timeSlot,
              paid: false,
              paymentMethod: 'Paiement après intervention'
            });
          }
        } catch (_) {}
        window.FixeoReservation.close();
        window.location.href = 'confirmation.html';
      },
      function (msg) {
        btn.disabled = false;
        btn.classList.remove('is-loading');
        btn.innerHTML = '<span class="fxrv4-btn-mark">F</span><span><strong>Confirmer ma demande</strong>' +
          '<small>Paiement après intervention</small></span><b>→</b>';
        var e = modal.querySelector('#res-error');
        if (e) {
          e.textContent = msg || 'Impossible d’enregistrer la demande. Réessayez.';
          e.style.display = 'block';
          e.scrollIntoView({ behavior:'smooth', block:'center' });
        }
      }
    );
  }

  function enhanceStep1(modal) {
    var form = modal.querySelector('#fixeo-res-form');
    if (!form) return;
    modal.setAttribute('data-reservation-v4','targeted');
    modal.setAttribute('data-fxrv4-step','1');
    document.body.classList.add('fxrv4-active');

    setTopbar(modal,1);
    setStepLabels(modal,1);
    ensureIdentity(modal);
    hideLegacyStep1(modal);
    setHiddenCategory(modal);
    buildNeedPanel(modal,form);
    groupWhen(modal,form);
    decorateContactFields(modal);
    priceTruth(modal,form);
    styleContinue(modal);

    form.classList.add('fxrv4-form');
    var desc = modal.querySelector('#res-desc');
    if (desc && !desc.dataset.fxrv4Sync) {
      desc.dataset.fxrv4Sync = '1';
      desc.addEventListener('input', function(){ state.description = clean(desc.value); desc.classList.remove('fxrv4-invalid'); });
    }
    ['res-address','res-phone','res-date'].forEach(function(id){
      var el = modal.querySelector('#'+id);
      if (el && !el.dataset.fxrv4Sync) {
        el.dataset.fxrv4Sync = '1';
        el.addEventListener('input', function(){ syncFromStep1(modal); });
        el.addEventListener('change', function(){ syncFromStep1(modal); });
      }
    });
    var slots = modal.querySelector('#res-slot-grid');
    if (slots && !slots.dataset.fxrv4Sync) {
      slots.dataset.fxrv4Sync='1';
      slots.addEventListener('click',function(){ setTimeout(function(){syncFromStep1(modal);},0); });
    }
    syncFromStep1(modal);
  }

  function enhanceStep2(modal) {
    var pay = modal.querySelector('.fixeo-res-btn-pay');
    var summary = modal.querySelector('.fixeo-res-summary');
    if (!pay || !summary) return;
    modal.setAttribute('data-reservation-v4','targeted');
    modal.setAttribute('data-fxrv4-step','2');
    document.body.classList.add('fxrv4-active');

    setTopbar(modal,2);
    setStepLabels(modal,2);
    ensureIdentity(modal);

    var amount = readEstimatorAmount(modal);
    summary.classList.add('fxrv4-recap');
    summary.innerHTML = '<div class="fxrv4-section-head"><span>02</span><div><small>RÉCAPITULATIF</small>' +
      '<h2>Vérifiez votre demande.</h2></div></div>' + recapHtml(amount) +
      '<div class="fixeo-res-error" id="res-error" style="display:none"></div>';

    ['.fixeo-res-trust-row','.fixeo-res-payment-section','.fixeo-res-footer','.fxrv3-hero-card','.fxrv3-sticky-cta'].forEach(function(sel){
      modal.querySelectorAll(sel).forEach(function(el){el.classList.add('fxrv4-hide');});
    });

    var actions = modal.querySelector('.fixeo-res-actions');
    if (actions) actions.classList.add('fxrv4-actions');
    pay.removeAttribute('onclick');
    pay.className = 'fixeo-res-btn-primary fixeo-res-btn-pay fxrv4-primary';
    pay.innerHTML = '<span class="fxrv4-btn-mark">F</span><span><strong>Confirmer ma demande</strong>' +
      '<small>Paiement après intervention</small></span><b>→</b>';

    if (!pay.dataset.fxrv4Bound) {
      pay.dataset.fxrv4Bound = '1';
      pay.addEventListener('click', function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        if (amount > 0 && modal.getAttribute('data-estimator-context') === 'true') {
          pay.disabled = true;
          pay.classList.add('is-loading');
          window.FixeoReservation._proceedToPayment(amount);
        } else {
          directConfirm(modal,pay);
        }
      });
    }
  }

  function enhance(modal) {
    if (!modal || !state.artisan || !document.body.classList.contains('fixeo-booking-modal-open')) return;
    if (modal.querySelector('#res-step1-cta') && modal.querySelector('#res-address')) {
      enhanceStep1(modal);
    } else if (modal.querySelector('.fixeo-res-btn-pay') && modal.querySelector('.fixeo-res-summary')) {
      enhanceStep2(modal);
    }
  }

  function updateViewport() {
    var vv = window.visualViewport;
    var bottom = 0;
    if (vv) bottom = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
    document.documentElement.style.setProperty('--fxrv4-vv-bottom', Math.round(bottom) + 'px');
  }

  function bindViewport() {
    if (state.vvBound || !window.visualViewport) return;
    state.vvBound = true;
    window.visualViewport.addEventListener('resize', updateViewport, { passive:true });
    window.visualViewport.addEventListener('scroll', updateViewport, { passive:true });
    updateViewport();
  }

  function observeModal(modal) {
    if (!modal || modal.dataset.fxrv4Observed) return;
    modal.dataset.fxrv4Observed='1';
    state.observer = new MutationObserver(function(){
      queueMicrotask(function(){ enhance(modal); });
    });
    state.observer.observe(modal,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-estimator-context']});
    enhance(modal);
  }

  function hookEngine() {
    if (!window.FixeoReservation || window.FixeoReservation._fxrv4Hooked) return false;
    var api = window.FixeoReservation;
    var origOpen = api.open;
    var origClose = api.close;
    if (typeof origOpen !== 'function') return false;

    api._fxrv4Hooked = true;
    api.open = function(artisanInput){
      state.artisan = artisanInput && typeof artisanInput === 'object' ? artisanInput : null;
      state.orderRef = null;
      state.description = '';
      state.address = '';
      state.phone = '';
      state.dateISO = '';
      state.slot = 'matin';
      state.slotLabel = 'Matin';
      state.serviceLabel = categoryLabel(state.artisan || {});
      var result = origOpen.apply(this, arguments);
      setTimeout(function(){
        var modal = document.getElementById('fixeo-reservation-modal');
        if (modal) observeModal(modal);
      },0);
      return result;
    };
    api.close = function(){
      document.body.classList.remove('fxrv4-active');
      var r = origClose.apply(this, arguments);
      state.artisan = null;
      return r;
    };
    return true;
  }

  function boot() {
    bindViewport();
    if (!hookEngine()) {
      var tries=0, timer=setInterval(function(){
        tries++;
        if (hookEngine() || tries>100) clearInterval(timer);
      },50);
    }
    state.bodyObserver = new MutationObserver(function(){
      var modal=document.getElementById('fixeo-reservation-modal');
      var open=document.body.classList.contains('fixeo-booking-modal-open');
      if (open && modal && state.artisan) {
        document.body.classList.add('fxrv4-active');
        observeModal(modal);
        enhance(modal);
      } else if (!open) {
        document.body.classList.remove('fxrv4-active');
      }
    });
    state.bodyObserver.observe(document.body,{attributes:true,attributeFilter:['class'],childList:true});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();

})(window, document);
