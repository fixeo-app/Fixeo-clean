/**
 * fixeo-rafi-os-v1.js — RAFI OS Sprint 1
 * =========================================
 * Experience layer only. Zero modifications to any existing module.
 * Listens to existing events and DOM state. Never duplicates business logic.
 *
 * Architecture:
 *   - RafiMemory: session-scoped conversation state (no backend)
 *   - RafiEntry: hero companion (desktop/tablet only)
 *   - RafiConversation: modal companion header + timeline
 *   - RafiSummary: pre-submit read-back + confirm
 *   - RafiThinking: submit→dispatch transition
 *   - RafiConfirmation: post-submit premium header
 *
 * Feature flag: window.FIXEO_RAFI_ENABLED (defaults to true)
 * Global: window.FixeoRAFI
 * CSS namespace: rfos-*
 * Idempotent: window.FixeoRAFI guard
 *
 * Load order: after fixeo-ai-request-engine.js + fixeo-request-modal-v2.js
 * Attribute: defer
 */
(function () {
  'use strict';

  /* ── Idempotency guard ─────────────────────────────────────── */
  if (window.FixeoRAFI) return;

  /* ── Feature flag ──────────────────────────────────────────── */
  if (window.FIXEO_RAFI_ENABLED === false) return;

  /* ── Asset paths ───────────────────────────────────────────── */
  var RAFI_MICRO  = 'rafi/RAFI_V2_MicroGlyph.webp';
  var RAFI_HEAD_C = 'rafi/RAFI_V2_HeadCollar_Color.webp';
  var RAFI_HEAD_K = 'rafi/RAFI_V2_HeadCollar_Core.webp';
  var RAFI_BUST   = 'rafi/RAFI_V2_Bust_Color.webp';

  /* ── DOM helpers ───────────────────────────────────────────── */
  function _el(id) { return document.getElementById(id); }
  function _q(sel, root) { return (root || document).querySelector(sel); }
  function _qs(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function _img(src, w, alt) {
    var i = document.createElement('img');
    i.src = src;
    i.width = w; i.height = w;
    i.alt = alt || '';
    i.loading = 'lazy';
    i.className = 'rafi-img';
    i.style.width = w + 'px';
    i.style.height = w + 'px';
    return i;
  }

  /* ── RAFI Memory — session-scoped conversation state ────────── */
  var _mem = {
    category:  null,   /* NLP_MAP entry {cat, icon, label} */
    isUrgent:  false,
    city:      null,
    dismissed: false,  /* user dismissed RAFI entry via sessionStorage */
    _init: function () {
      try { this.dismissed = sessionStorage.getItem('rfos_dismissed') === '1'; } catch (_) {}
      /* Seed from detected city if already known */
      try { this.city = localStorage.getItem('fixeo_detected_city') || null; } catch (_) {}
    },
    setDismissed: function () {
      this.dismissed = true;
      try { sessionStorage.setItem('rfos_dismissed', '1'); } catch (_) {}
    },
    update: function (patch) {
      if (patch.category !== undefined) this.category = patch.category;
      if (patch.isUrgent !== undefined) this.isUrgent = patch.isUrgent;
      if (patch.city     !== undefined) this.city     = patch.city;
    },
    reset: function () {
      this.category = null;
      this.isUrgent = false;
      /* city kept — user doesn't change city between requests */
    }
  };

  /* ── RAFI Text Engine — truthful, copy-only ─────────────────── */
  var _text = {
    /* Hero entry messages */
    heroIdle:      'Bonjour\u00a0! D\u00e9crivez votre probl\u00e8me et je m\u2019occupe du reste.',
    heroListening: '\u00c9coute\u2026',
    heroUrgent:    'Urgence d\u00e9tect\u00e9e\u00a0\u26a1 Je recherche un artisan disponible maintenant.',
    heroUnderstood: function (label) {
      return 'Je vois\u00a0\u2014 vous avez besoin d\u2019un\u00a0<strong>' + label + '</strong>. Dans quelle ville\u00a0?';
    },
    heroReady: function (label, city) {
      return 'Pr\u00eat\u00a0\u2014 <strong>' + label + '</strong> \u00e0 <strong>' + city + '</strong>.';
    },
    /* Modal conversation messages */
    modalWelcome:    'Quel service vous faut-il\u00a0?',
    modalService: function (label) {
      return 'Parfait\u00a0\u2014 <strong>' + label + '</strong>. Quelle est votre ville\u00a0?';
    },
    modalCity: function (label, city) {
      return '<strong>' + label + '</strong> \u00e0 <strong>' + city + '</strong>. Quelle est l\u2019urgence\u00a0?';
    },
    modalTiming: function (label, city) {
      return 'Tr\u00e8s bien. Entrez votre num\u00e9ro\u00a0\u2014 l\u2019artisan vous contacte directement.';
    },
    /* Pre-submit summary */
    summaryText: function (label, city, isUrgent) {
      var urgStr = isUrgent ? '\u2014 traitement <strong>urgent</strong>' : '';
      return 'Je recherche un\u00a0<strong>' + label + '</strong> \u00e0 <strong>' + city + '</strong>\u00a0' + urgStr + '.';
    },
    summaryFallback: 'V\u00e9rifiez votre demande et confirmez.',
    /* Thinking */
    thinking:  'Analyse de votre demande\u2026',
    /* Confirmation */
    confTitle: 'C\u2019est not\u00e9\u00a0!',
    confSub:   'Fixeo recherche le meilleur artisan disponible dans votre zone.',
    /* Urgency fallback */
    urgentModalWelcome: 'Quel est le probl\u00e8me urgent\u00a0?'
  };

  /* ── RafiEntry — hero ambient companion ─────────────────────── */
  var RafiEntry = (function () {
    var _node = null;
    var _bubbleText = null;
    var _avatarWrap = null;
    var _currentState = 'idle';

    function _build() {
      /* Container */
      var wrap = document.createElement('div');
      wrap.className = 'rfos-entry';
      wrap.setAttribute('aria-hidden', 'true'); /* decorative — screen readers get form */

      /* Avatar */
      var av = document.createElement('div');
      av.className = 'rfos-entry-avatar';
      var avImg = _img(RAFI_HEAD_K, 44, '');
      av.appendChild(avImg);

      /* Dismiss button */
      var dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'rfos-entry-dismiss';
      dismiss.setAttribute('aria-label', 'Fermer RAFI');
      dismiss.style.cssText = 'position:absolute;top:6px;right:8px;background:none;border:none;color:rgba(255,255,255,0.30);font-size:0.7rem;cursor:pointer;padding:2px 4px;line-height:1';
      dismiss.textContent = '\u2715';
      dismiss.addEventListener('click', function (e) {
        e.stopPropagation();
        _mem.setDismissed();
        wrap.style.display = 'none';
      });

      /* Bubble */
      var bubble = document.createElement('div');
      bubble.className = 'rfos-entry-bubble';
      bubble.style.position = 'relative';

      var label = document.createElement('span');
      label.className = 'rfos-bubble-label';
      label.textContent = 'RAFI';

      var text = document.createElement('span');
      text.className = 'rfos-bubble-text';
      text.innerHTML = _text.heroIdle;

      bubble.appendChild(label);
      bubble.appendChild(text);
      bubble.appendChild(dismiss);

      wrap.appendChild(av);
      wrap.appendChild(bubble);

      _node = wrap;
      _bubbleText = text;
      _avatarWrap = av;
      return wrap;
    }

    function _setState(state) {
      if (_currentState === state) return;
      _currentState = state;
      if (!_node) return;
      _node.classList.remove('rfos-entry--listening', 'rfos-entry--urgent');
      if (state === 'listening') _node.classList.add('rfos-entry--listening');
      if (state === 'urgent')    _node.classList.add('rfos-entry--urgent');
    }

    function _setText(html) {
      if (!_bubbleText) return;
      _bubbleText.style.opacity = '0';
      setTimeout(function () {
        if (_bubbleText) {
          _bubbleText.innerHTML = html;
          _bubbleText.style.opacity = '1';
        }
      }, 140);
    }

    function mount() {
      if (_mem.dismissed) return;

      /* Build if not already */
      if (!_node) _build();

      /* Insert AFTER the hero section (outside overflow:hidden).
         Target: section#home — insert between hero and #faee-v2-hero.
         Fallback: before #faee-v2-hero, then before hero-post-strip. */
      var heroSection = _q('section#home') || _q('.hero-section');
      if (heroSection) {
        heroSection.insertAdjacentElement('afterend', _node);
        return;
      }
      /* Fallback: before estimation card */
      var faee = _el('faee-v2-hero');
      if (faee) { faee.insertAdjacentElement('beforebegin', _node); return; }
      /* Final fallback: after hero-content (inside section — may be clipped) */
      var heroContent = _q('.hero-content');
      if (heroContent) heroContent.insertAdjacentElement('afterend', _node);
    }

    function onInput(text) {
      if (!_node || _mem.dismissed) return;
      if (!text || text.length < 3) {
        _setState('idle');
        _setText(_text.heroIdle);
        return;
      }
      _setState('listening');
      _setText(_text.heroListening);
    }

    function onAnalysis(category, isUrgent) {
      if (!_node || _mem.dismissed) return;
      _mem.update({ category: category, isUrgent: isUrgent });

      if (isUrgent) {
        _setState('urgent');
        _setText(_text.heroUrgent);
        return;
      }
      if (category && category.label) {
        _setState('listening');
        _setText(_text.heroUnderstood(category.label));
        return;
      }
      _setState('listening');
      _setText(_text.heroListening);
    }

    function onCityKnown(city) {
      if (!_node || _mem.dismissed) return;
      _mem.update({ city: city });
      if (_mem.category && _mem.category.label && city) {
        _setState('listening');
        _setText(_text.heroReady(_mem.category.label, city));
      }
    }

    function reset() {
      _setState('idle');
      _setText(_text.heroIdle);
    }

    return { mount: mount, onInput: onInput, onAnalysis: onAnalysis, onCityKnown: onCityKnown, reset: reset };
  })();

  /* ── RafiConversation — modal companion header ──────────────── */
  var RafiConversation = (function () {
    var _header    = null;
    var _msgEl     = null;
    var _tlSteps   = [];
    var _modal     = null;
    var _tlKeys    = ['service', 'ville', 'timing', 'contact'];
    var _tlLabels  = ['Service', 'Ville', 'Timing', 'Contact'];
    var _tlDone    = [false, false, false, false];

    function _buildTimeline() {
      var wrap = document.createElement('div');
      wrap.className = 'rfos-timeline';
      wrap.setAttribute('role', 'list');
      wrap.setAttribute('aria-label', 'Progression de votre demande');

      _tlSteps = [];
      _tlKeys.forEach(function (key, i) {
        if (i > 0) {
          var sep = document.createElement('div');
          sep.className = 'rfos-tl-sep';
          sep.setAttribute('aria-hidden', 'true');
          wrap.appendChild(sep);
        }
        var step = document.createElement('div');
        step.className = 'rfos-tl-step';
        step.setAttribute('role', 'listitem');
        step.dataset.tlKey = key;

        var dot = document.createElement('div');
        dot.className = 'rfos-tl-dot';

        var lbl = document.createElement('span');
        lbl.className = 'rfos-tl-label';
        lbl.textContent = _tlLabels[i];

        step.appendChild(dot);
        step.appendChild(lbl);
        wrap.appendChild(step);
        _tlSteps.push(step);
      });
      return wrap;
    }

    function _buildHeader(mode) {
      var isUrgent = mode === 'express';

      var wrap = document.createElement('div');
      wrap.className = 'rfos-conv-header';

      /* Avatar */
      var av = document.createElement('div');
      av.className = 'rfos-conv-avatar';
      av.setAttribute('aria-hidden', 'true');
      var avImg = _img(RAFI_HEAD_K, 38, '');
      av.appendChild(avImg);

      /* Body */
      var body = document.createElement('div');
      body.className = 'rfos-conv-body';

      var name = document.createElement('div');
      name.className = 'rfos-conv-name';
      name.textContent = 'RAFI';

      var msg = document.createElement('div');
      msg.className = 'rfos-conv-msg';
      msg.setAttribute('role', 'status');
      msg.setAttribute('aria-live', 'polite');
      msg.setAttribute('aria-atomic', 'true');
      var welcomeMsg = isUrgent ? _text.urgentModalWelcome : _text.modalWelcome;
      /* If we already know the category from hero interaction */
      if (_mem.category && _mem.category.label && !isUrgent) {
        welcomeMsg = _text.modalService(_mem.category.label);
      }
      msg.innerHTML = welcomeMsg;

      var tl = _buildTimeline();

      body.appendChild(name);
      body.appendChild(msg);
      body.appendChild(tl);

      wrap.appendChild(av);
      wrap.appendChild(body);

      _msgEl = msg;
      _header = wrap;
      _tlDone = [false, false, false, false];
      return wrap;
    }

    function _setMsg(html) {
      if (!_msgEl) return;
      _msgEl.style.opacity = '0';
      setTimeout(function () {
        if (_msgEl) { _msgEl.innerHTML = html; _msgEl.style.opacity = '1'; }
      }, 160);
    }

    function _setTLStep(idx, state) {
      /* state: 'done' | 'active' | '' */
      if (!_tlSteps[idx]) return;
      _tlSteps[idx].classList.remove('done', 'active');
      if (state) _tlSteps[idx].classList.add(state);
      /* Update ARIA */
      var states = ['Service', 'Ville', 'Timing', 'Contact'];
      var stateLabel = state === 'done' ? 'compl\u00e9t\u00e9' : (state === 'active' ? 'en cours' : '\u00e0 compl\u00e9ter');
      _tlSteps[idx].setAttribute('aria-label', states[idx] + ' \u2014 ' + stateLabel);
    }

    function stepDone(key) {
      var idx = _tlKeys.indexOf(key);
      if (idx < 0) return;
      _tlDone[idx] = true;
      _setTLStep(idx, 'done');
      /* Activate next */
      if (idx + 1 < _tlKeys.length && !_tlDone[idx + 1]) {
        _setTLStep(idx + 1, 'active');
      }
    }

    function inject(modal, mode) {
      if (modal.dataset.rfosInjected === '1') return;
      modal.dataset.rfosInjected = '1';
      _modal = modal;

      var header = _buildHeader(mode);
      /* Insert before .request-modal-shell */
      var shell = _q('.request-modal-shell', modal);
      if (shell) {
        modal.insertBefore(header, shell);
      } else {
        modal.appendChild(header);
      }
      modal.classList.add('rfos-active');

      /* Pre-fill timeline: if we already know service from hero */
      if (_mem.category) {
        stepDone('service');
        /* advance RAFI message to city step */
        _setMsg(_text.modalService(_mem.category.label));
      } else {
        _setTLStep(0, 'active');
      }
      if (_mem.city) {
        stepDone('ville');
        if (_mem.category) {
          _setMsg(_text.modalCity(_mem.category.label, _mem.city));
        }
      }
    }

    function eject(modal) {
      if (!modal) return;
      modal.dataset.rfosInjected = '';
      modal.classList.remove('rfos-active');
      var old = _q('.rfos-conv-header', modal);
      if (old) old.remove();
      _header = null;
      _msgEl  = null;
      _tlSteps = [];
      _modal   = null;
      _tlDone  = [false, false, false, false];
    }

    function onServiceSelected(label) {
      _mem.update({ category: { label: label } });
      stepDone('service');
      _setMsg(_text.modalService(label));
    }

    function onCitySelected(city) {
      _mem.update({ city: city });
      stepDone('ville');
      var label = (_mem.category && _mem.category.label) || '';
      if (label && city) _setMsg(_text.modalCity(label, city));
    }

    function onTimingSelected() {
      stepDone('timing');
      var label = (_mem.category && _mem.category.label) || '';
      var city  = _mem.city || '';
      _setMsg(_text.modalTiming(label, city));
    }

    function onPhoneEntered() {
      stepDone('contact');
    }

    return {
      inject: inject,
      eject:  eject,
      onServiceSelected: onServiceSelected,
      onCitySelected:    onCitySelected,
      onTimingSelected:  onTimingSelected,
      onPhoneEntered:    onPhoneEntered
    };
  })();

  /* ── RafiSummary — pre-submit read-back ─────────────────────── */
  var RafiSummary = (function () {
    var _node   = null;
    var _textEl = null;
    var _btn    = null;
    var _modal  = null;

    function _build() {
      var wrap = document.createElement('div');
      wrap.className = 'rfos-summary';
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', 'R\u00e9capitulatif RAFI');

      /* Avatar */
      var av = document.createElement('div');
      av.className = 'rfos-summary-avatar';
      av.setAttribute('aria-hidden', 'true');
      av.appendChild(_img(RAFI_MICRO, 30, ''));

      /* Content */
      var content = document.createElement('div');
      content.className = 'rfos-summary-content';

      var txt = document.createElement('p');
      txt.className = 'rfos-summary-text';
      txt.innerHTML = _text.summaryFallback;

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rfos-summary-confirm-btn';
      btn.textContent = 'Confirmer ma demande';
      btn.setAttribute('aria-label', 'Confirmer et envoyer ma demande');
      btn.addEventListener('click', function () {
        btn.disabled = true;
        /* Trigger the existing form submit path */
        var submitBtn = _el('request-form') && _q('.request-submit-btn', _el('request-form'));
        if (submitBtn) {
          /* Re-enable so bindForm can process */
          submitBtn.disabled = false;
          submitBtn.click();
        } else {
          var form = _el('request-form');
          if (form) {
            form.requestSubmit
              ? form.requestSubmit()
              : form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
          }
        }
      });

      content.appendChild(txt);
      content.appendChild(btn);

      wrap.appendChild(av);
      wrap.appendChild(content);

      _node   = wrap;
      _textEl = txt;
      _btn    = btn;
      return wrap;
    }

    function show(modal) {
      _modal = modal;
      var label   = (_mem.category && _mem.category.label) || '';
      var city    = _mem.city || '';
      var isUrgent = _mem.isUrgent;

      if (!_node) _build();
      if (_textEl) {
        _textEl.innerHTML = (label && city)
          ? _text.summaryText(label, city, isUrgent)
          : _text.summaryFallback;
      }
      if (_btn) _btn.disabled = false;

      /* Insert before submit button */
      var form = _el('request-form');
      if (form && !form.contains(_node)) {
        var submitBtn = _q('.request-submit-btn', form);
        if (submitBtn) submitBtn.insertAdjacentElement('beforebegin', _node);
        else form.appendChild(_node);
      }

      _node.classList.add('visible');
      if (modal) modal.classList.add('rfos-summary-active');
    }

    function hide() {
      if (_node) _node.classList.remove('visible');
      if (_modal) _modal.classList.remove('rfos-summary-active');
    }

    function reset() {
      hide();
      if (_btn) _btn.disabled = false;
    }

    return { show: show, hide: hide, reset: reset };
  })();

  /* ── RafiThinking — submit → dispatch transition ─────────────── */
  var RafiThinking = (function () {
    var _node = null;
    var _obs  = null;

    function _build() {
      var wrap = document.createElement('div');
      wrap.className = 'rfos-thinking';
      wrap.setAttribute('role', 'status');
      wrap.setAttribute('aria-live', 'polite');
      wrap.setAttribute('aria-label', 'Analyse en cours');

      var av = document.createElement('div');
      av.className = 'rfos-thinking-avatar';
      av.setAttribute('aria-hidden', 'true');
      av.appendChild(_img(RAFI_MICRO, 48, ''));

      var lbl = document.createElement('p');
      lbl.className = 'rfos-thinking-label';
      lbl.textContent = _text.thinking;

      var dots = document.createElement('div');
      dots.className = 'rfos-thinking-dots';
      dots.setAttribute('aria-hidden', 'true');
      [0, 1, 2].forEach(function () {
        var d = document.createElement('span');
        d.className = 'rfos-thinking-dot';
        dots.appendChild(d);
      });

      wrap.appendChild(av);
      wrap.appendChild(lbl);
      wrap.appendChild(dots);

      _node = wrap;
      return wrap;
    }

    function show(modal) {
      if (!_node) _build();
      var shell = _q('.request-modal-shell', modal);
      if (shell && !shell.contains(_node)) shell.insertAdjacentElement('afterbegin', _node);
      _node.classList.add('visible');
      _node.setAttribute('aria-hidden', 'false');

      /* Watch for #request-success to become visible → dismiss thinking */
      var success = _el('request-success');
      if (success) {
        _obs = new MutationObserver(function (muts) {
          muts.forEach(function (m) {
            if (m.attributeName === 'hidden' && !success.hidden) {
              hide();
              if (_obs) { _obs.disconnect(); _obs = null; }
            }
          });
        });
        _obs.observe(success, { attributes: true, attributeFilter: ['hidden'] });
      }
    }

    function hide() {
      if (_node) {
        _node.classList.remove('visible');
        _node.setAttribute('aria-hidden', 'true');
      }
      if (_obs) { _obs.disconnect(); _obs = null; }
    }

    function reset() {
      hide();
    }

    return { show: show, hide: hide, reset: reset };
  })();

  /* ── RafiConfirmation — post-submit premium header ───────────── */
  var RafiConfirmation = (function () {
    var _node = null;

    function _build(mode) {
      var isUrgent = mode === 'express';

      var wrap = document.createElement('div');
      wrap.className = 'rfos-confirmation';
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', 'Demande confirm\u00e9e');

      /* Avatar */
      var av = document.createElement('div');
      av.className = 'rfos-confirmation-avatar';
      av.setAttribute('aria-hidden', 'true');
      av.appendChild(_img(RAFI_BUST, 62, ''));

      /* Title */
      var title = document.createElement('h4');
      title.className = 'rfos-confirmation-title';
      title.textContent = _text.confTitle;

      /* Sub */
      var sub = document.createElement('p');
      sub.className = 'rfos-confirmation-sub';
      sub.textContent = isUrgent
        ? 'Fixeo mobilise l\u2019artisan le plus proche disponible maintenant.'
        : _text.confSub;

      /* Steps */
      var steps = document.createElement('div');
      steps.className = 'rfos-confirmation-steps';
      steps.setAttribute('aria-label', '\u00c9tapes de traitement');

      var stepsData = [
        { icon: '\u2713', label: 'Demande re\u00e7ue' },
        { icon: '\u2713', label: 'Artisan recherch\u00e9' },
        { icon: '\u2713', label: 'Confirmation WhatsApp' }
      ];
      stepsData.forEach(function (s, i) {
        if (i > 0) {
          var sep = document.createElement('span');
          sep.className = 'rfos-conf-sep';
          sep.textContent = '\u2192';
          sep.setAttribute('aria-hidden', 'true');
          steps.appendChild(sep);
        }
        var step = document.createElement('div');
        step.className = 'rfos-conf-step';
        var icon = document.createElement('span');
        icon.className = 'rfos-conf-step-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = s.icon;
        var lbl = document.createElement('span');
        lbl.textContent = s.label;
        step.appendChild(icon);
        step.appendChild(lbl);
        steps.appendChild(step);
      });

      wrap.appendChild(av);
      wrap.appendChild(title);
      wrap.appendChild(sub);
      wrap.appendChild(steps);

      _node = wrap;
      return wrap;
    }

    function show(success, mode) {
      if (!success) return;
      if (success.contains(_node)) return; /* idempotent */

      if (!_node || _node.dataset.mode !== mode) {
        if (_node) _node.remove();
        _build(mode);
        _node.dataset.mode = mode;
      }

      success.insertAdjacentElement('afterbegin', _node);
      /* Trigger entrance animation */
      requestAnimationFrame(function () {
        _node.classList.add('visible');
      });
    }

    function reset() {
      if (_node) _node.remove();
    }

    return { show: show, reset: reset };
  })();

  /* ── Hero input watcher ─────────────────────────────────────── */
  function _watchHeroInput() {
    /* Wait for QSM to inject #qsm-input-nlp */
    var attempts = 0;
    function _try() {
      var input = _el('qsm-input-nlp');
      if (!input) {
        if (++attempts < 30) setTimeout(_try, 300);
        return;
      }
      input.addEventListener('input', function () {
        var text = input.value || '';
        RafiEntry.onInput(text);
        if (text.length >= 3 && window.FixeoAIRE) {
          var cat   = window.FixeoAIRE.detect(text);
          var urg   = cat ? window.FixeoAIRE.detectUrgency(text, cat) : false;
          RafiEntry.onAnalysis(cat || null, urg);
          if (cat) _mem.update({ category: cat, isUrgent: urg });
        }
      });
      /* Check city select */
      var citySelect = _el('qsm-select-city');
      if (citySelect) {
        citySelect.addEventListener('change', function () {
          if (citySelect.value) {
            _mem.update({ city: citySelect.value });
            RafiEntry.onCityKnown(citySelect.value);
          }
        });
      }
    }
    _try();
  }

  /* ── Modal watcher ──────────────────────────────────────────── */
  function _watchModal() {
    var modal = _el('request-modal');
    if (!modal) return;

    var obs = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.attributeName !== 'class' && m.attributeName !== 'data-request-mode') return;
        var isOpen = modal.classList.contains('open');
        var mode   = modal.getAttribute('data-request-mode') || 'default';

        if (isOpen) {
          /* +70ms: after fixeo-request-modal-v2.js upgradeModal() at +30ms */
          setTimeout(function () {
            RafiConversation.inject(modal, mode);
            _wireModalInputs(modal);
          }, 70);
        } else {
          /* Modal closed — clean up */
          RafiConversation.eject(modal);
          RafiSummary.reset();
          RafiThinking.reset();
          _mem.reset();
          RafiEntry.reset();
        }
      });
    });

    obs.observe(modal, { attributes: true, attributeFilter: ['class', 'data-request-mode'] });

    /* Submit success event — show confirmation */
    window.addEventListener('fixeo:client-request-submit-success', function (e) {
      var mode = (e.detail && e.detail.mode) || 'default';
      /* Small delay — showSuccess() may still be running */
      setTimeout(function () {
        var success = _el('request-success');
        if (success && !success.hidden) {
          RafiThinking.hide();
          RafiConfirmation.show(success, mode);
        }
      }, 80);
    }, { passive: true });
  }

  /* ── Wire modal inputs (after chip grid injected) ───────────── */
  function _wireModalInputs(modal) {
    /* ── Chip selection (service) ── */
    /* fixeo-request-modal-v2.js writes to #request-problem via input event */
    var probInput = _el('request-problem');
    if (probInput && !probInput.dataset.rfosWired) {
      probInput.dataset.rfosWired = '1';
      probInput.addEventListener('input', function () {
        var val = probInput.value || '';
        if (!val) return;
        /* Try to map to a label via AIRE */
        var label = val;
        if (window.FixeoAIRE) {
          var cat = window.FixeoAIRE.detect(val);
          if (cat && cat.label) {
            label = cat.label;
            _mem.update({ category: cat, isUrgent: window.FixeoAIRE.detectUrgency(val, cat) });
          }
        }
        RafiConversation.onServiceSelected(label);
        _checkSummary(modal);
      });
    }

    /* Chip click detection via MutationObserver on chip grid */
    var chipObs = new MutationObserver(function () {
      var selected = _q('#request-modal .fxrm2-chip.selected');
      if (selected) {
        var lbl = (_q('.fxrm2-chip-label-text', selected) || {}).textContent || '';
        if (lbl) {
          _mem.update({ category: { label: lbl, cat: selected.dataset.slug || '' } });
          RafiConversation.onServiceSelected(lbl);
          _checkSummary(modal);
        }
      }
    });
    var chipGrid = _q('.fxrm2-chip-grid', modal);
    if (chipGrid && !chipGrid.dataset.rfosObs) {
      chipGrid.dataset.rfosObs = '1';
      chipObs.observe(chipGrid, { attributes: true, subtree: true, attributeFilter: ['class'] });
    }

    /* ── City selection ── */
    var cityWrap = _q('.fxrm2-city-section', modal);
    var cityObs = new MutationObserver(function () {
      var sel = _q('.fxrm2-city-chip.selected', modal);
      if (sel) {
        var city = sel.textContent.trim();
        _mem.update({ city: city });
        RafiConversation.onCitySelected(city);
        _checkSummary(modal);
      }
    });
    if (cityWrap && !cityWrap.dataset.rfosObs) {
      cityWrap.dataset.rfosObs = '1';
      cityObs.observe(cityWrap, { attributes: true, subtree: true, attributeFilter: ['class'] });
    }
    /* Fallback: native select */
    var citySelect = _el('request-city');
    if (citySelect && !citySelect.dataset.rfosWired) {
      citySelect.dataset.rfosWired = '1';
      citySelect.addEventListener('change', function () {
        if (citySelect.value) {
          _mem.update({ city: citySelect.value });
          RafiConversation.onCitySelected(citySelect.value);
          _checkSummary(modal);
        }
      });
    }

    /* ── Urgence radio ── */
    var form = _el('request-form');
    if (form && !form.dataset.rfosUrgWired) {
      form.dataset.rfosUrgWired = '1';
      form.addEventListener('change', function (e) {
        if (e.target && e.target.name === 'urgence') {
          var isUrgent = e.target.value.indexOf('Urgent') !== -1;
          _mem.update({ isUrgent: isUrgent });
          RafiConversation.onTimingSelected();
          _checkSummary(modal);
        }
      });
    }

    /* ── Phone input ── */
    var phoneInput = _el('request-phone');
    if (phoneInput && !phoneInput.dataset.rfosWired) {
      phoneInput.dataset.rfosWired = '1';
      phoneInput.addEventListener('input', function () {
        var val = (phoneInput.value || '').replace(/\D/g, '');
        if (val.length >= 8) {
          RafiConversation.onPhoneEntered();
          _checkSummary(modal);
        } else {
          RafiSummary.hide();
        }
      });
    }

    /* ── Submit button — show thinking ── */
    var submitBtn = form && _q('.request-submit-btn', form);
    if (submitBtn && !submitBtn.dataset.rfosWired) {
      submitBtn.dataset.rfosWired = '1';
      /* Intercept submit to show thinking state */
      submitBtn.addEventListener('click', function () {
        /* Only if form would be valid */
        if (form && !form.checkValidity()) return;
        setTimeout(function () {
          /* Check if form is now hidden (= submit succeeded) */
          if (form.hidden) {
            RafiSummary.hide();
            RafiThinking.show(modal);
          }
        }, 50);
      }, { passive: true });
    }
  }

  /* ── Check whether to show summary ─────────────────────────── */
  function _checkSummary(modal) {
    var phone = _el('request-phone');
    var phoneVal = phone ? (phone.value || '').replace(/\D/g, '') : '';
    var hasPhone  = phoneVal.length >= 8;
    var hasCity   = !!(_mem.city);
    var hasService = !!(_mem.category && _mem.category.label);

    if (hasPhone && hasCity && hasService) {
      RafiSummary.show(modal);
    } else if (!hasPhone) {
      RafiSummary.hide();
    }
  }

  /* ── Init ───────────────────────────────────────────────────── */
  function _init() {
    _mem._init();
    RafiEntry.mount();
    _watchHeroInput();
    _watchModal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init, { once: true });
  } else {
    /* Deferred script — DOM ready */
    _init();
  }

  /* ── Public API ─────────────────────────────────────────────── */
  window.FixeoRAFI = {
    VERSION:  'rfos-v1',
    memory:   _mem,
    entry:    RafiEntry,
    conv:     RafiConversation,
    summary:  RafiSummary,
    thinking: RafiThinking,
    confirm:  RafiConfirmation
  };

})();
