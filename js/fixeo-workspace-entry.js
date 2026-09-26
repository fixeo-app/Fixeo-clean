/* FIXEO Auth Phase 2C.2 — canonical global workspace entry.
 * Loaded lazily on user intent. Browser storage is never an authorization authority.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FixeoWorkspaceEntry = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var GLOBAL = Object.freeze({
    admin: 'admin.html',
    artisan: 'dashboard-artisan-v2.html',
    client: 'dashboard-client.html'
  });
  var SAFE_FALLBACKS = Object.freeze(['auth.html', 'admin.html', 'dashboard-artisan-v2.html', 'dashboard-client.html']);
  var ENTERPRISE_ROLES = Object.freeze(['owner', 'admin', 'operations_manager', 'site_manager', 'reporter', 'viewer']);
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var WAIT_MS = 15000;
  var scriptPromises = Object.create(null);

  function basename(href) {
    try {
      var value = String(href || '').trim();
      if (!value) return '';
      var url = new URL(value, (typeof location !== 'undefined' && location.href) || 'https://fixeo.invalid/');
      return url.pathname.split('/').pop() || '';
    } catch (_) { return ''; }
  }

  function safeFallback(href) {
    var name = basename(href);
    return SAFE_FALLBACKS.indexOf(name) !== -1 ? name : 'auth.html';
  }

  function validEnterpriseSpace(space) {
    return !!(space && space.type === 'enterprise' &&
      UUID_RE.test(String(space.enterprise_id || '')) &&
      String(space.enterprise_name || '').trim() &&
      ENTERPRISE_ROLES.indexOf(String(space.member_role || '')) !== -1);
  }

  function canonicalDestination(access, fallbackHref) {
    var fallback = safeFallback(fallbackHref);
    if (!access || access.ok !== true || access.status !== 'OK') return fallback;
    if (Array.isArray(access.enterprise_spaces) && access.enterprise_spaces.some(validEnterpriseSpace)) {
      return 'workspace-select.html';
    }
    var global = access.global_space;
    if (global && GLOBAL[global.type] === global.destination) return global.destination;
    return fallback;
  }

  function withTimeout(promise, waitMs) {
    var ms = Number.isFinite(waitMs) && waitMs > 0 ? waitMs : WAIT_MS;
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('WORKSPACE_ENTRY_TIMEOUT')); }, ms);
      Promise.resolve(promise).then(function (value) {
        clearTimeout(timer); resolve(value);
      }, function (error) {
        clearTimeout(timer); reject(error);
      });
    });
  }

  function loadScript(src, globalName) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.reject(new Error('BROWSER_REQUIRED'));
    if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
    if (scriptPromises[src]) return scriptPromises[src];
    scriptPromises[src] = new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-fixeo-workspace-src="' + src + '"]');
      if (existing) {
        existing.addEventListener('load', function () { resolve(globalName ? window[globalName] : true); }, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.fixeoWorkspaceSrc = src;
      script.onload = function () { resolve(globalName ? window[globalName] : true); };
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return scriptPromises[src];
  }

  async function ensureRuntime() {
    if (typeof window === 'undefined') throw new Error('BROWSER_REQUIRED');
    if (window.location && window.location.protocol === 'file:') throw new Error('LOCAL_FILE_FALLBACK');
    if (!window.FixeoSupabaseClient) await withTimeout(loadScript('/js/supabase-client.js', 'FixeoSupabaseClient'));
    if (window.FixeoSupabaseClient && typeof window.FixeoSupabaseClient.ready === 'function') {
      await withTimeout(window.FixeoSupabaseClient.ready());
    }
    if (!window.FixeoAuthResolver) await withTimeout(loadScript('/js/fixeo-auth-resolver.js?v=2a-1', 'FixeoAuthResolver'));
    if (!window.FixeoAuthResolver || typeof window.FixeoAuthResolver.resolve !== 'function') throw new Error('RESOLVER_UNAVAILABLE');
    if (!window.FixeoSupabaseClient || !window.FixeoSupabaseClient.client) throw new Error('SUPABASE_UNAVAILABLE');
    return { resolver: window.FixeoAuthResolver, client: window.FixeoSupabaseClient.client };
  }

  async function resolveDestination(fallbackHref, options) {
    var fallback = safeFallback(fallbackHref);
    try {
      var runtime = options && options.runtime ? options.runtime : await ensureRuntime();
      var access = await withTimeout(runtime.resolver.resolve(runtime.client), options && options.waitMs);
      return canonicalDestination(access, fallback);
    } catch (_) {
      return fallback;
    }
  }

  async function navigate(fallbackHref) {
    var destination = await resolveDestination(fallbackHref);
    if (typeof window !== 'undefined' && window.location) window.location.href = destination;
    return destination;
  }

  return Object.freeze({
    safeFallback: safeFallback,
    validEnterpriseSpace: validEnterpriseSpace,
    canonicalDestination: canonicalDestination,
    resolveDestination: resolveDestination,
    navigate: navigate
  });
});
