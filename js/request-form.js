(function() {
  'use strict';

  const STORAGE_KEY = window.FixeoClientRequestsStore?.storageKey || 'fixeo_client_requests';
  const FIXEO_WHATSAPP_NUMBER = '212660484415';
  const MAX_STORED_REQUESTS = 50;
  const URGENT_EVENTS_STORAGE_KEY = 'fixeo_urgent_events';
  const MAX_URGENT_EVENTS = 250;
  const REQUEST_COPY = {
    default: {
      title: 'Décrivez votre besoin',
      subtitle: 'Recevez des offres d’artisans vérifiés rapidement',
      submit: 'Recevoir des offres maintenant',
      trust: [
        'Réponse moyenne : moins de 15 minutes',
        'Gratuit et sans engagement'
      ],
      successTitle: 'Votre demande a été publiée sur Fixeo',
      successText: 'Les artisans compatibles peuvent maintenant voir votre demande sans quitter Fixeo.'
    },
    marketplace: {
      title: 'Publiez votre demande',
      subtitle: 'Décrivez votre besoin pour recevoir plusieurs propositions rapidement',
      submit: 'Recevoir plusieurs offres',
      trust: [
        'Plusieurs artisans peuvent vous répondre',
        'Gratuit et sans engagement'
      ],
      successTitle: 'Votre demande a été publiée sur Fixeo',
      successText: 'Les artisans compatibles peuvent maintenant voir votre demande sans quitter Fixeo.'
    },
    express: {
      title: 'Demande urgente ⚡',
      subtitle: 'Lancez un parcours express pour être recontacté au plus vite par Fixeo',
      submit: 'Recevoir une prise en charge express',
      trust: [
        'Priorité urgente • rappel rapide',
        'Gratuit et sans engagement'
      ],
      successTitle: 'Votre demande a bien été publiée sur Fixeo',
      successText: 'Votre demande urgente reste dans Fixeo et peut être partagée sur WhatsApp seulement si vous le souhaitez.'
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

  function getFormPayload(form, triggerMode) {
    const urgenceValue = form.querySelector('input[name="urgence"]:checked')?.value || 'Normal';
    const serviceValue = ($('#request-problem', form)?.value || '').trim();
    const descriptionValue = ($('#request-description', form)?.value || '').trim();
    const cityValue = ($('#request-city', form)?.value || '').trim();
    const budgetValue = ($('#request-budget', form)?.value || '').trim();
    const phoneValue = ($('#request-phone', form)?.value || '').trim();
    return {
      service: serviceValue,
      problem: serviceValue,
      description: descriptionValue || 'Description à préciser',
      ville: cityValue,
      city: cityValue,
      urgence: urgenceValue,
      urgency: urgenceValue,
      budget: budgetValue,
      telephone: phoneValue,
      phone: phoneValue,
      source: triggerMode || 'default'
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

  function validateRequestPayload(payload) {
    if (!String(payload?.service || '').trim()) {
      return 'Veuillez renseigner le service demandé.';
    }
    if (!String(payload?.city || payload?.ville || '').trim()) {
      return 'Veuillez sélectionner une ville.';
    }
    if (!String(payload?.phone || payload?.telephone || '').trim()) {
      return 'Veuillez renseigner votre téléphone.';
    }
    return '';
  }

  function saveRequest(payload) {
    try {
      if (window.FixeoClientRequestsStore?.appendRequest) {
        return window.FixeoClientRequestsStore.appendRequest({
          service: payload.service || payload.problem,
          city: payload.city || payload.ville,
          description: payload.description,
          budget: payload.budget,
          phone: payload.phone || payload.telephone,
          urgency: payload.urgency || payload.urgence,
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

  function showSuccess(whatsappLink, mode) {
    const form = $('#request-form');
    const success = $('#request-success');
    const successTitle = $('#request-success h4');
    const successText = $('#request-success p');
    const whatsappBtn = $('#request-whatsapp-link');
    const copy = getModalCopy(mode);
    if (!form || !success) return;

    form.hidden = true;
    success.hidden = false;

    if (successTitle) successTitle.textContent = copy.successTitle;
    if (successText) successText.textContent = copy.successText;
    if (whatsappBtn) {
      whatsappBtn.href = whatsappLink;
      whatsappBtn.setAttribute('aria-label', mode === 'express' ? 'Partager aussi sur WhatsApp prioritaire' : 'Partager aussi sur WhatsApp');
      whatsappBtn.textContent = mode === 'express' ? 'Partager aussi sur WhatsApp prioritaire' : 'Partager aussi sur WhatsApp';
      whatsappBtn.setAttribute('target', '_self');
      whatsappBtn.setAttribute('rel', 'noopener');
      whatsappBtn.dataset.optionalShare = 'true';
    }
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

      showSuccess(whatsappLink, triggerMode);
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
      title: '⚡ Urgence — Artisan disponible maintenant',
      subtitle: 'Réponse rapide selon disponibilité des artisans.'
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
              <textarea id="express-request-problem" name="problem" rows="2" maxlength="160" placeholder="Ex : fuite d'eau, panne électrique, porte bloquée…" required></textarea>
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
            <p class="express-modal-trust">🟢 Artisans vérifiés &nbsp;·&nbsp; Réponse rapide &nbsp;·&nbsp; Gratuit</p>
          </form>
        </div>

        <div class="express-request-step express-request-step-results" data-step="results" hidden>
          <div class="express-results-intro">
            <span class="express-results-kicker">⚡ Intervention rapide – artisans prêts à vous répondre</span>
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
      list.innerHTML = '<div class="express-preview-empty">Aucun artisan n’est disponible immédiatement pour cette demande.</div>';
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
