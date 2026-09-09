(function() {
  'use strict';

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $all(selector, root) {
    return Array.from(
      (root || document).querySelectorAll(selector)
    );
  }


  /* ══════════════════════════════════════════════════════════════
     CANONICAL CLIENT ENTRY
     Generic client requests always return to Homepage Flagship RAFI.
     No legacy request / estimation / reservation modal here.
     ══════════════════════════════════════════════════════════════ */

  function goToHeroRequest(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const hero =
      document.getElementById('home') ||
      document.querySelector('.fxhf-root');

    if (hero) {
      hero.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });

      try {
        history.replaceState(
          null,
          '',
          window.location.pathname +
          window.location.search +
          '#home'
        );
      } catch (error) {}

      return;
    }

    window.location.href = 'index.html#home';
  }


  function hideSection(selector) {
    const node = $(selector);

    if (!node) return;

    node.classList.add(
      'homepage-conversion-hidden'
    );
  }


  function moveHowItWorksAfterTrust() {
    /*
     * Marketplace-first flow:
     * artisans → how it works.
     *
     * .trust-section stays available in DOM
     * as an existing structural anchor.
     */
    const artisans = $('#artisans-section');
    const how = $('.how-it-works-section');

    if (!artisans || !how) return;
    if (artisans.nextElementSibling === how) return;

    artisans.insertAdjacentElement(
      'afterend',
      how
    );
  }


  /* ══════════════════════════════════════════════════════════════
     MINI TRUST STRIP
     Truthful marketplace signals only.
     ══════════════════════════════════════════════════════════════ */

  function injectMiniTrustStrip() {
    if (
      document.getElementById(
        'fxf-mini-trust'
      )
    ) {
      return;
    }

    var artisans = $('#artisans-section');

    if (!artisans) return;

    var strip =
      document.createElement('div');

    strip.id = 'fxf-mini-trust';

    strip.setAttribute(
      'aria-hidden',
      'true'
    );

    strip.innerHTML =
      '<div class="fxf-trust-inner">' +

        '<div class="fxf-pill fxf-pill-verified">' +
          '<span class="fxf-pill-icon">\u2714\ufe0f</span>' +
          '<div class="fxf-pill-text">' +
            '<span class="fxf-pill-label">' +
              'Profils r\u00e9f\u00e9renc\u00e9s' +
            '</span>' +
            '<span class="fxf-pill-sub">' +
              'Consultez les informations disponibles sur chaque profil' +
            '</span>' +
          '</div>' +
        '</div>' +

        '<div class="fxf-pill fxf-pill-available">' +
          '<span class="fxf-pill-icon">\u26a1</span>' +
          '<div class="fxf-pill-text">' +
            '<span class="fxf-pill-label">' +
              'Recherche par m\u00e9tier et ville' +
            '</span>' +
            '<span class="fxf-pill-sub">' +
              'Explorez le r\u00e9seau selon le contexte de votre besoin' +
            '</span>' +
          '</div>' +
        '</div>' +

        '<div class="fxf-pill fxf-pill-payment">' +
          '<span class="fxf-pill-icon">&#128179;</span>' +
          '<div class="fxf-pill-text">' +
            '<span class="fxf-pill-label">' +
              'Paiement apr\u00e8s intervention' +
            '</span>' +
            '<span class="fxf-pill-sub">' +
              'Le r\u00e8glement intervient apr\u00e8s la prestation' +
            '</span>' +
          '</div>' +
        '</div>' +

        '<div class="fxf-pill fxf-pill-coverage">' +
          '<span class="fxf-pill-icon">&#128205;</span>' +
          '<div class="fxf-pill-text">' +
            '<span class="fxf-pill-label">' +
              'R\u00e9seau FIXEO au Maroc' +
            '</span>' +
            '<span class="fxf-pill-sub">' +
              'Des profils artisans r\u00e9f\u00e9renc\u00e9s dans plusieurs villes' +
            '</span>' +
          '</div>' +
        '</div>' +

      '</div>';

    artisans.insertAdjacentElement(
      'afterend',
      strip
    );
  }


  /* ══════════════════════════════════════════════════════════════
     HOMEPAGE MICROCOPY
     ══════════════════════════════════════════════════════════════ */

  function optimizeMicrocopy() {
    const how =
      $('.how-it-works-section');

    if (how) {
      how.classList.add(
        'homepage-conversion-priority'
      );

      const subtitle =
        $('.how-subtitle', how);

      if (subtitle) {
        subtitle.textContent =
          'Un parcours simple pour passer du besoin à l’intervention.';
      }

      const steps =
        $all('.step-card', how);

      const shortTexts = [
        'Décrivez votre besoin en quelques mots.',
        'FIXEO structure le contexte de votre demande.',
        'Explorez les profils qui correspondent à votre recherche.',
        'Consultez les informations disponibles avant de réserver.'
      ];

      steps.forEach(
        (step, index) => {
          const text = $('p', step);

          if (
            text &&
            shortTexts[index]
          ) {
            text.textContent =
              shortTexts[index];
          }
        }
      );
    }


    const services = $('#services');

    if (services) {
      services.classList.add(
        'homepage-conversion-priority'
      );

      const subtitle =
        $('.services-subtitle', services);

      if (subtitle) {
        subtitle.textContent =
          'Choisissez un service pour explorer les profils artisans référencés.';
      }
    }


    const resultsTitle =
      $('#results-main-title');

    if (resultsTitle) {
      resultsTitle.textContent =
        'Artisans référencés près de chez vous';
    }


    const resultsMeta =
      $('#results-main-meta');

    if (resultsMeta) {
      resultsMeta.textContent =
        'Consultez les profils et les informations disponibles avant de choisir.';
    }


    const bannerTitle =
      $('.separator-title');

    if (bannerTitle) {
      bannerTitle.textContent =
        'Simple, clair, structuré';
    }


    const bannerSubtitle =
      $('.separator-subtitle');

    if (bannerSubtitle) {
      bannerSubtitle.textContent =
        'Un besoin, un contexte et des profils à explorer';
    }


    const feedSection =
      $('#feed-section');

    if (feedSection) {
      feedSection.classList.add(
        'homepage-conversion-priority'
      );

      const subtitle =
        $('.section-header p', feedSection);

      if (subtitle) {
        subtitle.textContent =
          'Découvrez les réalisations publiées sur FIXEO.';
      }
    }


    const testimonialSection =
      $('.testimonial-section');

    if (testimonialSection) {
      testimonialSection.classList.add(
        'homepage-conversion-priority'
      );

      /*
       * Vision section:
       * existing copy remains authoritative.
       */
    }
  }


  /* ══════════════════════════════════════════════════════════════
     ARTISAN RESULTS — MOBILE CLIENT ENTRY
     Return to Flagship Hero instead of opening legacy modal.
     ══════════════════════════════════════════════════════════════ */

  function addArtisansCTAs() {
    const headerCopy =
      $('.results-header-copy');

    const isMobile =
      window.matchMedia
        ? window
            .matchMedia(
              '(max-width: 768px)'
            )
            .matches
        : window.innerWidth <= 768;

    if (
      !headerCopy ||
      $('.results-header-cta-row') ||
      !isMobile
    ) {
      return;
    }

    const row =
      document.createElement('div');

    row.className =
      'results-header-cta-row';

    row.innerHTML =
      '<button ' +
        'type="button" ' +
        'class="results-primary-request-btn" ' +
        'data-fixeo-hero-entry="request">' +
        'Décrire mon besoin' +
      '</button>';

    headerCopy.appendChild(row);

    const button =
      row.querySelector(
        '[data-fixeo-hero-entry="request"]'
      );

    if (button) {
      button.addEventListener(
        'click',
        goToHeroRequest
      );
    }
  }


  /* ══════════════════════════════════════════════════════════════
     FINAL CTA
     Generic request CTA → Homepage Flagship Hero.
     ══════════════════════════════════════════════════════════════ */

  function optimizeFinalCTA() {
    const finalCta =
      $('.final-cta');

    if (!finalCta) return;

    finalCta.classList.add(
      'homepage-conversion-priority'
    );


    const kicker =
      $('.urgency', finalCta);

    if (kicker) {
      kicker.textContent =
        'BESOIN D’UN ARTISAN';
    }


    const title =
      $('#final-cta-title');

    if (title) {
      title.textContent =
        'Décrivez votre besoin. FIXEO s’occupe de la suite.';
    }


    const subtitle =
      $('.subtitle', finalCta);

    if (subtitle) {
      subtitle.textContent =
        'Revenez au point d’entrée principal pour démarrer votre demande.';
    }


    const existingMain =
      $('.cta-main', finalCta);

    if (existingMain) {

      /*
       * Remove every legacy request-flow contract.
       * This CTA no longer owns or opens a modal.
       */
      existingMain.removeAttribute(
        'data-open-request-form'
      );

      existingMain.removeAttribute(
        'data-request-mode'
      );

      existingMain.removeAttribute(
        'data-request-source'
      );

      existingMain.removeAttribute(
        'onclick'
      );

      existingMain.removeAttribute(
        'aria-haspopup'
      );

      existingMain.removeAttribute(
        'aria-controls'
      );


      existingMain.setAttribute(
        'data-fixeo-hero-entry',
        'request'
      );


      if (
        existingMain.tagName &&
        existingMain.tagName.toLowerCase() === 'a'
      ) {
        existingMain.setAttribute(
          'href',
          '#home'
        );
      }


      existingMain.textContent =
        'Décrire mon besoin';


      if (
        existingMain.dataset
          .finalCtaHeroBound !== 'true'
      ) {
        existingMain.addEventListener(
          'click',
          goToHeroRequest
        );

        existingMain.dataset
          .finalCtaHeroBound = 'true';
      }
    }


    /*
     * Existing urgent CTA remains untouched.
     * No duplicate secondary CTA injected here.
     */


    const proof =
      $('.cta-proof', finalCta);

    if (proof) {
      proof.textContent =
        'Profils référencés • Paiement après intervention';
    }
  }


  /* ══════════════════════════════════════════════════════════════
     FOOTER
     Canonical footer authority = fixeo-footer-global.js.
     This optimizer must never inject transactional footer CTAs.
     ══════════════════════════════════════════════════════════════ */

  function optimizeFooter() {
    /*
     * Intentionally empty.
     *
     * No "Publier une demande" injection.
     * No FixeoRequestFlowV4.
     * No legacy modal.
     *
     * Canonical client request entry:
     * Homepage Flagship Hero / RAFI.
     */
  }


  /* ══════════════════════════════════════════════════════════════
     FEED
     ══════════════════════════════════════════════════════════════ */

  function optimizeFeedVisibility() {
    const feedContainer =
      $('#feed-container');

    const seeMoreButton =
      $('#feed-see-more-btn');

    if (!feedContainer) return;

    feedContainer.classList.add(
      'conversion-feed-limited'
    );

    seeMoreButton?.addEventListener(
      'click',
      function() {
        feedContainer.classList.remove(
          'conversion-feed-limited'
        );
      }
    );
  }


  /* ══════════════════════════════════════════════════════════════
     MOBILE HERO STATE
     ══════════════════════════════════════════════════════════════ */

  function initMobileHeroCompactState() {
    const isMobile =
      window.matchMedia
        ? window
            .matchMedia(
              '(max-width: 768px)'
            )
            .matches
        : window.innerWidth <= 768;

    const hero =
      $('#home.hero-section');

    const body =
      document.body;

    if (!body) return;


    if (
      !isMobile ||
      !hero
    ) {
      body.classList.remove(
        'fixeo-mobile-hero-active'
      );

      return;
    }


    const updateHeroState =
      function() {
        const baseHeight =
          hero.offsetHeight ||
          window.innerHeight ||
          720;

        const threshold =
          Math.max(
            baseHeight * 0.82,
            380
          );

        body.classList.toggle(
          'fixeo-mobile-hero-active',
          (
            window.scrollY ||
            window.pageYOffset ||
            0
          ) < threshold
        );
      };


    updateHeroState();

    window.addEventListener(
      'scroll',
      updateHeroState,
      { passive: true }
    );

    window.addEventListener(
      'resize',
      updateHeroState
    );
  }


  /* ══════════════════════════════════════════════════════════════
     SERVICE CHIPS
     ══════════════════════════════════════════════════════════════ */

  function improveServiceChipBehavior() {
    $all('.service-chip').forEach(
      function(chip) {

        if (
          chip.tagName === 'A'
        ) {
          return;
        }


        chip.addEventListener(
          'click',
          function() {
            window.setTimeout(
              function() {
                $('#artisans-section')
                  ?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                  });
              },
              120
            );
          }
        );


        chip.addEventListener(
          'keydown',
          function(event) {

            if (
              event.key === 'Enter' ||
              event.key === ' '
            ) {
              window.setTimeout(
                function() {
                  $('#artisans-section')
                    ?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start'
                    });
                },
                120
              );
            }
          }
        );

      }
    );
  }


  /* ══════════════════════════════════════════════════════════════
     INIT
     ══════════════════════════════════════════════════════════════ */

  function init() {
    moveHowItWorksAfterTrust();

    injectMiniTrustStrip();

    hideSection(
      '#recommended-artisan-section'
    );

    hideSection(
      '#service-artisans-section'
    );

    hideSection(
      '[aria-labelledby="seo-local-links-title"]'
    );

    hideSection(
      '#secondary-search-section'
    );

    hideSection(
      '#top-artisans'
    );

    optimizeMicrocopy();

    addArtisansCTAs();

    optimizeFinalCTA();

    optimizeFooter();

    optimizeFeedVisibility();

    improveServiceChipBehavior();

    initMobileHeroCompactState();
  }


  if (
    document.readyState === 'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      init,
      { once: true }
    );
  } else {
    init();
  }

})();
