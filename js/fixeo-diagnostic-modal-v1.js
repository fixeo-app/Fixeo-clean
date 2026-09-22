/* Lazy Diagnostic UI. All booking remains in FixeoEstimatorV2. */
(function () {
  'use strict';
  if (window.FixeoDiagnosticModal) return;
  var API = window.FixeoDiagnostic,
    dialog,
    body,
    footer,
    opener,
    session,
    pending = [],
    busy = false,
    current = 'compose',
    pausedDraft,
    runId;
  var draft = {
      description: '',
      city: '',
      answers: {},
      safety: [],
      consent: false,
    },
    storageKey = 'fixeo_diagnostic_dossier_v1';
  var cities = {
    casablanca: 'Casablanca',
    rabat: 'Rabat',
    marrakech: 'Marrakech',
    fes: 'Fès',
    tanger: 'Tanger',
    agadir: 'Agadir',
    meknes: 'Meknès',
    oujda: 'Oujda',
    kenitra: 'Kénitra',
    tetouan: 'Tétouan',
    sale: 'Salé',
    temara: 'Témara',
    'el-jadida': 'El Jadida',
    'beni-mellal': 'Béni Mellal',
    nador: 'Nador',
    khouribga: 'Khouribga',
    safi: 'Safi',
    taza: 'Taza',
    ouarzazate: 'Ouarzazate',
    mohammedia: 'Mohammedia',
  };
  var trades = {
    bricolage: 'Bricolage',
    plomberie: 'Plomberie',
    electricite: 'Électricité',
    serrurerie: 'Serrurerie',
    climatisation: 'Climatisation',
    menuiserie: 'Menuiserie',
    peinture: 'Peinture',
    maconnerie: 'Maçonnerie',
    nettoyage: 'Nettoyage',
    jardinage: 'Jardinage',
    demenagement: 'Déménagement',
    carrelage: 'Carrelage',
    autre: 'Métier à préciser',
  };
  var hazards = {
    electricity: 'Étincelles, fils exposés ou odeur de brûlé',
    gas: 'Odeur de gaz',
    fire: 'Flammes ou fumée importante',
    major_leak: 'Fuite d’eau importante',
    flood: 'Eau qui se propage / inondation',
    structure: 'Affaissement ou risque de chute',
    immediate_danger: 'Autre danger immédiat',
  };
  var sources = {
    observed: 'Observé sur la photo · à confirmer sur place',
    user_declared: 'Votre description',
    ai_inferred: 'Hypothèse FIXEO',
    user_confirmed: 'Confirmé par vous',
  };
  var icon =
    '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 10h6l2-4h8l2 4h6v16H4z"/><circle cx="16" cy="18" r="5"/></svg>';
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[c];
    });
  }
  function node(id) {
    return dialog.querySelector('#' + id);
  }
  function remember(id) {
    try {
      if (id) sessionStorage.setItem(storageKey, id);
      else sessionStorage.removeItem(storageKey);
    } catch (_) {}
  }
  function remembered() {
    try {
      return sessionStorage.getItem(storageKey);
    } catch (_) {
      return null;
    }
  }
  function restore(s) {
    session = s;
    draft = {
      description: s.input.description,
      city: s.city_slug,
      answers: s.input.answers || {},
      safety: s.input.safety_signals || [],
      consent: true,
    };
    remember(s.id);
  }
  function clearFiles() {
    pending.forEach(function (p) {
      URL.revokeObjectURL(p.url);
    });
    pending = [];
  }
  function close() {
    capture();
    pausedDraft =
      !busy && ['compose', 'safety', 'questions'].includes(current)
        ? {
            id: session && session.id,
            revision: session && session.revision,
            page: current,
            draft: JSON.parse(JSON.stringify(draft)),
          }
        : null;
    dialog.close();
    document.body.classList.remove('fxdiag-is-open');
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', fitViewport);
      window.visualViewport.removeEventListener('scroll', fitViewport);
    }
    API.setActive(false);
    if (opener && opener.isConnected) opener.focus();
  }
  function fitViewport() {
    if (!dialog || !dialog.open) return;
    var viewport = window.visualViewport;
    if (viewport && window.innerWidth <= 700) {
      dialog.style.setProperty('--fxdiag-vv-height', viewport.height + 'px');
      dialog.style.setProperty('--fxdiag-vv-top', viewport.offsetTop + 'px');
    } else {
      dialog.style.removeProperty('--fxdiag-vv-height');
      dialog.style.removeProperty('--fxdiag-vv-top');
    }
  }
  function build() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.className = 'fxdiag-modal';
    dialog.id = 'fxdiag-dialog';
    dialog.setAttribute('aria-labelledby', 'fxdiag-title');
    dialog.innerHTML =
      '<div class="fxdiag-shell"><header class="fxdiag-head"><div class="fxdiag-brand"><i class="fxdiag-dot" aria-hidden="true"></i>FIXEO <span>Diagnostic</span></div><button type="button" class="fxdiag-close" aria-label="Fermer le diagnostic">×</button></header><div class="fxdiag-body"></div><div class="fxdiag-footer"></div></div>';
    document.body.appendChild(dialog);
    body = dialog.querySelector('.fxdiag-body');
    footer = dialog.querySelector('.fxdiag-footer');
    dialog.querySelector('.fxdiag-close').onclick = close;
    dialog.addEventListener('cancel', function (e) {
      e.preventDefault();
      close();
    });
  }
  function frame(title, intro, step) {
    dialog.dataset.step = current;
    body.innerHTML =
      '<ol class="fxdiag-progress" aria-label="Progression du diagnostic">' +
      ['Problème', 'Sécurité', 'Analyse', 'Résultat']
        .map(function (label, index) {
          var i = index + 1;
          return (
            '<li class="' +
            (i < step ? 'done' : '') +
            '"' +
            (i === step ? ' aria-current="step"' : '') +
            '><span class="fxdiag-step-number" aria-hidden="true">' +
            (i < step ? '✓' : '0' + i) +
            '</span><span>' +
            label +
            '</span></li>'
          );
        })
        .join('') +
      '</ol><h2 id="fxdiag-title" tabindex="-1">' +
      esc(title) +
      '</h2><p class="fxdiag-intro">' +
      esc(intro) +
      '</p>';
    body.scrollTop = 0;
    footer.innerHTML = '';
    window.requestAnimationFrame(function () {
      var title = node('fxdiag-title');
      if (dialog.open && title) title.focus({ preventScroll: true });
    });
  }
  function actions(primary, fn, secondary, back) {
    footer.innerHTML =
      (secondary
        ? '<button type="button" class="fxdiag-button quiet" id="fxdiag-back">' +
          esc(secondary) +
          '</button>'
        : '<span class="fxdiag-footnote" id="fxdiag-next-hint">Diagnostic indicatif, confirmé par l’artisan si nécessaire.</span>') +
      (primary
        ? '<button type="button" class="fxdiag-button" id="fxdiag-next">' +
          esc(primary) +
          '<span aria-hidden="true">→</span></button>'
        : '');
    if (primary)
      node('fxdiag-next').onclick = function () {
        execute(fn);
      };
    if (secondary)
      node('fxdiag-back').onclick = function () {
        execute(back);
      };
    updateComposeAvailability();
  }
  function updateComposeAvailability() {
    if (current !== 'compose' || !node('fxdiag-next')) return;
    var hasMedia =
      pending.length ||
      (session &&
        session.media.some(function (m) {
          return m.state === 'ready';
        }));
    var hasContent = node('fxdiag-description').value.trim() || hasMedia;
    var hasCity = !!cities[node('fxdiag-city').value];
    var consent = node('fxdiag-consent').checked;
    node('fxdiag-next').disabled = busy || !hasContent || !hasCity || !consent;
    node('fxdiag-next').setAttribute('aria-describedby', 'fxdiag-next-hint');
    node('fxdiag-next-hint').textContent = !hasContent
      ? 'Ajoutez une photo ou une description.'
      : !hasCity
        ? 'Choisissez votre ville.'
        : !consent
          ? 'Donnez votre accord pour continuer.'
          : 'Prochaine étape : votre sécurité.';
  }
  function message(error) {
    var code = (error && error.message) || '';
    if (/QUOTA|BUDGET|CONCURRENCY/.test(code))
      return 'La limite de diagnostics est atteinte pour le moment. Réessayez plus tard.';
    if (/REVISION|BUSY|RUNNING/.test(code))
      return 'Ce dossier a évolué. Fermez puis rouvrez le diagnostic pour retrouver son état actuel.';
    if (/AUTH|OWNER|NOT_FOUND|EXPIRED/.test(code))
      return 'Ce dossier n’est plus accessible avec cette session. Reconnectez-vous ou démarrez un nouveau diagnostic.';
    if (/MEDIA|IMAGE|MIME|PHOTO|PIXEL|UPLOAD/.test(code))
      return 'Cette photo n’a pas pu être validée. Utilisez une image JPEG, PNG ou WebP de moins de 8 Mio.';
    if (/VALIDATION:/.test(code)) return code.slice(11);
    return 'L’opération n’a pas abouti. Vos informations restent dans ce dossier. Réessayez dans un instant.';
  }
  function showError(error) {
    var old = node('fxdiag-error');
    if (old) old.remove();
    var el = document.createElement('p');
    el.id = 'fxdiag-error';
    el.className = 'fxdiag-error';
    el.setAttribute('role', 'alert');
    el.textContent = message(error);
    body.appendChild(el);
    el.scrollIntoView({ block: 'nearest' });
  }
  async function execute(fn) {
    if (busy) return;
    busy = true;
    footer.setAttribute('aria-busy', 'true');
    var clicked = document.activeElement;
    var previousLabel =
      clicked && footer.contains(clicked) ? clicked.innerHTML : null;
    if (previousLabel) clicked.textContent = 'Un instant…';
    footer.querySelectorAll('button').forEach(function (b) {
      b.disabled = true;
    });
    try {
      await fn();
    } catch (error) {
      if (current === 'working') {
        current = 'recovery';
        frame(
          'Reprenons votre diagnostic',
          'Les informations déjà enregistrées sont conservées.',
          3,
        );
        actions('Réessayer', recoverAnalysis, 'Modifier', function () {
          runId = null;
          renderCompose();
        });
      }
      showError(error);
    } finally {
      busy = false;
      footer.removeAttribute('aria-busy');
      if (previousLabel && clicked.isConnected)
        clicked.innerHTML = previousLabel;
      footer.querySelectorAll('button').forEach(function (b) {
        b.disabled = false;
      });
      updateComposeAvailability();
    }
  }
  function capture() {
    if (node('fxdiag-description')) {
      draft.description = node('fxdiag-description').value;
      draft.city = node('fxdiag-city').value;
      draft.consent = node('fxdiag-consent').checked;
    }
    if (current === 'safety') {
      draft.safety = Array.from(
        body.querySelectorAll('.fxdiag-hazards input:checked'),
      ).map(function (el) {
        return el.value;
      });
    }
    if (current === 'questions' && session && session.result) {
      session.result.questions.forEach(function (q) {
        var field =
          q.type === 'choice'
            ? body.querySelector('input[name="q-' + q.id + '"]:checked')
            : node('fxdiag-q-' + q.id);
        if (field && field.value.trim())
          draft.answers[q.id] = field.value.trim();
        else delete draft.answers[q.id];
      });
    }
  }
  function backToCompose() {
    capture();
    renderCompose();
  }
  function renderCompose() {
    current = 'compose';
    frame(
      'Montrez le problème.',
      'Une photo ou quelques mots. FIXEO vous guide vers le bon métier et évalue l’urgence.',
      1,
    );
    body.insertAdjacentHTML(
      'beforeend',
      '<div class="fxdiag-grid"><div class="fxdiag-media-column"><div class="fxdiag-label-row"><span class="fxdiag-label">Montrez ce que vous voyez</span><span class="fxdiag-optional">Facultatif</span></div><div class="fxdiag-media-well" id="fxdiag-media"><button type="button" class="fxdiag-drop" id="fxdiag-add" aria-describedby="fxdiag-photo-help">' +
        '<span class="fxdiag-upload-icon">' +
        icon +
        '</span>' +
        '<strong>Une photo pour mieux comprendre</strong><small>Touchez pour ajouter vos photos</small></button><div class="fxdiag-photos" id="fxdiag-photos"></div></div>' +
        '<div class="fxdiag-media-actions"><button type="button" class="fxdiag-media-button" id="fxdiag-camera">' +
        icon +
        'Prendre une photo</button><button type="button" class="fxdiag-media-button" id="fxdiag-library"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="2"/><path d="m4 18 5-5 4 3 3-4 5 6"/></svg>Photothèque / fichiers</button></div>' +
        '<input type="file" id="fxdiag-files" accept="image/jpeg,image/png,image/webp" multiple hidden><input type="file" id="fxdiag-camera-file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden>' +
        '<p class="fxdiag-photo-status" id="fxdiag-photo-status" role="status" aria-live="polite">Aucune photo sélectionnée</p><p class="fxdiag-photo-help" id="fxdiag-photo-help">3 photos max. · 8 Mio / photo · JPEG, PNG, WebP</p>' +
        '<p class="fxdiag-privacy">Uniquement le problème : évitez visages, papiers d’identité et informations personnelles.</p></div>' +
        '<div class="fxdiag-description-column"><div class="fxdiag-field"><label class="fxdiag-label" for="fxdiag-description">Que constatez-vous ?</label><textarea id="fxdiag-description" class="fxdiag-input" maxlength="2000" rows="3" placeholder="Par exemple : de l’eau coule sous mon lavabo…">' +
        esc(draft.description) +
        '</textarea><span class="fxdiag-field-help">Quelques mots suffisent. Vous pouvez aussi commencer sans photo.</span></div><div class="fxdiag-field"><label class="fxdiag-label" for="fxdiag-city">Ville d’intervention</label><select id="fxdiag-city" class="fxdiag-input"><option value="">Choisir ma ville</option>' +
        Object.keys(cities)
          .map(function (c) {
            return (
              '<option value="' +
              c +
              '"' +
              (draft.city === c ? ' selected' : '') +
              '>' +
              cities[c] +
              '</option>'
            );
          })
          .join('') +
        '</select></div><div class="fxdiag-outcome"><span class="fxdiag-outcome-icon" aria-hidden="true">↗</span><p><strong>Et ensuite ?</strong>Le métier adapté, un diagnostic indicatif et le niveau d’urgence.</p></div></div></div>' +
        '<div class="fxdiag-consent-area"><label class="fxdiag-consent"><input type="checkbox" id="fxdiag-consent" aria-describedby="fxdiag-consent-details"' +
        (draft.consent ? ' checked' : '') +
        '><span>J’accepte l’analyse par FIXEO et son fournisseur IA.</span></label>' +
        '<details class="fxdiag-consent-details" id="fxdiag-consent-details"><summary>En savoir plus sur mes données</summary><div><p>Ma description et mes photos sont analysées pour préparer mon intervention.</p><p>Suppression programmée : dossier sans réservation après 24 h ; photos liées à une intervention après 90 jours au plus, ou 30 jours après clôture ; contexte de l’intervention après 180 jours.</p><a href="/confidentialite.html" target="_blank" rel="noopener">Politique de confidentialité <span aria-hidden="true">↗</span></a></div></details></div>' +
        '<p class="fxdiag-disclaimer">Diagnostic indicatif, confirmé par l’artisan si nécessaire.</p>',
    );
    function chooseFiles() {
      node('fxdiag-files').click();
    }
    node('fxdiag-add').onclick = chooseFiles;
    node('fxdiag-library').onclick = chooseFiles;
    node('fxdiag-camera').onclick = function () {
      node('fxdiag-camera-file').click();
    };
    ['fxdiag-files', 'fxdiag-camera-file'].forEach(function (id) {
      node(id).onchange = function (e) {
        addFiles(e.target.files);
        e.target.value = '';
      };
    });
    ['fxdiag-description', 'fxdiag-city', 'fxdiag-consent'].forEach(
      function (id) {
        node(id).addEventListener('input', updateComposeAvailability);
        node(id).addEventListener('change', updateComposeAvailability);
      },
    );
    var drop = node('fxdiag-media');
    drop.ondragover = function (e) {
      e.preventDefault();
      drop.classList.add('drag');
    };
    drop.ondragleave = function () {
      drop.classList.remove('drag');
    };
    drop.ondrop = function (e) {
      e.preventDefault();
      drop.classList.remove('drag');
      addFiles(e.dataTransfer.files);
    };
    renderPhotos();
    actions('Continuer', function () {
      capture();
      if (!cities[draft.city])
        throw new Error('VALIDATION:Choisissez votre ville.');
      if (
        !draft.description.trim() &&
        !pending.length &&
        !(
          session &&
          session.media.some(function (m) {
            return m.state === 'ready';
          })
        )
      )
        throw new Error(
          'VALIDATION:Ajoutez une photo ou décrivez ce que vous constatez.',
        );
      if (!draft.consent)
        throw new Error(
          'VALIDATION:Votre accord est nécessaire pour analyser ces informations.',
        );
      renderSafety();
    });
  }
  function addFiles(files) {
    if (busy) return;
    capture();
    var oldError = node('fxdiag-error');
    if (oldError) oldError.remove();
    var count =
      (session
        ? session.media.filter(function (m) {
            return ['reserved', 'validating', 'ready'].includes(m.state);
          }).length
        : 0) + pending.length;
    try {
      Array.from(files).forEach(function (file) {
        if (count >= 3)
          throw new Error('VALIDATION:Vous pouvez ajouter 3 photos maximum.');
        if (
          !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
          file.size < 1 ||
          file.size > 8388608
        )
          throw new Error('INVALID_PHOTO');
        pending.push({ file: file, url: URL.createObjectURL(file) });
        count++;
      });
    } catch (error) {
      showError(error);
    }
    renderPhotos();
  }
  function renderPhotos() {
    var target = node('fxdiag-photos');
    if (!target) return;
    target.innerHTML = '';
    function thumbnail(item, local) {
      var box = document.createElement('div');
      box.className = 'fxdiag-photo';
      var img = document.createElement('img');
      img.alt = 'Photo du problème';
      img.referrerPolicy = 'no-referrer';
      if (local) img.src = item.url;
      box.appendChild(img);
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Retirer cette photo');
      remove.onclick = function () {
        execute(async function () {
          capture();
          if (local) {
            pending.splice(pending.indexOf(item), 1);
            URL.revokeObjectURL(item.url);
          } else {
            restore(
              (
                await API.api({
                  action: 'media_remove',
                  session_id: session.id,
                  revision: session.revision,
                  media_id: item.id,
                })
              ).session,
            );
          }
          renderPhotos();
        });
      };
      box.appendChild(remove);
      target.appendChild(box);
      if (local || item.state === 'ready') {
        var stateLabel = document.createElement('span');
        stateLabel.textContent = local ? 'Sélectionnée' : 'Enregistrée';
        box.appendChild(stateLabel);
      }
      if (!local) {
        if (item.state === 'ready')
          API.api({
            action: 'media_url',
            session_id: session.id,
            media_id: item.id,
          })
            .then(function (r) {
              if (img.isConnected) img.src = r.url;
            })
            .catch(function () {
              img.alt = 'Photo enregistrée';
            });
        else {
          var label = document.createElement('span');
          label.textContent = 'À renvoyer';
          box.appendChild(label);
        }
      }
    }
    if (session)
      session.media
        .filter(function (m) {
          return ['reserved', 'validating', 'ready'].includes(m.state);
        })
        .forEach(function (m) {
          thumbnail(m, false);
        });
    pending.forEach(function (p) {
      thumbnail(p, true);
    });
    var count = target.children.length;
    target.hidden = !count;
    target.dataset.count = count;
    node('fxdiag-add').hidden = !!count;
    node('fxdiag-camera').disabled = count >= 3;
    node('fxdiag-library').disabled = count >= 3;
    node('fxdiag-photo-status').textContent = count
      ? count +
        (count > 1 ? ' photos prêtes' : ' photo prête') +
        (pending.length
          ? ' · envoi après confirmation'
          : ' · enregistrée' + (count > 1 ? 's' : ''))
      : 'Aucune photo sélectionnée';
    updateComposeAvailability();
  }
  function renderSafety() {
    current = 'safety';
    frame(
      'D’abord, votre sécurité',
      'Sans vous approcher du danger, avez-vous déjà constaté l’un de ces signes ?',
      2,
    );
    body.insertAdjacentHTML(
      'beforeend',
      '<div class="fxdiag-hazards">' +
        Object.keys(hazards)
          .map(function (key) {
            return (
              '<label class="fxdiag-hazard"><input type="checkbox" value="' +
              key +
              '"' +
              (draft.safety.includes(key) ? ' checked' : '') +
              '>' +
              hazards[key] +
              '</label>'
            );
          })
          .join('') +
        '</div><p class="fxdiag-note">Ne faites aucune manipulation pour vérifier. Si vous avez un doute, gardez vos distances. L’absence de signe déclaré ne garantit pas l’absence de danger.</p>',
    );
    actions(
      'Analyser mon problème',
      async function () {
        draft.safety = Array.from(
          body.querySelectorAll('.fxdiag-hazard input:checked'),
        ).map(function (x) {
          return x.value;
        });
        runId = null;
        await startAnalysis();
      },
      'Retour',
      backToCompose,
    );
  }
  function working(label) {
    current = 'working';
    frame(
      'FIXEO examine votre problème',
      'Nous rapprochons vos informations pour vous guider.',
      3,
    );
    body.insertAdjacentHTML(
      'beforeend',
      '<div class="fxdiag-analyzing"><div class="fxdiag-orbit" aria-hidden="true">' +
        icon +
        '</div><p id="fxdiag-work-status" role="status" aria-live="polite">' +
        esc(label) +
        '</p><p class="fxdiag-privacy">Vous pouvez fermer cette fenêtre et retrouver votre dossier ici.</p></div>',
    );
    actions(null);
  }
  function status(label) {
    var el = node('fxdiag-work-status');
    if (el) el.textContent = label;
  }
  function upload(url, file) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.timeout = 60000;
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable)
          status(
            'Envoi de la photo · ' +
              Math.round((e.loaded / e.total) * 100) +
              ' %',
          );
      };
      xhr.onload = function () {
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error('UPLOAD_FAILED'));
      };
      xhr.onerror = xhr.ontimeout = function () {
        reject(new Error('UPLOAD_FAILED'));
      };
      xhr.send(file);
    });
  }
  async function startAnalysis() {
    working('Préparation du dossier sécurisé…');
    var id = session ? session.id : crypto.randomUUID();
    var input = {
      description: draft.description,
      answers: draft.answers,
      safety_signals: draft.safety,
    };
    var response = await API.api({
      action: session ? 'update' : 'create',
      session_id: id,
      revision: session && session.revision,
      city_slug: draft.city,
      input: input,
      consent_version: 'diagnostic-privacy-v1',
    });
    restore(response.session);
    remember(id);
    // A declared danger goes directly to fixed safety guidance; no media or model is needed.
    if (!draft.safety.length) {
      if (
        session.media.some(function (m) {
          return ['reserved', 'validating'].includes(m.state);
        })
      )
        throw new Error(
          'VALIDATION:Retirez la photo interrompue, puis ajoutez-la à nouveau.',
        );
      while (pending.length) {
        var item = pending[0];
        status('Préparation de la photo…');
        var ticket = await API.api({
          action: 'media_reserve',
          session_id: id,
          revision: session.revision,
          kind: 'photo',
          mime: item.file.type,
          bytes: item.file.size,
        });
        restore(ticket.session);
        try {
          await upload(ticket.upload.url, item.file);
          status('Vérification et protection de la photo…');
          restore(
            (
              await API.api({
                action: 'media_validate',
                session_id: id,
                revision: session.revision,
                media_id: ticket.upload.media_id,
              })
            ).session,
          );
        } catch (error) {
          try {
            restore(
              (
                await API.api({
                  action: 'media_remove',
                  session_id: id,
                  revision: session.revision,
                  media_id: ticket.upload.media_id,
                })
              ).session,
            );
          } catch (_) {}
          throw error;
        }
        pending.shift();
        URL.revokeObjectURL(item.url);
      }
    }
    runId = crypto.randomUUID();
    await resumeAnalysis();
  }
  async function recoverAnalysis() {
    if (!session) return startAnalysis();
    restore((await API.api({ action: 'get', session_id: session.id })).session);
    if (session.state === 'analyzing') {
      if (
        session.analysis_retry_after &&
        Date.parse(session.analysis_retry_after) < Date.now()
      ) {
        runId = crypto.randomUUID();
        return resumeAnalysis();
      }
      return poll();
    }
    if (session.result || session.state === 'bound') {
      runId = null;
      return renderState();
    }
    runId = null;
    return startAnalysis();
  }
  async function resumeAnalysis() {
    if (!session) return startAnalysis();
    if (!runId) return startAnalysis();
    working('Analyse des symptômes et vérification des signaux de sécurité…');
    var response = await API.api({
      action: 'analyze',
      session_id: session.id,
      revision: session.revision,
      run_id: runId,
    });
    if (response.pending) {
      await poll();
      return;
    }
    restore(response.session);
    runId = null;
    renderState();
  }
  async function poll() {
    working('L’analyse est en cours…');
    for (var i = 0; i < 24; i++) {
      await new Promise(function (resolve) {
        window.setTimeout(resolve, 2500);
      });
      var response = await API.api({ action: 'get', session_id: session.id });
      restore(response.session);
      if (
        session.state === 'analyzing' &&
        session.analysis_retry_after &&
        Date.parse(session.analysis_retry_after) < Date.now()
      )
        throw new Error('ANALYSIS_INTERRUPTED');
      if (session.state !== 'analyzing') {
        runId = null;
        renderState();
        return;
      }
      if (!dialog.open) return;
    }
    throw new Error('ANALYSIS_RUNNING');
  }
  function renderQuestions() {
    current = 'questions';
    frame(
      'Précisons ensemble',
      'Ces réponses aideront FIXEO à vous orienter. Répondez uniquement à partir de ce que vous constatez déjà.',
      3,
    );
    var questions = session.result.questions;
    questions.forEach(function (q) {
      var html =
        '<div class="fxdiag-field"><label class="fxdiag-label" for="fxdiag-q-' +
        esc(q.id) +
        '">' +
        esc(q.label) +
        '</label>';
      if (q.type === 'choice') {
        html +=
          '<div class="fxdiag-choice" role="group" aria-label="' +
          esc(q.label) +
          '">' +
          [
            ['yes', 'Oui'],
            ['no', 'Non'],
            ['unknown', 'Je ne sais pas'],
          ]
            .map(function (pair) {
              return (
                '<label><input type="radio" name="q-' +
                esc(q.id) +
                '" value="' +
                pair[0] +
                '"' +
                (draft.answers[q.id] === pair[0] ? ' checked' : '') +
                '>' +
                pair[1] +
                '</label>'
              );
            })
            .join('') +
          '</div>';
      } else
        html +=
          '<input class="fxdiag-input" id="fxdiag-q-' +
          esc(q.id) +
          '" maxlength="500" placeholder="Votre réponse" value="' +
          esc(draft.answers[q.id] || '') +
          '">';
      body.insertAdjacentHTML('beforeend', html + '</div>');
    });
    actions(
      'Préciser le diagnostic',
      async function () {
        questions.forEach(function (q) {
          var el =
            q.type === 'choice'
              ? body.querySelector('input[name="q-' + q.id + '"]:checked')
              : node('fxdiag-q-' + q.id);
          if (!el || !el.value.trim())
            throw new Error(
              'VALIDATION:Répondez à chaque question, ou indiquez « Je ne sais pas ».',
            );
          draft.answers[q.id] = el.value.trim();
        });
        runId = null;
        await startAnalysis();
      },
      'Modifier',
      backToCompose,
    );
  }
  function card(title, items) {
    if (!items.length) return '';
    return (
      '<section class="fxdiag-card"><h3>' +
      esc(title) +
      '</h3><ul>' +
      items
        .map(function (item) {
          return (
            '<li>' +
            esc(typeof item === 'string' ? item : item.value) +
            (item.provenance
              ? '<span class="fxdiag-source">' +
                esc(sources[item.provenance] || 'À vérifier') +
                '</span>'
              : '') +
            '</li>'
          );
        })
        .join('') +
      '</ul></section>'
    );
  }
  function renderResult() {
    current = 'result';
    var r = session.result;
    frame(
      r.safety.stop
        ? 'Votre sécurité passe en premier'
        : 'Voici ce que FIXEO peut vous dire',
      'Diagnostic indicatif — à confirmer par l’artisan si nécessaire.',
      4,
    );
    if (r.safety.stop) {
      body.insertAdjacentHTML(
        'beforeend',
        '<section class="fxdiag-caution"><h3>Un danger potentiel a été signalé</h3><ul>' +
          (r.safety.messages || [])
            .map(function (t) {
              return '<li>' + esc(t) + '</li>';
            })
            .join('') +
          '</ul><p>Le parcours de réservation est interrompu pour cette situation.</p></section>',
      );
      actions('Fermer', close);
      return;
    }
    var urgency =
      { low: 'Faible', moderate: 'Modérée', high: 'Élevée' }[r.urgency.value] ||
      'À confirmer';
    body.insertAdjacentHTML(
      'beforeend',
      '<section class="fxdiag-result-top"><span class="fxdiag-tag">Métier recommandé · hypothèse FIXEO</span><h3>' +
        esc(trades[r.trade.value] || r.trade.value) +
        '</h3><p>' +
        esc(r.problem.value) +
        '</p></section><div class="fxdiag-cards">' +
        card(
          'Observations et précisions',
          r.facts.filter(function (x) {
            return x.key !== 'description';
          }),
        ) +
        card('Causes possibles', r.hypotheses) +
        card('Pièces éventuellement nécessaires', r.possible_parts) +
        card('À vérifier par le professionnel', r.checks) +
        '</div><p class="fxdiag-note"><span class="fxdiag-tag ' +
        (r.urgency.value === 'high' ? 'urgent' : '') +
        '">Urgence indicative : ' +
        esc(urgency) +
        '</span><br>' +
        esc(r.urgency.reason || 'À confirmer par le professionnel.') +
        '</p><p class="fxdiag-privacy">Les pièces restent des possibilités. Le prix et une éventuelle durée seront précisés uniquement si un scénario FIXEO validé correspond à votre situation.</p>',
    );
    actions(
      'Continuer vers mon estimation FIXEO',
      async function () {
        var handoff = await API.api({
          action: 'handoff',
          session_id: session.id,
          revision: session.revision,
        });
        if (!window.FixeoEstimatorV2) throw new Error('ESTIMATOR_UNAVAILABLE');
        close();
        window.FixeoEstimatorV2.open(handoff.entry_context);
      },
      'Modifier',
      backToCompose,
    );
  }
  function renderState() {
    if (session && session.state === 'bound') {
      current = 'bound';
      frame(
        'Votre demande a été enregistrée',
        'Ce diagnostic accompagne maintenant votre intervention.',
        4,
      );
      actions('Fermer', close, 'Nouveau diagnostic', reset);
      return;
    }
    if (session && session.state === 'analyzing') {
      execute(poll);
      return;
    }
    if (session && session.result) {
      if (session.result.questions.length) renderQuestions();
      else renderResult();
      return;
    }
    renderCompose();
  }
  function reset() {
    pausedDraft = null;
    remember(null);
    session = null;
    runId = null;
    clearFiles();
    draft = {
      description: '',
      city: draft.city,
      answers: {},
      safety: [],
      consent: false,
    };
    renderCompose();
  }
  async function open(context) {
    build();
    opener = context.opener || document.activeElement;
    API.setActive(true);
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('fxdiag-is-open');
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', fitViewport);
      window.visualViewport.addEventListener('scroll', fitViewport);
    }
    fitViewport();
    if (busy) return;
    var id = session ? session.id : remembered();
    if (id) {
      working('Ouverture de votre dossier…');
      try {
        restore((await API.api({ action: 'get', session_id: id })).session);
        var resume =
          pausedDraft &&
          pausedDraft.id === session.id &&
          pausedDraft.revision === session.revision &&
          !['bound', 'analyzing'].includes(session.state);
        if (resume) {
          draft = pausedDraft.draft;
          if (
            pausedDraft.page === 'questions' &&
            session.result?.questions.length
          )
            renderQuestions();
          else if (pausedDraft.page === 'safety') renderSafety();
          else renderCompose();
        } else renderState();
        pausedDraft = null;
      } catch (error) {
        current = 'unavailable';
        frame(
          'Retrouvons votre dossier',
          'La session utilisée doit être la même que lors de votre diagnostic.',
          1,
        );
        actions('Nouveau diagnostic', reset, 'Fermer', close);
        showError(error);
      }
    } else {
      var city = String(context.city || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-');
      draft.city = draft.city || (cities[city] ? city : '');
      draft.description =
        draft.description || String(context.description || '').slice(0, 2000);
      if (pausedDraft && pausedDraft.page === 'safety') renderSafety();
      else renderCompose();
      pausedDraft = null;
    }
    var title = node('fxdiag-title');
    if (title) title.focus();
  }
  window.FixeoDiagnosticModal = { open: open };
})();
