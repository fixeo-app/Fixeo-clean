/**
 * fixeo-local-flagship-v1.js — fxlp-v12
 * Local SEO price page — artisan card adapter.
 *
 * V1.2 changes:
 *   - ONE delegated click listener on #fxlp-artisan-grid (replaces per-button listeners).
 *   - In-memory artisan map (_artisanMap) keyed by artisan ID — ensures correct
 *     artisan object for every card tap including after modal close/re-open.
 *   - Description sanitiser: removes "Disponible sur Fixeo/FIXEO." display phrases.
 *   - FixeoReservation readiness guard: waits for window.FixeoReservation.open()
 *     to be defined (reservation.js loads deferred) before cards are ready.
 *   - Carousel grid: CSS handles layout; JS doesn't set grid styles.
 *
 * ARCHITECTURE (unchanged):
 *   - Queries Supabase via window.FixeoSupabaseClient (no new client).
 *   - Renders canonical pvc-* card DOM — same CSS classes as homepage.
 *   - Does NOT modify or call into any frozen system file.
 *   - IIFE + window._fxlpLoaded guard — idempotent.
 *
 * TWO SEPARATE FLOWS:
 *   A. Page CTA (data-open-request-form="true") → RAFI V5 contextual request.
 *      Prefill: Plomberie + Oujda via hidden DOM inputs. No geolocation.
 *   B. Card "Réserver maintenant" → window.FixeoReservation.open(artisanObj, false).
 *      Never opens RAFI. Never shares artisan state across cards.
 */
(function () {
  'use strict';
  if (window._fxlpLoaded) return;
  window._fxlpLoaded = true;

  /* ── Constants ─────────────────────────────────────────────── */
  var GRID_ID      = 'fxlp-artisan-grid';
  var MAX_CARDS    = 3;

  var _SVC_CATS = {
    plomberie:'Plomberie', electricite:'\u00c9lectricit\u00e9', serrurerie:'Serrurerie',
    climatisation:'Climatisation', peinture:'Peinture', menuiserie:'Menuiserie',
    maconnerie:'Ma\u00e7onnerie'
  };
  function _readCtx() {
    var grid = document.getElementById(GRID_ID);
    var city = (grid && grid.getAttribute('data-fxlp-city')) || '';
    if (!city) { var sel = document.getElementById('qsm-select-city'); if (sel) city = sel.value || ''; }
    var cityDisplay = city.trim() || 'Oujda';
    city = city.toLowerCase().trim() || 'oujda';
    var svcSlug = (grid && grid.getAttribute('data-fxlp-service')) || 'plomberie';
    var cat = (grid && grid.getAttribute('data-fxlp-category')) || _SVC_CATS[svcSlug] || svcSlug.slice(0,6);
    return { city: city, cityDisplay: cityDisplay, cat: cat.toLowerCase().trim(), svcSlug: svcSlug };
  }
  var _SVC_LABELS = { plomberie:'Plomberie', electricite:'\u00c9lectricit\u00e9',
    serrurerie:'Serrurerie', climatisation:'Climatisation', peinture:'Peinture', menuiserie:'Menuiserie',
    maconnerie:'Ma\u00e7onnerie', nettoyage:'prestataire de nettoyage' };
  var _SVC_ICONS  = { plomberie:'\uD83D\uDD27', electricite:'\u26A1',
    serrurerie:'\uD83D\uDD10', climatisation:'\u2744\uFE0F',
    peinture:'\uD83C\uDFA8', menuiserie:'\uD83E\uDEB5', maconnerie:'\uD83E\uDDF1' };
  function _svcLabel(slug) { return _SVC_LABELS[slug] || (slug.charAt(0).toUpperCase()+slug.slice(1)); }
  function _svcIcon(slug)  { return _SVC_ICONS[slug]  || '\uD83D\uDD27'; }
  function _getHeroObj(svcSlug) {
    if (!window.FixeoHeroes || typeof window.FixeoHeroes.getCardAvatar !== 'function') return null;
    return window.FixeoHeroes.getCardAvatar(svcSlug) || window.FixeoHeroes.getCardAvatar('plomberie');
  }
  var RETRY_MS     = 600;
  var MAX_RETRIES  = 8;
  var RES_READY_RETRIES = 20;   /* ~12s wait for reservation.js deferred load */
  var RES_READY_MS      = 600;

  /* ── In-memory artisan map: id → full artisan object ────────── */
  /* Keyed by String(artisan.id). Populated in _render(). */
  var _artisanMap = {};

  /* ── Description banned phrases (product-truth sanitiser) ────── */
  var DESC_BANNED = [
    'Disponible sur Fixeo.',
    'Disponible sur FIXEO.',
    'Disponible sur Fixeo',
    'Disponible sur FIXEO',
  ];

  function _sanitizeDesc(raw) {
    if (!raw) return '';
    var s = String(raw).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    DESC_BANNED.forEach(function (phrase) {
      /* Case-insensitive replace, all occurrences */
      var re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      s = s.replace(re, '');
    });
    return s.trim();
  }

  /* ── HTML escape ────────────────────────────────────────────── */
  function _esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ── Avatar stage fallback (mirrors _fxAvStage contract) ─────── */
  var _onerrorFn = 'if(window._fxAvStage){window._fxAvStage(this)}'
    + 'else{(function(i){'
    + 'i.onerror=null;'
    + 'var w=i.getAttribute("data-webp")||"";'
    + 'var p=i.getAttribute("data-png")||"";'
    + 'var t=i.getAttribute("data-avatar-type")||"";'
    + 'var c=i.parentElement;'
    + 'if(t==="real-photo"&&w){'
    +   'i.src=w;i.setAttribute("data-avatar-type","illustrative-metier");'
    +   'if(c)c.setAttribute("data-avatar-state","illustrative-metier");'
    +   'i.onerror=function(){if(window._fxAvStage){window._fxAvStage(i)}}'
    + '}'
    + 'else if(t==="illustrative-metier"&&p){'
    +   'i.src=p;i.setAttribute("data-webp","");'
    +   'if(c)c.setAttribute("data-avatar-state","illustrative-metier");'
    +   'i.onerror=null'
    + '}'
    + 'else{'
    +   'i.style.display="none";'
    +   'var s=c&&c.querySelector(".pvc-avatar-silhouette");'
    +   'if(s)s.style.display="";'
    +   'if(c)c.setAttribute("data-avatar-state","silhouette")'
    + '}'
    + '})(this)}';

  function _buildAvatarHtml(artisan, svcSlug) {
    var heroObj = _getHeroObj(svcSlug || 'plomberie');
    var webp = heroObj ? _esc(heroObj.webp || '') : '';
    var png  = heroObj ? _esc(heroObj.png  || '') : '';
    var alt  = heroObj ? _esc(heroObj.alt  || 'Illustration métier : Plomberie') : 'Illustration métier : Plomberie';
    var photo = _esc(artisan.photo_url || artisan.photo || artisan.avatar || '');
    var avatarState, imgHtml;

    if (photo) {
      avatarState = 'real-photo';
      imgHtml = '<img class="pvc-avatar-img"'
        + ' src="' + photo + '"'
        + ' alt="' + _esc(artisan.name || 'Artisan FIXEO') + '"'
        + ' data-avatar-type="real-photo"'
        + ' data-webp="' + webp + '"'
        + ' data-png="' + png + '"'
        + ' data-alt-metier="' + alt + '"'
        + ' width="64" height="64" loading="lazy" decoding="async"'
        + ' onerror="' + _esc(_onerrorFn) + '">'
        + '<span class="pvc-avatar-silhouette" style="display:none"></span>';
    } else if (webp) {
      avatarState = 'illustrative-metier';
      imgHtml = '<img class="pvc-avatar-img"'
        + ' src="' + webp + '"'
        + ' alt="' + alt + '"'
        + ' data-avatar-type="illustrative-metier"'
        + ' data-webp=""'
        + ' data-png="' + png + '"'
        + ' data-alt-metier="' + alt + '"'
        + ' width="64" height="64" loading="lazy" decoding="async"'
        + ' onerror="' + _esc(_onerrorFn) + '">'
        + '<span class="pvc-avatar-silhouette" style="display:none"></span>';
    } else {
      avatarState = 'silhouette';
      imgHtml = '<span class="pvc-avatar-silhouette"></span>';
    }
    return { html: imgHtml, state: avatarState };
  }

  /* ── Trust rows (product-truth — no "Disponible", no ratings) ── */
  var TRUST_HTML =
    '<div class="pvc-trust-v3b" role="list">' +
      '<span class="pvc-trust-v3b-item" role="listitem">' +
        '<span class="pvc-trust-v3b-icon">' +
          '<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" fill="none">' +
            '<rect x="2" y="1" width="10" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3" fill="none"/>' +
            '<line x1="4.5" y1="4.5" x2="9.5" y2="4.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>' +
            '<line x1="4.5" y1="7" x2="9.5" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>' +
            '<line x1="4.5" y1="9.5" x2="7.5" y2="9.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>' +
          '</svg>' +
        '</span>' +
        'Profil r\u00e9f\u00e9renc\u00e9 sur FIXEO' +
      '</span>' +
      '<span class="pvc-trust-v3b-item" role="listitem">' +
        '<span class="pvc-trust-v3b-icon">' +
          '<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" fill="none">' +
            '<circle cx="7" cy="7.5" r="4.5" stroke="currentColor" stroke-width="1.3" fill="none"/>' +
            '<path d="M7 4.5 L7 2 M7 2 L5.5 3.5 M7 2 L8.5 3.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<line x1="5.5" y1="7.5" x2="8.5" y2="7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>' +
          '</svg>' +
        '</span>' +
        'Paiement apr\u00e8s intervention' +
      '</span>' +
    '</div>';

  /* ── Build one canonical pvc-card article ──────────────────── */
  function _buildCard(artisan, ctx) {
    ctx = ctx || {city:'oujda',cat:'Plomberie',svcSlug:'plomberie'};
    var avatar  = _buildAvatarHtml(artisan, ctx.svcSlug);
    var id      = _esc(String(artisan.id || ''));
    var name    = _esc(artisan.name || 'Artisan FIXEO');
    var city    = _esc(artisan.city || 'Oujda');
    var catLbl  = _svcLabel(ctx.svcSlug);
    var catIcon = _svcIcon(ctx.svcSlug);

    var desc    = _sanitizeDesc(artisan.description);
    var descHtml = desc ? '<p class="pvc-desc-v3b">' + _esc(desc) + '</p>' : '';

    var priceMain = artisan.price_label
      || (artisan.price_from ? 'À partir de ' + artisan.price_from + ' MAD' : 'Devis sur demande');
    var priceHint = artisan.price_label ? '' : 'Tarif indicatif';

    return '<article class="pvc-card fhp-card fxlp-art-card"'
      + ' data-artisan-id="' + id + '"'
      + ' tabindex="0" role="listitem"'
      + ' aria-label="' + name + ', ' + catLbl + '">'

      + '<div class="pvc-card-header pvc-card-header-final">'
        + '<div class="pvc-avatar" data-category="' + _esc(ctx.svcSlug) + '" data-avatar-state="' + avatar.state + '">'
          + avatar.html
          + '<span class="pvc-avatar-badge">' + catIcon + '</span>'
        + '</div>'
        + '<div class="pvc-identity pvc-identity-final">'
          + '<h3 class="pvc-name">' + name + '</h3>'
          + '<div class="pvc-line pvc-line-city">\uD83D\uDCCD Bas\u00e9 \u00e0 ' + city + '</div>'
          + '<div class="pvc-line pvc-line-cat">' + catIcon + ' ' + catLbl + '</div>'
        + '</div>'
      + '</div>'

      + descHtml
      + TRUST_HTML

      + '<div class="pvc-action-v3b">'
        + '<div class="pvc-divider pvc-divider-v3b"></div>'
        + '<div class="pvc-price-block pvc-price-v3b">'
          + '<div class="pvc-price-amount">' + _esc(priceMain) + '</div>'
          + (priceHint ? '<span class="pvc-price-from">' + _esc(priceHint) + '</span>' : '')
        + '</div>'
        /* Reserve button: data-artisan-id is the only selector needed for delegation */
        + '<button class="pvc-btn-reserve-v2 fhp-btn-reserve pvc-btn-v3b fxlp-btn-reserve"'
          + ' type="button" data-artisan-id="' + id + '"'
          + ' aria-label="R\u00e9server ' + name + ', ' + catLbl + '">'
          + 'R\u00e9server maintenant \u2192'
        + '</button>'
        + '<a class="pvc-profile-link fhp-btn-profile pvc-profile-v3b"'
          + ' href="/artisan-profile.html?id=' + encodeURIComponent(id) + '"'
          + ' aria-label="Voir le profil complet de ' + name + '">'
          + 'Voir le profil complet \u203a'
        + '</a>'
      + '</div>'

    + '</article>';
  }

  /* ── Empty state ───────────────────────────────────────────── */
  function _renderEmpty(grid, ctx) {
    var svcLbl  = (ctx && _SVC_LABELS[ctx.svcSlug]) || 'artisan';
    var cityLbl = (ctx && ctx.cityDisplay) || (ctx && ctx.city) || '';
    var metier  = svcLbl.toLowerCase();
    var desc1 = cityLbl
      ? 'Aucun profil de\u00a0' + metier + '\u00a0n\u2019est affich\u00e9 pour\u00a0' + cityLbl + '\u00a0pour le moment.'
      : 'Aucun profil de\u00a0' + metier + '\u00a0n\u2019est affich\u00e9 pour le moment.';
    var desc2 = cityLbl
      ? 'D\u00e9crivez votre besoin pour que FIXEO recherche une solution adapt\u00e9e \u00e0\u00a0' + cityLbl + '.'
      : 'D\u00e9crivez votre besoin pour que FIXEO recherche une solution adapt\u00e9e.';
    grid.innerHTML =
      '<div class="fxlp-empty-state" role="listitem">'
        + '<span class="fxlp-empty-icon" aria-hidden="true">\uD83D\uDD0D</span>'
        + '<strong class="fxlp-empty-title">Aucun profil correspondant actuellement</strong>'
        + '<p class="fxlp-empty-desc">' + desc1 + ' ' + desc2 + '</p>'
        + '<button class="fxlp-btn-primary" type="button"'
          + ' data-open-request-form="true" data-request-mode="default"'
          + ' style="margin:0 auto;font-size:.85rem;padding:10px 20px;box-shadow:none">'
          + 'D\u00e9crire mon besoin'
        + '</button>'
      + '</div>';
  }

  /* ── Render real artisan cards ─────────────────────────────── */
  function _render(artisans, grid, ctx) {
    grid.classList.remove('fxlp-artisan-loading');
    grid.innerHTML = '';

    if (!artisans || artisans.length === 0) { _renderEmpty(grid, ctx); return; }

    var cards = artisans.slice(0, MAX_CARDS);

    /* Populate in-memory map (keyed by string ID) */
    _artisanMap = {};
    cards.forEach(function (a) { _artisanMap[String(a.id)] = a; });

    var ctx = _readCtx();
    grid.innerHTML = cards.map(function(a){return _buildCard(a,ctx);}).join('');

    /* Delegated listener — ONE listener for all cards, forever */
    _attachDelegatedListener(grid, cards);
  }

  /* ── Delegated click listener on grid ─────────────────────────
   * Uses event.target.closest() to find the reserve button.
   * Recovers artisan from _artisanMap by data-artisan-id — never stale.
   * FixeoReservation.open(artisanObj, false) is the only reservation entry.
   * Never opens RAFI V5 from here.
   */
  function _attachDelegatedListener(grid, cards) {
    /* Remove any previous listener by cloning (idempotent) */
    var fresh = grid.cloneNode(true);
    grid.parentNode.replaceChild(fresh, grid);
    /* Re-populate the map just in case */
    _artisanMap = {};
    cards.forEach(function (a) { _artisanMap[String(a.id)] = a; });

    fresh.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest('.fxlp-btn-reserve');
      if (!btn) return;

      e.stopPropagation();

      var aid = btn.getAttribute('data-artisan-id');
      var artisanObj = _artisanMap[String(aid)] || null;

      /* Fallback: try data-artisan on parent article */
      if (!artisanObj) {
        var article = btn.closest('[data-artisan-id]');
        if (article) {
          var raw = article.getAttribute('data-artisan') || '';
          try { artisanObj = raw ? JSON.parse(raw) : null; } catch (_) {}
        }
      }

      _openReservation(artisanObj, aid);
    });
  }

  /* ── Open reservation — with readiness guard ──────────────────
   * reservation.js is loaded deferred. Wait until window.FixeoReservation.open
   * is available before calling. Retries for up to ~12s.
   */
  function _openReservation(artisanObj, fallbackId) {
    if (window.FixeoReservation && typeof window.FixeoReservation.open === 'function') {
      window.FixeoReservation.open(artisanObj, false);
      return;
    }
    if (window.FixeoReservation && typeof window.FixeoReservation.openBooking === 'function') {
      window.FixeoReservation.openBooking(artisanObj ? artisanObj.id : fallbackId);
      return;
    }
    /* reservation.js may still be loading — retry */
    var attempts = 0;
    var interval = setInterval(function () {
      attempts++;
      if (window.FixeoReservation && typeof window.FixeoReservation.open === 'function') {
        clearInterval(interval);
        window.FixeoReservation.open(artisanObj, false);
      } else if (attempts >= RES_READY_RETRIES) {
        clearInterval(interval);
        if (window.FixeoReservation && typeof window.FixeoReservation.openBooking === 'function') {
          window.FixeoReservation.openBooking(artisanObj ? artisanObj.id : fallbackId);
        } else if (typeof window.openBookingModal === 'function') {
          window.openBookingModal(artisanObj ? artisanObj.id : fallbackId);
        }
      }
    }, RES_READY_MS);
  }

  /* ── FixeoSupabaseClient.query shim ─────────────────────────── */
  function _patchQueryIfNeeded() {
    var fsc = window.FixeoSupabaseClient;
    if (!fsc) return false;
    if (typeof fsc.query === 'function') return true;
    if (fsc.client) {
      fsc.query = function (fn) {
        try { return Promise.resolve(fn(fsc.client)); }
        catch (e) { return Promise.reject(e); }
      };
      return true;
    }
    if (window.supabase && window.supabase.createClient && !fsc._retried) {
      fsc._retried = true;
      var c = window.supabase.createClient(
        'https://ztwtbgoqanqzvwiibtuh.supabase.co',
        'sb_publishable_OGW8g7fM5ct1_ZFUxFIs-g_UzXuQPSk'
      );
      fsc.query = function (fn) {
        try { return Promise.resolve(fn(c)); }
        catch (e) { return Promise.reject(e); }
      };
      return true;
    }
    return false;
  }

  /* ── Supabase query ────────────────────────────────────────── */
  function _query(retries) {
    retries = retries || 0;
    if (!_patchQueryIfNeeded()) {
      if (retries < MAX_RETRIES) {
        setTimeout(function () { _query(retries + 1); }, RETRY_MS);
      } else {
        var g = document.getElementById(GRID_ID);
        if (g) _renderEmpty(g, _readCtx());
      }
      return;
    }

    var fsc = window.FixeoSupabaseClient;
    var ctx = _readCtx();
    fsc.query(function (client) {
      return client
        .from('artisans')
        .select('id, legacy_id, name, city, category, verified, description, photo_url, price_from, price_label')
        .ilike('city', '%' + ctx.city + '%')
        .ilike('category', ctx.cat + '%')
        .order('rating', { ascending: false })
        .limit(MAX_CARDS);
    }).then(function (res) {
      var grid = document.getElementById(GRID_ID);
      if (!grid) return;
      var data = res && res.data;
      var err  = res && res.error;
      if (err) { console.warn('[fxlp] query error:', err.message); _renderEmpty(grid, ctx); return; }

      var artisans = (data || []).map(function (row) {
        return {
          id:          row.legacy_id || row.id,
          _supabase_id:row.id,
          name:        row.name || 'Artisan FIXEO',
          city:        row.city || ctx.city || '',
          category:    (row.category || ctx.svcSlug).toLowerCase(),
          service:     (row.category || ctx.svcSlug).toLowerCase(),
          verified:    !!row.verified,
          description: row.description || '',
          photo_url:   row.photo_url || null,
          photo:       row.photo_url || null,
          avatar:      row.photo_url || null,
          price_from:  row.price_from || null,
          price_label: row.price_label || null,
          availability:'available',
          _source:     'supabase'
        };
      });

      _render(artisans, grid, ctx);
    }).catch(function (ex) {
      console.warn('[fxlp] query exception:', ex);
      var grid = document.getElementById(GRID_ID);
      if (grid) _renderEmpty(grid, _readCtx());
    });
  }

  /* ── Smooth scroll for secondary CTA ───────────────────────── */
  function _wireScroll() {
    var btn = document.getElementById('fxlp-scroll-artisans');
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      var target = document.getElementById('fxlp-artisans');
      if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  }

  /* ── Init ─────────────────────────────────────────────────── */
  function _init() {
    _wireScroll();
    var attempt = 0;
    var MAX_PATCH = 10;
    function _tryQuery() {
      attempt++;
      if (_patchQueryIfNeeded()) {
        _query(0);
      } else if (attempt < MAX_PATCH) {
        setTimeout(_tryQuery, RETRY_MS);
      } else {
        var grid = document.getElementById(GRID_ID);
        if (grid) _renderEmpty(grid, _readCtx());
      }
    }
    _tryQuery();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

}());
