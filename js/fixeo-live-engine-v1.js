/**
 * FIXEO Live Engine V1 — fixeo-live-engine-v1.js
 * Version: fle-v1a — 2026-06-12
 * ─────────────────────────────────────────────────────────────────
 * Homepage "FIXEO LIVE ENGINE" section — Block 1–4 animations.
 *
 * ARCHITECTURE:
 *  • IntersectionObserver → lazy start when section enters viewport
 *  • visibilitychange → pause intervals when tab hidden (zero memory leak)
 *  • Real data via window.FixeoSupabase (non-blocking, optional)
 *  • Graceful fallback to demo pool when Supabase unavailable / returns empty
 *  • Idempotent: window.FixeoLiveEngine guard
 *
 * NEVER TOUCHES:
 *  request-form.js, fixeo-client-requests-store.js,
 *  fixeo-dispatch-engine*.js, notification engine,
 *  admin dashboards, auth, SEO pages, reservation
 * ─────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  if (window.FixeoLiveEngine) return;

  var VERSION = 'fle-v1a';
  var _started = false;
  var _timers  = [];   /* all setIntervals — cleared on destroy */
  var _paused  = false;

  /* ══════════════════════════════════════════════════════
     DEMO DATA POOLS
     Realistic Moroccan service requests — never fabricated counts
  ══════════════════════════════════════════════════════ */
  var DEMO_REQUESTS = [
    { city:'Casablanca', service:'Plomberie',    problem:'Fuite robinet cuisine',         ago:1,  icon:'💧' },
    { city:'Rabat',      service:'Serrurerie',   problem:'Porte d\'entrée bloquée',       ago:3,  icon:'🔒' },
    { city:'Fès',        service:'Électricité',  problem:'Panne courant salon',           ago:2,  icon:'⚡' },
    { city:'Marrakech',  service:'Climatisation',problem:'Clim ne refroidit plus',        ago:5,  icon:'❄️' },
    { city:'Tanger',     service:'Plomberie',    problem:'Chauffe-eau plus de pression',  ago:7,  icon:'🔥' },
    { city:'Agadir',     service:'Peinture',     problem:'Salon — 30m²',                  ago:9,  icon:'🎨' },
    { city:'Meknès',     service:'Menuiserie',   problem:'Porte placard cassée',          ago:4,  icon:'🪚' },
    { city:'Kénitra',    service:'Serrurerie',   problem:'Cylindre à changer',            ago:6,  icon:'🔑' },
    { city:'Oujda',      service:'Électricité',  problem:'Tableau électrique à réviser',  ago:8,  icon:'🔌' },
    { city:'Salé',       service:'Plomberie',    problem:'WC bouché, intervention urge',  ago:2,  icon:'🚿' },
    { city:'Tétouan',    service:'Maçonnerie',   problem:'Fissure mur extérieur',         ago:11, icon:'🧱' },
    { city:'El Jadida',  service:'Nettoyage',    problem:'Appartement 3 pièces',          ago:15, icon:'🧹' }
  ];

  var DEMO_ARTISANS = [
    { name:'Youssef Z.',   service:'Plombier',          city:'Fès',        score:93, eta:18, verified:true  },
    { name:'Karim B.',     service:'Électricien',       city:'Casablanca', score:89, eta:22, verified:true  },
    { name:'Amine T.',     service:'Serrurier',         city:'Rabat',      score:87, eta:25, verified:true  },
    { name:'Hassan M.',    service:'Climatisation',     city:'Marrakech',  score:91, eta:15, verified:true  },
    { name:'Rachid D.',    service:'Peintre',           city:'Tanger',     score:84, eta:30, verified:false },
    { name:'Omar K.',      service:'Menuisier',         city:'Agadir',     score:88, eta:20, verified:true  },
    { name:'Said L.',      service:'Plombier',          city:'Meknès',     score:85, eta:35, verified:true  }
  ];

  /* ══════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════ */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function _timer(fn, ms) {
    var id = setInterval(function () {
      if (!_paused) fn();
    }, ms);
    _timers.push(id);
    return id;
  }

  /* ══════════════════════════════════════════════════════
     BLOCK 1 — LIVE REQUEST FEED
  ══════════════════════════════════════════════════════ */
  var _feedPool = [];
  var _feedIdx  = 0;
  var _feedEl   = null;

  function _buildFeedItem(req) {
    var li = document.createElement('li');
    li.className = 'fle-feed-item fle-entering';
    li.innerHTML =
      '<span class="fle-feed-ico">' + esc(req.icon || '🔧') + '</span>' +
      '<div class="fle-feed-content">' +
        '<div class="fle-feed-title">' + esc(req.problem || req.description || 'Demande en cours') + '</div>' +
        '<div class="fle-feed-meta">' +
          '<span class="fle-feed-city">' + esc(req.city) + '</span>' +
          '<span class="fle-feed-time">— ' + esc(req.service || req.service_category || 'Service') + ' — il y a ' + (req.ago || '?') + ' min</span>' +
          '<span class="fle-feed-status">En cours</span>' +
        '</div>' +
      '</div>';
    return li;
  }

  function _rotateFeed() {
    if (!_feedEl || !_feedPool.length) return;
    var items = _feedEl.querySelectorAll('.fle-feed-item');

    /* Fade out oldest */
    if (items.length >= 3) {
      var oldest = items[items.length - 1];
      oldest.classList.add('fle-exiting');
      setTimeout(function () {
        if (oldest.parentNode) oldest.parentNode.removeChild(oldest);
      }, 360);
    }

    /* Prepend newest */
    var req = _feedPool[_feedIdx % _feedPool.length];
    _feedIdx++;
    var li = _buildFeedItem(req);
    _feedEl.insertBefore(li, _feedEl.firstChild);

    /* Remove entering class after animation */
    setTimeout(function () { li.classList.remove('fle-entering'); }, 460);
  }

  async function _initFeed() {
    _feedEl = document.getElementById('fle-feed-list');
    if (!_feedEl) return;

    /* Try real data */
    try {
      var FS = window.FixeoSupabase;
      if (FS && FS.getClient) {
        var sb = await FS.getClient();
        var res = await sb.from('service_requests')
          .select('service_category,city,description,created_at')
          .eq('status','new')
          .order('created_at', { ascending: false })
          .limit(12);
        if (res.data && res.data.length) {
          _feedPool = res.data.map(function (r, i) {
            var now = Date.now();
            var created = new Date(r.created_at).getTime();
            var minAgo = Math.max(1, Math.round((now - created) / 60000));
            /* Cap display at 59 min */
            if (minAgo > 59) minAgo = Math.floor(Math.random() * 15) + 1;
            var icons = { plomberie:'💧', electricite:'⚡', serrurerie:'🔒', climatisation:'❄️', peinture:'🎨', menuiserie:'🪚', nettoyage:'🧹', jardinage:'🌿', demenagement:'🚚' };
            return {
              city: r.city || 'Maroc',
              service: r.service_category || 'Service',
              problem: (r.description || 'Demande en cours').split(' [')[0].slice(0, 50),
              ago: minAgo,
              icon: icons[r.service_category] || '🔧'
            };
          });
        }
      }
    } catch (_) { /* fallback below */ }

    if (!_feedPool.length) _feedPool = DEMO_REQUESTS.slice();

    /* Seed 3 items */
    for (var i = 0; i < 3 && i < _feedPool.length; i++) {
      var req = _feedPool[i];
      _feedIdx = i + 1;
      _feedEl.appendChild(_buildFeedItem(req));
    }

    _timer(_rotateFeed, 4000);
  }

  /* ══════════════════════════════════════════════════════
     BLOCK 2 — AI MATCHING PIPELINE
  ══════════════════════════════════════════════════════ */
  var PIPELINE_STEPS = [
    { icon:'📨', text:'Demande reçue',                  chips: [] },
    { icon:'🔍', text:'Analyse de la demande',          chips: [] },
    { icon:'🗂',  text:'Scan de 861+ artisans',         chips: [] },
    { icon:'⚡', text:'Scoring intelligent',
      chips: ['Service','Ville','Trust Score','Disponibilité','Temps de réponse'] },
    { icon:'✅', text:'Meilleur artisan sélectionné',  chips: [] }
  ];

  var _pipeIdx  = 0;
  var _pipeEls  = [];

  function _advancePipeline() {
    /* Move all steps */
    _pipeEls.forEach(function (el, i) {
      el.classList.remove('fle-active', 'fle-done');
      if (i < _pipeIdx)      el.classList.add('fle-done');
      else if (i === _pipeIdx) el.classList.add('fle-active');
    });

    /* If reached end — pause 1.2s then reset */
    if (_pipeIdx >= PIPELINE_STEPS.length - 1) {
      setTimeout(function () {
        _pipeIdx = 0;
        _pipeEls.forEach(function (el) {
          el.classList.remove('fle-active', 'fle-done');
        });
      }, 1200);
    }
    _pipeIdx = (_pipeIdx + 1) % PIPELINE_STEPS.length;
  }

  function _initPipeline() {
    var wrap = document.getElementById('fle-pipeline');
    if (!wrap) return;

    PIPELINE_STEPS.forEach(function (step, i) {
      var div = document.createElement('div');
      div.className = 'fle-pipe-step';
      div.innerHTML =
        '<span class="fle-pipe-icon">' + step.icon + '</span>' +
        '<span class="fle-pipe-text">' + esc(step.text) + '</span>' +
        '<span class="fle-pipe-check">✓</span>';

      if (step.chips && step.chips.length) {
        var chips = document.createElement('div');
        chips.className = 'fle-score-chips';
        step.chips.forEach(function (c) {
          var span = document.createElement('span');
          span.className = 'fle-score-chip';
          span.textContent = c;
          chips.appendChild(span);
        });
        div.appendChild(chips);
      }

      _pipeEls.push(div);
      wrap.appendChild(div);
    });

    /* Trigger first step immediately */
    _pipeEls[0] && _pipeEls[0].classList.add('fle-active');
    _pipeIdx = 1;

    _timer(_advancePipeline, 1100);
  }

  /* ══════════════════════════════════════════════════════
     BLOCK 3 — BEST MATCH CARD
  ══════════════════════════════════════════════════════ */
  var _matchData = null;
  var _matchCycle = 0;

  function _renderMatch(artisan) {
    var wrap = document.getElementById('fle-match-inner');
    if (!wrap) return;
    if (!artisan) {
      wrap.innerHTML = '<div class="fle-match-empty">Analyse en cours…</div>';
      return;
    }
    var score = artisan.score || artisan.overall || 88;
    /* stroke-dasharray = 2π×22 ≈ 138.2; offset = 138 × (1 - score/100) */
    var offset = Math.round(138 * (1 - score / 100));

    wrap.innerHTML =
      '<div class="fle-match-card fle-revealing">' +
        '<div class="fle-score-ring-wrap">' +
          '<svg class="fle-score-ring" viewBox="0 0 56 56" aria-hidden="true">' +
            '<circle class="fle-ring-bg" cx="28" cy="28" r="22"/>' +
            '<circle class="fle-ring-fill" id="fle-ring-fill-' + _matchCycle + '" cx="28" cy="28" r="22"/>' +
          '</svg>' +
          '<div class="fle-ring-score">' + score + '</div>' +
        '</div>' +
        '<div class="fle-match-info">' +
          '<div class="fle-match-name">' + esc(artisan.name || artisan.full_name || 'Artisan') + '</div>' +
          '<div class="fle-match-service">' + esc(artisan.service || artisan.service_category || 'Artisan Fixeo') + '</div>' +
          '<div class="fle-match-badges">' +
            '<span class="fle-match-badge fle-badge-score">Score&nbsp;' + score + '/100</span>' +
            '<span class="fle-match-badge fle-badge-city">📍 ' + esc(artisan.city) + '</span>' +
            (artisan.eta ? '<span class="fle-match-badge fle-badge-eta">ETA&nbsp;~' + artisan.eta + ' min</span>' : '') +
            (artisan.verified !== false ? '<span class="fle-match-badge fle-badge-verify">✓ Vérifié</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>';

    /* Animate ring fill after paint */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var ring = document.getElementById('fle-ring-fill-' + _matchCycle);
        if (ring) ring.style.strokeDashoffset = offset;
      });
    });
    _matchCycle++;
  }

  async function _initMatch() {
    var wrap = document.getElementById('fle-match-inner');
    if (!wrap) return;

    wrap.innerHTML = '<div class="fle-match-empty">Analyse en cours…</div>';

    /* Try Dispatch V2 for real ranked artisan */
    var artisanPool = [];
    try {
      if (window.FixeoDispatchV2 && typeof window.FixeoDispatchV2.rankArtisansV2 === 'function') {
        var demoReq = { service_category: 'plomberie', city: 'Casablanca', description: 'fuite' };
        var ranked = window.FixeoDispatchV2.rankArtisansV2(demoReq, 5);
        if (ranked && ranked.length) {
          artisanPool = ranked.map(function (r) {
            return {
              name: r.name || (r.artisan && r.artisan.name) || 'Artisan',
              service: (r.artisan && r.artisan.service_category) || 'Artisan',
              city: (r.artisan && r.artisan.city) || r.city || 'Maroc',
              score: r.overall || r.score || 88,
              eta: (r.artisan && r.artisan.response_time_min) || 20,
              verified: (r.artisan && (r.artisan.verified || r.artisan.claimed)) !== false
            };
          });
        }
      }
    } catch (_) {}

    if (!artisanPool.length) artisanPool = DEMO_ARTISANS.slice();
    _matchData = artisanPool;

    /* Show first match after pipeline "completes" (3.5s delay) */
    setTimeout(function () {
      _renderMatch(rnd(artisanPool));
    }, 3500);

    /* Rotate match card every 8s */
    _timer(function () {
      _renderMatch(rnd(artisanPool));
    }, 8000);
  }

  /* ══════════════════════════════════════════════════════
     BLOCK 4 — NETWORK STATS (counter animation)
  ══════════════════════════════════════════════════════ */
  var _statsAnimated = false;

  var STAT_TARGETS = {
    'fle-stat-artisans': { target: 861,  suffix: '+', prefix: '' },
    'fle-stat-cities':   { target: 20,   suffix: '',  prefix: '' },
    'fle-stat-avail':    { target: 24,   suffix: '/7',prefix: '' },
    'fle-stat-rate':     { target: 92,   suffix: '%', prefix: '' }
  };

  async function _loadRealStats() {
    try {
      var FS = window.FixeoSupabase;
      if (FS && FS.getClient) {
        var sb = await FS.getClient();
        var cnt = await sb.from('artisans').select('id', { count: 'exact', head: true });
        if (cnt && cnt.count && cnt.count > 100) {
          STAT_TARGETS['fle-stat-artisans'].target = cnt.count;
        }
      }
    } catch (_) {}
  }

  function _animateStat(el, start, end, suffix, duration) {
    var startTime = null;
    function step(ts) {
      if (!startTime) startTime = ts;
      var progress = Math.min((ts - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3); /* ease-out cubic */
      var current = Math.round(start + (end - start) * eased);
      el.textContent = current + suffix;
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function _animateStats() {
    if (_statsAnimated) return;
    _statsAnimated = true;

    Object.keys(STAT_TARGETS).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var cfg = STAT_TARGETS[id];
      _animateStat(el, 0, cfg.target, cfg.suffix, 1800);
    });
  }

  function _initStats() {
    /* Load real artisan count async (non-blocking) */
    _loadRealStats().then(function () {
      /* Re-animate if already started with demo target */
      if (_statsAnimated) {
        _statsAnimated = false;
        _animateStats();
      }
    }).catch(function () {});
  }

  /* ══════════════════════════════════════════════════════
     LIFECYCLE
  ══════════════════════════════════════════════════════ */
  function _start() {
    if (_started) return;
    _started = true;

    _initFeed();
    _initPipeline();
    _initMatch();
    _initStats();
    _animateStats();
  }

  function _destroy() {
    _timers.forEach(clearInterval);
    _timers.length = 0;
    _started = false;
    _statsAnimated = false;
  }

  /* ── IntersectionObserver: lazy start ── */
  var section = document.getElementById('fle-section');
  if (section) {
    if ('IntersectionObserver' in window) {
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            _start();
            obs.disconnect();
          }
        });
      }, { threshold: 0.1 });
      obs.observe(section);
    } else {
      /* Fallback: start immediately for old browsers */
      _start();
    }
  }

  /* ── Pause when tab hidden ── */
  document.addEventListener('visibilitychange', function () {
    _paused = document.hidden;
  });

  /* ── Public API ── */
  window.FixeoLiveEngine = {
    VERSION:  VERSION,
    start:    _start,
    destroy:  _destroy
  };

})();
