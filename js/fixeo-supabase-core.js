(function (window, document) {
  'use strict';

  var SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
  var client = null;
  var initPromise = null;
  var authListenerBound = false;

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function dispatch(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (error) {}
  }

  function getEnv() {
    return window.FIXEO_ENV || {};
  }

  function normalizeRole(role) {
    var value = String(role || '').toLowerCase();
    if (value === 'artisan' || value === 'admin') return value;
    return 'client';
  }

  function getDisplayName(user, profile) {
    var fullName = profile && profile.full_name ? String(profile.full_name).trim() : '';
    if (fullName) return fullName;
    var metaName = user && user.user_metadata && user.user_metadata.full_name ? String(user.user_metadata.full_name).trim() : '';
    if (metaName) return metaName;
    var email = user && user.email ? String(user.email) : '';
    if (email && email.indexOf('@') > -1) return email.split('@')[0];
    return 'Utilisateur';
  }

  function clearLocalAuthCache() {
    [
      'fixeo_user', 'fixeo_token', 'fixeo_session', 'fixeo_logged',
      'fixeo_role', 'fixeo_admin', 'fixeo_user_name', 'fixeo_notif_count',
      'fixeo_avatar', 'user', 'role', 'fixeo_profile'
    ].forEach(function (key) {
      try { localStorage.removeItem(key); } catch (error) {}
    });
    ['fixeo_admin_auth', 'fixeo_session'].forEach(function (key) {
      try { sessionStorage.removeItem(key); } catch (error) {}
    });
  }

  function persistAuth(user, profile, session) {
    if (!user) return null;

    var role = normalizeRole((profile && profile.role) || (user.user_metadata && user.user_metadata.role) || 'client');
    var name = getDisplayName(user, profile);
    var normalizedUser = {
      id: user.id,
      email: user.email || '',
      name: name,
      role: role
    };

    try {
      localStorage.setItem('fixeo_user', user.email || user.id || '');
      localStorage.setItem('fixeo_user_name', name);
      localStorage.setItem('fixeo_role', role);
      localStorage.setItem('role', role);
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      localStorage.setItem('fixeo_logged', '1');
      if (session && session.access_token) localStorage.setItem('fixeo_token', session.access_token);
      if (profile) localStorage.setItem('fixeo_profile', JSON.stringify(profile));
      if (role === 'admin') {
        localStorage.setItem('fixeo_admin', '1');
        sessionStorage.setItem('fixeo_admin_auth', '1');
      } else {
        localStorage.removeItem('fixeo_admin');
        sessionStorage.removeItem('fixeo_admin_auth');
      }
    } catch (error) {}

    dispatch('fixeo:auth:updated', { user: normalizedUser, profile: profile || null });
    return normalizedUser;
  }

  function getProjectRef() {
    var env = getEnv();
    var url = String(env.SUPABASE_URL || '');
    var match = url.match(/^https:\/\/([^.]+)\.supabase\.co/i);
    return match ? match[1] : '';
  }

  function tryHydrateFromSupabaseStorage() {
    try {
      if (localStorage.getItem('fixeo_user') && localStorage.getItem('fixeo_role')) return true;
      var ref = getProjectRef();
      var candidateKeys = [];
      if (ref) candidateKeys.push('sb-' + ref + '-auth-token');
      Object.keys(localStorage).forEach(function (key) {
        if (/^sb-.*-auth-token$/.test(key) && candidateKeys.indexOf(key) === -1) {
          candidateKeys.push(key);
        }
      });

      for (var i = 0; i < candidateKeys.length; i++) {
        var raw = localStorage.getItem(candidateKeys[i]);
        if (!raw) continue;
        var parsed = null;
        try { parsed = JSON.parse(raw); } catch (error) { continue; }
        var session = null;
        if (parsed && parsed.user) session = parsed;
        if (!session && parsed && parsed.currentSession && parsed.currentSession.user) session = parsed.currentSession;
        if (!session && Array.isArray(parsed)) {
          for (var j = 0; j < parsed.length; j++) {
            if (parsed[j] && parsed[j].user) {
              session = parsed[j];
              break;
            }
          }
        }
        if (session && session.user) {
          persistAuth(session.user, null, session);
          return true;
        }
      }
    } catch (error) {}
    return false;
  }

  function loadSdk() {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      return Promise.resolve();
    }

    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-fixeo-supabase-sdk="1"]');
      if (existing) {
        existing.addEventListener('load', function () { resolve(); }, { once: true });
        existing.addEventListener('error', function () { reject(new Error('Impossible de charger le SDK Supabase.')); }, { once: true });
        return;
      }

      var script = document.createElement('script');
      script.src = SDK_URL;
      script.async = true;
      script.defer = true;
      script.setAttribute('data-fixeo-supabase-sdk', '1');
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error('Impossible de charger le SDK Supabase.')); };
      document.head.appendChild(script);
    });
  }

  function getReadableError(error) {
    if (!error) return 'Une erreur inattendue est survenue.';
    if (typeof error === 'string') return error;
    var message = error.message || error.msg || 'Une erreur inattendue est survenue.';
    if (/invalid login credentials/i.test(message)) return 'Email ou mot de passe incorrect.';
    if (/email not confirmed/i.test(message)) return 'Email non confirmé. Vérifiez votre boîte mail avant de vous connecter.';
    if (/over_email_send_rate_limit/i.test(message) || /email rate limit exceeded/i.test(message)) {
      return 'Limite d’envoi d’email atteinte côté Supabase. Réessayez dans quelques minutes ou désactivez temporairement la confirmation email pour vos tests MVP.';
    }
    if (/User already registered/i.test(message)) return 'Cet email est déjà utilisé.';
    if (/signup is disabled/i.test(message)) return 'Les inscriptions sont actuellement désactivées.';
    return message;
  }

  async function getClient() {
    if (client) return client;
    await init();
    return client;
  }

  async function init() {
    if (initPromise) return initPromise;

    initPromise = (async function () {
      tryHydrateFromSupabaseStorage();

      // ── Fast path: reuse FixeoSupabaseClient (supabase-client.js) if already connected.
      // supabase-client.js is loaded in <head> with hardcoded credentials and auto-connects
      // at DOMContentLoaded. On Vercel, /api/env.js returns 404 so window.FIXEO_ENV is never
      // set — without this, init() would throw "Variables Supabase manquantes" every time.
      // This check runs before loadSdk() so it is always zero-cost when Stack 1 is ready.
      if (window.FixeoSupabaseClient
          && window.FixeoSupabaseClient.CONFIGURED
          && window.FixeoSupabaseClient.client) {
        if (!client) client = window.FixeoSupabaseClient.client;
        return client;
      }

      await loadSdk();

      var env = getEnv();
      if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
        throw new Error('Variables Supabase manquantes. Configurez SUPABASE_URL et SUPABASE_ANON_KEY.');
      }

      client = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });

      if (!authListenerBound) {
        authListenerBound = true;
        client.auth.onAuthStateChange(function (event, session) {
          if (session && session.user) {
            syncUserFromSession(session).catch(function () {});
          } else {
            clearLocalAuthCache();
            dispatch('fixeo:auth:updated', { user: null, profile: null, event: event });
          }
        });
      }

      var sessionResult = await client.auth.getSession();
      var session = sessionResult && sessionResult.data ? sessionResult.data.session : null;
      if (session && session.user) {
        await syncUserFromSession(session);
      }

      return client;
    })();

    return initPromise;
  }

  async function getSession() {
    var sb = await getClient();
    var result = await sb.auth.getSession();
    return result && result.data ? result.data.session : null;
  }

  async function getCurrentUser() {
    var session = await getSession();
    return session ? session.user : null;
  }

  async function getProfile(profileId) {
    var sb = await getClient();
    var response = await sb.from('profiles').select('*').eq('id', profileId).maybeSingle();
    if (response.error) throw response.error;
    return response.data || null;
  }

  async function patchProfile(profileId, values) {
    var sb = await getClient();
    var payload = {};
    if (values.full_name) payload.full_name = values.full_name;
    if (values.role) payload.role = normalizeRole(values.role);
    if (values.city) payload.city = values.city;
    if (values.phone) payload.phone = values.phone;
    if (!Object.keys(payload).length) return getProfile(profileId);

    var response = await sb.from('profiles').update(payload).eq('id', profileId).select('*').maybeSingle();
    if (response.error) {
      var refreshed = await getProfile(profileId).catch(function () { return null; });
      return refreshed;
    }
    return response.data || null;
  }

  async function syncUserFromSession(session) {
    if (!session || !session.user) return null;
    var user = session.user;
    var profile = null;

    try {
      profile = await getProfile(user.id);
      if (profile) {
        var desiredRole = normalizeRole((user.user_metadata && user.user_metadata.role) || profile.role || 'client');
        var desiredName = (user.user_metadata && user.user_metadata.full_name) || profile.full_name || '';
        var desiredCity = (user.user_metadata && user.user_metadata.city) || profile.city || '';
        var desiredPhone = (user.user_metadata && user.user_metadata.phone) || profile.phone || '';
        if ((desiredRole && desiredRole !== profile.role) || (desiredName && desiredName !== profile.full_name) || (desiredCity && desiredCity !== profile.city) || (desiredPhone && desiredPhone !== profile.phone)) {
          profile = await patchProfile(user.id, {
            role: desiredRole,
            full_name: desiredName,
            city: desiredCity,
            phone: desiredPhone
          });
        }
      }
    } catch (error) {}

    persistAuth(user, profile, session);
    return { user: user, profile: profile };
  }

  async function requireAuth(expectedRole) {
    await init();
    var session = await getSession();
    if (!session || !session.user) {
      throw new Error('Session expirée. Merci de vous reconnecter.');
    }
    var synced = await syncUserFromSession(session);
    var profile = synced ? synced.profile : null;
    var user = synced ? synced.user : session.user;
    var role = normalizeRole((profile && profile.role) || (user.user_metadata && user.user_metadata.role) || 'client');
    if (expectedRole && role !== normalizeRole(expectedRole)) {
      throw new Error('Accès refusé pour ce rôle.');
    }
    return {
      session: session,
      user: user,
      profile: profile || {
        id: user.id,
        role: role,
        full_name: getDisplayName(user, profile),
        city: (user.user_metadata && user.user_metadata.city) || '',
        phone: (user.user_metadata && user.user_metadata.phone) || ''
      }
    };
  }

  async function signUp(payload) {
    var sb = await getClient();
    var role = normalizeRole(payload.role);
    var response = await sb.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        data: {
          full_name: payload.full_name,
          role: role,
          city: payload.city || '',
          phone: payload.phone || ''
        }
      }
    });

    if (response.error) throw response.error;

    var user = response.data ? response.data.user : null;
    var session = response.data ? response.data.session : null;
    var profile = null;

    if (user) {
      for (var i = 0; i < 5; i++) {
        profile = await patchProfile(user.id, {
          full_name: payload.full_name,
          role: role,
          city: payload.city || '',
          phone: payload.phone || ''
        }).catch(function () { return null; });
        if (profile) break;
        await sleep(350);
      }
    }

    if (session && user) {
      persistAuth(user, profile, session);
    }

    return {
      user: user,
      session: session,
      profile: profile,
      needsEmailConfirmation: !session
    };
  }

  async function login(email, password) {
    var sb = await getClient();
    var response = await sb.auth.signInWithPassword({ email: email, password: password });
    if (response.error) throw response.error;
    var session = response.data ? response.data.session : null;
    if (!session || !session.user) throw new Error('Session Supabase introuvable après connexion.');
    return syncUserFromSession(session);
  }

  async function logout(options) {
    options = options || {};
    try {
      var sb = await getClient();
      await sb.auth.signOut();
    } catch (error) {}
    clearLocalAuthCache();
    dispatch('fixeo:auth:updated', { user: null, profile: null });
    if (!options.suppressRedirect) {
      window.location.href = options.redirectTo || 'index.html';
    }
  }

  async function submitServiceRequest(payload) {
    var auth = await requireAuth('client');
    var sb = await getClient();
    var response = await sb.from('service_requests').insert({
      client_profile_id: auth.profile.id,
      service_category: payload.service_category,
      city: payload.city,
      description: payload.description,
      status: 'new'
    }).select('*').single();

    if (response.error) throw response.error;
    dispatch('fixeo:data:changed', { type: 'service_request_created', request: response.data });
    return response.data;
  }

  async function listClientRequests() {
    var auth = await requireAuth('client');
    var sb = await getClient();
    var response = await sb.from('service_requests').select('*').eq('client_profile_id', auth.profile.id).order('created_at', { ascending: false });
    if (response.error) throw response.error;
    return response.data || [];
  }

  async function listOpenRequests() {
    await requireAuth('artisan');
    var sb = await getClient();
    var response = await sb.from('service_requests').select('*').eq('status', 'new').order('created_at', { ascending: false });
    if (response.error) throw response.error;

    var requests = response.data || [];
    if (!requests.length) return [];

    var requestIds = requests.map(function (item) { return item.id; });
    var quotesResponse = await sb.from('quotes').select('request_id,status').in('request_id', requestIds);
    if (quotesResponse.error) throw quotesResponse.error;

    var missionsResponse = await sb.from('missions').select('request_id').in('request_id', requestIds);
    if (missionsResponse.error) throw missionsResponse.error;

    var quotes = quotesResponse.data || [];
    var missions = missionsResponse.data || [];

    return requests.filter(function (requestRow) {
      var hasAcceptedQuote = quotes.some(function (quote) {
        return quote.request_id === requestRow.id && quote.status === 'accepted';
      });
      var hasMission = missions.some(function (mission) {
        return mission.request_id === requestRow.id;
      });
      return !hasAcceptedQuote && !hasMission;
    });
  }

  async function listQuotesForRequestIds(requestIds) {
    if (!requestIds || !requestIds.length) return [];
    var sb = await getClient();
    var response = await sb.from('quotes').select('*').in('request_id', requestIds).order('created_at', { ascending: false });
    if (response.error) throw response.error;
    return response.data || [];
  }

  async function listClientQuotes() {
    var requests = await listClientRequests();
    var quotes = await listQuotesForRequestIds(requests.map(function (item) { return item.id; }));
    return { requests: requests, quotes: quotes };
  }

  async function submitQuote(payload) {
    var auth = await requireAuth('artisan');
    var sb = await getClient();

    var requestResponse = await sb.from('service_requests').select('*').eq('id', payload.request_id).maybeSingle();
    if (requestResponse.error) throw requestResponse.error;
    if (!requestResponse.data) throw new Error('Demande introuvable.');

    var acceptedQuoteResponse = await sb.from('quotes').select('id').eq('request_id', payload.request_id).eq('status', 'accepted');
    if (acceptedQuoteResponse.error) throw acceptedQuoteResponse.error;
    if ((acceptedQuoteResponse.data || []).length) {
      throw new Error('Cette demande a déjà été attribuée à un artisan.');
    }

    var missionResponse = await sb.from('missions').select('id').eq('request_id', payload.request_id).limit(1);
    if (missionResponse.error) throw missionResponse.error;
    if ((missionResponse.data || []).length) {
      throw new Error('Une mission existe déjà pour cette demande.');
    }

    var existingQuoteResponse = await sb.from('quotes').select('*').eq('request_id', payload.request_id).eq('artisan_profile_id', auth.profile.id).maybeSingle();
    if (existingQuoteResponse.error && String(existingQuoteResponse.error.code || '') !== 'PGRST116') {
      throw existingQuoteResponse.error;
    }

    var response;
    if (existingQuoteResponse.data) {
      response = await sb.from('quotes').update({
        proposed_price: Number(payload.proposed_price),
        message: payload.message,
        status: 'pending'
      }).eq('id', existingQuoteResponse.data.id).select('*').single();
    } else {
      response = await sb.from('quotes').insert({
        request_id: payload.request_id,
        artisan_profile_id: auth.profile.id,
        proposed_price: Number(payload.proposed_price),
        message: payload.message,
        status: 'pending'
      }).select('*').single();
    }

    if (response.error) throw response.error;
    dispatch('fixeo:data:changed', { type: existingQuoteResponse.data ? 'quote_updated' : 'quote_created', quote: response.data });
    return response.data;
  }

  async function listClientMissions() {
    var auth = await requireAuth('client');
    var sb = await getClient();
    var response = await sb.from('missions').select('*').eq('client_profile_id', auth.profile.id).order('created_at', { ascending: false });
    if (response.error) throw response.error;
    return response.data || [];
  }

  async function listArtisanMissions() {
    var auth = await requireAuth('artisan');
    var sb = await getClient();
    var response = await sb.from('missions').select('*').eq('artisan_profile_id', auth.profile.id).order('created_at', { ascending: false });
    if (response.error) throw response.error;
    return response.data || [];
  }

  async function fetchMissionByRequestId(requestId) {
    var sb = await getClient();
    var response = await sb.from('missions').select('*').eq('request_id', requestId).order('created_at', { ascending: false }).limit(1);
    if (response.error) throw response.error;
    return response.data && response.data.length ? response.data[0] : null;
  }

  async function maybeCreateMissionFallback(requestRow, quoteRow) {
    if (!requestRow || !quoteRow) return null;
    var sb = await getClient();
    var response = await sb.from('missions').insert({
      request_id: requestRow.id,
      client_profile_id: requestRow.client_profile_id,
      artisan_profile_id: quoteRow.artisan_profile_id,
      agreed_price: Number(quoteRow.proposed_price || 0),
      status: 'validated'
    }).select('*').single();

    if (response.error) {
      var conflictCodes = ['23505', '23503'];
      if (conflictCodes.indexOf(String(response.error.code || '')) !== -1) {
        return fetchMissionByRequestId(requestRow.id).catch(function () { return null; });
      }
      throw response.error;
    }

    return response.data || null;
  }

  async function acceptQuote(quoteId) {
    var auth = await requireAuth('client');
    var sb = await getClient();

    var quoteRes = await sb.from('quotes').select('*').eq('id', quoteId).maybeSingle();
    if (quoteRes.error) throw quoteRes.error;
    if (!quoteRes.data) throw new Error('Devis introuvable.');

    var requestRes = await sb.from('service_requests').select('*').eq('id', quoteRes.data.request_id).maybeSingle();
    if (requestRes.error) throw requestRes.error;
    if (!requestRes.data) throw new Error('Demande associée introuvable.');
    if (requestRes.data.client_profile_id !== auth.profile.id) {
      throw new Error('Ce devis ne vous appartient pas.');
    }

    var updateRes = await sb.from('quotes').update({ status: 'accepted' }).eq('id', quoteId).select('*').single();
    if (updateRes.error) throw updateRes.error;

    await sb.from('quotes').update({ status: 'rejected' }).eq('request_id', requestRes.data.id).neq('id', quoteId).eq('status', 'pending');

    var mission = null;
    for (var i = 0; i < 4; i++) {
      await sleep(350);
      mission = await fetchMissionByRequestId(requestRes.data.id).catch(function () { return null; });
      if (mission) break;
    }

    if (!mission) {
      mission = await maybeCreateMissionFallback(requestRes.data, updateRes.data);
    }

    var commissionExpected = Number((Number(updateRes.data.proposed_price || 0) * 0.15).toFixed(2));
    var commissionActual = mission && mission.commission_amount != null ? Number(mission.commission_amount) : null;
    var commissionOk = commissionActual != null ? Math.abs(commissionActual - commissionExpected) < 0.01 : false;

    dispatch('fixeo:data:changed', {
      type: 'quote_accepted',
      quote: updateRes.data,
      mission: mission,
      commission_ok: commissionOk
    });

    return {
      quote: updateRes.data,
      mission: mission,
      commission_expected: commissionExpected,
      commission_actual: commissionActual,
      commission_ok: commissionOk
    };
  }

  function computeRequestState(requestRow, quotes, missions) {
    quotes = quotes || [];
    missions = missions || [];
    var requestQuotes = quotes.filter(function (quote) { return quote.request_id === requestRow.id; });
    var requestMission = missions.find(function (mission) { return mission.request_id === requestRow.id; }) || null;
    var acceptedQuote = requestQuotes.find(function (quote) { return quote.status === 'accepted'; }) || null;

    if (requestMission) {
      return {
        key: 'mission_created',
        label: 'Mission créée',
        className: 'status-confirmed',
        quotes: requestQuotes,
        mission: requestMission,
        acceptedQuote: acceptedQuote
      };
    }
    if (acceptedQuote) {
      return {
        key: 'quote_accepted',
        label: 'Devis accepté',
        className: 'status-confirmed',
        quotes: requestQuotes,
        mission: null,
        acceptedQuote: acceptedQuote
      };
    }
    if (requestQuotes.length) {
      return {
        key: 'quote_sent',
        label: 'Devis envoyé',
        className: 'status-open',
        quotes: requestQuotes,
        mission: null,
        acceptedQuote: null
      };
    }
    return {
      key: 'request_created',
      label: 'Demande créée',
      className: 'status-open',
      quotes: requestQuotes,
      mission: null,
      acceptedQuote: null
    };
  }

  window.FixeoSupabase = {
    init: init,
    getClient: getClient,
    getSession: getSession,
    getCurrentUser: getCurrentUser,
    getProfile: getProfile,
    patchProfile: patchProfile,
    requireAuth: requireAuth,
    signUp: signUp,
    login: login,
    logout: logout,
    syncUserFromSession: syncUserFromSession,
    clearLocalAuthCache: clearLocalAuthCache,
    getReadableError: getReadableError,
    submitServiceRequest: submitServiceRequest,
    listClientRequests: listClientRequests,
    listOpenRequests: listOpenRequests,
    listQuotesForRequestIds: listQuotesForRequestIds,
    listClientQuotes: listClientQuotes,
    submitQuote: submitQuote,
    listClientMissions: listClientMissions,
    listArtisanMissions: listArtisanMissions,
    acceptQuote: acceptQuote,
    computeRequestState: computeRequestState,
    tryHydrateFromSupabaseStorage: tryHydrateFromSupabaseStorage
  };
})(window, document);
