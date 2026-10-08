/* Standalone staging bridge: no SDK, network request, storage or logging. */
(function () {
  'use strict';
  function receive() {
  var allowedOrigin = 'https://w6-auth-staging.fixeo.ma';
  var destination = 'fixeo://auth-callback';
  var sourceOrigin = location.origin;
  var sourcePath = location.pathname;
  var search = location.search;
  var fragment = location.hash;

  // This is deliberately before parsing and before any user-facing DOM exists.
  try { history.replaceState(null, '', '/auth-callback'); }
  catch (_) { return; } // No rendering or handoff if sanitation is unavailable.

  function inspect(query, hash) {
    var refuse = { state: 'invalid', target: null };
    if (sourceOrigin !== allowedOrigin || sourcePath !== '/auth-callback') return refuse;
    if (query.length + hash.length > 8192) return refuse;
    var q = new URLSearchParams(query);
    var h = new URLSearchParams(hash.charAt(0) === '#' ? hash.slice(1) : hash);
    var forbidden = ['access_token', 'refresh_token', 'provider_token', 'provider_refresh_token'];
    var allowed = ['code', 'error', 'error_code', 'error_description'];
    var seen = new Set();
    for (var params of [q, h]) {
      for (var key of params.keys()) {
        if (forbidden.indexOf(key.toLowerCase()) !== -1) return refuse;
        if (allowed.indexOf(key) === -1 || seen.has(key)) return refuse;
        seen.add(key);
      }
    }
    if (seen.has('code')) {
      if (seen.size !== 1 || h.toString() !== '' || !q.has('code')) return refuse;
      var code = q.get('code');
      if (!/^[A-Za-z0-9_-]{10,512}$/.test(code)) return refuse;
      return { state: 'ready', target: destination + '?code=' + encodeURIComponent(code) };
    }
    if (!seen.has('error') && !seen.has('error_code')) return refuse;
    // Never read, render, forward or record error_description.
    var errorCode = q.get('error_code') || h.get('error_code') || '';
    var error = q.get('error') || h.get('error') || '';
    var mapped = 'unknown';
    if (['otp_expired', 'flow_state_expired'].indexOf(errorCode) !== -1) mapped = 'expired';
    else if (['invalid_request', 'validation_failed', 'flow_state_not_found', 'bad_code_verifier'].indexOf(errorCode) !== -1) mapped = 'invalid';
    else if (error === 'access_denied' || errorCode === 'access_denied') mapped = 'denied';
    return { state: mapped, target: destination + '?error=' + mapped };
  }

  var result;
  try { result = inspect(search, fragment); }
  catch (_) { result = { state: 'invalid', target: null }; }
  search = '';
  fragment = '';

  function render() {
    var main = document.createElement('main');
    var eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'FIXEO · STAGING';
    var title = document.createElement('h1');
    title.textContent = result.state === 'ready' ? 'Continuer dans FIXEO' : 'Ce lien ne permet pas de continuer.';
    var text = document.createElement('p');
    text.textContent = result.state === 'ready'
      ? 'Ouvrez l’application utilisée pour commencer cette démarche. Elle vérifiera votre lien.'
      : 'Revenez dans l’application pour reprendre votre démarche.';
    main.append(eyebrow, title, text);
    if (result.target) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Ouvrir FIXEO';
      button.addEventListener('click', function () {
        if (!result.target) return;
        var target = result.target;
        result.target = null;
        button.disabled = true;
        try { location.assign(target); } catch (_) { /* Neutral, no URL logging. */ }
      });
      main.append(button);
    }
    document.body.replaceChildren(main);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true });
  else render();
  }
  receive();
  function onNavigation() {
    if (location.search || location.hash || location.pathname !== '/auth-callback') receive();
  }
  window.addEventListener('hashchange', onNavigation);
  window.addEventListener('popstate', onNavigation);
})();
