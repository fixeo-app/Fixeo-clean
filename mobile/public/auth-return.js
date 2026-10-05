/* Runs before Expo. Never retain a legacy bearer token or put one in another URL. */
(function () {
  if (location.pathname !== '/auth-callback') return;
  var query = new URLSearchParams(location.search), fragment = new URLSearchParams(location.hash.slice(1));
  var legacy = query.has('access_token') || query.has('refresh_token') || fragment.has('access_token') || fragment.has('refresh_token');
  var code = query.get('code');
  window.__FIXEO_AUTH_CALLBACK = !legacy && code && /^[A-Za-z0-9_-]{10,512}$/.test(code)
    ? location.origin + '/auth-callback?code=' + encodeURIComponent(code)
    : location.origin + '/auth-callback?error=invalid_callback';
  history.replaceState(null, '', '/auth-callback');
})();
