/* fixeo-schema-rating.js — AggregateRating schema injector
   Version: rating-v1a
   Injects LocalBusiness + AggregateRating JSON-LD into any page that loads this script.
   Zero dependencies. Zero DOM manipulation. Schema-only.
*/
(function() {
  'use strict';
  if (document.querySelector('script[data-fixeo-rating]')) return; // idempotent
  var schema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": "Fixeo",
    "url": "https://www.fixeo.ma",
    "logo": "https://www.fixeo.ma/img/fixeo-logo.png",
    "description": "Plateforme de mise en relation avec des artisans vérifiés au Maroc.",
    "areaServed": "MA",
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.9",
      "reviewCount": "247",
      "bestRating": "5",
      "worstRating": "1"
    },
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "customer service",
      "availableLanguage": ["French", "Arabic"]
    }
  };
  var s = document.createElement('script');
  s.type = 'application/ld+json';
  s.setAttribute('data-fixeo-rating', '1');
  s.textContent = JSON.stringify(schema);
  document.head.appendChild(s);
})();
