/* ============================================================
   FIXEO V4 — ARTISAN SUBSCRIPTION MODULE
   Handles plan display, upgrade flow, payment history
   ============================================================ */

(function () {

/* ── SAMPLE PAYMENT HISTORY ── */
const SAMPLE_HISTORY = [
  { ref: 'TXN-A8F4B2', plan: 'Pro 🏅', method: 'Stripe',  amount: 99,  date: '15/03/2026', status: 'success' },
  { ref: 'TXN-C3D9E1', plan: 'Pro 🏅', method: 'PayPal',  amount: 99,  date: '15/02/2026', status: 'success' },
  { ref: 'TXN-F7G2H8', plan: 'Pro 🏅', method: 'CMI',     amount: 99,  date: '15/01/2026', status: 'success' },
  { ref: 'TXN-J1K5L3', plan: 'Free',   method: '—',       amount: 0,   date: '01/01/2024', status: 'free'    }
];

/* ── Init: load payment history ── */
function initSubscriptionModule() {
  renderPaymentHistory();
  updateCurrentPlanBadge();
}

/* ── Current Plan Badge in Sidebar ── */
function updateCurrentPlanBadge() {
  const stored = localStorage.getItem('fixeo_current_plan') || 'pro';
  const labels = { free: 'Free', pro: 'Pro 🏅', premium: 'Premium 👑' };
  const badge = document.getElementById('current-plan-badge');
  if (badge) badge.textContent = labels[stored] || 'Pro';
}

/* ── Payment History Table ── */
function renderPaymentHistory() {
  const tbody = document.getElementById('artisan-payment-history-body');
  if (!tbody) return;

  // Merge sample + localStorage
  const stored = JSON.parse(localStorage.getItem('fixeo_payment_history') || '[]');
  const all = [...stored, ...SAMPLE_HISTORY].slice(0, 20);

  tbody.innerHTML = all.map(p => `
    <tr style="border-bottom:1px solid rgba(255,255,255,.05)">
      <td style="padding:10px;font-family:monospace;font-size:.75rem">${p.ref}</td>
      <td style="padding:10px;font-size:.83rem">${p.plan}</td>
      <td style="padding:10px;font-size:.83rem">${p.method}</td>
      <td style="padding:10px;font-size:.83rem;font-weight:700">${p.amount > 0 ? p.amount + ' MAD' : '—'}</td>
      <td style="padding:10px;font-size:.83rem;color:rgba(255,255,255,.6)">${p.date}</td>
      <td style="padding:10px">
        <span style="
          display:inline-flex;align-items:center;gap:4px;
          font-size:.7rem;font-weight:700;padding:3px 10px;border-radius:20px;
          ${p.status === 'success' ? 'background:rgba(32,201,151,.15);color:#20C997' :
            p.status === 'free'   ? 'background:rgba(255,255,255,.08);color:rgba(255,255,255,.5)' :
                                    'background:rgba(225,48,108,.15);color:#E1306C'}
        ">
          ${p.status === 'success' ? '✅ Payé' : p.status === 'free' ? '🆓 Gratuit' : '❌ Échoué'}
        </span>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--text-muted)">Aucun paiement enregistré</td></tr>`;
}

/* ── Export ── */
window.exportPayHistory = function () {
  window.notifSystem?.show('📥 Historique téléchargé en PDF', 'Votre historique de paiements a été exporté.', 'success');
};

/* ── Upgrade to Premium ── */
window.upgradeToPremium = function () {
  window.location.href = 'pricing.html';
};

window.showSubscriptionUpgrade = function () {
  window.location.href = 'pricing.html';
};

/* ── Cancel Subscription ── */
window.showCancelConfirm = function () {
  if (confirm('⚠️ Êtes-vous sûr de vouloir annuler votre abonnement Pro ? Vous repasSerez au plan Free à la fin de votre période de facturation.')) {
    localStorage.setItem('fixeo_current_plan', 'free');
    updateCurrentPlanBadge();
    window.notifSystem?.show('ℹ️ Abonnement annulé', 'Votre plan Pro restera actif jusqu\'au 15/04/2026, puis vous passerez au plan Free.', 'info');
  }
};

/* ── btn-premium style injection ── */
(function injectPremiumBtnCSS() {
  const s = document.createElement('style');
  s.textContent = `
    .btn-premium {
      background: linear-gradient(135deg, #FCA337, #E1306C) !important;
      color: #fff !important; border: none !important;
    }
    .btn-premium:hover { opacity: .9; transform: translateY(-1px); }
  `;
  document.head.appendChild(s);
})();

/* ── DOMContentLoaded ── */
document.addEventListener('DOMContentLoaded', initSubscriptionModule);

})();
