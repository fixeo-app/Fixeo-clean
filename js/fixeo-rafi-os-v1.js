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

  /* ── Hero subtitle update ─────────────────────────────────────
     Replaces hero subtitle text with RAFI brand message.
     Only runs for FR (default) locale. Reverts if i18n re-runs. */
  function _updateHeroSubtitle() {
    var sub = _q('.hero-subtitle[data-i18n="hero_subtitle"]');
    if (!sub) return;
    /* Only override if current text is the default FR string */
    var current = sub.textContent.trim();
    if (current.indexOf('Intervention rapide') !== -1 ||
        current.indexOf('RAFI') !== -1) {
      sub.textContent = 'Expliquez votre besoin \u00e0 RAFI.';
    }
  }

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
  /* ── RAFI Text Engine — natural French ──────────────────────── */
  /* ── Text — RAFI's voice ────────────────────────────────────── */
  var _text = {
    /* The greeting. Types out. Once. Sacred. */
    heroIdle: 'Dites-moi ce qui se passe.',

    /* RAFI is listening — simple, present */
    heroListening: 'Je vous \u00e9coute\u2026',

    /* RAFI understood something */
    heroUnderstood: function (label) {
      return 'Je crois avoir compris \u2014 vous avez besoin d\u2019un\u00a0<strong>' + label + '</strong>.';
    },

    /* RAFI knows the city — speaks it naturally */
    heroIdleWithCity: function (city) {
      return 'Dites-moi ce qui se passe \u2014 je vous vois \u00e0\u00a0<strong>' + city + '</strong>.';
    },

    /* RAFI is ready — everything in place */
    heroReady: function (label, city) {
      return 'Parfait. Je recherche les meilleurs artisans \u00e0\u00a0<strong>' + city + '</strong>.';
    },

    /* Urgent */
    heroUrgent: 'C\u2019est urgent\u00a0? Je recherche un artisan disponible maintenant.',

    /* Modal — continuation of the same conversation */
    modalWelcome: 'Quel service vous faut-il\u00a0?',
    modalService: function (label) {
      return 'Parfait \u2014 <strong>' + label + '</strong>. Quelle est votre ville\u00a0?';
    },
    modalCity: function (label, city) {
      return '<strong>' + label + '</strong> \u00e0 <strong>' + city + '</strong>. Quelle est l\u2019urgence\u00a0?';
    },
    modalTiming: function () {
      return 'Entrez votre num\u00e9ro \u2014 l\u2019artisan vous contacte directement.';
    },

    /* Pre-submit summary */
    summaryText: function (label, city, isUrgent) {
      var urg = isUrgent ? ' \u2014 traitement\u00a0<strong>urgent</strong>' : '';
      return 'Je recherche un\u00a0<strong>' + label + '</strong> \u00e0\u00a0<strong>' + city + '</strong>' + urg + '.';
    },
    summaryFallback: 'V\u00e9rifiez votre demande et confirmez.',

    thinking:  'Un instant\u2026',
    confTitle: 'C\u2019est not\u00e9.',
    confSub:   'Fixeo recherche le meilleur artisan disponible dans votre zone.',
    urgentModalWelcome: 'Quel est le probl\u00e8me urgent\u00a0?'
  };

  /* ── RafiEntry — RAFI is the homepage ────────────────────────── */
  var RafiEntry = (function () {
    var _stage    = null;   /* .rfos-stage-wrap */
    var _greeting = null;   /* .rfos-greeting paragraph */
    var _cursor   = null;   /* .rfos-cursor */
    var _badge    = null;   /* .rfos-badge wrapper */
    var _badgePill = null;  /* .rfos-badge-pill span */
    var _state    = 'idle';
    var _injected = false;
    var _typed    = false;  /* typewriter fires once per session */
    var _cityKnownAtLoad = false;

    /* ── Typewriter ─────────────────────────────────────────────
       One character at a time. 26ms/char. Not fast, not slow.
       The visitor watches RAFI speak. This is the magic second.
       Nothing else moves during this. ── */
    /* ── Conversation loop messages ──
       Quiet. Patient. RAFI waits.
       Messages cycle every 5s with 2s silence between.
       Pauses completely when visitor is typing or RAFI is in an active state. */
    var _WAIT_MESSAGES = [
      'Dites-moi ce qui se passe.',
      'Je vous écoute.',
      'Prenez votre temps.',
      'Expliquez-moi votre problème.',
      'Nous allons trouver une solution.',
      'Je suis là pour vous aider.'
    ];
    var _waitIdx       = 0;
    var _waitTimer     = null;
    var _waitActive    = false;  /* true = loop running */
    var _visitorActive = false;  /* true = visitor is typing */

    function _startWaiting() {
      if (_waitActive) return;
      _waitActive = true;
      _waitIdx = 0;
      _scheduleNext();
    }

    function _stopWaiting() {
      _waitActive = false;
      if (_waitTimer) { clearTimeout(_waitTimer); _waitTimer = null; }
    }

    function _scheduleNext() {
      if (!_waitActive || _visitorActive || _state !== 'idle') return;
      /* 5s visible + 0.55s fade-out = 5.55s before swap */
      _waitTimer = setTimeout(function () {
        if (!_waitActive || _visitorActive || _state !== 'idle') return;
        /* Fade out */
        if (_greeting) _greeting.style.opacity = '0';
        setTimeout(function () {
          if (!_waitActive || _visitorActive || _state !== 'idle') {
            if (_greeting) _greeting.style.opacity = '1';
            return;
          }
          /* Advance message */
          _waitIdx = (_waitIdx + 1) % _WAIT_MESSAGES.length;
          if (_greeting) {
            _greeting.textContent = _WAIT_MESSAGES[_waitIdx];
            /* Brief silence (0.5s) then fade back in */
            setTimeout(function () {
              if (_greeting) _greeting.style.opacity = '1';
              _scheduleNext();
            }, 500);
          }
        }, 550);
      }, 5000);
    }

    function _typewrite(text, el, onDone) {
      var i = 0;
      el.textContent = '';
      /* Mark cursor as typing mode (faster blink) */
      if (_cursor) {
        _cursor.classList.remove('rfos-cursor--hidden');
        _cursor.classList.add('rfos-cursor--typing');
      }
      function _tick() {
        if (i < text.length) {
          el.textContent += text.charAt(i++);
          setTimeout(_tick, 26);
        } else {
          if (onDone) onDone();
        }
      }
      /* 220ms initial pause — RAFI collects their thoughts */
      setTimeout(_tick, 220);
    }

    /* ── Build the stage ─────────────────────────────────────────
       .rfos-stage-wrap
         .rfos-avatar-wrap
           .rfos-halo
           .rfos-avatar > img
         .rfos-identity
           .rfos-identity-name ("RAFI")
           .rfos-live-dot
         .rfos-greeting (p)
         .rfos-cursor (span)
         .rfos-badge > .rfos-badge-pill
         .rfos-divider
    ── */
    function _build() {
      var wrap = document.createElement('div');
      wrap.className = 'rfos-stage-wrap';
      wrap.setAttribute('aria-hidden', 'true');

      /* Avatar wrap */
      var avWrap = document.createElement('div');
      avWrap.className = 'rfos-avatar-wrap';

      var halo = document.createElement('div');
      halo.className = 'rfos-halo';
      halo.setAttribute('aria-hidden', 'true');

      var av = document.createElement('div');
      av.className = 'rfos-avatar';
      av.appendChild(_img(RAFI_HEAD_K, 92, ''));

      avWrap.appendChild(halo);
      avWrap.appendChild(av);

      /* Identity */
      var identity = document.createElement('div');
      identity.className = 'rfos-identity';

      var nameEl = document.createElement('span');
      nameEl.className = 'rfos-identity-name';
      nameEl.textContent = 'RAFI';

      var dot = document.createElement('span');
      dot.className = 'rfos-live-dot';
      dot.setAttribute('aria-hidden', 'true');

      identity.appendChild(nameEl);
      identity.appendChild(dot);

      /* Greeting */
      var greeting = document.createElement('p');
      greeting.className = 'rfos-greeting';

      /* Typewriter cursor */
      var cursor = document.createElement('span');
      cursor.className = 'rfos-cursor';
      cursor.setAttribute('aria-hidden', 'true');

      /* Badge */
      var badge = document.createElement('div');
      badge.className = 'rfos-badge';
      var pill = document.createElement('span');
      pill.className = 'rfos-badge-pill';
      badge.appendChild(pill);

      /* Divider */
      var divider = document.createElement('div');
      divider.className = 'rfos-divider';
      divider.setAttribute('aria-hidden', 'true');

      wrap.appendChild(avWrap);
      wrap.appendChild(identity);
      wrap.appendChild(greeting);
      wrap.appendChild(cursor);
      wrap.appendChild(badge);
      wrap.appendChild(divider);

      _stage    = wrap;
      _greeting = greeting;
      _cursor   = cursor;
      _badge    = badge;
      _badgePill = pill;
      return wrap;
    }

    /* ── Trust whisper ────────────────────────────────────────── */
    function _buildTrustWhisper() {
      var w = document.createElement('p');
      w.className = 'rfos-trust-whisper';
      w.textContent = 'Gratuit\u00a0\u00b7 Paiement apr\u00e8s intervention';
      return w;
    }

    /* ── H1 transition band ───────────────────────────────────── */
    function _buildH1Band(h1El) {
      var band = document.createElement('div');
      band.className = 'rfos-h1-band';
      /* Move H1 element into band */
      band.appendChild(h1El);
      return band;
    }

    /* ── Fallback link band ───────────────────────────────────── */
    function _buildFallbackBand(btn) {
      var band = document.createElement('div');
      band.className = 'rfos-fallback-band';
      btn.className = 'rfos-fallback-link';
      btn.setAttribute('aria-label', 'Publier une demande gratuitement');
      band.appendChild(btn);
      return band;
    }

    /* ── State management ─────────────────────────────────────── */
    function _setState(state) {
      if (_state === state) return;
      _state = state;
      if (!_stage) return;
      _stage.classList.remove(
        'rfos-stage--listening',
        'rfos-stage--urgent',
        'rfos-stage--ready'
      );
      if (state === 'listening') _stage.classList.add('rfos-stage--listening');
      if (state === 'urgent')    _stage.classList.add('rfos-stage--urgent');
      if (state === 'ready')     _stage.classList.add('rfos-stage--ready');
    }

    /* ── Text swap — fade out, swap, fade in ─────────────────── */
    function _setText(html) {
      if (!_greeting) return;
      if (_cursor) _cursor.classList.add('rfos-cursor--hidden');
      _greeting.style.opacity = '0';
      setTimeout(function () {
        if (!_greeting) return;
        _greeting.innerHTML = html;
        _greeting.style.opacity = '1';
        _greeting.style.transition = 'opacity 0.20s ease';
      }, 170);
    }

    /* ── Badge ─────────────────────────────────────────────────── */
    function _setBadge(html) {
      if (!_badgePill) return;
      if (!html) {
        _badge.classList.remove('visible');
        return;
      }
      _badgePill.innerHTML = html;
      _badge.classList.add('visible');
    }

    /* ── Single attention pulse on input ─────────────────────── */
    function _inviteInput() {
      var heroSection = _stage && _stage.closest('section#home');
      if (!heroSection) return;
      heroSection.classList.add('rfos-input-invite');
      /* Class removed after animation completes — 1.2s */
      setTimeout(function () {
        heroSection.classList.remove('rfos-input-invite');
      }, 1400);
    }

    /* ── Mount ─────────────────────────────────────────────────── */
    function mount() {
      if (_mem.dismissed || _injected) return;
      var attempts = 0;

      function _tryMount() {
        var heroContent = _q('.hero-content');
        var heroSearch  = _el('hero-quick-search');
        if (!heroContent || !heroSearch) {
          if (++attempts < 20) setTimeout(_tryMount, 120);
          return;
        }
        if (_injected) return;
        _injected = true;
        if (!_stage) _build();

        /* 1. Insert RAFI stage before #hero-quick-search */
        heroContent.insertBefore(_stage, heroSearch);

        /* 2. Move H1 and fallback link OUT of hero, insert after section */
        var heroSection = _q('section#home');
        var h1El = heroContent.querySelector('.hero-title');
        var fallbackBtn = heroContent.querySelector('.hero-secondary-link');

        if (heroSection && h1El) {
          var h1Band = _buildH1Band(h1El);
          heroSection.insertAdjacentElement('afterend', h1Band);

          if (fallbackBtn) {
            var fallBand = _buildFallbackBand(fallbackBtn.closest('.hero-secondary-link-wrap') || fallbackBtn);
            h1Band.insertAdjacentElement('afterend', fallBand);
          }
        }

        /* 3. Insert trust whisper after #hero-quick-search */
        heroSearch.insertAdjacentElement('afterend', _buildTrustWhisper());

        /* 4. Recompose: RAFI leads. H1 gone. Everything else hidden. */
        if (heroSection) heroSection.classList.add('rfos-hero-recomposed');

        /* 5. Typewriter — once per session */
        if (!_typed) {
          _typed = true;

          /* Check if city already known */
          var knownCity = _mem.city;
          var idleText = knownCity
            ? _text.heroIdleWithCity(knownCity).replace(/<[^>]+>/g, '') + '\u00a0' + knownCity
            : _text.heroIdle;

          /* Use plain text for typewriter (no HTML during type) */
          var plainText = knownCity
            ? 'Dites-moi ce qui se passe \u2014 je vous vois \u00e0\u00a0' + knownCity + '.'
            : _text.heroIdle;

          _typewrite(plainText, _greeting, function () {
            /* Typewriter done — cursor switches to slow patient blink */
            if (_cursor) {
              _cursor.classList.remove('rfos-cursor--typing');
              /* Cursor stays visible — it is RAFI's open invitation */
            }
            /* If city known, render with HTML bold */
            if (knownCity) {
              _greeting.innerHTML = _text.heroIdleWithCity(knownCity);
            }
            /* One quiet invitation — then trust the visitor */
            setTimeout(_inviteInput, 180);
            /* Begin the waiting conversation — RAFI stays alive */
            setTimeout(_startWaiting, 4800);
          });
        } else {
          var knownCity2 = _mem.city;
          if (knownCity2) {
            _greeting.innerHTML = _text.heroIdleWithCity(knownCity2);
          } else {
            _greeting.textContent = _text.heroIdle;
          }
          /* Cursor stays visible — RAFI's invitation is still open */
        }
      }

      _tryMount();
    }

    /* ── Input events ─────────────────────────────────────────── */
    function onInput(text) {
      if (!_stage) return;
      if (!text || text.length < 2) {
        /* Visitor stopped — resume waiting state */
        _visitorActive = false;
        if (_state === 'listening') {
          _setState('idle');
          var city = _mem.city;
          var idleMsg = city ? _text.heroIdleWithCity(city) : _text.heroIdle;
          _setText(idleMsg);
          _setBadge(null);
          /* Resume loop after a short pause */
          if (!_waitActive) setTimeout(_startWaiting, 3000);
        }
        /* Cursor returns to patient blink */
        if (_cursor) _cursor.classList.remove('rfos-cursor--hidden');
        return;
      }
      /* Visitor is typing — pause the loop, hide cursor */
      _visitorActive = true;
      _stopWaiting();
      if (_cursor) _cursor.classList.add('rfos-cursor--hidden');
      _setState('listening');
      _setText(_text.heroListening);
      _setBadge(null);
    }

    function onAnalysis(category, isUrgent) {
      if (!_stage) return;
      _mem.update({ category: category, isUrgent: isUrgent });
      /* Stop waiting loop — RAFI is now engaged */
      _stopWaiting();

      if (isUrgent) {
        _setState('urgent');
        _setText(_text.heroUrgent);
        _setBadge('\u26a1\u00a0Urgent');
        return;
      }
      if (category && category.label) {
        var city = _mem.city;
        if (city) {
          _setState('ready');
          _setText(_text.heroReady(category.label, city));
          _setBadge('\u2713\u00a0' + category.label + '\u00a0\u00b7\u00a0' + city);
        } else {
          _setState('listening');
          _setText(_text.heroUnderstood(category.label));
          _setBadge(category.icon ? category.icon + '\u00a0' + category.label : category.label);
        }
        return;
      }
      _setState('listening');
      _setText(_text.heroListening);
      _setBadge(null);
    }

    function onCityKnown(city) {
      if (!_stage) return;
      _mem.update({ city: city });
      if (_state === 'idle') {
        /* Quietly incorporate city into greeting */
        _setText(_text.heroIdleWithCity(city));
      } else if (_mem.category && _mem.category.label) {
        _setState('ready');
        _setText(_text.heroReady(_mem.category.label, city));
        _setBadge('\u2713\u00a0' + _mem.category.label + '\u00a0\u00b7\u00a0' + city);
      }
    }

    function reset() {
      _setState('idle');
      _visitorActive = false;
      if (_greeting) {
        var city = _mem.city;
        if (city) {
          _greeting.innerHTML = _text.heroIdleWithCity(city);
        } else {
          _greeting.textContent = _text.heroIdle;
        }
        _greeting.style.opacity = '1';
      }
      /* Cursor returns to patient blink */
      if (_cursor) {
        _cursor.classList.remove('rfos-cursor--hidden', 'rfos-cursor--typing');
      }
      _setBadge(null);
      /* Resume loop after visitor finishes */
      _stopWaiting();
      setTimeout(_startWaiting, 3500);
    }

    return { mount: mount, onInput: onInput, onAnalysis: onAnalysis, onCityKnown: onCityKnown, reset: reset };
  })();

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
    /* Update hero subtitle to RAFI voice */
    _updateHeroSubtitle();
    /* Mount RAFI inside QSM dialog (polls until QSM renders) */
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
    VERSION:  'rfos-v1e',
    memory:   _mem,
    entry:    RafiEntry,
    conv:     RafiConversation,
    summary:  RafiSummary,
    thinking: RafiThinking,
    confirm:  RafiConfirmation
  };

})();
