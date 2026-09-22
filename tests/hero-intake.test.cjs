"use strict";
// Deterministic browser contracts. Private storage, microphone and API responses
// are controlled fixtures; production SQL idempotence is covered by the DB suite.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const clone = (v) => JSON.parse(JSON.stringify(v));
const wait = async (fn) => {
  for (let i = 0; i < 120; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error("UI timeout");
};
const result = () => ({
  trade: { value: "plomberie", provenance: "ai_inferred" },
  problem: {
    value: "Petite fuite à faire vérifier.",
    provenance: "ai_inferred",
  },
  safety: {
    version: "fixeo-risk-routing-v2",
    level: "TECHNICAL",
    stop: false,
    urgency: "normale",
    messages: [],
    signals: [],
  },
  questions: [],
  facts: [],
  hypotheses: [],
  checks: [],
  possible_parts: [],
});
function setup(t, opts = {}) {
  const dom = new JSDOM(
    '<div id="fxhf-root"></div><button id="outside">Sortir</button><button id="fixeo-urgent-fab">Urgence</button><div class="chat-widget">WhatsApp</div>',
    {
      url: "https://fixture.invalid",
      runScripts: "outside-only",
      pretendToBeVisual: true,
    },
  );
  t.after(() => dom.window.close());
  const w = dom.window,
    calls = [],
    uploads = [],
    revoked = [],
    opened = [];
  let server,
    confirmCount = 0,
    analysisCount = 0,
    createCount = 0,
    lost = opts.lost;
  const api = async (body) => {
    calls.push(clone(body));
    if (opts.override) {
      const answer = await opts.override(body, server);
      if (answer !== undefined) return answer;
    }
    if (body.action === "create") {
      createCount++;
      server = {
        id: body.session_id,
        input: clone(body.input),
        city_slug: body.city_slug,
        revision: 1,
        media: [],
        state: "draft",
        result: null,
        result_run_id: null,
      };
      if (lost === "create") {
        lost = null;
        throw Error("network");
      }
    } else {
      if (!server) throw Error("DIAGNOSTIC_NOT_FOUND");
      assert.equal(body.session_id, server.id);
      if (body.action === "update") {
        server.input = clone(body.input);
        server.city_slug = body.city_slug;
        server.revision++;
        server.result = null;
        server.state = "draft";
      }
      if (body.action === "media_reserve") {
        const id = w.crypto.randomUUID();
        server.media.push({ id, state: "reserved", kind: "photo" });
        server.revision++;
        return {
          session: clone(server),
          upload: {
            media_id: id,
            url: "https://storage.fixture.invalid/private-upload",
          },
        };
      }
      if (body.action === "media_validate") {
        server.media.find((m) => m.id === body.media_id).state = "ready";
        server.revision++;
        if (lost === "validate") {
          lost = null;
          throw Error("network");
        }
      }
      if (body.action === "media_remove") {
        server.media = server.media.filter((m) => m.id !== body.media_id);
        server.revision++;
        server.result = null;
      }
      if (body.action === "media_url")
        return {
          url: "https://storage.fixture.invalid/temporary-private-view",
        };
      if (body.action === "analyze") {
        analysisCount++;
        server.result = result();
        server.state = "ready";
        server.result_run_id = body.run_id;
        if (lost === "analyze") {
          lost = null;
          throw Error("network");
        }
      }
      if (body.action === "confirmation_context")
        return {
          client_phone: opts.knownPhone || "",
          ...(server.state === "bound"
            ? { progress: { stage: "registered", request_id: "canonical" } }
            : {}),
        };
      if (body.action === "confirm_intervention") {
        if (server.state !== "bound") confirmCount++;
        server.state = "bound";
        server.request_id = "canonical";
        if (lost === "confirm") {
          lost = null;
          throw Error("network");
        }
        return {
          request_id: "canonical",
          tracking_ref: "FX-FIXTURE",
          progress: { stage: "registered", request_id: "canonical" },
        };
      }
      if (body.action === "intervention_status")
        return { progress: { stage: "registered", request_id: "canonical" } };
      if (body.action === "handoff")
        return {
          entry_context: {
            source: "diagnostic",
            city_slug: server.city_slug,
            description: server.input.description,
            metier_hint: server.result.trade.value,
            diagnostic_token: "fixture-signed-dossier-token",
            known_inputs: {},
          },
        };
    }
    return { session: clone(server) };
  };
  w.URL.createObjectURL = () => "blob:fixture";
  w.URL.revokeObjectURL = (value) => revoked.push(value);
  w.XMLHttpRequest = class {
    constructor() {
      this.upload = {};
    }
    open(method, url) {
      assert.equal(method, "PUT");
      this.url = url;
    }
    setRequestHeader() {}
    send(file) {
      uploads.push({ file, url: this.url });
      this.status = 200;
      this.onload();
    }
  };
  w.FixeoDiagnostic = {
    api,
    saveTracking() {},
    open: async (ctx) => opened.push({ diagnostic: ctx }),
  };
  w.FixeoEstimatorV2 = {
    open: async (ctx) => opened.push({ estimation: ctx }),
  };
  w.FixeoAIRE = { detect: () => ({ cat: "plomberie" }) };
  w.eval(read("js/fixeo-intake-v1.js"));
  w.eval(read("js/fixeo-hero-flagship-v1.js"));
  w.FixeoHeroFlagship.mount();
  const q = (id) => w.document.getElementById(id);
  const change = (id, value) => {
    const el = q(id);
    if (el.type === "checkbox") el.checked = value;
    else el.value = value;
    el.dispatchEvent(new w.Event("input"));
    el.dispatchEvent(new w.Event("change"));
  };
  const click = (text) => {
    const b = [...q("fxhf-root").querySelectorAll("button")].find(
      (b) => b.textContent === text,
    );
    assert.ok(b, text);
    b.click();
  };
  const until = (fn) =>
    wait(() => !q("fxhf-root").hasAttribute("aria-busy") && fn());
  const fill = () => {
    change(
      "fxhf-need-input",
      "Une petite fuite sous mon lavabo depuis ce matin.",
    );
    change("fxhf-location", "rabat");
    change("fxhf-consent", true);
  };
  const analyze = async () => {
    q("fxhf-submit").click();
    await until(() => q("fxhf-root").dataset.fxhfState === "safety");
    click("RAFI comprend mon besoin");
    await until(() =>
      ["result", "retry"].includes(q("fxhf-root").dataset.fxhfState),
    );
  };
  const photo = (id = "fxhf-files", mime = "image/jpeg") => {
    const field = q(id);
    Object.defineProperty(field, "files", {
      configurable: true,
      value: [new w.File([new Uint8Array(100)], "fixture.jpg", { type: mime })],
    });
    field.dispatchEvent(new w.Event("change"));
  };
  return {
    w,
    q,
    api,
    change,
    click,
    fill,
    analyze,
    photo,
    until,
    calls,
    uploads,
    revoked,
    opened,
    server: () => server,
    counts: () => ({ createCount, analysisCount, confirmCount }),
  };
}
test("Hero first screen has no phone/request; consent and useful content gate analysis", async (t) => {
  const s = setup(t);
  assert.equal(s.q("fxhf-phone"), null);
  assert.equal(s.q("fxhf-submit").disabled, true);
  assert.equal(s.calls.length, 0);
  s.change("fxhf-location", "rabat");
  s.change("fxhf-consent", true);
  assert.equal(s.q("fxhf-submit").disabled, true);
  s.photo();
  assert.equal(s.q("fxhf-submit").disabled, false);
  assert.equal(s.calls.length, 0);
  s.q("fxhf-root").querySelector(".fxhf-photo-remove").click();
  await s.until(() => s.q("fxhf-submit").disabled);
  assert.equal(s.revoked.length, 1);
});
test("Hero native camera/library selection stays inline and keeps private-media protocol order", async (t) => {
  const s = setup(t);
  s.fill();
  s.q("fxhf-show").click();
  assert.equal(s.q("fxhf-photo-choices").hidden, false);
  assert.equal(s.q("fxhf-camera-file").getAttribute("capture"), "environment");
  assert.equal(s.q("fxhf-files").hasAttribute("capture"), false);
  s.photo("fxhf-camera-file");
  assert.equal(s.opened.length, 0);
  await s.analyze();
  assert.deepEqual(
    s.calls.map((c) => c.action),
    ["create", "media_reserve", "media_validate", "analyze"],
  );
  assert.equal(s.uploads.length, 1);
  assert.equal(s.counts().confirmCount, 0);
  assert.equal(s.w.sessionStorage.length, 1);
  assert.equal(
    s.w.sessionStorage.getItem("fixeo_diagnostic_dossier_v1"),
    s.server().id,
  );
});
for (const failure of ["create", "validate", "analyze"])
  test(
    "Hero retries lost " +
      failure +
      " response without duplicate dossier, photo or completed analysis",
    async (t) => {
      const s = setup(t, { lost: failure });
      s.fill();
      if (failure === "validate") s.photo();
      await s.analyze();
      assert.equal(s.q("fxhf-root").dataset.fxhfState, "retry");
      s.click("Réessayer");
      await s.until(() => !!s.q("fxhf-entrust"));
      assert.equal(s.counts().createCount, 1);
      assert.equal(s.counts().analysisCount, 1);
      if (failure === "validate") {
        assert.equal(s.uploads.length, 1);
        assert.equal(s.server().media.length, 1);
      }
    },
  );
test("Hero G signed Estimation entry uses shared city/trade/description; back retains dossier and answers", async (t) => {
  const s = setup(t);
  s.fill();
  await s.analyze();
  const id = s.server().id;
  s.q("fxhf-estimation").click();
  await s.until(() => s.opened.length === 1);
  const ctx = s.opened[0].estimation;
  assert.equal(ctx.city_slug, "rabat");
  assert.equal(ctx.metier_hint, "plomberie");
  assert.match(ctx.description, /lavabo/);
  assert.ok(ctx.diagnostic_token);
  s.w.document.dispatchEvent(new s.w.CustomEvent("fixeo:estimator-closed"));
  await s.until(() => !!s.q("fxhf-entrust"));
  assert.equal(s.server().id, id);
  assert.equal(s.counts().createCount, 1);
  assert.equal(s.counts().confirmCount, 0);
  s.q("fxhf-estimation").click();
  await s.until(() => s.opened.length === 2);
  assert.deepEqual(
    s.opened[0],
    s.opened[1],
    "same signed context allows existing Estimation journey resume",
  );
});
test("Hero late confirmation reuses known phone and preserves edited phone on return", async (t) => {
  const s = setup(t, { knownPhone: "0600000000" });
  s.fill();
  await s.analyze();
  s.q("fxhf-entrust").click();
  await s.until(() => s.q("fxhf-phone"));
  assert.equal(s.q("fxhf-phone").hidden, true);
  s.q("fxhf-edit-phone").click();
  assert.equal(s.q("fxhf-phone").hidden, false);
  s.change("fxhf-phone", "0611111111");
  s.click("Retour");
  await s.until(() => s.q("fxhf-entrust"));
  s.q("fxhf-entrust").click();
  await s.until(() => s.q("fxhf-phone"));
  assert.equal(s.q("fxhf-phone").value, "0611111111");
});
test("Hero B voice transcription uses existing FR/Darija endpoint and converges into the same lifecycle", async (t) => {
  const s = setup(t);
  const w = s.w;
  let stopped = 0,
    language;
  Object.defineProperty(w.navigator, "mediaDevices", {
    value: {
      getUserMedia: async () => ({
        getTracks: () => [
          {
            stop() {
              stopped++;
            },
          },
        ],
      }),
    },
  });
  w.MediaRecorder = class extends w.EventTarget {
    constructor() {
      super();
      this.state = "inactive";
      this.mimeType = "audio/mp4";
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      const e = new w.Event("dataavailable");
      e.data = new w.Blob(["audio"], { type: "audio/mp4" });
      this.dispatchEvent(e);
      this.dispatchEvent(new w.Event("stop"));
    }
  };
  w.fetch = async (url, opts) => {
    assert.equal(url, "/api/rafi-transcribe");
    language = opts.body.get("language");
    return {
      ok: true,
      json: async () => ({
        ok: true,
        text: "Une petite fuite sous mon lavabo depuis ce matin.",
      }),
    };
  };
  s.change("fxhf-speech-lang", "ar-MA");
  s.q("fxhf-mic").click();
  await wait(() => s.q("fxhf-mic").textContent === "Terminer l’enregistrement");
  s.q("fxhf-mic").click();
  await wait(() => s.q("fxhf-need-input").value.includes("lavabo"));
  assert.equal(language, "ar-MA");
  assert.equal(stopped, 1);
  assert.equal(s.calls.length, 0);
  s.change("fxhf-location", "rabat");
  s.change("fxhf-consent", true);
  await s.analyze();
  assert.ok(s.q("fxhf-entrust"));
  assert.equal(s.counts().createCount, 1);
});
test("Hero S microphone refusal preserves text/photo controls and communicates fallback", async (t) => {
  const s = setup(t);
  s.w.MediaRecorder = function () {};
  Object.defineProperty(s.w.navigator, "mediaDevices", {
    value: {
      getUserMedia: async () => {
        throw Error("NotAllowedError");
      },
    },
  });
  s.q("fxhf-mic").click();
  await wait(() => s.q("fxhf-status").textContent.includes("pas autorisé"));
  s.fill();
  assert.equal(s.q("fxhf-submit").disabled, false);
  s.photo();
  assert.match(s.q("fxhf-photos").textContent, /photo prête/);
});
test("Hero photo rejection retains the previous valid selection", (t) => {
  const s = setup(t);
  s.photo();
  s.photo("fxhf-files", "image/heic");
  assert.equal(s.q("fxhf-photos").querySelectorAll("figure").length, 1);
  assert.match(s.q("fxhf-error").textContent, /JPEG/);
});
test("Hero focus hides interfering floating actions and restores their state outside", (t) => {
  const s = setup(t);
  s.q("fxhf-need-input").focus();
  assert.equal(s.w.document.body.classList.contains("fxhf-focused"), true);
  s.q("outside").focus();
  assert.equal(s.w.document.body.classList.contains("fxhf-focused"), false);
});
test("Hero legal details, native controls and static mobile footer reserve safe-area without overlap", (t) => {
  const s = setup(t),
    css = read("css/fixeo-hero-flagship-v1.css");
  assert.match(
    s.q("fxhf-root").textContent,
    /24 h.*90 jours.*30 jours.*180 jours/s,
  );
  assert.ok(s.q("fxhf-root").querySelector("details.fxhf-privacy"));
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.fxhf-actions \{ position: static; \}/);
  assert.match(css, /max-width: 360px/);
  assert.match(css, /prefers-reduced-motion/);
});
