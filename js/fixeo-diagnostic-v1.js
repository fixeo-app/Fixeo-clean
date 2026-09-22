/* FIXEO Diagnostic bootstrap. No media or provider code loads before opening. */
(function () {
  'use strict';
  if (window.FixeoDiagnostic) return;
  var loaded,
    settings,
    active = false;
  var BASE = '/api/diagnostic-v1';
  async function authHeaders(requireAuth) {
    var headers = {
      'Content-Type': 'application/json',
      'x-fixeo-diagnostic': '1',
    };
    try {
      var sb;
      if (window.FixeoSupabaseClient && window.FixeoSupabaseClient.CONFIGURED) {
        sb = (await window.FixeoSupabaseClient.ready()).client;
        if (!sb) throw new Error('AUTH_UNAVAILABLE');
      } else if (window.FixeoSupabase && window.FixeoSupabase.getClient) {
        sb = await window.FixeoSupabase.getClient();
      }
      if (sb) {
        var result = await sb.auth.getSession();
        if (result.error) throw result.error;
        if (result.data && result.data.session)
          headers.Authorization = 'Bearer ' + result.data.session.access_token;
      }
    } catch (error) {
      if (active || requireAuth) throw new Error('AUTH_REQUIRED');
    }
    return headers;
  }
  async function api(body) {
    var controller = new AbortController();
    var timeout = window.setTimeout(function () {
      controller.abort();
    }, 55000);
    try {
      var response = await fetch(BASE, {
        method: 'POST',
        credentials: 'same-origin',
        headers: await authHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      var result = await response.json();
      if (!response.ok || !result.ok)
        throw new Error(result.error || 'DIAGNOSTIC_FAILED');
      return result;
    } finally {
      window.clearTimeout(timeout);
    }
  }
  function loadModal() {
    if (!loaded)
      loaded = new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.src = '/js/fixeo-diagnostic-modal-v1.js?v=diagnostic-v1.1';
        script.onload = resolve;
        script.onerror = function () {
          loaded = null;
          script.remove();
          reject(new Error('LOAD_FAILED'));
        };
        document.head.appendChild(script);
      });
    return loaded;
  }
  async function getConfig() {
    var response = await fetch(BASE, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('DIAGNOSTIC_UNAVAILABLE');
    settings = await response.json();
    return settings;
  }
  async function open(context) {
    var cfg = settings || (await getConfig());
    if (!cfg.enabled) throw new Error('DIAGNOSTIC_UNAVAILABLE');
    await loadModal();
    active = true;
    if (window.FixeoEstimatorV2) window.FixeoEstimatorV2.close();
    return window.FixeoDiagnosticModal.open(context || {});
  }
  function saveTracking(result) {
    if (
      !/^[a-f0-9]{64}$/.test(result.guest_token || '') ||
      !/^FX-[A-Z0-9-]+$/.test(result.tracking_ref || '')
    )
      return false;
    try {
      var registry = JSON.parse(
        localStorage.getItem('fixeo_guest_access_v1') || '{}',
      );
      if (!registry || typeof registry !== 'object' || Array.isArray(registry))
        return false;
      registry[result.tracking_ref] = {
        tracking_ref: result.tracking_ref,
        server_request_id: result.request_id || result.id,
        guest_token: result.guest_token,
        saved_at: new Date().toISOString(),
      };
      localStorage.setItem('fixeo_guest_access_v1', JSON.stringify(registry));
      return true;
    } catch (_) {
      return false;
    }
  }
  window.FixeoDiagnostic = {
    open: open,
    api: api,
    authHeaders: authHeaders,
    saveTracking: saveTracking,
    setActive: function (value) {
      active = !!value;
    },
  };
  async function initialize() {
    var section = document.getElementById('fixeo-diagnostic-signature');
    if (!section) return;
    try {
      var cfg = await getConfig();
      section.hidden = !cfg.enabled;
    } catch (_) {
      return;
    }
    var trigger = document.getElementById('fxdiag-open');
    trigger.addEventListener('click', async function () {
      trigger.disabled = true;
      var city = document.getElementById('fxhf-location');
      var description =
        document.getElementById('fxhf-need-input') ||
        document.getElementById('qsm-input-nlp');
      var selectedCity = city ? city.value : '';
      try {
        selectedCity =
          selectedCity ||
          sessionStorage.getItem('fxrf4_trusted_city_session') ||
          localStorage.getItem('fixeo_detected_city') ||
          '';
      } catch (_) {}
      try {
        await open({
          city: selectedCity,
          description: description ? description.value : '',
        });
      } catch (_) {
        document.getElementById('fxdiag-launch-status').textContent =
          'Le diagnostic est momentanément indisponible. Réessayez dans un instant.';
      } finally {
        trigger.disabled = false;
      }
    });
  }
  if ('requestIdleCallback' in window)
    window.requestIdleCallback(initialize, { timeout: 2000 });
  else window.setTimeout(initialize, 300);
})();
