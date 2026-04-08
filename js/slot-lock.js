/* ============================================================
   FIXEO V11 — SLOT LOCK ENGINE
   Bloque les créneaux déjà réservés par un artisan.
   Fonctionne avec : reservation.js · admin.js · payment.js
   ============================================================ */

(function (window) {
  'use strict';

  /* ─── Clé localStorage ─────────────────────────────────── */
  const LS_KEY = 'fixeo_reservations';

  /* ─── Normalise une date en "DD/MM/YYYY" ─────────────────
     Accepte :
       • "YYYY-MM-DD"  (valeur du <input type=date>)
       • "DD/MM/YYYY"  (format Fixeo)
       • objets Date   */
  function _normDate(raw) {
    if (!raw) return '';
    if (raw instanceof Date) {
      const d = raw.toLocaleDateString('fr-FR');
      return d;                              // DD/MM/YYYY
    }
    raw = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {  // YYYY-MM-DD → DD/MM/YYYY
      const [y, m, d] = raw.split('-');
      return `${d}/${m}/${y}`;
    }
    return raw;                              // déjà DD/MM/YYYY
  }

  /* ─── Normalise un créneau en clé courte ─────────────────
     Entrées acceptées :
       "matin" / "apresmidi" / "soir" (clés internes reservation.js)
       "Matin (8h–12h)" / "Après-midi (14h–18h)" / "Soir (18h–20h)"
       "Dès maintenant" / "maintenant"  */
  function _normSlot(raw) {
    if (!raw) return '';
    raw = String(raw).toLowerCase().trim();
    if (raw.includes('matin') || raw.includes('8h'))       return 'matin';
    if (raw.includes('apr') || raw.includes('14h'))        return 'apresmidi';
    if (raw.includes('soir') || raw.includes('18h'))       return 'soir';
    if (raw.includes('maintenant') || raw.includes('express') || raw.includes('maintenant')) return 'maintenant';
    return raw;
  }

  /* ─── Collecte toutes les réservations actives ───────────
     Sources : ADMIN_RESERVATIONS (admin.js) + localStorage  */
  function _getAllActiveReservations() {
    const list = [];

    /* 1. depuis admin.js (variable globale) */
    const adminList = window.ADMIN_RESERVATIONS;
    if (Array.isArray(adminList)) {
      adminList.forEach(r => list.push(r));
    }

    /* 2. depuis localStorage (créées via reservation.js / payment.js) */
    try {
      const stored = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      stored.forEach(r => {
        /* éviter les doublons */
        if (!list.find(x => x.id === r.id)) list.push(r);
      });
    } catch (e) { /* silent */ }

    /* 3. depuis l'historique paiements (fixeo_payment_history) */
    try {
      const hist = JSON.parse(localStorage.getItem('fixeo_payment_history') || '[]');
      hist.forEach(h => {
        const fakeId = 'PH-' + h.id;
        if (!list.find(x => x.id === fakeId)) {
          list.push({
            id        : fakeId,
            artisanId : h.artisanId || 0,
            artisan   : h.artisan   || '',
            date      : h.date      || '',
            time      : h.timeSlot  || h.time || '',
            status    : h.status    || 'confirmed',
          });
        }
      });
    } catch (e) { /* silent */ }

    return list;
  }

  /* ─── Vérifie si un créneau est déjà réservé ─────────────
     @param artisanId  number|string
     @param dateISO    string  "YYYY-MM-DD" ou "DD/MM/YYYY"
     @param slot       string  "matin"|"apresmidi"|"soir"|"maintenant"
     @returns boolean  */
  function isSlotBooked(artisanId, dateISO, slot) {
    const targetDate = _normDate(dateISO);
    const targetSlot = _normSlot(slot);
    const id = parseInt(artisanId, 10);
    const all = _getAllActiveReservations();

    return all.some(r => {
      /* statuts qui BLOQUENT le créneau */
      const blockedStatus = ['pending', 'confirmed', 'inprogress'];
      if (!blockedStatus.includes(r.status)) return false;

      const sameArtisan = r.artisanId === id || parseInt(r.artisanId, 10) === id;
      const sameDate    = _normDate(r.date) === targetDate;
      const sameSlot    = _normSlot(r.time) === targetSlot;

      return sameArtisan && sameDate && sameSlot;
    });
  }

  /* ─── Retourne la liste des créneaux occupés pour un artisan + date ──
     @returns string[]  ["matin","soir"]  */
  function getBookedSlots(artisanId, dateISO) {
    const targetDate = _normDate(dateISO);
    const id = parseInt(artisanId, 10);
    const all = _getAllActiveReservations();
    const booked = new Set();

    all.forEach(r => {
      const blockedStatus = ['pending', 'confirmed', 'inprogress'];
      if (!blockedStatus.includes(r.status)) return;
      const sameArtisan = r.artisanId === id || parseInt(r.artisanId, 10) === id;
      const sameDate    = _normDate(r.date) === targetDate;
      if (sameArtisan && sameDate) {
        booked.add(_normSlot(r.time));
      }
    });

    return Array.from(booked);
  }

  /* ─── Met à jour l'affichage du slot-grid dans le modal ──
     Appelé :
       • au changement de date (FixeoReservation._onDateChange)
       • à l'ouverture du modal
     @param artisanId  number
     @param dateISO    string "YYYY-MM-DD"  */
  function refreshSlotGrid(artisanId, dateISO) {
    const grid = document.getElementById('res-slot-grid');
    if (!grid) return;

    const booked = getBookedSlots(artisanId, dateISO);
    const slots  = grid.querySelectorAll('.fixeo-res-slot');

    slots.forEach(el => {
      const slotKey = _normSlot(el.dataset.slot || el.textContent);
      const isBooked = booked.includes(slotKey);

      if (isBooked) {
        el.classList.add('slot-booked');
        el.classList.remove('active');
        el.setAttribute('aria-disabled', 'true');
        el.setAttribute('title', '⛔ Créneau déjà réservé');
        /* désactiver le onclick inline */
        el.dataset.originalOnclick = el.getAttribute('onclick') || '';
        el.setAttribute('onclick', 'FixeoSlotLock._onBookedSlotClick(event)');
      } else {
        el.classList.remove('slot-booked');
        el.removeAttribute('aria-disabled');
        el.removeAttribute('title');
        /* restaurer le onclick */
        if (el.dataset.originalOnclick !== undefined && el.dataset.originalOnclick !== '') {
          el.setAttribute('onclick', el.dataset.originalOnclick);
        }
      }
    });
  }

  /* ─── Handler cliqué sur un créneau bloqué ───────────────  */
  function _onBookedSlotClick(e) {
    e.preventDefault();
    e.stopPropagation();
    /* mini-shake + message */
    const el = e.currentTarget || e.target;
    el.classList.add('slot-shake');
    setTimeout(() => el.classList.remove('slot-shake'), 500);

    /* Afficher l'erreur dans le modal si possible */
    const errEl = document.getElementById('res-error');
    if (errEl) {
      errEl.textContent = '⛔ Ce créneau est déjà réservé. Veuillez choisir un autre créneau ou une autre date.';
      errEl.style.display = 'block';
      setTimeout(() => { errEl.style.display = 'none'; }, 3500);
    }
  }

  /* ─── Validation au moment de soumettre (step 1) ─────────
     Retourne true si le créneau est libre, false + affiche erreur sinon  */
  function validateSlotOnSubmit(artisanId, dateISO, slot) {
    if (!artisanId || !dateISO || !slot) return true; // express ou données manquantes → passer
    if (_normSlot(slot) === 'maintenant') return true; // express always free

    if (isSlotBooked(artisanId, dateISO, slot)) {
      const errEl = document.getElementById('res-error');
      if (errEl) {
        errEl.textContent = '⛔ Ce créneau est déjà réservé ! Veuillez sélectionner un autre créneau ou une autre date.';
        errEl.style.display = 'block';
      }
      /* Secouer le slot-grid pour attirer l'attention */
      const grid = document.getElementById('res-slot-grid');
      if (grid) {
        grid.classList.add('slot-grid-shake');
        setTimeout(() => grid.classList.remove('slot-grid-shake'), 600);
      }
      return false;
    }
    return true;
  }

  /* ─── Rafraîchit les badges "occupé / libre" dans l'admin ─
     Met à jour la colonne "Disponibilité" si elle existe  */
  function refreshAdminCalendarBadges() {
    /* On ne force aucun re-render complet — renderReservations() gère déjà ça.
       On envoie juste un événement custom pour que l'admin puisse s'abonner. */
    window.dispatchEvent(new CustomEvent('fixeo:slotsUpdated'));
  }

  /* ─── Hook : appelé après chaque nouvelle réservation ────  */
  function onReservationCreated(bookingData) {
    /* Persister dans localStorage au format attendu par _getAllActiveReservations */
    try {
      const stored = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      const newEntry = {
        id        : 'SL-' + Date.now().toString(36).toUpperCase(),
        artisanId : bookingData.artisanId || 0,
        artisan   : bookingData.artisanName || bookingData.artisan || '',
        client    : bookingData.clientName || localStorage.getItem('fixeo_user_name') || 'Client',
        service   : bookingData.service || '',
        date      : _normDate(bookingData.date || bookingData.selectedDate || new Date()),
        time      : bookingData.timeSlot || bookingData.time || 'matin',
        status    : 'pending',
        payStatus : bookingData.paid ? 'paid' : 'pending_pay',
        price     : bookingData.price || 0,
        type      : bookingData.isExpress ? 'express' : 'standard',
        createdAt : new Date().toLocaleDateString('fr-FR'),
      };
      stored.push(newEntry);
      localStorage.setItem(LS_KEY, JSON.stringify(stored));
    } catch (e) { /* silent */ }

    /* notifier le dashboard admin */
    refreshAdminCalendarBadges();
  }

  /* ─── Hook : appelé après annulation d'une réservation ───  */
  function onReservationCancelled(reservationId) {
    try {
      const stored = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      const idx = stored.findIndex(r => r.id === reservationId);
      if (idx > -1) {
        stored[idx].status = 'cancelled';
        localStorage.setItem(LS_KEY, JSON.stringify(stored));
      }
    } catch (e) { /* silent */ }
    refreshAdminCalendarBadges();
  }

  /* ─── Inject les styles CSS du slot-lock ─────────────────
     (fallback si slot-lock.css n'est pas chargé)  */
  function _injectFallbackStyles() {
    if (document.getElementById('slot-lock-fallback-styles')) return;
    const style = document.createElement('style');
    style.id = 'slot-lock-fallback-styles';
    style.textContent = `
      .fixeo-res-slot.slot-booked {
        opacity: 0.45 !important;
        cursor: not-allowed !important;
        background: rgba(255,255,255,0.04) !important;
        border-color: rgba(255,255,255,0.12) !important;
        color: rgba(255,255,255,0.35) !important;
        position: relative;
        pointer-events: auto !important;
      }
      .fixeo-res-slot.slot-booked::after {
        content: '⛔ Réservé';
        position: absolute;
        bottom: 3px;
        right: 6px;
        font-size: .6rem;
        color: rgba(255,80,80,.8);
        font-weight: 700;
        letter-spacing: .02em;
      }
      .fixeo-res-slot.slot-booked::before {
        content: '';
        position: absolute;
        inset: 0;
        background: repeating-linear-gradient(
          -45deg,
          rgba(255,255,255,0.03) 0px,
          rgba(255,255,255,0.03) 4px,
          transparent 4px,
          transparent 10px
        );
        border-radius: inherit;
        pointer-events: none;
      }
      @keyframes slotShake {
        0%,100% { transform: translateX(0); }
        20%      { transform: translateX(-6px); }
        40%      { transform: translateX(6px); }
        60%      { transform: translateX(-4px); }
        80%      { transform: translateX(4px); }
      }
      .slot-shake { animation: slotShake .45s ease; }
      @keyframes slotGridShake {
        0%,100% { transform: translateX(0); }
        20%      { transform: translateX(-5px); }
        40%      { transform: translateX(5px); }
        60%      { transform: translateX(-3px); }
        80%      { transform: translateX(3px); }
      }
      .slot-grid-shake { animation: slotGridShake .55s ease; }
    `;
    document.head.appendChild(style);
  }

  /* ─── INIT ────────────────────────────────────────────────  */
  document.addEventListener('DOMContentLoaded', function () {
    _injectFallbackStyles();

    /* Écouter les mises à jour des réservations admin */
    window.addEventListener('fixeo:slotsUpdated', function () {
      /* Re-render la table admin si la fonction existe */
      if (typeof renderReservations === 'function') {
        renderReservations();
        if (typeof _updateReservationKPIs === 'function') _updateReservationKPIs();
      }
    });
  });

  /* ─── Export public ───────────────────────────────────────  */
  window.FixeoSlotLock = {
    isSlotBooked,
    getBookedSlots,
    refreshSlotGrid,
    validateSlotOnSubmit,
    onReservationCreated,
    onReservationCancelled,
    refreshAdminCalendarBadges,
    _onBookedSlotClick,
    /* utils exposés pour tests */
    _normDate,
    _normSlot,
  };

})(window);
