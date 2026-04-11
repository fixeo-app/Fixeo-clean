(function (window) {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.FixeoMissionSystem || typeof window.submitQuoteForm !== 'function') return;
    const originalSubmitQuoteForm = window.submitQuoteForm;
    window.submitQuoteForm = function (event) {
      const form = event && event.currentTarget;
      const formData = form ? new FormData(form) : null;
      const payload = formData ? {
        artisanId: window.ARTISAN_DATA?.id || '',
        artisanName: window.ARTISAN_DATA?.name || '',
        service: String(formData.get('service') || '').trim(),
        city: String(formData.get('city') || '').trim(),
        description: String(formData.get('description') || '').trim(),
        phone: String(formData.get('phone') || '').trim(),
        requestedDate: String(formData.get('date') || '').trim(),
        suggestedPrice: Number(window.ARTISAN_DATA?.priceFrom || 200) || 200
      } : null;
      originalSubmitQuoteForm.call(this, event);
      if (payload && payload.artisanId && payload.artisanName && payload.service && payload.city && payload.description && payload.phone) {
        const mission = window.FixeoMissionSystem.createMissionFromQuote(payload);
        if (mission) {
          window.notifications?.success('Mission COD créée', `Référence ${mission.id} ajoutée au suivi client/artisan.`);
        }
      }
    };
  });
})(window);
