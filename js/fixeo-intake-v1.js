/* Shared Hero dossier client. All qualification, safety, media protection,
 * quotas, request binding and dispatch remain in the existing Diagnostic API. */
(function () {
  "use strict";
  if (window.FixeoIntake) return;
  var key = "fixeo_diagnostic_dossier_v1";
  var editKey = "fixeo_diagnostic_edit_v1";
  function readEdit(id) {
    try {
      var saved = JSON.parse(sessionStorage.getItem(editKey) || "null");
      return saved && saved.session_id === id ? saved.draft : null;
    } catch (_) {
      return null;
    }
  }
  function rememberEdit(id, value) {
    try {
      if (id && value)
        sessionStorage.setItem(editKey, JSON.stringify({ session_id: id, draft: value }));
      else sessionStorage.removeItem(editKey);
    } catch (_) {}
  }
  function read() {
    try {
      return sessionStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }
  function remember(id) {
    try {
      if (id) sessionStorage.setItem(key, id);
      else sessionStorage.removeItem(key);
    } catch (_) {}
  }
  function create(onStatus) {
    var dossierId = read(),
      editDraft = readEdit(dossierId);
    var client = {
      id: dossierId,
      session: null,
      pending: [],
      progress: null,
      busy: false,
      draft: editDraft || {
        description: "",
        city: "",
        answers: {},
        safety_signals: [],
        consent: false,
      },
      editing: !!editDraft,
    };
    var running, runId;
    function api(body) {
      return window.FixeoDiagnostic.api(body);
    }
    function restore(session, keepDraft) {
      client.session = session;
      client.id = session.id;
      remember(session.id);
      if (!keepDraft)
        client.draft = {
          description: session.input.description,
          city: session.city_slug,
          answers: Object.assign({}, session.input.answers),
          safety_signals: (session.input.safety_signals || []).slice(),
          consent: true,
        };
      return session;
    }
    function once(task) {
      if (running) return running;
      client.busy = true;
      running = Promise.resolve()
        .then(task)
        .finally(function () {
          running = null;
          client.busy = false;
        });
      return running;
    }
    async function load(keepDraft) {
      if (!client.id) return null;
      return restore(
        (await api({ action: "get", session_id: client.id })).session,
        keepDraft,
      );
    }
    async function poll() {
      for (var i = 0; i < 24; i++) {
        await new Promise(function (resolve) {
          window.setTimeout(resolve, 2500);
        });
        await load();
        if (client.session.state !== "analyzing") return client.session;
        if (
          client.session.analysis_retry_after &&
          Date.parse(client.session.analysis_retry_after) < Date.now()
        )
          throw new Error("ANALYSIS_INTERRUPTED");
      }
      throw new Error("ANALYSIS_RUNNING");
    }
    function upload(url, file) {
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open("PUT", url);
        xhr.timeout = 60000;
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = function (e) {
          if (e.lengthComputable)
            onStatus(
              "Envoi privé de la photo · " +
                Math.round((e.loaded / e.total) * 100) +
                " %",
            );
        };
        xhr.onload = function () {
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error("UPLOAD_FAILED"));
        };
        xhr.onerror = xhr.ontimeout = function () {
          reject(new Error("UPLOAD_FAILED"));
        };
        xhr.send(file);
      });
    }
    client.load = load;
    client.startEdit = function () {
      if (!client.id || client.session?.state === "bound") return false;
      client.editing = true;
      rememberEdit(client.id, client.draft);
      return true;
    };
    client.saveEdit = function () {
      if (client.editing) rememberEdit(client.id, client.draft);
    };
    client.cancelEdit = function () {
      client.editing = false;
      rememberEdit(null, null);
    };
    client.addFiles = function (files) {
      if (client.busy) return;
      var count =
        client.pending.length +
        (client.session?.media || []).filter(function (m) {
          return m.state !== "removed";
        }).length;
      Array.from(files).forEach(function (file) {
        if (count >= 3) throw new Error("PHOTO_LIMIT");
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size < 1 ||
          file.size > 8388608
        )
          throw new Error("INVALID_PHOTO");
        client.pending.push({ file: file, url: URL.createObjectURL(file) });
        count++;
      });
    };
    client.remove = function (index, mediaId) {
      return once(async function () {
        if (mediaId) {
          restore(
            (
              await api({
                action: "media_remove",
                session_id: client.id,
                revision: client.session.revision,
                media_id: mediaId,
              })
            ).session,
            true,
          );
        } else {
          URL.revokeObjectURL(client.pending[index].url);
          client.pending.splice(index, 1);
        }
      });
    };
    client.analyze = function () {
      return once(async function () {
        if (!client.draft.consent) throw new Error("CONSENT_REQUIRED");
        var wanted = JSON.parse(JSON.stringify(client.draft));
        // An uncertain previous response is reconciled before any further write.
        if (client.id) {
          try {
            await load(true);
          } catch (error) {
            if (error.message !== "DIAGNOSTIC_NOT_FOUND") throw error;
          }
        }
        if (client.session?.state === "bound") return client.session;
        if (client.session?.state === "analyzing") return poll();
        client.pending = client.pending.filter(function (item) {
          if (
            item.mediaId &&
            client.session?.media.some(function (m) {
              return m.id === item.mediaId && m.state === "ready";
            })
          ) {
            URL.revokeObjectURL(item.url);
            return false;
          }
          return true;
        });
        var input = {
          description: wanted.description,
          answers: wanted.answers,
          safety_signals: wanted.safety_signals,
        };
        var previous = client.session?.input;
        var sameInput =
          client.session &&
          client.session.city_slug === wanted.city &&
          previous.description === input.description &&
          JSON.stringify((previous.safety_signals || []).slice().sort()) ===
            JSON.stringify(input.safety_signals.slice().sort()) &&
          JSON.stringify(Object.entries(previous.answers || {}).sort()) ===
            JSON.stringify(Object.entries(input.answers).sort());
        if (sameInput && !client.pending.length && client.session.result)
          return client.session;
        if (!client.id) {
          client.id = crypto.randomUUID();
          remember(client.id);
        }
        onStatus("RAFI comprend votre besoin…");
        if (!sameInput)
          restore(
            (
              await api({
                action: client.session ? "update" : "create",
                session_id: client.id,
                revision: client.session && client.session.revision,
                city_slug: wanted.city,
                input: input,
                consent_version: "diagnostic-privacy-v1",
              })
            ).session,
          );
        // Interrupted private uploads are explicitly removed before reuse. The
        // local photo remains available; no raw/private URL enters storage.
        for (var media of client.session.media.filter(function (m) {
          return ["reserved", "validating"].includes(m.state);
        })) {
          restore(
            (
              await api({
                action: "media_remove",
                session_id: client.id,
                revision: client.session.revision,
                media_id: media.id,
              })
            ).session,
          );
        }
        if (!wanted.safety_signals.length)
          while (client.pending.length) {
            var item = client.pending[0];
            onStatus("Préparation de la photo…");
            var ticket = await api({
              action: "media_reserve",
              session_id: client.id,
              revision: client.session.revision,
              kind: "photo",
              mime: item.file.type,
              bytes: item.file.size,
            });
            item.mediaId = ticket.upload.media_id;
            restore(ticket.session);
            await upload(ticket.upload.url, item.file);
            onStatus("Vérification et protection de la photo…");
            restore(
              (
                await api({
                  action: "media_validate",
                  session_id: client.id,
                  revision: client.session.revision,
                  media_id: ticket.upload.media_id,
                })
              ).session,
            );
            client.pending.shift();
            URL.revokeObjectURL(item.url);
          }
        runId = crypto.randomUUID();
        onStatus("RAFI analyse les informations et les signaux de sécurité…");
        var response = await api({
          action: "analyze",
          session_id: client.id,
          revision: client.session.revision,
          run_id: runId,
        });
        if (response.pending) return poll();
        var analyzed = restore(response.session);
        client.editing = false;
        rememberEdit(null, null);
        return analyzed;
      });
    };
    client.confirmation = function () {
      return once(async function () {
        await load();
        var s = client.session;
        var response = await api({
          action: "confirmation_context",
          session_id: s.id,
          revision: s.revision,
          run_id: s.result_run_id,
        });
        if (response.progress) client.progress = response.progress;
        return response;
      });
    };
    client.confirm = function (phone, acknowledgedRun) {
      return once(async function () {
        var s = client.session;
        var response = await api({
          action: "confirm_intervention",
          session_id: s.id,
          revision: s.revision,
          run_id: s.result_run_id,
          client_phone: phone,
          ...(s.result.safety.stop
            ? {
                acknowledgement: {
                  accepted: acknowledgedRun === s.result_run_id,
                  version: "fixeo-critical-ack-v1",
                  run_id: s.result_run_id,
                },
              }
            : {}),
        });
        window.FixeoDiagnostic.saveTracking(response);
        s.state = "bound";
        s.request_id = response.request_id;
        s.request_ref = response.tracking_ref;
        client.progress = response.progress;
        return response;
      });
    };
    client.follow = async function () {
      client.progress = (
        await api({ action: "intervention_status", session_id: client.id })
      ).progress;
      return client.progress;
    };
    client.estimation = async function () {
      await load();
      var s = client.session;
      return (
        await api({ action: "handoff", session_id: s.id, revision: s.revision })
      ).entry_context;
    };
    client.reset = function () {
      if (client.busy) return;
      client.pending.forEach(function (item) {
        URL.revokeObjectURL(item.url);
      });
      client.pending = [];
      client.session = null;
      client.id = null;
      client.progress = null;
      client.draft = {
        description: "",
        city: client.draft.city,
        answers: {},
        safety_signals: [],
        consent: false,
      };
      remember(null);
      client.editing = false;
      rememberEdit(null, null);
    };
    return client;
  }
  window.FixeoIntake = { create: create };
})();
