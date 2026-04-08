/* ============================================================
   FIXEO V14 ULTIMATE — PAYPAL SANDBOX ENGINE
   ─────────────────────────────────────────────────────────────
   Mode hybride sécurisé :
     1. Appelle le backend (POST /api/booking/capture) si disponible
     2. Fallback automatique SDK PayPal JS si backend indisponible

   CORRECTIONS V14 ULTIMATE :
     FIX-V14-1  : Montant dynamique garanti (finalAmount)
     FIX-V14-2  : Cooldown 500ms anti-spam render — popup stable
     FIX-V14-3  : onError callback toujours appelé avec message lisible
     FIX-V14-4  : API_BASE détecte hostname + port 3001 (localhost/ngrok)
     FIX-V14-5  : bookingData fallback robuste
     FIX-V14-6  : Capture via /api/booking/capture (alias brief)
     FIX-V14-7  : Redirect vers dashboard-client.html après succès
     FIX-V14-8  : Log console complet pour debugging
     FIX-V14-9  : Slot lock actif + réservation marquée payée
     FIX-V14-10 : Compatibilité Vercel / ngrok / localhost
   ============================================================ */

(function (window) {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     CONFIG SANDBOX
  ══════════════════════════════════════════════════════════ */
  const PAYPAL_CONFIG = {
    /* Client ID sandbox business — exposé côté frontend (OK — rôle public) */
    clientId : 'Ac7xoPTWZMHditzuID6doRP8zn87-u7Tfl-2D_N4uQENs-GSrkhkv3q3nOcskVqJ_4oSRBQHBYnsrI7I',
    currency : 'USD',
    intent   : 'capture',
    mode     : 'sandbox',
    COMMISSION_RATE: 0.15,
    MAD_TO_USD     : 0.10,
    MIN_USD        : '0.01',
    /* Compte sandbox personal pour tests (documentation UI seulement — le login se fait sur le popup PayPal) */
    SANDBOX_BUYER_EMAIL: 'sb-t9zf250014346@personal.example.com',
    /* FIX-V14-4 : Détection automatique de l'API_BASE */
    API_BASE: (function () {
      const h = window.location.hostname;
      const proto = window.location.protocol;
      /* Ngrok / tunnel public → même domaine, port 3001 */
      if (h.includes('ngrok') || h.includes('tunnel') || h.includes('loca.lt')) {
        /* Ngrok expose typiquement le backend sur /api via même URL */
        return window.location.origin;
      }
      /* Localhost → port 3001 dédié */
      if (h === 'localhost' || h === '127.0.0.1') {
        return proto + '//' + h + ':3001';
      }
      /* Production / Vercel → même domaine */
      return window.location.origin;
    })(),
    /* URL de redirection après succès */
    SUCCESS_URL : 'payment-success.html',
    CANCEL_URL  : 'payment-cancel.html',
    DASHBOARD_URL: 'dashboard-client.html'
  };

  /* URL SDK PayPal — lazy load */
  const SDK_URL = [
    'https://www.paypal.com/sdk/js',
    '?client-id=' + PAYPAL_CONFIG.clientId,
    '&currency=' + PAYPAL_CONFIG.currency,
    '&intent=' + PAYPAL_CONFIG.intent,
    '&locale=fr_FR',
    '&enable-funding=paypal',
    '&disable-funding=card,credit,venmo'
  ].join('');

  /* ══════════════════════════════════════════════════════════
     ÉTAT SDK
  ══════════════════════════════════════════════════════════ */
  let _sdkLoaded   = false;
  let _sdkLoading  = false;
  let _sdkQueue    = [];
  let _backendOk   = null;

  /* FIX-V14-2 : Suivi instances + cooldown */
  const _buttonsInstances = {};
  const _renderCooldown   = {};

  /* ══════════════════════════════════════════════════════════
     UTILS
  ══════════════════════════════════════════════════════════ */
  function _madToUsd(mad) {
    const v = parseFloat(mad);
    if (isNaN(v) || v <= 0) return PAYPAL_CONFIG.MIN_USD;
    const usd = (v * PAYPAL_CONFIG.MAD_TO_USD).toFixed(2);
    return parseFloat(usd) < 0.01 ? PAYPAL_CONFIG.MIN_USD : usd;
  }

  function _calcCommission(amount) {
    const a = parseFloat(amount) || 0;
    const commission = Math.round(a * PAYPAL_CONFIG.COMMISSION_RATE);
    const netArtisan = Math.round(a - commission);
    return { commission, netArtisan };
  }

  function _sanitize(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  function _generateRef() {
    return 'BKG-' + Date.now().toString(36).toUpperCase();
  }

  /* FIX-V14-8 : Logger centralisé */
  function _log(level, ...args) {
    const prefix = '[Fixeo PayPal V14]';
    if (level === 'error')  console.error(prefix, ...args);
    else if (level === 'warn')  console.warn(prefix, ...args);
    else if (level === 'info')  console.info(prefix, ...args);
    else                        console.log(prefix, ...args);
  }

  /* ══════════════════════════════════════════════════════════
     DETECTION BACKEND
  ══════════════════════════════════════════════════════════ */
  function _checkBackend() {
    if (_backendOk !== null) return Promise.resolve(_backendOk);

    const healthUrl = PAYPAL_CONFIG.API_BASE + '/api/health';
    _log('info', '→ Ping backend:', healthUrl);

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller
      ? setTimeout(function() { controller.abort(); }, 3000)
      : null;

    return fetch(healthUrl, {
      method: 'GET',
      signal: controller ? controller.signal : undefined
    })
      .then(function (r) {
        if (timer) clearTimeout(timer);
        _backendOk = r.ok;
        if (_backendOk) {
          _log('info', '✅ Backend API disponible sur', PAYPAL_CONFIG.API_BASE);
        }
        return _backendOk;
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        _backendOk = false;
        _log('warn', '⚠️ Backend indisponible (' + PAYPAL_CONFIG.API_BASE + ') — fallback SDK activé. Err:', err.message);
        return false;
      });
  }

  /* ══════════════════════════════════════════════════════════
     CHARGEMENT LAZY DU SDK PAYPAL
  ══════════════════════════════════════════════════════════ */
  function loadSDK() {
    return new Promise(function (resolve, reject) {
      if (_sdkLoaded && window.paypal) { resolve(); return; }
      if (_sdkLoading) { _sdkQueue.push({ resolve, reject }); return; }

      _sdkLoading = true;
      _sdkQueue.push({ resolve, reject });

      /* Supprimer ancienne version */
      const existing = document.querySelector('script[data-fixeo-paypal]');
      if (existing) existing.remove();
      if (window.paypal) {
        try { delete window.paypal; } catch(e) {}
        _sdkLoaded = false;
      }

      const script = document.createElement('script');
      script.src = SDK_URL;
      script.setAttribute('data-fixeo-paypal', 'true');
      script.async = true;
      script.defer = true;
      script.setAttribute('data-namespace', 'paypal');

      script.onload = function () {
        _sdkLoaded  = true;
        _sdkLoading = false;
        _log('info', '✅ SDK PayPal chargé');
        _sdkQueue.forEach(function (cb) { cb.resolve(); });
        _sdkQueue = [];
      };

      script.onerror = function () {
        _sdkLoading = false;
        const err = new Error('Échec du chargement du SDK PayPal. Vérifiez votre connexion.');
        _log('error', err.message);
        _sdkQueue.forEach(function (cb) { cb.reject(err); });
        _sdkQueue = [];
      };

      document.head.appendChild(script);
      _log('info', '→ Chargement SDK PayPal depuis', SDK_URL.split('?')[0]);
    });
  }

  /* ══════════════════════════════════════════════════════════
     NETTOYAGE INSTANCE PRÉCÉDENTE
  ══════════════════════════════════════════════════════════ */
  function _closePreviousButtons(containerId) {
    if (_buttonsInstances[containerId]) {
      try {
        _buttonsInstances[containerId].close();
        _log('info', 'Instance précédente fermée pour', containerId);
      } catch (e) { /* ignore */ }
      delete _buttonsInstances[containerId];
    }
  }

  /* ══════════════════════════════════════════════════════════
     RENDU DES BOUTONS PAYPAL — CORRIGÉ V14 ULTIMATE
  ══════════════════════════════════════════════════════════ */
  function renderButtons(containerId, bookingData, callbacks) {
    const container = document.getElementById(containerId);
    if (!container) {
      _log('warn', 'Container introuvable:', containerId);
      return;
    }

    /* FIX-V14-2 : Cooldown 500ms */
    const _now = Date.now();
    if (_renderCooldown[containerId] && (_now - _renderCooldown[containerId]) < 500) {
      _log('info', 'FIX-V14-2: Cooldown actif —', containerId, 'render ignoré.');
      return;
    }
    _renderCooldown[containerId] = _now;

    /* Guard anti-re-render */
    const _existingIframe = container.querySelector('iframe[name*="paypal"], iframe[title*="PayPal"]');
    if (_existingIframe && _buttonsInstances[containerId]) {
      _log('info', 'FIX-3: Boutons déjà rendus dans', containerId, '— re-render ignoré.');
      return;
    }

    /* Fermer instance précédente */
    _closePreviousButtons(containerId);

    /* Spinner loading */
    container.innerHTML = [
      '<div class="paypal-sdk-loading">',
      '  <div class="paypal-sdk-spinner"></div>',
      '  <span>Chargement PayPal Sandbox…</span>',
      '</div>'
    ].join('');

    /* FIX-V14-1 : Montant dynamique garanti */
    const rawAmount = bookingData._total || bookingData.price || bookingData.amount || 100;
    const amount    = parseFloat(rawAmount);
    const safeAmount = (isNaN(amount) || amount <= 0) ? 100 : amount;

    _log('info', '→ renderButtons()', containerId, '| Montant:', safeAmount, 'MAD');

    /* Afficher info sandbox buyer */
    _showSandboxInfo(container, safeAmount);

    /* Lancer en parallèle : ping backend + chargement SDK */
    Promise.all([_checkBackend(), loadSDK()])
      .then(function (results) {
        const backendAvailable = results[0];
        _log('info', 'Backend disponible:', backendAvailable, '| SDK chargé:', !!window.paypal);

        if (!window.paypal) {
          _showContainerError(container, 'PayPal SDK indisponible. Vérifiez votre connexion internet.');
          if (callbacks.onError) callbacks.onError('SDK PayPal indisponible.');
          return;
        }

        container.innerHTML = '';

        const usdAmount = _madToUsd(safeAmount);
        const desc = _sanitize(
          'Fixeo – ' + (bookingData.service || 'Service') +
          ' – ' + (bookingData.artisanName || 'Artisan Fixeo')
        );

        _log('info', 'Montant USD pour PayPal:', usdAmount, '| Description:', desc);

        /* ── Créer les boutons PayPal ── */
        const buttons = window.paypal.Buttons({
          style: {
            layout : 'vertical',
            color  : 'blue',
            shape  : 'rect',
            label  : 'pay',
            height : 50
          },

          /* ── ÉTAPE 1 : Création de la commande ── */
          createOrder: function (data, actions) {
            /* FIX-V14-1 : Montant dynamique */
            const finalAmt = parseFloat(bookingData._total || bookingData.price || bookingData.amount || 100);
            const finalSafe = (isNaN(finalAmt) || finalAmt <= 0) ? 100 : finalAmt;
            const finalUSD  = _madToUsd(finalSafe);

            _log('info', '→ createOrder | Montant final:', finalSafe, 'MAD →', finalUSD, 'USD');

            if (backendAvailable) {
              /* Mode server-side (recommandé) */
              return fetch(PAYPAL_CONFIG.API_BASE + '/api/paypal/create-order', {
                method  : 'POST',
                headers : { 'Content-Type': 'application/json' },
                body    : JSON.stringify({
                  artisan   : bookingData.artisanName || '',
                  service   : bookingData.service     || '',
                  amount    : finalSafe,
                  date      : bookingData.date        || '',
                  timeSlot  : bookingData.timeSlot    || '',
                  artisanId : bookingData.artisanId   || 0,
                  isExpress : !!bookingData.isExpress
                })
              })
              .then(function (r) {
                _log('info', 'create-order response status:', r.status);
                if (!r.ok) throw new Error('create-order backend error: HTTP ' + r.status);
                return r.json();
              })
              .then(function (body) {
                if (!body.orderID) throw new Error('orderID manquant dans la réponse backend');
                _log('info', '✅ Order créé (server-side):', body.orderID);
                /* Stocker l'orderID pour debug */
                try { sessionStorage.setItem('fixeo_pending_order', body.orderID); } catch(e){}
                return body.orderID;
              })
              .catch(function (err) {
                _log('error', 'create-order backend err:', err.message, '→ fallback SDK');
                /* Fallback automatique si le backend est indisponible temporairement */
                return actions.order.create({
                  purchase_units: [{
                    amount: { currency_code: PAYPAL_CONFIG.currency, value: finalUSD },
                    description: desc.substring(0, 127)
                  }],
                  application_context: {
                    brand_name: 'Fixeo Maroc', locale: 'fr_FR', user_action: 'PAY_NOW'
                  }
                });
              });
            } else {
              /* Fallback SDK client-side */
              _log('info', '→ createOrder (fallback SDK client-side) | USD:', finalUSD);
              return actions.order.create({
                purchase_units: [{
                  amount: { currency_code: PAYPAL_CONFIG.currency, value: finalUSD },
                  description: desc.substring(0, 127)
                }],
                application_context: {
                  brand_name: 'Fixeo Maroc', locale: 'fr_FR', user_action: 'PAY_NOW'
                }
              });
            }
          },

          /* ── ÉTAPE 2 : Approbation & capture ── */
          onApprove: function (data, actions) {
            /* Anti-doublon local */
            if (_isDuplicateCapture(data.orderID)) {
              _log('warn', 'Capture dupliquée ignorée:', data.orderID);
              if (callbacks.onError) callbacks.onError('Paiement déjà traité.');
              return;
            }

            if (callbacks.onLoading) callbacks.onLoading('⏳ Validation du paiement en cours…');
            _log('info', '→ onApprove | orderID:', data.orderID, '| backendAvailable:', backendAvailable);

            if (backendAvailable) {
              /* ── FIX-V14-6 : Capture via /api/booking/capture (alias brief) ── */
              _log('info', '→ Capture via POST', PAYPAL_CONFIG.API_BASE + '/api/booking/capture');
              return fetch(PAYPAL_CONFIG.API_BASE + '/api/booking/capture', {
                method  : 'POST',
                headers : { 'Content-Type': 'application/json' },
                body    : JSON.stringify({
                  orderID    : data.orderID,
                  bookingData: bookingData
                })
              })
              .then(function (r) {
                _log('info', '/api/booking/capture HTTP status:', r.status);
                if (r.status === 409) throw new Error('Paiement déjà traité (doublon).');
                if (!r.ok) throw new Error('/api/booking/capture error: HTTP ' + r.status);
                return r.json();
              })
              .then(function (body) {
                _log('info', '/api/booking/capture réponse:', JSON.stringify(body));
                if (!body.success || body.status !== 'COMPLETED') {
                  throw new Error('Paiement non complété. Statut: ' + (body.status || 'inconnu'));
                }
                /* Marquer capturé */
                _markCaptured(data.orderID);

                _log('info', '✅ Paiement COMPLETED | txnId:', body.txnId, '| bookingRef:', body.bookingRef);

                /* Finaliser côté client */
                const record = _finalizePaymentLocal(
                  body.txnId,
                  data.orderID,
                  bookingData,
                  safeAmount,
                  body.commission,
                  body.netArtisan,
                  body.bookingRef
                );

                if (callbacks.onSuccess) callbacks.onSuccess(body.txnId, record);
              })
              .catch(function (err) {
                _log('error', 'Capture error (server):', err.message);
                /* Tentative fallback SDK si la capture server échoue */
                _log('warn', 'Tentative fallback SDK capture…');
                return actions.order.capture()
                  .then(function (details) {
                    if (details.status === 'COMPLETED') {
                      const txnId = (
                        details.purchase_units?.[0]?.payments?.captures?.[0]?.id
                      ) || details.id || data.orderID;
                      _markCaptured(data.orderID);
                      const record = _finalizePaymentLocal(txnId, data.orderID, bookingData, safeAmount);
                      if (callbacks.onSuccess) callbacks.onSuccess(txnId, record);
                    } else {
                      if (callbacks.onError) callbacks.onError(err.message);
                    }
                  })
                  .catch(function () {
                    if (callbacks.onError) callbacks.onError(err.message);
                  });
              });

            } else {
              /* Fallback : capture via SDK client-side */
              _log('info', '→ Capture fallback SDK client-side');
              return actions.order.capture()
                .then(function (details) {
                  _log('info', 'Capture SDK details:', JSON.stringify(details));
                  if (details.status !== 'COMPLETED') {
                    const errMsg = 'Paiement non complété (statut: ' + details.status + ').';
                    _log('warn', errMsg);
                    if (callbacks.onError) callbacks.onError(errMsg);
                    return;
                  }

                  const txnId = (
                    details.purchase_units?.[0]?.payments?.captures?.[0]?.id
                  ) || details.id || data.orderID;

                  _markCaptured(data.orderID);
                  _log('info', '✅ Capture SDK fallback | txnId:', txnId);

                  const record = _finalizePaymentLocal(txnId, data.orderID, bookingData, safeAmount);
                  if (callbacks.onSuccess) callbacks.onSuccess(txnId, record);
                })
                .catch(function (err) {
                  _log('error', 'Capture SDK error:', err);
                  if (callbacks.onError) {
                    callbacks.onError('Erreur capture: ' + (err.message || 'inconnue'));
                  }
                });
            }
          },

          onCancel: function (data) {
            _log('warn', 'Paiement annulé par l\'utilisateur:', data.orderID);
            if (callbacks.onCancel) callbacks.onCancel(data);
          },

          /* FIX-V14-3 : onError avec message lisible */
          onError: function (err) {
            const msg = err
              ? (typeof err === 'string' ? err : (err.message || JSON.stringify(err) || 'Erreur PayPal inconnue'))
              : 'Erreur PayPal inconnue';
            _log('error', 'SDK Error:', msg, err);
            if (callbacks.onError) callbacks.onError('Erreur PayPal: ' + msg);
          }
        });

        /* ── Render avec FIX-1 : pas de guard isEligible() ── */
        try {
          _buttonsInstances[containerId] = buttons;
          const renderPromise = buttons.render(container);
          if (renderPromise && typeof renderPromise.catch === 'function') {
            renderPromise.catch(function (err) {
              _log('error', 'render() error:', err);
              _showContainerError(container, 'Impossible d\'afficher le bouton PayPal. Rechargez la page.');
              if (callbacks.onError) callbacks.onError(err.message || 'Render error');
            });
          }
          _log('info', '✅ Boutons PayPal en cours de rendu dans', containerId);
        } catch (err) {
          _log('error', 'render() exception:', err);
          _showContainerError(container, 'Impossible d\'afficher le bouton PayPal.');
          if (callbacks.onError) callbacks.onError(err.message || 'Render exception');
        }
      })
      .catch(function (err) {
        _log('error', 'Init error:', err);
        _showContainerError(container, 'Impossible de charger PayPal. Vérifiez votre connexion.');
        if (callbacks.onError) callbacks.onError(err.message);
      });
  }

  /* ══════════════════════════════════════════════════════════
     FINALISATION PAIEMENT CÔTÉ CLIENT
     FIX-V14-9 : Slot lock actif + réservation marquée payée
  ══════════════════════════════════════════════════════════ */
  function _finalizePaymentLocal(txnId, orderId, bookingData, amount, commissionOverride, netArtisanOverride, bookingRefOverride) {
    const { commission, netArtisan } = commissionOverride !== undefined
      ? { commission: commissionOverride, netArtisan: netArtisanOverride }
      : _calcCommission(amount);

    const bookingRef = bookingRefOverride || _generateRef();
    const now        = new Date().toLocaleDateString('fr-FR');

    _log('info', '→ _finalizePaymentLocal | txn:', txnId, '| ref:', bookingRef, '| amount:', amount, 'MAD');

    /* 1. Enregistrer le paiement */
    const payRecord = {
      id              : txnId,
      orderId         : orderId,
      bookingRef      : bookingRef,
      type            : bookingData.isExpress ? 'express' : 'booking',
      paymentMethod   : 'PayPal',
      paymentMode     : 'sandbox',
      artisan         : bookingData.artisanName || '',
      artisanId       : bookingData.artisanId   || 0,
      service         : bookingData.service     || '',
      date            : bookingData.date        || now,
      timeSlot        : bookingData.timeSlot    || '',
      amount          : amount,
      commission      : commission,
      netArtisan      : netArtisan,
      currency        : 'MAD',
      transactionDate : now,
      timestamp       : Date.now(),
      status          : 'paid',
      payStatus       : 'paid'
    };

    try {
      const history = JSON.parse(localStorage.getItem('fixeo_payment_history') || '[]');
      history.unshift(payRecord);
      localStorage.setItem('fixeo_payment_history', JSON.stringify(history.slice(0, 50)));
      _log('info', 'Paiement sauvegardé dans fixeo_payment_history');
    } catch (e) { _log('warn', 'Impossible de sauvegarder le paiement:', e.message); }

    /* 2. Upsert réservation */
    _upsertReservation(txnId, bookingData, amount, commission, netArtisan, now, bookingRef);

    /* 3. FIX-V14-9 : Slot lock — verrouiller le créneau après paiement */
    if (window.FixeoSlotLock && typeof window.FixeoSlotLock.onReservationCreated === 'function') {
      try {
        window.FixeoSlotLock.onReservationCreated({
          artisanId  : bookingData.artisanId,
          artisanName: bookingData.artisanName,
          service    : bookingData.service,
          date       : bookingData.date,
          timeSlot   : bookingData.timeSlot || bookingData.time,
          paid       : true
        });
        _log('info', '✅ Slot lock activé pour artisan', bookingData.artisanId, 'date', bookingData.date);
      } catch (e) {
        _log('warn', 'Slot lock error:', e.message);
      }
    }

    /* 4. Dispatcher les événements */
    try {
      window.dispatchEvent(new CustomEvent('fixeo:payment:success', { detail: payRecord }));
      window.dispatchEvent(new CustomEvent('fixeo:paypal:paid',     { detail: payRecord }));
    } catch(e) {}

    /* 5. Exposer le dernier paiement */
    window._fixeoLastPayPalPayment = payRecord;

    _log('info', '✅ Finalisation complète | bookingRef:', bookingRef);
    return payRecord;
  }

  /* Upsert réservation dans localStorage */
  function _upsertReservation(txnId, bookingData, amount, commission, netArtisan, now, bookingRef) {
    const LS_KEY = 'fixeo_reservations';
    try {
      const reservations = JSON.parse(localStorage.getItem(LS_KEY) || '[]');

      const idx = reservations.findIndex(function (r) {
        return String(r.artisanId) === String(bookingData.artisanId) &&
               r.date === bookingData.date &&
               (r.time === bookingData.timeSlot || r.timeSlot === bookingData.timeSlot) &&
               (r.status === 'pending' || r.payStatus === 'pending_pay');
      });

      if (idx > -1) {
        reservations[idx].status     = 'confirmed';
        reservations[idx].payStatus  = 'paid';
        reservations[idx].method     = 'PayPal';
        reservations[idx].txnId      = txnId;
        reservations[idx].bookingRef = bookingRef;
        reservations[idx].commission = commission;
        reservations[idx].netArtisan = netArtisan;
        _log('info', 'Réservation existante mise à jour → paid (idx:', idx, ')');
      } else {
        reservations.unshift({
          id         : bookingRef || 'SL-' + Date.now().toString(36).toUpperCase(),
          artisanId  : bookingData.artisanId  || 0,
          artisan    : bookingData.artisanName || '',
          client     : bookingData.clientName || localStorage.getItem('fixeo_user_name') || 'Client',
          service    : bookingData.service    || '',
          date       : bookingData.date       || now,
          time       : bookingData.timeSlot   || bookingData.time || 'matin',
          status     : 'confirmed',
          payStatus  : 'paid',
          price      : amount,
          method     : 'PayPal',
          txnId      : txnId,
          bookingRef : bookingRef,
          commission : commission,
          netArtisan : netArtisan,
          type       : bookingData.isExpress ? 'express' : 'standard',
          createdAt  : now
        });
        _log('info', 'Nouvelle réservation créée → paid');
      }

      localStorage.setItem(LS_KEY, JSON.stringify(reservations));
    } catch (e) {
      _log('warn', '_upsertReservation error:', e.message);
    }
  }

  /* ══════════════════════════════════════════════════════════
     ANTI-DOUBLON
  ══════════════════════════════════════════════════════════ */
  function _isDuplicateCapture(orderId) {
    try {
      const captured = JSON.parse(sessionStorage.getItem('fixeo_pp_captured') || '[]');
      return captured.indexOf(orderId) > -1;
    } catch (e) { return false; }
  }

  function _markCaptured(orderId) {
    try {
      const captured = JSON.parse(sessionStorage.getItem('fixeo_pp_captured') || '[]');
      if (captured.indexOf(orderId) === -1) {
        captured.push(orderId);
        sessionStorage.setItem('fixeo_pp_captured', JSON.stringify(captured));
      }
    } catch (e) {}
  }

  /* ══════════════════════════════════════════════════════════
     UI HELPERS
  ══════════════════════════════════════════════════════════ */
  function _showContainerError(container, msg) {
    container.innerHTML = [
      '<div class="paypal-load-error">',
      '  <span class="paypal-error-icon">⚠️</span>',
      '  <p>' + _sanitize(msg) + '</p>',
      '  <small>Rechargez la page ou utilisez une autre méthode de paiement.</small>',
      '</div>'
    ].join('');
  }

  /* Affiche l'info sandbox buyer avant les boutons */
  function _showSandboxInfo(container, amount) {
    const usd = _madToUsd(amount);
    container.innerHTML = [
      '<div class="paypal-sandbox-hint" style="',
        'background:rgba(0,112,186,.08);',
        'border:1px solid rgba(0,112,186,.2);',
        'border-radius:10px;padding:12px 16px;margin-bottom:12px;',
        'font-size:.82rem;color:rgba(255,255,255,.7);line-height:1.5;">',
      '  <div style="font-weight:700;color:#009cde;margin-bottom:6px;">🅿️ PayPal Sandbox — Compte test</div>',
      '  <div>📧 Email : <strong style="color:#fff">sb-t9zf250014346@personal.example.com</strong></div>',
      '  <div>💰 Montant : <strong style="color:#20C997">' + amount + ' MAD ≈ ' + usd + ' USD</strong></div>',
      '  <div style="margin-top:6px;font-size:.75rem;color:rgba(255,255,255,.45);">',
      '    Le mot de passe est disponible dans votre PayPal Sandbox dashboard.',
      '  </div>',
      '</div>',
      '<div id="' + container.id + '-btns" style="min-height:55px;">',
      '  <div class="paypal-sdk-loading">',
      '    <div class="paypal-sdk-spinner"></div>',
      '    <span>Chargement du bouton PayPal…</span>',
      '  </div>',
      '</div>'
    ].join('');

    /* Le render doit aller dans le sous-div, pas dans container directement */
    /* On récupère ce div dans renderButtons — override container ref */
    const innerDiv = container.querySelector('[id$="-btns"]');
    if (innerDiv) {
      /* Pointer le render sur le div interne */
      container._paypalTarget = innerDiv;
    }
  }

  /* Override render target si _paypalTarget défini */
  const _origRenderButtons = renderButtons;

  /* ══════════════════════════════════════════════════════════
     FONCTION PUBLIQUE : renderPayPalOnPage
     Rend les boutons PayPal directement sur la homepage/checkout
     sans passer par la modal de paiement
  ══════════════════════════════════════════════════════════ */
  function renderPayPalOnPage(containerId, options) {
    options = options || {};
    const bookingData = {
      service    : options.service     || 'Service Fixeo',
      artisanName: options.artisanName || 'Fixeo Maroc',
      artisanId  : options.artisanId   || 0,
      date       : options.date        || new Date().toLocaleDateString('fr-FR'),
      timeSlot   : options.timeSlot    || 'matin',
      _total     : options.amount      || 10,
      price      : options.amount      || 10,
      isExpress  : !!options.isExpress,
      clientName : options.clientName  || localStorage.getItem('fixeo_user_name') || 'Client'
    };

    renderButtons(containerId, bookingData, {
      onLoading: function(msg) {
        const msgEl = document.getElementById(containerId + '-msg');
        if (msgEl) { msgEl.className = 'paypal-msg-box loading show'; msgEl.textContent = msg; }
        _log('info', 'Loading:', msg);
      },
      onSuccess: function(txnId, record) {
        _log('info', '✅ Paiement réussi:', txnId, '| ref:', record.bookingRef);
        /* Message visuel succès */
        const msgEl = document.getElementById(containerId + '-msg');
        if (msgEl) {
          msgEl.className = 'paypal-msg-box success show';
          msgEl.innerHTML = '✅ Paiement confirmé ! Référence : <strong>' + record.bookingRef + '</strong>';
        }
        /* FIX-V14-7 : Redirect vers dashboard-client.html après 2s */
        if (options.onSuccess) {
          options.onSuccess(txnId, record);
        } else {
          setTimeout(function() {
            window.location.href = PAYPAL_CONFIG.DASHBOARD_URL;
          }, 2000);
        }
      },
      onCancel: function(data) {
        _log('warn', 'Annulé:', data);
        const msgEl = document.getElementById(containerId + '-msg');
        if (msgEl) {
          msgEl.className = 'paypal-msg-box warning show';
          msgEl.textContent = '⚠️ Paiement annulé. Vous pouvez réessayer.';
        }
        if (options.onCancel) options.onCancel(data);
      },
      onError: function(errMsg) {
        _log('error', 'Erreur paiement:', errMsg);
        const msgEl = document.getElementById(containerId + '-msg');
        if (msgEl) {
          msgEl.className = 'paypal-msg-box error show';
          msgEl.textContent = '❌ ' + errMsg;
        }
        if (options.onError) options.onError(errMsg);
      }
    });
  }

  /* ══════════════════════════════════════════════════════════
     API PUBLIQUE
  ══════════════════════════════════════════════════════════ */
  window.FixeoPayPal = {
    /* Core */
    loadSDK             : loadSDK,
    renderButtons       : renderButtons,
    renderPayPalOnPage  : renderPayPalOnPage,
    /* Utils */
    calcCommission      : _calcCommission,
    madToUsd            : _madToUsd,
    CONFIG              : PAYPAL_CONFIG,
    /* Status */
    getBackendStatus    : function () { return _backendOk; },
    checkBackend        : _checkBackend,
    /* FIX-2 : exposer la fermeture manuelle */
    closeButtons        : _closePreviousButtons,
    /* Debug */
    getLastPayment      : function() {
      try { return JSON.parse(localStorage.getItem('fixeo_payment_history')||'[]')[0] || null; }
      catch(e){ return null; }
    }
  };

  /* ══════════════════════════════════════════════════════════
     AUTO-INIT : Si #paypal-button-container existe et
     data-paypal-auto="true", rendre automatiquement
  ══════════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', function() {
    const autoContainers = document.querySelectorAll('[data-paypal-auto="true"]');
    autoContainers.forEach(function(el) {
      const amount  = parseFloat(el.getAttribute('data-amount')  || '10');
      const service = el.getAttribute('data-service') || 'Service Fixeo';
      _log('info', 'Auto-render PayPal dans', el.id, '| amount:', amount);
      renderPayPalOnPage(el.id, { amount: amount, service: service });
    });
  });

  _log('info', '✅ FixeoPayPal V14 Ultimate initialisé | API_BASE:', PAYPAL_CONFIG.API_BASE);

})(window);
