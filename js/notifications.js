(function (window, document) {
  'use strict';

  const STORAGE_KEY = 'fixeo_notifications';
  const REQUESTS_KEY = 'fixeo_client_requests';
  const MAX_NOTIFICATIONS = 100;
  const TOAST_DURATION = 4200;
  const PERSISTENT_TYPES = new Set([
    'new_request',
    'mission_accepted',
    'mission_started',
    'mission_completed',
    'waiting_confirmation',
    'mission_validated',
    'commission_due',
    'commission_paid',
    'new_review'
  ]);

  const TYPE_META = {
    new_request: { label: 'Nouvelle demande', icon: '📥', tone: 'info' },
    mission_accepted: { label: 'Mission acceptée', icon: '🤝', tone: 'success' },
    mission_started: { label: 'Mission démarrée', icon: '🚀', tone: 'info' },
    mission_completed: { label: 'Mission terminée', icon: '✅', tone: 'success' },
    waiting_confirmation: { label: 'Confirmation client en attente', icon: '⏳', tone: 'warning' },
    mission_validated: { label: 'Mission validée', icon: '🎉', tone: 'success' },
    commission_due: { label: 'Commission à payer', icon: '💸', tone: 'warning' },
    commission_paid: { label: 'Commission payée', icon: '💰', tone: 'success' },
    new_review: { label: 'Nouvel avis client', icon: '⭐', tone: 'info' },
    success: { label: 'Succès', icon: '✅', tone: 'success' },
    info: { label: 'Information', icon: 'ℹ️', tone: 'info' },
    warning: { label: 'Attention', icon: '⚠️', tone: 'warning' },
    error: { label: 'Erreur', icon: '❌', tone: 'error' }
  };

  function parseJSON(value, fallback) {
    try {
      const parsed = JSON.parse(value);
      return parsed == null ? fallback : parsed;
    } catch (error) {
      return fallback;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function normalizeStatus(value) {
    const normalized = normalizeText(value || '');
    if (!normalized || normalized === 'nouvelle' || normalized === 'disponible') return 'nouvelle';
    if (normalized === 'acceptee' || normalized === 'accepte') return 'acceptée';
    if (normalized === 'en cours' || normalized === 'en_cours' || normalized === 'encours') return 'en_cours';
    if (normalized === 'terminee' || normalized === 'termine') return 'terminée';
    if (normalized === 'validee' || normalized === 'valide') return 'validée';
    if (normalized === 'intervention confirmee' || normalized === 'intervention_confirmee') return 'intervention_confirmée';
    return String(value || '').trim() || 'nouvelle';
  }

  function buildStableArtisanId(value) {
    const normalized = normalizeText(value);
    return normalized ? normalized.replace(/\s+/g, '_') : '';
  }

  function formatMissionRef(request) {
    return request && request.id ? '#' + String(request.id) : 'mission';
  }

  function formatDateLabel(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'À l’instant';
    const diff = Date.now() - date.getTime();
    const hour = 60 * 60 * 1000;
    const day = 24 * hour;
    if (diff < hour) {
      const minutes = Math.max(1, Math.round(diff / (60 * 1000)));
      return 'Il y a ' + minutes + ' min';
    }
    if (diff < day) {
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    if (diff < day * 2) return 'Hier';
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }

  function getStoredUserObject() {
    return parseJSON(localStorage.getItem('user') || 'null', null) || {};
  }

  function resolveCurrentUser() {
    const user = getStoredUserObject();
    const role = String(
      localStorage.getItem('fixeo_role') ||
      localStorage.getItem('user_role') ||
      localStorage.getItem('role') ||
      user.role ||
      document.body?.dataset?.dashType ||
      ''
    ).trim().toLowerCase();

    const isAdmin = role === 'admin'
      || localStorage.getItem('fixeo_admin') === '1'
      || sessionStorage.getItem('fixeo_admin_auth') === '1';

    if (isAdmin) {
      return { user_role: 'admin', user_id: 'admin', display_name: 'Admin Fixeo' };
    }

    if (role === 'artisan') {
      const name = String(
        localStorage.getItem('user_name') ||
        localStorage.getItem('fixeo_user_name') ||
        user.name ||
        window.ARTISAN_DATA?.name ||
        ''
      ).trim();

      const explicitId = String(
        localStorage.getItem('fixeo_user_id') ||
        localStorage.getItem('user_id') ||
        localStorage.getItem('fixeo_artisan_id') ||
        localStorage.getItem('artisan_id') ||
        localStorage.getItem('current_artisan_id') ||
        user.id ||
        window.ARTISAN_DATA?.id ||
        ''
      ).trim();

      return {
        user_role: 'artisan',
        user_id: explicitId || buildStableArtisanId(name) || 'artisan-fixeo',
        display_name: name || 'Artisan Fixeo'
      };
    }

    const fallbackId = String(
      localStorage.getItem('fixeo_user_id') ||
      localStorage.getItem('user_id') ||
      localStorage.getItem('fixeo_user') ||
      user.id ||
      user.email ||
      user.name ||
      'client'
    ).trim();

    return {
      user_role: role || 'client',
      user_id: fallbackId || 'client',
      display_name: String(localStorage.getItem('fixeo_user_name') || user.name || 'Client Fixeo').trim() || 'Client Fixeo'
    };
  }

  function normalizeClientConfirmation(value, status) {
    const normalized = normalizeText(value || '');
    if (normalized === 'en attente' || normalized === 'en_attente') return 'en_attente';
    if (normalized === 'confirmee' || normalized === 'confirmee ') return 'confirmée';
    if (status === 'validée' || status === 'intervention_confirmée') return 'confirmée';
    return '';
  }

  function normalizeCommissionStatus(raw, status, amount) {
    const normalized = normalizeText(raw?.commission_status || '');
    if (amount > 0 && (normalized === 'payee' || normalized === 'paye' || raw?.commission_paid === true)) return 'payée';
    if (amount > 0 && (status === 'validée' || status === 'intervention_confirmée')) return 'à_payer';
    return '';
  }

  function normalizeRequestLite(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const status = normalizeStatus(raw.status);
    const commissionAmount = Number(raw.commission_amount || raw.commission || raw.fixeo_commission || 0) || 0;
    const reviewRating = Number(raw.review_rating || 0) || 0;
    const artisanId = String(raw.assigned_artisan_id || '').trim();
    const artisanName = String(raw.assigned_artisan || '').trim();
    const effectiveArtisanId = artisanId || buildStableArtisanId(artisanName);

    return {
      id: String(raw.id || '').trim(),
      service: String(raw.service || raw.probleme || raw.problem || '').trim() || 'Service à préciser',
      city: String(raw.city || raw.ville || '').trim() || 'Ville à préciser',
      status: status,
      client_confirmation: normalizeClientConfirmation(raw.client_confirmation, status),
      assigned_artisan: artisanName,
      assigned_artisan_id: effectiveArtisanId,
      review_submitted: raw.review_submitted === true,
      review_rating: reviewRating,
      review_comment: String(raw.review_comment || '').trim(),
      review_date: String(raw.review_date || '').trim(),
      commission_amount: commissionAmount,
      commission_status: normalizeCommissionStatus(raw, status, commissionAmount),
      created_at: String(raw.created_at || raw.date || new Date().toISOString()).trim(),
      completed_at: String(raw.completed_at || '').trim(),
      validated_at: String(raw.validated_at || '').trim(),
      commission_paid_at: String(raw.commission_paid_at || '').trim()
    };
  }

  function notificationsEqual(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return [
      'status',
      'client_confirmation',
      'assigned_artisan_id',
      'review_submitted',
      'review_rating',
      'commission_status',
      'commission_amount'
    ].every(function (key) {
      return String(a[key] || '') === String(b[key] || '');
    });
  }

  class NotificationSystem {
    constructor() {
      this.usesGlobalBell = true;
      this.notifications = this.loadNotifications();
      this.requestSnapshot = this.buildRequestSnapshot();
      this.container = null;
      this.panel = null;
      this.activeFilter = 'all';
      this.lastToggleAt = 0;
      this.initialized = false;
      this.init();
    }

    init() {
      if (this.initialized) return;
      this.initialized = true;
      this.injectStyles();
      this.createToastContainer();
      this.createPanel();
      this.bindGlobalEvents();
      this.persist(false);
      this.updateUI();
    }

    injectStyles() {
      if (document.getElementById('fixeo-notifications-runtime-style')) return;
      const style = document.createElement('style');
      style.id = 'fixeo-notifications-runtime-style';
      style.textContent = `
        .toast-container{position:fixed;right:20px;bottom:20px;display:flex;flex-direction:column;gap:12px;z-index:1300;pointer-events:none}
        .toast{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:start;min-width:280px;max-width:min(360px,calc(100vw - 32px));background:rgba(17,17,27,.96);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:14px 14px 12px;box-shadow:0 18px 48px rgba(0,0,0,.38);backdrop-filter:blur(18px);pointer-events:auto;overflow:hidden}
        .toast.success{border-color:rgba(32,201,151,.3)}
        .toast.warning{border-color:rgba(255,196,0,.28)}
        .toast.error{border-color:rgba(255,93,115,.34)}
        .toast.info{border-color:rgba(64,93,230,.28)}
        .toast-icon{font-size:1.25rem;line-height:1;margin-top:2px}
        .toast-content{min-width:0}
        .toast-title{font-weight:800;font-size:.92rem;line-height:1.25;margin-bottom:4px;color:#fff}
        .toast-msg{font-size:.82rem;line-height:1.45;color:rgba(255,255,255,.74)}
        .toast-close{background:none;border:none;color:rgba(255,255,255,.58);font-size:1rem;cursor:pointer;padding:0;line-height:1}
        .toast-progress{position:absolute;left:0;right:0;bottom:0;height:3px;background:linear-gradient(90deg,#E1306C,#833AB4);transform-origin:left center;animation:fixeo-toast-progress ${TOAST_DURATION}ms linear forwards}
        @keyframes fixeo-toast-progress{from{transform:scaleX(1)}to{transform:scaleX(0)}}
        .notif-panel{position:fixed;top:84px;right:16px;width:min(360px,calc(100vw - 24px));max-height:min(78vh,640px);background:rgba(14,14,24,.98);border:1px solid rgba(255,255,255,.1);border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.46);backdrop-filter:blur(18px);display:none;flex-direction:column;overflow:hidden;z-index:1250}
        .notif-panel.open{display:flex}
        .notif-panel-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 16px 12px;border-bottom:1px solid rgba(255,255,255,.08)}
        .notif-panel-title{display:flex;align-items:center;gap:10px;font-weight:800;font-size:1rem;color:#fff}
        .notif-panel-actions{display:flex;align-items:center;gap:8px}
        .notif-link-btn{background:none;border:none;color:#ff4ecd;font-weight:700;font-size:.78rem;cursor:pointer;padding:0}
        .notif-icon-btn{width:30px;height:30px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#fff;cursor:pointer}
        .notif-panel-filters{display:flex;gap:8px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.06)}
        .notif-filter{flex:1;border:none;border-radius:999px;padding:9px 12px;background:rgba(255,255,255,.05);color:rgba(255,255,255,.72);font-size:.8rem;font-weight:700;cursor:pointer}
        .notif-filter.active{background:rgba(255,78,205,.16);color:#fff;border:1px solid rgba(255,78,205,.24)}
        .notif-panel-body{display:flex;flex-direction:column;gap:8px;padding:12px;overflow:auto;min-height:0}
        .notif-item{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:start;padding:12px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.04);cursor:pointer;transition:transform .18s ease,background .18s ease,border-color .18s ease}
        .notif-item:hover{transform:translateY(-1px);background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.08)}
        .notif-item.unread{background:rgba(255,78,205,.09);border-color:rgba(255,78,205,.18)}
        .notif-item-icon{font-size:1.2rem;line-height:1;margin-top:2px}
        .notif-item-content{min-width:0}
        .notif-item-title{font-size:.88rem;font-weight:800;color:#fff;line-height:1.25;margin-bottom:4px;word-break:break-word}
        .notif-item-body{font-size:.8rem;line-height:1.45;color:rgba(255,255,255,.72);word-break:break-word}
        .notif-item-time{font-size:.72rem;color:rgba(255,255,255,.44);white-space:nowrap;padding-left:4px}
        .notif-item-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
        .notif-tag{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:rgba(255,255,255,.06);font-size:.68rem;font-weight:700;color:rgba(255,255,255,.65)}
        .notif-empty{padding:30px 18px;text-align:center;color:rgba(255,255,255,.6)}
        .notif-empty strong{display:block;font-size:1rem;margin-bottom:6px;color:#fff}
        .notif-btn,.notif-bell,.fixeo-gh-notif{position:relative}
        .notif-count,.notif-badge,.fixeo-gh-badge{position:absolute;top:-5px;right:-8px;min-width:20px;height:20px;border-radius:999px;background:#ff4ecd;color:#fff;font-size:11px;font-weight:800;padding:0 6px;display:none;align-items:center;justify-content:center;border:2px solid #0d0d1a}
        .notif-count.has-notif,.notif-badge.has-notif,.fixeo-gh-badge.has-notif{display:flex}
        @media (max-width: 768px){
          .toast-container{left:16px;right:16px;bottom:16px}
          .toast{min-width:0;max-width:none}
          .notif-panel{inset:0;width:100vw;max-height:100vh;border-radius:0;top:0;right:0;border:none}
          .notif-panel-header{padding-top:20px}
          .notif-panel-body{padding:12px 14px 18px}
        }
      `;
      document.head.appendChild(style);
    }

    loadNotifications() {
      const current = parseJSON(localStorage.getItem(STORAGE_KEY) || '[]', []);
      return Array.isArray(current) ? current.map(this.normalizeNotification.bind(this)).filter(Boolean) : [];
    }

    normalizeNotification(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const type = PERSISTENT_TYPES.has(raw.type) ? raw.type : (TYPE_META[raw.type] ? raw.type : 'info');
      const meta = TYPE_META[type] || TYPE_META.info;
      const createdAt = raw.created_at || raw.createdAt || new Date().toISOString();
      return {
        id: String(raw.id || ('notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8))),
        type: type,
        title: String(raw.title || meta.label),
        message: String(raw.message || raw.body || ''),
        user_role: String(raw.user_role || raw.role || ''),
        user_id: String(raw.user_id || raw.userId || ''),
        read: raw.read === true,
        created_at: createdAt,
        related_id: String(raw.related_id || raw.relatedId || raw.mission_id || ''),
        icon: raw.icon || meta.icon,
        tone: raw.tone || meta.tone,
        action_href: String(raw.action_href || raw.href || ''),
        silent: raw.silent === true,
        meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : {}
      };
    }

    buildRequestSnapshot() {
      const requests = parseJSON(localStorage.getItem(REQUESTS_KEY) || '[]', []);
      const map = new Map();
      if (!Array.isArray(requests)) return map;
      requests.forEach(function (item) {
        const normalized = normalizeRequestLite(item);
        if (normalized && normalized.id) {
          map.set(normalized.id, normalized);
        }
      });
      return map;
    }

    createToastContainer() {
      this.container = document.querySelector('.toast-container');
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
      }
    }

    createPanel() {
      this.panel = document.querySelector('.notif-panel');
      if (!this.panel) {
        this.panel = document.createElement('div');
        this.panel.className = 'notif-panel notif-dropdown';
        this.panel.setAttribute('aria-label', 'Notifications Fixeo');
        document.body.appendChild(this.panel);
      }

      this.panel.innerHTML = `
        <div class="notif-panel-header">
          <div class="notif-panel-title">🔔 <span>Notifications Fixeo</span></div>
          <div class="notif-panel-actions">
            <button type="button" class="notif-link-btn" data-notif-action="mark-all">Tout lire</button>
            <button type="button" class="notif-icon-btn" data-notif-action="close" aria-label="Fermer">✕</button>
          </div>
        </div>
        <div class="notif-panel-filters">
          <button type="button" class="notif-filter active" data-filter="all">Toutes</button>
          <button type="button" class="notif-filter" data-filter="unread">Non lues</button>
        </div>
        <div class="notif-panel-body" id="notif-list"></div>
      `;

      this.panel.addEventListener('click', this.handlePanelClick.bind(this));
    }

    handlePanelClick(event) {
      const actionTarget = event.target.closest('[data-notif-action]');
      if (actionTarget) {
        const action = actionTarget.getAttribute('data-notif-action');
        if (action === 'mark-all') this.markAllRead();
        if (action === 'close') this.togglePanel(false);
        return;
      }

      const filterTarget = event.target.closest('[data-filter]');
      if (filterTarget) {
        this.activeFilter = filterTarget.getAttribute('data-filter') || 'all';
        this.panel.querySelectorAll('.notif-filter').forEach(function (button) {
          button.classList.toggle('active', button === filterTarget);
        });
        this.renderPanel();
        return;
      }

      const item = event.target.closest('.notif-item');
      if (!item) return;
      const id = item.getAttribute('data-id') || '';
      const href = item.getAttribute('data-href') || '';
      this.markAsRead(id);
      if (href) {
        window.location.href = href;
      }
    }

    bindGlobalEvents() {
      document.addEventListener('click', (event) => {
        const bell = event.target.closest('.notif-btn, .notif-bell, .fixeo-gh-notif');
        if (bell) {
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
          this.togglePanel();
          return;
        }

        if (!this.panel || !this.panel.classList.contains('open')) return;
        if (this.panel.contains(event.target)) return;
        this.togglePanel(false);
      }, true);

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && this.panel?.classList.contains('open')) this.togglePanel(false);
      });

      window.addEventListener('resize', () => {
        if (this.panel?.classList.contains('open')) this.positionPanel();
      });

      window.addEventListener('storage', (event) => {
        if (event.key === STORAGE_KEY) {
          this.notifications = this.loadNotifications();
          this.updateUI();
          return;
        }
        if (event.key === REQUESTS_KEY) {
          this.processRequestSnapshotDiff();
        }
      });

      window.addEventListener('fixeo:client-request-created', (event) => {
        this.handleRequestMutation(event?.detail || null);
      });

      window.addEventListener('fixeo:client-request-updated', (event) => {
        this.handleRequestMutation(event?.detail || null);
      });

      window.addEventListener('fixeo:notifications:refresh', () => {
        this.processRequestSnapshotDiff();
        this.updateUI();
      });
    }

    positionPanel() {
      if (!this.panel || window.innerWidth <= 768) return;
      const bell = document.querySelector('.notif-btn, .notif-bell, .fixeo-gh-notif');
      if (!bell) return;
      const rect = bell.getBoundingClientRect();
      const right = Math.max(16, window.innerWidth - rect.right);
      const top = Math.max(76, rect.bottom + 12);
      this.panel.style.right = right + 'px';
      this.panel.style.top = top + 'px';
    }

    getCurrentUser() {
      return resolveCurrentUser();
    }

    matchesCurrentUser(notification) {
      const currentUser = this.getCurrentUser();
      if (!notification || !currentUser) return false;
      return String(notification.user_role || '') === String(currentUser.user_role || '')
        && String(notification.user_id || '') === String(currentUser.user_id || '');
    }

    getVisibleNotifications() {
      return this.notifications
        .filter(this.matchesCurrentUser.bind(this))
        .sort(function (a, b) {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
    }

    getUnreadCount() {
      return this.getVisibleNotifications().filter(function (item) { return !item.read; }).length;
    }

    renderPanel() {
      const list = this.panel?.querySelector('#notif-list');
      if (!list) return;

      const visible = this.getVisibleNotifications();
      const items = this.activeFilter === 'unread'
        ? visible.filter(function (item) { return !item.read; })
        : visible;

      if (!items.length) {
        list.innerHTML = `
          <div class="notif-empty">
            <div style="font-size:2rem;margin-bottom:10px">🔔</div>
            <strong>Aucune notification</strong>
            <span>Les actions importantes apparaîtront ici.</span>
          </div>
        `;
        return;
      }

      list.innerHTML = items.map((item) => {
        const meta = TYPE_META[item.type] || TYPE_META.info;
        const tags = [meta.label];
        if (item.meta?.city) tags.push(item.meta.city);
        if (item.meta?.service) tags.push(item.meta.service);
        return `
          <div class="notif-item ${item.read ? '' : 'unread'}" data-id="${escapeHtml(item.id)}" data-href="${escapeHtml(item.action_href || '')}">
            <div class="notif-item-icon">${escapeHtml(item.icon || meta.icon)}</div>
            <div class="notif-item-content">
              <div class="notif-item-title">${escapeHtml(item.title || meta.label)}</div>
              <div class="notif-item-body">${escapeHtml(item.message || '')}</div>
              <div class="notif-item-meta">${tags.map(function (tag) { return '<span class="notif-tag">' + escapeHtml(tag) + '</span>'; }).join('')}</div>
            </div>
            <div class="notif-item-time">${escapeHtml(formatDateLabel(item.created_at))}</div>
          </div>
        `;
      }).join('');
    }

    trimNotifications(list) {
      return list
        .slice()
        .sort(function (a, b) {
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        })
        .slice(-MAX_NOTIFICATIONS);
    }

    persist(dispatchEvent) {
      const shouldDispatch = dispatchEvent !== false;
      this.notifications = this.trimNotifications(this.notifications).map(this.normalizeNotification.bind(this)).filter(Boolean);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.notifications));
      localStorage.setItem('fixeo_notif_count', String(this.getUnreadCount()));
      if (shouldDispatch) this.dispatchUpdate();
    }

    dispatchUpdate() {
      try {
        window.dispatchEvent(new CustomEvent('fixeo:notifications:updated', {
          detail: {
            unread: this.getUnreadCount(),
            notifications: this.getVisibleNotifications()
          }
        }));
      } catch (error) {
        /* noop */
      }
    }

    updateBadge() {
      const unread = this.getUnreadCount();
      document.querySelectorAll('.notif-badge, .notif-count, .fixeo-gh-badge').forEach(function (badge) {
        badge.textContent = unread > 99 ? '99+' : (unread ? String(unread) : '');
        badge.classList.toggle('has-notif', unread > 0);
        badge.style.display = unread > 0 ? 'flex' : 'none';
      });
    }

    syncExternalBadges() {
      this.updateBadge();
    }

    updateUI() {
      this.updateBadge();
      if (this.panel?.classList.contains('open')) {
        this.positionPanel();
        this.renderPanel();
      }
    }

    showToast(payload) {
      if (!this.container || !payload || payload.silent) return;
      const meta = TYPE_META[payload.type] || TYPE_META.info;
      const toast = document.createElement('div');
      toast.className = 'toast ' + (payload.tone || meta.tone || 'info');
      toast.innerHTML = `
        <div class="toast-icon">${escapeHtml(payload.icon || meta.icon)}</div>
        <div class="toast-content">
          <div class="toast-title">${escapeHtml(payload.title || meta.label)}</div>
          <div class="toast-msg">${escapeHtml(payload.message || '')}</div>
        </div>
        <button type="button" class="toast-close" aria-label="Fermer">×</button>
        <div class="toast-progress"></div>
      `;
      const removeToast = function () {
        if (typeof toast.remove === 'function') {
          toast.remove();
          return;
        }
        if (toast.parentNode && typeof toast.parentNode.removeChild === 'function') {
          toast.parentNode.removeChild(toast);
        }
      };
      toast.querySelector('.toast-close')?.addEventListener('click', removeToast);
      this.container.appendChild(toast);
      window.setTimeout(function () {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(6px)';
        toast.style.transition = 'opacity .25s ease, transform .25s ease';
        window.setTimeout(removeToast, 260);
      }, TOAST_DURATION);
    }

    appendNotification(payload) {
      if (!payload || typeof payload !== 'object') return null;
      const normalized = this.normalizeNotification(payload);
      if (!normalized || !PERSISTENT_TYPES.has(normalized.type)) return null;
      if (!normalized.user_role || !normalized.user_id) return null;

      const duplicate = this.notifications.find(function (item) {
        return String(item.type) === String(normalized.type)
          && String(item.related_id || '') === String(normalized.related_id || '')
          && String(item.user_id || '') === String(normalized.user_id || '');
      });
      if (duplicate) return duplicate;

      this.notifications.push(normalized);
      this.persist();
      this.updateUI();
      if (this.matchesCurrentUser(normalized)) {
        this.showToast(normalized);
      }
      return normalized;
    }

    push(payload) {
      if (!payload || typeof payload !== 'object') return null;
      if (PERSISTENT_TYPES.has(payload.type)) {
        return this.appendNotification(payload);
      }
      const meta = TYPE_META[payload.type] || TYPE_META.info;
      const toastPayload = {
        type: payload.type || 'info',
        title: payload.title || meta.label,
        message: payload.message || payload.body || '',
        icon: payload.icon || meta.icon,
        tone: payload.tone || meta.tone,
        silent: payload.silent === true
      };
      this.showToast(toastPayload);
      return toastPayload;
    }

    createNotification(userId, message, type, options) {
      const opts = options || {};
      if (PERSISTENT_TYPES.has(type)) {
        return this.appendNotification({
          id: opts.id,
          type: type,
          title: opts.title || (TYPE_META[type]?.label || 'Notification'),
          message: message || opts.message || '',
          user_role: opts.user_role || 'artisan',
          user_id: String(opts.user_id || userId || ''),
          read: false,
          created_at: opts.created_at || new Date().toISOString(),
          related_id: String(opts.related_id || opts.mission_id || ''),
          icon: opts.icon,
          tone: opts.tone,
          action_href: opts.action_href || '',
          silent: opts.silent === true,
          meta: opts.meta || {}
        });
      }
      return this.push({
        type: type,
        title: opts.title || (TYPE_META[type]?.label || 'Notification'),
        message: message || opts.message || '',
        icon: opts.icon,
        tone: opts.tone,
        silent: opts.silent === true
      });
    }

    success(title, message) {
      this.showToast({ type: 'success', title: title || 'Succès', message: message || title || 'Action réalisée.' });
    }

    info(title, message) {
      this.showToast({ type: 'info', title: title || 'Information', message: message || title || 'Information disponible.' });
    }

    warning(title, message) {
      this.showToast({ type: 'warning', title: title || 'Attention', message: message || title || 'Attention requise.' });
    }

    error(title, message) {
      this.showToast({ type: 'error', title: title || 'Erreur', message: message || title || 'Une erreur est survenue.' });
    }

    markAsRead(notificationId) {
      const item = this.notifications.find(function (notification) {
        return String(notification.id) === String(notificationId);
      });
      if (!item || item.read) return item || null;
      item.read = true;
      this.persist();
      this.updateUI();
      return item;
    }

    markRead(notificationId) {
      return this.markAsRead(notificationId);
    }

    markAllRead() {
      const current = this.getCurrentUser();
      this.notifications.forEach(function (item) {
        if (String(item.user_role || '') === String(current.user_role || '') && String(item.user_id || '') === String(current.user_id || '')) {
          item.read = true;
        }
      });
      this.persist();
      this.updateUI();
    }

    togglePanel(force) {
      if (!this.panel) return;
      const now = Date.now();
      if (typeof force !== 'boolean' && now - this.lastToggleAt < 120) return;
      this.lastToggleAt = now;
      const shouldOpen = typeof force === 'boolean' ? force : !this.panel.classList.contains('open');
      this.panel.classList.toggle('open', shouldOpen);
      if (shouldOpen) {
        this.positionPanel();
        this.renderPanel();
      }
    }

    buildMissionPayloads(type, request) {
      if (!request || !request.id) return [];
      const artisanId = String(request.assigned_artisan_id || '').trim() || buildStableArtisanId(request.assigned_artisan);
      if (!artisanId) return [];

      const ref = formatMissionRef(request);
      const service = request.service || 'Service Fixeo';
      const city = request.city || 'Ville à préciser';
      const rating = Number(request.review_rating || 0) || 0;
      const ratingText = rating > 0 ? (rating + '/5') : '';
      const commonMeta = { mission_id: request.id, city: city, service: service };
      let title = TYPE_META[type]?.label || 'Notification';
      let message = 'Mise à jour Fixeo.';
      let artisanHref = 'dashboard-artisan.html#missions';
      let adminHref = 'admin.html';

      if (type === 'mission_accepted') {
        title = 'Mission acceptée';
        message = ref + ' a été acceptée pour ' + service + ' à ' + city + '.';
      }
      if (type === 'mission_started') {
        title = 'Mission démarrée';
        message = ref + ' est maintenant en cours.';
      }
      if (type === 'mission_completed') {
        title = 'Mission terminée';
        message = ref + ' a été marquée terminée.';
      }
      if (type === 'waiting_confirmation') {
        title = 'Confirmation client en attente';
        message = ref + ' attend la confirmation du client.';
      }
      if (type === 'mission_validated') {
        title = 'Mission validée';
        message = ref + ' a été validée par le client.';
      }
      if (type === 'commission_due') {
        title = 'Commission à payer';
        message = 'Une commission est due pour ' + ref + '.';
        artisanHref = 'dashboard-artisan.html#earnings';
      }
      if (type === 'commission_paid') {
        title = 'Commission payée';
        message = 'La commission de ' + ref + ' a été payée.';
        artisanHref = 'dashboard-artisan.html#earnings';
      }
      if (type === 'new_review') {
        title = 'Nouvel avis client';
        message = 'Nouvel avis reçu sur ' + ref + (ratingText ? ' · ' + ratingText : '.') + (request.review_comment ? ' ' + request.review_comment : '');
      }

      return [
        {
          type: type,
          title: title,
          message: message,
          user_role: 'artisan',
          user_id: artisanId,
          read: false,
          created_at: new Date().toISOString(),
          related_id: String(request.id),
          action_href: artisanHref,
          meta: commonMeta
        },
        {
          type: type,
          title: title,
          message: message,
          user_role: 'admin',
          user_id: 'admin',
          read: false,
          created_at: new Date().toISOString(),
          related_id: String(request.id),
          action_href: adminHref,
          meta: commonMeta
        }
      ];
    }

    emitMissionNotifications(type, request) {
      this.buildMissionPayloads(type, request).forEach(this.appendNotification.bind(this));
    }

    handleTransition(previous, current) {
      if (!current || !current.id) return;
      if (!current.assigned_artisan_id && !current.assigned_artisan) return;

      if ((!previous || previous.status !== 'acceptée') && current.status === 'acceptée') {
        this.emitMissionNotifications('mission_accepted', current);
      }

      if ((!previous || previous.status !== 'en_cours') && current.status === 'en_cours') {
        this.emitMissionNotifications('mission_started', current);
      }

      if ((!previous || previous.status !== 'terminée') && current.status === 'terminée') {
        this.emitMissionNotifications('mission_completed', current);
        this.emitMissionNotifications('waiting_confirmation', current);
      }

      if ((!previous || previous.status !== 'validée') && current.status === 'validée') {
        this.emitMissionNotifications('mission_validated', current);
      }

      const commissionDueNow = current.commission_status === 'à_payer' && Number(current.commission_amount || 0) > 0;
      const commissionDueBefore = previous && previous.commission_status === 'à_payer' && Number(previous.commission_amount || 0) > 0;
      if (commissionDueNow && !commissionDueBefore) {
        this.emitMissionNotifications('commission_due', current);
      }

      if ((!previous || previous.commission_status !== 'payée') && current.commission_status === 'payée') {
        this.emitMissionNotifications('commission_paid', current);
      }

      if ((!previous || previous.review_submitted !== true) && current.review_submitted === true) {
        this.emitMissionNotifications('new_review', current);
      }
    }

    handleRequestMutation(rawRequest) {
      const current = normalizeRequestLite(rawRequest);
      if (!current || !current.id) return;
      const previous = this.requestSnapshot.get(current.id) || null;
      this.handleTransition(previous, current);
      this.requestSnapshot.set(current.id, current);
      this.updateUI();
    }

    processRequestSnapshotDiff() {
      const nextSnapshot = this.buildRequestSnapshot();
      const seenIds = new Set();

      nextSnapshot.forEach((current, id) => {
        const previous = this.requestSnapshot.get(id) || null;
        seenIds.add(id);
        if (!notificationsEqual(previous, current)) {
          this.handleTransition(previous, current);
        }
      });

      this.requestSnapshot.forEach(function (_, id) {
        seenIds.add(id);
      });

      this.requestSnapshot = nextSnapshot;
      this.updateUI();
    }
  }

  const notificationSystem = new NotificationSystem();
  window.FixeoNotificationSystem = notificationSystem;
  window.notifSystem = notificationSystem;
  window.notifications = notificationSystem;
  window.createNotification = function (userId, message, type, options) {
    return notificationSystem.createNotification(userId, message, type, options);
  };
  window.markAsRead = function (notificationId) {
    return notificationSystem.markAsRead(notificationId);
  };
})(window, document);
