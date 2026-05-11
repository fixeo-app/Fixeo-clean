/*!
 * fixeo-seo-profile.js — v seo1
 * Dynamic SEO enrichment for artisan-profile.html
 *
 * Listens for fixeo:artisan:resolved (dispatched by fixeo-profile-v2a.js
 * after Supabase data arrives) and updates:
 *   - <title>
 *   - <meta name="description">
 *   - og:title / og:description / og:url / og:image
 *   - twitter:title / twitter:description
 *   - <link rel="canonical">
 *   - JSON-LD ProfessionalService schema
 *
 * Lightweight: no DOM thrash, no polling, no setInterval.
 * Fires ONCE per page load via event listener.
 * Falls back gracefully if artisan data is minimal.
 *
 * DO NOT: modify reservation logic, profile render, auth/session.
 */
(function (window, document) {
  'use strict';

  var VERSION = 'seo1';

  function _esc(s) {
    if (!s) return '';
    return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _setMeta(sel, attr, val) {
    if (!val) return;
    var el = document.querySelector(sel);
    if (el) el.setAttribute(attr, val);
  }

  function _updateSEO(artisan) {
    if (!artisan || !artisan.name) return;

    var name     = artisan.name || '';
    var category = artisan.category || artisan.specialty || '';
    var city     = artisan.city || '';
    var rating   = artisan.rating ? parseFloat(artisan.rating).toFixed(1) : null;
    var reviews  = artisan.review_count || artisan.reviewCount || 0;
    var id       = artisan.id || artisan._supabase_id || '';
    var photo    = artisan.photo_url || artisan.avatar || '';

    /* ── Title ── */
    var title = name;
    if (category && city) {
      title = name + ' — ' + category + ' à ' + city + ' | Fixeo';
    } else if (category) {
      title = name + ' — ' + category + ' | Fixeo';
    } else {
      title = name + ' | Artisan vérifié Fixeo';
    }
    document.title = title;

    /* ── Description ── */
    var desc = 'Profil de ' + name;
    if (category && city) {
      desc = name + ', ' + category + ' à ' + city + '.';
      if (rating && reviews >= 3) {
        desc += ' Note ' + rating + '/5 basée sur ' + reviews + ' avis clients.';
      }
      desc += ' Intervention rapide, profil vérifié Fixeo.';
    }
    _setMeta('meta[name="description"]', 'content', desc);

    /* ── Canonical ── */
    var canonicalUrl = 'https://fixeo.ma/artisan-profile.html' + (id ? '?id=' + encodeURIComponent(id) : '');
    var canon = document.querySelector('link[rel="canonical"]');
    if (canon) {
      canon.setAttribute('href', canonicalUrl);
    } else {
      var lc = document.createElement('link');
      lc.rel = 'canonical';
      lc.href = canonicalUrl;
      document.head.appendChild(lc);
    }

    /* ── OpenGraph ── */
    _setMeta('meta[property="og:title"]', 'content', title);
    _setMeta('meta[property="og:description"]', 'content', desc);
    _setMeta('meta[property="og:url"]', 'content', canonicalUrl);
    if (photo) _setMeta('meta[property="og:image"]', 'content', photo);

    /* ── Twitter ── */
    _setMeta('meta[name="twitter:title"]', 'content', title);
    _setMeta('meta[name="twitter:description"]', 'content', desc);

    /* ── JSON-LD ProfessionalService ── */
    var ld = {
      '@context': 'https://schema.org',
      '@type': 'ProfessionalService',
      'name': _esc(name),
      'url': canonicalUrl,
      'provider': { '@type': 'Organization', 'name': 'Fixeo', 'url': 'https://fixeo.ma/' }
    };
    if (category) ld['serviceType'] = _esc(category);
    if (city) {
      ld['areaServed'] = { '@type': 'City', 'name': _esc(city) };
    }
    if (rating && reviews >= 3) {
      ld['aggregateRating'] = {
        '@type': 'AggregateRating',
        'ratingValue': parseFloat(rating),
        'reviewCount': parseInt(reviews, 10),
        'bestRating': 5
      };
    }
    if (photo) {
      ld['image'] = photo;
    }
    /* BreadcrumbList */
    ld['breadcrumb'] = {
      '@type': 'BreadcrumbList',
      'itemListElement': [
        { '@type': 'ListItem', 'position': 1, 'name': 'Fixeo', 'item': 'https://fixeo.ma/' },
        { '@type': 'ListItem', 'position': 2, 'name': category || 'Artisan', 'item': 'https://fixeo.ma/services.html' },
        { '@type': 'ListItem', 'position': 3, 'name': name, 'item': canonicalUrl }
      ]
    };

    var el = document.getElementById('fixeo-profile-jsonld');
    if (el) {
      el.textContent = JSON.stringify(ld);
    } else {
      var s = document.createElement('script');
      s.type = 'application/ld+json';
      s.id = 'fixeo-profile-jsonld';
      s.textContent = JSON.stringify(ld);
      document.head.appendChild(s);
    }
  }

  /* Listen for V2 artisan resolved event */
  document.addEventListener('fixeo:artisan:resolved', function (e) {
    try {
      var artisan = e && e.detail && e.detail.artisan ? e.detail.artisan : null;
      if (artisan) _updateSEO(artisan);
    } catch (err) {
      /* silent */
    }
  }, { once: true });

  /* Fallback: try from window._fixeoCurrentArtisan at idle */
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(function () {
      if (window._fixeoCurrentArtisan) {
        _updateSEO(window._fixeoCurrentArtisan);
      }
    }, { timeout: 5000 });
  }

  window.FixeoSEOProfile = { version: VERSION, updateSEO: _updateSEO };

}(window, document));
