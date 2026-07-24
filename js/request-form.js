(function() {
  'use strict';

  const STORAGE_KEY = window.FixeoClientRequestsStore?.storageKey || 'fixeo_client_requests';
  const FIXEO_WHATSAPP_NUMBER = '212660484415';
  const MAX_STORED_REQUESTS = 50;
  const URGENT_EVENTS_STORAGE_KEY = 'fixeo_urgent_events';
  const MAX_URGENT_EVENTS = 250;
  const REQUEST_COPY = {
    default: {
      title: 'Quel est le probl\u00e8me\u00a0?',
      subtitle: 'Un artisan Fixeo vous rappelle sous 30\u00a0min',
      submit: 'Envoyer ma demande',
      trust: [
        'Gratuit \u00b7 Sans engagement',
        'Paiement apr\u00e8s intervention'
      ],
      /* V2-B success state — operational coordination framing */
      successTitle: 'Fixeo coordonne votre intervention',
      successText: 'Votre demande est enregistr\u00e9e. Un artisan disponible dans votre zone sera s\u00e9lectionn\u00e9 et vous contactera pour confirmer.',
      successNotice: 'Restez joignable sur WhatsApp\u00a0\u2014 c\u2019est l\u00e0 que se fait la coordination.',
      successWaLabel: 'Rester joignable via WhatsApp',
      successWaSubLabel: 'Partager une photo ou pr\u00e9ciser l\u2019intervention'
    },
    marketplace: {
      title: 'D\u00e9crivez votre besoin',
      subtitle: 'Un artisan disponible pr\u00e8s de chez vous vous r\u00e9pond rapidement',
      submit: 'Envoyer ma demande',
      trust: [
        'Gratuit \u00b7 Sans engagement',
        'Paiement apr\u00e8s intervention'
      ],
      successTitle: 'Fixeo coordonne votre intervention',
      successText: 'Votre demande est publi\u00e9e. Les artisans disponibles dans votre secteur peuvent la consulter imm\u00e9diatement.',
      successNotice: 'Restez joignable\u00a0\u2014 vous pouvez aussi partager une photo ou votre localisation via WhatsApp pour acc\u00e9l\u00e9rer la coordination.',
      successWaLabel: 'Rester joignable via WhatsApp',
      successWaSubLabel: 'Partager une photo ou pr\u00e9ciser l\u2019intervention'
    },
    express: {
      title: 'Intervention urgente \u26a1',
      subtitle: 'Fixeo trouve un artisan disponible maintenant dans votre ville',
      submit: 'Trouver un artisan maintenant',
      trust: [
        'R\u00e9ponse rapide \u00b7 Artisan disponible',
        'Gratuit \u00b7 Sans engagement'
      ],
      successTitle: 'Fixeo mobilise un artisan',
      successText: 'Votre urgence est en cours de traitement. Fixeo recherche l\u2019artisan le plus proche disponible maintenant.',
      successNotice: '\u26a1 Restez sur WhatsApp\u00a0\u2014 la coordination se fait en temps r\u00e9el. Partagez votre localisation si possible.',
      successWaLabel: 'Coordination urgente via WhatsApp',
      successWaSubLabel: 'Envoyer ma localisation'
    }
  };
  let redirectTimer = null;
  let requestSubmitLocked = false;
  let lastRequestSubmitAt = 0;
  const REQUEST_SUBMIT_GUARD_MS = 1600;

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function getModalCopy(mode) {
    return REQUEST_COPY[mode] || REQUEST_COPY.default;
  }

  /* ── V2: Service category normalization ─────────────────────────
     Maps raw problem text → canonical service_category slug.
     Used by Smart Dispatch V2, Admin V3, and Notification Engine.
     Never throws — returns original text as fallback.
  ────────────────────────────────────────────────────────────── */
  var _SERVICE_NORM_MAP = [
    { slug: 'plomberie',     words: ['fuite','plomberie','plombier','robinet','tuyau','eau','chauffe','chauffe-eau','sanitaire','canalisation','wc','debouchage','débouchage','évier','evier','bain','douche','toilette'] },
    { slug: 'serrurerie',    words: ['serrure','serrurier','serrurerie','porte bloqu','porte bloq','bloquée','bloquee','cle','clé','clef','clef','effraction','barillet','cylindre','portail'] },
    { slug: 'electricite',   words: ['panne elec','panne élec','electricit','électricité','electricien','électricien','disjoncteur','court-circuit','courant','coupure','tableau','prise','lumiere','lumière','câble','cable','interrupteur'] },
    { slug: 'climatisation', words: ['clim','climatisation','climatiseur','froid','ventilation','reversible','réversible','pompe','chaleur'] },
    { slug: 'peinture',      words: ['peinture','peintre','facade','façade','mur','enduit','ravalement'] },
    { slug: 'menuiserie',    words: ['menuiserie','menuisier','bois','porte','placard','volet','parquet','paroi','fenetre','fenêtre'] },
    { slug: 'maconnerie',    words: ['maçonnerie','maconnerie','macon','maçon','béton','beton','carrelage','dallage','mur porteur','chape','crépi','crêpi'] },
    { slug: 'nettoyage',     words: ['nettoyage','menage','ménage','nettoyer','desinfection','désinfection','vitres'] },
    { slug: 'jardinage',     words: ['jardinage','jardinier','pelouse','haie','arrosage','jardin','taille'] },
    { slug: 'demenagement',  words: ['demenagement','déménagement','demenager','déménager','transport meuble','carton','déménage'] },
    { slug: 'plomberie',     words: ['gaz','chauffe gaz','gaz','odeur gaz'] }  /* gaz = plomberie urgence */
  ];

  function _normalizeServiceCategory(raw) {
    if (!raw) return '';
    var s = String(raw).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ').trim();
    for (var i = 0; i < _SERVICE_NORM_MAP.length; i++) {
      var entry = _SERVICE_NORM_MAP[i];
      for (var j = 0; j < entry.words.length; j++) {
        if (s.indexOf(entry.words[j]) !== -1) return entry.slug;
      }
    }
    return ''; /* unknown — caller falls back to raw text */
  }

  /* ── V2: Tracking reference generator ───────────────────────────
     Generates a short unique token for guest request tracking.
     Format: fxtrk-XXXXXXXX (8 alphanumeric chars)
  ────────────────────────────────────────────────────────────── */
  function _genTrackingRef() {
    var chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    var ref = 'fxtrk-';
    for (var i = 0; i < 8; i++) ref += chars[Math.floor(Math.random() * chars.length)];
    return ref;
  }

  function getFormPayload(form, triggerMode) {
    const urgenceValue = form.querySelector('input[name="urgence"]:checked')?.value || 'Normal';
    const serviceValue = ($('#request-problem', form)?.value || '').trim();
    const descriptionValue = ($('#request-description', form)?.value || '').trim();
    const cityValue = ($('#request-city', form)?.value || '').trim();
    const budgetValue = ($('#request-budget', form)?.value || '').trim();
    const phoneValue = ($('#request-phone', form)?.value || '').trim();
    /* V2: normalize to canonical service_category slug */
    const normalizedCategory = _normalizeServiceCategory(serviceValue) || serviceValue;
    return {
      service: normalizedCategory,           /* canonical slug for Dispatch V2 + Admin */
      problem: serviceValue,                 /* original text preserved for display */
      description: descriptionValue || 'Description à préciser',
      ville: cityValue,
      city: cityValue,
      urgence: urgenceValue,
      urgency: urgenceValue,
      budget: budgetValue,
      telephone: phoneValue,
      phone: phoneValue,
      source: triggerMode || 'default',
      _normalized_category: normalizedCategory,
      _raw_problem: serviceValue
    };
  }


  function getRequestFeedbackNode(form) {
    if (!form) return null;
    let node = form.querySelector('.request-inline-feedback');
    if (node) return node;

    node = document.createElement('div');
    node.className = 'request-inline-feedback';
    node.setAttribute('aria-live', 'polite');
    node.style.cssText = 'display:none;margin-top:10px;padding:12px 14px;border-radius:14px;font-size:.88rem;line-height:1.5;font-weight:700;text-align:center;';

    const submitBtn = form.querySelector('.request-submit-btn');
    if (submitBtn && submitBtn.parentNode) {
      submitBtn.insertAdjacentElement('afterend', node);
    } else {
      form.appendChild(node);
    }
    return node;
  }

  function setRequestFeedback(form, message, tone) {
    const node = getRequestFeedbackNode(form);
    if (!node) return;
    const isSuccess = tone === 'success';
    node.textContent = message || '';
    node.style.display = message ? 'block' : 'none';
    node.style.background = isSuccess ? 'rgba(32, 201, 151, 0.14)' : 'rgba(255, 107, 107, 0.14)';
    node.style.border = isSuccess ? '1px solid rgba(32, 201, 151, 0.32)' : '1px solid rgba(255, 107, 107, 0.32)';
    node.style.color = isSuccess ? '#8ff0c8' : '#ffd2d2';
  }

  function clearRequestFeedback(form) {
    setRequestFeedback(form, '', 'error');
  }

  /* ── Integrity V1-A: Moroccan phone normalizer ────────────
     Strips non-digits, converts 06/07... → 212 6/7...
     Returns normalized digit string (12 chars) or '' on failure.
  ────────────────────────────────────────────────────────── */
  function _normalizeMARPhone(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (d.charAt(0) === '0' && d.length >= 2) d = '212' + d.slice(1);
    return d;
  }

  /* ── Integrity V1-A: Moroccan phone validator ─────────────
     Accepts: 06/07/08/09XXXXXXXX, +212 6/7/8/9 XXXXXXXX
     Rejects: garbage, too-short, non-MAR prefixes, all-same-digit
  ────────────────────────────────────────────────────────── */
  function _isValidMARPhone(raw) {
    if (!raw || !String(raw).trim()) return false;
    var d = _normalizeMARPhone(String(raw).trim());
    if (!/^212[6-9]\d{8}$/.test(d)) return false;
    // Reject all-same-digit (0000000000, 1111111111, etc.)
    if (/^(\d)\1+$/.test(d)) return false;
    return true;
  }

  /* ── Integrity V1-A: Service description quality check ────
     Rejects: empty, < 4 chars, all-same-char, all-digits, known junk
  ────────────────────────────────────────────────────────── */
  function _isUsableService(raw) {
    var s = String(raw || '').trim();
    if (s.length < 4) return false;
    if (/^(.)\1+$/i.test(s.replace(/\s/g, ''))) return false;
    if (/^\d+$/.test(s)) return false;
    var exactJunk = ['test', 'aaa', 'aaaa', 'bbbb', 'xxx', 'xxxx', 'essai', 'demo'];
    if (exactJunk.indexOf(s.toLowerCase()) >= 0) return false;
    return true;
  }

  /* ── Integrity V1-A: Address quality check (COD/reservation path)
     Rejects: < 10 chars, all-same-char, all-digits, all-junk words
  ────────────────────────────────────────────────────────── */
  function _isUsableAddress(raw) {
    var s = String(raw || '').trim();
    if (s.length < 10) return false;
    if (/^(.)\1+$/i.test(s.replace(/\s/g, ''))) return false;
    if (/^\d+$/.test(s)) return false;
    var low = s.toLowerCase().replace(/\s+/g, ' ');
    var junkWords = ['test', 'adresse', 'address', 'aaaa', 'bbbb', 'xxxx', 'essai'];
    var words = low.split(/\s+/);
    if (words.length > 0 && words.every(function(w) {
      return junkWords.some(function(j) { return w.startsWith(j); });
    })) return false;
    return true;
  }

  function validateRequestPayload(payload) {
    var svc = String(payload?.service || '').trim();
    if (!svc) {
      return 'Veuillez renseigner le service demandé.';
    }
    /* V1-A: service quality gate */
    if (!_isUsableService(svc)) {
      return 'Décrivez votre besoin en quelques mots (ex\u00a0: fuite d\u2019eau, panne électrique).';
    }
    if (!String(payload?.city || payload?.ville || '').trim()) {
      return 'Veuillez sélectionner une ville.';
    }
    var rawPhone = String(payload?.phone || payload?.telephone || '').trim();
    if (!rawPhone) {
      return 'Veuillez renseigner votre téléphone.';
    }
    /* V1-A: Moroccan phone format gate */
    if (!_isValidMARPhone(rawPhone)) {
      return 'Vérifiez votre numéro (format\u00a0: 06 ou 07 + 8 chiffres).';
    }
    return '';
  }

  function saveRequest(payload) {
    try {
      /* V2: generate tracking ref before store write */
      var trackingRef = _genTrackingRef();

      if (window.FixeoClientRequestsStore?.appendRequest) {
        return window.FixeoClientRequestsStore.appendRequest({
          service: payload.service || payload.problem,
          city: payload.city || payload.ville,
          description: payload.description,
          budget: payload.budget,
          phone: payload.phone || payload.telephone,
          urgency: payload.urgency || payload.urgence,
          tracking_ref: trackingRef,
          viewed: false
        }) || { request: null, duplicated: false };
      }

      const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      const safeList = Array.isArray(existing) ? existing : [];
      const fallbackRequest = {
        id: Date.now(),
        service: payload.service || payload.problem || 'Service à préciser',
        description: payload.description || 'Description à préciser',
        city: payload.city || payload.ville || 'Ville à préciser',
        budget: payload.budget || '',
        phone: payload.phone || payload.telephone || '',
        urgency: payload.urgency || payload.urgence || 'Normal',
        tracking_ref: trackingRef,
        status: 'nouvelle',
        created_at: new Date().toISOString(),
        assigned_artisan: null,
        viewed: false
      };
      const latest = safeList.length ? safeList[safeList.length - 1] : null;
      const latestSignature = JSON.stringify({
        service: String(latest?.service || '').trim(),
        city: String(latest?.city || '').trim(),
        description: String(latest?.description || '').trim(),
        budget: String(latest?.budget || '').trim(),
        phone: String(latest?.phone || latest?.telephone || '').trim(),
        urgency: String(latest?.urgency || latest?.urgence || '').trim()
      });
      const nextSignature = JSON.stringify({
        service: String(fallbackRequest.service || '').trim(),
        city: String(fallbackRequest.city || '').trim(),
        description: String(fallbackRequest.description || '').trim(),
        budget: String(fallbackRequest.budget || '').trim(),
        phone: String(fallbackRequest.phone || '').trim(),
        urgency: String(fallbackRequest.urgency || '').trim()
      });
      const latestTime = Date.parse(latest?.created_at || latest?.date || '') || 0;
      if (latest && latestSignature == nextSignature && latestTime && Math.abs(Date.now() - latestTime) <= 2500) {
        return { request: latest, duplicated: true };
      }
      safeList.push(fallbackRequest);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safeList));
      return { request: fallbackRequest, duplicated: false };
    } catch (err) {
      console.warn('Fixeo request storage unavailable', err);
      return { request: null, duplicated: false };
    }
  }

  function ensureDescriptionField() {
    const form = $('#request-form');
    if (!form) return;

    const serviceInput = $('#request-problem', form);
    const serviceLabel = serviceInput?.closest('.request-field')?.querySelector('label');
    if (serviceLabel) serviceLabel.textContent = 'Service demandé';
    if (serviceInput) {
      serviceInput.placeholder = 'Ex : plomberie, électricité, peinture...';
      serviceInput.setAttribute('maxlength', '80');
    }

    if ($('#request-description', form)) return;

    const serviceField = serviceInput?.closest('.request-field');
    const descriptionField = document.createElement('div');
    descriptionField.className = 'request-field';
    descriptionField.innerHTML = `
      <label for="request-description">Description courte</label>
      <textarea id="request-description" name="description" rows="3" maxlength="180" placeholder="Décrivez brièvement votre besoin"></textarea>`;

    serviceField?.insertAdjacentElement('afterend', descriptionField);
  }

  function buildWhatsappMessage(payload) {
    const lines = ['Bonjour, je viens de publier une demande sur Fixeo :'];

    if (payload.source === 'express') {
      lines[0] = 'Bonjour, je viens de lancer une demande urgente sur Fixeo :';
    }

    if (payload.problem) lines.push('Problème : ' + payload.problem);
    if (payload.ville) lines.push('Ville : ' + payload.ville);
    if (payload.urgence) lines.push('Urgence : ' + payload.urgence);
    if (payload.telephone) lines.push('Téléphone : ' + payload.telephone);

    lines.push('');
    lines.push(payload.source === 'express'
      ? 'Pouvez-vous me recontacter en priorité avec un artisan disponible rapidement ?'
      : 'Pouvez-vous me proposer un artisan rapidement ?');

    return lines.join('\n');
  }

  function buildWhatsappLink(payload) {
    const message = buildWhatsappMessage(payload);
    return 'https://wa.me/' + FIXEO_WHATSAPP_NUMBER + '?text=' + encodeURIComponent(message);
  }


  function getUrgentAnalytics() {
    if (window.FixeoUrgentAnalytics) return window.FixeoUrgentAnalytics;

    const readEvents = () => {
      try {
        const parsed = JSON.parse(localStorage.getItem(URGENT_EVENTS_STORAGE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        return [];
      }
    };

    const api = {
      track(type, payload = {}) {
        if (!type) return null;
        const event = {
          id: `urgent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          type,
          timestamp: new Date().toISOString(),
          page: window.location.pathname.split('/').pop() || 'index.html',
          payload,
        };

        try {
          const events = readEvents();
          events.unshift(event);
          localStorage.setItem(URGENT_EVENTS_STORAGE_KEY, JSON.stringify(events.slice(0, MAX_URGENT_EVENTS)));
        } catch (error) {
          console.warn('Fixeo urgent analytics unavailable', error);
        }

        try {
          window.dispatchEvent(new CustomEvent('fixeo:urgent-event', { detail: event }));
        } catch (error) {
          /* noop */
        }

        return event;
      },
      read: readEvents,
      summarize() {
        return readEvents().reduce((acc, event) => {
          acc[event.type] = (acc[event.type] || 0) + 1;
          return acc;
        }, {});
      }
    };

    window.FixeoUrgentAnalytics = api;
    return api;
  }

  function trackUrgentEvent(type, payload = {}) {
    return getUrgentAnalytics().track(type, payload);
  }

  function clearRedirectTimer() {
    if (redirectTimer) {
      window.clearTimeout(redirectTimer);
      redirectTimer = null;
    }
  }

  function updateModalCopy(mode) {
    const modal = $('#request-modal');
    const copy = getModalCopy(mode);
    const title = $('#request-modal-title');
    const subtitle = $('#request-modal-subtitle');
    const submitBtn = $('#request-form .request-submit-btn');
    const trustCopy = $('#request-form .request-trust-copy');
    const budgetField = $('#request-budget')?.closest('.request-field');

    if (modal) modal.setAttribute('data-request-mode', mode);
    if (title) title.textContent = copy.title;
    if (subtitle) subtitle.textContent = copy.subtitle;
    if (submitBtn) submitBtn.textContent = copy.submit;
    if (budgetField) budgetField.hidden = mode === 'express';

    if (trustCopy && Array.isArray(copy.trust)) {
      trustCopy.innerHTML = copy.trust.map((line) => '<span>' + line + '</span>').join('');
    }
  }

  function resetUrgenceChoice(form, mode) {
    const urgent = form.querySelector('input[name="urgence"][value="Urgent (moins de 30 min)"]');
    const normal = form.querySelector('input[name="urgence"][value="Normal"]');

    if (mode === 'express') {
      if (urgent) urgent.checked = true;
    } else if (normal) {
      normal.checked = true;
    }
  }

  function getFirstNonEmptyValue(selectors) {
    for (const selector of selectors) {
      const field = $(selector);
      const value = typeof field?.value === 'string' ? field.value.trim() : '';
      if (value) return value;
    }
    return '';
  }

  function applyContextPrefill(mode) {
    const form = $('#request-form');
    const modal = $('#request-modal');
    if (!form || !modal) return;

    const problemInput = $('#request-problem', form);
    const citySelect = $('#request-city', form);

    resetUrgenceChoice(form, mode);

    const issueValue = getFirstNonEmptyValue([
      '#qsm-input-nlp',
      '#smart-search-input',
      '#secondary-search-input',
      '#search-input'
    ]);
    const cityValue = getFirstNonEmptyValue([
      '#qsm-select-city',
      '#filter-city',
      '#services-city-filter'
    ]);

    if (problemInput && issueValue) {
      problemInput.value = issueValue;
    }

    if (citySelect && cityValue && Array.from(citySelect.options).some((option) => option.value === cityValue)) {
      citySelect.value = cityValue;
    }

    modal.setAttribute('data-request-mode', mode);
  }

  function showSuccess(whatsappLink, mode, savedRequest) {
    /*
       V2-C: Upgraded success state with tracking ref + auth dashboard link.
       Populates the richer #request-success HTML structure:
         - .fxrva-success-title     ← copy.successTitle
         - .fxrva-success-sub       ← copy.successText
         - .fxrva-success-notice    ← copy.successNotice
         - #request-whatsapp-link   ← WA primary CTA
         - .fxrva-wa-sub-label      ← contextual secondary label
         - #fxrva-tracking-ref      ← tracking ref badge (injected if absent)
         - #fxrva-dashboard-link    ← "Voir ma demande" (auth users only, injected if absent)
       Falls back cleanly if new elements are absent.
    */
    const form = $('#request-form');
    const success = $('#request-success');
    const copy = getModalCopy(mode);
    if (!form || !success) return;

    form.hidden = true;
    success.hidden = false;

    /* ── Title ── */
    const successTitle = success.querySelector('.fxrva-success-title') ||
                         success.querySelector('h4');
    if (successTitle) successTitle.textContent = copy.successTitle;

    /* ── Sub-text ── */
    const successText = success.querySelector('.fxrva-success-sub') ||
                        success.querySelector('p');
    if (successText) successText.textContent = copy.successText;

    /* ── Notice block — coordination guidance ── */
    const noticeEl = success.querySelector('.fxrva-success-notice');
    if (noticeEl && copy.successNotice) {
      noticeEl.textContent = copy.successNotice;
      noticeEl.hidden = false;
    }

    /* ── WA primary button ── */
    const whatsappBtn = document.getElementById('request-whatsapp-link');
    if (whatsappBtn) {
      whatsappBtn.href = whatsappLink;
      whatsappBtn.setAttribute('target', '_blank');
      whatsappBtn.setAttribute('rel', 'noopener noreferrer');
      whatsappBtn.setAttribute('aria-label', copy.successWaLabel || 'Coordination via WhatsApp');
      const waIco = whatsappBtn.querySelector('.fxrva-wa-ico');
      const waMainLabel = whatsappBtn.querySelector('.fxrva-wa-main-label');
      if (waMainLabel) {
        waMainLabel.textContent = copy.successWaLabel || 'Rester joignable via WhatsApp';
      } else if (!waIco) {
        whatsappBtn.textContent = copy.successWaLabel || 'Rester joignable via WhatsApp';
      }
      delete whatsappBtn.dataset.optionalShare;
    }

    /* ── WA sub-label ── */
    const waSubLabel = success.querySelector('.fxrva-wa-sub-label');
    if (waSubLabel && copy.successWaSubLabel) {
      waSubLabel.textContent = copy.successWaSubLabel;
      waSubLabel.hidden = false;
    }

    /* ── V2-C: Tracking ref badge ────────────────────────────────
       Show ref for both guest and auth. Guests can note it down.
       Injected once and updated on each submit (modal may be reused).
    ─────────────────────────────────────────────────────────── */
    try {
      const trackRef = savedRequest && savedRequest.tracking_ref;
      let refEl = success.querySelector('#fxrva-tracking-ref');
      if (!refEl) {
        refEl = document.createElement('div');
        refEl.id = 'fxrva-tracking-ref';
        refEl.className = 'fxrva-tracking-ref';
        /* Insert before WA button */
        const waBtn = success.querySelector('#request-whatsapp-link, .fxrva-wa-primary');
        if (waBtn) waBtn.insertAdjacentElement('beforebegin', refEl);
        else success.appendChild(refEl);
      }
      if (trackRef) {
        refEl.innerHTML =
          '<span class="fxrva-ref-label">Référence demande&nbsp;:</span>' +
          '<span class="fxrva-ref-token">' + trackRef + '</span>';
        refEl.hidden = false;
      } else {
        refEl.hidden = true;
      }

      /* ── V2-C: Auth dashboard link ─────────────────────────────
         Check if user is authenticated via FixeoSupabase session.
         If yes → show "Voir ma demande dans mon espace".
         If no  → show "Gardez cette référence pour le suivi".
      ──────────────────────────────────────────────────────── */
      let linkEl = success.querySelector('#fxrva-dashboard-link');
      if (!linkEl) {
        linkEl = document.createElement('div');
        linkEl.id = 'fxrva-dashboard-link';
        linkEl.className = 'fxrva-dashboard-link';
        const newOneBtn = success.querySelector('#request-new-one, .fxrva-new-request');
        if (newOneBtn) newOneBtn.insertAdjacentElement('beforebegin', linkEl);
        else success.appendChild(linkEl);
      }

      /* Async auth check — non-blocking, updates linkEl when resolved */
      (async function() {
        try {
          var isAuth = false;
          var FS = window.FixeoSupabase;
          if (FS && FS.getClient) {
            var sb = await FS.getClient();
            var sess = await sb.auth.getSession();
            isAuth = !!(sess && sess.data && sess.data.session && sess.data.session.user);
          }
          if (isAuth) {
            linkEl.innerHTML =
              '<a href="dashboard-client.html" class="fxrva-link-dashboard">' +
              '📋 Voir ma demande dans mon espace</a>';
          } else {
            linkEl.innerHTML = trackRef
              ? '<p class="fxrva-guest-ref-hint">💾 Notez votre référence — elle vous permettra de suivre votre demande.</p>'
              : '';
          }
          linkEl.hidden = false;
        } catch (_) { linkEl.hidden = true; }
      })();
    } catch (_) { /* non-critical — success screen still works */ }
  }

  function resetRequestModal() {
    const form = $('#request-form');
    const success = $('#request-success');
    if (form) {
      form.hidden = false;
      form.reset();
      form.querySelector('.request-submit-btn')?.removeAttribute('disabled');
    }
    if (success) success.hidden = true;
    clearRequestFeedback(form);
    updateModalCopy('default');
    if (form) resetUrgenceChoice(form, 'default');
    ensureDescriptionField();
    clearRedirectTimer();
  }

  function resolveMode(trigger, forcedMode) {
    if (forcedMode) return forcedMode;
    if (trigger && typeof trigger.getAttribute === 'function') {
      return trigger.getAttribute('data-request-mode') || 'default';
    }
    return 'default';
  }

  function openRequestModal(trigger, forcedMode) {
    const mode = resolveMode(trigger, forcedMode);
    resetRequestModal();
    updateModalCopy(mode);
    applyContextPrefill(mode);

    const modal = $('#request-modal');
    if (modal) modal.setAttribute('data-request-mode', mode);
    if (window.openModal) window.openModal('request-modal');
    else modal?.classList.add('open');

    window.setTimeout(() => {
      const target = mode === 'express' ? ($('#request-problem')?.value ? $('#request-phone') : $('#request-problem')) : $('#request-problem');
      target?.focus();
    }, 60);
  }

  function bindTriggers() {
    document.querySelectorAll('[data-open-request-form="true"]').forEach((btn) => {
      if (btn.dataset.requestBound === 'true') return;
      btn.dataset.requestBound = 'true';
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        openRequestModal(btn);
      });
    });
  }

  function bindForm() {
    const form = $('#request-form');
    const newOneBtn = $('#request-new-one');
    const modal = $('#request-modal');
    const whatsappBtn = $('#request-whatsapp-link');
    const submitBtn = form?.querySelector('.request-submit-btn');
    if (!form) return;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;

      const submitBtn = form.querySelector('.request-submit-btn');
      if (submitBtn?.disabled) return;
      if (submitBtn) submitBtn.disabled = true;

      clearRequestFeedback(form);
      const now = Date.now();
      if (requestSubmitLocked || (now - lastRequestSubmitAt) < REQUEST_SUBMIT_GUARD_MS) {
        return;
      }

      const triggerMode = modal?.getAttribute('data-request-mode') || 'default';
      const payload = getFormPayload(form, triggerMode);
      const validationError = validateRequestPayload(payload);
      if (validationError) {
        setRequestFeedback(form, validationError, 'error');
        window.notifications?.error?.('Formulaire incomplet', validationError);
        return;
      }

      requestSubmitLocked = true;
      lastRequestSubmitAt = now;
      const whatsappLink = buildWhatsappLink(payload);
      const saveResult = saveRequest(payload);
      const savedRequest = saveResult?.request || null;
      const duplicated = Boolean(saveResult?.duplicated);

      if (!savedRequest) {
        setRequestFeedback(form, 'Impossible de publier la demande pour le moment.', 'error');
        window.notifications?.error?.('Publication impossible', 'Veuillez réessayer dans un instant.');
        if (submitBtn) submitBtn.disabled = false;
        window.setTimeout(() => {
          requestSubmitLocked = false;
        }, REQUEST_SUBMIT_GUARD_MS);
        return;
      }

      showSuccess(whatsappLink, triggerMode, savedRequest);
      setRequestFeedback(form, duplicated ? 'Cette demande existe déjà dans Fixeo.' : 'Votre demande a été publiée sur Fixeo', 'success');
      form.reset();
      ensureDescriptionField();
      if (submitBtn) submitBtn.disabled = false;

      window.notifications?.success?.('Votre demande a été publiée sur Fixeo', duplicated ? 'La demande existante a été conservée sans doublon.' : 'Les artisans compatibles peuvent maintenant la consulter.');

      try {
        $('#request-success')?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
      } catch (error) {
        /* noop */
      }

      try {
        window.dispatchEvent(new CustomEvent('fixeo:client-request-submit-success', {
          detail: {
            request: savedRequest,
            mode: triggerMode,
            storageKey: STORAGE_KEY,
            duplicated
          }
        }));
      } catch (error) {
        /* noop */
      }

      window.setTimeout(() => {
        requestSubmitLocked = false;
      }, REQUEST_SUBMIT_GUARD_MS);
    });

    submitBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    });

    newOneBtn?.addEventListener('click', () => {
      requestSubmitLocked = false;
      clearRequestFeedback(form);
      const currentMode = modal?.getAttribute('data-request-mode') || 'default';
      resetRequestModal();
      updateModalCopy(currentMode);
      applyContextPrefill(currentMode);
      $('#request-problem')?.focus();
    });

    whatsappBtn?.addEventListener('click', () => {
      clearRedirectTimer();
    });
  }

  function init() {
    ensureDescriptionField();
    bindTriggers();
    bindForm();
    window.FixeoClientRequest = Object.assign(window.FixeoClientRequest || {}, {
      open: openRequestModal,
      openExpress(trigger) {
        openRequestModal(trigger, 'express');
      },
      reset: resetRequestModal,
      buildWhatsappLink,
      storageKey: STORAGE_KEY
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

(function() {
  'use strict';

  const EXPRESS_MODAL_ID = 'express-modal';
  const RESULTS_SECTION_ID = 'artisans-section';
  const CONTEXT_BANNER_ID = 'urgent-results-banner';
  const FEEDBACK_ID = 'express-request-feedback';
  const RESULTS_FEEDBACK_ID = 'express-results-feedback';
  const SUMMARY_ID = 'express-request-summary';
  const PREVIEW_LIST_ID = 'express-preview-list';
  const PREVIEW_MORE_ID = 'express-preview-more';
  const VIEW_ALL_ID = 'express-view-all';
  const EDIT_ID = 'express-edit-request';
  const CANCEL_ID = 'express-cancel-request';
  const DEFAULT_NO_RESULT = 'Aucun artisan disponible pour ces critères. Modifiez vos filtres ou publiez votre demande.';
  const CITY_FALLBACKS = ['Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Tanger', 'Agadir', 'Meknès', 'Oujda'];
  const STEP_COPY = {
    form: {
      title: '⚡ Intervention urgente - Artisan disponible maintenant',
      subtitle: 'Un artisan peut vous rappeler en quelques minutes.'
    },
    results: {
      title: '⚡ Artisans disponibles immédiatement',
      subtitle: 'Nous avons trouvé des artisans disponibles pour intervenir rapidement près de vous.'
    }
  };

  let expressState = {
    step: 'form',
    problem: '',
    city: '',
    category: '',
    results: [],
    previewLimit: 0
  };
  const EXPRESS_EVENTS_STORAGE_KEY = 'fixeo_urgent_events';

  function trackUrgentEvent(type, payload = {}) {
    try {
      const raw = localStorage.getItem(EXPRESS_EVENTS_STORAGE_KEY);
      const list = Array.isArray(JSON.parse(raw || '[]')) ? JSON.parse(raw || '[]') : [];
      list.push(Object.assign({
        type,
        timestamp: new Date().toISOString(),
        page: window.location.pathname || 'index.html'
      }, payload || {}));
      localStorage.setItem(EXPRESS_EVENTS_STORAGE_KEY, JSON.stringify(list.slice(-200)));
    } catch (error) {
      console.warn('[Fixeo] urgent analytics fallback failed', error);
    }
  }

  function syncCoreModalBackdrop(isOpen) {
    const backdrop = document.querySelector('.modal-backdrop');
    if (backdrop) {
      backdrop.classList.toggle('open', Boolean(isOpen));
      backdrop.setAttribute('aria-hidden', String(!isOpen));
    }
    document.body.style.overflow = isOpen ? 'hidden' : '';
  }

  function closeCoreModal(id) {
    const modal = id ? document.getElementById(id) : null;
    modal?.classList.remove('open');
    syncCoreModalBackdrop(false);
    /* Remove body classes set by forceOpenRequestModal (mobile nav path)
       and by any header-unified / fixeo-header-global open paths.
       Without this, body.modal-open { height:100dvh; overflow:hidden }
       persists after close on iOS/Android, making the page un-scrollable. */
    document.body.classList.remove('modal-open');
    /* Restore inline style overflow in case both paths were used */
    document.body.style.overflow = '';
  }

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function norm(value) {
    return (value || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  function unique(list) {
    return [...new Set((Array.isArray(list) ? list : []).filter(Boolean))];
  }

  function escapeHtml(value) {
    const node = document.createElement('div');
    node.textContent = value == null ? '' : String(value);
    return node.innerHTML;
  }

  function getContextValue(selectors) {
    for (const selector of selectors) {
      const field = $(selector);
      const value = typeof field?.value === 'string' ? field.value.trim() : '';
      if (value) return value;
    }
    return '';
  }

  function getPreviewLimit() {
    return window.innerWidth <= 640 ? 2 : 3;
  }

  function getExpressState() {
    return Object.assign({
      step: 'form',
      problem: '',
      city: '',
      category: '',
      results: [],
      previewLimit: getPreviewLimit()
    }, expressState || {});
  }

  function getServiceLabel(artisan) {
    if (typeof window.getCategoryLabel === 'function') {
      return window.getCategoryLabel(artisan?.category, window.i18n?.lang || 'fr');
    }
    return artisan?.category || 'Artisan';
  }

  function ensureExpressModal() {
    const existing = document.getElementById(EXPRESS_MODAL_ID);
    if (existing) return existing;

    const requestCity = document.getElementById('request-city');
    const cityOptions = requestCity
      ? requestCity.innerHTML
      : ['<option value="">Choisir une ville</option>']
          .concat(CITY_FALLBACKS.map((city) => `<option value="${city}">${city}</option>`))
          .join('');

    const modal = document.createElement('div');
    modal.className = 'modal request-modal express-request-modal';
    modal.id = EXPRESS_MODAL_ID;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'express-modal-title');
    modal.setAttribute('aria-describedby', 'express-modal-subtitle');
    modal.setAttribute('data-express-step', 'form');
    modal.innerHTML = `
      <div class="modal-header request-modal-header express-request-modal-header">
        <div>
          <h3 id="express-modal-title">${STEP_COPY.form.title}</h3>
          <p id="express-modal-subtitle" class="request-modal-subtitle">${STEP_COPY.form.subtitle}</p>
        </div>
        <button class="modal-close" type="button" onclick="window.FixeoClientRequest && window.FixeoClientRequest.closeExpress ? window.FixeoClientRequest.closeExpress() : closeModal('express-modal')" aria-label="Fermer">✕</button>
      </div>
      <div class="request-modal-shell express-request-modal-shell">
        <div class="express-request-step express-request-step-form" data-step="form">
          <form id="express-request-form" class="request-form express-request-form" novalidate>
            <div class="request-field">
              <label for="express-request-problem">Que se passe-t-il ?</label>
              <textarea id="express-request-problem" name="problem" rows="2" maxlength="160" placeholder="Ex : fuite d'eau, panne électrique, porte bloquée..." required></textarea>
            </div>
            <div class="express-chips-row" role="group" aria-label="Suggestions rapides">
              <button type="button" class="express-chip" data-text="Fuite d'eau">🚰 Fuite d'eau</button>
              <button type="button" class="express-chip" data-text="Panne électrique">⚡ Panne électrique</button>
              <button type="button" class="express-chip" data-text="Porte bloquée">🚪 Porte bloquée</button>
              <button type="button" class="express-chip" data-text="Clim en panne">❄️ Clim en panne</button>
              <button type="button" class="express-chip" data-text="Chauffe-eau / gaz">🔥 Chauffe-eau / gaz</button>
              <button type="button" class="express-chip" data-text="Réparation urgente">🧰 Réparation urgente</button>
            </div>
            <div class="request-field">
              <label for="express-request-city">Ville</label>
              <select id="express-request-city" name="ville" required>${cityOptions}</select>
            </div>
            <p id="express-request-feedback" class="express-request-feedback" aria-live="polite" hidden></p>
            <button class="btn btn-primary request-submit-btn express-request-submit" type="submit">Trouver un artisan maintenant</button>
            <p class="express-modal-fomo">\ud83d\udfe2 Artisans disponibles en ce moment</p>
            <p class="express-modal-trust">Artisans vérifiés &nbsp;·&nbsp; Réponse rapide &nbsp;·&nbsp; Gratuit</p>
          </form>
        </div>

        <div class="express-request-step express-request-step-results" data-step="results" hidden>
          <div class="express-results-intro">
            <span class="express-results-kicker">⚡ Intervention rapide - artisans prêts à vous répondre</span>
            <strong class="express-results-heading">🔥 Réponse en quelques minutes</strong>
          </div>
          <div id="express-request-summary" class="express-request-summary"></div>
          <p id="express-results-feedback" class="express-results-feedback" aria-live="polite" hidden></p>
          <div id="express-preview-list" class="express-preview-list" aria-live="polite"></div>
        </div>
      </div>`;

    const requestModal = document.getElementById('request-modal');
    if (requestModal?.parentNode) requestModal.insertAdjacentElement('afterend', modal);
    else document.body.appendChild(modal);

    return modal;
  }

  function ensureResultsBanner() {
    let banner = document.getElementById(CONTEXT_BANNER_ID);
    if (banner) return banner;

    const host = document.querySelector('#artisans-section .results-header-copy') || document.querySelector('#artisans-section .results-header');
    if (!host) return null;

    banner = document.createElement('div');
    banner.id = CONTEXT_BANNER_ID;
    banner.className = 'urgent-results-banner';
    banner.hidden = true;
    banner.innerHTML = '<strong>⚡ Résultats pour votre demande urgente</strong><span class="urgent-results-banner-meta"></span>';
    host.appendChild(banner);
    return banner;
  }

  function setExpressFeedback(message) {
    const feedback = document.getElementById(FEEDBACK_ID);
    if (!feedback) return;
    feedback.textContent = message || '';
    feedback.hidden = !message;
  }

  function setResultsFeedback(message) {
    const feedback = document.getElementById(RESULTS_FEEDBACK_ID);
    if (!feedback) return;
    feedback.textContent = message || '';
    feedback.hidden = !message;
  }

  function setExpressHeader(step) {
    const copy = STEP_COPY[step] || STEP_COPY.form;
    const title = document.getElementById('express-modal-title');
    const subtitle = document.getElementById('express-modal-subtitle');
    if (title) title.textContent = copy.title;
    if (subtitle) subtitle.textContent = copy.subtitle;
  }

  function switchExpressStep(step) {
    const modal = ensureExpressModal();
    if (!modal) return;

    modal.setAttribute('data-express-step', step);
    modal.querySelectorAll('.express-request-step').forEach((view) => {
      view.hidden = view.getAttribute('data-step') !== step;
    });

    const shell = modal.querySelector('.request-modal-shell');
    if (shell) shell.scrollTop = 0;

    setExpressHeader(step);
    expressState.step = step;
  }

  function clearExpressPreview() {
    const summary = document.getElementById(SUMMARY_ID);
    const list = document.getElementById(PREVIEW_LIST_ID);
    const moreBtn = document.getElementById(PREVIEW_MORE_ID);
    if (summary) summary.innerHTML = '';
    if (list) list.innerHTML = '';
    if (moreBtn) moreBtn.hidden = true;
    setResultsFeedback('');
  }

  function resetExpressModal() {
    document.getElementById('express-request-form')?.reset();
    setExpressFeedback('');
    clearExpressPreview();
    expressState = {
      step: 'form',
      problem: '',
      city: '',
      category: '',
      results: [],
      previewLimit: getPreviewLimit()
    };
    switchExpressStep('form');
  }

  function prefillExpressModal() {
    const problemField = document.getElementById('express-request-problem');
    const cityField = document.getElementById('express-request-city');
    const state = getExpressState();
    const problemValue = state.problem || getContextValue(['#qsm-input-nlp', '#smart-search-input', '#secondary-search-input', '#search-input']);
    const cityValue = state.city || getContextValue(['#qsm-select-city', '#filter-city', '#services-city-filter', '#results-filter-city']);

    if (problemField && problemValue) problemField.value = problemValue;
    if (cityField && cityValue && Array.from(cityField.options).some((option) => option.value === cityValue)) {
      cityField.value = cityValue;
    }
  }

  function openExpressModal() {
    const modal = ensureExpressModal();
    if (!modal) return;

    resetExpressModal();
    prefillExpressModal();

    const problemValue = (document.getElementById('express-request-problem')?.value || '').trim();
    const cityValue = (document.getElementById('express-request-city')?.value || '').trim();

    if (typeof window.openModal === 'function') window.openModal(EXPRESS_MODAL_ID);
    else modal.classList.add('open');
    syncCoreModalBackdrop(true);

    trackUrgentEvent('urgent_open', {
      query: problemValue,
      city: cityValue,
      source: 'urgent_modal'
    });

    window.setTimeout(() => document.getElementById('express-request-problem')?.focus(), 60);
  }

  function closeExpressModal() {
    resetExpressModal();
    closeCoreModal(EXPRESS_MODAL_ID);
  }

  function inferUrgentCategory(problem) {
    const text = norm(problem);
    if (!text) return '';

    const rules = [
      { category: 'plomberie', keywords: ['fuite', 'eau', 'robinet', 'toilette', 'wc', 'canalisation', 'chauffe eau', 'chauffe-eau', 'evier', 'évier'] },
      { category: 'electricite', keywords: ['electricite', 'électricité', 'courant', 'prise', 'tableau', 'lumiere', 'lumière', 'disjoncteur', 'panne electrique', 'panne électrique'] },
      { category: 'serrurerie', keywords: ['serrure', 'porte', 'cle', 'clé', 'verrou'] },
      { category: 'climatisation', keywords: ['clim', 'climatisation', 'chauffage', 'vmc', 'pompe a chaleur', 'pompe à chaleur'] },
      { category: 'nettoyage', keywords: ['nettoyage', 'menage', 'ménage', 'desinfection', 'désinfection', 'vitre'] },
      { category: 'peinture', keywords: ['peinture', 'mur', 'enduit', 'plafond'] },
      { category: 'menuiserie', keywords: ['fenetre', 'fenêtre', 'placard', 'meuble', 'porte bois', 'charniere', 'charnière'] },
      { category: 'bricolage', keywords: ['fixation', 'montage', 'meuble', 'perçage', 'percage', 'petit travaux', 'petits travaux'] },
      { category: 'maconnerie', keywords: ['carrelage', 'beton', 'béton', 'fissure', 'mur', 'maconnerie', 'maçonnerie'] },
      { category: 'jardinage', keywords: ['jardin', 'pelouse', 'taille', 'arrosage'] },
      { category: 'demenagement', keywords: ['demenagement', 'déménagement', 'transport', 'camion'] }
    ];

    let best = '';
    let bestScore = 0;
    rules.forEach((rule) => {
      const score = rule.keywords.reduce((total, keyword) => total + (text.includes(norm(keyword)) ? 1 : 0), 0);
      if (score > bestScore) {
        bestScore = score;
        best = rule.category;
      }
    });

    return best;
  }

  function getUrgentRelevance(artisan, problem, category) {
    const haystacks = [artisan?.category, artisan?.name, artisan?.city, artisan?.bio?.fr].concat(Array.isArray(artisan?.skills) ? artisan.skills : []).map(norm);
    const tokens = unique(norm(problem).split(/[^a-z0-9]+/).filter((token) => token.length > 2));
    let score = 0;

    if (category && artisan?.category === category) score += 6;
    tokens.forEach((token) => {
      if (haystacks.some((entry) => entry.includes(token))) score += 1;
    });

    return score;
  }

  function getAllUrgentArtisans() {
    const artisans = Array.isArray(window.searchEngine?.artisans)
      ? window.searchEngine.artisans
      : (Array.isArray(window.ARTISANS) ? window.ARTISANS : []);

    return artisans.filter((artisan) => !artisan.status || artisan.status === 'active');
  }

  function getUrgentBaseResults(problem, city, category) {
    const artisans = getAllUrgentArtisans();
    const tokens = unique(norm(problem).split(/[^a-z0-9]+/).filter((token) => token.length > 2));

    return artisans.filter((artisan) => {
      if (city && !norm(artisan.city).includes(norm(city))) return false;

      const haystacks = [artisan?.category, artisan?.name, artisan?.bio?.fr].concat(Array.isArray(artisan?.skills) ? artisan.skills : []).map(norm);

      if (category && artisan?.category === category) return true;
      if (!tokens.length) return true;
      return tokens.some((token) => haystacks.some((entry) => entry.includes(token)));
    });
  }

  function expandUrgentResults(problem, city, category, list) {
    const activeArtisans = getAllUrgentArtisans();
    const pools = [
      Array.isArray(list) ? list : [],
      city ? activeArtisans.filter((artisan) => norm(artisan.city).includes(norm(city))) : [],
      category ? activeArtisans.filter((artisan) => artisan?.category === category) : [],
      activeArtisans
    ];
    const deduped = [];
    const seen = new Set();

    pools.forEach((pool) => {
      pool.forEach((artisan) => {
        const key = String(artisan?.id || '');
        if (!key || seen.has(key)) return;
        seen.add(key);
        deduped.push(artisan);
      });
    });

    return sortUrgentResults(deduped, problem, category);
  }

  function sortUrgentResults(list, problem, category) {
    return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
      const availabilityRankA = norm(a.availability) === 'available' ? 0 : 1;
      const availabilityRankB = norm(b.availability) === 'available' ? 0 : 1;
      if (availabilityRankA !== availabilityRankB) return availabilityRankA - availabilityRankB;

      const responseRankA = Number(a.responseTime || 999);
      const responseRankB = Number(b.responseTime || 999);
      if (responseRankA !== responseRankB) return responseRankA - responseRankB;

      const relevanceA = getUrgentRelevance(a, problem, category);
      const relevanceB = getUrgentRelevance(b, problem, category);
      if (relevanceA !== relevanceB) return relevanceB - relevanceA;

      if (Number(b.rating || 0) !== Number(a.rating || 0)) return Number(b.rating || 0) - Number(a.rating || 0);
      return Number(b.reviewCount || 0) - Number(a.reviewCount || 0);
    });
  }

  function syncUrgentFilters(city, category) {
    const hiddenCity = document.getElementById('filter-city');
    const hiddenCategory = document.getElementById('filter-category');
    const visibleCity = document.getElementById('results-filter-city');

    if (hiddenCity) hiddenCity.value = city || '';
    if (hiddenCategory) hiddenCategory.value = category || '';
    if (visibleCity && city && Array.from(visibleCity.options).some((option) => option.value === city)) {
      visibleCity.value = city;
    }
  }

  function updateUrgentContext(results, city) {
    const banner = ensureResultsBanner();
    const count = Array.isArray(results) ? results.length : 0;
    if (banner) {
      const meta = banner.querySelector('.urgent-results-banner-meta');
      banner.hidden = false;
      if (meta) {
        meta.textContent = count
          ? `${count} artisan${count > 1 ? 's' : ''}${city ? ` • ${city}` : ''}`
          : 'Aucun artisan disponible pour le moment';
      }
    }

    const noResultText = document.querySelector('#no-artisan p');
    if (noResultText) {
      if (!noResultText.dataset.defaultText) {
        noResultText.dataset.defaultText = noResultText.textContent.trim() || DEFAULT_NO_RESULT;
      }
      noResultText.textContent = count
        ? noResultText.dataset.defaultText
        : 'Aucun artisan disponible pour cette demande urgente pour le moment.';
    }
  }

  function decorateUrgentCard(card, artisan) {
    if (!card || !artisan) return;
    const badges = card.querySelector('.artisan-badges, .badges');
    if (!badges) return;

    badges.querySelectorAll('.badge.urgent-response').forEach((badge) => badge.remove());

    const availabilityBadge = badges.querySelector('.badge.available');
    if (norm(artisan.availability) === 'available') {
      if (availabilityBadge) {
        availabilityBadge.textContent = '● Disponible maintenant';
      } else {
        const badge = document.createElement('span');
        badge.className = 'badge available';
        badge.textContent = '● Disponible maintenant';
        badges.appendChild(badge);
      }
    } else if (availabilityBadge) {
      availabilityBadge.remove();
    }

    if (Number(artisan.responseTime || 0) > 0) {
      const responseBadge = document.createElement('span');
      responseBadge.className = 'badge urgent-response';
      responseBadge.textContent = '⚡ Réponse rapide';
      responseBadge.title = `Temps de réponse : ${artisan.responseTime} min`;
      badges.appendChild(responseBadge);
    }
  }

  function decorateUrgentCards(results) {
    const artisanMap = new Map((Array.isArray(results) ? results : []).map((artisan) => [String(artisan.id), artisan]));
    document.querySelectorAll('#artisans-container .artisan-card[data-id]').forEach((card) => {
      const artisan = artisanMap.get(String(card.getAttribute('data-id')));
      if (!artisan) return;
      decorateUrgentCard(card, artisan);
    });
  }

  function buildFallbackUrgentCard(artisan) {
    const safeBadges = Array.isArray(artisan?.badges) ? artisan.badges : [];
    const isAvailable = norm(artisan?.availability) === 'available';
    const isVerified = safeBadges.includes('verified') || Number(artisan?.trustScore || 0) >= 85;
    const responseLabel = Number(artisan?.responseTime || 0) > 0 ? `Réponse : ${artisan.responseTime} min` : 'Réponse rapide';
    const skills = (Array.isArray(artisan?.skills) ? artisan.skills : []).slice(0, 3);

    return `
      <article class="artisan-card other-card discover-harmonized-card result-card" data-id="${artisan.id}">
        <div class="result-top">
          <img class="artisan-avatar artisan-avatar-image" src="${escapeHtml(artisan.avatar || artisan.photo || artisan.image || 'default-avatar.jpg')}" alt="${escapeHtml(artisan.name || 'Artisan')}" loading="lazy" onerror="this.onerror=null;this.src='demo-artisan.jpg';"/>
          <div class="artisan-main artisan-identity artisan-card-heading">
            <h3 class="artisan-name">${escapeHtml(artisan.name || 'Artisan')}</h3>
            <p class="artisan-service">${escapeHtml(getServiceLabel(artisan))} • ${escapeHtml(artisan.city || 'Maroc')}</p>
            <div class="artisan-badges badges">${isVerified ? '<span class="badge verified">✔ Vérifié</span>' : ''}${isAvailable ? '<span class="badge available">● Disponible maintenant</span>' : ''}</div>
          </div>
          <div class="artisan-price-block">
            <strong>Dès ${Number(artisan.priceFrom || 150)} MAD</strong>
            <span>${escapeHtml(responseLabel)}</span>
          </div>
        </div>
        <div class="artisan-rating-row artisan-rating">
          <span>⭐ ${Number(artisan.rating || 0).toFixed(1)}</span>
          <span>(${Number(artisan.reviewCount || 0)} avis)</span>
        </div>
        <div class="artisan-skills">${skills.map((skill) => `<span>${escapeHtml(skill)}</span>`).join('')}</div>
        <div class="result-actions card-buttons">
          <button class="btn-primary btn-other-profile ssb2-btn-profile secondary-btn" type="button">Voir profil</button>
          <button class="btn-secondary btn-other-reserve ssb2-btn-reserve primary-btn fixeo-reserve-btn" type="button">Demander devis</button>
        </div>
      </article>`;
  }

  function buildPreviewCard(artisan) {
    const sourceCard = document.querySelector(`#artisans-container .artisan-card[data-id="${artisan.id}"]`);
    let card = sourceCard ? sourceCard.cloneNode(true) : null;

    if (!card) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = buildFallbackUrgentCard(artisan).trim();
      card = wrapper.firstElementChild;
    }

    if (!card) return null;

    card.classList.add('express-preview-card');
    card.removeAttribute('style');
    card.removeAttribute('onclick');
    card.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    card.querySelectorAll('.badge.urgent-response').forEach((badge) => badge.remove());
    decorateUrgentCard(card, artisan);

    const reserveBtn = card.querySelector('.btn-other-reserve');
    if (reserveBtn) {
      reserveBtn.type = 'button';
      reserveBtn.textContent = '👉 Choisir cet artisan';
      reserveBtn.setAttribute('aria-label', `Choisir ${artisan.name}`);
      reserveBtn.removeAttribute('onclick');
      reserveBtn.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const context = getExpressState();
        trackUrgentEvent('artisan_click', {
          artisanId: artisan.id,
          artisanName: artisan.name || 'Artisan',
          city: context.city || artisan.city || '',
          query: context.problem || '',
          source: 'urgent_modal_results'
        });
        closeExpressModal();
        if (typeof window.openExpressBookingModal === 'function') {
          trackUrgentEvent('conversion', {
            artisanId: artisan.id,
            artisanName: artisan.name || 'Artisan',
            city: context.city || artisan.city || '',
            query: context.problem || '',
            source: 'urgent_modal_results'
          });
          window.setTimeout(() => window.openExpressBookingModal(artisan.id), 80);
        } else if (typeof window.openBookingModal === 'function') {
          trackUrgentEvent('conversion', {
            artisanId: artisan.id,
            artisanName: artisan.name || 'Artisan',
            city: context.city || artisan.city || '',
            query: context.problem || '',
            source: 'urgent_modal_results'
          });
          window.setTimeout(() => window.openBookingModal(artisan.id), 80);
        }
      };
    }

    const profileBtn = card.querySelector('.btn-other-profile');
    if (profileBtn) {
      profileBtn.removeAttribute('onclick');
      profileBtn.remove();
    }

    const actions = card.querySelector('.result-actions, .card-buttons');
    if (actions) {
      actions.classList.add('express-preview-card-actions');
    }

    return card;
  }

  function computeUrgentResults(problem, city) {
    const category = inferUrgentCategory(problem);
    const baseResults = getUrgentBaseResults(problem, city, category);
    const results = expandUrgentResults(problem, city, category, baseResults);
    return {
      step: 'results',
      problem,
      city,
      category,
      results,
      previewLimit: getPreviewLimit()
    };
  }

  function renderExpressSummary(state) {
    const summary = document.getElementById(SUMMARY_ID);
    if (!summary) return;

    summary.innerHTML = `
      <div class="express-summary-item"><span>📍 Ville :</span><strong>${escapeHtml(state.city || 'Non précisée')}</strong></div>
      <div class="express-summary-item"><span>🛠 Besoin :</span><strong>${escapeHtml(state.problem || 'Non précisé')}</strong></div>`;
  }

  function renderExpressResults() {
    const state = getExpressState();
    const list = document.getElementById(PREVIEW_LIST_ID);
    const moreBtn = document.getElementById(PREVIEW_MORE_ID);
    if (!list) return;

    renderExpressSummary(state);
    list.innerHTML = '';
    setResultsFeedback('');

    if (!Array.isArray(state.results) || !state.results.length) {
      list.innerHTML = '<div class="express-preview-empty">Aucun artisan n\u2019est disponible imm\u00e9diatement pour cette demande.</div>';
      if (moreBtn) moreBtn.hidden = true;
      return;
    }

    const previewCount = Math.min(state.results.length, state.previewLimit || getPreviewLimit());
    const fragment = document.createDocumentFragment();
    state.results.slice(0, previewCount).forEach((artisan) => {
      const card = buildPreviewCard(artisan);
      if (card) fragment.appendChild(card);
    });
    list.appendChild(fragment);

    if (moreBtn) {
      moreBtn.hidden = state.results.length <= previewCount || previewCount >= 3;
    }
  }

  function openExpressResults(problem, city) {
    expressState = computeUrgentResults(problem, city);
    renderExpressResults();
    switchExpressStep('results');
    window.setTimeout(() => {
      const target = document.querySelector('#express-preview-list .btn-other-reserve') || document.querySelector('#express-modal .modal-close');
      target?.focus();
    }, 60);
  }

  function revealMoreExpressResults() {
    const state = getExpressState();
    expressState.previewLimit = Math.min(Math.max(state.previewLimit || getPreviewLimit(), 2) + 1, Math.min(3, state.results.length));
    renderExpressResults();
  }

  function scrollToUrgentResults() {
    const section = document.getElementById(RESULTS_SECTION_ID);
    if (!section) return;

    const navbar = document.querySelector('.navbar');
    const offset = (navbar ? navbar.getBoundingClientRect().height : 70) + 18;
    const top = section.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
  }

  function runUrgentSearch(problem, city) {
    const state = computeUrgentResults(problem, city);
    syncUrgentFilters(state.city, state.category);

    if (typeof window.renderArtisans === 'function') {
      window.renderArtisans(state.results, { skipResultsPageFilters: true });
    }

    updateUrgentContext(state.results, state.city);
    decorateUrgentCards(state.results);
    scrollToUrgentResults();
    return state.results;
  }

  function redirectToUrgentResults(problem, city) {
    const params = new URLSearchParams({
      urgent: '1',
      query: problem,
      city,
    });
    window.location.href = `results.html?${params.toString()}`;
  }

  function bindExpressForm() {
    const modal = ensureExpressModal();
    const form = $('#express-request-form', modal);
    if (!form || form.dataset.bound === 'true') return;

    form.dataset.bound = 'true';
    form.addEventListener('submit', (event) => {
      event.preventDefault();

      const problem = ($('#express-request-problem', form)?.value || '').trim();
      const city = ($('#express-request-city', form)?.value || '').trim();
      const submitBtn = form.querySelector('.request-submit-btn');

      if (!problem || !city) {
        setExpressFeedback('Merci de renseigner le problème et la ville.');
        (!problem ? $('#express-request-problem', form) : $('#express-request-city', form))?.focus();
        return;
      }

      setExpressFeedback('');
      expressState.problem = problem;
      expressState.city = city;
      trackUrgentEvent('urgent_submit', {
        query: problem,
        city,
        source: 'urgent_modal_form'
      });

      const originalLabel = submitBtn?.dataset.originalLabel || submitBtn?.textContent || 'Trouver un artisan maintenant';
      if (submitBtn) {
        submitBtn.dataset.originalLabel = originalLabel;
        submitBtn.disabled = true;
        submitBtn.setAttribute('aria-busy', 'true');
        submitBtn.textContent = 'Recherche en cours...';
      }

      window.setTimeout(() => {
        closeExpressModal();
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.removeAttribute('aria-busy');
          submitBtn.textContent = originalLabel;
        }
        redirectToUrgentResults(problem, city);
      }, 80);
    });
  }

  function bindExpressActions() {
    const modal = ensureExpressModal();
    const moreBtn = $('#' + PREVIEW_MORE_ID, modal);
    const viewAllBtn = $('#' + VIEW_ALL_ID, modal);
    const editBtn = $('#' + EDIT_ID, modal);
    const cancelBtn = $('#' + CANCEL_ID, modal);
    if (modal.dataset.actionsBound === 'true') return;

    modal.dataset.actionsBound = 'true';

    moreBtn?.addEventListener('click', () => {
      revealMoreExpressResults();
    });

    viewAllBtn?.addEventListener('click', () => {
      const state = getExpressState();
      closeExpressModal();
      window.setTimeout(() => {
        runUrgentSearch(state.problem, state.city);
      }, 80);
    });

    editBtn?.addEventListener('click', () => {
      switchExpressStep('form');
      prefillExpressModal();
      window.setTimeout(() => document.getElementById('express-request-problem')?.focus(), 40);
    });

    cancelBtn?.addEventListener('click', () => {
      closeExpressModal();
    });

    document.querySelector('.modal-backdrop')?.addEventListener('click', () => {
      const expressModal = document.getElementById(EXPRESS_MODAL_ID);
      if (expressModal?.classList.contains('open')) {
        resetExpressModal();
      }
    });
  }

  function bindChips(modal) {
    // Chip click → fill textarea (user can edit freely after)
    modal.addEventListener('click', function(e) {
      const chip = e.target.closest('.express-chip');
      if (!chip) return;
      const textarea = modal.querySelector('#express-request-problem');
      if (!textarea) return;
      textarea.value = chip.dataset.text || '';
      textarea.focus();
      // Move cursor to end
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      // Fade chip row to secondary state
      const row = modal.querySelector('.express-chips-row');
      if (row) row.classList.add('chips-used');
    });
    // Also fade when user types manually
    const textarea = modal.querySelector('#express-request-problem');
    if (textarea) {
      textarea.addEventListener('input', function() {
        const row = modal.querySelector('.express-chips-row');
        if (row && this.value.trim()) row.classList.add('chips-used');
        else if (row && !this.value.trim()) row.classList.remove('chips-used');
      });
    }
  }

  function init() {
    const modal = ensureExpressModal();
    ensureResultsBanner();
    bindExpressForm();
    bindExpressActions();
    if (modal) bindChips(modal);

    window.FixeoClientRequest = Object.assign(window.FixeoClientRequest || {}, {
      openExpress: openExpressModal,
      closeExpress: closeExpressModal,
      closeStandard: closeCoreModal,
      runUrgentSearch,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
