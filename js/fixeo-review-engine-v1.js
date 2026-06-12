/* ============================================================
   FIXEO REVIEW ENGINE V1
   Version: frev-v1b
   Guard:   window._fxRevV1Loaded
   Namespace: .frev-* / #frev-* / window.FixeoReviews

   Responsibilities:
   1. READ  — fetch reviews for any artisan from Supabase (public)
   2. WRITE — submit a review after a completed mission
   3. AGGREGATE — compute avg_rating, review_count, trust_score
   4. PROFILE  — inject premium review section into artisan-profile
   5. CARD     — inject compact trust badge onto artisan cards (homepage)
   6. DISPATCH — expose review score to FixeoDispatchV2 scoring

   NEVER touches:
     reservation.js, request-form.js, auth-global.js,
     fixeo-mission-system.js, admin-command-center*.js,
     fixeo-dispatch-engine*.js, fixeo-notification-engine.js,
     dashboard-artisan.html, fixeo-request-modal-v2.js
   ============================================================ */
(function () {
  'use strict';
  if (window._fxRevV1Loaded) return;
  window._fxRevV1Loaded = true;

  var VERSION = 'frev-v1b';

  /* ── Supabase client ────────────────────────────────────── */
  function _sb() {
    return window.FixeoSupabaseClient || window.FixeoSupabase || null;
  }

  /* ── Helpers ────────────────────────────────────────────── */
  function qs(sel, ctx)  { return (ctx || document).querySelector(sel); }
  function esc(s)        { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function stars(n) {
    var f = Math.round(Math.max(0, Math.min(5, n || 0)));
    return '★'.repeat(f) + '☆'.repeat(5 - f);
  }
  function _relativeDate(iso) {
    if (!iso) return '';
    var d = new Date(iso), now = new Date();
    var diff = Math.floor((now - d) / 864e5);
    if (diff === 0) return "aujourd'hui";
    if (diff === 1) return 'hier';
    if (diff < 7)  return 'il y a ' + diff + ' jours';
    if (diff < 30) return 'il y a ' + Math.floor(diff / 7) + ' semaines';
    if (diff < 365)return 'il y a ' + Math.floor(diff / 30) + ' mois';
    return 'il y a ' + Math.floor(diff / 365) + ' an(s)';
  }
  function _maskPhone(phone) {
    /* "0661234567" → "Client 06 ••• 567" */
    var s = String(phone || '').replace(/\s/g,'');
    if (s.length < 6) return 'Client FIXEO';
    return 'Client ' + s.slice(0,2) + ' ••• ' + s.slice(-3);
  }
  function _maskName(name) {
    if (!name) return 'Client FIXEO';
    var parts = name.trim().split(' ');
    return parts[0] + (parts[1] ? ' ' + parts[1][0] + '.' : '');
  }

  /* ── Cache (in-memory, session) ─────────────────────────── */
  var _cache = {}; /* artisanId → { reviews[], stats, ts } */
  var CACHE_TTL = 5 * 60 * 1000; /* 5 min */

  /* ── FETCH reviews for an artisan ──────────────────────── */
  async function fetchReviews(artisanId, limit) {
    limit = limit || 10;
    if (!artisanId) return { reviews: [], stats: _emptyStats() };

    var now = Date.now();
    if (_cache[artisanId] && (now - _cache[artisanId].ts) < CACHE_TTL) {
      return { reviews: _cache[artisanId].reviews, stats: _cache[artisanId].stats };
    }

    var sb = _sb();
    if (!sb) return { reviews: [], stats: _emptyStats() };

    try {
      var res = await sb
        .from('reviews')
        .select('id,rating,review_text,response_time_score,quality_score,created_at,client_phone,client_profile_id,verified')
        .eq('artisan_id', artisanId)
        .eq('verified', true)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (res.error) throw res.error;
      var reviews = res.data || [];
      var stats   = _computeStats(reviews);

      /* Try to get profile names for reviews with client_profile_id */
      var profileIds = reviews.filter(function(r) { return r.client_profile_id; })
                              .map(function(r) { return r.client_profile_id; });
      if (profileIds.length > 0 && sb) {
        try {
          var pRes = await sb.from('profiles').select('id,full_name').in('id', profileIds);
          if (!pRes.error && pRes.data) {
            var nameMap = {};
            pRes.data.forEach(function(p) { nameMap[p.id] = p.full_name; });
            reviews = reviews.map(function(r) {
              return r.client_profile_id
                ? Object.assign({}, r, { _display_name: nameMap[r.client_profile_id] })
                : r;
            });
          }
        } catch(_) {}
      }

      _cache[artisanId] = { reviews: reviews, stats: stats, ts: now };
      return { reviews: reviews, stats: stats };
    } catch(e) {
      if (console && console.warn) console.warn('[frev] fetchReviews error', e);
      return { reviews: [], stats: _emptyStats() };
    }
  }

  /* ── AGGREGATE stats ────────────────────────────────────── */
  function _emptyStats() {
    return { avg_rating: 0, review_count: 0, trust_score: 0,
             avg_response_time: 0, avg_quality: 0 };
  }

  function _computeStats(reviews) {
    if (!reviews || reviews.length === 0) return _emptyStats();

    var n        = reviews.length;
    var sumR     = 0, sumRt = 0, cntRt = 0, sumQ = 0, cntQ = 0;
    reviews.forEach(function(r) {
      sumR  += (r.rating || 0);
      if (r.response_time_score) { sumRt += r.response_time_score; cntRt++; }
      if (r.quality_score)       { sumQ  += r.quality_score;       cntQ++;  }
    });

    var avgRating = sumR / n;
    var avgRt     = cntRt > 0 ? sumRt / cntRt : 3;
    var avgQ      = cntQ  > 0 ? sumQ  / cntQ  : 3;

    /* Trust score formula:
       50% avg_rating quality   (0–100)
       20% review volume        (log scale, asymptotes at 200 reviews)
       15% response time score  (0–100)
       15% quality score        (0–100) */
    var volumeScore = Math.min(Math.log(n + 1) / Math.log(201) * 100, 100);
    var trustScore  = (
      (avgRating / 5)  * 50 +
      volumeScore      * 0.20 +
      (avgRt / 5)      * 15 +
      (avgQ  / 5)      * 15
    );

    return {
      avg_rating:        Math.round(avgRating * 10) / 10,
      review_count:      n,
      trust_score:       Math.round(trustScore * 10) / 10,
      avg_response_time: Math.round(avgRt * 10) / 10,
      avg_quality:       Math.round(avgQ  * 10) / 10
    };
  }

  /* ── SUBMIT a review ────────────────────────────────────── */
  async function submitReview(opts) {
    /* opts: { missionId, artisanId, rating, reviewText, clientProfileId, clientPhone,
               responseTimeScore, qualityScore } */
    var sb = _sb();
    if (!sb) return { ok: false, error: 'Supabase unavailable' };

    var missionId = opts.missionId;
    var artisanId = opts.artisanId;
    var rating    = parseInt(opts.rating, 10);

    if (!missionId || !artisanId) return { ok: false, error: 'mission_id and artisan_id required' };
    if (!rating || rating < 1 || rating > 5) return { ok: false, error: 'rating must be 1–5' };

    /* Guard: verify mission exists and is completed/validated */
    try {
      var mRes = await sb.from('missions').select('id,status,client_profile_id')
        .eq('id', missionId).maybeSingle();
      if (mRes.error || !mRes.data) return { ok: false, error: 'Mission introuvable' };
      var allowed = ['done', 'validated', 'completed'];
      if (allowed.indexOf(mRes.data.status) === -1) {
        return { ok: false, error: 'La mission doit être terminée avant de laisser un avis' };
      }
    } catch(e) {
      return { ok: false, error: String(e.message || e) };
    }

    /* Guard: no duplicate */
    try {
      var dupRes = await sb.from('reviews').select('id').eq('mission_id', missionId).maybeSingle();
      if (!dupRes.error && dupRes.data) {
        return { ok: false, error: 'Vous avez déjà laissé un avis pour cette mission' };
      }
    } catch(_) {}

    var payload = {
      mission_id:          missionId,
      artisan_id:          artisanId,
      rating:              rating,
      review_text:         String(opts.reviewText || '').slice(0, 500),
      verified:            true,
      response_time_score: opts.responseTimeScore ? parseInt(opts.responseTimeScore, 10) : null,
      quality_score:       opts.qualityScore      ? parseInt(opts.qualityScore, 10)      : null
    };

    if (opts.clientProfileId) payload.client_profile_id = opts.clientProfileId;
    if (opts.clientPhone)     payload.client_phone      = opts.clientPhone;

    try {
      var ins = await sb.from('reviews').insert(payload);
      if (ins.error) return { ok: false, error: ins.error.message };

      /* Bust cache */
      delete _cache[artisanId];

      /* Optionally write aggregate back to artisan row (best-effort) */
      _updateArtisanAggregate(artisanId);

      return { ok: true };
    } catch(e) {
      return { ok: false, error: String(e.message || e) };
    }
  }

  /* ── Write aggregate back to artisan row (best-effort) ──── */
  async function _updateArtisanAggregate(artisanId) {
    /* Re-fetch all reviews for this artisan and update artisans table */
    try {
      var sb = _sb();
      if (!sb) return;
      var res = await sb.from('reviews').select('rating,response_time_score,quality_score')
        .eq('artisan_id', artisanId).eq('verified', true);
      if (res.error || !res.data) return;
      var stats = _computeStats(res.data);
      await sb.from('artisans').update({
        rating:       stats.avg_rating,
        review_count: stats.review_count
      }).eq('id', artisanId);
    } catch(_) { /* best-effort — never throws */ }
  }

  /* ── PROFILE INJECTION ──────────────────────────────────── */

  function _renderReviewCard(r) {
    var dispName = r._display_name
      ? _maskName(r._display_name)
      : (r.client_phone ? _maskPhone(r.client_phone) : 'Client FIXEO');
    var txt = (r.review_text || '').trim();
    return (
      '<div class="frev-card" role="article">' +
        '<div class="frev-card-head">' +
          '<span class="frev-stars" aria-label="' + r.rating + ' étoiles">' + stars(r.rating) + '</span>' +
          '<span class="frev-author">' + esc(dispName) + '</span>' +
          (r.verified ? '<span class="frev-verified" title="Avis vérifié">✓ Vérifié</span>' : '') +
          '<span class="frev-date">' + _relativeDate(r.created_at) + '</span>' +
        '</div>' +
        (txt ? '<p class="frev-text">' + esc(txt) + '</p>' : '') +
        '<div class="frev-sub-scores">' +
          (r.response_time_score ? '<span class="frev-sub">Réactivité: ' + '★'.repeat(r.response_time_score) + '</span>' : '') +
          (r.quality_score ? '<span class="frev-sub">Qualité: ' + '★'.repeat(r.quality_score) + '</span>' : '') +
        '</div>' +
      '</div>'
    );
  }

  function _renderProfileReviews(artisanId, container) {
    container.innerHTML = '<div class="frev-loading">Chargement des avis…</div>';
    container.classList.add('frev-visible');

    fetchReviews(artisanId, 8).then(function(data) {
      var reviews = data.reviews;
      var stats   = data.stats;

      if (reviews.length === 0) {
        container.innerHTML =
          '<div class="frev-empty">' +
            '<span class="frev-empty-icon" aria-hidden="true">⭐</span>' +
            '<p>Aucun avis pour le moment. Soyez le premier à noter cet artisan.</p>' +
          '</div>';
        return;
      }

      var html =
        '<div class="frev-header">' +
          '<div class="frev-aggregate">' +
            '<div class="frev-big-score">' + stats.avg_rating.toFixed(1) + '</div>' +
            '<div class="frev-big-stars">' + stars(stats.avg_rating) + '</div>' +
            '<div class="frev-count">' + stats.review_count + ' avis vérifiés</div>' +
          '</div>' +
          '<div class="frev-trust-pill">' +
            '<span class="frev-trust-icon" aria-hidden="true">✦</span>' +
            'Score de confiance ' + stats.trust_score.toFixed(0) + '/100' +
          '</div>' +
        '</div>' +
        '<div class="frev-list">' +
          reviews.map(_renderReviewCard).join('') +
        '</div>';

      if (reviews.length >= 8) {
        html += '<button class="frev-load-more" id="frev-load-more" type="button">Voir plus d\'avis</button>';
      }

      container.innerHTML = html;

      /* Load more handler */
      var loadMore = container.querySelector('#frev-load-more');
      if (loadMore) {
        loadMore.addEventListener('click', function() {
          loadMore.disabled = true;
          loadMore.textContent = 'Chargement…';
          fetchReviews(artisanId, 50).then(function(more) {
            var allHtml = more.reviews.map(_renderReviewCard).join('');
            container.querySelector('.frev-list').innerHTML = allHtml;
            loadMore.remove();
          });
        });
      }
    });
  }

  /* Inject review section into artisan profile page */
  function _injectProfileSection(artisanId) {
    if (!artisanId) return;
    var root = document.getElementById('public-artisan-root');
    if (!root) return;

    /* Guard — already injected */
    if (root.querySelector('#frev-profile-section')) return;

    /* Wait for renderProfile() to populate the root */
    function _tryInject() {
      var sectionGrid = root.querySelector('.public-section-grid');
      var statsGrid   = root.querySelector('.public-stats-grid');
      var anchor      = sectionGrid || statsGrid || root.lastElementChild;
      if (!anchor) return false;

      var section = document.createElement('section');
      section.id = 'frev-profile-section';
      section.className = 'frev-profile-section';
      section.setAttribute('aria-label', 'Avis clients');

      section.innerHTML =
        '<h2 class="frev-section-title">' +
          '<span class="frev-section-icon" aria-hidden="true">⭐</span> Avis clients' +
        '</h2>' +
        '<div id="frev-reviews-container" class="frev-reviews-container"></div>';

      anchor.parentNode.insertBefore(section, anchor.nextSibling);

      var container = document.getElementById('frev-reviews-container');
      if (container) _renderProfileReviews(artisanId, container);
      return true;
    }

    if (!_tryInject()) {
      /* Root not populated yet — MutationObserver */
      var obs = new MutationObserver(function() {
        if (_tryInject()) obs.disconnect();
      });
      obs.observe(root, { childList: true, subtree: false });
      /* Safety timeout: give up after 8s */
      setTimeout(function() { obs.disconnect(); }, 8000);
    }
  }

  /* ── ARTISAN CARD BADGE (homepage cards) ─────────────────── */

  function _buildBadgeHtml(stats) {
    if (!stats || stats.review_count === 0) return null;
    var topRated = stats.avg_rating >= 4.7 && stats.review_count >= 5;
    return (
      '<div class="frev-card-badge" data-frev-badge>' +
        '<span class="frev-badge-stars">⭐ ' + stats.avg_rating.toFixed(1) + '</span>' +
        '<span class="frev-badge-count">' + stats.review_count + ' avis</span>' +
        (topRated ? '<span class="frev-badge-top">Top Rated</span>' : '') +
      '</div>'
    );
  }

  /* Inject live review badge onto a rendered artisan card */
  async function _injectCardBadge(cardEl, artisanId) {
    if (!artisanId || cardEl.dataset.frevDone) return;
    cardEl.dataset.frevDone = '1';

    /* First try cached stats from artisan.rating / artisan.review_count attributes */
    var dataRating = parseFloat(cardEl.dataset.rating || 0);
    var dataCount  = parseInt(cardEl.dataset.reviewCount || 0, 10);

    var stats;
    if (dataRating > 0 && dataCount > 0) {
      /* Use fast-path from card data attrs — no Supabase call needed */
      stats = { avg_rating: dataRating, review_count: dataCount,
                trust_score: dataRating / 5 * 50 + Math.min(dataCount, 50) };
    } else {
      /* Fetch from Supabase (reviews table) */
      var res = await fetchReviews(artisanId, 1);
      stats = res.stats;
    }

    var badgeHtml = _buildBadgeHtml(stats);
    if (!badgeHtml) return;

    /* Inject after the name/category block */
    var nameBlock = cardEl.querySelector('.artisan-main, .artisan-identity, .artisan-card-heading');
    if (nameBlock) {
      var badge = document.createElement('div');
      badge.innerHTML = badgeHtml;
      nameBlock.appendChild(badge.firstChild);
    }
  }

  /* ── CLIENT REVIEW MODAL ────────────────────────────────── */

  function _buildReviewModal() {
    if (document.getElementById('frev-review-modal')) return;

    var m = document.createElement('div');
    m.id = 'frev-review-modal';
    m.className = 'frev-modal-overlay';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-labelledby', 'frev-modal-title');
    m.hidden = true;

    m.innerHTML =
      '<div class="frev-modal" role="document">' +
        '<div class="frev-modal-header">' +
          '<h3 id="frev-modal-title">Votre avis compte ✦</h3>' +
          '<button class="frev-modal-close" id="frev-modal-close" type="button" aria-label="Fermer">✕</button>' +
        '</div>' +
        '<p class="frev-modal-sub">Comment s\u2019est pass\u00e9e votre intervention\u00a0?</p>' +

        /* Star picker */
        '<div class="frev-star-picker" role="radiogroup" aria-label="Note de 1 à 5 étoiles" id="frev-star-picker">' +
          [5,4,3,2,1].map(function(i) {
            return '<label class="frev-star-label" data-val="' + i + '">' +
              '<input type="radio" name="frev_rating" value="' + i + '" class="frev-sr-only">' +
              '<span>★</span>' +
            '</label>';
          }).join('') +
        '</div>' +
        '<div class="frev-star-hint" id="frev-star-hint">Touchez pour noter</div>' +

        /* Sub-scores */
        '<div class="frev-sub-score-row">' +
          _subScoreField('frev-rt-score', 'Réactivité', 'response_time') +
          _subScoreField('frev-q-score',  'Qualité du travail', 'quality') +
        '</div>' +

        /* Text */
        '<div class="frev-field">' +
          '<label for="frev-text" class="frev-field-label">Un commentaire <span class="frev-optional">(facultatif)</span></label>' +
          '<textarea id="frev-text" class="frev-textarea" rows="3" maxlength="500" placeholder="Décrivez votre expérience…"></textarea>' +
          '<div class="frev-char-count" id="frev-char-count">0 / 500</div>' +
        '</div>' +

        '<button class="frev-submit-btn" id="frev-submit-btn" type="button" disabled>Envoyer mon avis</button>' +

        '<p class="frev-modal-disclaimer">Votre identité est anonymisée. Avis vérifiés par Fixeo.</p>' +
        '<div class="frev-feedback" id="frev-feedback" hidden></div>' +
      '</div>';

    document.body.appendChild(m);
    _bindReviewModalEvents(m);
  }

  function _subScoreField(id, label, name) {
    return '<div class="frev-sub-score">' +
      '<span class="frev-sub-label">' + label + '</span>' +
      '<div class="frev-mini-stars" id="' + id + '" data-name="' + name + '">' +
        [1,2,3,4,5].map(function(i) {
          return '<button class="frev-mini-star" type="button" data-val="' + i + '" aria-label="' + i + ' étoiles">★</button>';
        }).join('') +
      '</div>' +
    '</div>';
  }

  function _bindReviewModalEvents(m) {
    var state = { rating: 0, rtScore: 0, qScore: 0, text: '' };

    /* Close */
    m.querySelector('#frev-modal-close').addEventListener('click', closeReviewModal);
    m.addEventListener('click', function(e) { if (e.target === m) closeReviewModal(); });
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeReviewModal(); });

    /* Star picker */
    var picker = m.querySelector('#frev-star-picker');
    var hint   = m.querySelector('#frev-star-hint');
    var hints  = ['', 'Décevant', 'Passable', 'Correct', 'Bien', 'Excellent ✦'];
    picker.querySelectorAll('.frev-star-label').forEach(function(lbl) {
      lbl.addEventListener('click', function() {
        state.rating = parseInt(lbl.dataset.val, 10);
        _updateStarPicker(picker, state.rating);
        hint.textContent = hints[state.rating] || '';
        _updateSubmitBtn(m, state);
      });
    });

    /* Sub-score mini stars */
    m.querySelectorAll('.frev-mini-stars').forEach(function(row) {
      row.querySelectorAll('.frev-mini-star').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var val = parseInt(btn.dataset.val, 10);
          var nm  = row.dataset.name;
          if (nm === 'response_time') state.rtScore = val;
          if (nm === 'quality')       state.qScore  = val;
          _updateMiniStars(row, val);
        });
      });
    });

    /* Textarea */
    var textarea  = m.querySelector('#frev-text');
    var charCount = m.querySelector('#frev-char-count');
    textarea.addEventListener('input', function() {
      state.text = textarea.value;
      charCount.textContent = textarea.value.length + ' / 500';
      _updateSubmitBtn(m, state);
    });

    /* Submit */
    m.querySelector('#frev-submit-btn').addEventListener('click', function() {
      _handleSubmit(m, state);
    });
  }

  function _updateStarPicker(picker, rating) {
    picker.querySelectorAll('.frev-star-label').forEach(function(lbl) {
      var val = parseInt(lbl.dataset.val, 10);
      lbl.classList.toggle('active', val <= rating);
    });
  }

  function _updateMiniStars(row, val) {
    row.querySelectorAll('.frev-mini-star').forEach(function(btn) {
      btn.classList.toggle('active', parseInt(btn.dataset.val, 10) <= val);
    });
  }

  function _updateSubmitBtn(m, state) {
    var btn = m.querySelector('#frev-submit-btn');
    btn.disabled = state.rating < 1;
  }

  async function _handleSubmit(m, state) {
    var btn      = m.querySelector('#frev-submit-btn');
    var feedback = m.querySelector('#frev-feedback');

    btn.disabled  = true;
    btn.textContent = 'Envoi en cours…';

    var missionId   = m.dataset.missionId;
    var artisanId   = m.dataset.artisanId;
    var clientId    = m.dataset.clientProfileId || null;
    var clientPhone = m.dataset.clientPhone     || null;

    var result = await submitReview({
      missionId:          missionId,
      artisanId:          artisanId,
      rating:             state.rating,
      reviewText:         state.text,
      clientProfileId:    clientId,
      clientPhone:        clientPhone,
      responseTimeScore:  state.rtScore || null,
      qualityScore:       state.qScore  || null
    });

    if (result.ok) {
      feedback.hidden = false;
      feedback.className = 'frev-feedback frev-success';
      feedback.innerHTML = '✓ Merci pour votre avis&nbsp;! Il sera affiché sur le profil de l\'artisan.';
      btn.textContent = 'Avis envoyé ✓';
      setTimeout(closeReviewModal, 2500);
    } else {
      feedback.hidden = false;
      feedback.className = 'frev-feedback frev-error';
      feedback.textContent = result.error || 'Erreur lors de l\'envoi.';
      btn.disabled    = false;
      btn.textContent = 'Envoyer mon avis';
    }
  }

  function closeReviewModal() {
    var m = document.getElementById('frev-review-modal');
    if (m) {
      m.hidden = true;
      m.dataset.missionId = '';
      m.dataset.artisanId = '';
    }
  }

  function openReviewModal(opts) {
    /* opts: { missionId, artisanId, clientProfileId, clientPhone } */
    _buildReviewModal();
    var m = document.getElementById('frev-review-modal');
    if (!m) return;

    m.dataset.missionId        = opts.missionId    || '';
    m.dataset.artisanId        = opts.artisanId    || '';
    m.dataset.clientProfileId  = opts.clientProfileId || '';
    m.dataset.clientPhone      = opts.clientPhone  || '';

    /* Reset state */
    m.querySelectorAll('input[name="frev_rating"]').forEach(function(r) { r.checked = false; });
    m.querySelectorAll('.frev-star-label').forEach(function(l) { l.classList.remove('active'); });
    m.querySelectorAll('.frev-mini-star').forEach(function(b) { b.classList.remove('active'); });
    var ta = m.querySelector('#frev-text'); if (ta) ta.value = '';
    var cc = m.querySelector('#frev-char-count'); if (cc) cc.textContent = '0 / 500';
    var hint = m.querySelector('#frev-star-hint'); if (hint) hint.textContent = 'Touchez pour noter';
    var btn = m.querySelector('#frev-submit-btn'); if (btn) { btn.disabled = true; btn.textContent = 'Envoyer mon avis'; }
    var fb  = m.querySelector('#frev-feedback'); if (fb) { fb.hidden = true; fb.textContent = ''; }

    m.hidden = false;
    /* Focus first star for a11y */
    var firstStar = m.querySelector('.frev-star-label');
    if (firstStar) setTimeout(function() { firstStar.focus(); }, 50);
  }

  /* ── DISPATCH V2 INTEGRATION ────────────────────────────── */
  /* Expose review score to FixeoDispatchV2 via monkey-patch.
     Applied as additive overlay — only if V2 is loaded. */

  function _patchDispatchV2() {
    if (!window.FixeoDispatchV2) return;
    if (window.FixeoDispatchV2._frevPatched) return;
    window.FixeoDispatchV2._frevPatched = true;

    /* Add getReviewScore(artisanId) → 0–100 based on cached stats */
    window.FixeoDispatchV2.getReviewScore = function(artisanId) {
      var c = _cache[artisanId];
      if (!c || c.stats.review_count === 0) return null; /* no data → not penalised */
      /* Normalise trust_score (0–100 range) */
      return Math.min(100, Math.max(0, c.stats.trust_score));
    };
  }

  /* ── TABLE EXISTENCE CHECK (P0-3 fix — frev-v1b) ─────────── */
  /* If the `reviews` table does not yet exist (SQL not applied),
     probe once at boot. On failure: disable all review UI silently.
     Never show a fake success toast. Fail closed. */

  var _tableReady = null; /* null = unchecked | true = OK | false = missing */

  async function _probeTable() {
    if (_tableReady !== null) return _tableReady;
    try {
      var sb = await _getSb();
      if (!sb) { _tableReady = false; return false; }
      /* A SELECT LIMIT 1 on a missing table returns error.code 42P01 (undefined_table) */
      var res = await sb.from('reviews').select('id').limit(1);
      if (res.error) {
        console.warn('[frev] reviews table not found — review UI disabled until SQL is applied.', res.error.message);
        _tableReady = false;
      } else {
        _tableReady = true;
      }
    } catch(e) {
      console.warn('[frev] table probe failed:', e && e.message);
      _tableReady = false;
    }
    return _tableReady;
  }

  /* Internal Supabase getter (same pattern as fetchReviews but standalone) */
  async function _getSb() {
    try {
      var FC = window.FixeoSupabaseClient;
      if (FC && FC.CONFIGURED) {
        try { await FC.ready(); } catch(_) {}
        if (FC.client) return FC.client;
      }
    } catch(_) {}
    try {
      var FS = window.FixeoSupabase;
      if (FS && typeof FS.getClient === 'function') return await FS.getClient();
    } catch(_) {}
    return null;
  }

  /* Patch openReviewModal to gate on _tableReady */
  var _origOpenReviewModal = null; /* set after _boot probes */

/* ── BOOT ──────────────────────────────────────────────── */

  function _boot() {
    /* P0-3: probe table existence first; disable review buttons if missing */
    _probeTable().then(function(ready) {
      if (!ready) {
        /* Hide all review buttons already rendered (e.g. client dashboard) */
        document.querySelectorAll('.fxv2-review-btn, .frev-trigger').forEach(function(btn) {
          btn.style.display = 'none';
          btn.setAttribute('aria-hidden', 'true');
          btn.setAttribute('disabled', 'true');
        });
        /* Intercept future openModal calls — return silently instead of showing broken UI */
        window.FixeoReviews && (window.FixeoReviews.openModal = function() {
          console.warn('[frev] openModal blocked — reviews table not yet applied.');
        });
        /* Watch for dynamically rendered review buttons (client dashboard renders async) */
        var btnObs = new MutationObserver(function() {
          document.querySelectorAll('.fxv2-review-btn:not([data-frev-hidden]), .frev-trigger:not([data-frev-hidden])').forEach(function(btn) {
            btn.style.display = 'none';
            btn.setAttribute('aria-hidden', 'true');
            btn.setAttribute('disabled', 'true');
            btn.dataset.frevHidden = '1';
          });
        });
        btnObs.observe(document.body, { childList: true, subtree: true });
        /* Disconnect after 30s — dashboard renders well within that */
        setTimeout(function() { btnObs.disconnect(); }, 30000);
        return; /* abort rest of boot */
      }
      _bootReady(); /* table exists — proceed normally */
    });
  }

  function _bootReady() {
    /* 1. Artisan profile page: inject review section */
    var profileRoot = document.getElementById('public-artisan-root');
    if (profileRoot) {
      /* Read artisan ID from URL */
      var urlParams = new URLSearchParams(window.location.search);
      var artisanId = urlParams.get('id') || urlParams.get('artisan');
      if (!artisanId) {
        /* Try from global state */
        try {
          artisanId = (window._fixeoCurrentArtisan && window._fixeoCurrentArtisan.id) ||
                      (window._fixeoArtisanState  && window._fixeoArtisanState.id);
        } catch(_) {}
      }
      if (artisanId) {
        /* Defer injection until after renderProfile() has run */
        setTimeout(function() { _injectProfileSection(artisanId); }, 800);
        /* Also re-attempt at 2s and 3s if profile hasn't rendered yet */
        setTimeout(function() { _injectProfileSection(artisanId); }, 2000);
      }
    }

    /* 2. Dispatch V2 patch */
    if (window.FixeoDispatchV2) {
      _patchDispatchV2();
    } else {
      /* Wait for V2 */
      var _dispatchPoll = setInterval(function() {
        if (window.FixeoDispatchV2) { _patchDispatchV2(); clearInterval(_dispatchPoll); }
      }, 500);
      setTimeout(function() { clearInterval(_dispatchPoll); }, 15000);
    }

    /* 3. Watch for artisan cards on homepage and inject badges */
    /* Deferred — cards may render lazily */
    setTimeout(function() { _injectCardBadges(); }, 1500);

    /* 4. Build review modal (preload DOM) */
    _buildReviewModal();
  }

  function _injectCardBadges() {
    document.querySelectorAll('.artisan-card[data-id]:not([data-frev-done])').forEach(function(card) {
      var id = card.dataset.id;
      if (id) _injectCardBadge(card, id);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    _boot();
  }

  /* ── PUBLIC API ─────────────────────────────────────────── */
  window.FixeoReviews = {
    VERSION:       VERSION,
    fetchReviews:  fetchReviews,
    submitReview:  submitReview,
    openModal:     openReviewModal,
    closeModal:    closeReviewModal,
    computeStats:  _computeStats,
    injectProfile: _injectProfileSection,
    injectCards:   _injectCardBadges
  };

}());
