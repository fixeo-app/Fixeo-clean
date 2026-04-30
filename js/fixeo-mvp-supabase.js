(function (window, document) {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function notify(type, title, message) {
    try {
      if (window.notifications && typeof window.notifications[type] === 'function') {
        window.notifications[type](title, message || '');
        return;
      }
    } catch (error) {}
    if (type === 'error') alert(title + (message ? '\n\n' + message : ''));
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char];
    });
  }

  function formatDate(value) {
    if (!value) return '-';
    try {
      return new Date(value).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return String(value);
    }
  }

  function formatMoney(value) {
    return Number(value || 0).toLocaleString('fr-FR', {
      style: 'currency',
      currency: 'MAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  }

  function currentPage() {
    return window.location.pathname.split('/').pop() || 'index.html';
  }

  function ensureSupabase() {
    if (!window.FixeoSupabase) {
      throw new Error('Le module Supabase Fixeo est introuvable.');
    }
    return window.FixeoSupabase;
  }

  function closeModalIfAny() {
    if (typeof window.closeModal === 'function') window.closeModal();
    var overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.remove('open');
  }

  function redirectAfterRole(role) {
    if (role === 'artisan') {
      window.location.href = 'dashboard-artisan.html';
      return;
    }
    if (role === 'admin') {
      window.location.href = 'admin.html';
      return;
    }
    window.location.href = 'dashboard-client.html';
  }

  async function overrideAuthPage() {
    if (currentPage() !== 'auth.html') return;

    var FixeoSupabase = ensureSupabase();
    await FixeoSupabase.init();

    window.handleLogin = async function (event) {
      event.preventDefault();
      var errEl = document.getElementById('login-error');
      var btn = document.getElementById('login-btn');
      var emailEl = document.getElementById('login-email');
      var passEl = document.getElementById('login-password');

      if (errEl) errEl.style.display = 'none';
      if (!emailEl || !passEl) return;
      if (!emailEl.value.trim()) {
        if (errEl) {
          errEl.textContent = '❌ Veuillez entrer votre email.';
          errEl.style.display = 'block';
        }
        emailEl.focus();
        return;
      }
      if (!passEl.value) {
        if (errEl) {
          errEl.textContent = '❌ Veuillez entrer votre mot de passe.';
          errEl.style.display = 'block';
        }
        passEl.focus();
        return;
      }

      var initial = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:8px"></span> Connexion...';
      }

      try {
        var result = await FixeoSupabase.login(emailEl.value.trim().toLowerCase(), passEl.value);
        var role = (result && result.profile && result.profile.role) || (result && result.user && result.user.user_metadata && result.user.user_metadata.role) || 'client';
        notify('success', 'Connexion réussie', 'Bienvenue sur votre espace Fixeo.');
        setTimeout(function () { redirectAfterRole(role); }, 900);
      } catch (error) {
        if (errEl) {
          errEl.textContent = '❌ ' + FixeoSupabase.getReadableError(error);
          errEl.style.display = 'block';
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = initial || '<span>Se connecter</span>';
        }
      }
    };

    window.handleSignup = async function (event) {
      event.preventDefault();
      var nameEl = document.getElementById('signup-name');
      var emailEl = document.getElementById('signup-email');
      var passEl = document.getElementById('signup-password');
      var termsEl = document.getElementById('terms');
      var errEl = document.getElementById('signup-error');
      var btn = document.getElementById('signup-btn');

      if (errEl) errEl.style.display = 'none';
      if (!nameEl || !emailEl || !passEl || !termsEl) return;

      if (!nameEl.value.trim()) {
        if (errEl) {
          errEl.textContent = '❌ Veuillez entrer votre nom complet.';
          errEl.style.display = 'block';
        }
        nameEl.focus();
        return;
      }
      if (!emailEl.value.trim() || !emailEl.checkValidity()) {
        if (errEl) {
          errEl.textContent = '❌ Adresse email invalide.';
          errEl.style.display = 'block';
        }
        emailEl.focus();
        return;
      }
      if (passEl.value.length < 8) {
        if (errEl) {
          errEl.textContent = '❌ Le mot de passe doit contenir au moins 8 caractères.';
          errEl.style.display = 'block';
        }
        passEl.focus();
        return;
      }
      if (!termsEl.checked) {
        if (errEl) {
          errEl.textContent = "❌ Vous devez accepter les conditions d'utilisation.";
          errEl.style.display = 'block';
        }
        return;
      }

      var role = window._selectedType === 'artisan' ? 'artisan' : 'client';
      var initial = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:8px"></span> Création...';
      }

      try {
        var result = await FixeoSupabase.signUp({
          email: emailEl.value.trim().toLowerCase(),
          password: passEl.value,
          full_name: nameEl.value.trim(),
          role: role,
          city: '',
          phone: ''
        });

        if (result.needsEmailConfirmation) {
          notify('success', 'Compte créé', "Votre compte est créé. Vérifiez votre email pour confirmer l'inscription, puis connectez-vous.");
          if (window.switchTab) window.switchTab('login');
          return;
        }

        notify('success', 'Compte créé', 'Votre espace Fixeo est prêt.');
        setTimeout(function () { redirectAfterRole(role); }, 900);
      } catch (error) {
        if (errEl) {
          errEl.textContent = '❌ ' + FixeoSupabase.getReadableError(error);
          errEl.style.display = 'block';
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = initial || '<span>Créer mon compte</span>';
        }
      }
    };

    window.socialLogin = function (provider) {
      notify('info', 'Connexion sociale non activée', 'Le bouton ' + provider + ' reste visuel pour le MVP. Activez ce provider dans Supabase si vous voulez le rendre fonctionnel.');
    };
  }

  function clientRequestModalHtml() {
    return '' +
      '<form id="fixeo-service-request-form">' +
        '<div class="form-group">' +
          '<label class="form-label">Type de service</label>' +
          '<select class="form-control" name="service_category" required>' +
            '<option value="Plomberie">Plomberie</option>' +
            '<option value="Électricité">Électricité</option>' +
            '<option value="Peinture">Peinture</option>' +
            '<option value="Carrelage">Carrelage</option>' +
            '<option value="Nettoyage">Nettoyage</option>' +
            '<option value="Jardinage">Jardinage</option>' +
            '<option value="Autre">Autre</option>' +
          '</select>' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">Ville</label>' +
          '<input class="form-control" name="city" type="text" placeholder="Casablanca" required>' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">Description</label>' +
          '<textarea class="form-control" name="description" rows="4" placeholder="Décrivez votre besoin..." required></textarea>' +
        '</div>' +
        '<button class="btn btn-primary w-100" type="submit">Envoyer la demande</button>' +
      '</form>';
  }

  /* ══════════════════════════════════════════════════════════
   * PROFILE LAYER v1.0
   * Shared helpers: load profile, hydrate settings, wire save
   * ══════════════════════════════════════════════════════════ */

  /**
   * Ensure a profile row exists for `userId`.
   * If `getProfile()` returns null, insert a minimal row and return it.
   * Uses the authenticated JWT (auth.uid() = id policy satisfied).
   */
  async function _ensureProfile(FixeoSupabase, userId, email, role) {
    var profile = null;
    try { profile = await FixeoSupabase.getProfile(userId); } catch (_) {}
    if (profile) return profile;

    // Profile missing - create it via patchProfile (upsert-like via update; if 0 rows, insert)
    var fallbackName = (email && email.indexOf('@') > -1) ? email.split('@')[0] : 'Utilisateur';
    try {
      var sb = await FixeoSupabase.getClient();
      var insertRes = await sb.from('profiles').insert([{
        id:         userId,
        full_name:  fallbackName,
        role:       role || 'client',
        phone:      '',
        city:       '',
        created_at: new Date().toISOString()
      }]);
      if (insertRes.error) {
        console.warn('[fixeo-mvp] _ensureProfile insert error:', insertRes.error.message);
      }
      // Re-fetch after insert
      try { profile = await FixeoSupabase.getProfile(userId); } catch (_) {}
    } catch (err) {
      console.warn('[fixeo-mvp] _ensureProfile failed:', err.message);
    }
    return profile || { id: userId, full_name: fallbackName, role: role || 'client', phone: '', city: '', email: email };
  }

  /**
   * Hydrate the settings form fields from a profile object.
   * Works for both client and artisan - uses IDs we added to HTML.
   */
  function _hydrateSettingsForm(profile, email, dashType) {
    // Always overwrite on load - user hasn't started typing yet.
    // Source of truth: Supabase profile + session email. Never localStorage.
    if (dashType === 'client') {
      var nameEl  = document.getElementById('settings-client-name');
      var emailEl = document.getElementById('settings-client-email');
      var phoneEl = document.getElementById('settings-client-phone');
      var cityEl  = document.getElementById('settings-client-city');
      var resolvedName  = (profile && profile.full_name) ? profile.full_name.trim() : '';
      var resolvedEmail = email || (profile && profile.email) || '';
      var resolvedPhone = (profile && profile.phone) ? profile.phone.trim() : '';
      var resolvedCity  = (profile && profile.city)  ? profile.city.trim()  : '';
      if (nameEl)  nameEl.value  = resolvedName;
      if (emailEl) emailEl.value = resolvedEmail;
      if (phoneEl) phoneEl.value = resolvedPhone;
      if (cityEl && resolvedCity) {
        var opt = Array.from(cityEl.options).find(function(o) { return o.value === resolvedCity || o.text === resolvedCity; });
        if (opt) cityEl.value = opt.value;
      }
      // Sync localStorage so auth-global.js re-renders with real name
      if (resolvedName) {
        try { localStorage.setItem('fixeo_user_name', resolvedName); } catch(_) {}
      }
    } else {
      var nameEl  = document.getElementById('settings-artisan-name');
      var emailEl = document.getElementById('settings-artisan-email');
      var phoneEl = document.getElementById('settings-artisan-phone');
      var cityEl  = document.getElementById('settings-artisan-city');
      if (nameEl)  nameEl.value  = profile.full_name || '';
      if (emailEl) emailEl.value = email || profile.email || '';
      if (phoneEl) phoneEl.value = profile.phone || '';
      if (cityEl) {
        var city = profile.city || '';
        var opt = Array.from(cityEl.options).find(function(o) { return o.value === city || o.text === city; });
        if (opt) cityEl.value = opt.value;
      }
    }
  }

  /**
   * Wire the save button to call patchProfile() with current form values.
   * saveBtnId: DOM id of the save button
   * getPayload: function() → object with fields to save
   */
  function _wireSettingsSave(FixeoSupabase, userId, saveBtnId, getPayload) {
    var btn = document.getElementById(saveBtnId);
    if (!btn) return;

    // Remove any existing fake onclick
    btn.removeAttribute('onclick');

    btn.addEventListener('click', async function () {
      var original = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:8px"></span> Sauvegarde...';

      try {
        var payload = getPayload();
        // Only pass non-empty values
        var cleaned = {};
        if (payload.full_name && payload.full_name.trim()) cleaned.full_name = payload.full_name.trim();
        if (payload.phone    && payload.phone.trim())     cleaned.phone    = payload.phone.trim();
        if (payload.city     && payload.city.trim())      cleaned.city     = payload.city.trim();
        // role never changed from settings form

        if (!Object.keys(cleaned).length) {
          notify('info', 'Aucune modification', 'Modifiez au moins un champ avant de sauvegarder.');
          return;
        }

        await FixeoSupabase.patchProfile(userId, cleaned);

        // Sync localStorage name if changed
        if (cleaned.full_name) {
          try {
            localStorage.setItem('fixeo_user_name', cleaned.full_name);
            var storedUser = JSON.parse(localStorage.getItem('user') || '{}');
            storedUser.name = cleaned.full_name;
            localStorage.setItem('user', JSON.stringify(storedUser));
          } catch (_) {}
        }

        notify('success', '✅ Profil mis à jour', 'Vos modifications ont été enregistrées.');
      } catch (err) {
        notify('error', 'Erreur de sauvegarde', FixeoSupabase.getReadableError(err));
      } finally {
        btn.disabled = false;
        btn.innerHTML = original;
      }
    });
  }

  /* ── End profile layer ──────────────────────────────────── */

  // ── revealClientDashboard ──────────────────────────────────────────────────
  // Single canonical reveal function. Idempotent — safe to call multiple times.
  // Removes the anti-FOUC <style> tag and clears opacity so the dashboard fades in.
  function revealClientDashboard(reason) {
    try {
      var style = document.getElementById('fixeo-client-anti-fouc');
      if (style) style.remove();
      var layout = document.querySelector('.dashboard-layout');
      if (layout) {
        layout.style.transition = 'opacity .15s ease';
        layout.style.opacity = '';
      }
      if (reason) console.log('[Fixeo Dashboard] revealed:', reason);
    } catch (_) {}
  }

  // ── withTimeout ───────────────────────────────────────────────────────────
  // Races a promise against a timeout. On timeout resolves with { data: [], error: 'timeout' }
  // so callers always get a safe value — never hangs, never throws.
  function withTimeout(promise, ms, label) {
    var timer;
    var sentinel = new Promise(function (resolve) {
      timer = window.setTimeout(function () {
        console.warn('[Fixeo Dashboard] ' + label + ' timeout after ' + ms + 'ms');
        resolve({ data: [], error: 'timeout' });
      }, ms);
    });
    return Promise.race([
      promise.then(function (v) { window.clearTimeout(timer); return v; },
                   function (e) { window.clearTimeout(timer); return { data: [], error: e }; }),
      sentinel
    ]);
  }

  // ── _renderEmptyStates ─────────────────────────────────────────────────────
  // Immediately fills all sections with empty states so the dashboard is never blank.
  // Called synchronously right after reveal — before any data fetch.
  function _renderClientEmptyStates() {
    var statsEl    = document.getElementById('client-stats-grid');
    var requestsEl = document.getElementById('client-requests-list');
    var repliesEl  = document.getElementById('client-replies-list');
    var actionsEl  = document.getElementById('client-action-list');
    var favoritesEl = document.getElementById('client-favorites-list');

    if (statsEl && !statsEl.dataset.real) {
      statsEl.innerHTML = [
        { value: 0, label: 'Demandes créées' },
        { value: 0, label: 'Devis reçus' },
        { value: 0, label: 'Devis acceptés' },
        { value: 0, label: 'Missions créées' }
      ].map(function (s) {
        return '<div class="client-stat-card"><span class="stat-number">' + s.value + '</span><span class="stat-label">' + s.label + '</span></div>';
      }).join('');
    }
    if (requestsEl && !requestsEl.dataset.real) {
      requestsEl.innerHTML = '<div class="request-card" style="text-align:center;padding:28px 20px"><p style="margin:0 0 12px;font-size:1.1rem">📋</p><p style="margin:0;font-weight:600">Aucune demande pour le moment</p><p style="margin:8px 0 16px;opacity:.65;font-size:.88rem">Créez votre première demande pour trouver un artisan qualifié.</p><button class="btn btn-primary" type="button" onclick="window.openNewRequestModal&&openNewRequestModal()">+ Créer une demande</button></div>';
    }
    if (repliesEl && !repliesEl.dataset.real) {
      repliesEl.innerHTML = '<div class="reply-card" style="text-align:center;padding:28px 20px"><p style="margin:0 0 8px;font-size:1.1rem">💬</p><p style="margin:0;font-weight:600">Aucune réponse reçue</p><p style="margin:8px 0 0;opacity:.65;font-size:.88rem">Les artisans répondront à vos demandes ici.</p></div>';
    }
    if (actionsEl && !actionsEl.dataset.real) {
      actionsEl.innerHTML = '<div class="client-action-item" style="opacity:.65;text-align:center;padding:20px 0"><p style="margin:0">Aucune action en attente. Tout est à jour ✅</p></div>';
    }
    if (favoritesEl && !favoritesEl.dataset.real) {
      favoritesEl.innerHTML = '<div class="favorite-item" style="opacity:.65;text-align:center;padding:16px 0"><span>Aucun artisan favori pour le moment.</span></div>';
    }
  }

  async function renderClientDashboard() {
    if (currentPage() !== 'dashboard-client.html') return;

    var FixeoSupabase = ensureSupabase();

    // ── DOM references (needed across all phases) ──────────────────────────
    var statsEl     = document.getElementById('client-stats-grid');
    var requestsEl  = document.getElementById('client-requests-list');
    var repliesEl   = document.getElementById('client-replies-list');
    var heroName    = document.getElementById('client-hero-name');
    var bookingsFull = document.getElementById('client-bookings-full');

    // ── PHASE 0: Instant reveal + empty states ─────────────────────────────
    // Runs synchronously at function entry — no await, no network.
    // Dashboard is visible and populated with empty states in <1 render frame.
    window._fixeoOverviewDisabled = true; // block mock renderer from overwriting
    revealClientDashboard('phase0-instant');
    _renderClientEmptyStates();

    // ── Hard failsafe: belts-and-suspenders 2500ms timeout ────────────────
    var _failsafeTimer = window.setTimeout(function () {
      revealClientDashboard('failsafe-2500ms');
      var hn = document.getElementById('client-hero-name');
      if (hn && !hn.textContent.trim()) hn.style.visibility = 'visible';
    }, 2500);

    // ── Modal registration (sync, no await) ───────────────────────────────
    window.openNewRequestModal = function () {
      var modalTitle = document.getElementById('modal-title');
      var modalBody  = document.getElementById('modal-body');
      var overlay    = document.getElementById('modal-overlay');
      if (!modalTitle || !modalBody || !overlay) return;
      modalTitle.textContent = '+ Nouvelle demande';
      modalBody.innerHTML = clientRequestModalHtml();
      overlay.classList.add('open');
      var form = document.getElementById('fixeo-service-request-form');
      if (!form) return;
      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        var formData = new FormData(form);
        try {
          await FixeoSupabase.submitServiceRequest({
            service_category: String(formData.get('service_category') || '').trim(),
            city:             String(formData.get('city') || '').trim(),
            description:      String(formData.get('description') || '').trim()
          });
          closeModalIfAny();
          notify('success', 'Demande envoyée', 'Votre demande a été enregistrée dans Supabase.');
          await renderClientDashboard();
        } catch (error) {
          notify('error', 'Erreur', FixeoSupabase.getReadableError(error));
        }
      }, { once: true });
    };

    // ── _applyClientProfile ────────────────────────────────────────────────
    // Writes auth + profile data into the DOM. Idempotent — safe to call
    // multiple times. Guards every write so stale/null data never overwrites
    // a value that was already set by a faster path.
    function _applyClientProfile(authObj, profileObj) {
      if (!authObj || !authObj.user) return;
      var email = authObj.user.email || '';
      var displayName = (profileObj && profileObj.full_name ? profileObj.full_name.trim() : '')
        || (email ? email.split('@')[0] : '');
      var displayFirst = displayName.split(' ')[0] || displayName;
      if (!displayName) return; // nothing useful to write

      var hn = document.getElementById('client-hero-name');
      if (hn) { hn.textContent = escapeHtml(displayName); hn.style.visibility = 'visible'; }

      var su = document.getElementById('sidebar-username');
      if (su) su.textContent = escapeHtml(displayFirst || displayName);

      var nc = document.getElementById('global-username') || document.querySelector('.nav-user-name');
      if (nc) {
        var role = (profileObj && profileObj.role) || 'client';
        var roleLabel = role === 'artisan' ? 'Artisan' : (role === 'admin' ? 'Admin' : 'Client');
        nc.textContent = displayName + ' (' + roleLabel + ')';
      }

      _hydrateSettingsForm(profileObj, email, 'client');
      _wireSettingsSave(FixeoSupabase, authObj.user.id, 'settings-client-save', function () {
        return {
          full_name: (document.getElementById('settings-client-name')  || {}).value || '',
          phone:     (document.getElementById('settings-client-phone') || {}).value || '',
          city:      (document.getElementById('settings-client-city')  || {}).value || ''
        };
      });
    }

    // ── Late hydration retry ───────────────────────────────────────────────
    // Called at 1s / 3s / 6s after dashboard reveals.
    // Handles the case where Supabase connects AFTER the initial timeout.
    // Idempotent: skips if hero already has a non-empty name.
    var _hydrateAttempted = false;
    function _hydrateClientProfileIfPossible() {
      if (_hydrateAttempted) return;
      var hn = document.getElementById('client-hero-name');
      if (hn && hn.textContent && hn.textContent.trim()) {
        _hydrateAttempted = true; // already hydrated — stop retrying
        return;
      }
      var fs = window.FixeoSupabase;
      if (!fs || typeof fs.requireAuth !== 'function') return; // supabase not ready yet
      _hydrateAttempted = true; // attempt once — prevent parallel retries
      fs.init().then(function () {
        return fs.requireAuth('client');
      }).then(function (authObj) {
        if (!authObj || !authObj.user) { _hydrateAttempted = false; return; } // allow future retry
        return _ensureProfile(fs, authObj.user.id, authObj.user.email || '', 'client')
          .then(function (profileObj) {
            _applyClientProfile(authObj, profileObj || null);
            console.log('[Fixeo Dashboard] late hydration succeeded');
          });
      }).catch(function (e) {
        _hydrateAttempted = false; // allow next retry
        console.warn('[Fixeo Dashboard] late hydration attempt failed:', e && e.message);
      });
    }

    var _lateRetry1 = window.setTimeout(_hydrateClientProfileIfPossible, 1000);
    var _lateRetry2 = window.setTimeout(_hydrateClientProfileIfPossible, 3000);
    var _lateRetry3 = window.setTimeout(_hydrateClientProfileIfPossible, 6000);

    // ── PHASE 1: Auth + profile (async, non-blocking to empty-state render) ─
    // Timeouts raised: Supabase init often takes 2–4s on cold start.
    // If auth times out the dashboard stays on empty states but the late
    // hydration retries above will fill in name/settings when ready.
    var auth = null;
    try {
      await withTimeout(FixeoSupabase.init(), 6000, 'supabase-init');
      var authResult = await withTimeout(
        FixeoSupabase.requireAuth('client'),
        6000, 'requireAuth'
      );
      // withTimeout resolves {data:[], error:'timeout'} on timeout — not a user object
      if (authResult && authResult.user) {
        auth = authResult;
      } else if (authResult && authResult.error) {
        console.warn('[Fixeo Dashboard] auth timed out — late retries will hydrate when ready');
      } else {
        auth = authResult; // normal requireAuth result (redirect or session object)
      }
    } catch (_authErr) {
      console.warn('[Fixeo Dashboard] requireAuth threw:', _authErr && _authErr.message);
    }

    if (!auth || !auth.user) {
      // Don't hard-return to nowhere — dashboard is already visible with empty states.
      // Late retries will hydrate once Supabase is ready.
      window.clearTimeout(_failsafeTimer);
      revealClientDashboard('no-auth-yet');
      return; // data queries need auth — skip them, late retry handles everything
    }

    // Cancel late retries — we have auth now, proceeding normally
    window.clearTimeout(_lateRetry1);
    window.clearTimeout(_lateRetry2);
    window.clearTimeout(_lateRetry3);
    _hydrateAttempted = true; // prevent late retries from firing after us

    // Profile — non-blocking own try/catch
    var _cProfile = null;
    try {
      var _profileResult = await withTimeout(
        _ensureProfile(FixeoSupabase, auth.user.id, auth.user.email || '', 'client'),
        5000, 'ensureProfile'
      );
      // withTimeout returns {data:[], error:'timeout'} on timeout — not a profile object
      if (_profileResult && !_profileResult.error) _cProfile = _profileResult;
    } catch (_profileErr) {
      console.warn('[Fixeo Dashboard] profile fetch failed, using email fallback:', _profileErr && _profileErr.message);
    }

    // Write auth + profile into DOM (hero, sidebar, nav chip, settings)
    _applyClientProfile(auth, _cProfile);

    window.clearTimeout(_failsafeTimer);
    revealClientDashboard('profile-resolved');

    // ── PHASE 2: Data loading — fully parallel, each section independent ──
    // requests must resolve first because quotes depend on request IDs.
    // requests + missions are parallel. quotes follows requests.
    // Each section updates itself — failures in one don't affect others.
    var requests = [], quotes = [], missions = [];

    try {
      // requests and missions are fully independent — run in parallel
      var _dataResults = await withTimeout(
        Promise.allSettled([
          FixeoSupabase.listClientRequests(),
          FixeoSupabase.listClientMissions()
        ]),
        4000, 'requests+missions'
      );

      // withTimeout may return {data:[],error:'timeout'} — check shape
      var _dataArray = Array.isArray(_dataResults) ? _dataResults : [];

      var _reqResult  = _dataArray[0] && _dataArray[0].status === 'fulfilled' ? _dataArray[0].value : [];
      var _missResult = _dataArray[1] && _dataArray[1].status === 'fulfilled' ? _dataArray[1].value : [];

      requests = Array.isArray(_reqResult)  ? _reqResult  : [];
      missions = Array.isArray(_missResult) ? _missResult : [];

      // Render requests section immediately after it resolves
      if (requestsEl) {
        requestsEl.innerHTML = requests.length ? requests.map(function (requestRow) {
          return '' +
            '<div class="request-card">' +
              '<div class="request-top">' +
                '<div>' +
                  '<h3>' + escapeHtml(requestRow.service_category || 'Service') + '</h3>' +
                  '<p>' + escapeHtml(formatDate(requestRow.created_at)) + '</p>' +
                '</div>' +
                '<span class="request-status status-open">En attente</span>' +
              '</div>' +
              '<div class="request-meta">' +
                '<span>📍 ' + escapeHtml(requestRow.city || '—') + '</span>' +
              '</div>' +
              '<p style="margin:0 0 14px;opacity:.78">' + escapeHtml(requestRow.description || '—') + '</p>' +
              '<div class="request-actions">' +
                '<button class="btn btn-secondary" type="button" onclick="window.openNewRequestModal && openNewRequestModal()">Nouvelle demande</button>' +
              '</div>' +
            '</div>';
        }).join('') : '<div class="request-card" style="text-align:center;padding:28px 20px"><p style="margin:0 0 12px;font-size:1.1rem">📋</p><p style="margin:0;font-weight:600">Aucune demande pour le moment</p><p style="margin:8px 0 16px;opacity:.65;font-size:.88rem">Créez votre première demande pour trouver un artisan qualifié.</p><button class="btn btn-primary" type="button" onclick="window.openNewRequestModal&&openNewRequestModal()">+ Créer une demande</button></div>';
        requestsEl.dataset.real = '1';
      }

      // Quotes depend on request IDs — fetched after requests resolve
      if (requests.length) {
        var _quotesResult = await withTimeout(
          FixeoSupabase.listQuotesForRequestIds(requests.map(function (r) { return r.id; })),
          3000, 'quotes'
        );
        quotes = Array.isArray(_quotesResult) ? _quotesResult : [];
      }

      // Render replies section
      if (repliesEl) {
        repliesEl.innerHTML = quotes.length ? quotes.map(function (quote) {
          var relatedRequest = requests.find(function (item) { return item.id === quote.request_id; }) || null;
          return '' +
            '<div class="reply-card">' +
              '<div class="reply-top">' +
                '<div class="reply-avatar" style="display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#E1306C,#833AB4);color:#fff;font-weight:800">🔧</div>' +
                '<div class="reply-info">' +
                  '<h3>Artisan #' + escapeHtml(String(quote.artisan_profile_id || '').slice(0, 8)) + '</h3>' +
                  '<p>' + escapeHtml((relatedRequest && relatedRequest.service_category) || 'Service') + ' • ' + escapeHtml((relatedRequest && relatedRequest.city) || 'Maroc') + '</p>' +
                  '<div class="reply-meta">' +
                    '<span>Statut : ' + escapeHtml(quote.status || 'pending') + '</span>' +
                    '<span>' + escapeHtml(formatDate(quote.created_at)) + '</span>' +
                  '</div>' +
                '</div>' +
                '<div class="reply-price"><strong>' + escapeHtml(formatMoney(quote.proposed_price)) + '</strong><span>Devis</span></div>' +
              '</div>' +
              '<p style="margin:14px 0 0;opacity:.78">' + escapeHtml(quote.message || '—') + '</p>' +
              '<div class="reply-actions">' +
                (quote.status === 'accepted'
                  ? '<button class="btn btn-secondary" type="button" disabled>Devis accepté</button>'
                  : '<button class="btn btn-primary" type="button" data-accept-quote="' + escapeHtml(quote.id) + '">Accepter ce devis</button>') +
              '</div>' +
            '</div>';
        }).join('') : '<div class="reply-card" style="text-align:center;padding:28px 20px"><p style="margin:0 0 8px;font-size:1.1rem">💬</p><p style="margin:0;font-weight:600">Aucune réponse reçue</p><p style="margin:8px 0 0;opacity:.65;font-size:.88rem">Les artisans répondront à vos demandes ici.</p></div>';
        repliesEl.dataset.real = '1';
      }

      // Stats — assembled from requests + quotes + missions (all now resolved)
      if (statsEl) {
        var statsData = [
          { value: requests.length, label: 'Demandes créées' },
          { value: quotes.length,   label: 'Devis reçus' },
          { value: quotes.filter(function (q) { return q.status === 'accepted'; }).length, label: 'Devis acceptés' },
          { value: missions.length, label: 'Missions créées' }
        ];
        statsEl.innerHTML = statsData.map(function (stat) {
          return '<div class="client-stat-card"><span class="stat-number">' + escapeHtml(stat.value) + '</span><span class="stat-label">' + escapeHtml(stat.label) + '</span></div>';
        }).join('');
        statsEl.dataset.real = '1';
      }

      // Actions
      var actionsEl = document.getElementById('client-action-list');
      if (actionsEl) {
        var pendingCount = quotes.filter(function (q) { return q.status === 'pending'; }).length;
        if (pendingCount > 0) {
          actionsEl.innerHTML = '<div class="client-action-item"><span class="client-action-pill">À faire</span><strong>Vous avez ' + escapeHtml(pendingCount) + ' devis en attente de décision</strong><p>Comparez les offres et acceptez le meilleur artisan.</p><div class="client-action-buttons"><button class="btn btn-primary" type="button" onclick="showSection(\'messages\')">Voir les devis</button></div></div>';
        } else {
          actionsEl.innerHTML = '<div class="client-action-item" style="opacity:.65;text-align:center;padding:20px 0"><p style="margin:0">Aucune action en attente. Tout est à jour ✅</p></div>';
        }
        actionsEl.dataset.real = '1';
      }

      // Favorites — static empty state (no feature yet)
      var favoritesEl = document.getElementById('client-favorites-list');
      if (favoritesEl && !favoritesEl.dataset.real) {
        favoritesEl.innerHTML = '<div class="favorite-item" style="opacity:.65;text-align:center;padding:16px 0"><span>Aucun artisan favori pour le moment.</span></div>';
        favoritesEl.dataset.real = '1';
      }

      // Progress tracker
      var progressTracker = document.getElementById('booking-progress-tracker');
      if (progressTracker) progressTracker.style.display = missions.length ? 'block' : 'none';

      // Bookings table (missions view)
      if (bookingsFull) {
        if (missions.length && typeof window.renderBookingsTable === 'function') {
          var rows = missions.map(function (mission) {
            var relatedRequest = requests.find(function (item) { return item.id === mission.request_id; }) || null;
            return {
              id: mission.id,
              artisan: 'Artisan #' + String(mission.artisan_profile_id || '').slice(0, 8),
              service: relatedRequest ? relatedRequest.service_category : 'Mission',
              status: mission.status === 'cancelled' ? 'cancelled' : 'confirmed',
              method: 'Supabase',
              price: Number(mission.agreed_price || 0),
              date: formatDate(mission.created_at)
            };
          });
          window.renderBookingsTable(bookingsFull, rows);
        } else {
          bookingsFull.innerHTML = '<div class="dashboard-panel" style="padding:20px">Aucune mission créée dans Supabase pour le moment.</div>';
        }
      }

      // Accept-quote handlers (wired after replies are rendered)
      if (repliesEl) {
        repliesEl.querySelectorAll('[data-accept-quote]').forEach(function (button) {
          button.addEventListener('click', async function () {
            var quoteId = button.getAttribute('data-accept-quote');
            button.disabled = true;
            try {
              var result = await FixeoSupabase.acceptQuote(quoteId);
              if (result.commission_ok) {
                notify('success', 'Devis accepté', 'Mission créée avec commission 15% validée automatiquement.');
              } else {
                notify('success', 'Devis accepté', 'Mission créée. Vérifiez la commission générée dans Supabase.');
              }
              await renderClientDashboard();
            } catch (error) {
              button.disabled = false;
              notify('error', 'Impossible d\'accepter le devis', FixeoSupabase.getReadableError(error));
            }
          });
        });
      }

    } catch (_dataErr) {
      // Data phase error — dashboard already visible with empty states, safe to ignore
      console.warn('[Fixeo Dashboard] data phase error (non-fatal):', _dataErr && _dataErr.message);
    }
    // Note: no finally needed — revealClientDashboard already called in phase0 and profile-resolved
  }

  function artisanQuoteModalHtml(requestId) {
    return '' +
      '<form id="fixeo-quote-response-form" data-request-id="' + escapeHtml(requestId) + '">' +
        '<div class="form-group">' +
          '<label class="form-label">Montant du devis (MAD)</label>' +
          '<input class="form-control" type="number" name="proposed_price" min="1" step="0.01" placeholder="250" required>' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">Message</label>' +
          '<textarea class="form-control" name="message" rows="4" placeholder="Expliquez votre proposition..." required></textarea>' +
        '</div>' +
        '<button class="btn btn-primary w-100" type="submit">Envoyer le devis</button>' +
      '</form>';
  }

  async function renderArtisanDashboard() {
    if (currentPage() !== 'dashboard-artisan.html') return;

    var FixeoSupabase = ensureSupabase();
    await FixeoSupabase.init();

    window.acceptRequest = function () {};
    window.rejectRequest = function () {};
    window.openQuoteReplyModal = function (requestId) {
      var modalTitle = document.getElementById('modal-title');
      var modalBody = document.getElementById('modal-body');
      var overlay = document.getElementById('modal-overlay');
      if (!modalTitle || !modalBody || !overlay) return;
      modalTitle.textContent = 'Envoyer un devis';
      modalBody.innerHTML = artisanQuoteModalHtml(requestId);
      overlay.classList.add('open');

      var form = document.getElementById('fixeo-quote-response-form');
      if (!form) return;
      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        var formData = new FormData(form);
        try {
          await FixeoSupabase.submitQuote({
            request_id: requestId,
            proposed_price: Number(formData.get('proposed_price') || 0),
            message: String(formData.get('message') || '').trim()
          });
          closeModalIfAny();
          notify('success', 'Devis envoyé', 'Le devis a bien été enregistré dans Supabase.');
          await renderArtisanDashboard();
        } catch (error) {
          notify('error', 'Erreur', FixeoSupabase.getReadableError(error));
        }
      }, { once: true });
    };

    var priorityList = document.getElementById('priority-requests-list');
    var requestsGrid = document.getElementById('requests-grid');
    var missionsList = document.getElementById('artisan-cod-missions');
    var overviewPanel = document.getElementById('artisan-cod-overview-panel');
    var earningsPanel = document.getElementById('artisan-cod-earnings');
    var countEl = document.getElementById('new-requests-count');
    var missionCountEl = document.getElementById('stat-missions-count');

    try {
      var auth = await FixeoSupabase.requireAuth('artisan');

      /* ── Profile hydration (Phase 1) ── */
      var _aProfile = await _ensureProfile(
        FixeoSupabase,
        auth.user.id,
        auth.user.email || '',
        'artisan'
      );

      // Hero greeting
      var _aHeroName = document.getElementById('artisan-hero-name');
      if (_aHeroName) {
        var _aFirstName = (_aProfile && _aProfile.full_name ? _aProfile.full_name : '').split(' ')[0]
          || (auth.user.email ? auth.user.email.split('@')[0] : 'Artisan');
        _aHeroName.textContent = escapeHtml(_aFirstName);
      }

      // Sidebar name
      var _aSidebarUser = document.getElementById('sidebar-username');
      if (_aSidebarUser && _aProfile && _aProfile.full_name) {
        _aSidebarUser.textContent = _aProfile.full_name.split(' ')[0] || _aProfile.full_name;
      }

      // Hydrate settings form
      _hydrateSettingsForm(_aProfile, auth.user.email || '', 'artisan');

      // Wire save button
      _wireSettingsSave(FixeoSupabase, auth.user.id, 'settings-artisan-save', function () {
        return {
          full_name: (document.getElementById('settings-artisan-name')  || {}).value || '',
          phone:     (document.getElementById('settings-artisan-phone') || {}).value || '',
          city:      (document.getElementById('settings-artisan-city')  || {}).value || ''
        };
      });

      var openRequests = await FixeoSupabase.listOpenRequests();
      var allQuotes = await FixeoSupabase.listQuotesForRequestIds(openRequests.map(function (item) { return item.id; }));
      var artisanQuotes = allQuotes.filter(function (quote) { return quote.artisan_profile_id === auth.profile.id; });
      var missions = await FixeoSupabase.listArtisanMissions();

      var requestHtml = openRequests.length ? openRequests.map(function (requestRow) {
        var alreadyQuoted = artisanQuotes.find(function (quote) { return quote.request_id === requestRow.id; });
        return '' +
          '<div class="request-card business-priority">' +
            '<div class="request-header">' +
              '<h3>' + escapeHtml(requestRow.service_category || 'Service') + ' • ' + escapeHtml(requestRow.city || 'Maroc') + '</h3>' +
              '<span class="request-time">' + escapeHtml(formatDate(requestRow.created_at)) + '</span>' +
            '</div>' +
            '<p class="request-desc">' + escapeHtml(requestRow.description || '-') + '</p>' +
            '<div class="request-client">👤 Client #' + escapeHtml(String(requestRow.client_profile_id || '').slice(0, 8)) + '</div>' +
            '<div class="request-meta">' +
              '<span>' + (alreadyQuoted ? '✅ Devis déjà envoyé' : '⚡ Nouvelle demande') + '</span>' +
            '</div>' +
            '<div class="request-actions">' +
              '<button class="btn btn-primary" type="button" onclick="window.openQuoteReplyModal && openQuoteReplyModal(\'' + escapeHtml(requestRow.id) + '\')">' + (alreadyQuoted ? 'Mettre à jour le devis' : 'Répondre maintenant') + '</button>' +
            '</div>' +
          '</div>';
      }).join('') : '<div class="fixeo-empty">Aucune demande disponible dans Supabase.</div>';

      if (priorityList) priorityList.innerHTML = requestHtml;
      if (requestsGrid) requestsGrid.innerHTML = requestHtml;
      if (countEl) countEl.textContent = String(openRequests.length) + ' nouvelles demandes';
      if (missionCountEl) missionCountEl.textContent = String(missions.length);

      if (overviewPanel) {
        var totalCommissions = missions.reduce(function (sum, mission) { return sum + Number(mission.commission_amount || 0); }, 0);
        overviewPanel.innerHTML = '' +
          '<section class="fixeo-cod-shell" style="margin-bottom:22px">' +
            '<div class="fixeo-cod-kpis">' +
              '<div class="fixeo-cod-kpi"><strong>' + escapeHtml(openRequests.length) + '</strong><span>Demandes ouvertes</span></div>' +
              '<div class="fixeo-cod-kpi"><strong>' + escapeHtml(artisanQuotes.length) + '</strong><span>Devis envoyés</span></div>' +
              '<div class="fixeo-cod-kpi"><strong>' + escapeHtml(missions.length) + '</strong><span>Missions créées</span></div>' +
              '<div class="fixeo-cod-kpi"><strong>' + escapeHtml(formatMoney(totalCommissions)) + '</strong><span>Commissions calculées</span></div>' +
            '</div>' +
          '</section>';
      }

      if (missionsList) {
        missionsList.innerHTML = missions.length ? missions.map(function (mission) {
          return '' +
            '<article class="fixeo-mission-card">' +
              '<div class="fixeo-mission-card__top">' +
                '<div>' +
                  '<h3 class="fixeo-mission-card__title">Mission #' + escapeHtml(String(mission.id || '').slice(0, 8)) + '</h3>' +
                  '<div class="fixeo-mission-card__meta">' +
                    '<span>Demande #' + escapeHtml(String(mission.request_id || '').slice(0, 8)) + '</span>' +
                    '<span>' + escapeHtml(formatDate(mission.created_at)) + '</span>' +
                  '</div>' +
                '</div>' +
                '<span class="fixeo-status-badge" style="color:#20c997;background:rgba(32,201,151,.12);border-color:rgba(32,201,151,.25)">' + escapeHtml(mission.status || 'validated') + '</span>' +
              '</div>' +
              '<div class="payment-info">Prix convenu : <strong>' + escapeHtml(formatMoney(mission.agreed_price)) + '</strong></div>' +
              '<div class="commission-info">Commission Fixeo (15%) : ' + escapeHtml(formatMoney(mission.commission_amount)) + '</div>' +
            '</article>';
        }).join('') : '<div class="fixeo-empty">Aucune mission pour le moment.</div>';
      }

      if (earningsPanel) {
        earningsPanel.innerHTML = '' +
          '<section class="fixeo-cod-shell">' +
            '<div class="fixeo-section-title"><h3>Historique Supabase</h3></div>' +
            '<section class="mission-history">' +
              (missions.length ? missions.map(function (mission) {
                return '<div class="mission-row"><span>Mission #' + escapeHtml(String(mission.id).slice(0, 8)) + '</span><span>' + escapeHtml(formatMoney(mission.agreed_price)) + '</span><span class="commission">-' + escapeHtml(formatMoney(mission.commission_amount)) + '</span></div>';
              }).join('') : '<div class="fixeo-empty">Aucune ligne de mission pour le moment.</div>') +
            '</section>' +
          '</section>';
      }
    } catch (error) {
      if (priorityList) priorityList.innerHTML = '<div class="fixeo-empty">' + escapeHtml(FixeoSupabase.getReadableError(error)) + '</div>';
      if (requestsGrid) requestsGrid.innerHTML = '';
    }
  }

  async function overrideArtisanProfileRequestForm() {
    if (currentPage() !== 'artisan.html') return;

    var FixeoSupabase = ensureSupabase();
    await FixeoSupabase.init();

    window.submitQuoteForm = async function (event) {
      event.preventDefault();
      var form = event.currentTarget;
      var formData = new FormData(form);
      try {
        await FixeoSupabase.submitServiceRequest({
          service_category: String(formData.get('service') || '').trim(),
          city: String(formData.get('city') || '').trim(),
          description: String(formData.get('description') || '').trim() + '\n\nContact: ' + String(formData.get('phone') || '').trim() + (formData.get('date') ? '\nDate souhaitée: ' + String(formData.get('date')) : '')
        });
        notify('success', 'Demande envoyée', 'Votre demande a bien été créée dans Supabase.');
        if (typeof window.showQuoteSuccess === 'function') {
          window.showQuoteSuccess();
        } else {
          window.location.href = 'dashboard-client.html';
        }
      } catch (error) {
        notify('error', 'Erreur', FixeoSupabase.getReadableError(error));
      }
    };
  }

  ready(function () {
    var FixeoSupabase = window.FixeoSupabase;
    if (!FixeoSupabase) return;

    FixeoSupabase.init().catch(function () {});
    overrideAuthPage().catch(function () {});
    renderClientDashboard().catch(function () {});
    renderArtisanDashboard().catch(function () {});
    overrideArtisanProfileRequestForm().catch(function () {});

    window.addEventListener('fixeo:data:changed', function () {
      renderClientDashboard().catch(function () {});
      renderArtisanDashboard().catch(function () {});
    });
  });
})(window, document);
