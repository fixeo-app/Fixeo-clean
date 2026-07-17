(function() {
  'use strict';

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $all(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function hideSection(selector) {
    const node = $(selector);
    if (!node) return;
    node.classList.add('homepage-conversion-hidden');
  }

  function moveHowItWorksAfterTrust() {
    // v2: Move how-it-works AFTER #artisans-section (marketplace-first flow).
    // .trust-section stays hidden as a DOM anchor — no visibility change.
    const artisans = $('#artisans-section');
    const how = $('.how-it-works-section');
    if (!artisans || !how) return;
    if (artisans.nextElementSibling === how) return;
    artisans.insertAdjacentElement('afterend', how);
  }

  function injectMiniTrustStrip() {
    // Phase B: compact 4-pill trust strip injected between artisans-section and how-it-works.
    if (document.getElementById('fxf-mini-trust')) return;
    var artisans = $('#artisans-section');
    if (!artisans) return;
    var strip = document.createElement('div');
    strip.id = 'fxf-mini-trust';
    strip.setAttribute('aria-hidden', 'true');
    /* L-2: Marketplace-signal copy. Each pill = operational confidence, not a feature list.
     * Pill 1 — quality gate (human validation, not just "verified" badge)
     * Pill 2 — live availability signal (present tense: "Disponible maintenant")
     * Pill 3 — payment guarantee (consistent with L-1 "après intervention" language)
     * Pill 4 — active marketplace network (not a static city count)
     * No apostrophes (U+2019) inside single-quoted JS strings — use \u2019 if needed.
     * All strings here use double-escape for safe embedding. */
    strip.innerHTML =
      '<div class="fxf-trust-inner">' +
        '<div class="fxf-pill fxf-pill-verified">' +
          '<span class="fxf-pill-icon">\u2714\ufe0f</span>' +
          '<div class="fxf-pill-text">' +
            '<span class="fxf-pill-label">Artisans qualifi\u00e9s</span>' +
            '<span class="fxf-pill-sub">Chaque profil valid\u00e9 par notre \u00e9quipe</span>' +
          '</div>' +
        '</div>' +
        '<div class="fxf-pill fxf-pill-available">' +
          '<span class="fxf-pill-icon">\u26a1</span>' +
          '<div class="fxf-pill-text">' +
            '<span class="fxf-pill-label">Disponible maintenant</span>' +
            '<span class="fxf-pill-sub">R\u00e9ponse garantie sous 30\u00a0min</span>' +
          '</div>' +
        '</div>' +
        '<div class="fxf-pill fxf-pill-payment">' +
          '<span class="fxf-pill-icon">&#128179;</span>' +
          '<div class="fxf-pill-text">' +
            '<span class="fxf-pill-label">Paiement apr\u00e8s intervention</span>' +
            '<span class="fxf-pill-sub">Z\u00e9ro avance \u2014 vous payez quand c\u2019est fait</span>' +
          '</div>' +
        '</div>' +
        '<div class="fxf-pill fxf-pill-coverage">' +
          '<span class="fxf-pill-icon">&#128205;</span>' +
          '<div class="fxf-pill-text">' +
            '<span class="fxf-pill-label">Actif dans tout le Maroc</span>' +
            '<span class="fxf-pill-sub">Casablanca \u00b7 Rabat \u00b7 Marrakech \u00b7 F\u00e8s \u00b7 Agadir\u2026</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    artisans.insertAdjacentElement('afterend', strip);
  }

  function optimizeMicrocopy() {
    const how = $('.how-it-works-section');
    if (how) {
      how.classList.add('homepage-conversion-priority');
      const subtitle = $('.how-subtitle', how);
      if (subtitle) subtitle.textContent = 'Simple, rapide, sans engagement.';
      const steps = $all('.step-card', how);
      const shortTexts = [
        'Décrivez le problème en 30 secondes.',
        'Recevez rapidement plusieurs propositions.',
        'Choisissez l’artisan qui vous convient.',
        'Validez puis notez l’intervention.'
      ];
      steps.forEach((step, index) => {
        const text = $('p', step);
        if (text && shortTexts[index]) text.textContent = shortTexts[index];
      });
    }

    const services = $('#services');
    if (services) {
      services.classList.add('homepage-conversion-priority');
      const subtitle = $('.services-subtitle', services);
      if (subtitle) subtitle.textContent = 'Choisissez un service pour voir des artisans vérifiés et notés.';
    }

    const resultsTitle = $('#results-main-title');
    if (resultsTitle) resultsTitle.textContent = 'Artisans vérifiés et notés près de chez vous';

    const resultsMeta = $('#results-main-meta');
    if (resultsMeta) resultsMeta.textContent = 'Comparez les profils, les prix et les disponibilités en quelques secondes.';

    const bannerTitle = $('.separator-title');
    if (bannerTitle) bannerTitle.textContent = 'Simple, rapide, transparent';

    const bannerSubtitle = $('.separator-subtitle');
    if (bannerSubtitle) bannerSubtitle.textContent = 'Artisans vérifiés, prix visibles et choix sans pression';

    const feedSection = $('#feed-section');
    if (feedSection) {
      feedSection.classList.add('homepage-conversion-priority');
      const subtitle = $('.section-header p', feedSection);
      if (subtitle) subtitle.textContent = 'Avant / après réels pour juger rapidement la qualité.';
    }

    const testimonialSection = $('.testimonial-section');
    if (testimonialSection) {
      testimonialSection.classList.add('homepage-conversion-priority');
      /* [patched v9] vision section — do not overwrite subtitle */
    }
  }

  function addArtisansCTAs() {
    const headerCopy = $('.results-header-copy');
    const isMobile = window.matchMedia ? window.matchMedia('(max-width: 768px)').matches : window.innerWidth <= 768;
    if (!headerCopy || $('.results-header-cta-row') || !isMobile) return;

    const row = document.createElement('div');
    row.className = 'results-header-cta-row';
    row.innerHTML = '<button type="button" class="results-primary-request-btn">Publier ma demande</button>';

    const requestBtn = row.querySelector('button');
    requestBtn?.addEventListener('click', function() {
      if (window.FixeoClientRequest?.open) {
        window.FixeoClientRequest.open(requestBtn);
      } else {
        document.getElementById('mobile-sticky-cta')?.click();
      }
    });

    headerCopy.appendChild(row);
  }

  function optimizeFinalCTA() {
    const finalCta = $('.final-cta');
    if (!finalCta) return;
    finalCta.classList.add('homepage-conversion-priority');

    const kicker = $('.urgency', finalCta);
    if (kicker) kicker.textContent = 'Simple • Gratuit • Sans engagement';

    const title = $('#final-cta-title');
    if (title) title.textContent = 'Publiez votre demande et recevez des offres en quelques minutes';

    const subtitle = $('.subtitle', finalCta);
    if (subtitle) subtitle.textContent = 'Gratuit • Sans engagement • Réponse rapide';

    const existingMain = $('.cta-main', finalCta);

if (existingMain) {
  existingMain.textContent = 'Publier ma demande gratuitement';
  existingMain.setAttribute('type', 'button');

  /*
   * Final CTA owns one stable click route only.
   * Remove legacy/canonical auto-binding attributes to prevent duplicate
   * listeners and self-click fallback recursion.
   */
  existingMain.removeAttribute('onclick');
  existingMain.removeAttribute('data-open-request-form');
  existingMain.removeAttribute('data-request-mode');

  if (existingMain.dataset.finalCtaBound !== 'true') {
    existingMain.dataset.finalCtaBound = 'true';

    existingMain.addEventListener('click', function(event) {
      event.preventDefault();

      const requestApi = window.FixeoClientRequest;

      if (!requestApi || typeof requestApi.open !== 'function') {
        console.warn('[FIXEO] Request modal API unavailable for final CTA.');
        return;
      }

      requestApi.open(existingMain);
    });
  }
}

    let actions = $('.final-cta-actions', finalCta);
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'final-cta-actions';
      if (existingMain) {
        existingMain.insertAdjacentElement('beforebegin', actions);
        actions.appendChild(existingMain);
      }
    }

    /* [patched] cta-secondary-alt injection disabled — .final-cta-urgent already in HTML */

    /* [patched] final-cta-microtrust injection disabled — .final-cta-proof already in HTML */

    const proof = $('.cta-proof', finalCta);
    if (proof) proof.textContent = 'Gratuit • Sans engagement • Artisans vérifiés et notés';
  }

  function optimizeFooter() {
    const supportList = $('.footer-links:last-of-type ul');
    if (supportList && !supportList.querySelector('[data-footer-request-link]')) {
      const requestItem = document.createElement('li');
      requestItem.innerHTML = '<a href="#" data-footer-request-link="true">Publier une demande</a>';
      supportList.prepend(requestItem);

      /* [patched] wa.me footer link disabled — whatsapp.html now in footer */

      requestItem.querySelector('a').addEventListener('click', function(event) {
        event.preventDefault();
        if (window.FixeoClientRequest?.open) {
          window.FixeoClientRequest.open(event.currentTarget);
        } else {
          document.querySelector('[data-open-request-form="true"]')?.click();
        }
      });
    }

    const brand = $('.footer-brand');
    if (brand && !$('.footer-quick-actions', brand)) {
      const quickActions = document.createElement('div');
      quickActions.className = 'footer-quick-actions';
      quickActions.innerHTML = [
        '<a href="#" data-footer-quick-request="true">Publier une demande</a>',
        ''
      ].join('');
      brand.appendChild(quickActions);
      quickActions.querySelector('[data-footer-quick-request="true"]').addEventListener('click', function(event) {
        event.preventDefault();
        if (window.FixeoClientRequest?.open) {
          window.FixeoClientRequest.open(event.currentTarget);
        } else {
          document.querySelector('[data-open-request-form="true"]')?.click();
        }
      });
    }
  }

  function optimizeFeedVisibility() {
    const feedContainer = $('#feed-container');
    const seeMoreButton = $('#feed-see-more-btn');
    if (!feedContainer) return;
    feedContainer.classList.add('conversion-feed-limited');
    seeMoreButton?.addEventListener('click', function() {
      feedContainer.classList.remove('conversion-feed-limited');
    });
  }


  function initMobileHeroCompactState() {
    const isMobile = window.matchMedia ? window.matchMedia('(max-width: 768px)').matches : window.innerWidth <= 768;
    const hero = $('#home.hero-section');
    const body = document.body;
    if (!body) return;
    if (!isMobile || !hero) {
      body.classList.remove('fixeo-mobile-hero-active');
      return;
    }

    const updateHeroState = function() {
      const baseHeight = hero.offsetHeight || window.innerHeight || 720;
      const threshold = Math.max(baseHeight * 0.82, 380);
      body.classList.toggle('fixeo-mobile-hero-active', (window.scrollY || window.pageYOffset || 0) < threshold);
    };

    updateHeroState();
    window.addEventListener('scroll', updateHeroState, { passive: true });
    window.addEventListener('resize', updateHeroState);
  }

  function improveServiceChipBehavior() {
    $all('.service-chip').forEach(function(chip) {
      if (chip.tagName === 'A') return;
      chip.addEventListener('click', function() {
        window.setTimeout(function() {
          $('#artisans-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);
      });
      chip.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' || event.key === ' ') {
          window.setTimeout(function() {
            $('#artisans-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 120);
        }
      });
    });
  }

  function init() {
    moveHowItWorksAfterTrust();
    injectMiniTrustStrip();
    hideSection('#recommended-artisan-section');
    hideSection('#service-artisans-section');
    hideSection('[aria-labelledby="seo-local-links-title"]');
    hideSection('#secondary-search-section');
    hideSection('#top-artisans');
    optimizeMicrocopy();
    addArtisansCTAs();
    optimizeFinalCTA();
    optimizeFooter();
    optimizeFeedVisibility();
    improveServiceChipBehavior();
    initMobileHeroCompactState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
