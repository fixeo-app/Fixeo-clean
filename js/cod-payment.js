/* ============================================================
   FIXEO V14 — COD PAYMENT ENGINE (Cash on Delivery)
   ─────────────────────────────────────────────────────────────
   Gère le paiement à la livraison (Cash on Delivery) :
     1. Appelle POST /api/booking/cod (backend disponible)
     2. Fallback localStorage si backend indisponible
     3. Slot Lock actif dès la création
     4. Commission 15% calculée automatiquement
     5. Confirmation admin requise (status: pending_cod)

   Compatible avec :
     - FixeoReservation (reservation.js)
     - FixeoSlotLock (slot-lock.js)
     - ADMIN_RESERVATIONS (admin.js)
   ============================================================ */

(function (window) {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     CONFIG
  ══════════════════════════════════════════════════════════ */
  const COD_CONFIG = {
    COMMISSION_RATE : 0.15,   // 15% commission Fixeo
    API_BASE: (function () {
      const h = window.location.hostname;
      const proto = window.location.protocol;
      if (h.includes('ngrok') || h.includes('tunnel') || h.includes('loca.lt')) {
        return window.location.origin;
      }
      if (h === 'localhost' || h === '127.0.0.1') {
        return proto + '//' + h + ':3001';
      }
      return window.location.origin;
    })(),
    LS_KEY          : 'fixeo_reservations',
    LS_COD_KEY      : 'fixeo_cod_orders',
    DASHBOARD_URL     : 'dashboard-client.html',
    CONFIRMATION_URL  : 'confirmation.html',   // ← Page confirmation COD v15
    LS_LAST_ORDER_KEY : 'lastOrder',            // ← Clé localStorage pour la page confirmation
  };

  /* ── Logger ───────────────────────────────────────────── */
  function _log(level, ...args) {
    const prefix = '[Fixeo COD]';
    if (level === 'error') console.error(prefix, ...args);
    else if (level === 'warn')  console.warn(prefix, ...args);
    else                        console.log(prefix, ...args);
  }

  /* ── Générer un orderID unique ────────────────────────── */
  function _generateOrderID() {
    return 'COD-' + Date.now().toString(36).toUpperCase() + '-' +
           Math.random().toString(36).substring(2, 6).toUpperCase();
  }

  /* ── Générer une bookingRef ───────────────────────────── */
  function _generateBookingRef() {
    return 'BKG-COD-' + Date.now().toString(36).toUpperCase();
  }

  /* ── Calcul commission ────────────────────────────────── */
  function _calcCommission(amount) {
    const a          = parseFloat(amount) || 0;
    const commission = Math.round(a * COD_CONFIG.COMMISSION_RATE);
    const netArtisan = Math.round(a - commission);
    return { commission, netArtisan };
  }

  /* ── Sauvegarder dans localStorage (fixeo_reservations) ─ */
  function _saveToLocalStorage(record) {
    try {
      const stored = JSON.parse(localStorage.getItem(COD_CONFIG.LS_KEY) || '[]');
      stored.unshift(record);
      localStorage.setItem(COD_CONFIG.LS_KEY, JSON.stringify(stored));

      /* Aussi dans fixeo_cod_orders pour faciliter l'accès */
      const codList = JSON.parse(localStorage.getItem(COD_CONFIG.LS_COD_KEY) || '[]');
      codList.unshift(record);
      localStorage.setItem(COD_CONFIG.LS_COD_KEY, JSON.stringify(codList));

      _log('info', '✅ COD sauvegardé en localStorage — id:', record.id);
    } catch (e) {
      _log('warn', 'Erreur localStorage COD:', e.message);
    }
  }

  /* ── Construire le record local ───────────────────────── */
  function _buildRecord(orderID, bookingRef, bookingData, commission, netArtisan) {
    return {
      id            : orderID,
      bookingRef    : bookingRef,
      type          : bookingData.isExpress ? 'express' : 'standard',
      paymentMethod : 'Paiement cash après intervention',
      method        : 'Paiement cash après intervention',
      orderStatus   : 'pending_cod',
      status        : 'pending',
      payStatus     : 'pending_cod',
      slotLock      : true,
      artisan       : bookingData.artisanName || '—',
      artisanName   : bookingData.artisanName || '—',
      artisanId     : bookingData.artisanId   || 0,
      service       : bookingData.service     || '—',
      date          : bookingData.date        || new Date().toLocaleDateString('fr-FR'),
      time          : bookingData.timeSlot    || bookingData.time || '—',
      timeSlot      : bookingData.timeSlot    || '—',
      address       : bookingData.address     || '—',
      phone         : bookingData.phone       || '—',
      price         : parseFloat(bookingData.price || bookingData._total || 0),
      commission    : commission,
      netArtisan    : netArtisan,
      client        : localStorage.getItem('fixeo_user_name') || 'Client',
      isExpress     : !!bookingData.isExpress,
      createdAt     : new Date().toLocaleDateString('fr-FR'),
      transactionDate: new Date().toLocaleDateString('fr-FR'),
      paid          : false,
    };
  }

  /* ══════════════════════════════════════════════════════════
     FONCTION PRINCIPALE : processCOD
     ──────────────────────────────────────────────────────────
     @param bookingData  object  (depuis FixeoReservation)
     @param callbacks    { onSuccess, onError, onLoading }
  ══════════════════════════════════════════════════════════ */
  function processCOD(bookingData, callbacks) {
    callbacks = callbacks || {};

    _log('info', '→ processCOD() | bookingData:', JSON.stringify(bookingData));

    /* Montant total */
    const totalAmount = parseFloat(bookingData.price || bookingData._total || bookingData.amount || 100);
    const { commission, netArtisan } = _calcCommission(totalAmount);

    /* Générer un orderID unique */
    const orderID    = _generateOrderID();
    const bookingRef = _generateBookingRef();

    if (callbacks.onLoading) {
      callbacks.onLoading('⏳ Enregistrement de votre commande COD…');
    }

    /* Payload pour l'API */
    const payload = {
      orderID       : orderID,
      clientDetails : {
        totalAmount  : totalAmount,
        price        : totalAmount,
        artisanName  : bookingData.artisanName || '—',
        artisanId    : bookingData.artisanId   || 0,
        service      : bookingData.service     || '—',
        date         : bookingData.date        || '—',
        timeSlot     : bookingData.timeSlot    || '—',
        time         : bookingData.timeSlot    || bookingData.time || '—',
        address      : bookingData.address     || '—',
        phone        : bookingData.phone       || '—',
        isExpress    : !!bookingData.isExpress,
      }
    };

    /* Essayer le backend */
    const apiURL = COD_CONFIG.API_BASE + '/api/booking/cod';
    _log('info', '→ POST', apiURL);

    /* Timeout 5s pour le backend */
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(function() { controller.abort(); }, 5000) : null;

    fetch(apiURL, {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify(payload),
      signal  : controller ? controller.signal : undefined
    })
    .then(function(r) {
      if (timer) clearTimeout(timer);
      _log('info', 'POST /api/booking/cod HTTP status:', r.status);
      if (r.status === 409) throw new Error('Commande COD déjà enregistrée (doublon).');
      if (!r.ok) throw new Error('/api/booking/cod error: HTTP ' + r.status);
      return r.json();
    })
    .then(function(body) {
      _log('info', '✅ COD confirmé par le backend:', JSON.stringify(body));

      const finalRef        = body.bookingRef   || bookingRef;
      const finalCommission = body.commission   || commission;
      const finalNet        = body.netArtisan   || netArtisan;
      const finalOrderID    = body.orderID      || orderID;

      const record = _buildRecord(finalOrderID, finalRef, bookingData, finalCommission, finalNet);
      _saveToLocalStorage(record);
      _notifyHooks(record);

      /* ── Sauvegarder lastOrder pour la page confirmation ── */
      _saveLastOrder(finalOrderID, finalRef, bookingData, totalAmount);

      if (callbacks.onSuccess) callbacks.onSuccess(finalOrderID, record, body);
    })
    .catch(function(err) {
      if (timer) clearTimeout(timer);
      _log('warn', '⚠️ Backend COD indisponible — fallback localStorage. Err:', err.message);

      /* ── FALLBACK : pas de backend → tout en localStorage ── */
      const record = _buildRecord(orderID, bookingRef, bookingData, commission, netArtisan);
      _saveToLocalStorage(record);
      _notifyHooks(record);

      _log('info', '✅ COD enregistré localement (fallback) — id:', orderID);

      /* ── Sauvegarder lastOrder pour la page confirmation ── */
      _saveLastOrder(orderID, bookingRef, bookingData, totalAmount);

      if (callbacks.onSuccess) callbacks.onSuccess(orderID, record, {
        success      : true,
        orderID      : orderID,
        bookingRef   : bookingRef,
        orderStatus  : 'pending_cod',
        slotLock     : true,
        commission   : commission,
        netArtisan   : netArtisan,
        totalAmount  : totalAmount,
        message      : 'Commande COD enregistrée localement (mode hors-ligne).',
        _fallback    : true,
      });
    });
  }

  /* ── Notifier les hooks (SlotLock + Admin) ───────────── */
  function _notifyHooks(record) {
    /* FixeoSlotLock → marquer le créneau comme occupé */
    if (window.FixeoSlotLock && typeof window.FixeoSlotLock.onReservationCreated === 'function') {
      window.FixeoSlotLock.onReservationCreated({
        artisanId   : record.artisanId,
        artisanName : record.artisanName,
        service     : record.service,
        date        : record.date,
        time        : record.time,
        timeSlot    : record.timeSlot,
        price       : record.price,
        isExpress   : record.isExpress,
        paid        : false,
        paymentMethod: 'Cash on Delivery',
      });
      _log('info', '✅ SlotLock notifié — créneau verrouillé');
    }

    /* FixeoAdminReservations → ajouter dans le dashboard */
    if (window.FixeoAdminReservations &&
        typeof window.FixeoAdminReservations.addReservation === 'function') {
      window.FixeoAdminReservations.addReservation({
        artisanId   : record.artisanId,
        artisanName : record.artisanName,
        service     : record.service,
        date        : record.date,
        timeSlot    : record.timeSlot,
        price       : record.price,
        isExpress   : record.isExpress,
        paid        : false,
        paymentMethod: 'Cash on Delivery',
        method      : 'Cash on Delivery',
        payStatus   : 'pending_cod',
        commission  : record.commission,
        netArtisan  : record.netArtisan,
      });
      _log('info', '✅ Admin notifié — réservation COD ajoutée');
    }

    /* Gamification hook */
    if (window.gamification && window.gamification.updateMission) {
      window.gamification.updateMission('m2', 1);
    }

    /* Notification system hook */
    if (window.notifSystem && window.notifSystem.push) {
      window.notifSystem.push({
        type  : 'info',
        icon  : '💵',
        title : 'Commande COD enregistrée',
        body  : `Réservation confirmée · Paiement à la livraison · ${record.price} MAD`,
      });
    }
  }

  /* ══════════════════════════════════════════════════════════
     RENDER : Modal de confirmation COD
     ──────────────────────────────────────────────────────────
     Affiche une confirmation visuelle après validation COD.
  ══════════════════════════════════════════════════════════ */
  function showCODConfirmation(orderID, bookingRef, bookingData, commission, netArtisan) {
    /* Supprimer modal précédent si existe */
    const existing = document.getElementById('fixeo-cod-confirm-modal');
    if (existing) existing.remove();

    const total      = parseFloat(bookingData.price || bookingData._total || 0);
    const artisanName = bookingData.artisanName || 'L\'artisan';

    const modal = document.createElement('div');
    modal.id = 'fixeo-cod-confirm-modal';
    modal.style.cssText = [
      'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;',
      'background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);',
      'animation:codModalFadeIn .3s ease;'
    ].join('');

    modal.innerHTML = `
      <style>
        @keyframes codModalFadeIn { from { opacity:0; transform:scale(.94); } to { opacity:1; transform:scale(1); } }
        #fixeo-cod-confirm-modal .cod-box {
          background: linear-gradient(135deg,rgba(20,24,40,.97) 0%,rgba(15,18,35,.99) 100%);
          border: 1.5px solid rgba(32,201,151,0.35);
          border-radius: 20px;
          padding: 36px 32px 32px;
          max-width: 460px;
          width: 94%;
          text-align: center;
          box-shadow: 0 24px 64px rgba(0,0,0,.6), 0 0 0 1px rgba(32,201,151,.1);
          font-family: 'Cairo', Tajawal, sans-serif;
          color: #fff;
        }
        #fixeo-cod-confirm-modal .cod-icon-wrap {
          width: 80px; height: 80px; border-radius: 50%;
          background: linear-gradient(135deg,rgba(32,201,151,.2),rgba(32,201,151,.08));
          border: 2px solid rgba(32,201,151,.45);
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 20px;
          font-size: 2.2rem;
        }
        #fixeo-cod-confirm-modal h2 {
          font-size: 1.35rem; font-weight: 800; margin: 0 0 6px;
          color: #20C997;
        }
        #fixeo-cod-confirm-modal .cod-sub {
          font-size: .9rem; color: rgba(255,255,255,.6); margin-bottom: 24px;
        }
        #fixeo-cod-confirm-modal .cod-info-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
          margin: 20px 0; text-align: left;
        }
        #fixeo-cod-confirm-modal .cod-info-item {
          background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07);
          border-radius: 10px; padding: 10px 12px;
        }
        #fixeo-cod-confirm-modal .cod-info-label {
          font-size: .7rem; color: rgba(255,255,255,.45); font-weight: 600;
          text-transform: uppercase; letter-spacing: .06em; margin-bottom: 3px;
        }
        #fixeo-cod-confirm-modal .cod-info-val {
          font-size: .9rem; font-weight: 700; color: #fff;
        }
        #fixeo-cod-confirm-modal .cod-total-row {
          display: flex; justify-content: space-between; align-items: center;
          background: rgba(32,201,151,.08); border: 1px solid rgba(32,201,151,.2);
          border-radius: 10px; padding: 12px 16px; margin: 16px 0;
        }
        #fixeo-cod-confirm-modal .cod-total-label { font-size: .9rem; color: rgba(255,255,255,.7); }
        #fixeo-cod-confirm-modal .cod-total-val { font-size: 1.3rem; font-weight: 800; color: #20C997; }
        #fixeo-cod-confirm-modal .cod-notice {
          background: rgba(255,193,7,.08); border: 1px solid rgba(255,193,7,.25);
          border-radius: 10px; padding: 12px 14px; margin: 14px 0;
          font-size: .82rem; color: rgba(255,255,255,.75); text-align: left;
          display: flex; gap: 10px; align-items: flex-start;
        }
        #fixeo-cod-confirm-modal .cod-notice-icon { font-size: 1.1rem; flex-shrink:0; margin-top:1px; }
        #fixeo-cod-confirm-modal .cod-actions { display: flex; gap: 10px; margin-top: 20px; }
        #fixeo-cod-confirm-modal .cod-btn-primary {
          flex: 1; padding: 13px; border-radius: 12px;
          background: linear-gradient(135deg,#20C997,#17a884);
          color: #fff; font-weight: 700; font-size: .95rem;
          border: none; cursor: pointer;
          transition: transform .15s, box-shadow .15s;
        }
        #fixeo-cod-confirm-modal .cod-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 20px rgba(32,201,151,.35);
        }
        #fixeo-cod-confirm-modal .cod-btn-secondary {
          padding: 13px 20px; border-radius: 12px;
          background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12);
          color: rgba(255,255,255,.75); font-weight: 600; font-size: .9rem;
          cursor: pointer; transition: background .15s;
        }
        #fixeo-cod-confirm-modal .cod-btn-secondary:hover {
          background: rgba(255,255,255,.1);
        }
        #fixeo-cod-confirm-modal .cod-ref {
          font-family: monospace; font-size: .78rem; color: rgba(255,255,255,.4);
          margin-top: 14px;
        }
      </style>
      <div class="cod-box" role="dialog" aria-modal="true" aria-label="Confirmation COD">
        <div class="cod-icon-wrap">💵</div>
        <h2>Commande Confirmée !</h2>
        <div class="cod-sub">Paiement à la livraison · Maroc</div>

        <div class="cod-info-grid">
          <div class="cod-info-item">
            <div class="cod-info-label">Artisan</div>
            <div class="cod-info-val">${_esc(artisanName)}</div>
          </div>
          <div class="cod-info-item">
            <div class="cod-info-label">Service</div>
            <div class="cod-info-val">${_esc(bookingData.service || '—')}</div>
          </div>
          <div class="cod-info-item">
            <div class="cod-info-label">Date</div>
            <div class="cod-info-val">${_esc(bookingData.date || '—')}</div>
          </div>
          <div class="cod-info-item">
            <div class="cod-info-label">Créneau</div>
            <div class="cod-info-val">${_esc(bookingData.timeSlot || '—')}</div>
          </div>
        </div>

        <div class="cod-total-row">
          <span class="cod-total-label">💰 Total à payer à la livraison</span>
          <span class="cod-total-val">${total.toLocaleString('fr-FR')} MAD</span>
        </div>

        <div class="cod-notice">
          <span class="cod-notice-icon">ℹ️</span>
          <div>
            <strong>Comment ça marche ?</strong><br/>
            L'artisan vous contactera pour confirmer l'heure exacte d'intervention.
            Préparez le montant en espèces (<strong>${total.toLocaleString('fr-FR')} MAD</strong>) le jour J.
            Votre créneau est <strong>verrouillé</strong> dès maintenant.
          </div>
        </div>

        <div class="cod-actions">
          <button class="cod-btn-secondary" onclick="document.getElementById('fixeo-cod-confirm-modal').remove();document.body.style.overflow='';">
            Fermer
          </button>
          <button class="cod-btn-primary" onclick="window.location.href='${COD_CONFIG.DASHBOARD_URL}'">
            📋 Voir mes réservations →
          </button>
        </div>

        <div class="cod-ref">Réf : ${_esc(bookingRef)} · ${_esc(orderID)}</div>
      </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    /* Fermer sur clic backdrop */
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        modal.remove();
        document.body.style.overflow = '';
      }
    });
  }

  /* ── Sauvegarder lastOrder dans localStorage ────────── */
  function _saveLastOrder(orderID, bookingRef, bookingData, totalAmount) {
    try {
      const lastOrder = {
        orderID      : orderID,
        bookingRef   : bookingRef,
        total        : parseFloat(totalAmount) || 0,
        artisan      : bookingData.artisanName || '—',
        service      : bookingData.service     || '—',
        date         : bookingData.date        || '—',
        timeSlot     : bookingData.timeSlot    || bookingData.time || '—',
        address      : bookingData.address     || '',
        phone        : bookingData.phone       || '',
        client       : localStorage.getItem('fixeo_user_name') || 'Client',
        paymentMethod: 'Cash on Delivery',
        createdAt    : new Date().toLocaleDateString('fr-FR'),
      };
      localStorage.setItem(COD_CONFIG.LS_LAST_ORDER_KEY, JSON.stringify(lastOrder));
      _log('info', '✅ lastOrder sauvegardé pour page confirmation');
    } catch (e) {
      _log('warn', 'Erreur sauvegarde lastOrder:', e.message);
    }
  }

  /* ── Escape HTML ──────────────────────────────────────── */
  function _esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str)));
    return d.innerHTML;
  }

  /* ══════════════════════════════════════════════════════════
     RENDER : Sélecteur de méthode de paiement (Step 2)
     ──────────────────────────────────────────────────────────
     Injecte les 3 options (COD default, PayPal, CMI)
     dans un container ciblé par ID.
  ══════════════════════════════════════════════════════════ */
  function renderPaymentSelector(containerId, total) {
    const el = document.getElementById(containerId);
    if (!el) return;

    el.innerHTML = `
      <style>
        .fixeo-pay-options { display: flex; flex-direction: column; gap: 10px; margin: 16px 0; }
        .fixeo-pay-option {
          display: flex; align-items: center; gap: 14px;
          background: rgba(255,255,255,.04);
          border: 1.5px solid rgba(255,255,255,.1);
          border-radius: 12px; padding: 14px 16px;
          cursor: pointer; transition: border-color .2s, background .2s;
          position: relative;
        }
        .fixeo-pay-option:hover { background: rgba(255,255,255,.07); border-color: rgba(255,255,255,.2); }
        .fixeo-pay-option.selected {
          border-color: #20C997;
          background: rgba(32,201,151,.08);
          box-shadow: 0 0 0 3px rgba(32,201,151,.15);
        }
        .fixeo-pay-option input[type="radio"] { width: 18px; height: 18px; accent-color: #20C997; flex-shrink: 0; }
        .fixeo-pay-option-icon { font-size: 1.5rem; flex-shrink: 0; }
        .fixeo-pay-option-info { flex: 1; }
        .fixeo-pay-option-label { font-weight: 700; font-size: .92rem; color: #fff; }
        .fixeo-pay-option-desc  { font-size: .77rem; color: rgba(255,255,255,.5); margin-top: 2px; }
        .fixeo-pay-option-badge {
          font-size: .67rem; font-weight: 700; padding: 2px 8px; border-radius: 20px;
          background: rgba(32,201,151,.2); color: #20C997;
          border: 1px solid rgba(32,201,151,.3);
        }
        .fixeo-pay-option-badge.default { background: rgba(32,201,151,.25); }
        .fixeo-pay-option-badge.secondary { background: rgba(100,149,237,.15); color:#6495ed; border-color:rgba(100,149,237,.3); }
        .fixeo-pay-option-badge.future { background: rgba(255,165,0,.1); color:rgba(255,165,0,.8); border-color:rgba(255,165,0,.25); }
        .fixeo-pay-option.disabled { opacity: .5; cursor: not-allowed; pointer-events: none; }
      </style>
      <div class="fixeo-pay-options" id="fixeo-pay-options-group">
        <!-- COD : sélectionné par défaut -->
        <label class="fixeo-pay-option selected" for="pay-method-cod" onclick="FixeoCOD.selectPayMethod(this,'cod')">
          <input type="radio" name="fixeoPaymentMethod" id="pay-method-cod" value="cod" checked/>
          <span class="fixeo-pay-option-icon">💵</span>
          <div class="fixeo-pay-option-info">
            <div class="fixeo-pay-option-label">Paiement à la livraison (Cash on Delivery)</div>
            <div class="fixeo-pay-option-desc">Payez en espèces lors de l'intervention · Option principale Maroc</div>
          </div>
          <span class="fixeo-pay-option-badge default">⭐ Recommandé</span>
        </label>

        <!-- CMI -->
        <label class="fixeo-pay-option" for="pay-method-cmi" onclick="FixeoCOD.selectPayMethod(this,'cmi')">
          <input type="radio" name="fixeoPaymentMethod" id="pay-method-cmi" value="cmi"/>
          <span class="fixeo-pay-option-icon">🇲🇦</span>
          <div class="fixeo-pay-option-info">
            <div class="fixeo-pay-option-label">CMI (Maroc Télécommerce)</div>
            <div class="fixeo-pay-option-desc">Carte bancaire marocaine · Bientôt disponible</div>
          </div>
          <span class="fixeo-pay-option-badge future">🚧 Bientôt</span>
        </label>
      </div>
    `;
  }

  /* ── Changer la méthode sélectionnée ─────────────────── */
  function selectPayMethod(labelEl, method) {
    /* Retirer .selected de tous */
    const all = document.querySelectorAll('#fixeo-pay-options-group .fixeo-pay-option');
    all.forEach(function(el) { el.classList.remove('selected'); });
    /* Ajouter .selected sur l'option cliquée */
    if (labelEl) labelEl.classList.add('selected');
    _log('info', 'Méthode de paiement sélectionnée:', method);
  }

  /* ── Lire la méthode actuellement sélectionnée ───────── */
  function getSelectedMethod() {
    const radio = document.querySelector('input[name="fixeoPaymentMethod"]:checked');
    return radio ? radio.value : 'cod';
  }

  /* ══════════════════════════════════════════════════════════
     EXPORT PUBLIC
  ══════════════════════════════════════════════════════════ */
  window.FixeoCOD = {
    processCOD,
    showCODConfirmation,
    renderPaymentSelector,
    selectPayMethod,
    getSelectedMethod,
    calcCommission  : _calcCommission,
    generateOrderID : _generateOrderID,
    config          : COD_CONFIG,
  };

  _log('info', '✅ FixeoCOD engine chargé — version Fixeo v14 COD');

})(window);
