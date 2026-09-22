/* Lazy Diagnostic UI. One canonical intervention, with no Estimation handoff. */
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
    runId,
    footerObserver,
    layoutFrame,
    questionIndex = 0,
    confirmationPhone = '',
    criticalAcknowledgement = null,
    confirmationFailed = false,
    progress,
    progressRequestedFor;
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
    electricity:
      'Étincelles, odeur de brûlé, choc électrique ou eau sur l’installation électrique',
    gas: 'Odeur de gaz',
    fire: 'Flammes ou fumée importante',
    major_leak: 'Fuite d’eau incontrôlable',
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
    if (session && session.id !== s.id) {
      confirmationPhone = '';
      criticalAcknowledgement = null;
      progress = null;
      progressRequestedFor = null;
    }
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
      !busy &&
      ['compose', 'safety', 'questions', 'confirmation'].includes(current)
        ? {
            id: session && session.id,
            revision: session && session.revision,
            page: current,
            draft: JSON.parse(JSON.stringify(draft)),
          }
        : null;
    criticalAcknowledgement = null;
    dialog.close();
    document.body.classList.remove('fxdiag-is-open');
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', fitViewport);
      window.visualViewport.removeEventListener('scroll', fitViewport);
    }
    window.removeEventListener('resize', fitViewport);
    if (footerObserver) footerObserver.disconnect();
    if (layoutFrame) window.cancelAnimationFrame(layoutFrame);
    layoutFrame = null;
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
    queueLayout();
  }
  function queueLayout() {
    if (!dialog || !dialog.open || layoutFrame) return;
    layoutFrame = window.requestAnimationFrame(function () {
      layoutFrame = null;
      if (!dialog.open || window.innerWidth > 700) return;
      // Measure the actual actions, including Safari's safe-area padding.
      // The footer stays outside the scroller; this extra clearance lets the
      // last field and native selects scroll fully above it, even with a keyboard.
      var footerRect = footer.getBoundingClientRect();
      if (footerRect.height > 0) {
        dialog.style.setProperty(
          '--fxdiag-actions-height',
          Math.ceil(footerRect.height) + 'px',
        );
      }
      var focused = document.activeElement;
      if (
        !focused ||
        !body.contains(focused) ||
        !focused.matches('input, select, textarea')
      )
        return;
      var bodyRect = body.getBoundingClientRect();
      var top = bodyRect.top + 12;
      var bottom = Math.min(bodyRect.bottom, footerRect.top) - 12;
      if (bottom <= top) return;
      var field = focused.closest('.fxdiag-field') || focused;
      var rect = field.getBoundingClientRect();
      if (rect.height > bottom - top) rect = focused.getBoundingClientRect();
      // If the keyboard leaves less room than the input itself, keep its top
      // stable instead of alternating between top and bottom on each resize.
      if (rect.height > bottom - top) body.scrollTop += rect.top - top;
      else if (rect.bottom > bottom) body.scrollTop += rect.bottom - bottom;
      else if (rect.top < top) body.scrollTop -= top - rect.top;
    });
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
    if (window.ResizeObserver)
      footerObserver = new window.ResizeObserver(queueLayout);
    dialog.addEventListener('focusin', queueLayout);
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
    queueLayout();
  }
  function updateComposeAvailability() {
    if (current === 'critical' && node('fxdiag-next')) {
      node('fxdiag-next').disabled =
        busy || !node('fxdiag-critical-ack').checked;
      return;
    }
    if (current === 'confirmation' && node('fxdiag-next')) {
      var phone = phoneField().value.replace(/[\s().-]+/g, '');
      node('fxdiag-next').disabled =
        busy || !/^(\+212|0)[5-7][0-9]{8}$/.test(phone);
      return;
    }
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
    queueLayout();
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
    if (/INVALID_PHONE/.test(code))
      return 'Indiquez un numéro marocain valide pour le suivi.';
    if (/VALIDATION:/.test(code)) return code.slice(11);
    if (/SAFETY_ACKNOWLEDGEMENT_REQUIRED/.test(code))
      return 'Confirmez avoir pris connaissance des consignes de sécurité avant d’enregistrer votre demande.';
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
      if (current === 'confirmation') confirmationFailed = true;
      showError(error);
    } finally {
      busy = false;
      footer.removeAttribute('aria-busy');
      if (previousLabel && clicked.isConnected)
        clicked.innerHTML = previousLabel;
      footer.querySelectorAll('button').forEach(function (b) {
        b.disabled = false;
      });
      if (
        current === 'confirmation' &&
        confirmationFailed &&
        node('fxdiag-next')
      )
        node('fxdiag-next').textContent = 'Réessayer';
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
      var q = session.result.questions[questionIndex];
      var field = q && node('fxdiag-q-' + q.id);
      if (field && field.value.trim()) draft.answers[q.id] = field.value.trim();
    }
    if (current === 'confirmation' && phoneField())
      confirmationPhone = phoneField().value;
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
        '<p class="fxdiag-photo-status" id="fxdiag-photo-status" role="status" aria-live="polite">Aucune photo sélectionnée</p><div class="fxdiag-photo-meta"><p class="fxdiag-photo-help" id="fxdiag-photo-help">3 photos max. · 8 Mio / photo</p><details class="fxdiag-photo-details"><summary>Formats et vie privée</summary><div><p>Formats acceptés : JPEG, PNG ou WebP.</p>' +
        '<p class="fxdiag-privacy">Uniquement le problème : évitez visages, papiers d’identité et informations personnelles.</p><p>Les photos sélectionnées sont envoyées uniquement après votre accord et la confirmation de l’analyse.</p></div></details></div></div>' +
        '<div class="fxdiag-description-column"><div class="fxdiag-field"><label class="fxdiag-label" for="fxdiag-description">Que constatez-vous ?</label><textarea id="fxdiag-description" class="fxdiag-input" maxlength="2000" rows="3" placeholder="Par exemple : de l’eau coule sous mon lavabo…">' +
        esc(draft.description) +
        '</textarea><span class="fxdiag-field-help">Quelques mots suffisent, même sans photo.</span></div><div class="fxdiag-field"><label class="fxdiag-label" for="fxdiag-city">Ville d’intervention</label><select id="fxdiag-city" class="fxdiag-input"><option value="">Choisir ma ville</option>' +
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
      box.dataset.state = local ? 'selected' : item.state;
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
        stateLabel.textContent = local ? '✓ Sélectionnée' : '✓ Enregistrée';
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
    node('fxdiag-media').classList.toggle('has-photos', !!count);
    var readyCount =
      pending.length +
      (session
        ? session.media.filter(function (m) {
            return m.state === 'ready';
          }).length
        : 0);
    node('fxdiag-photo-status').textContent = readyCount
      ? readyCount +
        (readyCount > 1
          ? ' photos prêtes à analyser'
          : ' photo prête à analyser') +
        (count > readyCount ? ' · photo à renvoyer' : '')
      : count
        ? 'Photo à renvoyer'
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
  var quickAnswers = {
    onset: ['Aujourd’hui', 'Quelques jours', 'Plus longtemps'],
    affected_area: ['Mur', 'Plafond', 'Sol', 'Équipement'],
    occurrence: ['En continu', 'Par moments', 'À l’utilisation'],
  };
  function renderQuestions(index) {
    current = 'questions';
    var questions = session.result.questions;
    questionIndex = Math.max(
      0,
      Math.min(
        typeof index === 'number' ? index : questionIndex,
        questions.length - 1,
      ),
    );
    var q = questions[questionIndex],
      answered = false;
    frame(
      'Un détail peut nous aider',
      'Répondez en un tap, uniquement à partir de ce que vous savez déjà. Vous pouvez passer.',
      3,
    );
    body.insertAdjacentHTML(
      'beforeend',
      '<p class="fxdiag-tag">Question ' +
        (questionIndex + 1) +
        ' / ' +
        questions.length +
        ' · facultatif</p><h3 class="fxdiag-question-title">' +
        esc(q.label) +
        '</h3><div class="fxdiag-quick-answers" role="group" aria-label="' +
        esc(q.label) +
        '"></div>',
    );
    var choices =
      q.type === 'choice'
        ? [
            ['yes', 'Oui'],
            ['no', 'Non'],
            ['unknown', 'Je ne sais pas'],
          ]
        : (quickAnswers[q.id] || [])
            .map(function (label) {
              return [label, label];
            })
            .concat([['unknown', 'Je ne sais pas']]);
    async function answer(value) {
      if (answered) return;
      answered = true;
      draft.answers[q.id] = value || 'unknown';
      if (questionIndex + 1 < questions.length)
        renderQuestions(questionIndex + 1);
      else {
        questionIndex = 0;
        runId = null;
        await startAnalysis();
      }
    }
    choices.forEach(function (pair) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'fxdiag-quick-answer';
      button.textContent = pair[1];
      button.dataset.answer = pair[0];
      button.setAttribute(
        'aria-pressed',
        String(draft.answers[q.id] === pair[0]),
      );
      button.onclick = function () {
        execute(function () {
          return answer(pair[0]);
        });
      };
      body.querySelector('.fxdiag-quick-answers').appendChild(button);
    });
    if (q.type !== 'choice') {
      body.insertAdjacentHTML(
        'beforeend',
        '<button type="button" class="fxdiag-button quiet" id="fxdiag-other">Autre / Préciser</button><div class="fxdiag-field" id="fxdiag-optional-answer" hidden><label for="fxdiag-q-' +
          esc(q.id) +
          '">Votre précision (facultatif)</label><input class="fxdiag-input" id="fxdiag-q-' +
          esc(q.id) +
          '" maxlength="500"><button type="button" class="fxdiag-button quiet" id="fxdiag-save-answer">Valider cette précision</button></div>',
      );
      node('fxdiag-other').onclick = function () {
        if (busy) return;
        node('fxdiag-optional-answer').hidden = false;
        var field = node('fxdiag-q-' + q.id);
        field.value =
          draft.answers[q.id] && draft.answers[q.id] !== 'unknown'
            ? draft.answers[q.id]
            : '';
        field.focus();
        queueLayout();
      };
      node('fxdiag-save-answer').onclick = function () {
        execute(function () {
          return answer(node('fxdiag-q-' + q.id).value.trim());
        });
      };
    }
    actions(
      'Passer',
      function () {
        return answer('unknown');
      },
      'Retour',
      function () {
        capture();
        if (questionIndex > 0) renderQuestions(questionIndex - 1);
        else backToCompose();
      },
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
  function riskLabel(r) {
    return r.safety.level === 'CRITICAL'
      ? 'Priorité CRITICAL'
      : r.safety.level === 'URGENT' || r.urgency.value === 'high'
        ? 'Intervention rapide recommandée'
        : 'Intervention professionnelle recommandée';
  }
  function professional(r) {
    return (
      {
        plomberie: 'Plombier',
        electricite: 'Électricien',
        serrurerie: 'Serrurier',
        climatisation: 'Technicien climatisation / chauffage',
        menuiserie: 'Menuisier',
        peinture: 'Peintre',
        maconnerie: 'Maçon',
        jardinage: 'Jardinier',
        carrelage: 'Carreleur',
      }[r.trade.value] ||
      trades[r.trade.value] ||
      'Professionnel FIXEO'
    );
  }
  function safetyNotice(r) {
    return (
      '<section class="fxdiag-caution" role="alert"><h3>' +
      esc(riskLabel(r)) +
      '</h3><ul>' +
      (r.safety.messages || [])
        .map(function (text) {
          return '<li>' + esc(text) + '</li>';
        })
        .join('') +
      '</ul>' +
      (r.safety.stop
        ? '<p>FIXEO ne remplace jamais les secours. Mettez-vous à l’abri et contactez les services d’urgence locaux si nécessaire. N’attendez pas une réponse FIXEO face au danger.</p>'
        : '') +
      '</section>'
    );
  }
  function summary(r) {
    return (
      '<section class="fxdiag-result-top"><span class="fxdiag-tag">Métier recommandé · hypothèse FIXEO</span><h3>' +
      esc(professional(r)) +
      '</h3><p class="fxdiag-result-level">' +
      esc(riskLabel(r)) +
      '</p><p>' +
      esc(r.problem.value) +
      '</p></section>'
    );
  }
  function details(title, items) {
    if (!items.length) return '';
    return (
      '<details class="fxdiag-result-detail"><summary>' +
      esc(title) +
      '</summary>' +
      card(title, items) +
      '</details>'
    );
  }
  function renderResult() {
    current = 'result';
    var r = session.result;
    frame(
      r.safety.stop
        ? 'Votre sécurité passe en premier'
        : 'Votre diagnostic FIXEO',
      'Diagnostic indicatif, à confirmer par le professionnel.',
      4,
    );
    if (r.safety.stop) {
      body.insertAdjacentHTML('beforeend', safetyNotice(r));
      var canAcknowledge =
        r.safety.version === 'fixeo-risk-routing-v2' &&
        r.safety.level === 'CRITICAL' &&
        session.result_run_id;
      if (!canAcknowledge) {
        body.insertAdjacentHTML(
          'beforeend',
          '<p class="fxdiag-note">Le parcours de réservation est interrompu pour cette situation.</p>',
        );
        actions('Fermer', close);
        return;
      }
      current = 'critical';
      body.insertAdjacentHTML(
        'beforeend',
        summary(r) +
          '<p class="fxdiag-note">Une demande FIXEO peut être enregistrée après lecture de ces consignes. La sécurité des lieux et la disponibilité d’un intervenant restent à confirmer.</p><label class="fxdiag-consent"><input type="checkbox" id="fxdiag-critical-ack"><span>J’ai pris connaissance des consignes de mise à distance et je comprends que FIXEO ne remplace pas les secours.</span></label>',
      );
      node('fxdiag-critical-ack').checked =
        criticalAcknowledgement === session.result_run_id;
      actions(
        'Demander l’intervention FIXEO',
        function () {
          if (!node('fxdiag-critical-ack').checked)
            throw new Error('SAFETY_ACKNOWLEDGEMENT_REQUIRED');
          criticalAcknowledgement = session.result_run_id;
          return beginConfirmation();
        },
        'Fermer',
        close,
      );
      node('fxdiag-critical-ack').addEventListener(
        'change',
        updateComposeAvailability,
      );
      updateComposeAvailability();
      return;
    }
    body.insertAdjacentHTML('beforeend', summary(r));
    if (
      r.safety.level === 'URGENT' ||
      (r.safety.signals || []).includes('electrical_risk')
    )
      body.insertAdjacentHTML('beforeend', safetyNotice(r));
    body.insertAdjacentHTML(
      'beforeend',
      '<div class="fxdiag-cards">' +
        details(
          'Observé sur la photo',
          r.facts.filter(function (f) {
            return f.provenance === 'observed';
          }),
        ) +
        details(
          'Votre description et vos réponses',
          r.facts.filter(function (f) {
            return ['user_declared', 'user_confirmed'].includes(f.provenance);
          }),
        ) +
        details('Hypothèses FIXEO', r.hypotheses) +
        details('Pièces éventuellement concernées', r.possible_parts) +
        details('Précautions et limites', r.checks) +
        '</div>',
    );
    actions(
      'Demander l’intervention FIXEO',
      beginConfirmation,
      'Modifier',
      backToCompose,
    );
  }
  function phoneField() {
    return node('fxdiag-confirm-phone') || node('fxdiag-critical-phone');
  }
  async function beginConfirmation() {
    var context = await API.api({
      action: 'confirmation_context',
      session_id: session.id,
      revision: session.revision,
      run_id: session.result_run_id,
    });
    if (context.progress) {
      session.state = 'bound';
      session.request_id = context.progress.request_id;
      progress = context.progress;
      renderBound();
      return;
    }
    if (!confirmationPhone) confirmationPhone = context.client_phone || '';
    renderConfirmation(!!context.client_phone);
  }
  function renderConfirmation(knownContact) {
    var r = session.result;
    if (r.safety.stop && criticalAcknowledgement !== session.result_run_id)
      return renderResult();
    current = 'confirmation';
    confirmationFailed = false;
    frame(
      'Confirmez votre intervention',
      'Tout est déjà dans votre dossier. Il reste seulement à confirmer votre demande.',
      4,
    );
    body.insertAdjacentHTML(
      'beforeend',
      summary(r) +
        '<p class="fxdiag-confirm-city"><span>Ville d’intervention</span><strong>' +
        esc(cities[session.city_slug] || session.city_slug) +
        '</strong></p>',
    );
    if (r.safety.stop) body.insertAdjacentHTML('beforeend', safetyNotice(r));
    var phoneId = r.safety.stop
      ? 'fxdiag-critical-phone'
      : 'fxdiag-confirm-phone';
    body.insertAdjacentHTML(
      'beforeend',
      '<div class="fxdiag-field"><label for="' +
        phoneId +
        '">Téléphone pour le suivi</label>' +
        (knownContact
          ? '<p id="fxdiag-known-phone">' +
            esc(confirmationPhone) +
            '</p><button type="button" class="fxdiag-button quiet" id="fxdiag-edit-phone">Modifier le numéro</button>'
          : '') +
        '<input class="fxdiag-input" id="' +
        phoneId +
        '" type="tel" inputmode="tel" autocomplete="tel" maxlength="24" placeholder="06 XX XX XX XX" value="' +
        esc(confirmationPhone) +
        '"' +
        (knownContact ? ' hidden' : '') +
        '></div><p class="fxdiag-privacy">Votre diagnostic et vos photos accompagnent cette demande. Le professionnel confirmera l’intervention et son prix avec vous.</p>',
    );
    phoneField().addEventListener('input', function () {
      confirmationPhone = phoneField().value;
      updateComposeAvailability();
    });
    if (node('fxdiag-edit-phone'))
      node('fxdiag-edit-phone').onclick = function () {
        phoneField().hidden = false;
        node('fxdiag-known-phone').hidden = true;
        node('fxdiag-edit-phone').hidden = true;
        phoneField().focus();
        queueLayout();
      };
    actions(
      'Confirmer ma demande',
      async function () {
        capture();
        var response = await API.api({
          action: 'confirm_intervention',
          session_id: session.id,
          revision: session.revision,
          run_id: session.result_run_id,
          client_phone: confirmationPhone,
          ...(r.safety.stop
            ? {
                acknowledgement: {
                  accepted: criticalAcknowledgement === session.result_run_id,
                  version: 'fixeo-critical-ack-v1',
                  run_id: session.result_run_id,
                },
              }
            : {}),
        });
        if (API.saveTracking) API.saveTracking(response);
        session.state = 'bound';
        session.request_id = response.request_id;
        session.request_ref = response.tracking_ref;
        progress = response.progress;
        renderBound();
      },
      'Retour',
      function () {
        capture();
        renderResult();
      },
    );
  }
  async function refreshProgress() {
    var response = await API.api({
      action: 'intervention_status',
      session_id: session.id,
    });
    progress = response.progress;
    renderBound();
  }
  function renderBound() {
    current = 'bound';
    var r = session.result,
      critical = r && r.safety.level === 'CRITICAL';
    var state = progress || { stage: 'registered', sync_pending: true };
    var messages = {
      registered: state.sync_pending
        ? 'Votre demande est enregistrée. Le suivi est momentanément indisponible ; votre demande reste conservée.'
        : 'Votre demande est enregistrée. La recherche d’un artisan adapté doit être poursuivie.',
      dispatch_prepared:
        'Des artisans ont été identifiés. La notification reste à envoyer ; aucun artisan n’est encore confirmé.',
      notification_sent:
        'Une notification a été envoyée. L’acceptation d’un artisan reste à confirmer.',
      artisan_confirmed: 'Un artisan a confirmé votre demande.',
      intervention: 'Votre intervention est en cours.',
      completed: 'Votre intervention est terminée.',
      cancelled: 'Cette demande est annulée.',
    };
    frame(
      critical
        ? 'Demande critique enregistrée'
        : 'FIXEO prend en charge votre intervention',
      messages[state.stage] || messages.registered,
      4,
    );
    if (critical) body.insertAdjacentHTML('beforeend', safetyNotice(r));
    if (r)
      body.insertAdjacentHTML(
        'beforeend',
        '<p class="fxdiag-tag">' + esc(riskLabel(r)) + '</p>',
      );
    var confirmed = ['artisan_confirmed', 'intervention', 'completed'].includes(
      state.stage,
    );
    var inProgress = ['intervention', 'completed'].includes(state.stage);
    var steps = [
      ['Demande enregistrée', true],
      ['Recherche d’un artisan', confirmed],
      ['Artisan confirmé', confirmed],
      ['Intervention', state.stage === 'completed'],
    ];
    body.insertAdjacentHTML(
      'beforeend',
      '<ol class="fxdiag-lifecycle" aria-label="Suivi de votre intervention">' +
        steps
          .map(function (step, i) {
            var active = !step[1] && (i === 1 || (i === 3 && inProgress));
            return (
              '<li class="' +
              (step[1] ? 'done' : '') +
              '"' +
              (active ? ' aria-current="step"' : '') +
              '><span aria-hidden="true">' +
              (step[1] ? '✓' : i + 1) +
              '</span>' +
              esc(step[0]) +
              '</li>'
            );
          })
          .join('') +
        '</ol>' +
        (state.tracking_ref || session.request_ref
          ? '<p class="fxdiag-note">Référence : ' +
            esc(state.tracking_ref || session.request_ref) +
            '</p>'
          : '') +
        (state.notification === 'failed'
          ? '<p class="fxdiag-note">L’envoi de la notification a échoué. Votre demande reste enregistrée.</p>'
          : '') +
        '<p class="fxdiag-privacy">Une préparation de notification ne signifie pas qu’un artisan a été contacté. L’intervention est confirmée uniquement après acceptation.</p>',
    );
    body.insertAdjacentHTML(
      'beforeend',
      '<button type="button" class="fxdiag-button quiet" id="fxdiag-new-diagnostic">Nouveau diagnostic</button>',
    );
    node('fxdiag-new-diagnostic').onclick = function () {
      execute(reset);
    };
    actions('Actualiser le suivi', refreshProgress, 'Fermer', close);
    if (!progress && progressRequestedFor !== session.id) {
      progressRequestedFor = session.id;
      API.api({ action: 'intervention_status', session_id: session.id })
        .then(function (response) {
          if (current === 'bound' && dialog.open) {
            progress = response.progress;
            renderBound();
          }
        })
        .catch(function () {});
    }
  }
  function renderState() {
    if (session && session.state === 'bound') {
      renderBound();
      return;
    }
    if (session && session.state === 'analyzing') {
      execute(poll);
      return;
    }
    if (session && session.result) {
      if (session.result.questions.length) {
        questionIndex = 0;
        renderQuestions();
      } else renderResult();
      return;
    }
    renderCompose();
  }
  function reset() {
    confirmationPhone = '';
    criticalAcknowledgement = null;
    progress = null;
    progressRequestedFor = null;
    questionIndex = 0;
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
    window.addEventListener('resize', fitViewport);
    if (footerObserver) footerObserver.observe(footer);
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
          else if (pausedDraft.page === 'confirmation' && session.result)
            renderConfirmation(false);
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
