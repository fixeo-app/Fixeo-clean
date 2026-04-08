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
    const trust = $('.trust-section');
    const how = $('.how-it-works-section');
    if (!trust || !how) return;
    if (trust.nextElementSibling === how) return;
    trust.insertAdjacentElement('afterend', how);
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
      const subtitle = $('.section-header p', testimonialSection);
      if (subtitle) subtitle.textContent = 'Avis vérifiés, rapides à lire, pour décider en confiance.';
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
      existingMain.removeAttribute('onclick');
      existingMain.addEventListener('click', function() {
        if (window.FixeoClientRequest?.open) {
          window.FixeoClientRequest.open(existingMain);
        } else {
          document.querySelector('[data-open-request-form="true"]')?.click();
        }
      });
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

    if (!$('.cta-secondary-alt', actions)) {
      const urgentBtn = document.createElement('button');
      urgentBtn.type = 'button';
      urgentBtn.className = 'cta-secondary-alt';
      urgentBtn.textContent = 'Besoin urgent ⚡';
      urgentBtn.setAttribute('data-open-express-request', 'true');
      urgentBtn.setAttribute('data-request-mode', 'express');
      urgentBtn.addEventListener('click', function(event) {
        event.preventDefault();
        if (window.FixeoClientRequest?.openExpress) {
          window.FixeoClientRequest.openExpress(urgentBtn);
        } else if (window.FixeoReservation?.openExpress) {
          window.FixeoReservation.openExpress();
        } else {
          document.querySelector('[data-open-request-form="true"]')?.click();
        }
      });
      actions.appendChild(urgentBtn);
    }

    let microtrust = $('.final-cta-microtrust', finalCta);
    if (!microtrust) {
      microtrust = document.createElement('p');
      microtrust.className = 'final-cta-microtrust';
      actions.insertAdjacentElement('afterend', microtrust);
    }
    microtrust.textContent = 'Réponse moyenne : moins de 10 minutes';

    const proof = $('.cta-proof', finalCta);
    if (proof) proof.textContent = 'Gratuit • Sans engagement • Artisans vérifiés et notés';
  }

  function optimizeFooter() {
    const supportList = $('.footer-links:last-of-type ul');
    if (supportList && !supportList.querySelector('[data-footer-request-link]')) {
      const requestItem = document.createElement('li');
      requestItem.innerHTML = '<a href="#" data-footer-request-link="true">Publier une demande</a>';
      supportList.prepend(requestItem);

      const whatsappItem = document.createElement('li');
      whatsappItem.innerHTML = '<a href="https://wa.me/212660484415" target="_blank" rel="noopener">WhatsApp Fixeo</a>';
      supportList.appendChild(whatsappItem);

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
        '<a href="https://wa.me/212660484415" target="_blank" rel="noopener">WhatsApp</a>'
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
