/* FIXEO universal intake: one existing Diagnostic dossier, one canonical request.
 * This controller renders the Hero only. It never classifies risk, prices work,
 * creates a parallel request, selects artisans or fabricates lifecycle events. */
(function () {
  "use strict";
  if (window.FixeoHeroFlagship) return;
  var root,
    content,
    intake,
    state = "need",
    busy = false,
    phone = "",
    acknowledgedRun = null;
  var questionIndex = 0,
    optionalOpen = false,
    estimateContext,
    estimateRevision,
    cityTimer,
    mounted = false;
  var recorder,
    stream,
    recordingTimer,
    transcribing = false;
  var STATES = Object.freeze({
    NEED: "need",
    ANALYSIS: "analysis",
    CONFIRMATION: "confirmation",
    MATCHING: "matching",
    DISPATCHING: "dispatching",
    ACCEPTANCE: "acceptance",
    MISSION: "mission",
  });
  var cities = {
    casablanca: "Casablanca",
    rabat: "Rabat",
    marrakech: "Marrakech",
    fes: "Fès",
    tanger: "Tanger",
    agadir: "Agadir",
    meknes: "Meknès",
    oujda: "Oujda",
    kenitra: "Kénitra",
    tetouan: "Tétouan",
    sale: "Salé",
    temara: "Témara",
    "el-jadida": "El Jadida",
    "beni-mellal": "Béni Mellal",
    nador: "Nador",
    khouribga: "Khouribga",
    safi: "Safi",
    taza: "Taza",
    ouarzazate: "Ouarzazate",
    mohammedia: "Mohammedia",
  };
  var trades = {
    plomberie: "Plombier",
    electricite: "Électricien",
    serrurerie: "Serrurier",
    climatisation: "Technicien climatisation / chauffage",
    bricolage: "Professionnel du bricolage",
    menuiserie: "Menuisier",
    peinture: "Peintre",
    maconnerie: "Maçon",
    nettoyage: "Professionnel du nettoyage",
    jardinage: "Jardinier",
    demenagement: "Déménageur",
    carrelage: "Carreleur",
    autre: "Professionnel FIXEO · métier à préciser",
  };
  var hazards = {
    electricity:
      "Étincelles, odeur de brûlé, choc électrique ou eau sur l’installation électrique",
    gas: "Odeur de gaz",
    fire: "Flammes ou fumée importante",
    major_leak: "Fuite d’eau incontrôlable",
    flood: "Eau qui se propage / inondation",
    structure: "Affaissement ou risque de chute",
    immediate_danger: "Autre danger immédiat",
  };
  var micIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="8" y="3" width="8" height="12" rx="4"/><path d="M6 12a6 6 0 0 0 12 0M12 18v3M9 21h6"/></svg>';
  var cameraIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/></svg>';
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }
  function node(id) {
    return root.querySelector("#" + id);
  }
  function slug(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-");
  }
  function status(text) {
    var el = node("fxhf-status");
    if (el) el.textContent = text;
  }
  function frame(next, title, subtitle) {
    clearTimeout(cityTimer);
    state = next;
    root.dataset.fxhfState = next;
    content.innerHTML =
      '<div class="fxhf-eyebrow">RAFI · Assistant FIXEO</div><h2 class="fxhf-title" tabindex="-1">' +
      esc(title) +
      "</h2>" +
      (subtitle ? '<p class="fxhf-subtitle">' + esc(subtitle) + "</p>" : "") +
      '<div id="fxhf-panel"></div><p id="fxhf-status" class="fxhf-status" role="status"></p><div id="fxhf-actions" class="fxhf-actions"></div>';
  }
  function panel(html) {
    node("fxhf-panel").insertAdjacentHTML("beforeend", html);
  }
  function button(label, callback, secondary, id) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = secondary ? "fxhf-secondary" : "fxhf-submit";
    b.textContent = label;
    if (id) b.id = id;
    b.onclick = function () {
      execute(callback);
    };
    node("fxhf-actions").appendChild(b);
    return b;
  }
  var errors = {
    INVALID_PHOTO: "Choisissez une photo JPEG, PNG ou WebP de 8 Mio maximum.",
    PHOTO_LIMIT: "Vous pouvez ajouter 3 photos maximum.",
    DIAGNOSTIC_QUOTA_EXCEEDED:
      "La limite d’analyse est atteinte. Votre besoin est conservé ; réessayez après son renouvellement.",
    DIAGNOSTIC_NOT_FOUND:
      "Ce dossier n’est plus disponible dans cette session. Vous pouvez commencer un nouveau besoin.",
    AUTH_REQUIRED:
      "Reconnectez-vous avec le même compte pour retrouver ce dossier.",
    UPLOAD_FAILED:
      "L’envoi de la photo a été interrompu. Elle est conservée ; réessayez.",
    ANALYSIS_RUNNING:
      "L’analyse continue. Réessayez pour retrouver son résultat.",
    INVALID_PHONE:
      "Saisissez un numéro marocain valide, par exemple 06 XX XX XX XX.",
  };
  function showError(error) {
    var old = node("fxhf-error");
    if (old) old.remove();
    var el = document.createElement("p");
    el.id = "fxhf-error";
    el.className = "fxhf-error";
    el.setAttribute("role", "alert");
    el.textContent =
      errors[error.message] ||
      "L’opération n’a pas abouti. Vos informations sont conservées. Réessayez.";
    node("fxhf-actions").before(el);
  }
  async function execute(task) {
    if (busy || transcribing || recorder?.state === "recording") return;
    busy = true;
    root.setAttribute("aria-busy", "true");
    root.querySelectorAll("button").forEach(function (b) {
      b.disabled = true;
    });
    try {
      await task();
    } catch (error) {
      if (state === "analysis") {
        frame(
          "retry",
          "Votre besoin est conservé.",
          "Reprenons exactement là où nous en étions.",
        );
        button("Réessayer", analyze);
        button("Modifier mon besoin", renderNeed, true);
      }
      showError(error);
    } finally {
      busy = false;
      root.removeAttribute("aria-busy");
      root.querySelectorAll("button").forEach(function (b) {
        b.disabled = false;
      });
      availability();
    }
  }
  function capture() {
    if (node("fxhf-need-input"))
      intake.draft.description = node("fxhf-need-input").value.trim();
    if (node("fxhf-location")) intake.draft.city = node("fxhf-location").value;
    if (node("fxhf-consent"))
      intake.draft.consent = node("fxhf-consent").checked;
    if (node("fxhf-phone")) phone = node("fxhf-phone").value;
  }
  function readyPhotos() {
    return (intake.session?.media || []).filter(function (m) {
      return m.state === "ready";
    });
  }
  function availability() {
    var submit = node("fxhf-submit");
    if (submit)
      submit.disabled =
        busy ||
        transcribing ||
        recorder?.state === "recording" ||
        !cities[intake.draft.city] ||
        !intake.draft.consent ||
        (!intake.draft.description &&
          !intake.pending.length &&
          !readyPhotos().length);
    var confirm = node("fxhf-confirm");
    if (confirm)
      confirm.disabled =
        busy ||
        !/^(\+212|0)[5-7][0-9]{8}$/.test(phone.replace(/[\s().-]+/g, ""));
    var entrust = node("fxhf-entrust");
    if (entrust)
      entrust.disabled =
        busy ||
        (intake.session.result.safety.stop &&
          acknowledgedRun !== intake.session.result_run_id);
  }
  function renderNeed() {
    frame(
      "need",
      "Que se passe-t-il ?",
      "Décrivez, dites ou montrez votre problème. FIXEO s’occupe de la suite.",
    );
    panel(
      '<div class="fxhf-location"><label for="fxhf-location">Ville d’intervention</label><select id="fxhf-location" class="fxhf-location-select" aria-label="Choisir ou modifier la ville"><option value="">Choisir ma ville</option>' +
        Object.keys(cities)
          .map(function (c) {
            return (
              '<option value="' +
              c +
              '"' +
              (c === intake.draft.city ? " selected" : "") +
              ">" +
              cities[c] +
              "</option>"
            );
          })
          .join("") +
        "</select></div>" +
        '<div class="fxhf-need-field"><textarea id="fxhf-need-input" class="fxhf-need-input" rows="3" maxlength="2000" placeholder="Décrivez votre problème…" aria-label="Décrivez votre problème ou votre besoin">' +
        esc(intake.draft.description) +
        '</textarea><div class="fxhf-voice-bar"><button type="button" class="fxhf-mic" id="fxhf-mic">' +
        micIcon +
        'Parler à RAFI</button><button type="button" class="fxhf-mic" id="fxhf-show" aria-expanded="false" aria-controls="fxhf-photo-choices">' +
        cameraIcon +
        'Montrer à RAFI</button><select id="fxhf-speech-lang" class="fxhf-speech-lang" aria-label="Langue de reconnaissance vocale"><option value="fr-FR">FR</option><option value="ar-MA">الدارجة</option></select></div></div>' +
        '<div id="fxhf-photo-choices" class="fxhf-photo-choices" hidden><button type="button" id="fxhf-camera" class="fxhf-secondary">Prendre une photo</button><button type="button" id="fxhf-library" class="fxhf-secondary">Photothèque / fichiers</button><input id="fxhf-files" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden><input id="fxhf-camera-file" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden><p>3 photos max. · 8 Mio / photo · JPEG, PNG, WebP.<br>Évitez visages, papiers d’identité et informations personnelles.</p></div><div id="fxhf-photos" class="fxhf-photos"></div><p id="fxhf-understanding" class="fxhf-understanding"></p>' +
        '<label class="fxhf-consent"><input type="checkbox" id="fxhf-consent"' +
        (intake.draft.consent ? " checked" : "") +
        '><span>J’accepte l’analyse par FIXEO et son fournisseur IA.</span></label><details class="fxhf-privacy"><summary>Comment mes informations sont protégées</summary><p>Ma description et mes photos servent à préparer mon intervention. Les photos sont envoyées uniquement après mon accord et le lancement de l’analyse.</p><p>Suppression programmée : dossier sans réservation après 24 h ; photos liées à une intervention après 90 jours au plus, ou 30 jours après clôture ; contexte de l’intervention après 180 jours.</p><a href="/confidentialite.html" target="_blank" rel="noopener">Politique de confidentialité</a></details>',
    );
    ["fxhf-need-input", "fxhf-location", "fxhf-consent"].forEach(function (id) {
      node(id).oninput = node(id).onchange = function () {
        capture();
        availability();
      };
    });
    node("fxhf-need-input").addEventListener("input", function () {
      var text = intake.draft.description;
      var normalized = window.FixeoRafiLanguage?.normalize
        ? window.FixeoRafiLanguage.normalize(text)
        : text;
      var hint = window.FixeoAIRE?.detect?.(normalized);
      node("fxhf-understanding").textContent = hint?.cat
        ? "Besoin évoqué : " +
          (trades[hint.cat] || hint.cat) +
          " · à confirmer par RAFI"
        : "";
    });
    node("fxhf-show").onclick = function () {
      var choices = node("fxhf-photo-choices");
      choices.hidden = !choices.hidden;
      this.setAttribute("aria-expanded", String(!choices.hidden));
    };
    node("fxhf-camera").onclick = function () {
      node("fxhf-camera-file").click();
    };
    node("fxhf-library").onclick = function () {
      node("fxhf-files").click();
    };
    ["fxhf-files", "fxhf-camera-file"].forEach(function (id) {
      node(id).onchange = function (e) {
        try {
          intake.addFiles(e.target.files);
        } catch (error) {
          showError(error);
        }
        e.target.value = "";
        renderPhotos();
        availability();
      };
    });
    node("fxhf-mic").onclick = record;
    button(
      "Laisser RAFI comprendre",
      function () {
        capture();
        renderSafety();
      },
      false,
      "fxhf-submit",
    );
    panel('<p class="fxhf-note">Aucune demande n’est créée à cette étape.</p>');
    renderPhotos();
    availability();
    var attempts = 0;
    function detectCity() {
      if (state !== "need" || intake.draft.city) return;
      var city = slug(
        window.FIXEO_DETECTED_CITY ||
          document.getElementById("qsm-select-city")?.value,
      );
      if (cities[city]) {
        intake.draft.city = city;
        node("fxhf-location").value = city;
        availability();
      } else if (++attempts < 40)
        cityTimer = window.setTimeout(detectCity, 200);
    }
    detectCity();
  }
  function renderPhotos() {
    var target = node("fxhf-photos");
    if (!target) return;
    target.replaceChildren();
    function photo(item, index, remote) {
      var figure = document.createElement("figure");
      figure.className = "fxhf-photo";
      var image = document.createElement("img");
      image.alt = "Photo du problème";
      image.width = 96;
      image.height = 80;
      if (!remote) image.src = item.url;
      else
        window.FixeoDiagnostic.api({
          action: "media_url",
          session_id: intake.id,
          media_id: item.id,
        })
          .then(function (response) {
            if (image.isConnected) image.src = response.url;
          })
          .catch(function () {
            image.alt = "Photo privée conservée";
          });
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "fxhf-photo-remove";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "Retirer la photo " + (index + 1));
      remove.onclick = function () {
        execute(async function () {
          await intake.remove(index, remote ? item.id : null);
          renderPhotos();
        });
      };
      figure.append(image, remove);
      target.appendChild(figure);
    }
    intake.pending.forEach(function (item, index) {
      photo(item, index, false);
    });
    readyPhotos().forEach(function (item, index) {
      photo(item, index, true);
    });
    var count = intake.pending.length + readyPhotos().length;
    if (count) {
      var label = document.createElement("p");
      label.className = "fxhf-photo-ready";
      label.textContent =
        count +
        (count === 1 ? " photo prête à analyser" : " photos prêtes à analyser");
      target.appendChild(label);
    }
  }
  function renderSafety() {
    frame(
      "safety",
      "D’abord, votre sécurité.",
      "Sans vous approcher du danger, avez-vous déjà constaté l’un de ces signes ?",
    );
    panel(
      '<div class="fxhf-hazards">' +
        Object.keys(hazards)
          .map(function (key) {
            return (
              '<label><input type="checkbox" value="' +
              key +
              '"' +
              (intake.draft.safety_signals.includes(key) ? " checked" : "") +
              "><span>" +
              hazards[key] +
              "</span></label>"
            );
          })
          .join("") +
        '</div><p class="fxhf-note">Ne faites aucune manipulation pour vérifier. En cas de doute, gardez vos distances. L’absence de signe déclaré ne garantit pas l’absence de danger.</p>',
    );
    function captureSafety() {
      intake.draft.safety_signals = Array.from(
        root.querySelectorAll(".fxhf-hazards input:checked"),
      ).map(function (el) {
        return el.value;
      });
    }
    button("RAFI comprend mon besoin", function () {
      captureSafety();
      return analyze();
    });
    button(
      "Retour",
      function () {
        captureSafety();
        renderNeed();
      },
      true,
    );
  }
  async function analyze() {
    frame(
      "analysis",
      "RAFI comprend votre besoin…",
      "Vos informations restent dans le même dossier sécurisé.",
    );
    await intake.analyze();
    questionIndex = 0;
    renderState();
  }
  function renderQuestions() {
    var questions = intake.session.result.questions,
      q = questions[questionIndex];
    frame(
      "questions",
      "Un détail peut nous aider.",
      "Une réponse en un tap, uniquement à partir de ce que vous savez déjà.",
    );
    panel(
      '<p class="fxhf-note">Question ' +
        (questionIndex + 1) +
        " / " +
        questions.length +
        ' · facultatif</p><h3 class="fxhf-question">' +
        esc(q.label) +
        '</h3><div class="fxhf-answers"></div>',
    );
    var choices =
      q.type === "choice"
        ? [
            ["yes", "Oui"],
            ["no", "Non"],
            ["unknown", "Je ne sais pas"],
          ]
        : (
            {
              onset: ["Aujourd’hui", "Quelques jours", "Plus longtemps"],
              affected_area: ["Mur", "Plafond", "Sol", "Équipement"],
              occurrence: ["En continu", "Par moments", "À l’utilisation"],
            }[q.id] || []
          )
            .map(function (x) {
              return [x, x];
            })
            .concat([["unknown", "Je ne sais pas"]]);
    choices.forEach(function (pair) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "fxhf-answer";
      b.textContent = pair[1];
      b.dataset.answer = pair[0];
      b.setAttribute(
        "aria-pressed",
        String(intake.draft.answers[q.id] === pair[0]),
      );
      b.onclick = function () {
        execute(async function () {
          intake.draft.answers[q.id] = pair[0];
          if (++questionIndex < questions.length) renderQuestions();
          else await analyze();
        });
      };
      root.querySelector(".fxhf-answers").appendChild(b);
    });
    button(
      "Retour",
      function () {
        if (questionIndex) {
          questionIndex--;
          renderQuestions();
        } else renderNeed();
      },
      true,
    );
  }
  function priority() {
    return {
      TECHNICAL: "Intervention professionnelle recommandée",
      URGENT: "Urgente · intervention rapide recommandée",
      CRITICAL: "Critique · sécurité immédiate prioritaire",
    }[intake.session.result.safety.level];
  }
  function summary() {
    var s = intake.session,
      r = s.result;
    return (
      '<dl class="fxhf-summary"><div><dt>Métier recommandé</dt><dd>' +
      esc(trades[r.trade.value] || r.trade.value) +
      "</dd></div><div><dt>Ville</dt><dd>" +
      esc(cities[s.city_slug] || s.city_slug) +
      '</dd></div><div class="fxhf-summary-wide"><dt>Besoin · analyse indicative</dt><dd>' +
      esc(r.problem.value) +
      '</dd></div><div class="fxhf-summary-wide"><dt>Priorité</dt><dd>' +
      esc(priority()) +
      "</dd></div></dl>"
    );
  }
  function safetyNotice() {
    var safety = intake.session.result.safety;
    if (
      !safety.stop &&
      safety.level !== "URGENT" &&
      !safety.signals?.includes("electrical_risk")
    )
      return "";
    return (
      '<section class="fxhf-caution" role="alert"><strong>' +
      esc(priority()) +
      "</strong><ul>" +
      (safety.messages || [])
        .map(function (message) {
          return "<li>" + esc(message) + "</li>";
        })
        .join("") +
      "</ul>" +
      (safety.stop
        ? "<p>FIXEO ne remplace jamais les secours. Mettez-vous à l’abri et contactez les services d’urgence locaux si nécessaire. N’attendez pas une réponse FIXEO face au danger.</p>"
        : "") +
      "</section>"
    );
  }
  function renderResult() {
    var s = intake.session,
      critical = s.result.safety.stop;
    frame(
      "result",
      critical ? "Votre sécurité passe en premier." : "RAFI a compris.",
      critical
        ? ""
        : "Voici ce que FIXEO a compris. Le professionnel confirmera sur place.",
    );
    if (critical) panel(safetyNotice());
    panel(summary());
    if (!critical) panel(safetyNotice());
    if (critical) {
      panel(
        '<label class="fxhf-consent"><input type="checkbox" id="fxhf-critical-ack"' +
          (acknowledgedRun === s.result_run_id ? " checked" : "") +
          "><span>J’ai pris connaissance des consignes de mise à distance et je comprends que FIXEO ne remplace pas les secours.</span></label>",
      );
      node("fxhf-critical-ack").onchange = function () {
        acknowledgedRun = this.checked ? s.result_run_id : null;
        availability();
      };
      if (
        s.result.safety.version !== "fixeo-risk-routing-v2" ||
        s.result.safety.level !== "CRITICAL" ||
        !s.result_run_id
      )
        return;
    }
    button(
      "Confier cette intervention à FIXEO",
      beginConfirmation,
      false,
      "fxhf-entrust",
    );
    button(
      "Voir le diagnostic",
      async function () {
        optionalOpen = true;
        await window.FixeoDiagnostic.open({
          session_id: intake.id,
          opener: node("fxhf-diagnostic"),
        });
      },
      true,
      "fxhf-diagnostic",
    );
    if (!critical)
      button(
        "Voir une estimation",
        async function () {
          if (
            !estimateContext ||
            estimateRevision !== intake.session.revision
          ) {
            estimateContext = await intake.estimation();
            estimateRevision = intake.session.revision;
          }
          optionalOpen = true;
          await window.FixeoEstimatorV2.open(estimateContext);
        },
        true,
        "fxhf-estimation",
      );
    button("Modifier mon besoin", renderNeed, true);
    availability();
  }
  async function beginConfirmation() {
    if (
      intake.session.result.safety.stop &&
      acknowledgedRun !== intake.session.result_run_id
    )
      return renderResult();
    var context = await intake.confirmation();
    if (context.progress) return renderBound();
    if (!phone) phone = context.client_phone || "";
    if (
      intake.session.result.safety.stop &&
      acknowledgedRun !== intake.session.result_run_id
    )
      return renderResult();
    renderConfirmation(!!context.client_phone);
  }
  function renderConfirmation(known) {
    frame(
      "confirmation",
      "Confirmez votre demande.",
      "Tout est déjà dans votre dossier. FIXEO organise la suite.",
    );
    panel(
      summary() +
        safetyNotice() +
        '<div class="fxhf-contact"><label for="fxhf-phone">Téléphone pour le suivi</label>' +
        (known
          ? '<p id="fxhf-known-phone">' +
            esc(phone) +
            '</p><button type="button" class="fxhf-secondary" id="fxhf-edit-phone">Modifier le numéro</button>'
          : "") +
        '<input type="tel" inputmode="tel" autocomplete="tel" id="fxhf-phone" maxlength="24" placeholder="06 XX XX XX XX" value="' +
        esc(phone) +
        '"' +
        (known ? " hidden" : "") +
        '></div><p class="fxhf-note">Votre besoin et vos photos accompagnent cette demande. Le professionnel confirmera l’intervention et son prix avec vous.</p>',
    );
    node("fxhf-phone").oninput = function () {
      capture();
      availability();
    };
    if (known)
      node("fxhf-edit-phone").onclick = function () {
        node("fxhf-phone").hidden = false;
        node("fxhf-known-phone").hidden = true;
        this.hidden = true;
        node("fxhf-phone").focus();
      };
    button(
      "Confirmer ma demande",
      async function () {
        capture();
        status("Enregistrement de votre demande…");
        await intake.confirm(phone, acknowledgedRun);
        renderBound();
      },
      false,
      "fxhf-confirm",
    );
    button(
      "Retour",
      function () {
        capture();
        renderResult();
      },
      true,
    );
    availability();
  }
  function renderBound() {
    var p = intake.progress || { stage: "registered", sync_pending: true };
    var labels = {
      registered:
        "Votre demande est enregistrée. FIXEO poursuit la sélection des artisans adaptés.",
      dispatch_prepared:
        "Des artisans sont présélectionnés. La notification est préparée ; elle n’a pas encore été envoyée.",
      notification_sent:
        "Une notification a été envoyée. L’acceptation d’un artisan reste à confirmer.",
      artisan_confirmed: "Un artisan a confirmé votre demande.",
      intervention: "Votre intervention est en cours.",
      completed: "Votre intervention est terminée.",
      cancelled: "Cette demande a été annulée.",
    };
    var stage = p.stage,
      accepted = ["artisan_confirmed", "intervention", "completed"].includes(
        stage,
      );
    frame(
      accepted
        ? "mission"
        : stage === "notification_sent"
          ? "acceptance"
          : stage === "dispatch_prepared"
            ? "dispatching"
            : "matching",
      stage === "cancelled" ? "Demande annulée." : "Demande confirmée.",
      labels[stage] || labels.registered,
    );
    panel(safetyNotice());
    var steps = [
      ["Demande enregistrée", true],
      ["Besoin analysé", true],
      ["Sélection des artisans adaptés", p.matching === "matched" || accepted],
      ["Mise en relation", stage === "notification_sent" || accepted],
      ["Artisan confirmé", accepted],
    ];
    panel(
      '<ol class="fxhf-lifecycle">' +
        steps
          .map(function (step) {
            return (
              '<li class="' +
              (step[1] ? "done" : "") +
              '"><span aria-hidden="true">' +
              (step[1] ? "✓" : "○") +
              "</span>" +
              step[0] +
              "</li>"
            );
          })
          .join("") +
        '</ol><p class="fxhf-note">Référence : ' +
        esc(
          p.tracking_ref ||
            intake.session.request_ref ||
            "enregistrée dans votre dossier",
        ) +
        "</p>" +
        (p.sync_pending
          ? '<p class="fxhf-note">Le suivi est momentanément indisponible. Votre demande reste enregistrée.</p>'
          : "") +
        (p.notification === "failed"
          ? '<p class="fxhf-note">L’envoi de la notification a échoué. FIXEO doit poursuivre la mise en relation ; votre demande reste enregistrée.</p>'
          : "") +
        (stage !== "cancelled"
          ? '<p class="fxhf-handled">Votre demande est prise en charge par FIXEO.<br>Aucune action n’est nécessaire de votre côté. FIXEO organise la suite.</p>'
          : ""),
    );
    button("Actualiser le suivi", async function () {
      await intake.follow();
      renderBound();
    });
    button(
      "Un nouveau besoin",
      function () {
        intake.reset();
        phone = "";
        acknowledgedRun = null;
        estimateContext = null;
        renderNeed();
      },
      true,
    );
  }
  function renderState() {
    if (intake.session?.state === "bound") {
      renderBound();
      return;
    }
    if (intake.session?.state === "analyzing") {
      frame(
        "retry",
        "RAFI analyse votre besoin.",
        "Le dossier est conservé. Retrouvez ici le résultat de l’analyse en cours.",
      );
      button("Retrouver mon analyse", analyze);
      return;
    }
    if (intake.session?.result) {
      if (intake.session.result.questions.length) renderQuestions();
      else renderResult();
    } else renderNeed();
  }
  async function resumeOptional() {
    if (!optionalOpen) return;
    optionalOpen = false;
    await execute(async function () {
      await intake.load();
      if (intake.session.state === "bound") await intake.follow();
      questionIndex = 0;
      renderState();
    });
  }
  function stopTracks() {
    clearTimeout(recordingTimer);
    if (stream)
      stream.getTracks().forEach(function (track) {
        track.stop();
      });
    stream = null;
  }
  async function record() {
    if (busy || transcribing) return;
    if (recorder?.state === "recording") {
      recorder.stop();
      return;
    }
    var mic = node("fxhf-mic");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      status(
        "Micro non disponible. Vous pouvez écrire votre besoin ou ajouter une photo.",
      );
      return;
    }
    mic.disabled = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      var chunks = [],
        language = node("fxhf-speech-lang").value;
      recorder = new MediaRecorder(stream);
      recorder.addEventListener("dataavailable", function (event) {
        if (event.data?.size) chunks.push(event.data);
      });
      recorder.addEventListener("stop", async function () {
        stopTracks();
        transcribing = true;
        mic.disabled = true;
        mic.textContent = "RAFI transcrit…";
        availability();
        try {
          var blob = new Blob(chunks, {
            type: recorder.mimeType || "audio/webm",
          });
          var form = new FormData();
          form.append(
            "audio",
            blob,
            "rafi-voice." + (blob.type.includes("mp4") ? "m4a" : "webm"),
          );
          form.append("language", language);
          var response = await fetch("/api/rafi-transcribe", {
            method: "POST",
            body: form,
          });
          var data = await response.json();
          if (!response.ok || !data.ok || !data.text)
            throw new Error("TRANSCRIPTION_FAILED");
          node("fxhf-need-input").value = String(data.text)
            .trim()
            .slice(0, 2000);
          node("fxhf-need-input").dispatchEvent(
            new Event("input", { bubbles: true }),
          );
          status(
            "Votre message est prêt. Vous pouvez le corriger avant de continuer.",
          );
        } catch (_) {
          status(
            "La transcription a échoué. Vous pouvez réessayer ou écrire votre besoin.",
          );
        } finally {
          transcribing = false;
          mic.disabled = false;
          mic.innerHTML = micIcon + "Parler à RAFI";
          availability();
        }
      });
      recorder.start();
      mic.disabled = false;
      mic.textContent = "Terminer l’enregistrement";
      availability();
      recordingTimer = window.setTimeout(function () {
        if (recorder.state === "recording") recorder.stop();
      }, 12000);
    } catch (_) {
      stopTracks();
      mic.disabled = false;
      status(
        "Le micro n’est pas autorisé. Vous pouvez écrire votre besoin ou ajouter une photo.",
      );
      availability();
    }
  }
  function mount() {
    if (mounted) return true;
    root = document.getElementById("fxhf-root");
    if (!root || !window.FixeoIntake || !window.FixeoDiagnostic) return false;
    mounted = true;
    root.innerHTML =
      '<div class="fxhf-shell fxhf-shell--need fxhf-universal"><div class="fxhf-content"></div><div class="fxhf-visual"><div class="fxhf-rafi-sphere"><div class="fxhf-rafi-halo"></div><div class="fxhf-rafi-core"><img src="rafi/RAFI_V2_HeadCollar_Core.webp" alt="RAFI, votre assistant FIXEO" class="fxhf-rafi-face" width="150" height="150"></div></div><p class="fxhf-rafi-caption">Vous montrez. RAFI comprend.<br>FIXEO s’occupe de la suite.</p></div></div>';
    content = root.querySelector(".fxhf-content");
    intake = window.FixeoIntake.create(status);
    renderNeed();
    document.addEventListener("fixeo:diagnostic-closed", resumeOptional);
    document.addEventListener("fixeo:estimator-closed", resumeOptional);
    root.addEventListener("focusin", function () {
      document.body.classList.add("fxhf-focused");
    });
    root.addEventListener("focusout", function (e) {
      if (!root.contains(e.relatedTarget))
        document.body.classList.remove("fxhf-focused");
    });
    window.addEventListener("pagehide", stopTracks);
    if (intake.id)
      execute(async function () {
        frame(
          "analysis",
          "Retrouvons votre besoin.",
          "Votre dossier reste le même après un retour ou une actualisation.",
        );
        try {
          await intake.load();
          if (intake.session.state === "bound") await intake.follow();
          renderState();
        } catch (error) {
          frame(
            "retry",
            "Retrouvons votre besoin.",
            "La demande existante ne sera pas recréée.",
          );
          button("Réessayer", async function () {
            await intake.load();
            renderState();
          });
          button(
            "Commencer un nouveau besoin",
            function () {
              intake.reset();
              renderNeed();
            },
            true,
          );
          showError(error);
        }
      });
    return true;
  }
  window.FixeoHeroFlagship = {
    VERSION: "universal-intake-v1",
    STATES: STATES,
    mount: mount,
    getState: function () {
      return state;
    },
    isMounted: function () {
      return mounted;
    },
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
