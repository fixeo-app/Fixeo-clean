(function () {
  'use strict';

  var GUEST_ACCESS_KEY = 'fixeo_guest_access_v1';
  var root = document.getElementById('fx-guest-tracking-root');

  if (!root) return;

  function _el(tag, text) {
    var node = document.createElement(tag);
    if (text != null) node.textContent = String(text);
    return node;
  }

  function _statusLabel(status) {
    var value = String(status || '').toLowerCase().trim();

    var labels = {
      new: 'Demande reçue',
      assigned: 'Artisan sélectionné',
      in_progress: 'Intervention en cours',
      completed: 'Intervention terminée',
      validated: 'Intervention validée',
      cancelled: 'Demande annulée',

      nouvelle: 'Demande reçue',
      'acceptée': 'Artisan sélectionné',
      acceptee: 'Artisan sélectionné',
      en_cours: 'Intervention en cours',
      'en cours': 'Intervention en cours',
      'terminée': 'Intervention terminée',
      terminee: 'Intervention terminée',
      'validée': 'Intervention validée',
      validee: 'Intervention validée',
      'annulée': 'Demande annulée',
      annulee: 'Demande annulée'
    };

    return labels[value] || 'Suivi en cours';
  }

  function _readAccessRegistry() {
    try {
      var parsed = JSON.parse(
        localStorage.getItem(GUEST_ACCESS_KEY) || '{}'
      );

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }

      return parsed;
    } catch (_) {
      return {};
    }
  }

  function _lookup(access) {
    return fetch('/api/guest-request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'guest_lookup',
        tracking_ref: access.tracking_ref,
        guest_token: access.guest_token
      })
    }).then(function (res) {
      if (!res.ok) return null;

      return res.json().then(function (data) {
        return data && data.ok && data.request
          ? data.request
          : null;
      });
    }).catch(function () {
      return null;
    });
  }

  function _renderEmpty() {
    root.innerHTML = '';

    root.appendChild(
      _el('h1', 'Mes demandes FIXEO')
    );

    root.appendChild(
      _el(
        'p',
        'Aucune demande anonyme enregistrée sur cet appareil.'
      )
    );
  }

  function _renderRequests(requests) {
    root.innerHTML = '';

    root.appendChild(
      _el('h1', 'Mes demandes FIXEO')
    );

    requests.forEach(function (req) {
      var card = _el('article');
      card.className = 'fx-guest-request-card';

      var title = _el(
        'h2',
        req.service_category || 'Demande FIXEO'
      );

      var status = _el(
        'p',
        _statusLabel(req.status)
      );
      status.className = 'fx-guest-request-status';

      var ref = _el(
        'p',
        'Réf. : ' + String(req.tracking_ref || '')
      );

      var city = _el(
        'p',
        String(req.city || '')
      );

      var description = _el(
        'p',
        String(req.description || '')
      );

      card.appendChild(title);
      card.appendChild(status);
      card.appendChild(ref);
      card.appendChild(city);
      card.appendChild(description);

      root.appendChild(card);
    });
  }

  function _load() {
    var registry = _readAccessRegistry();

    var accesses = Object.keys(registry)
      .map(function (key) {
        return registry[key];
      })
      .filter(function (access) {
        return access &&
          access.tracking_ref &&
          /^[a-f0-9]{64}$/i.test(
            String(access.guest_token || '')
          );
      });

    if (!accesses.length) {
      _renderEmpty();
      return;
    }

    Promise.all(
      accesses.map(_lookup)
    ).then(function (results) {
      var requests = results.filter(Boolean);

      requests.sort(function (a, b) {
        return Date.parse(b.created_at || 0) -
               Date.parse(a.created_at || 0);
      });

      if (!requests.length) {
        _renderEmpty();
        return;
      }

      _renderRequests(requests);
    });
  }

  _load();
})();
