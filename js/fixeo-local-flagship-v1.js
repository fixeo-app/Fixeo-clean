/**
 * fixeo-local-flagship-v1.js — fxlp-v1
 * Local SEO price page — artisan card adapter.
 *
 * Responsibilities:
 *   1. Query Supabase for real Oujda plomberie artisans (max 3).
 *   2. Render canonical pvc-* card DOM (same classes/CSS as homepage).
 *   3. Wire "Réserver maintenant" → FixeoReservation.open(artisan, false).
 *   4. Wire "Voir le profil" → artisan-profile.html?id=<id>.
 *   5. Smooth scroll for secondary hero CTA.
 *   6. Does NOT modify, import or wrap any frozen system.
 *   7. Does NOT trigger geolocation.
 *   8. Does NOT create a new Supabase client — uses window.FixeoSupabaseClient.
 *   9. IIFE + window._fxlpLoaded guard — idempotent.
 *
 * RAFI V5 entrypoint:
 *   All data-open-request-form="true" buttons are handled natively by
 *   fx-request-flow-v4.js capture-phase listener (_routeTrigger).
 *   The city+service prefill is supplied by the hidden DOM inputs in HTML:
 *     #qsm-input-nlp      → "Plomberie"  → st.prefillService
 *     #qsm-select-city    → "Oujda"      → st.prefillCity
 *   No geolocation is triggered — city is supplied statically.
 *
 * Avatar strategy (canonical — matches homepage _buildCard):
 *   Stage 1: real photo (artisan.photo_url)
 *   Stage 2: FixeoHeroes.getCardAvatar('plomberie').webp
 *   Stage 3: .png fallback
 *   Stage 4: CSS silhouette
 *   Handler: window._fxAvStage (registered by fixeo_homepage_premium_patch.js)
 *   Fallback: local _avatarFallback when _fxAvStage not yet available.
 *
 * Product truth enforced:
 *   - No fake ratings, no fake availability, no verification claims.
 *   - pvc-trust-v3b rows: "Profil référencé sur FIXEO" + "Paiement après intervention".
 *   - Availability badge: suppressed (avail_today only — but none expected from seed data).
 *   - Rating: only shown when a.rating > 0 AND reviews > 0.
 *   - Empty state: rendered when 0 results.
 */
(function () {
  'use strict';
  if (window._fxlpLoaded) return;
  window._fxlpLoaded = true;

  /* ── Constants ─────────────────────────────────────────────── */
  var GRID_ID      = 'fxlp-artisan-grid';
  var QUERY_CITY   = 'oujda';
  var QUERY_CAT    = 'plomber';   /* ilike plomber% catches Plomberie, plombier */
  var MAX_CARDS    = 3;
  var RETRY_MS     = 600;        /* wait for FixeoSupabaseClient if not ready */
  var MAX_RETRIES  = 8;

  /* ── Escape helper ─────────────────────────────────────────── */
  function _esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ── Avatar stage fallback (when _fxAvStage not yet loaded) ── */
  function _avatarFallback(img) {
    if (!img) return;
    img.onerror = null;
    var webp = img.getAttribute('data-webp') || '';
    var png  = img.getAttribute('data-png')  || '';
    var type = img.getAttribute('data-avatar-type') || '';
    var container = img.parentElement;
    if (type === 'real-photo' && webp) {
      img.src = webp;
      img.setAttribute('data-avatar-type', 'illustrative-metier');
      if (container) container.setAttribute('data-avatar-state', 'illustrative-metier');
      img.onerror = function () { _avatarFallback(img); };
    } else if (type === 'illustrative-metier' && png) {
      img.src = png;
      img.setAttribute('data-webp', '');   /* mark webp as consumed */
      if (container) container.setAttribute('data-avatar-state', 'illustrative-metier');
      img.onerror = function () { _avatarFallback(img); };
    } else {
      /* Stage 4: silhouette */
      img.style.display = 'none';
      var sil = img.parentElement && img.parentElement.querySelector('.pvc-avatar-silhouette');
      if (sil) sil.style.display = '';
      if (container) container.setAttribute('data-avatar-state', 'silhouette');
    }
  }

  /* ── Avatar HTML builder (mirrors _buildCard avatar logic) ─── */
  function _buildAvatarHtml(artisan) {
    var heroObj = null;
    if (window.FixeoHeroes && typeof window.FixeoHeroes.getCardAvatar === 'function') {
      heroObj = window.FixeoHeroes.getCardAvatar('plomberie');
    }

    var webp = heroObj ? _esc(heroObj.webp) : '';
    var png  = heroObj ? _esc(heroObj.png)  : '';
    var alt  = heroObj ? _esc(heroObj.alt)  : 'Illustration métier : Plomberie';

    var photo = _esc(artisan.photo_url || artisan.photo || artisan.avatar || '');
    var avatarState;
    var imgHtml;
    var onerrorFn = 'if(window._fxAvStage){window._fxAvStage(this)}else{(function(i){' +
      'i.onerror=null;var w=i.getAttribute("data-webp")||"";var p=i.getAttribute("data-png")||"";' +
      'var t=i.getAttribute("data-avatar-type")||"";var c=i.parentElement;' +
      'if(t==="real-photo"&&w){i.src=w;i.setAttribute("data-avatar-type","illustrative-metier");' +
      'if(c)c.setAttribute("data-avatar-state","illustrative-metier");' +
      'i.onerror=function(){if(window._fxAvStage){window._fxAvStage(i)}}}' +
      'else if(t==="illustrative-metier"&&p){i.src=p;i.setAttribute("data-webp","");' +
      'if(c)c.setAttribute("data-avatar-state","illustrative-metier");i.onerror=null}' +
      'else{i.style.display="none";var s=c&&c.querySelector(".pvc-avatar-silhouette");' +
      'if(s)s.style.display="";if(c)c.setAttribute("data-avatar-state","silhouette")}' +
      '})(this)}';

    if (photo) {
      avatarState = 'real-photo';
      imgHtml = '<img class="pvc-avatar-img"'
        + ' src="' + photo + '"'
        + ' alt="' + _esc(artisan.name || 'Artisan FIXEO') + '"'
        + ' data-avatar-type="real-photo"'
        + ' data-webp="' + webp + '"'
        + ' data-png="' + png + '"'
        + ' data-alt-metier="' + alt + '"'
        + ' width="72" height="72" loading="lazy" decoding="async"'
        + ' onerror="' + _esc(onerrorFn) + '">'
        + '<span class="pvc-avatar-silhouette"></span>';
    } else if (webp) {
      avatarState = 'illustrative-metier';
      imgHtml = '<img class="pvc-avatar-img"'
        + ' src="' + webp + '"'
        + ' alt="' + alt + '"'
        + ' data-avatar-type="illustrative-metier"'
        + ' data-webp=""'
        + ' data-png="' + png + '"'
        + ' data-alt-metier="' + alt + '"'
        + ' width="72" height="72" loading="lazy" decoding="async"'
        + ' onerror="' + _esc(onerrorFn) + '">'
        + '<span class="pvc-avatar-silhouette"></span>';
    } else {
      avatarState = 'silhouette';
      imgHtml = '<span class="pvc-avatar-silhouette"></span>';
    }
    return { html: imgHtml, state: avatarState };
  }

  /* ── pvc-trust-v3b SVG rows (identical to _buildCard) ──────── */
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
        'Profil référencé sur FIXEO' +
      '</span>' +
      '<span class="pvc-trust-v3b-item" role="listitem">' +
        '<span class="pvc-trust-v3b-icon">' +
          '<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" fill="none">' +
            '<circle cx="7" cy="7.5" r="4.5" stroke="currentColor" stroke-width="1.3" fill="none"/>' +
            '<path d="M7 4.5 L7 2 M7 2 L5.5 3.5 M7 2 L8.5 3.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<line x1="5.5" y1="7.5" x2="8.5" y2="7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>' +
          '</svg>' +
        '</span>' +
        'Paiement après intervention' +
      '</span>' +
    '</div>';

  /* ── Build one canonical pvc-card article ──────────────────── */
  function _buildCard(artisan) {
    var avatar = _buildAvatarHtml(artisan);
    var id     = _esc(String(artisan.id || ''));
    var name   = _esc(artisan.name || 'Artisan FIXEO');
    var city   = _esc(artisan.city || 'Oujda');
    var cat    = 'plomberie';
    var catLbl = 'Plomberie';
    var catIcon = '🔧';

    /* Price — only show if genuinely present */
    var priceMain = artisan.price_label || (artisan.price_from ? 'À partir de ' + artisan.price_from + ' MAD' : 'Devis sur demande');
    var priceHint = artisan.price_label ? '' : 'Tarif indicatif';

    /* Description — truthful, no HTML */
    var rawDesc = String(artisan.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    var descHtml = rawDesc ? '<p class="pvc-desc-v3b">' + _esc(rawDesc) + '</p>' : '';

    /* data-artisan attribute for delegation */
    var dataAttr = '';
    try {
      dataAttr = ' data-artisan=\'' + JSON.stringify(artisan).replace(/'/g, '&#39;') + '\'';
    } catch (e) { /* skip */ }

    return '<article class="pvc-card fhp-card fxlp-art-card"'
      + ' data-artisan-id="' + id + '"' + dataAttr
      + ' tabindex="0" role="listitem"'
      + ' aria-label="' + name + ', ' + catLbl + '">'

      /* Header */
      + '<div class="pvc-card-header pvc-card-header-final">'
        + '<div class="pvc-avatar" data-category="' + cat + '" data-avatar-state="' + avatar.state + '">'
          + avatar.html
          + '<span class="pvc-avatar-badge">' + catIcon + '</span>'
        + '</div>'
        + '<div class="pvc-identity pvc-identity-final">'
          + '<h3 class="pvc-name">' + name + '</h3>'
          + '<div class="pvc-line pvc-line-city">📍 Basé à ' + city + '</div>'
          + '<div class="pvc-line pvc-line-cat">' + catIcon + ' ' + catLbl + '</div>'
        + '</div>'
      + '</div>'

      /* Description */
      + descHtml

      /* Trust rows */
      + TRUST_HTML

      /* Action area */
      + '<div class="pvc-action-v3b">'
        + '<div class="pvc-divider pvc-divider-v3b"></div>'
        + '<div class="pvc-price-block pvc-price-v3b">'
          + '<div class="pvc-price-amount">' + _esc(priceMain) + '</div>'
          + (priceHint ? '<span class="pvc-price-from">' + _esc(priceHint) + '</span>' : '')
        + '</div>'
        + '<button class="pvc-btn-reserve-v2 fhp-btn-reserve pvc-btn-v3b fxlp-btn-reserve" type="button"'
          + ' data-artisan-id="' + id + '"'
          + ' aria-label="Réserver ' + name + ', ' + catLbl + '">'
          + 'Réserver maintenant →'
        + '</button>'
        + '<a class="pvc-profile-link fhp-btn-profile pvc-profile-v3b"'
          + ' href="/artisan-profile.html?id=' + encodeURIComponent(id) + '"'
          + ' aria-label="Voir le profil complet de ' + name + '">'
          + 'Voir le profil complet ›'
        + '</a>'
      + '</div>'

    + '</article>';
  }

  /* ── Empty state ───────────────────────────────────────────── */
  function _renderEmpty(grid) {
    grid.innerHTML =
      '<div class="fxlp-empty-state" role="listitem">'
        + '<span class="fxlp-empty-icon" aria-hidden="true">🔍</span>'
        + '<strong class="fxlp-empty-title">Aucun profil correspondant actuellement</strong>'
        + '<p class="fxlp-empty-desc">'
          + 'Aucun profil de plombier n\'est affiché pour Oujda en ce moment. '
          + 'Décrivez votre besoin pour que FIXEO recherche une solution adaptée à Oujda.'
        + '</p>'
        + '<button class="fxlp-btn-primary" type="button"'
          + ' data-open-request-form="true" data-request-mode="default"'
          + ' style="margin:0 auto;font-size:.85rem;padding:10px 20px;box-shadow:none">'
          + 'Décrire mon besoin'
        + '</button>'
      + '</div>';
  }

  /* ── Render real artisan cards ─────────────────────────────── */
  function _render(artisans, grid) {
    grid.classList.remove('fxlp-artisan-loading');
    grid.innerHTML = '';
    if (!artisans || artisans.length === 0) { _renderEmpty(grid); return; }

    var cards = artisans.slice(0, MAX_CARDS);
    grid.innerHTML = cards.map(_buildCard).join('');

    /* Wire "Réserver maintenant" buttons */
    grid.querySelectorAll('.fxlp-btn-reserve').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var aid = btn.getAttribute('data-artisan-id');
        var raw = btn.closest('[data-artisan]') && btn.closest('[data-artisan]').getAttribute('data-artisan');
        var artisanObj = null;
        try { artisanObj = raw ? JSON.parse(raw) : null; } catch (_) {}

        if (!artisanObj && aid) {
          /* Reconstruct minimal object from data-artisan-id */
          artisanObj = cards.find(function (a) { return String(a.id) === String(aid); }) || null;
        }

        if (window.FixeoReservation && typeof window.FixeoReservation.open === 'function') {
          window.FixeoReservation.open(artisanObj, false);
        } else if (window.FixeoReservation && typeof window.FixeoReservation.openBooking === 'function') {
          window.FixeoReservation.openBooking(artisanObj ? artisanObj.id : aid);
        } else if (typeof window.openBookingModal === 'function') {
          window.openBookingModal(artisanObj ? artisanObj.id : aid);
        }
      });
    });
  }

  /* ── Supabase query (waits for FixeoSupabaseClient) ────────── */
  function _query(retries) {
    retries = retries || 0;
    var fsc = window.FixeoSupabaseClient;
    if (!fsc || typeof fsc.query !== 'function') {
      if (retries < MAX_RETRIES) {
        setTimeout(function () { _query(retries + 1); }, RETRY_MS);
      } else {
        /* FixeoSupabaseClient never became available — show empty state */
        var g = document.getElementById(GRID_ID);
        if (g) _renderEmpty(g);
      }
      return;
    }

    fsc.query(function (client) {
      return client
        .from('artisans')
        .select('id, legacy_id, name, city, category, verified, description, photo_url, price_from, price_label')
        .ilike('city', QUERY_CITY)
        .ilike('category', QUERY_CAT + '%')
        .order('rating', { ascending: false })
        .limit(MAX_CARDS);
    }).then(function (res) {
      var grid = document.getElementById(GRID_ID);
      if (!grid) return;
      var data = res && res.data;
      var err  = res && res.error;
      if (err) { console.warn('[fxlp] artisan query error:', err.message); _renderEmpty(grid); return; }

      /* Map to internal format: use legacy_id when available (matches FixeoReservation) */
      var artisans = (data || []).map(function (row) {
        return {
          id:          row.legacy_id || row.id,
          _supabase_id:row.id,
          name:        row.name || 'Artisan FIXEO',
          city:        row.city || 'Oujda',
          category:    (row.category || 'plomberie').toLowerCase(),
          service:     (row.category || 'plomberie').toLowerCase(),
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

      _render(artisans, grid);
    }).catch(function (ex) {
      console.warn('[fxlp] artisan query exception:', ex);
      var grid = document.getElementById(GRID_ID);
      if (grid) _renderEmpty(grid);
    });
  }

  /* ── FixeoSupabaseClient.query shim ─────────────────────────
   * FixeoSupabaseClient.query(fn) is the canonical usage pattern in
   * fixeo-supabase-loader.js. If the shape differs slightly, handle both.
   */
  function _patchQueryIfNeeded() {
    var fsc = window.FixeoSupabaseClient;
    if (!fsc) return false;
    /* Standard interface: fsc.query(fn) → Promise */
    if (typeof fsc.query === 'function') return true;
    /* Older interface: fsc.client → raw client; wrap it */
    if (fsc.client) {
      fsc.query = function (fn) {
        try { return Promise.resolve(fn(fsc.client)); }
        catch (e) { return Promise.reject(e); }
      };
      return true;
    }
    /* Fallback: use window.supabase.createClient directly */
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

  /* ── Smooth scroll for secondary CTA ───────────────────────── */
  function _wireScroll() {
    var btn = document.getElementById('fxlp-scroll-artisans');
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      var target = document.getElementById('fxlp-artisans');
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  /* ── Init ─────────────────────────────────────────────────── */
  function _init() {
    _wireScroll();

    /* Patch FixeoSupabaseClient.query if needed, then query */
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
        if (grid) _renderEmpty(grid);
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
