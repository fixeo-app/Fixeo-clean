/* Accepted-partner access only; every open rechecks server authorization. */
(function () {
  'use strict';
  var modal, content, trigger;
  var gate = document.createElement('style');
  gate.textContent =
    '[data-fixeo-diagnostic-mission]{display:none!important}.fxdiag-context-enabled [data-fixeo-diagnostic-mission]{display:inline-flex!important}';
  document.head.appendChild(gate);
  fetch('/api/diagnostic-v1', { cache: 'no-store' })
    .then(function (r) {
      return r.json();
    })
    .then(function (c) {
      if (c.context_enabled)
        document.documentElement.classList.add('fxdiag-context-enabled');
    })
    .catch(function () {});
  function paragraph(parent, value) {
    var p = document.createElement('p');
    p.textContent = value;
    parent.appendChild(p);
    return p;
  }
  function close() {
    modal.close();
    content.replaceChildren();
    if (trigger && trigger.isConnected) trigger.focus();
  }
  function build() {
    if (modal) return;
    modal = document.createElement('dialog');
    modal.style.cssText =
      'max-width:650px;width:calc(100% - 32px);max-height:85dvh;overflow:auto;border:1px solid #425271;border-radius:18px;padding:24px;color:#eef3fc;background:#131d30';
    var title = document.createElement('h2');
    title.id = 'fxdiag-mission-title';
    title.textContent = 'Diagnostic FIXEO';
    modal.setAttribute('aria-labelledby', title.id);
    modal.appendChild(title);
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'fxa-btn fxa-btn-ghost';
    button.textContent = 'Fermer';
    button.onclick = close;
    modal.appendChild(button);
    content = document.createElement('div');
    modal.appendChild(content);
    modal.addEventListener('cancel', function (e) {
      e.preventDefault();
      close();
    });
    document.body.appendChild(modal);
  }
  async function open(button) {
    trigger = button;
    build();
    content.replaceChildren();
    paragraph(content, 'Vérification de votre accès…');
    modal.showModal();
    try {
      var sb = await window.FixeoSupabase.getClient();
      var auth = await sb.auth.getSession();
      if (auth.error || !auth.data.session) throw new Error('AUTH_REQUIRED');
      var response = await fetch('/api/diagnostic-v1', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'x-fixeo-diagnostic': '1',
          Authorization: 'Bearer ' + auth.data.session.access_token,
        },
        body: JSON.stringify({
          action: 'mission_context',
          mission_id: button.dataset.fixeoDiagnosticMission,
        }),
        signal: AbortSignal.timeout(20000),
      });
      var result = await response.json();
      if (!response.ok || !result.ok) throw new Error('ACCESS_UNAVAILABLE');
      if (!modal.open) return;
      content.replaceChildren();
      var ctx = result.context;
      if (!ctx.result) {
        paragraph(
          content,
          'Aucun diagnostic client n’est associé à cette mission.',
        );
        return;
      }
      paragraph(
        content,
        'Diagnostic indicatif : votre vérification sur place reste nécessaire.',
      );
      paragraph(content, 'Déclaration client : ' + ctx.input.description);
      if (ctx.result.trade)
        paragraph(
          content,
          'Métier recommandé : ' + ctx.result.trade.value + ' (hypothèse)',
        );
      if (ctx.result.problem)
        paragraph(
          content,
          'Problème probable : ' + ctx.result.problem.value + ' (hypothèse)',
        );
      var source = {
        observed: 'Observation sur photo',
        user_declared: 'Déclaration client',
        user_confirmed: 'Confirmation client',
        ai_inferred: 'Hypothèse IA',
      };
      (ctx.result.facts || [])
        .filter(function (f) {
          return f.key !== 'description';
        })
        .forEach(function (f) {
          paragraph(
            content,
            (source[f.provenance] || 'À vérifier') + ' : ' + f.value,
          );
        });
      paragraph(
        content,
        'Urgence : ' +
          ctx.result.safety.urgency +
          ' — ' +
          (ctx.result.urgency.reason || 'À confirmer'),
      );
      if (ctx.result.possible_parts.length)
        paragraph(
          content,
          'Pièces possibles, à confirmer : ' +
            ctx.result.possible_parts
              .map(function (p) {
                return p.value;
              })
              .join(', '),
        );
      if (ctx.booking?.qualification_answers?.length)
        paragraph(
          content,
          ctx.booking.qualification_answers.length +
            ' précisions de périmètre confirmées par le client lors de la réservation.',
        );
      if (ctx.pricing)
        paragraph(
          content,
          'Prix FIXEO confirmé : ' +
            ctx.pricing.amount_mad +
            ' MAD. Le périmètre réservé reste à respecter.',
        );
      (ctx.photos || []).forEach(function (photo) {
        var img = document.createElement('img');
        img.src = photo.url;
        img.alt = 'Photo du problème transmise par le client';
        img.referrerPolicy = 'no-referrer';
        img.style.cssText =
          'width:100%;max-height:360px;object-fit:contain;border-radius:12px;margin-top:12px';
        content.appendChild(img);
      });
      if (ctx.photos.length)
        paragraph(
          content,
          'Accès temporaire aux photos. Rouvrez ce panneau si une image a expiré.',
        );
    } catch (_) {
      if (modal.open) {
        content.replaceChildren();
        paragraph(
          content,
          'Ce contexte est indisponible. Il est réservé au partenaire ayant accepté la mission. Vous pouvez réessayer en rouvrant ce panneau.',
        );
      }
    }
  }
  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-fixeo-diagnostic-mission]');
    if (button && !modal?.open) open(button);
  });
})();
