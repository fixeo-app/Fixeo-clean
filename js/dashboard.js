// ============================================================
//  FIXEO V3 — DASHBOARD ENGINE (Client & Artisan)
//  KPIs · Charts (Canvas) · Analytics
// ============================================================

class DashboardEngine {
  constructor() {
    this.charts = {};
    this.clientData = this.generateClientData();
    this.artisanData = this.generateArtisanData();
  }

  generateClientData() {
    return {
      kpis: [
        { id: 'active', icon: '🔧', label: 'Missions actives', value: 3, trend: +1, color: '#E1306C' },
        { id: 'pending', icon: '⏳', label: 'En attente', value: 2, trend: 0, color: '#ffa502' },
        { id: 'completed', icon: '✅', label: 'Terminées', value: 18, trend: +3, color: '#20c997' },
        { id: 'spent', icon: '💰', label: 'Total dépensé', value: '4 200 MAD', trend: null, color: '#833AB4' },
      ],
      monthlySpending: [320, 480, 610, 290, 720, 540, 880, 430, 660, 910, 750, 620],
      categoryDistrib: [30, 25, 20, 15, 10],
      categoryLabels: ['Plomberie', 'Électricité', 'Peinture', 'Nettoyage', 'Autres'],
      recentRequests: [
        { id: 'REQ-001', service: 'Plomberie', artisan: 'Karim B.', status: 'active', amount: '350 MAD', date: '14/06' },
        { id: 'REQ-002', service: 'Peinture', artisan: 'Sara D.', status: 'pending', amount: '800 MAD', date: '12/06' },
        { id: 'REQ-003', service: 'Électricité', artisan: 'Omar T.', status: 'completed', amount: '220 MAD', date: '08/06' },
        { id: 'REQ-004', service: 'Nettoyage', artisan: 'Fatima Z.', status: 'completed', amount: '150 MAD', date: '03/06' },
        { id: 'REQ-005', service: 'Jardinage', artisan: 'Hassan M.', status: 'completed', amount: '400 MAD', date: '28/05' },
      ],
    };
  }

  generateArtisanData() {
    return {
      kpis: [
        { id: 'revenue', icon: '💰', label: 'Revenus du mois', value: '8 400 MAD', trend: +12, color: '#20c997' },
        { id: 'clients', icon: '👥', label: 'Clients', value: 47, trend: +5, color: '#E1306C' },
        { id: 'response', icon: '⚡', label: 'Taux de réponse', value: '94%', trend: +2, color: '#833AB4' },
        { id: 'rating', icon: '⭐', label: 'Note moyenne', value: '4.9', trend: +0.1, color: '#FFD700' },
        { id: 'completion', icon: '✅', label: 'Taux d\'achèvement', value: '97%', trend: +1, color: '#3742fa' },
        { id: 'xp', icon: '🏆', label: 'XP Gamification', value: '1 250 XP', trend: +150, color: '#F77737' },
      ],
      revenueByMonth: [5200, 6800, 7400, 5900, 8100, 7200, 9300, 8400, 7800, 10200, 9500, 8400],
      jobsByCategory: [12, 8, 5, 7, 3, 4],
      jobCategoryLabels: ['Plomberie', 'Électricité', 'Peinture', 'Nettoyage', 'Jardinage', 'Bricolage'],
      ratingTrend: [4.5, 4.6, 4.7, 4.7, 4.8, 4.8, 4.9, 4.9, 4.9, 5.0, 4.9, 4.9],
      recentJobs: [
        { id: 'JOB-001', client: 'Ahmed K.', service: 'Fuite d\'eau', status: 'active', amount: '350 MAD', date: '14/06' },
        { id: 'JOB-002', client: 'Nadia R.', service: 'Installation évier', status: 'pending', amount: '200 MAD', date: '13/06' },
        { id: 'JOB-003', client: 'Mourad T.', service: 'Chauffe-eau', status: 'completed', amount: '480 MAD', date: '10/06' },
        { id: 'JOB-004', client: 'Samira B.', service: 'Tuyaux endommagés', status: 'completed', amount: '320 MAD', date: '07/06' },
        { id: 'JOB-005', client: 'Khalid A.', service: 'WC bouché', status: 'completed', amount: '150 MAD', date: '04/06' },
      ],
      availability: {
        Mon: [true, false, true, true, true, false, false, false],
        Tue: [true, true, true, false, true, true, false, false],
        Wed: [false, false, true, true, true, true, true, false],
        Thu: [true, true, false, false, true, true, false, true],
        Fri: [true, true, true, true, false, false, false, false],
        Sat: [false, true, true, true, true, true, false, false],
        Sun: [false, false, false, false, false, false, false, false],
      },
    };
  }

  // ── KPI CARDS ─────────────────────────────────────────────
  renderKPIs(type = 'client') {
    const data = type === 'artisan' ? this.artisanData : this.clientData;
    const container = document.querySelector('.kpi-grid');
    if (!container) return;
    const lang = window.i18n ? window.i18n.lang : 'fr';
    container.innerHTML = data.kpis.map(kpi => `
      <div class="kpi-card">
        <div class="kpi-icon" style="background:${kpi.color}22;color:${kpi.color}">${kpi.icon}</div>
        <div class="kpi-value" style="color:${kpi.color}">${kpi.value}</div>
        <div class="kpi-label">${kpi.label}</div>
        ${kpi.trend !== null ? `
        <div class="kpi-trend ${kpi.trend >= 0 ? 'up' : 'down'}">
          ${kpi.trend >= 0 ? '↑' : '↓'} ${Math.abs(kpi.trend)}${typeof kpi.trend === 'number' && kpi.trend < 20 ? '%' : ''}
          <span style="color:rgba(255,255,255,.4);font-size:.7rem">vs. mois dernier</span>
        </div>` : ''}
      </div>
    `).join('');
  }

  // ── CHARTS (Canvas) ────────────────────────────────────────
  drawLineChart(canvasId, labels, data, color = '#E1306C', label = '') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.offsetWidth;
    const H = canvas.height = canvas.offsetHeight;
    const pad = { top: 20, right: 20, bottom: 30, left: 50 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;
    const max = Math.max(...data) * 1.1;
    const min = 0;
    ctx.clearRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      ctx.font = '10px Cairo'; ctx.textAlign = 'right';
      ctx.fillText(Math.round(max - (max / 4) * i).toLocaleString(), pad.left - 6, y + 4);
    }

    // X labels
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    ctx.font = '10px Cairo'; ctx.textAlign = 'center';
    labels.forEach((l, i) => {
      const x = pad.left + (chartW / (labels.length - 1)) * i;
      ctx.fillText(l, x, H - 6);
    });

    // Area fill
    const gradient = ctx.createLinearGradient(0, pad.top, 0, H - pad.bottom);
    gradient.addColorStop(0, color + '40');
    gradient.addColorStop(1, color + '00');
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = pad.left + (chartW / (data.length - 1)) * i;
      const y = pad.top + chartH - ((d - min) / (max - min)) * chartH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(pad.left + chartW, H - pad.bottom);
    ctx.lineTo(pad.left, H - pad.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = color; ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    data.forEach((d, i) => {
      const x = pad.left + (chartW / (data.length - 1)) * i;
      const y = pad.top + chartH - ((d - min) / (max - min)) * chartH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dots
    data.forEach((d, i) => {
      const x = pad.left + (chartW / (data.length - 1)) * i;
      const y = pad.top + chartH - ((d - min) / (max - min)) * chartH;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  drawBarChart(canvasId, labels, data, colors) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.offsetWidth;
    const H = canvas.height = canvas.offsetHeight;
    const pad = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;
    const max = Math.max(...data) * 1.2;
    const barW = Math.max(8, (chartW / labels.length) * 0.6);
    const gap = chartW / labels.length;
    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.font = '10px Cairo'; ctx.textAlign = 'right';
      ctx.fillText(Math.round(max - (max / 4) * i), pad.left - 6, y + 4);
    }

    labels.forEach((l, i) => {
      const x = pad.left + gap * i + (gap - barW) / 2;
      const barH = ((data[i]) / max) * chartH;
      const y = pad.top + chartH - barH;
      const grad = ctx.createLinearGradient(0, y, 0, y + barH);
      const c = Array.isArray(colors) ? (colors[i] || '#E1306C') : colors;
      grad.addColorStop(0, c);
      grad.addColorStop(1, c + '88');
      ctx.fillStyle = grad;
      const r = Math.min(6, barW / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.lineTo(x + barW - r, y);
      ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
      ctx.lineTo(x + barW, y + barH); ctx.lineTo(x, y + barH);
      ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath(); ctx.fill();
      // Label
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = '9px Cairo'; ctx.textAlign = 'center';
      ctx.fillText(l, x + barW / 2, H - 8);
    });
  }

  drawDonutChart(canvasId, labels, data, colors) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.offsetWidth;
    const H = canvas.height = canvas.offsetHeight;
    const cx = W / 2, cy = H / 2;
    const radius = Math.min(W, H) * 0.35;
    const total = data.reduce((a, b) => a + b, 0);
    ctx.clearRect(0, 0, W, H);
    let startAngle = -Math.PI / 2;
    data.forEach((val, i) => {
      const slice = (val / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, startAngle + slice);
      ctx.arc(cx, cy, radius * 0.55, startAngle + slice, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = colors[i] || '#E1306C';
      ctx.fill();
      // Label
      const midAngle = startAngle + slice / 2;
      const lx = cx + Math.cos(midAngle) * radius * 0.78;
      const ly = cy + Math.sin(midAngle) * radius * 0.78;
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = 'bold 10px Cairo'; ctx.textAlign = 'center';
      ctx.fillText(Math.round((val/total)*100) + '%', lx, ly + 4);
      startAngle += slice;
    });
    // Center text
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '11px Cairo'; ctx.textAlign = 'center';
    ctx.fillText('Répartition', cx, cy - 6);
    // Legend
    labels.forEach((l, i) => {
      const lx = 10; const ly = 12 + i * 16;
      ctx.fillStyle = colors[i]; ctx.fillRect(lx, ly, 10, 10);
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '9px Cairo'; ctx.textAlign = 'left';
      ctx.fillText(l, lx + 14, ly + 9);
    });
  }

  // ── JOBS TABLE ─────────────────────────────────────────────
  renderJobsTable(type = 'client') {
    const data = type === 'artisan' ? this.artisanData : this.clientData;
    const jobs = type === 'artisan' ? data.recentJobs : data.recentRequests;
    const container = document.querySelector('.jobs-table-body');
    if (!container) return;
    const statusConfig = {
      active:    { label: 'Actif',      color: '#E1306C', bg: 'rgba(225,48,108,.15)' },
      pending:   { label: 'En attente', color: '#ffa502', bg: 'rgba(255,165,2,.15)' },
      completed: { label: 'Terminé',    color: '#20c997', bg: 'rgba(32,201,151,.15)' },
    };
    container.innerHTML = jobs.map(job => {
      const s = statusConfig[job.status];
      return `
      <tr style="border-bottom:1px solid rgba(255,255,255,.05)">
        <td style="padding:.75rem 1rem;font-size:.85rem;font-weight:600;color:rgba(255,255,255,.5)">${job.id}</td>
        <td style="padding:.75rem 1rem;font-size:.85rem">${type === 'artisan' ? job.client : job.artisan}</td>
        <td style="padding:.75rem 1rem;font-size:.85rem">${job.service}</td>
        <td style="padding:.75rem 1rem">
          <span style="background:${s.bg};color:${s.color};padding:3px .75rem;border-radius:999px;font-size:.75rem;font-weight:600;border:1px solid ${s.color}40">${s.label}</span>
        </td>
        <td style="padding:.75rem 1rem;font-size:.85rem;font-weight:700;color:var(--accent2)">${job.amount}</td>
        <td style="padding:.75rem 1rem;font-size:.8rem;color:rgba(255,255,255,.5)">${job.date}</td>
      </tr>`;
    }).join('');
  }

  // ── AVAILABILITY GRID ──────────────────────────────────────
  renderAvailability() {
    const container = document.querySelector('.availability-grid');
    if (!container) return;
    const slots = ['08h', '09h', '10h', '11h', '14h', '15h', '16h', '17h'];
    const days = Object.keys(this.artisanData.availability);
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:60px repeat(${days.length},1fr);gap:4px">
        <div></div>
        ${days.map(d => `<div style="text-align:center;font-size:.75rem;font-weight:600;padding:.4rem;color:rgba(255,255,255,.6)">${d}</div>`).join('')}
        ${slots.map((slot, si) => `
          <div style="font-size:.7rem;color:rgba(255,255,255,.5);display:flex;align-items:center;justify-content:flex-end;padding-right:.5rem">${slot}</div>
          ${days.map(day => {
            const avail = this.artisanData.availability[day][si];
            return `<div class="avail-slot ${avail ? 'free' : 'taken'}" onclick="window.dashboard.toggleSlot('${day}',${si})" style="text-align:center;font-size:.7rem">${avail ? '✓' : '✗'}</div>`;
          }).join('')}
        `).join('')}
      </div>`;
  }

  toggleSlot(day, slotIndex) {
    this.artisanData.availability[day][slotIndex] = !this.artisanData.availability[day][slotIndex];
    this.renderAvailability();
  }

  // ── FULL INIT ─────────────────────────────────────────────
  init(type = 'client') {
    this.renderKPIs(type);
    this.renderJobsTable(type);
    const months = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    if (type === 'client') {
      setTimeout(() => {
        this.drawLineChart('chart-spending', months, this.clientData.monthlySpending, '#E1306C');
        this.drawDonutChart('chart-categories', this.clientData.categoryLabels, this.clientData.categoryDistrib,
          ['#E1306C','#833AB4','#F77737','#20c997','#3742fa']);
      }, 100);
    } else {
      setTimeout(() => {
        this.drawLineChart('chart-revenue', months, this.artisanData.revenueByMonth, '#20c997');
        this.drawBarChart('chart-jobs', this.artisanData.jobCategoryLabels, this.artisanData.jobsByCategory,
          ['#E1306C','#833AB4','#F77737','#20c997','#3742fa','#FCAF45']);
        this.drawLineChart('chart-rating', months, this.artisanData.ratingTrend, '#FFD700');
        this.renderAvailability();
      }, 100);
    }
  }
}

window.dashboard = new DashboardEngine();
document.addEventListener('DOMContentLoaded', () => {
  const type = document.body.dataset.dashType || 'client';
  window.dashboard.init(type);
});
window.addEventListener('resize', () => {
  const type = document.body.dataset.dashType || 'client';
  window.dashboard.init(type);
});

// ── Client Dashboard Init helper ─────────────────────────────
window.DASHBOARD_CLIENT = {
  bookings: [
    { id:'REQ-001', service:'Plomberie',      artisan:'Karim B.',   status:'active',    amount:'350 MAD', date:'14/06' },
    { id:'REQ-002', service:'Peinture',        artisan:'Sara D.',    status:'pending',   amount:'800 MAD', date:'12/06' },
    { id:'REQ-003', service:'Électricité',     artisan:'Omar T.',    status:'completed', amount:'220 MAD', date:'08/06' },
    { id:'REQ-004', service:'Nettoyage',       artisan:'Fatima Z.',  status:'completed', amount:'150 MAD', date:'03/06' },
    { id:'REQ-005', service:'Jardinage',       artisan:'Hassan M.',  status:'completed', amount:'400 MAD', date:'28/05' },
    { id:'REQ-006', service:'Déménagement',    artisan:'Aicha L.',   status:'completed', amount:'1200 MAD',date:'15/05' },
  ],
};

function renderBookingsTable(container, bookings) {
  if (!container) return;
  const statusConf = {
    active:    { label:'Actif',      color:'#E1306C', bg:'rgba(225,48,108,.12)'  },
    pending:   { label:'En attente', color:'#ffa502', bg:'rgba(255,165,2,.12)'   },
    completed: { label:'Terminé',    color:'#20c997', bg:'rgba(32,201,151,.12)'  },
  };
  container.innerHTML = `
    <table class="jobs-table" style="width:100%">
      <thead><tr>
        <th style="padding:12px 16px">Réf.</th>
        <th style="padding:12px 16px">Artisan</th>
        <th style="padding:12px 16px">Service</th>
        <th style="padding:12px 16px">Statut</th>
        <th style="padding:12px 16px">Montant</th>
        <th style="padding:12px 16px">Date</th>
      </tr></thead>
      <tbody>${bookings.map(j => {
        const s = statusConf[j.status] || statusConf.pending;
        return `<tr>
          <td style="padding:12px 16px;font-size:.82rem;color:rgba(255,255,255,.45)">${j.id}</td>
          <td style="padding:12px 16px;font-size:.85rem">${j.artisan}</td>
          <td style="padding:12px 16px;font-size:.85rem">${j.service}</td>
          <td style="padding:12px 16px">
            <span style="background:${s.bg};color:${s.color};padding:3px 10px;border-radius:999px;font-size:.74rem;font-weight:700;border:1px solid ${s.color}33">${s.label}</span>
          </td>
          <td style="padding:12px 16px;font-size:.85rem;font-weight:700;color:var(--accent2)">${j.amount}</td>
          <td style="padding:12px 16px;font-size:.78rem;color:rgba(255,255,255,.45)">${j.date}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
}

function initClientDashboard() {
  if (window.dashboard) window.dashboard.init('client');
}
