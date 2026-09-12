/**
 * FIXEO Enterprise Dashboard V1
 * js/enterprise-dashboard-v1.js  v1c
 *
 * Architecture:
 *   - Reads: enterprise_request_context + service_requests + enterprise_sites
 *            via Supabase anon key + user JWT (RLS enforces tenant isolation)
 *   - Writes: supabase.rpc('create_enterprise_request', {...}) — SECURITY DEFINER
 *   - Auth: FixeoSupabaseClient.ready() → supabase.auth.getSession()
 *   - No service_role key. No direct unsafe INSERTs.
 *   - Frontend role checks are UX only — backend/RLS/RPC is authority.
 *
 * RAFI Integration (v1c):
 *   - RafiClassifier: description → category/urgency suggestion (form intelligence)
 *   - RafiNarrator:   status → human-language narration (request cards)
 *   - Both modules are OPTIONAL. If unavailable, dashboard works identically.
 *   - RAFI never overrides user choices (categoryTouchedByUser / urgencyTouchedByUser).
 *   - RAFI never creates requests, decides permissions, or selects artisans.
 *
 * DO NOT:
 *   - Expose artisan personal data
 *   - Expose financial data
 *   - Perform cross-enterprise reads (enforced by RLS, but never attempted)
 *   - Use supabase.rpc('dispatch_request_v1') or similar
 */

(function (window, document) {
  'use strict';

  /* ════════════════════════════════════════════════════════════
   * CONSTANTS
   * ════════════════════════════════════════════════════════════ */

  var VERSION = 'ed1c';
  var PAGE_SIZE = 25;
  var POLL_INTERVAL_MS = 30000;  // 30s
  var RAFI_DEBOUNCE_MS = 450;    // ms after keyup before classifying
  var RAFI_MIN_CONFIDENCE = 1;   // min classifier confidence to show suggestion

  // Enterprise member roles that can create requests
  var CAN_CREATE_ROLES = ['owner', 'admin', 'operations_manager', 'site_manager', 'reporter'];

  // Status → French label + badge CSS class
  var STATUS_MAP = {
    'new':         { label: 'Recherche artisan', cls: 'ent-badge-new' },
    'assigned':    { label: 'Artisan trouvé',    cls: 'ent-badge-assigned' },
    'in_progress': { label: 'En cours',          cls: 'ent-badge-in_progress' },
    'completed':   { label: 'Terminé',           cls: 'ent-badge-completed' },
    'validated':   { label: 'Validé',            cls: 'ent-badge-validated' },
    'cancelled':   { label: 'Annulé',            cls: 'ent-badge-cancelled' },
    'no_match':    { label: 'Sans correspondance',cls: 'ent-badge-no_match' }
  };

  // RPC error reason → French message
  var ERROR_REASONS = {
    'enterprise_required':       'Compte entreprise requis.',
    'site_required':             'Veuillez sélectionner un site.',
    'enterprise_not_found':      'Compte entreprise introuvable, suspendu ou fermé.',
    'forbidden':                 'Vous n\'avez pas les droits pour créer une demande. Contactez votre administrateur.',
    'site_not_found':            'Site introuvable.',
    'site_enterprise_mismatch':  'Ce site n\'appartient pas à votre compte entreprise.',
    'site_inactive':             'Ce site est inactif. Choisissez un autre site.',
    'service_category_required': 'Veuillez sélectionner ou saisir la catégorie de service.',
    'description_required':      'Veuillez décrire le besoin (champ obligatoire).',
    'urgency_invalid':           'Valeur d\'urgence invalide.',
    'unauthenticated':           'Votre session a expiré. Veuillez vous reconnecter.',
    'internal_error':            'Erreur interne — veuillez réessayer ou contacter le support.'
  };

  /* ════════════════════════════════════════════════════════════
   * STATE
   * ════════════════════════════════════════════════════════════ */

  var state = {
    supabase:        null,      // Supabase client
    session:         null,      // Auth session
    userId:          null,      // auth.uid()
    enterprises:     [],        // [{id, name, status, role}]
    currentEnt:      null,      // {id, name, status}
    currentRole:     '',        // member role in currentEnt
    sites:           [],        // enterprise_sites for currentEnt
    requests:        [],        // loaded ERC rows
    requestsCursor:  null,      // {ts, id} cursor for deterministic pagination (D2)
    requestsHasMore: false,
    filterSite:      '',
    filterStatus:    '',
    pollTimer:       null,
    isSubmitting:    false,
    isPollInFlight:  false,     // D4: guard concurrent poll requests
    selectedUrgency: '',        // '' | 'urgent' | 'now'
    currentSection:  'requests',
    // RAFI integration state
    rafi: {
      available:           false,  // set true once modules confirmed at runtime
      debounceTimer:       null,   // input debounce timer
      categoryTouched:     false,  // user manually interacted with category select
      urgencyTouched:      false,  // user manually interacted with urgency buttons
      lastResult:          null    // last classifyIfReady result
    }
  };

  /* ════════════════════════════════════════════════════════════
   * HELPERS
   * ════════════════════════════════════════════════════════════ */

  function el(id) { return document.getElementById(id); }

  function show(id) { var e = el(id); if (e) e.style.display = ''; }
  function hide(id) { var e = el(id); if (e) e.style.display = 'none'; }
  function showBlock(id) { var e = el(id); if (e) e.style.display = 'flex'; }

  function setText(id, text) { var e = el(id); if (e) e.textContent = text; }

  function sanitize(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  function btrim(str) {
    return typeof str === 'string' ? str.trim() : '';
  }

  function relativeTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var diffMs = Date.now() - d.getTime();
    var mins = Math.floor(diffMs / 60000);
    if (mins < 1)   return 'À l\'instant';
    if (mins < 60)  return 'Il y a ' + mins + ' min';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24)   return 'Il y a ' + hrs + 'h';
    var days = Math.floor(hrs / 24);
    return 'Il y a ' + days + ' jour' + (days > 1 ? 's' : '');
  }

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function roleLabel(role) {
    var map = {
      owner:              'Propriétaire',
      admin:              'Administrateur',
      operations_manager: 'Resp. Opérations',
      site_manager:       'Resp. Site',
      reporter:           'Opérateur',
      viewer:             'Lecteur'
    };
    return map[role] || (role || 'Membre');
  }

  function canCreate(role) {
    return CAN_CREATE_ROLES.indexOf(role) !== -1;
  }

  function statusBadgeHtml(status) {
    var s = STATUS_MAP[status] || { label: status, cls: 'ent-badge-new' };
    return '<span class="fxv2-badge ' + s.cls + '">' + sanitize(s.label) + '</span>';
  }

  function urgencyHtml(urgency) {
    if (!urgency) return '';
    var map = { urgent: '⚡ Urgent', now: '🚨 Immédiat' };
    var label = map[urgency];
    if (!label) return '';
    return '<span class="fxv2-badge" style="background:rgba(245,158,11,.18);color:#f59e0b;margin-left:6px">'
      + label + '</span>';
  }

  /* ════════════════════════════════════════════════════════════
   * GATE SCREENS
   * ════════════════════════════════════════════════════════════ */

  function showGate(msg) {
    setText('ent-gate-msg', msg || 'Chargement…');
    show('ent-auth-gate');
    hide('ent-access-denied');
    hide('ent-selector');
    hide('ent-dashboard');
  }

  function showAccessDenied(reason) {
    hide('ent-auth-gate');
    hide('ent-selector');
    hide('ent-dashboard');
    el('ent-denied-reason').textContent = reason || 'Vous n\'êtes pas membre d\'un compte entreprise actif.';
    show('ent-access-denied');
  }

  function showSelector(memberships) {
    hide('ent-auth-gate');
    hide('ent-access-denied');
    hide('ent-dashboard');
    var list = el('ent-selector-list');
    list.innerHTML = '';
    memberships.forEach(function (m) {
      var btn = document.createElement('button');
      btn.className = 'ent-selector-item';
      btn.innerHTML =
        '<span class="ent-selector-item-icon">🏢</span>' +
        '<div>' +
          '<div class="ent-selector-item-name">' + sanitize(m.enterprise_accounts.name) + '</div>' +
          '<div class="ent-selector-item-role">' + sanitize(roleLabel(m.role)) + '</div>' +
        '</div>';
      btn.addEventListener('click', function () {
        selectEnterprise(m);
        showDashboard();
      });
      list.appendChild(btn);
    });
    show('ent-selector');
  }

  function showDashboard() {
    hide('ent-auth-gate');
    hide('ent-access-denied');
    hide('ent-selector');
    show('ent-dashboard');
    populateSidebar();
    loadAll();
  }

  /* ════════════════════════════════════════════════════════════
   * INIT & AUTH
   * ════════════════════════════════════════════════════════════ */

  function init() {
    showGate('Vérification de la session…');

    FixeoSupabaseClient.ready().then(function (info) {
      if (!info.configured || !info.client) {
        showAccessDenied('Le service est temporairement indisponible. Réessayez dans quelques instants.');
        return;
      }
      state.supabase = info.client;
      return checkAuth();
    }).catch(function (err) {
      console.error('[EntDashboard] SDK error', err);
      showAccessDenied('Erreur de connexion au service. Vérifiez votre connexion internet.');
    });
  }

  function checkAuth() {
    showGate('Vérification de la session…');
    return state.supabase.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) {
        // Redirect to login — pass return URL
        window.location.href = 'auth.html?redirect=enterprise-dashboard.html';
        return;
      }
      state.session = session;
      state.userId  = session.user.id;
      return checkMembership();
    });
  }

  function checkMembership() {
    showGate('Vérification de votre appartenance entreprise…');
    return state.supabase
      .from('enterprise_members')
      .select('enterprise_id, role, status, enterprise_accounts(id, name, status)')
      .eq('user_id', state.userId)
      .eq('status', 'active')
      .then(function (res) {
        if (res.error) {
          console.error('[EntDashboard] membership query error', res.error);
          showAccessDenied('Erreur lors de la vérification de vos accès. Code: ' + (res.error.code || 'UNKNOWN'));
          return;
        }
        var memberships = (res.data || []).filter(function (m) {
          return m.enterprise_accounts && m.enterprise_accounts.status === 'active';
        });
        if (!memberships.length) {
          showAccessDenied('Vous n\'êtes pas membre d\'un compte entreprise actif. Contactez votre administrateur FIXEO.');
          return;
        }
        state.enterprises = memberships;
        if (memberships.length === 1) {
          selectEnterprise(memberships[0]);
          showDashboard();
        } else {
          showSelector(memberships);
        }
      });
  }

  function selectEnterprise(membership) {
    state.currentEnt  = membership.enterprise_accounts;
    state.currentRole = membership.role || 'viewer';
    // Reset pagination/filters when switching enterprise
    state.requests       = [];
    state.requestsCursor = null;
    state.filterSite     = '';
    state.filterStatus   = '';
  }

  /* ════════════════════════════════════════════════════════════
   * SIDEBAR + HEADER
   * ════════════════════════════════════════════════════════════ */

  function populateSidebar() {
    var ent  = state.currentEnt;
    var role = state.currentRole;
    var user = state.session && state.session.user;
    var name = (user && user.user_metadata && user.user_metadata.full_name)
             || (user && user.email && user.email.split('@')[0])
             || 'Membre';

    setText('ent-sb-name',       name);
    setText('ent-sb-enterprise', ent ? ent.name : '');
    setText('ent-sb-role',       roleLabel(role));

    // Header role badge
    var badge = el('ent-header-role-badge');
    if (badge) badge.textContent = roleLabel(role);

    // Avatar initials
    var avatarEl = el('ent-sb-avatar');
    if (avatarEl) {
      var initials = name.split(' ').map(function (w) { return w[0] || ''; }).slice(0,2).join('').toUpperCase();
      avatarEl.textContent = initials || '🏢';
    }
  }

  /* ════════════════════════════════════════════════════════════
   * NAVIGATION
   * ════════════════════════════════════════════════════════════ */

  function goTo(section) {
    // Deactivate all sections
    document.querySelectorAll('.fxv2-section').forEach(function (s) {
      s.classList.remove('active');
    });
    // Activate target section
    var target = el('section-' + section);
    if (target) target.classList.add('active');
    state.currentSection = section;

    // Update nav links (sidebar)
    document.querySelectorAll('.fxv2-nav-link').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.section === section);
    });

    // Update bottom nav
    document.querySelectorAll('.fxv2-bottom-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.section === section);
    });

    // Close sidebar on mobile
    var sidebar = el('ent-sidebar');
    var overlay = el('ent-overlay');
    if (sidebar) { sidebar.classList.remove('open'); sidebar.setAttribute('aria-hidden','true'); }
    if (overlay) overlay.classList.remove('show');
    var ham = el('ent-hamburger');
    if (ham) { ham.classList.remove('open'); ham.setAttribute('aria-expanded','false'); }

    // Trigger lazy loads
    if (section === 'sites' && !el('sites-list').querySelector('.ent-site-card')) {
      loadSites();
    }
    if (section === 'new-request') {
      setupNewRequestForm();
    }
  }

  /* ════════════════════════════════════════════════════════════
   * LOAD ALL
   * ════════════════════════════════════════════════════════════ */

  function loadAll() {
    loadRequests(true);  // fresh load
    startPolling();
  }

  function startPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(function () {
      if (state.currentSection === 'requests') {
        refreshKpis();
        // Silently check for new rows since last cursor
        pollNewRequests();
      }
    }, POLL_INTERVAL_MS);
  }

  /* ════════════════════════════════════════════════════════════
   * REQUESTS — LOAD
   * ════════════════════════════════════════════════════════════ */

  function loadRequests(fresh) {
    if (!state.currentEnt) return;

    if (fresh) {
      state.requests = [];
      state.requestsCursor = null;
      renderSkeletons('requests-list');
      hide('requests-empty');
      hide('requests-error');
      hide('load-more-wrap');
    }

    var query = state.supabase
      .from('enterprise_request_context')
      .select([
        'id',
        'created_at',
        'service_request_id',
        'site_id',
        'service_requests!inner(status, service_category, city, description, urgency, created_at, tracking_ref)',
        'enterprise_sites!inner(name, city)'
      ].join(','))
      .eq('enterprise_id', state.currentEnt.id)
      .order('created_at', { ascending: false })
      .order('id',         { ascending: false })  // D2: tiebreaker for identical timestamps
      .limit(PAGE_SIZE);

    // D2: composite cursor — both created_at AND id for deterministic pagination
    if (!fresh && state.requestsCursor) {
      // Rows where (created_at < cursor.ts) OR (created_at = cursor.ts AND id < cursor.id)
      query = query.or(
        'created_at.lt.' + state.requestsCursor.ts +
        ',and(created_at.eq.' + state.requestsCursor.ts + ',id.lt.' + state.requestsCursor.id + ')'
      );
    }

    // Filters
    if (state.filterSite) {
      query = query.eq('site_id', state.filterSite);
    }
    if (state.filterStatus) {
      query = query.eq('service_requests.status', state.filterStatus);
    }

    query.then(function (res) {
      if (res.error) {
        console.error('[EntDashboard] requests error', res.error);
        showRequestsError('Erreur lors du chargement des demandes. Réessayez.');
        return;
      }
      var rows = res.data || [];
      if (fresh) {
        state.requests = rows;
      } else {
        state.requests = state.requests.concat(rows);
      }
      state.requestsHasMore = rows.length === PAGE_SIZE;
      if (rows.length > 0) {
        var last = rows[rows.length - 1];
        state.requestsCursor = { ts: last.created_at, id: last.id }; // D2: composite cursor
      }
      renderRequests(fresh);
      if (fresh) renderKpis(state.requests);
      if (fresh) loadKpisFromDb();
      el('load-more-wrap').style.display = state.requestsHasMore ? 'block' : 'none';
    });
  }

  function pollNewRequests() {
    // D4: guard against concurrent poll requests
    if (state.isPollInFlight) return;
    if (!state.currentEnt) return;
    if (!state.requests.length) return;  // nothing to compare against

    var topTs = state.requests[0].created_at;
    state.isPollInFlight = true;

    state.supabase
      .from('enterprise_request_context')
      .select('id,created_at,service_request_id,site_id,service_requests!inner(status,service_category,city,description,urgency,created_at,tracking_ref),enterprise_sites!inner(name,city)')
      .eq('enterprise_id', state.currentEnt.id)
      .gt('created_at', topTs)
      .order('created_at', { ascending: false })
      .order('id',         { ascending: false })
      .limit(10)
      .then(function (res) {
        state.isPollInFlight = false;
        if (res.error || !res.data || !res.data.length) return;
        // Prepend new rows, avoiding duplicates by id
        var existingIds = {};
        state.requests.forEach(function (r) { existingIds[r.id] = true; });
        var newRows = res.data.filter(function (r) { return !existingIds[r.id]; });
        if (!newRows.length) return;
        state.requests = newRows.concat(state.requests);
        renderRequests(true);
        loadKpisFromDb();
      })
      .catch(function () {
        state.isPollInFlight = false;
      });
  }

  /* ════════════════════════════════════════════════════════════
   * RAFI — FORM INTELLIGENCE
   * ════════════════════════════════════════════════════════════ */

  /**
   * Check whether RAFI modules are available at runtime.
   * Call once; result cached in state.rafi.available.
   */
  function rafiAvailable() {
    if (state.rafi.available) return true;
    var ok = typeof window.RafiClassifier !== 'undefined' &&
             typeof window.RafiClassifier.classifyIfReady === 'function' &&
             typeof window.RafiNarrator    !== 'undefined' &&
             typeof window.RafiNarrator.narrateEnterpriseRequest === 'function';
    state.rafi.available = ok;
    return ok;
  }

  /**
   * Translate raw classifier confidence into a display label.
   * Never expose raw numbers to users.
   */
  function rafiConfidenceLabel(confidence) {
    if (!confidence || confidence < 1) return null;
    if (confidence >= 4) return 'Forte correspondance';
    if (confidence >= 2) return 'Bonne correspondance';
    return 'Suggestion';
  }

  /**
   * Map classifier category value to the French label shown in the <select>.
   */
  function rafiCategoryLabel(value) {
    var labels = {
      plomberie:    'Plomberie',
      electricite:  'Électricité',
      serrurerie:   'Serrurerie',
      peinture:     'Peinture',
      nettoyage:    'Nettoyage',
      maconnerie:   'Maçonnerie',
      menuiserie:   'Menuiserie',
      climatisation:'Climatisation',
      demenagement: 'Déménagement',
      carrelage:    'Carrelage',
      jardinage:    'Jardinage',
      bricolage:    'Bricolage',
      autre:        'Autre'
    };
    return labels[value] || capitalize(value || '');
  }

  /**
   * Map urgency value to French label.
   */
  function rafiUrgencyLabel(value) {
    if (value === 'now')    return 'Immédiate';
    if (value === 'urgent') return 'Urgente';
    return 'Normale';
  }

  /**
   * Wire RAFI intelligence onto the new-request form.
   * Idempotent: uses a dataset flag so repeated calls add no duplicate listeners.
   * DOM identity of #req-desc is preserved (no cloneNode).
   */
  function setupRafiFormIntelligence() {
    if (!rafiAvailable()) return;

    var descEl = el('req-desc');
    var catEl  = el('req-category');
    if (!descEl || !catEl) return;

    // Reset RAFI touched flags when form is set up (new visit to section)
    state.rafi.categoryTouched = false;
    state.rafi.urgencyTouched  = false;
    state.rafi.lastResult      = null;
    hideRafiHint();

    // Idempotency guard: only attach once per element lifetime.
    // Uses a data attribute as a boolean sentinel on the element itself.
    if (!descEl.dataset.rafiListenerAttached) {
      descEl.dataset.rafiListenerAttached = '1';

      descEl.addEventListener('input', function () {
        // Debounced RAFI classification — shares the single 'input' event with char-count
        if (state.rafi.debounceTimer) clearTimeout(state.rafi.debounceTimer);
        state.rafi.debounceTimer = setTimeout(function () {
          runRafiClassify(descEl.value);
        }, RAFI_DEBOUNCE_MS);
      });
    }

    // Category touch — idempotent via data flag
    if (!catEl.dataset.rafiListenerAttached) {
      catEl.dataset.rafiListenerAttached = '1';
      catEl.addEventListener('change', function () {
        state.rafi.categoryTouched = true;
        updateRafiHintAdvisory();
      });
    }

    // Urgency buttons — idempotent via data flag on each button
    document.querySelectorAll('.ent-urgency-btn').forEach(function (btn) {
      if (!btn.dataset.rafiListenerAttached) {
        btn.dataset.rafiListenerAttached = '1';
        btn.addEventListener('click', function () {
          state.rafi.urgencyTouched = true;
          updateRafiHintAdvisory();
        });
      }
    });
  }

  /**
   * Run the classifier and update the hint UI.
   */
  function runRafiClassify(text) {
    if (!rafiAvailable()) return;
    var result;
    try {
      result = window.RafiClassifier.classifyIfReady(text);
    } catch (e) {
      console.warn('[RAFI] classifyIfReady threw:', e);
      hideRafiHint();
      return;
    }

    state.rafi.lastResult = result;

    if (!result) {
      // Text too short — clear hint
      hideRafiHint();
      return;
    }

    var cat    = result.category;
    var urg    = result.urgency;
    var hasCat = cat && cat.confidence >= RAFI_MIN_CONFIDENCE;
    var hasUrg = urg && urg.value !== 'normale';
    var isTie  = cat && cat.isTie;

    if (!hasCat && !hasUrg) {
      hideRafiHint();
      return;
    }

    renderRafiHint(result);
  }

  /**
   * Render the RAFI hint block.
   */
  function renderRafiHint(result) {
    var hintEl = el('rafi-form-hint');
    if (!hintEl) return;

    var cat = result.category;
    var urg = result.urgency;
    var isTie = cat && cat.isTie;

    var catTouched = state.rafi.categoryTouched;
    var urgTouched = state.rafi.urgencyTouched;

    // Build the inner HTML
    var html = '<div class="rafi-hint-header">' +
      '<span class="rafi-badge" aria-hidden="true">RAFI</span>' +
      '<span class="rafi-hint-title">Analyse RAFI</span>' +
    '</div>';

    html += '<div class="rafi-hint-rows">';

    // Category row
    if (cat && cat.confidence >= RAFI_MIN_CONFIDENCE) {
      var confLabel = rafiConfidenceLabel(cat.confidence);
      var catLabel  = rafiCategoryLabel(cat.value);
      if (isTie) {
        html += '<div class="rafi-hint-row rafi-hint-ambiguous">' +
          '<span class="rafi-hint-icon">&#x26A0;&#xFE0F;</span>' +
          '<span>RAFI hésite entre plusieurs métiers — vérifiez la catégorie.</span>' +
        '</div>';
      } else {
        html += '<div class="rafi-hint-row' + (catTouched ? ' rafi-hint-advisory' : '') + '">' +
          '<span class="rafi-hint-label">Métier probable</span>' +
          '<span class="rafi-hint-value">' + sanitize(catLabel) + '</span>' +
          (confLabel ? '<span class="rafi-conf-tag">' + sanitize(confLabel) + '</span>' : '') +
        '</div>';
      }
    }

    // Urgency row (only when non-normale)
    if (urg && urg.value !== 'normale') {
      var urgLabel = rafiUrgencyLabel(urg.value);
      html += '<div class="rafi-hint-row' + (urgTouched ? ' rafi-hint-advisory' : '') + '">' +
        '<span class="rafi-hint-label">Urgence probable</span>' +
        '<span class="rafi-hint-value">' + sanitize(urgLabel) + '</span>' +
      '</div>';
    }

    html += '</div>'; // .rafi-hint-rows

    // Apply button: only shown if at least one field is untouched and a non-ambiguous result
    var canApplyCat = cat && cat.confidence >= RAFI_MIN_CONFIDENCE && !isTie && !catTouched;
    var canApplyUrg = urg && urg.value !== 'normale' && !urgTouched;
    if (canApplyCat || canApplyUrg) {
      html += '<div class="rafi-hint-actions">' +
        '<button type="button" class="rafi-apply-btn" id="rafi-apply-btn" ' +
        'aria-label="Utiliser les suggestions RAFI pour la catégorie et l\'urgence">' +
        'Utiliser ces suggestions' +
        '</button>' +
      '</div>';
    }

    hintEl.innerHTML = html;
    hintEl.style.display = '';

    // Wire apply button
    var applyBtn = el('rafi-apply-btn');
    if (applyBtn) {
      applyBtn.addEventListener('click', function () {
        applyRafiSuggestion(result);
      });
    }
  }

  /**
   * Apply RAFI suggestions to form fields.
   * Respects categoryTouchedByUser / urgencyTouchedByUser flags.
   * Never silently overwrites — only called when user clicks the apply button.
   */
  function applyRafiSuggestion(result) {
    if (!result) return;
    var cat = result.category;
    var urg = result.urgency;
    var applied = [];

    // Apply category only if user has NOT manually touched it
    if (cat && cat.confidence >= RAFI_MIN_CONFIDENCE && !cat.isTie && !state.rafi.categoryTouched) {
      var catEl = el('req-category');
      if (catEl) {
        // Check the value exists in the select options
        var opts = catEl.options;
        var found = false;
        for (var i = 0; i < opts.length; i++) {
          if (opts[i].value === cat.value) { found = true; break; }
        }
        if (found) {
          catEl.value = cat.value;
          // Trigger the 'autre' input toggle if needed
          var otherInput = el('req-category-other');
          if (otherInput) otherInput.style.display = cat.value === 'autre' ? 'block' : 'none';
          // Mark as RAFI-applied (not user-touched, so remains overridable)
          applied.push('catégorie');
        }
      }
    }

    // Apply urgency only if user has NOT manually touched it
    if (urg && urg.value !== 'normale' && !state.rafi.urgencyTouched) {
      var urgVal = urg.value;
      state.selectedUrgency = urgVal;
      document.querySelectorAll('.ent-urgency-btn').forEach(function (btn) {
        btn.classList.toggle('active', (btn.dataset.value || '') === urgVal);
      });
      applied.push('urgence');
    }

    if (applied.length) {
      // Update hint to remove apply button and confirm application
      var hintEl = el('rafi-form-hint');
      if (hintEl) {
        var actionsEl = hintEl.querySelector('.rafi-hint-actions');
        if (actionsEl) {
          actionsEl.innerHTML = '<span class="rafi-applied-note">' +
            '✔ Appliqué : ' + sanitize(applied.join(' + ')) +
            ' — vous pouvez modifier manuellement.' +
          '</span>';
        }
      }
    }
  }

  /**
   * Update hint to advisory state when user has touched a field.
   */
  function updateRafiHintAdvisory() {
    var hintEl = el('rafi-form-hint');
    if (!hintEl || hintEl.style.display === 'none') return;
    if (state.rafi.lastResult) {
      renderRafiHint(state.rafi.lastResult);
    }
  }

  function hideRafiHint() {
    var hintEl = el('rafi-form-hint');
    if (hintEl) {
      hintEl.style.display = 'none';
      hintEl.innerHTML = '';
    }
  }

  /* ════════════════════════════════════════════════════════════
   * RAFI — STATUS NARRATION
   * ════════════════════════════════════════════════════════════ */

  /**
   * Return RAFI narration HTML for a request card.
   * Returns empty string if RAFI is unavailable or narration is empty.
   * Status badge is ALWAYS shown by the caller — this is supplemental only.
   *
   * @param {string} srStatus
   * @param {object} context  — {siteName, category, city, artisanName}
   */
  function rafiNarrateCard(srStatus, context) {
    if (!rafiAvailable()) return '';
    var msg;
    try {
      msg = window.RafiNarrator.narrateEnterpriseRequest(srStatus, context || {});
    } catch (e) {
      console.warn('[RAFI] narrateEnterpriseRequest threw:', e);
      return '';
    }
    if (!msg || !msg.text) return '';
    var toneClass = '';
    try {
      toneClass = window.RafiNarrator.toneClass(msg.tone);
    } catch (_) {}
    var sub = msg.sub ? '<span class="rafi-card-sub">' + sanitize(msg.sub) + '</span>' : '';
    return '<div class="rafi-card-narration ' + sanitize(toneClass) + '" aria-label="Analyse RAFI : ' + sanitize(msg.text) + '">' +
      '<span class="rafi-badge-sm" aria-hidden="true">RAFI</span>' +
      '<span class="rafi-card-text">' + sanitize(msg.text) + '</span>' +
      sub +
    '</div>';
  }

  /* ════════════════════════════════════════════════════════════
   * REQUESTS — RENDER
   * ════════════════════════════════════════════════════════════ */

  function renderRequests(replace) {
    var list = el('requests-list');
    if (!list) return;

    if (!state.requests.length) {
      list.innerHTML = '';
      hide('load-more-wrap');
      show('requests-empty');
      return;
    }

    hide('requests-empty');
    hide('requests-error');

    if (replace) {
      list.innerHTML = '';
    }

    state.requests.forEach(function (row, idx) {
      // Skip if card already rendered (for append mode)
      if (!replace && document.querySelector('[data-erc-id="' + row.id + '"]')) return;

      var sr   = row.service_requests || {};
      var site = row.enterprise_sites || {};
      var status = sr.status || 'new';
      var statusInfo = STATUS_MAP[status] || { label: status, cls: 'ent-badge-new' };

      var card = document.createElement('div');
      card.className = 'fxv2-card';
      card.setAttribute('data-status', status);
      card.setAttribute('data-erc-id', row.id);

      // RAFI narration context — only pass what is actually available
      var narrateCtx = {
        siteName: site.name  || null,
        category: sr.service_category || null,
        city:     site.city  || sr.city || null
        // artisanName: NOT available in enterprise_request_context view — omitted
        // candidateCount / deliveredCount: NOT available client-side — omitted
      };
      var rafiNarration = rafiNarrateCard(status, narrateCtx);

      card.innerHTML =
        '<div class="fxv2-card-head">' +
          '<div>' +
            '<div class="ent-card-site">🏗️ ' + sanitize(site.name || '—') + ' · ' + sanitize(site.city || '') + '</div>' +
            '<div class="fxv2-card-service">' + sanitize(capitalize(sr.service_category || '—')) + '</div>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">' +
            statusBadgeHtml(status) +
            urgencyHtml(sr.urgency) +
          '</div>' +
        '</div>' +
        (sr.description
          ? '<div class="ent-card-desc">' + sanitize(sr.description) + '</div>'
          : '') +
        (rafiNarration || '') +
        '<div class="ent-card-foot">' +
          '<span class="ent-card-age">' + relativeTime(row.created_at) + '</span>' +
          (sr.tracking_ref
            ? '<span class="ent-card-ref">#' + sanitize(sr.tracking_ref) + '</span>'
            : '') +
        '</div>';

      list.appendChild(card);
    });
  }

  /* ════════════════════════════════════════════════════════════
   * KPIS
   * ════════════════════════════════════════════════════════════ */

  function renderKpiBreakdown(rows, isCapped) {
    // Called with status-breakdown rows from the capped query.
    // kpi-total is set separately via count:exact — do NOT touch it here.
    var active = rows.filter(function (r) {
      var s = r.service_requests && r.service_requests.status;
      return s === 'new' || s === 'assigned' || s === 'in_progress';
    }).length;
    var done = rows.filter(function (r) {
      var s = r.service_requests && r.service_requests.status;
      return s === 'completed' || s === 'validated';
    }).length;
    var nomatch = rows.filter(function (r) {
      return r.service_requests && r.service_requests.status === 'no_match';
    }).length;

    // If the breakdown hit its cap, counts are a lower bound, not exact.
    // Suffix '≥' makes the approximation visible.
    setKpi('kpi-active',  isCapped ? '≥' + active  : active);
    setKpi('kpi-done',    isCapped ? '≥' + done    : done);
    setKpi('kpi-nomatch', isCapped ? '≥' + nomatch : nomatch);
  }

  /* Legacy alias kept so any remaining renderKpis() callsites do not break.
   * D3 note: renderKpis now used only for initial load from state.requests
   * (already-loaded page data); kpi-total is NOT updated from this path. */
  function renderKpis(rows) {
    renderKpiBreakdown(rows, false);
  }

  function setKpi(id, val) {
    var e = el(id);
    if (!e) return;
    e.textContent = val !== null && val !== undefined ? String(val) : '—';
    e.classList.remove('loading');
  }

  function loadKpisFromDb() {
    // KPI truth strategy:
    //   • kpi-total : count:exact + head:true → zero rows, exact server count via
    //                 PostgREST Prefer:count=exact header. Cannot overflow. No capped total.
    //   • kpi-active/done/nomatch: breakdown query with hard .limit(500) for
    //                 status counting. Capped counts are labeled as page-window (30j, ≤500).
    //                 If count hits cap (res.data.length === KPI_BREAKDOWN_LIMIT), the caller
    //                 renders "≥500" rather than a false exact number.
    if (!state.currentEnt) return;
    var since30d = new Date(Date.now() - 30*24*3600*1000).toISOString();
    var KPI_BREAKDOWN_LIMIT = 500;

    // ── EXACT TOTAL via count:exact (head:true = zero rows transferred) ──
    state.supabase
      .from('enterprise_request_context')
      .select('*', { count: 'exact', head: true })
      .eq('enterprise_id', state.currentEnt.id)
      .gte('created_at', since30d)
      .then(function (res) {
        if (res.error) return;
        // res.count is the exact server-side total — not a row count
        var total = (typeof res.count === 'number') ? res.count : null;
        setKpi('kpi-total', total !== null ? total : '—');
      });

    // ── STATUS BREAKDOWN (capped — label reflects window, not exact total) ──
    state.supabase
      .from('enterprise_request_context')
      .select('service_requests!inner(status)')
      .eq('enterprise_id', state.currentEnt.id)
      .gte('created_at', since30d)
      .limit(KPI_BREAKDOWN_LIMIT)
      .then(function (res) {
        if (res.error || !res.data) return;
        renderKpiBreakdown(res.data, res.data.length >= KPI_BREAKDOWN_LIMIT);
      });
  }

  function refreshKpis() { loadKpisFromDb(); }

  /* ════════════════════════════════════════════════════════════
   * SITES — LOAD
   * ════════════════════════════════════════════════════════════ */

  function loadSites() {
    if (!state.currentEnt) return;
    renderSkeletons('sites-list');
    hide('sites-empty');
    hide('sites-error');

    state.supabase
      .from('enterprise_sites')
      .select('id, name, city, status, created_at')
      .eq('enterprise_id', state.currentEnt.id)
      .order('name')
      .then(function (res) {
        if (res.error) {
          console.error('[EntDashboard] sites error', res.error);
          showSitesError('Erreur lors du chargement des sites.');
          return;
        }
        state.sites = res.data || [];
        renderSites();
        populateSiteDropdowns(state.sites);
      });
  }

  function renderSites() {
    var list = el('sites-list');
    if (!list) return;
    list.innerHTML = '';

    if (!state.sites.length) {
      show('sites-empty');
      return;
    }

    state.sites.forEach(function (site) {
      var isActive = site.status === 'active';
      var card = document.createElement('div');
      card.className = 'ent-site-card';
      card.innerHTML =
        '<div class="ent-site-card-left">' +
          '<div class="ent-site-name">🏗️ ' + sanitize(site.name) + '</div>' +
          '<div class="ent-site-city">📍 ' + sanitize(site.city) + '</div>' +
        '</div>' +
        '<span class="fxv2-badge ' + (isActive ? 'ent-site-active' : 'ent-site-inactive') + '">' +
          (isActive ? 'Actif' : 'Inactif') +
        '</span>';
      list.appendChild(card);
    });
  }

  function populateSiteDropdowns(sites) {
    // Filter dropdown in requests list
    var filterSiteEl = el('filter-site');
    if (filterSiteEl) {
      filterSiteEl.innerHTML = '<option value="">Tous les sites</option>';
      sites.forEach(function (site) {
        var opt = document.createElement('option');
        opt.value = site.id;
        opt.textContent = site.name + (site.status === 'inactive' ? ' (inactif)' : '');
        filterSiteEl.appendChild(opt);
      });
    }

    // Site select in new request form
    var reqSiteEl = el('req-site');
    if (reqSiteEl) {
      var activeSites = sites.filter(function (s) { return s.status === 'active'; });
      reqSiteEl.innerHTML = activeSites.length
        ? '<option value="">Sélectionnez un site</option>'
        : '<option value="">Aucun site actif disponible</option>';
      activeSites.forEach(function (site) {
        var opt = document.createElement('option');
        opt.value = site.id;
        opt.textContent = site.name + ' — ' + site.city;
        reqSiteEl.appendChild(opt);
      });
      var hint = el('site-hint');
      if (hint) {
        hint.textContent = activeSites.length
          ? activeSites.length + ' site(s) actif(s) disponible(s)'
          : 'Aucun site actif. Contactez votre administrateur.';
      }
    }
  }

  /* ════════════════════════════════════════════════════════════
   * NEW REQUEST FORM
   * ════════════════════════════════════════════════════════════ */

  function setupNewRequestForm() {
    var isViewer = !canCreate(state.currentRole);

    var viewerNotice = el('viewer-notice');
    var formWrap     = el('new-request-form-wrap');
    var submitBtn    = el('req-submit');

    if (isViewer) {
      if (viewerNotice) viewerNotice.style.display = 'flex';
      if (submitBtn)    submitBtn.disabled = true;
      if (submitBtn)    submitBtn.setAttribute('title', 'Accès en lecture seule');
    } else {
      if (viewerNotice) viewerNotice.style.display = 'none';
      if (submitBtn)    submitBtn.disabled = false;
    }

    // Load sites if not already loaded
    if (!state.sites.length) {
      var reqSiteEl = el('req-site');
      if (reqSiteEl) reqSiteEl.innerHTML = '<option value="">Chargement des sites…</option>';
      if (!state.currentEnt) return;
      state.supabase
        .from('enterprise_sites')
        .select('id, name, city, status')
        .eq('enterprise_id', state.currentEnt.id)
        .eq('status', 'active')
        .order('name')
        .then(function (res) {
          if (res.error || !res.data) {
            var reqSite = el('req-site');
            if (reqSite) reqSite.innerHTML = '<option value="">Erreur de chargement</option>';
            return;
          }
          state.sites = res.data || [];
          populateSiteDropdowns(state.sites);
        });
    } else {
      populateSiteDropdowns(state.sites);
    }

    // Char count — idempotent: data flag prevents duplicate listeners.
    // setupRafiFormIntelligence() no longer clones this element.
    var descEl = el('req-desc');
    if (descEl && !descEl.dataset.charCountAttached) {
      descEl.dataset.charCountAttached = '1';
      descEl.addEventListener('input', function () {
        setText('desc-chars', descEl.value.length);
      });
    }

    // "Autre" category shows free-text input — idempotent via data flag
    var catEl = el('req-category');
    if (catEl && !catEl.dataset.autreAttached) {
      catEl.dataset.autreAttached = '1';
      catEl.addEventListener('change', function () {
        var otherInput = el('req-category-other');
        if (otherInput) {
          otherInput.style.display = catEl.value === 'autre' ? 'block' : 'none';
          if (catEl.value !== 'autre') otherInput.value = '';
        }
      });
    }

    // Wire RAFI form intelligence (safe no-op if modules unavailable)
    setupRafiFormIntelligence();
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    if (state.isSubmitting) return;  // D1: submission lock — ignore repeated submit events
    if (!canCreate(state.currentRole)) {
      showFormError(ERROR_REASONS['forbidden']);
      return;
    }

    // Gather values
    var siteId   = el('req-site')     ? el('req-site').value           : '';
    var catEl    = el('req-category');
    var rawCat   = catEl ? catEl.value : '';
    // If "autre", use the free-text override
    if (rawCat === 'autre') {
      var otherVal = el('req-category-other') ? el('req-category-other').value : '';
      rawCat = btrim(otherVal) || 'autre';
    }
    var category = btrim(rawCat);
    var desc     = btrim(el('req-desc') ? el('req-desc').value : '');
    var urgency  = state.selectedUrgency || null;

    // Client-side validation
    clearFormErrors();
    var valid = true;

    if (!siteId) {
      showFieldError('req-site', 'category-error', 'Veuillez sélectionner un site.');
      el('req-site').classList.add('error');
      valid = false;
    }
    if (!category) {
      showFieldError('req-category', 'category-error', 'Veuillez sélectionner une catégorie.');
      el('req-category').classList.add('error');
      valid = false;
    }
    if (!desc) {
      showFieldError('req-desc', 'desc-error', 'Veuillez décrire le besoin.');
      el('req-desc').classList.add('error');
      valid = false;
    }
    if (desc && desc.length < 3) {
      showFieldError('req-desc', 'desc-error', 'La description est trop courte (minimum 3 caractères).');
      el('req-desc').classList.add('error');
      valid = false;
    }
    if (!valid) return;

    setSubmitting(true);
    hide('form-error');
    hide('form-success');

    var params = {
      p_enterprise_id:    state.currentEnt.id,
      p_site_id:          siteId,
      p_service_category: category,
      p_description:      desc
    };
    if (urgency) params.p_urgency = urgency;

    state.supabase.rpc('create_enterprise_request', params).then(function (res) {
      // D1: only call setSubmitting(false) on definitive failure paths.
      // On success: keep button locked while navigating away (no re-submit possible).
      // On network ambiguity (.catch): warn user request may already exist.

      if (res.error) {
        setSubmitting(false);  // definitive failure — safe to re-enable
        console.error('[EntDashboard] RPC error', res.error);
        var msg = res.error.message || ERROR_REASONS['internal_error'];
        showFormError(msg);
        return;
      }

      var data = res.data;
      if (!data || data.ok !== true) {
        setSubmitting(false);  // definitive failure — RPC returned structured error
        var reason = data && data.reason ? data.reason : 'internal_error';
        var humanMsg = ERROR_REASONS[reason] || ERROR_REASONS['internal_error'];
        showFormError(humanMsg);
        return;
      }

      // SUCCESS: do NOT call setSubmitting(false) — keep button locked during navigation
      // resetForm() clears fields but keeps isSubmitting=true until page navigates away
      resetForm(true);  // pass keepLocked=true
      show('form-success');
      setTimeout(function () {
        goTo('requests');
        loadRequests(true);
        // Only unlock after navigation completes
        state.isSubmitting = false;
      }, 2500);
    }).catch(function (err) {
      // D1: network ambiguity — RPC may or may not have run.
      // Do NOT silently re-enable — show a specific warning.
      state.isSubmitting = false;
      var btn     = el('req-submit');
      var btnText = el('req-submit-text');
      var spinner = el('req-submit-spinner');
      if (btn)     btn.disabled = false;
      if (btnText) btnText.textContent = 'Créer la demande';
      if (spinner) spinner.style.display = 'none';
      console.error('[EntDashboard] RPC catch', err);
      showFormError(
        'Erreur réseau — la demande a peut-être été créée. ' +
        'Vérifiez dans « Mes demandes » avant de soumettre à nouveau.'
      );
    });
  }

  function setSubmitting(isSubmitting) {
    state.isSubmitting = isSubmitting;
    var btn     = el('req-submit');
    var btnText = el('req-submit-text');
    var spinner = el('req-submit-spinner');
    if (btn)     btn.disabled   = isSubmitting;
    if (btnText) btnText.textContent = isSubmitting ? 'Envoi en cours…' : 'Créer la demande';
    if (spinner) spinner.style.display = isSubmitting ? 'inline-block' : 'none';
  }

  function resetForm(keepLocked) {
    // D1: keepLocked=true preserves isSubmitting=true during post-success navigation
    var form = el('new-request-form');
    if (form) form.reset();
    setText('desc-chars', '0');
    if (!keepLocked) state.isSubmitting = false;
    state.selectedUrgency = '';
    // Reset RAFI state on form reset
    state.rafi.categoryTouched = false;
    state.rafi.urgencyTouched  = false;
    state.rafi.lastResult      = null;
    if (state.rafi.debounceTimer) {
      clearTimeout(state.rafi.debounceTimer);
      state.rafi.debounceTimer = null;
    }
    hideRafiHint();
    document.querySelectorAll('.ent-urgency-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.value === '');
    });
    var otherInput = el('req-category-other');
    if (otherInput) otherInput.style.display = 'none';
    clearFormErrors();
  }

  function clearFormErrors() {
    hide('form-error');
    ['req-site','req-category','req-desc','req-category-other'].forEach(function (id) {
      var e = el(id);
      if (e) e.classList.remove('error');
    });
    hide('category-error');
    hide('desc-error');
  }

  function showFormError(msg) {
    var e = el('form-error');
    if (e) { e.textContent = msg; e.style.display = 'flex'; }
  }

  function showFieldError(fieldId, errorId, msg) {
    var field = el(fieldId);
    if (field) field.classList.add('error');
    var errEl = el(errorId);
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
  }

  /* ════════════════════════════════════════════════════════════
   * ERROR STATES
   * ════════════════════════════════════════════════════════════ */

  function showRequestsError(msg) {
    el('requests-list').innerHTML = '';
    el('requests-error-msg').textContent = msg || 'Erreur de chargement.';
    show('requests-error');
  }

  function showSitesError(msg) {
    el('sites-list').innerHTML = '';
    el('sites-error-msg').textContent = msg || 'Erreur de chargement.';
    show('sites-error');
  }

  /* ════════════════════════════════════════════════════════════
   * SKELETON LOADER
   * ════════════════════════════════════════════════════════════ */

  function renderSkeletons(listId) {
    var list = el(listId);
    if (!list) return;
    list.innerHTML = '';
    for (var i = 0; i < 3; i++) {
      var skel = document.createElement('div');
      skel.className = 'fxv2-skeleton-card';
      skel.innerHTML =
        '<div class="fxv2-skel fxv2-skel-title"></div>' +
        '<div class="fxv2-skel fxv2-skel-line"></div>' +
        '<div class="fxv2-skel fxv2-skel-badge" style="margin-top:8px"></div>';
      list.appendChild(skel);
    }
  }

  /* ════════════════════════════════════════════════════════════
   * EVENT WIRING
   * ════════════════════════════════════════════════════════════ */

  function wireEvents() {
    // Sidebar hamburger
    var ham     = el('ent-hamburger');
    var sidebar = el('ent-sidebar');
    var overlay = el('ent-overlay');
    if (ham && sidebar && overlay) {
      ham.addEventListener('click', function () {
        var isOpen = sidebar.classList.contains('open');
        sidebar.classList.toggle('open', !isOpen);
        sidebar.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
        overlay.classList.toggle('show', !isOpen);
        ham.classList.toggle('open', !isOpen);
        ham.setAttribute('aria-expanded', String(!isOpen));
      });
      overlay.addEventListener('click', function () {
        sidebar.classList.remove('open');
        sidebar.setAttribute('aria-hidden', 'true');
        overlay.classList.remove('show');
        ham.classList.remove('open');
        ham.setAttribute('aria-expanded', 'false');
      });
    }

    // Sidebar nav links
    document.querySelectorAll('.fxv2-nav-link[data-section]').forEach(function (btn) {
      btn.addEventListener('click', function () { goTo(btn.dataset.section); });
    });

    // Bottom nav
    document.querySelectorAll('.fxv2-bottom-btn[data-section]').forEach(function (btn) {
      btn.addEventListener('click', function () { goTo(btn.dataset.section); });
    });

    // Logout
    var logoutBtn = el('ent-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        if (state.pollTimer) clearInterval(state.pollTimer);
        state.supabase.auth.signOut().then(function () {
          window.location.href = 'auth.html';
        });
      });
    }

    // Request filters
    var filterSiteEl = el('filter-site');
    if (filterSiteEl) {
      filterSiteEl.addEventListener('change', function () {
        state.filterSite = filterSiteEl.value;
        updateFilterReset();
        loadRequests(true);
      });
    }
    var filterStatusEl = el('filter-status');
    if (filterStatusEl) {
      filterStatusEl.addEventListener('change', function () {
        state.filterStatus = filterStatusEl.value;
        updateFilterReset();
        loadRequests(true);
      });
    }
    var resetBtn = el('filter-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        state.filterSite = '';
        state.filterStatus = '';
        if (filterSiteEl)   filterSiteEl.value = '';
        if (filterStatusEl) filterStatusEl.value = '';
        updateFilterReset();
        loadRequests(true);
      });
    }

    // Load more
    var loadMoreBtn = el('load-more-btn');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', function () {
        loadRequests(false);
      });
    }

    // Retry buttons
    var reqRetryBtn = el('requests-retry-btn');
    if (reqRetryBtn) {
      reqRetryBtn.addEventListener('click', function () { loadRequests(true); });
    }
    var sitesRetryBtn = el('sites-retry-btn');
    if (sitesRetryBtn) {
      sitesRetryBtn.addEventListener('click', function () { loadSites(); });
    }

    // New request form submit
    var form = el('new-request-form');
    if (form) {
      form.addEventListener('submit', handleFormSubmit);
    }

    // Urgency buttons
    document.querySelectorAll('.ent-urgency-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.selectedUrgency = btn.dataset.value || '';
        document.querySelectorAll('.ent-urgency-btn').forEach(function (b) {
          b.classList.toggle('active', b.dataset.value === (state.selectedUrgency || ''));
        });
      });
    });

    // Cancel in new request form
    var cancelBtn = el('req-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        resetForm();
        hide('form-error');
        hide('form-success');
        goTo('requests');
      });
    }

    // "View my requests" after success
    var viewBtn = el('form-success-view');
    if (viewBtn) {
      viewBtn.addEventListener('click', function () {
        hide('form-success');
        goTo('requests');
        loadRequests(true);
      });
    }
  }

  function updateFilterReset() {
    var hasFilter = state.filterSite || state.filterStatus;
    var resetBtn = el('filter-reset');
    if (resetBtn) resetBtn.style.display = hasFilter ? '' : 'none';
  }

  /* ════════════════════════════════════════════════════════════
   * AUTH STATE CHANGE — handle token expiry
   * ════════════════════════════════════════════════════════════ */

  function listenAuthChanges() {
    if (!state.supabase) return;
    state.supabase.auth.onAuthStateChange(function (event, session) {
      if (event === 'SIGNED_OUT' || !session) {
        if (state.pollTimer) clearInterval(state.pollTimer);
        window.location.href = 'auth.html?redirect=enterprise-dashboard.html';
      }
      if (event === 'TOKEN_REFRESHED' && session) {
        state.session = session;
        state.userId  = session.user.id;
      }
    });
  }

  /* ════════════════════════════════════════════════════════════
   * PUBLIC API (for inline onclick fallbacks)
   * ════════════════════════════════════════════════════════════ */

  window.EntDashboard = {
    goTo: goTo
  };

  /* ════════════════════════════════════════════════════════════
   * BOOT
   * ════════════════════════════════════════════════════════════ */

  function boot() {
    wireEvents();
    init();

    // After Supabase is ready, wire auth listener
    FixeoSupabaseClient.ready().then(function (info) {
      if (info.configured && info.client) {
        listenAuthChanges();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window, document);
