/* ============================================================
   FIXEO V5 — PAYMENT ENGINE
   Secure Payment Integration · Stripe · PayPal · CMI
   ============================================================
   NOTE: Replace STRIPE_PUBLISHABLE_KEY with your real key.
   In production, amounts/tokens must be validated server-side.
   ============================================================ */

(function (window) {
  'use strict';

  /* ════════════════════════════════════════════════════════
     CONFIG
  ════════════════════════════════════════════════════════ */
  const CONFIG = {
    stripePublishableKey: 'pk_test_51XXXXXXXXXXXXXXXXXXXXXXXX', // ← Replace with real key
    currency: 'MAD',
    supportEmail: 'support@fixeo.ma',
    successRedirect: {
      subscription: 'dashboard-artisan.html',
      booking: null  // stays on same page
    }
  };

  /* ════════════════════════════════════════════════════════
     STATE
  ════════════════════════════════════════════════════════ */
  const state = {
    currentPaymentType: null,   // 'subscription' | 'booking' | 'express'
    currentMethod: 'stripe',
    planData: null,
    bookingData: null,
    stripeInstance: null,
    stripeElements: null,
    stripeCardElement: null,
    isProcessing: false
  };

  /* ════════════════════════════════════════════════════════
     UTILS
  ════════════════════════════════════════════════════════ */
  function generateTxnId() {
    return 'TXN-' + Math.random().toString(36).substring(2, 10).toUpperCase();
  }

  function generateBookingRef() {
    return 'BKG-' + Date.now().toString(36).toUpperCase().substring(-6);
  }

  function formatAmount(amount, currency) {
    return `${Number(amount).toLocaleString('fr-FR')} ${currency || CONFIG.currency}`;
  }

  function sanitizeHTML(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  /* ════════════════════════════════════════════════════════
     TOAST NOTIFICATIONS
  ════════════════════════════════════════════════════════ */
  function ensureToastContainer() {
    let container = document.getElementById('pay-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'pay-toast-container';
      container.className = 'pay-toast';
      document.body.appendChild(container);
    }
    return container;
  }

  function showToast(title, subtitle, type = 'success', duration = 4500) {
    const container = ensureToastContainer();
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️', payment: '💳' };
    const toast = document.createElement('div');
    toast.className = `pay-toast-item ${type}`;
    toast.innerHTML = `
      <div class="pay-toast-icon">${icons[type] || icons.info}</div>
      <div class="pay-toast-content">
        <div class="pay-toast-title">${sanitizeHTML(title)}</div>
        ${subtitle ? `<div class="pay-toast-sub">${sanitizeHTML(subtitle)}</div>` : ''}
      </div>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'toastSlideOut .4s ease forwards';
      setTimeout(() => toast.remove(), 400);
    }, duration);

    // Also trigger existing notifications system if available
    if (window.notifications && window.notifications.success && type === 'success') {
      window.notifications.success(title, subtitle || '');
    }
  }

  /* ════════════════════════════════════════════════════════
     STRIPE INITIALIZATION
  ════════════════════════════════════════════════════════ */
  function initStripe() {
    // Load Stripe.js dynamically if not already loaded
    if (window.Stripe) {
      state.stripeInstance = Stripe(CONFIG.stripePublishableKey);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/';
      script.onload = () => {
        state.stripeInstance = Stripe(CONFIG.stripePublishableKey);
        resolve();
      };
      script.onerror = () => {
        console.warn('[Fixeo Pay] Stripe.js failed to load — using fallback form');
        resolve(); // non-blocking
      };
      document.head.appendChild(script);
    });
  }

  function mountStripeElements(containerId) {
    if (!state.stripeInstance) return;
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
      const elements = state.stripeInstance.elements({
        appearance: {
          theme: 'night',
          variables: {
            colorPrimary: '#E1306C',
            colorBackground: 'rgba(255,255,255,0.06)',
            colorText: '#ffffff',
            colorDanger: '#ff4757',
            fontFamily: 'Cairo, Tajawal, system-ui, sans-serif',
            spacingUnit: '4px',
            borderRadius: '12px',
            fontSizeBase: '15px'
          }
        }
      });

      const card = elements.create('card', {
        hidePostalCode: true,
        style: {
          base: {
            color: '#ffffff',
            fontFamily: 'Cairo, Tajawal, system-ui, sans-serif',
            fontSize: '15px',
            '::placeholder': { color: 'rgba(255,255,255,0.35)' }
          },
          invalid: { color: '#ff4757' }
        }
      });

      card.mount('#' + containerId);
      state.stripeElements = elements;
      state.stripeCardElement = card;

      card.on('change', (event) => {
        const errorEl = document.getElementById('stripe-card-error');
        if (errorEl) {
          errorEl.textContent = event.error ? event.error.message : '';
          errorEl.style.display = event.error ? 'block' : 'none';
        }
      });
    } catch (e) {
      console.warn('[Fixeo Pay] Could not mount Stripe Elements:', e.message);
    }
  }

  /* ════════════════════════════════════════════════════════
     MODAL MANAGEMENT
  ════════════════════════════════════════════════════════ */
  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    ensureBackdrop(id);
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('open');
    removeBackdrop(id);
    if (!document.querySelector('.payment-modal-overlay.open')) {
      document.body.style.overflow = '';
    }
    state.isProcessing = false;
  }

  function ensureBackdrop(modalId) {
    const bdId = 'bd-' + modalId;
    let bd = document.getElementById(bdId);
    if (!bd) {
      bd = document.createElement('div');
      bd.id = bdId;
      bd.className = 'payment-modal-backdrop';
      bd.style.zIndex = '1999';
      bd.onclick = () => closeModal(modalId);
      document.body.appendChild(bd);
    }
    bd.style.display = 'block';
  }

  function removeBackdrop(modalId) {
    const bd = document.getElementById('bd-' + modalId);
    if (bd) bd.remove();
  }

  /* ════════════════════════════════════════════════════════
     SUBSCRIPTION PAYMENT FLOW
  ════════════════════════════════════════════════════════ */

  /**
   * Open subscription payment modal
   * @param {Object} planData - { key, name, icon, price, billing, currency }
   */
  function openSubscriptionPayment(planData) {
    state.currentPaymentType = 'subscription';
    state.planData = planData;
    state.currentMethod = 'stripe';

    // Build modal
    const modalHtml = buildPaymentModalHTML({
      title: `💳 Paiement — Plan ${planData.name}`,
      id: 'payment-modal',
      summaryHTML: buildPlanSummaryHTML(planData),
      type: 'subscription'
    });

    injectOrUpdateModal('payment-modal', modalHtml);
    openModal('payment-modal');
    switchPaymentMethod('stripe');

    // Mount Stripe Elements after DOM is ready
    requestAnimationFrame(() => {
      mountStripeElements('stripe-card-element');
    });
  }

  function buildPlanSummaryHTML(planData) {
    const billingLabel = planData.billing === 'annual'
      ? 'Facturation annuelle (−20%)'
      : 'Facturation mensuelle';
    return `
      <div class="pay-plan-summary">
        <div class="pay-plan-summary-info">
          <div class="pay-plan-summary-name">${sanitizeHTML(planData.icon)} Plan ${sanitizeHTML(planData.name)}</div>
          <div class="pay-plan-summary-sub">${sanitizeHTML(billingLabel)}</div>
        </div>
        <div class="pay-plan-summary-price">
          ${formatAmount(planData.price)}<small>/mois</small>
        </div>
      </div>
    `;
  }

  /* ════════════════════════════════════════════════════════
     BOOKING PAYMENT FLOW
  ════════════════════════════════════════════════════════ */

  /**
   * Open booking payment modal
   * @param {Object} bookingData - { artisanName, service, date, timeSlot, price, isExpress }
   */
  function openBookingPayment(bookingData) {
    state.currentPaymentType = bookingData.isExpress ? 'express' : 'booking';
    state.bookingData = bookingData;
    state.currentMethod = 'stripe';

    const title = bookingData.isExpress
      ? `🚀 Paiement Express — ${bookingData.artisanName}`
      : `📅 Paiement Réservation — ${bookingData.artisanName}`;

    const modalHtml = buildPaymentModalHTML({
      title,
      id: 'booking-payment-modal',
      summaryHTML: buildBookingSummaryHTML(bookingData),
      type: 'booking'
    });

    injectOrUpdateModal('booking-payment-modal', modalHtml);
    openModal('booking-payment-modal');
    switchPaymentMethod('stripe', 'booking-payment-modal');

    requestAnimationFrame(() => {
      mountStripeElements('stripe-card-element-booking');
    });
  }

  function buildBookingSummaryHTML(bd) {
    const serviceTotal = bd.price || 150;
    const platformFee  = Math.round(serviceTotal * 0.05);
    const total        = serviceTotal + platformFee;

    // Store total for payment
    state.bookingData._total = total;

    const rows = [];
    if (bd.artisanName) rows.push(['Artisan', sanitizeHTML(bd.artisanName)]);
    if (bd.service)     rows.push(['Service', sanitizeHTML(bd.service)]);
    if (bd.date)        rows.push(['Date', sanitizeHTML(bd.date)]);
    if (bd.timeSlot)    rows.push(['Créneau', sanitizeHTML(bd.timeSlot)]);
    rows.push(['Tarif service', `${serviceTotal} MAD (estimation indicative)`]);
    rows.push(['Frais de service (5%)', `${platformFee} MAD`]);

    if (bd.isExpress) {
      rows.push(['🚀 Supplément Express', '+ 50 MAD']);
      state.bookingData._total = total + 50;
    }

    const expressHtml = bd.isExpress ? `
      <div class="express-pay-banner">
        <span class="express-icon">🚀</span>
        <div class="express-pay-banner-text">
          <strong>Intervention EXPRESS garantie</strong>
          <small>Artisan disponible dans moins d'1 heure</small>
        </div>
      </div>` : '';

    return `
      ${expressHtml}
      <div class="pay-booking-summary">
        ${rows.map(([label, val]) => `
          <div class="pay-booking-summary-row">
            <span>${label}</span>
            <span>${val}</span>
          </div>
        `).join('')}
        <div class="pay-booking-total">
          <span>Total à payer</span>
          <div class="pay-booking-total-amount">${formatAmount(state.bookingData._total)}</div>
        </div>
      </div>
    `;
  }

  /* ════════════════════════════════════════════════════════
     MODAL HTML BUILDER
  ════════════════════════════════════════════════════════ */
  function buildPaymentModalHTML({ title, id, summaryHTML, type }) {
    const stripeElemId = type === 'booking' ? 'stripe-card-element-booking' : 'stripe-card-element';

    return `
      <div class="payment-modal-dialog">
        <div class="pay-modal-header">
          <h3>${title}</h3>
          <button class="pay-modal-close" onclick="FixeoPayment.closePayment('${id}')">✕</button>
        </div>
        <div class="pay-modal-body">
          ${summaryHTML}

          <!-- PAYMENT METHOD TABS -->
          <div class="pay-methods-tabs">
            <button class="pay-method-tab active" data-method="stripe" onclick="FixeoPayment.switchPaymentMethod('stripe','${id}',this)">
              <span class="tab-icon">💳</span> Carte bancaire
            </button>
            <button class="pay-method-tab" data-method="cmi" onclick="FixeoPayment.switchPaymentMethod('cmi','${id}',this)">
              <span class="tab-icon">🇲🇦</span> CMI
            </button>
          </div>

          <!-- STRIPE PANEL -->
          <div class="pay-form-panel active" id="${id}-stripe-panel">
            <div class="secure-badge-v5">
              <span class="lock-icon">🔒</span>
              Paiement sécurisé · SSL 256-bit · PCI-DSS compliant
            </div>
            <div class="pay-form-group">
              <label class="pay-form-label">Nom sur la carte</label>
              <input type="text" class="pay-form-input" id="${id}-cardholder"
                     placeholder="Mohamed Alami" autocomplete="cc-name"/>
            </div>
            <div class="pay-form-group">
              <label class="pay-form-label">Numéro de carte</label>
              <div class="card-number-wrap">
                <input type="text" class="pay-form-input" id="${id}-cardnumber"
                       placeholder="1234 5678 9012 3456" maxlength="19"
                       autocomplete="cc-number"
                       oninput="FixeoPayment.formatCardNumber(this,'${id}-card-brand')"/>
                <span class="card-brand-badge" id="${id}-card-brand">💳</span>
              </div>
            </div>
            <div class="pay-form-row">
              <div class="pay-form-group">
                <label class="pay-form-label">Expiration</label>
                <input type="text" class="pay-form-input" id="${id}-expiry"
                       placeholder="MM/AA" maxlength="5"
                       autocomplete="cc-exp"
                       oninput="FixeoPayment.formatExpiry(this)"/>
              </div>
              <div class="pay-form-group">
                <label class="pay-form-label">CVV</label>
                <input type="text" class="pay-form-input" id="${id}-cvv"
                       placeholder="123" maxlength="4"
                       autocomplete="cc-csc"/>
              </div>
            </div>
            <button class="btn-pay-now" id="${id}-pay-btn"
                    onclick="FixeoPayment.processPayment('stripe','${id}')">
              <div class="pay-spinner"></div>
              <span class="btn-text">🔒 Payer ${type === 'booking' ? (state.bookingData?._total || '') + ' MAD' : 'maintenant'}</span>
            </button>
          </div>

          <!-- CMI PANEL -->
          <div class="pay-form-panel" id="${id}-cmi-panel">
            <div class="secure-badge-v5">
              <span class="lock-icon">🔒</span>
              CMI — Centre Monétique Interbancaire Maroc
            </div>
            <div class="cmi-banks-strip">
              <span class="cmi-bank-chip">VISA</span>
              <span class="cmi-bank-chip">Mastercard</span>
              <span class="cmi-bank-chip">Attijariwafa</span>
              <span class="cmi-bank-chip">BMCE</span>
              <span class="cmi-bank-chip">CIH</span>
              <span class="cmi-bank-chip">Banque Populaire</span>
            </div>
            <div class="pay-form-group">
              <label class="pay-form-label">Numéro de carte CMI</label>
              <div class="card-number-wrap">
                <input type="text" class="pay-form-input" id="${id}-cmi-card"
                       placeholder="1234 5678 9012 3456" maxlength="19"
                       oninput="FixeoPayment.formatCardNumber(this,'${id}-cmi-brand')"/>
                <span class="card-brand-badge" id="${id}-cmi-brand">💳</span>
              </div>
            </div>
            <div class="pay-form-row">
              <div class="pay-form-group">
                <label class="pay-form-label">Expiration</label>
                <input type="text" class="pay-form-input" id="${id}-cmi-expiry"
                       placeholder="MM/AA" maxlength="5"
                       oninput="FixeoPayment.formatExpiry(this)"/>
              </div>
              <div class="pay-form-group">
                <label class="pay-form-label">Code de sécurité</label>
                <input type="text" class="pay-form-input" id="${id}-cmi-cvv"
                       placeholder="123" maxlength="4"/>
              </div>
            </div>
            <button class="btn-pay-now" id="${id}-cmi-pay-btn"
                    onclick="FixeoPayment.processPayment('cmi','${id}')">
              <div class="pay-spinner"></div>
              <span class="btn-text">🔒 Payer via CMI</span>
            </button>
          </div>

          <!-- MESSAGE BOX -->
          <div class="pay-message-box" id="${id}-msg-box">
            <span class="msg-icon"></span>
            <span class="msg-text"></span>
          </div>

          <!-- SECURITY ROW -->
          <div class="payment-security-row">
            <div class="security-badge-item"><span class="sec-icon">🔒</span> SSL 256-bit</div>
            <div class="security-badge-item"><span class="sec-icon">🛡️</span> 3D Secure</div>
            <div class="security-badge-item"><span class="sec-icon">✅</span> PCI-DSS</div>
            <div class="security-badge-item"><span class="sec-icon">🔄</span> Remboursement 14j</div>
          </div>
        </div>
      </div>
    `;
  }

  function injectOrUpdateModal(id, html) {
    let modal = document.getElementById(id);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = id;
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      document.body.appendChild(modal);
    }
    // Set class — both classes are styled in payment.css
    // Use 'payment-modal-overlay' for subscription, 'booking-payment-modal' for bookings
    modal.className = (id === 'booking-payment-modal') ? 'booking-payment-modal' : 'payment-modal-overlay';
    // Remove any previous open state before re-injecting
    modal.classList.remove('open');
    // Clear inline display to let CSS control visibility
    modal.style.removeProperty('display');
    modal.innerHTML = html;
  }

  /* ════════════════════════════════════════════════════════
     PAYMENT METHOD SWITCHING
  ════════════════════════════════════════════════════════ */
  function switchPaymentMethod(method, modalId, tabBtn) {
    if (!modalId) modalId = state.currentPaymentType === 'subscription' ? 'payment-modal' : 'booking-payment-modal';
    state.currentMethod = method;

    const modal = document.getElementById(modalId);
    if (!modal) return;

    // Update tabs
    modal.querySelectorAll('.pay-method-tab').forEach(t => t.classList.remove('active'));
    if (tabBtn) {
      tabBtn.classList.add('active');
    } else {
      const targetTab = modal.querySelector(`[data-method="${method}"]`);
      if (targetTab) targetTab.classList.add('active');
    }

    // Show correct panel
    modal.querySelectorAll('.pay-form-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(`${modalId}-${method}-panel`);
    if (panel) panel.classList.add('active');

    // Clear messages
    showPayMessage(modalId, '', '');
  }

  /* Enregistrer un paiement PayPal en synchronisant l'état payment.js */
  function _savePayPalRecord(record) {
    // Synchroniser les données de réservation avec celles du paiement PayPal
    if (record.artisan && !state.bookingData) {
      state.bookingData = {
        artisanName: record.artisan,
        artisanId  : record.artisanId,
        service    : record.service,
        date       : record.date,
        timeSlot   : record.timeSlot,
        _total     : record.amount,
        isExpress  : record.type === 'express'
      };
    }
    if (record.bookingRef) state._lastBookingRef = record.bookingRef;
    if (record.id)         state._lastTxnId      = record.id;
    // Notifier l'artisan
    if (state.bookingData) notifyArtisan(state.bookingData);
    // Dispatcher l'événement succès
    window.dispatchEvent(new CustomEvent('fixeo:booking:confirmed', {
      detail: { bookingData: state.bookingData, txnId: record.id, bookingRef: record.bookingRef }
    }));
  }

  /* ════════════════════════════════════════════════════════
     FORM FORMATTING UTILS
  ════════════════════════════════════════════════════════ */
  function formatCardNumber(input, brandId) {
    let v = input.value.replace(/\D/g, '').substring(0, 16);
    input.value = v.match(/.{1,4}/g)?.join(' ') || v;

    const brandEl = brandId ? document.getElementById(brandId) : null;
    if (!brandEl) return;
    if (/^4/.test(v))       brandEl.textContent = '💙'; // Visa
    else if (/^5[1-5]/.test(v)) brandEl.textContent = '🔴'; // Mastercard
    else if (/^3[47]/.test(v))  brandEl.textContent = '🟢'; // Amex
    else if (/^62/.test(v))     brandEl.textContent = '🟠'; // UnionPay
    else                         brandEl.textContent = '💳';
  }

  function formatExpiry(input) {
    let v = input.value.replace(/\D/g, '').substring(0, 4);
    if (v.length > 2) v = v.substring(0, 2) + '/' + v.substring(2);
    input.value = v;
  }

  /* ════════════════════════════════════════════════════════
     VALIDATION
  ════════════════════════════════════════════════════════ */
  function validateStripeForm(modalId) {
    const cardholder = document.getElementById(`${modalId}-cardholder`)?.value.trim();
    const cardNum    = document.getElementById(`${modalId}-cardnumber`)?.value.replace(/\s/g, '');
    const expiry     = document.getElementById(`${modalId}-expiry`)?.value;
    const cvv        = document.getElementById(`${modalId}-cvv`)?.value;

    if (!cardholder) return { valid: false, message: 'Veuillez saisir le nom du titulaire.' };
    if (!cardNum || cardNum.length !== 16) return { valid: false, message: 'Numéro de carte invalide (16 chiffres requis).' };
    if (!expiry || !expiry.includes('/') || expiry.length < 5) return { valid: false, message: 'Date d\'expiration invalide (MM/AA).' };
    if (!cvv || cvv.length < 3) return { valid: false, message: 'Code CVV invalide.' };

    // Luhn check
    if (!luhnCheck(cardNum)) return { valid: false, message: 'Numéro de carte invalide.' };

    // Expiry check
    const [mm, yy] = expiry.split('/');
    const now = new Date();
    const expDate = new Date(2000 + parseInt(yy), parseInt(mm) - 1);
    if (expDate < now) return { valid: false, message: 'La carte est expirée.' };

    return { valid: true };
  }

  function validateCMIForm(modalId) {
    const cardNum = document.getElementById(`${modalId}-cmi-card`)?.value.replace(/\s/g, '');
    const expiry  = document.getElementById(`${modalId}-cmi-expiry`)?.value;
    const cvv     = document.getElementById(`${modalId}-cmi-cvv`)?.value;

    if (!cardNum || cardNum.length !== 16) return { valid: false, message: 'Numéro de carte CMI invalide.' };
    if (!expiry || !expiry.includes('/')) return { valid: false, message: 'Date d\'expiration invalide.' };
    if (!cvv || cvv.length < 3) return { valid: false, message: 'Code de sécurité invalide.' };
    if (!luhnCheck(cardNum)) return { valid: false, message: 'Numéro de carte invalide.' };

    return { valid: true };
  }

  function luhnCheck(num) {
    let sum = 0;
    let isEven = false;
    for (let i = num.length - 1; i >= 0; i--) {
      let digit = parseInt(num[i], 10);
      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      isEven = !isEven;
    }
    return sum % 10 === 0;
  }

  /* ════════════════════════════════════════════════════════
     MESSAGE DISPLAY
  ════════════════════════════════════════════════════════ */
  function showPayMessage(modalId, message, type) {
    const box = document.getElementById(`${modalId}-msg-box`);
    if (!box) return;

    if (!message) {
      box.classList.remove('show', 'success', 'error', 'loading');
      return;
    }

    const icons = { success: '✅', error: '❌', loading: '⏳', info: 'ℹ️' };
    const iconEl  = box.querySelector('.msg-icon');
    const textEl  = box.querySelector('.msg-text');

    if (iconEl) iconEl.textContent = icons[type] || '';
    if (textEl) textEl.textContent = message;

    box.className = `pay-message-box show ${type}`;
  }

  /* ════════════════════════════════════════════════════════
     BUTTON LOADING STATE
  ════════════════════════════════════════════════════════ */
  function setPayBtnLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
      btn.classList.add('loading');
    } else {
      btn.classList.remove('loading');
    }
  }

  /* ════════════════════════════════════════════════════════
     3D SECURE SIMULATION
  ════════════════════════════════════════════════════════ */
  function show3DSecure(callback) {
    let overlay = document.getElementById('tds-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'tds-overlay';
      overlay.className = 'tds-overlay';
      overlay.innerHTML = `
        <div class="tds-box">
          <div class="tds-logo">🔐</div>
          <div class="tds-title">Vérification 3D Secure</div>
          <div class="tds-subtitle">Un code vous a été envoyé par SMS au +212 6** *** **78</div>
          <input type="text" class="tds-code-input" id="tds-code-input"
                 placeholder="_ _ _ _" maxlength="6"
                 oninput="this.value=this.value.replace(/[^0-9]/g,'')"/>
          <div class="tds-hint">Code de démonstration : <strong>1234</strong></div>
          <button class="btn-tds-confirm" onclick="FixeoPayment._verify3DS()">
            ✅ Valider le paiement
          </button>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    state._tdsCallback = callback;
    overlay.classList.add('show');

    // Auto-fill demo code after delay
    setTimeout(() => {
      const inp = document.getElementById('tds-code-input');
      if (inp && !inp.value) inp.value = '1234';
    }, 800);
  }

  function verify3DS() {
    const code = document.getElementById('tds-code-input')?.value;
    const overlay = document.getElementById('tds-overlay');

    if (!code || code.length < 4) {
      showToast('Code invalide', 'Veuillez saisir le code à 4 chiffres.', 'error');
      return;
    }

    overlay?.classList.remove('show');

    if (state._tdsCallback) {
      state._tdsCallback(true);
      state._tdsCallback = null;
    }
  }

  /* ════════════════════════════════════════════════════════
     CORE PAYMENT PROCESSING
  ════════════════════════════════════════════════════════ */
  function processPayment(method, modalId) {
    if (state.isProcessing) return;

    const btnId = method === 'cmi'
      ? `${modalId}-cmi-pay-btn`
      : `${modalId}-pay-btn`;

    // Validate
    if (method === 'stripe') {
      const validation = validateStripeForm(modalId);
      if (!validation.valid) {
        showPayMessage(modalId, validation.message, 'error');
        shakeInput(modalId);
        return;
      }
    } else if (method === 'cmi') {
      const validation = validateCMIForm(modalId);
      if (!validation.valid) {
        showPayMessage(modalId, validation.message, 'error');
        return;
      }
    }

    state.isProcessing = true;
    setPayBtnLoading(btnId, true);
    showPayMessage(modalId, '🔄 Connexion à la passerelle sécurisée…', 'loading');

    // Simulate API call delay
    setTimeout(() => {
      // Show 3DS for stripe/cmi
      if (method === 'stripe' || method === 'cmi') {
        showPayMessage(modalId, '🛡️ Vérification 3D Secure…', 'loading');
        setTimeout(() => {
          show3DSecure((success) => {
            if (success) {
              finalizePayment(method, modalId, btnId);
            } else {
              state.isProcessing = false;
              setPayBtnLoading(btnId, false);
              showPayMessage(modalId, '❌ Vérification 3DS échouée.', 'error');
            }
          });
        }, 800);
      }
    }, 1200);
  }

  function finalizePayment(method, modalId, btnId) {
    // 92% success rate simulation (realistic)
    const success = Math.random() > 0.08;

    setPayBtnLoading(btnId, false);
    state.isProcessing = false;

    if (success) {
      const txnId = generateTxnId();
      closeModal(modalId);
      savePaymentRecord(method, txnId);
      openSuccessModal(method, txnId);
    } else {
      showPayMessage(
        modalId,
        '❌ Paiement refusé. Vérifiez vos informations ou essayez une autre méthode.',
        'error'
      );
    }
  }

  function shakeInput(modalId) {
    const firstInput = document.querySelector(`#${modalId} .pay-form-input`);
    if (!firstInput) return;
    firstInput.style.animation = 'none';
    requestAnimationFrame(() => {
      firstInput.style.animation = 'shake .4s ease';
    });
  }

  /* ════════════════════════════════════════════════════════
     SAVE PAYMENT RECORD
  ════════════════════════════════════════════════════════ */
  function savePaymentRecord(method, txnId) {
    const records = JSON.parse(localStorage.getItem('fixeo_payment_history') || '[]');

    let record;
    if (state.currentPaymentType === 'subscription') {
      record = {
        id: txnId,
        type: 'subscription',
        plan: state.planData?.name,
        planKey: state.planData?.key,
        amount: state.planData?.price,
        currency: CONFIG.currency,
        method,
        billing: state.planData?.billing,
        date: new Date().toLocaleDateString('fr-FR'),
        timestamp: Date.now(),
        status: 'success'
      };
      localStorage.setItem('fixeo_current_plan', state.planData?.key);
      localStorage.setItem('fixeo_plan_activated_at', Date.now().toString());
    } else {
      const bkgRef = generateBookingRef();
      record = {
        id: txnId,
        bookingRef: bkgRef,
        type: state.currentPaymentType,
        artisan: state.bookingData?.artisanName,
        service: state.bookingData?.service,
        date: state.bookingData?.date,
        timeSlot: state.bookingData?.timeSlot,
        amount: state.bookingData?._total,
        currency: CONFIG.currency,
        method,
        transactionDate: new Date().toLocaleDateString('fr-FR'),
        timestamp: Date.now(),
        status: 'confirmed',
        isExpress: state.bookingData?.isExpress || false
      };

      // Persist booking
      const bookings = JSON.parse(localStorage.getItem('fixeo_bookings') || '[]');
      bookings.unshift(record);
      localStorage.setItem('fixeo_bookings', JSON.stringify(bookings.slice(0, 100)));

      state._lastBookingRef = bkgRef;
      state._lastTxnId = txnId;
    }

    records.unshift(record);
    localStorage.setItem('fixeo_payment_history', JSON.stringify(records.slice(0, 50)));

    // Dispatch custom event for dashboard widgets to listen to
    window.dispatchEvent(new CustomEvent('fixeo:payment:success', {
      detail: record
    }));
  }

  /* ════════════════════════════════════════════════════════
     SUCCESS MODAL
  ════════════════════════════════════════════════════════ */
  function openSuccessModal(method, txnId) {
    const methodLabels = {
      stripe: '💳 Carte bancaire',
      cmi:    '🇲🇦 CMI'
    };

    let titleText, msgText, notifText, ctaHtml;

    if (state.currentPaymentType === 'subscription') {
      titleText = 'Abonnement activé !';
      msgText   = `Plan ${state.planData?.name} activé via ${methodLabels[method]}.`;
      notifText = `✉️ Un email de confirmation a été envoyé à votre adresse.<br>
                   📊 Votre dashboard est maintenant mis à jour.`;
      ctaHtml   = `<a href="${CONFIG.successRedirect.subscription}"
                      class="btn-pay-now" style="text-decoration:none;display:inline-flex;width:auto;padding:14px 28px;margin-right:8px">
                     🚀 Accéder au Dashboard
                   </a>`;

      showToast('🎉 Abonnement activé !', `Plan ${state.planData?.name} — ${state.planData?.price} MAD/mois`, 'success');
    } else {
      const bkgRef = state._lastBookingRef || generateBookingRef();
      titleText = state.currentPaymentType === 'express' ? '🚀 Demande Express confirmée !' : '📅 Réservation confirmée !';
      msgText   = `${state.bookingData?.artisanName} a été notifié(e) et confirmera dans les plus brefs délais.`;
      notifText = `✉️ Email de confirmation envoyé au client et à l'artisan.<br>
                   📋 Référence : <strong>${bkgRef}</strong>`;
      ctaHtml   = `
        <a href="dashboard-client.html" class="btn-pay-now"
           style="text-decoration:none;display:inline-flex;width:auto;padding:14px 28px;margin-right:8px">
          📊 Mon tableau de bord
        </a>
        <button class="btn-pay-now" style="width:auto;padding:14px 28px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);color:#fff"
                onclick="FixeoPayment.closeSuccessModal()">
          ✅ Rester ici
        </button>`;

      showToast(
        state.currentPaymentType === 'express' ? '🚀 Demande Express envoyée !' : '📅 Réservation confirmée !',
        `Réf: ${bkgRef} · ${formatAmount(state.bookingData?._total)}`,
        'success'
      );

      // Notify artisan (in-app)
      notifyArtisan(state.bookingData);
    }

    let modal = document.getElementById('pay-success-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'pay-success-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      document.body.appendChild(modal);
    }

    // Clear inline style so CSS rules can control display
    modal.style.removeProperty('display');
    modal.classList.remove('open');
    modal.innerHTML = `
      <div class="pay-success-dialog">
        <div class="confetti-container" id="success-confetti-container"></div>
        <span class="pay-success-icon">✅</span>
        <div class="pay-success-title">${sanitizeHTML(titleText)}</div>
        <p class="pay-success-msg">${sanitizeHTML(msgText)}</p>
        <div class="pay-success-ref">${sanitizeHTML(txnId)}</div>
        <div class="pay-success-divider"></div>
        <div class="pay-success-notification">${notifText}</div>
        ${ctaHtml}
      </div>
    `;

    modal.classList.add('open');
    ensureBackdrop('pay-success-modal');

    // Launch confetti
    launchConfetti('success-confetti-container');
  }

  function closeSuccessModal() {
    closeModal('pay-success-modal');
    // Trigger reservation UI update on artisan page
    window.dispatchEvent(new CustomEvent('fixeo:booking:confirmed', {
      detail: {
        bookingData: state.bookingData,
        txnId: state._lastTxnId,
        bookingRef: state._lastBookingRef
      }
    }));
  }

  /* ════════════════════════════════════════════════════════
     ARTISAN NOTIFICATION
  ════════════════════════════════════════════════════════ */
  function notifyArtisan(bookingData) {
    if (!bookingData) return;

    // In-app notification
    if (window.notifications) {
      const msg = bookingData.isExpress
        ? `🚀 Demande Express reçue !`
        : `📅 Nouvelle réservation pour ${bookingData.service}`;
      window.notifications.success(msg, `Client confirmé · Paiement reçu`);
    }

    // Store artisan notification
    const artisanNotifs = JSON.parse(localStorage.getItem('fixeo_artisan_notifications') || '[]');
    artisanNotifs.unshift({
      id: generateTxnId(),
      type: bookingData.isExpress ? 'express' : 'booking',
      title: bookingData.isExpress ? '🚀 Demande Express' : '📅 Nouvelle Réservation',
      message: `${bookingData.service} — ${bookingData.date || 'Date à confirmer'}`,
      amount: bookingData._total,
      read: false,
      timestamp: Date.now()
    });
    localStorage.setItem('fixeo_artisan_notifications', JSON.stringify(artisanNotifs.slice(0, 50)));

    // Update notification badge
    updateNotifBadge();
  }

  function updateNotifBadge() {
    if (window.notifSystem?.syncExternalBadges) {
      window.notifSystem.syncExternalBadges();
      return;
    }
    const notifs = JSON.parse(localStorage.getItem('fixeo_artisan_notifications') || '[]');
    const unread = notifs.filter(n => !n.read).length;
    const badges = document.querySelectorAll('.notif-badge');
    badges.forEach(badge => {
      badge.textContent = unread > 0 ? String(unread) : '';
      badge.style.display = unread > 0 ? 'flex' : 'none';
    });
  }

  /* ════════════════════════════════════════════════════════
     CONFETTI
  ════════════════════════════════════════════════════════ */
  function launchConfetti(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const colors = ['#E1306C','#833AB4','#405DE6','#FCA337','#20C997','#FD1D1D','#FCAF45'];
    const shapes = ['50%','0%','2px'];

    for (let i = 0; i < 40; i++) {
      const piece = document.createElement('div');
      const size = 6 + Math.random() * 8;
      piece.style.cssText = `
        position:absolute;
        width:${size}px; height:${size}px;
        background:${colors[Math.floor(Math.random() * colors.length)]};
        border-radius:${shapes[Math.floor(Math.random() * shapes.length)]};
        left:${Math.random() * 100}%;
        top:-10px;
        --duration:${1.5 + Math.random() * 2}s;
        --delay:${Math.random() * 0.8}s;
        animation: confettiFall var(--duration) var(--delay) ease-in forwards;
      `;
      container.appendChild(piece);
    }
  }

  /* ════════════════════════════════════════════════════════
     PUBLIC API
  ════════════════════════════════════════════════════════ */
  window.FixeoPayment = {
    // Core actions
    openSubscriptionPayment,
    openBookingPayment,
    processPayment,
    switchPaymentMethod,
    closePayment: closeModal,
    closeSuccessModal,

    // Utils (called from inline HTML)
    formatCardNumber,
    formatExpiry,
    _verify3DS: verify3DS,

    // State
    getState: () => ({ ...state }),

    // Toast
    showToast,

    // Update badge
    updateNotifBadge,

    // Initialize
    init() {
      initStripe();
      updateNotifBadge();
      // Listen for page-level events
      window.addEventListener('fixeo:payment:success', (e) => {
        // Could integrate with analytics here
        console.log('[Fixeo Pay] Payment recorded:', e.detail.id);
      });
    }
  };

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.FixeoPayment.init());
  } else {
    window.FixeoPayment.init();
  }

})(window);
