/* ============================================================
   FIXEO — Artisan Operating Cockpit V1
   js/fixeo-artisan-cockpit-v1.js   v1a

   Extension layer over fixeo-artisan-dashboard-v2.js.
   Adds: Gallery, Quotes, Public Profile, Profile Photo,
         Profile Completeness, Financial Center, Notifications.

   READS: window.FixeoArtisanV2._state (shared canonical state)
   WRITES: only via permitted RPCs or column-level grants (5 fields)
   NEVER: direct writes to privileged artisan fields
   NEVER: direct writes to availability / onboarding_completed / verified

   Storage bucket: 'artisan-media' (profile photos + gallery)
   Tables touched: quotes, notifications, artisans (5 safe fields)

   Version: v1a
   ============================================================ */

(function (window, document) {
  'use strict';

  if (window._fxCockpitLoaded) return;
  window._fxCockpitLoaded = true;

  var VERSION = 'v1b'; /* quote creation flow: _openQuoteModal, _doSubmitQuote,
                         eligible request CTAs, form submit delegation, cancel/error/success */

  /* ── HELPERS ──────────────────────────────────────────────── */
  function el(id)   { return document.getElementById(id); }
  function esc(s)   { var d=document.createElement('div'); d.appendChild(document.createTextNode(String(s||''))); return d.innerHTML; }
  function cls(s)   { return (s||'').toLowerCase().trim(); }
  function fmt(n)   { return Number(n||0).toLocaleString('fr-FR'); }

  function toast(msg, type) {
    /* Delegate to V2 toast if available */
    if (window.FixeoArtisanV2 && typeof window.FixeoArtisanV2.toast === 'function') {
      window.FixeoArtisanV2.toast(msg, type); return;
    }
    var wrap = el('fxav2-toast-wrap');
    if (!wrap) return;
    var t = document.createElement('div');
    t.className = 'fxa-toast' + (type === 'error' ? ' fxa-toast-error' : '');
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 3500);
  }

  function getV2State() {
    try { return (window.FixeoArtisanV2 && window.FixeoArtisanV2._state) || null; } catch(e) { return null; }
  }
  function getSB() {
    return window.FixeoSupabase && window.FixeoSupabase.getClient
      ? window.FixeoSupabase.getClient() : Promise.reject(new Error('Supabase not ready'));
  }

  /* ── STORAGE PATH ─────────────────────────────────────────── */
  var BUCKET = 'artisan-media';
  function _profilePath(uid)   { return 'profiles/' + uid + '/avatar.jpg'; }
  function _galleryPath(uid, name) { return 'profiles/' + uid + '/gallery/' + name; }

  /* ── PROFILE PHOTO ──────────────────────────────────────────
     Uploads to storage bucket 'artisan-media'.
     Updates artisans.photo_url (allowed column) via column grant.
     Falls back gracefully if bucket not provisioned.
  ──────────────────────────────────────────────────────────── */

  async function _uploadProfilePhoto(file, artisanId, uid) {
    /* Validate */
    if (!file) throw new Error('Aucun fichier sélectionné.');
    if (!file.type.startsWith('image/')) throw new Error('Fichier non supporté. Choisissez une image (JPG, PNG, WEBP).');
    if (file.size > 5 * 1024 * 1024) throw new Error('Fichier trop lourd (max 5 Mo).');

    var sb = await getSB();
    var path = _profilePath(uid);

    /* Upload (upsert) */
    var upRes = await sb.storage.from(BUCKET).upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: '3600'
    });
    if (upRes.error) throw new Error('Échec du téléversement: ' + upRes.error.message);

    /* Get public URL */
    var urlRes = sb.storage.from(BUCKET).getPublicUrl(path);
    var publicUrl = (urlRes.data && urlRes.data.publicUrl) || '';
    if (!publicUrl) throw new Error('URL de photo non disponible.');

    /* Persist to artisans.photo_url (column grant allows this) */
    var updateRes = await sb.from('artisans')
      .update({ photo_url: publicUrl })
      .eq('owner_user_id', uid);
    if (updateRes.error) throw new Error('Mise à jour profil échouée: ' + updateRes.error.message);

    return publicUrl;
  }

  function _renderProfilePhotoSection(ap, uid) {
    var photoUrl = (ap && ap.photo_url) || '';
    var initials = (function() {
      var n = (ap && (ap.full_name || ap.name)) || '';
      return n.split(' ').filter(Boolean).slice(0,2).map(function(w){return w[0].toUpperCase();}).join('') || '🔧';
    })();

    return '<div class="fxck-photo-section">'
      + '<div class="fxck-photo-wrap">'
      + (photoUrl
          ? '<img src="' + esc(photoUrl) + '" alt="Photo de profil" class="fxck-photo-img" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'">'
          + '<div class="fxck-photo-avatar" style="display:none">' + esc(initials) + '</div>'
          : '<div class="fxck-photo-avatar">' + esc(initials) + '</div>')
      + '<label class="fxck-photo-edit-btn" for="fxck-photo-input" title="Changer la photo">'
      + '<span style="font-size:1rem">📷</span>'
      + '<input type="file" id="fxck-photo-input" accept="image/jpeg,image/png,image/webp" style="display:none" data-action="photo-change" data-uid="' + esc(uid) + '" data-artisan-id="' + esc(ap && ap.id || '') + '">'
      + '</label>'
      + '</div>'
      + '<div class="fxck-photo-hint">Appuyez sur 📷 pour changer votre photo</div>'
      + '</div>';
  }

  /* ── GALLERY ────────────────────────────────────────────────
     portfolio_items table — ownership: artisan_id = auth.uid()::text
     Bucket: artisan-media / profiles/{uid}/gallery/
     Falls back to empty if table not provisioned.
  ──────────────────────────────────────────────────────────── */

  var MAX_GALLERY = 12;

  async function _fetchGallery(uid) {
    try {
      var sb = await getSB();
      var res = await sb.from('portfolio_items')
        .select('id,image_url,description,created_at')
        .eq('artisan_id', uid)
        .order('created_at', { ascending: false })
        .limit(MAX_GALLERY);
      if (res.error) return { items: [], error: res.error.message };
      return { items: res.data || [], error: null };
    } catch(e) { return { items: [], error: e.message }; }
  }

  async function _uploadGalleryPhoto(file, uid) {
    if (!file) throw new Error('Aucun fichier.');
    if (!file.type.startsWith('image/')) throw new Error('Image requise (JPG, PNG, WEBP).');
    if (file.size > 8 * 1024 * 1024) throw new Error('Fichier trop lourd (max 8 Mo).');

    var sb = await getSB();
    var name = Date.now() + '-' + Math.random().toString(36).slice(2,8) + '.jpg';
    var path = _galleryPath(uid, name);

    var upRes = await sb.storage.from(BUCKET).upload(path, file, {
      upsert: false, contentType: file.type, cacheControl: '3600'
    });
    if (upRes.error) throw new Error('Téléversement échoué: ' + upRes.error.message);

    var urlRes = sb.storage.from(BUCKET).getPublicUrl(path);
    var publicUrl = (urlRes.data && urlRes.data.publicUrl) || '';
    if (!publicUrl) throw new Error('URL introuvable.');

    /* Insert metadata row */
    var insRes = await sb.from('portfolio_items').insert({
      artisan_id:  uid,
      image_url:   publicUrl,
      description: '',
      source:      'dashboard_upload'
    });
    if (insRes.error) throw new Error('Enregistrement échoué: ' + insRes.error.message);

    return publicUrl;
  }

  async function _deleteGalleryItem(itemId, uid) {
    var sb = await getSB();
    /* RLS enforces artisan_id = auth.uid()::text — safe */
    var res = await sb.from('portfolio_items').delete().eq('id', itemId).eq('artisan_id', uid);
    if (res.error) throw new Error('Suppression échouée: ' + res.error.message);
  }

  function _renderGallerySection(items, uid, loading, err) {
    var sec = el('fxck-sec-gallery');
    if (!sec) return;

    if (loading) {
      sec.innerHTML = '<div class="fxa-section-head"><h2>🖼 Ma galerie</h2></div>'
        + '<div class="fxck-gallery-grid">'
        + [0,1,2].map(function(){ return '<div class="fxck-gallery-skel"></div>'; }).join('')
        + '</div>';
      return;
    }

    var html = '<div class="fxa-section-head"><h2>🖼 Ma galerie</h2>'
      + '<span class="fxa-section-count">' + items.length + '/' + MAX_GALLERY + '</span>'
      + '</div>';

    if (err) {
      html += '<div class="fxa-error-banner">⚠️ ' + esc(err) + '</div>';
    }

    html += '<div class="fxck-gallery-grid">';

    /* Upload tile — only if under limit */
    if (items.length < MAX_GALLERY) {
      html += '<label class="fxck-gallery-upload-tile" for="fxck-gallery-input" title="Ajouter une photo">'
        + '<span class="fxck-gallery-upload-icon">+</span>'
        + '<span style="font-size:.75rem;margin-top:4px">Ajouter</span>'
        + '<input type="file" id="fxck-gallery-input" accept="image/jpeg,image/png,image/webp" style="display:none" data-action="gallery-upload" data-uid="' + esc(uid) + '">'
        + '</label>';
    }

    items.forEach(function(item) {
      html += '<div class="fxck-gallery-tile" data-item-id="' + esc(item.id) + '">'
        + '<img src="' + esc(item.image_url || '') + '" alt="Réalisation" class="fxck-gallery-img" loading="lazy" onerror="this.parentNode.style.display=\'none\'">'
        + '<button class="fxck-gallery-del" data-action="gallery-delete" data-item-id="' + esc(item.id) + '" data-uid="' + esc(uid) + '" aria-label="Supprimer" title="Supprimer">✕</button>'
        + '</div>';
    });

    if (!items.length && !err) {
      html += '<div class="fxck-gallery-empty" style="grid-column:1/-1">'
        + '<div style="font-size:2rem">🏗</div>'
        + '<div class="fxa-empty-title" style="margin-top:8px">Aucune réalisation</div>'
        + '<div class="fxa-empty-sub">Ajoutez des photos de vos travaux pour inspirer confiance aux clients.</div>'
        + '</div>';
    }

    html += '</div>';
    sec.innerHTML = html;
  }

  /* ── QUOTES / DEVIS ─────────────────────────────────────────
     Quotes table: id, request_id, artisan_profile_id, proposed_price,
                   message, status (pending/accepted/rejected)
     submitQuote() from fixeo-supabase-core.js is available.
     Artisan fetches own quotes via artisan_profile_id filter.
  ──────────────────────────────────────────────────────────── */

  async function _fetchQuotes(artisanProfileId) {
    try {
      var sb = await getSB();
      /* artisan_profile_id = artisans.id (PK), not auth.uid() */
      var res = await sb.from('quotes')
        .select('id,request_id,proposed_price,message,status,created_at')
        .eq('artisan_profile_id', artisanProfileId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (res.error) return { quotes: [], error: res.error.message };
      return { quotes: res.data || [], error: null };
    } catch(e) { return { quotes: [], error: e.message }; }
  }

  function _quoteStatusLabel(st) {
    return { pending:'En attente', accepted:'Accepté', rejected:'Refusé', draft:'Brouillon', expired:'Expiré' }[st] || st;
  }
  function _quoteStatusCls(st) {
    return { pending:'fxa-badge-assigned', accepted:'fxa-badge-confirm', rejected:'fxa-badge-cancelled', expired:'fxa-badge-cancelled' }[st] || 'fxa-badge-new';
  }

  function _renderQuotesSection(quotes, loading, err) {
    var sec = el('fxck-sec-quotes');
    if (!sec) return;

    if (loading) {
      sec.innerHTML = '<div class="fxa-section-head"><h2>📋 Mes devis</h2></div>'
        + _skeletonCards(3);
      return;
    }

    /* Open requests eligible for quoting — from V2 state */
    var v2 = getV2State();
    var eligibleRequests = (v2 && v2.openRequests && v2.openRequests.length)
      ? v2.openRequests.filter(function(r) {
          /* Eligible: status=new — no existing accepted quote (server enforces; we show button) */
          return r.status === 'new';
        }).slice(0, 5)
      : [];

    var html = '<div class="fxa-section-head"><h2>📋 Mes devis</h2>'
      + '<span class="fxa-section-count">' + quotes.length + '</span>'
      + '</div>';

    /* Eligible requests CTA */
    if (eligibleRequests.length) {
      html += '<div class="fxck-quote-eligible-head">Demandes disponibles — Envoyer un devis</div>'
        + '<div class="fxa-card-list">'
        + eligibleRequests.map(function(r) {
          return '<div class="fxa-card fxck-quote-eligible-card">'
            + '<div class="fxck-quote-eligible-top">'
            + '<span class="fxa-card-service">' + esc(r.service_category || r.category || '—') + '</span>'
            + '<span class="fxck-quote-city">📍 ' + esc(r.city || '') + '</span>'
            + '</div>'
            + (r.description ? '<div class="fxa-card-desc" style="margin-top:4px">' + esc(r.description.slice(0, 80)) + (r.description.length > 80 ? '…' : '') + '</div>' : '')
            + '<div class="fxa-actions" style="margin-top:10px">'
            + '<button class="fxa-btn fxa-btn-primary fxa-btn-sm" '
            + 'data-action="quote-new" data-request-id="' + esc(r.id) + '" '
            + 'data-request-desc="' + esc(r.description || r.service_category || '') + '">'
            + '📋 Envoyer un devis</button>'
            + '</div>'
            + '</div>';
        }).join('')
        + '</div>';
    }

    if (err) {
      html += '<div class="fxa-error-banner">⚠️ ' + esc(err) + '</div>';
    } else if (!quotes.length) {
      html += '<div class="fxa-empty fxa-empty--inline" style="margin-top:14px">'
        + '<div class="fxa-empty-icon" style="font-size:1.8rem">📋</div>'
        + '<div>'
        + '<div class="fxa-empty-title" style="font-size:.92rem">Aucun devis envoyé</div>'
        + '<div class="fxa-empty-sub" style="font-size:.78rem">Vos devis apparaîtront ici après envoi.</div>'
        + '</div></div>';
    } else {
      /* Group by status */
      var pending  = quotes.filter(function(q){return q.status==='pending';});
      var accepted = quotes.filter(function(q){return q.status==='accepted';});
      var other    = quotes.filter(function(q){return q.status!=='pending'&&q.status!=='accepted';});

      function renderGroup(label, items) {
        if (!items.length) return '';
        return '<div class="fxck-quote-group-label">' + esc(label) + ' (' + items.length + ')</div>'
          + '<div class="fxa-card-list">'
          + items.map(function(q) {
            return '<div class="fxa-card fxck-quote-card">'
              + '<div class="fxa-card-top">'
              + '<span class="fxa-badge ' + _quoteStatusCls(q.status) + '">' + esc(_quoteStatusLabel(q.status)) + '</span>'
              + (q.proposed_price > 0 ? '<span class="fxck-quote-price">' + fmt(q.proposed_price) + ' MAD</span>' : '')
              + '</div>'
              + (q.message ? '<div class="fxa-card-desc" style="margin-top:6px">' + esc(q.message.slice(0,120)) + (q.message.length>120?'…':'') + '</div>' : '')
              + '<div class="fxck-quote-meta">'
              + (q.created_at ? new Date(q.created_at).toLocaleDateString('fr-FR') : '')
              + ' · Demande <code style="font-size:.75rem">' + esc((q.request_id||'').slice(0,8)) + '</code>'
              + '</div>'
              + '</div>';
          }).join('')
          + '</div>';
      }

      if (accepted.length) html += renderGroup('✅ Acceptés', accepted);
      if (pending.length)  html += renderGroup('⏳ En attente', pending);
      if (other.length)    html += renderGroup('📁 Historique', other);
    }

    sec.innerHTML = html;
  }

  /* ── PROFILE COMPLETENESS ───────────────────────────────────
     Truthful indicator from real fields only.
     Does NOT conflate with onboarding_completed or verified.
  ──────────────────────────────────────────────────────────── */

  function _computeCompleteness(ap, hasPhoto, hasGallery) {
    if (!ap) return { score: 0, missing: [], items: [] };
    var items = [
      { key: 'photo',    label: 'Photo de profil',    done: hasPhoto },
      { key: 'name',     label: 'Nom complet',         done: !!(ap.full_name && ap.full_name.length >= 3) },
      { key: 'trade',    label: 'Métier',              done: !!(ap.service_category || ap.category) },
      { key: 'city',     label: 'Ville',               done: !!ap.city },
      { key: 'zone',     label: 'Zone d\'intervention',done: !!(ap.work_zone && ap.work_zone.length >= 2) },
      { key: 'desc',     label: 'Description',         done: !!(ap.description && ap.description.length >= 20) },
      { key: 'gallery',  label: 'Photo de réalisation',done: hasGallery }
    ];
    var done  = items.filter(function(i){ return i.done; }).length;
    var score = Math.round((done / items.length) * 100);
    var missing = items.filter(function(i){ return !i.done; }).map(function(i){ return i.label; });
    return { score: score, missing: missing, items: items };
  }

  function _renderCompletenessBar(completeness) {
    var pct = completeness.score;
    var color = pct >= 80 ? '#20c997' : pct >= 50 ? '#f4b942' : '#e1306c';
    return '<div class="fxck-complete-wrap">'
      + '<div class="fxck-complete-head">'
      + '<span class="fxck-complete-label">Profil public</span>'
      + '<span class="fxck-complete-pct" style="color:' + color + '">' + pct + '%</span>'
      + '</div>'
      + '<div class="fxck-complete-bar-bg"><div class="fxck-complete-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>'
      + (completeness.missing.length
          ? '<div class="fxck-complete-missing">Manquant : ' + completeness.missing.map(esc).join(' · ') + '</div>'
          : '<div class="fxck-complete-done">✅ Profil complet</div>')
      + '</div>';
  }

  /* ── PUBLIC PROFILE PREVIEW ─────────────────────────────────
     Shows exactly what a client sees.
     verified badge only if verified===true.
     rating/reviews only if review_count > 0.
  ──────────────────────────────────────────────────────────── */

  function _renderPublicProfileSection(ap, reviews, items) {
    var sec = el('fxck-sec-public-profile');
    if (!sec) return;

    if (!ap) {
      sec.innerHTML = '<div class="fxa-empty"><div class="fxa-empty-icon">👁</div>'
        + '<div class="fxa-empty-title">Profil public non disponible</div>'
        + '<div class="fxa-empty-sub">Complétez votre profil pour avoir un profil public visible par les clients.</div></div>';
      return;
    }

    var name     = ap.full_name || ap.name || 'Artisan';
    var cat      = ap.service_category || ap.category || '';
    var city     = ap.city || '';
    var zone     = ap.work_zone || '';
    var desc     = ap.description || '';
    var photoUrl = ap.photo_url || '';
    var verified = ap.verified || false;
    var rating   = Number(ap.rating || 0);
    var revCount = Number(ap.review_count || 0);
    var slug     = ap.public_slug || '';

    var stars = '';
    if (revCount > 0) {
      var fullStars = Math.floor(rating);
      stars = '★'.repeat(fullStars) + (rating - fullStars >= 0.5 ? '½' : '') + ' ' + rating.toFixed(1) + ' (' + revCount + ' avis)';
    }

    var avatarHtml = photoUrl
      ? '<img src="' + esc(photoUrl) + '" alt="' + esc(name) + '" class="fxck-pub-avatar-img">'
      : '<div class="fxck-pub-avatar-init">' + esc(name.split(' ').slice(0,2).map(function(w){return w[0]&&w[0].toUpperCase();}).join('')) + '</div>';

    var galleryHtml = '';
    if (items && items.length) {
      galleryHtml = '<div class="fxck-pub-gallery-label">Réalisations</div>'
        + '<div class="fxck-pub-gallery">'
        + items.slice(0,6).map(function(it) {
          return '<img src="' + esc(it.image_url||'') + '" alt="Réalisation" class="fxck-pub-gallery-img" loading="lazy">';
        }).join('')
        + '</div>';
    }

    var html = '<div class="fxa-section-head"><h2>👁 Mon profil public</h2>'
      + (slug ? '<a class="fxa-btn fxa-btn-ghost fxa-btn-sm" href="/artisan/' + esc(slug) + '" target="_blank" rel="noopener">Voir en ligne</a>' : '')
      + '</div>'
      + '<div class="fxck-pub-card">'
      + '<div class="fxck-pub-header">'
      + '<div class="fxck-pub-avatar">' + avatarHtml + '</div>'
      + '<div class="fxck-pub-info">'
      + '<div class="fxck-pub-name">' + esc(name)
      + (verified ? ' <span class="fxck-verified-badge" title="Vérifié par Fixeo">✓ Vérifié</span>' : '')
      + '</div>'
      + (cat  ? '<div class="fxck-pub-trade">' + esc(cat) + '</div>' : '')
      + (city ? '<div class="fxck-pub-city">📍 ' + esc(city) + (zone ? ' · ' + esc(zone) : '') + '</div>' : '')
      + (stars ? '<div class="fxck-pub-stars" style="color:#f4b942;margin-top:4px">' + esc(stars) + '</div>' : '')
      + '</div></div>'
      + (desc ? '<div class="fxck-pub-desc">' + esc(desc) + '</div>' : '<div class="fxck-pub-desc fxck-pub-desc--empty">Aucune description. Ajoutez une description pour attirer plus de clients.</div>')
      + galleryHtml
      + '</div>'
      + (reviews && reviews.length
          ? '<div class="fxck-pub-reviews-head">Derniers avis</div>'
            + '<div class="fxa-card-list">'
            + reviews.slice(0,3).map(function(r) {
              return '<div class="fxa-card fxck-review-card">'
                + '<div style="color:#f4b942">' + '★'.repeat(r.rating) + '☆'.repeat(5-r.rating) + '</div>'
                + (r.review_text ? '<div class="fxa-card-desc" style="margin-top:4px">' + esc(r.review_text) + '</div>' : '')
                + '<div class="fxck-review-meta">' + (r.created_at ? new Date(r.created_at).toLocaleDateString('fr-FR') : '') + '</div>'
                + '</div>';
            }).join('')
            + '</div>'
          : '');

    sec.innerHTML = html;
  }

  /* ── FINANCIAL CENTER ──────────────────────────────────────
     Only shows missions.agreed_price when NOT null.
     Never uses agreed_price=0 as earnings.
     final_price sourced from service_requests if available.
     Truthful: shows '—' for unknown values.
  ──────────────────────────────────────────────────────────── */

  function _computeFinancials(missions) {
    var result = {
      validatedCount: 0,
      completedCount: 0,
      knownRevenue:   null,   /* null = truly unknown */
      pendingRevenue: null
    };

    (missions || []).forEach(function(m) {
      var sr  = m._request;
      var st  = String((sr && sr.status) || m.status || '').toLowerCase();
      /* final_price = authoritative; agreed_price = admin-set post-COD; never infer from 0 */
      var finalP   = sr && Number(sr.final_price)  > 0 ? Number(sr.final_price)  : null;
      var agreedP  = m.agreed_price !== null && m.agreed_price !== undefined && Number(m.agreed_price) > 0
                     ? Number(m.agreed_price) : null;
      var price = finalP || agreedP; /* prefer final_price; agreed_price if admin-set */

      if (st === 'validated' || st === 'done') {
        result.validatedCount++;
        if (price) {
          result.knownRevenue = (result.knownRevenue || 0) + Math.round(price * 0.85);
        }
      } else if (st === 'completed') {
        result.completedCount++;
        if (price) {
          result.pendingRevenue = (result.pendingRevenue || 0) + Math.round(price * 0.85);
        }
      }
    });

    return result;
  }

  function _renderFinancialCenter(missions) {
    var sec = el('fxck-sec-revenus');
    if (!sec) return;

    var fin = _computeFinancials(missions);

    function moneyVal(v) {
      return v !== null && v > 0
        ? '<span class="fxck-money">' + fmt(v) + ' <span class="fxck-currency">MAD</span></span>'
        : '<span class="fxck-money-unknown">—</span>';
    }

    var html = '<div class="fxa-section-head"><h2>💰 Mes revenus</h2></div>'
      + '<div class="fxck-fin-note">Estimations sur la base des missions validées par l\'équipe Fixeo. Paiements COD (cash) collectés sur place.</div>'
      + '<div class="fxck-fin-grid">'
      + '<div class="fxck-fin-card">'
        + '<div class="fxck-fin-label">Missions validées</div>'
        + '<div class="fxck-fin-val">' + fin.validatedCount + '</div>'
      + '</div>'
      + '<div class="fxck-fin-card">'
        + '<div class="fxck-fin-label">Revenus nets (validés)</div>'
        + moneyVal(fin.knownRevenue)
        + '<div class="fxck-fin-sub">Après commission Fixeo (15%)</div>'
      + '</div>'
      + (fin.completedCount > 0 ? '<div class="fxck-fin-card fxck-fin-card--pending">'
        + '<div class="fxck-fin-label">En attente de validation</div>'
        + moneyVal(fin.pendingRevenue)
        + '<div class="fxck-fin-sub">' + fin.completedCount + ' mission(s) terminée(s), non encore validée(s)</div>'
        + '</div>' : '')
      + '</div>'
      + '<div class="fxck-fin-footer">Les montants affichés ne constituent pas un relevé de compte officiel. Contactez le support Fixeo pour tout litige.</div>';

    sec.innerHTML = html;
  }

  /* ── NOTIFICATIONS ──────────────────────────────────────────
     Reads from notifications table via FixeoNotificationsV1 or direct.
  ──────────────────────────────────────────────────────────── */

  async function _fetchNotifications(uid) {
    try {
      var sb = await getSB();
      var res = await sb.from('notifications')
        .select('id,type,title,message,related_entity_type,related_entity_id,read,created_at')
        .eq('recipient_user_id', uid)
        .order('created_at', { ascending: false })
        .limit(30);
      if (res.error) return { items: [], error: res.error.message };
      return { items: res.data || [], error: null };
    } catch(e) { return { items: [], error: e.message }; }
  }

  async function _markNotificationRead(id) {
    try {
      var sb = await getSB();
      await sb.from('notifications').update({ read: true }).eq('id', id);
    } catch(e) { /* best-effort */ }
  }

  function _renderNotificationsSection(items, loading, err) {
    var sec = el('fxck-sec-notifications');
    if (!sec) return;

    if (loading) {
      sec.innerHTML = '<div class="fxa-section-head"><h2>🔔 Notifications</h2></div>' + _skeletonCards(3);
      return;
    }

    var unread = items.filter(function(n){ return !n.read; }).length;
    var html = '<div class="fxa-section-head"><h2>🔔 Notifications</h2>'
      + (unread > 0 ? '<span class="fxa-section-count">' + unread + ' non lue(s)</span>' : '')
      + '</div>';

    if (err) {
      html += '<div class="fxa-error-banner">⚠️ ' + esc(err) + '</div>';
    } else if (!items.length) {
      html += '<div class="fxa-empty">'
        + '<div class="fxa-empty-icon">🔔</div>'
        + '<div class="fxa-empty-title">Aucune notification</div>'
        + '<div class="fxa-empty-sub">Vos notifications d\'activité apparaîtront ici.</div>'
        + '</div>';
    } else {
      html += '<div class="fxa-card-list">'
        + items.map(function(n) {
          return '<div class="fxa-card fxck-notif-card' + (n.read ? '' : ' fxck-notif-unread') + '" '
            + 'data-action="notif-read" data-notif-id="' + esc(n.id) + '">'
            + '<div class="fxck-notif-title">' + esc(n.title || n.type || 'Notification') + '</div>'
            + (n.message ? '<div class="fxck-notif-body">' + esc(n.message) + '</div>' : '')
            + '<div class="fxck-notif-meta">' + (n.created_at ? new Date(n.created_at).toLocaleDateString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : '') + '</div>'
            + '</div>';
        }).join('')
        + '</div>';
    }

    sec.innerHTML = html;
  }

  /* ── SKELETON ─────────────────────────────────────────────── */
  function _skeletonCards(n) {
    var html = '<div class="fxa-card-list">';
    for (var i=0; i<n; i++) {
      html += '<div class="fxck-skel-card"><div class="fxa-skel fxa-skel-title"></div>'
            + '<div class="fxa-skel fxa-skel-line"></div>'
            + '<div class="fxa-skel fxa-skel-line-s"></div></div>';
    }
    return html + '</div>';
  }

  /* ── COCKPIT STATE ────────────────────────────────────────── */
  var _ck = {
    gallery:        null,   /* { items, error } */
    quotes:         null,   /* { quotes, error } */
    notifications:  null,   /* { items, error } */
    reviews:        null,   /* array */
    completeness:   null,   /* { score, missing, items } */
    photoUploading: false,
    galleryUploading: false
  };

  /* ── LOAD ─────────────────────────────────────────────────── */
  async function _loadCockpit() {
    var v2 = getV2State();
    if (!v2 || !v2.session) return;
    var uid  = v2.session.user.id;
    var ap   = v2.artisanProfile;
    var artisanId = ap && ap.id;

    /* Parallel fetches */
    var [galleryRes, quotesRes, notifsRes] = await Promise.all([
      _fetchGallery(uid),
      artisanId ? _fetchQuotes(artisanId) : Promise.resolve({ quotes: [], error: null }),
      _fetchNotifications(uid)
    ]);

    _ck.gallery       = galleryRes;
    _ck.quotes        = quotesRes;
    _ck.notifications = notifsRes;

    /* Reviews — read from artisan_review_stats view */
    try {
      var sb = await getSB();
      var revRes = await sb.from('reviews')
        .select('rating,review_text,created_at')
        .eq('artisan_id', artisanId || uid)
        .order('created_at', { ascending: false })
        .limit(10);
      _ck.reviews = revRes.error ? [] : (revRes.data || []);
    } catch(e) { _ck.reviews = []; }

    /* Completeness */
    var hasPhoto   = !!(ap && ap.photo_url && ap.photo_url.length > 5);
    var hasGallery = !!(_ck.gallery.items && _ck.gallery.items.length > 0);
    _ck.completeness = _computeCompleteness(ap, hasPhoto, hasGallery);
  }

  /* ── RENDER COCKPIT SECTIONS ──────────────────────────────── */
  function _renderAll(section) {
    var v2 = getV2State();
    if (!v2) return;
    var uid  = v2.session && v2.session.user && v2.session.user.id;
    var ap   = v2.artisanProfile;
    var missions = v2.myMissions || [];

    switch (section) {
      case 'gallery':
        _renderGallerySection(
          (_ck.gallery && _ck.gallery.items) || [],
          uid,
          !_ck.gallery,
          _ck.gallery && _ck.gallery.error
        );
        break;
      case 'quotes':
        _renderQuotesSection(
          (_ck.quotes && _ck.quotes.quotes) || [],
          !_ck.quotes,
          _ck.quotes && _ck.quotes.error
        );
        break;
      case 'notifications':
        _renderNotificationsSection(
          (_ck.notifications && _ck.notifications.items) || [],
          !_ck.notifications,
          _ck.notifications && _ck.notifications.error
        );
        break;
      case 'public-profile':
        _renderPublicProfileSection(ap, _ck.reviews, _ck.gallery && _ck.gallery.items);
        break;
      case 'revenus':
        _renderFinancialCenter(missions);
        break;
      case 'profile':
        /* Inject photo section and completeness into existing profile section */
        _injectProfileExtensions(ap, uid);
        break;
    }
  }

  function _injectProfileExtensions(ap, uid) {
    /* Photo */
    var photoWrap = el('fxck-photo-inject');
    if (photoWrap && ap && uid) {
      photoWrap.innerHTML = _renderProfilePhotoSection(ap, uid);
    }
    /* Completeness bar */
    var compWrap = el('fxck-complete-inject');
    if (compWrap && _ck.completeness) {
      compWrap.innerHTML = _renderCompletenessBar(_ck.completeness);
    }
  }

  /* ── PHOTO UPLOAD HANDLER ─────────────────────────────────── */
  async function _handlePhotoChange(input) {
    if (!input.files || !input.files[0]) return;
    if (_ck.photoUploading) return;
    _ck.photoUploading = true;

    var file      = input.files[0];
    var uid       = input.dataset.uid;
    var artisanId = input.dataset.artisanId;
    var wrap      = input.closest('.fxck-photo-wrap');
    if (wrap) wrap.classList.add('fxck-uploading');
    toast('Téléversement de la photo…');

    try {
      var url = await _uploadProfilePhoto(file, artisanId, uid);
      /* Update V2 state so next render picks it up */
      var v2 = getV2State();
      if (v2 && v2.artisanProfile) v2.artisanProfile.photo_url = url;
      /* Update img in place without full reload */
      var img = document.querySelector('.fxck-photo-img');
      if (img) { img.src = url; img.style.display = ''; var av = document.querySelector('.fxck-photo-avatar'); if(av) av.style.display='none'; }
      else { _injectProfileExtensions(v2 && v2.artisanProfile, uid); }
      toast('Photo mise à jour ✓');
    } catch(e) {
      toast(e.message || 'Échec du téléversement', 'error');
    } finally {
      _ck.photoUploading = false;
      if (wrap) wrap.classList.remove('fxck-uploading');
      input.value = '';
    }
  }

  /* ── GALLERY UPLOAD HANDLER ───────────────────────────────── */
  async function _handleGalleryUpload(input) {
    if (!input.files || !input.files[0]) return;
    if (_ck.galleryUploading) return;
    _ck.galleryUploading = true;

    var uid  = input.dataset.uid;
    var file = input.files[0];
    toast('Ajout de la photo à la galerie…');

    try {
      await _uploadGalleryPhoto(file, uid);
      /* Refresh gallery */
      _ck.gallery = await _fetchGallery(uid);
      var hasGallery = !!(_ck.gallery.items && _ck.gallery.items.length > 0);
      var v2 = getV2State();
      _ck.completeness = _computeCompleteness(v2 && v2.artisanProfile,
        !!(v2 && v2.artisanProfile && v2.artisanProfile.photo_url), hasGallery);
      _renderGallerySection(_ck.gallery.items, uid, false, _ck.gallery.error);
      toast('Photo ajoutée ✓');
    } catch(e) {
      toast(e.message || 'Échec', 'error');
    } finally {
      _ck.galleryUploading = false;
      input.value = '';
    }
  }

  async function _handleGalleryDelete(itemId, uid) {
    if (!confirm('Supprimer cette photo ?')) return;
    try {
      await _deleteGalleryItem(itemId, uid);
      _ck.gallery = await _fetchGallery(uid);
      _renderGallerySection(_ck.gallery.items, uid, false, _ck.gallery.error);
      toast('Photo supprimée');
    } catch(e) { toast(e.message || 'Erreur', 'error'); }
  }

  /* ── EVENTS ───────────────────────────────────────────────── */
  /* ── QUOTE CREATION FLOW ─────────────────────────────────────
     Uses canonical FixeoSupabase.submitQuote() exclusively.
     Fields: request_id (canonical), proposed_price (MAD, >0),
             message (optional description, max 500 chars).
     Eligibility guard: request must be status='new', no accepted quote,
             no existing mission — all enforced by submitQuote() server-side.
     No fake statuses. No invented acceptance states.
  ──────────────────────────────────────────────────────────── */

  var _quoteSubmitting = false;

  function _openQuoteModal(requestId, requestDesc) {
    /* Find V2 modal machinery */
    var overlay = el('fxav2-modal-overlay');
    var body    = el('fxav2-modal-body');
    if (!overlay || !body) { toast('Interface non disponible', 'error'); return; }

    var shortId = (requestId || '').slice(0, 8);
    body.innerHTML = '<h3 style="margin:0 0 16px;font-size:1rem;font-weight:800">📋 Envoyer un devis</h3>'
      + (requestDesc ? '<div class="fxck-quote-modal-req">Demande : ' + esc(requestDesc.slice(0, 80)) + (requestDesc.length > 80 ? '…' : '') + '</div>' : '')
      + '<form id="fxck-quote-form" autocomplete="off" style="margin-top:12px">'
      + '<div class="fxck-modal-field">'
      + '<label for="fxck-q-price" class="fxck-modal-label">Prix proposé (MAD) <span style="color:#e1306c">*</span></label>'
      + '<input type="number" id="fxck-q-price" name="price" min="1" max="999999" step="1" required '
      + 'class="fxck-modal-input" placeholder="Ex: 350" inputmode="numeric">'
      + '</div>'
      + '<div class="fxck-modal-field">'
      + '<label for="fxck-q-msg" class="fxck-modal-label">Description / détails (optionnel)</label>'
      + '<textarea id="fxck-q-msg" name="message" maxlength="500" rows="3" '
      + 'class="fxck-modal-input fxck-modal-textarea" placeholder="Décrivez brièvement votre intervention…"></textarea>'
      + '</div>'
      + '<div id="fxck-quote-err" class="fxa-error-banner" style="display:none;margin-bottom:10px"></div>'
      + '<div class="fxa-actions" style="margin-top:14px">'
      + '<button type="button" class="fxa-btn fxa-btn-ghost" data-action="close-modal">Annuler</button>'
      + '<button type="submit" id="fxck-quote-submit" class="fxa-btn fxa-btn-primary" style="flex:2">Envoyer le devis</button>'
      + '</div>'
      + '</form>';

    /* Store request_id on form for submit handler */
    var form = document.getElementById('fxck-quote-form');
    if (form) form.dataset.requestId = requestId;

    /* Show modal */
    overlay.classList.remove('hidden');
    overlay.removeAttribute('aria-hidden');

    /* Focus price input */
    setTimeout(function() {
      var inp = document.getElementById('fxck-q-price');
      if (inp) inp.focus();
    }, 80);
  }

  async function _doSubmitQuote(form) {
    if (_quoteSubmitting) return;

    var requestId = form.dataset.requestId || '';
    var priceInp  = document.getElementById('fxck-q-price');
    var msgInp    = document.getElementById('fxck-q-msg');
    var errEl     = document.getElementById('fxck-quote-err');
    var submitBtn = document.getElementById('fxck-quote-submit');
    var errDiv    = errEl;

    function showErr(msg) {
      if (errDiv) { errDiv.textContent = msg; errDiv.style.display = ''; }
      else toast(msg, 'error');
    }
    function clearErr() { if (errDiv) errDiv.style.display = 'none'; }

    clearErr();

    if (!requestId) { showErr('Demande introuvable. Ferme et réessaie.'); return; }

    var price = Number(priceInp && priceInp.value);
    if (!price || price <= 0 || !Number.isInteger(price)) {
      showErr('Prix invalide. Entrez un montant entier en MAD (ex: 350).');
      if (priceInp) priceInp.focus();
      return;
    }
    if (price > 999999) { showErr('Prix trop élevé (max 999 999 MAD).'); return; }

    var message = (msgInp && msgInp.value.trim()) || '';

    /* Check FixeoSupabase.submitQuote is available */
    if (!window.FixeoSupabase || typeof window.FixeoSupabase.submitQuote !== 'function') {
      showErr('Service non disponible. Actualisez la page.');
      return;
    }

    _quoteSubmitting = true;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Envoi…'; }

    try {
      await window.FixeoSupabase.submitQuote({
        request_id:     requestId,
        proposed_price: price,
        message:        message
      });

      /* Close modal */
      var overlay = el('fxav2-modal-overlay');
      if (overlay) { overlay.classList.add('hidden'); overlay.setAttribute('aria-hidden', 'true'); }

      toast('✅ Devis envoyé avec succès.');

      /* Refresh quotes section */
      var v2 = getV2State();
      var artisanId = v2 && v2.artisanProfile && v2.artisanProfile.id;
      if (artisanId) {
        _ck.quotes = await _fetchQuotes(artisanId);
        if ((v2 && v2.section) === 'quotes') _renderAll('quotes');
      }
    } catch(e) {
      var msg = (e && e.message) || 'Erreur lors de l\'envoi.';
      showErr(msg);
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Envoyer le devis'; }
    } finally {
      _quoteSubmitting = false;
    }
  }

  function _bindCockpitEvents() {
    document.addEventListener('change', function(e) {
      var t = e.target;
      if (t && t.dataset.action === 'photo-change')   _handlePhotoChange(t);
      if (t && t.dataset.action === 'gallery-upload') _handleGalleryUpload(t);
    });

    /* Quote form submit (delegated — form is rendered inside V2 modal) */
    document.addEventListener('submit', function(e) {
      var form = e.target;
      if (form && form.id === 'fxck-quote-form') {
        e.preventDefault();
        _doSubmitQuote(form);
      }
    });

    document.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;

      if (action === 'gallery-delete') {
        _handleGalleryDelete(btn.dataset.itemId, btn.dataset.uid);
      }

      if (action === 'quote-new') {
        _openQuoteModal(btn.dataset.requestId, btn.dataset.requestDesc);
      }

      if (action === 'notif-read') {
        var notifId = btn.dataset.notifId;
        if (notifId && btn.classList.contains('fxck-notif-unread')) {
          btn.classList.remove('fxck-notif-unread');
          _markNotificationRead(notifId);
          /* Update badge */
          if (_ck.notifications && _ck.notifications.items) {
            var n = _ck.notifications.items.find(function(x){return x.id===notifId;});
            if (n) n.read = true;
          }
          var badge = el('fxav2-bell-badge');
          if (badge) {
            var cnt = (_ck.notifications && _ck.notifications.items || []).filter(function(x){return !x.read;}).length;
            badge.textContent = cnt > 0 ? String(cnt) : '';
            badge.style.display = cnt > 0 ? '' : 'none';
          }
        }
      }
    });

    /* Section change hook — render appropriate cockpit section */
    document.addEventListener('fixeo:section:changed', function(e) {
      var section = e && e.detail && e.detail.section;
      if (section) {
        /* Loading state first */
        _renderSectionLoading(section);
        _renderAll(section);
      }
    });
  }

  function _renderSectionLoading(section) {
    var map = {
      gallery:        'fxck-sec-gallery',
      quotes:         'fxck-sec-quotes',
      notifications:  'fxck-sec-notifications',
      'public-profile': 'fxck-sec-public-profile',
      revenus:        'fxck-sec-revenus'
    };
    var secId = map[section];
    if (!secId) return;
    var sec = el(secId);
    if (sec && !sec.innerHTML.trim()) sec.innerHTML = _skeletonCards(3);
  }

  /* ── BELL BADGE INITIAL LOAD ──────────────────────────────── */
  function _refreshBellBadge() {
    var badge = el('fxav2-bell-badge');
    if (!badge || !_ck.notifications) return;
    var cnt = (_ck.notifications.items || []).filter(function(n){ return !n.read; }).length;
    badge.textContent = cnt > 99 ? '99+' : cnt > 0 ? String(cnt) : '';
    badge.style.display = cnt > 0 ? '' : 'none';
  }

  /* ── BOOT ─────────────────────────────────────────────────── */
  async function _boot() {
    /* Wait for V2 to be ready */
    var retries = 0;
    while (retries < 20 && (!getV2State() || !getV2State().session)) {
      await new Promise(function(r){ setTimeout(r, 300); });
      retries++;
    }

    _bindCockpitEvents();

    /* Initial load */
    try {
      await _loadCockpit();
      _refreshBellBadge();
      /* Render profile photo/completeness if profile section is active */
      var v2 = getV2State();
      if (v2 && v2.artisanProfile) {
        var uid = v2.session && v2.session.user && v2.session.user.id;
        _injectProfileExtensions(v2.artisanProfile, uid);
      }
    } catch(e) { console.warn('[fxck] boot error:', e.message); }
  }

  /* ── REFRESH HOOK (called by V2 after mutations) ──────────── */
  window.addEventListener('fixeo:data:changed', function(e) {
    var v2 = getV2State();
    if (!v2 || !v2.session) return;
    var uid = v2.session.user.id;
    var section = v2.section;
    /* Re-render relevant cockpit section */
    setTimeout(function() {
      if (section === 'gallery')        _renderAll('gallery');
      if (section === 'quotes')         _renderAll('quotes');
      if (section === 'notifications')  _renderAll('notifications');
      if (section === 'revenus')        _renderAll('revenus');
      if (section === 'public-profile') _renderAll('public-profile');
    }, 200);
  });

  /* PUBLIC API */
  window.FixeoCockpit = {
    VERSION:      VERSION,
    loadCockpit:  _loadCockpit,
    renderAll:    _renderAll,
    refreshBell:  _refreshBellBadge,
    getState:     function() { return _ck; }
  };

  /* Boot */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot, { once: true });
  } else {
    _boot();
  }

}(window, document));
