/* ============================================================
   FIXEO V5 — PRICING MODULE JS
   Now powered by FixeoPayment engine (payment.js)
   Original logic preserved — payment calls delegated to engine
   ============================================================ */

/* ── State ── */
let currentBilling   = 'monthly';
let selectedPlan     = null;
let selectedPlanData = null;

const PLANS = {
  free: {
    name: 'Free', icon: '🆓',
    monthly: 0, annual: 0, currency: 'MAD'
  },
  pro: {
    name: 'Pro 🏅', icon: '🚀',
    monthly: 99, annual: 79, currency: 'MAD'
  },
  premium: {
    name: 'Premium 👑', icon: '👑',
    monthly: 199, annual: 159, currency: 'MAD'
  }
};

/* ── Billing Toggle ── */
function toggleBilling() {
  setBilling(currentBilling === 'monthly' ? 'annual' : 'monthly');
}

function setBilling(mode) {
  currentBilling = mode;
  const pill    = document.getElementById('toggle-pill');
  const wrap    = document.querySelector('.toggle-switch-wrap');
  const monthly = document.getElementById('toggle-monthly');
  const annual  = document.getElementById('toggle-annual');

  if (mode === 'annual') {
    pill?.classList.add('annual');
    wrap?.classList.add('annual');
    monthly?.classList.remove('active');
    annual?.classList.add('active');
  } else {
    pill?.classList.remove('annual');
    wrap?.classList.remove('annual');
    monthly?.classList.add('active');
    annual?.classList.remove('active');
  }

  // Update prices
  document.querySelectorAll('.price-amount[data-monthly]').forEach(el => {
    const val = mode === 'annual' ? el.dataset.annual : el.dataset.monthly;
    el.textContent = val;
  });
}

/* ── Plan Selection ── */
function selectPlan(planKey) {
  selectedPlan = planKey;
  const plan   = PLANS[planKey];
  const price  = currentBilling === 'annual' ? plan.annual : plan.monthly;

  // Visual selection state
  document.querySelectorAll('.pricing-card').forEach(card => card.classList.remove('selected'));
  const selectedCard = document.querySelector(`[data-plan="${planKey}"]`);
  if (selectedCard) selectedCard.classList.add('selected');

  // Free plan — redirect to sign up
  if (planKey === 'free') {
    window.location.href = 'auth.html#signup';
    return;
  }

  selectedPlanData = {
    key:     planKey,
    name:    plan.name,
    icon:    plan.icon,
    price,
    billing: currentBilling,
    currency: plan.currency
  };

  // ► Delegate to FixeoPayment engine
  if (window.FixeoPayment) {
    window.FixeoPayment.openSubscriptionPayment(selectedPlanData);
  } else {
    // Fallback — legacy modal (kept for safety)
    openPaymentModal_legacy();
  }
}

/* ── Legacy Modal Open (fallback if payment.js not loaded) ── */
function openPaymentModal_legacy() {
  const modal = document.getElementById('payment-modal');
  if (!modal) return;

  let bd = document.getElementById('pay-backdrop');
  if (!bd) {
    bd = document.createElement('div');
    bd.id = 'pay-backdrop';
    bd.className = 'modal-backdrop-overlay';
    bd.onclick = closePaymentModal;
    document.body.appendChild(bd);
  }

  // Rebuild summary in legacy modal
  const summary = document.getElementById('payment-plan-summary');
  if (summary && selectedPlanData) {
    summary.innerHTML = `
      <div>
        <div class="payment-plan-name">${selectedPlanData.icon} Plan ${selectedPlanData.name}</div>
        <div style="font-size:.8rem;color:var(--text-muted);margin-top:3px">
          Facturation ${currentBilling === 'annual' ? 'annuelle (-20%)' : 'mensuelle'}
        </div>
      </div>
      <div class="payment-plan-price">${selectedPlanData.price} MAD/mois</div>
    `;
  }
  const title = document.getElementById('payment-modal-title');
  if (title) title.textContent = `💳 Paiement — Plan ${selectedPlanData?.name}`;

  modal.classList.add('open');
  const msgEl = document.getElementById('payment-msg');
  if (msgEl) { msgEl.style.display = 'none'; msgEl.className = 'payment-message'; }
  resetPayBtns();
}

function closePaymentModal() {
  const modal = document.getElementById('payment-modal');
  modal?.classList.remove('open');
  const bd = document.getElementById('pay-backdrop');
  bd?.remove();
}

function closeModal(id) {
  const modal = document.getElementById(id);
  modal?.classList.remove('open');
  const bd = document.getElementById('pay-backdrop');
  bd?.remove();
}

/* ── Payment Method Switch ── */
/* FIX-PAYPAL: Delegate to FixeoPayment engine if available (new modal system)
   Otherwise fall back to legacy modal show/hide */
function switchPayMethod(method, btn) {
  /* New modal system: delegate to FixeoPayment engine */
  if (window.FixeoPayment && typeof window.FixeoPayment.switchPaymentMethod === 'function') {
    window.FixeoPayment.switchPaymentMethod(method, 'payment-modal', btn);
    return;
  }
  /* Legacy modal fallback */
  document.querySelectorAll('.pay-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.pay-form').forEach(f => f.style.display = 'none');
  const target = document.getElementById('pay-' + method);
  if (target) target.style.display = 'block';
  const msgEl = document.getElementById('payment-msg');
  if (msgEl) msgEl.style.display = 'none';
}

/* ── Card Formatting (legacy) ── */
function formatCardNumber(input) {
  let v = input.value.replace(/\D/g, '').substring(0, 16);
  input.value = v.match(/.{1,4}/g)?.join(' ') || v;
  const iconEl = document.getElementById('card-brand-icon');
  if (!iconEl) return;
  if (/^4/.test(v))       iconEl.textContent = '💙';
  else if (/^5[1-5]/.test(v)) iconEl.textContent = '🔴';
  else if (/^3[47]/.test(v))  iconEl.textContent = '🟢';
  else                         iconEl.textContent = '💳';
}

function formatExpiry(input) {
  let v = input.value.replace(/\D/g, '').substring(0, 4);
  if (v.length > 2) v = v.substring(0, 2) + '/' + v.substring(2);
  input.value = v;
}

/* ── Legacy Process Payment (kept for backward compat) ── */
function processPayment(method) {
  const msgEl = document.getElementById('payment-msg');
  let btn;

  if (method === 'stripe') {
    btn = document.getElementById('stripe-pay-btn');
    if (!validateStripeForm()) {
      showPayMsg('❌ Veuillez remplir tous les champs correctement.', 'error');
      return;
    }
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Traitement en cours…';
  }
  showPayMsg('🔄 Connexion à la passerelle de paiement sécurisée…', '');

  setTimeout(() => {
    const success = Math.random() > 0.08;
    if (success) {
      closePaymentModal();
      openSuccessModal(method);
      savePaymentHistory(method);
    } else {
      showPayMsg('❌ Le paiement a été refusé. Vérifiez vos informations ou essayez une autre méthode.', 'error');
      if (btn) { btn.disabled = false; resetBtnText(btn, method); }
    }
  }, 2500);
}

function validateStripeForm() {
  const name   = document.getElementById('stripe-name')?.value.trim();
  const card   = document.getElementById('stripe-card')?.value.replace(/\s/g, '');
  const expiry = document.getElementById('stripe-expiry')?.value;
  const cvv    = document.getElementById('stripe-cvv')?.value;
  return name && card.length === 16 && expiry.includes('/') && cvv.length >= 3;
}

function validateCMIForm() {
  const card   = document.getElementById('cmi-card')?.value.replace(/\s/g, '');
  const expiry = document.getElementById('cmi-expiry')?.value;
  const cvv    = document.getElementById('cmi-cvv')?.value;
  return card.length === 16 && expiry.includes('/') && cvv.length >= 3;
}

function showPayMsg(msg, type) {
  const el = document.getElementById('payment-msg');
  if (!el) return;
  el.style.display = 'flex';
  el.className = 'payment-message ' + type;
  el.textContent = msg;
}

function resetBtnText(btn, method) {
  const labels = { stripe: '🔒 Payer maintenant', cmi: '🔒 Payer via CMI' };
  btn.innerHTML = labels[method] || 'Payer';
}

function resetPayBtns() {
  const stripeBtn = document.getElementById('stripe-pay-btn');
  if (stripeBtn) { stripeBtn.disabled = false; stripeBtn.innerHTML = '🔒 Payer maintenant'; }
}

/* ── Legacy Success Modal ── */
function openSuccessModal(method) {
  let bd = document.getElementById('pay-backdrop');
  if (!bd) {
    bd = document.createElement('div');
    bd.id = 'pay-backdrop';
    bd.className = 'modal-backdrop-overlay';
    document.body.appendChild(bd);
  }
  const modal = document.getElementById('success-modal');
  const msgEl = document.getElementById('success-plan-msg');
  if (msgEl && selectedPlanData) {
    const methodLabels = { stripe: 'Carte bancaire', cmi: 'CMI' };
    msgEl.textContent = `Plan ${selectedPlanData.name} activé via ${methodLabels[method] || method}. Merci !`;
  }
  modal?.classList.add('open');
  launchConfetti();
}

/* ── Confetti ── */
function launchConfetti() {
  const container = document.getElementById('success-confetti');
  if (!container) return;
  const colors = ['#E1306C','#833AB4','#405DE6','#FCA337','#20C997'];
  for (let i = 0; i < 28; i++) {
    const dot = document.createElement('div');
    dot.style.cssText = `
      position:absolute; width:8px; height:8px; border-radius:50%;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      left:${Math.random()*100}%; top:0;
      animation:confettiFall ${1.5+Math.random()*1.5}s ${Math.random()*0.8}s ease-in forwards;
      pointer-events:none;
    `;
    container.appendChild(dot);
  }
}

/* ── Payment History (localStorage) ── */
function savePaymentHistory(method) {
  if (!selectedPlanData) return;
  const history = JSON.parse(localStorage.getItem('fixeo_payment_history') || '[]');
  history.unshift({
    id: 'TXN-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
    plan: selectedPlanData.name,
    amount: selectedPlanData.price,
    currency: 'MAD',
    method,
    billing: selectedPlanData.billing,
    date: new Date().toLocaleDateString('fr-FR'),
    status: 'success'
  });
  localStorage.setItem('fixeo_payment_history', JSON.stringify(history.slice(0, 50)));
  localStorage.setItem('fixeo_current_plan', selectedPlanData.key);
}

/* ── FAQ Accordion ── */
function toggleFaq(el) {
  const item = el.closest('.faq-item');
  const isOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
  if (!isOpen) item.classList.add('open');
}

/* ── Confetti CSS ── */
(function injectConfettiCSS() {
  const s = document.createElement('style');
  s.textContent = `
    @keyframes confettiFall {
      0%   { transform:translateY(0) rotate(0deg); opacity:1; }
      100% { transform:translateY(120px) rotate(360deg); opacity:0; }
    }
    #success-confetti { position:absolute; inset:0; overflow:hidden; pointer-events:none; }
    @keyframes shake {
      0%,100% { transform:translateX(0); }
      25% { transform:translateX(-6px); }
      75% { transform:translateX(6px); }
    }
  `;
  document.head.appendChild(s);
})();

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  setBilling('monthly');

  // Hamburger
  const ham = document.querySelector('.hamburger');
  const mNav = document.querySelector('.mobile-nav');
  if (ham && mNav && !(window.FixeoMobileMenu && window.FixeoMobileMenu.initialized)) {
    ham.addEventListener('click', () => {
      mNav.classList.toggle('open');
      ham.classList.toggle('active');
    });
  }

  // Listen for successful payments from FixeoPayment engine
  window.addEventListener('fixeo:payment:success', (e) => {
    const { planKey } = e.detail;
    if (planKey) {
      // Update plan button visuals
      document.querySelectorAll('.plan-btn').forEach(btn => {
        btn.classList.remove('active-plan');
      });
      const activePlanCard = document.querySelector(`[data-plan="${planKey}"]`);
      if (activePlanCard) {
        const btn = activePlanCard.querySelector('.plan-btn');
        if (btn) {
          btn.classList.add('active-plan');
          btn.innerHTML = '✅ Plan actif';
        }
      }
    }
  });
});
