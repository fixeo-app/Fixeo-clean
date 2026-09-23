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
  opts.configure?.(w);
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
  assert.equal(s.q("fxhf-photo-choices").hidden, true);
  assert.equal(s.q("fxhf-show").getAttribute("aria-expanded"), "false");
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
test("Hero NEED controls receive focus/click before consent; only analysis is gated", async (t) => {
  const s = setup(t);
  for (const id of [
    "fxhf-location",
    "fxhf-need-input",
    "fxhf-mic",
    "fxhf-show",
    "fxhf-speech-lang",
    "fxhf-consent",
  ]) {
    const control = s.q(id);
    assert.equal(control.matches(":disabled"), false, id);
    assert.equal(control.closest('[inert], [aria-busy="true"]'), null, id);
    control.focus();
    assert.equal(s.w.document.activeElement, control, id);
  }
  assert.equal(s.q("fxhf-consent").checked, false);
  assert.equal(s.q("fxhf-submit").disabled, true);
  s.change("fxhf-location", "fes");
  s.change("fxhf-need-input", "Une petite fuite sous mon lavabo.");
  s.change("fxhf-speech-lang", "ar-MA");
  let microphoneRequested = false;
  s.w.MediaRecorder = function () {};
  Object.defineProperty(s.w.navigator, "mediaDevices", {
    value: {
      getUserMedia: async () => {
        microphoneRequested = true;
        throw Error("NotAllowedError");
      },
    },
  });
  s.q("fxhf-mic").click();
  await wait(() => microphoneRequested && !s.q("fxhf-mic").disabled);
  s.q("fxhf-show").click();
  assert.equal(s.q("fxhf-photo-choices").hidden, false);
  for (const [button, input] of [
    ["fxhf-camera", "fxhf-camera-file"],
    ["fxhf-library", "fxhf-files"],
  ]) {
    let chooserRequested = false;
    s.q(input).addEventListener(
      "click",
      (event) => {
        chooserRequested = true;
        event.preventDefault(); // Simulate closing the native chooser without a file.
      },
      { once: true },
    );
    s.q(button).click();
    assert.equal(chooserRequested, true, button);
  }
  s.q("fxhf-show").click();
  s.q("outside").focus();
  s.q("fxhf-need-input").focus();
  assert.equal(s.q("fxhf-location").value, "fes");
  assert.match(s.q("fxhf-need-input").value, /lavabo/);
  assert.equal(s.q("fxhf-speech-lang").value, "ar-MA");
  assert.equal(s.q("fxhf-submit").disabled, true);
  s.q("fxhf-consent").click();
  assert.equal(s.q("fxhf-submit").disabled, false);
  s.q("fxhf-consent").click();
  assert.equal(s.q("fxhf-submit").disabled, true);
  assert.equal(
    s.calls.length,
    0,
    "input interactions must not create a dossier",
  );
});
for (const [width, height] of [
  [320, 568],
  [360, 780],
  [390, 844],
  [412, 915],
  [320, 340],
  [390, 340],
]) {
  test(`Hero decorative layer cannot intercept NEED controls at ${width}x${height}`, (t) => {
    const s = setup(t),
      doc = s.w.document;
    const source = doc.createElement("style");
    source.textContent = read("css/fixeo-hero-flagship-v1.css");
    doc.head.append(source);
    // JSDOM has no layout/hit-testing. Apply the real viewport rules explicitly
    // to test containment and inherited pointer-events, not simulated geometry.
    const active = (rules) =>
      [...rules]
        .map((rule) => {
          if (rule.media) {
            const query = rule.media.mediaText;
            if (query.includes("prefers-reduced-motion")) return "";
            const matches = [
              ...query.matchAll(/(min|max)-(width|height):\s*(\d+)px/g),
            ].every(([, bound, axis, limit]) => {
              const size = axis === "width" ? width : height;
              return bound === "max" ? size <= +limit : size >= +limit;
            });
            return matches ? active(rule.cssRules) : "";
          }
          return rule.cssText;
        })
        .join("\n");
    const css = active(source.sheet.cssRules);
    source.textContent = css;
    const visual = doc.querySelector(".fxhf-visual");
    const style = s.w.getComputedStyle(visual);
    assert.notEqual(
      style.position,
      "static",
      "absolute glow must stay within RAFI",
    );
    assert.equal(
      style.top,
      "0px",
      "mobile decoration must not retain desktop sticky offset",
    );
    for (const node of [visual, ...visual.querySelectorAll("*")]) {
      assert.equal(
        s.w.getComputedStyle(node).pointerEvents,
        "none",
        node.className,
      );
    }
    for (const id of [
      "fxhf-location",
      "fxhf-need-input",
      "fxhf-mic",
      "fxhf-show",
      "fxhf-speech-lang",
      "fxhf-consent",
    ]) {
      assert.notEqual(s.w.getComputedStyle(s.q(id)).pointerEvents, "none", id);
    }
  });
}
test("Hero legal details, native controls and static mobile footer reserve safe-area without overlap", (t) => {
  const s = setup(t),
    css = read("css/fixeo-hero-flagship-v1.css");
  assert.match(
    s.q("fxhf-root").textContent,
    /24 h.*90 jours.*30 jours.*180 jours/s,
  );
  assert.ok(s.q("fxhf-root").querySelector("details.fxhf-privacy"));
  assert.equal(s.q('fxhf-consent').closest('label').textContent, 'J’accepte l’analyse par FIXEO.');
  assert.match(s.q('fxhf-root').querySelector('details.fxhf-privacy').textContent,
    /FIXEO et son fournisseur IA/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.fxhf-actions \{ position: static;/);
  assert.match(css, /max-width: 360px/);
  assert.match(css, /prefers-reduced-motion/);
});

// Cascade contracts, not pixel/physical-keyboard verification: JSDOM has no
// layout engine. Include the real RAFI OS sibling that isolated Hero tests missed.
for (const width of [320, 360, 390, 412]) {
  test(`Mobile NEED keeps its heading and natural photo flow at ${width}px, including keyboard recovery`, async (t) => {
    const s = setup(t, {
      configure(w) {
        const hero = w.document.createElement("section");
        hero.id = "home";
        hero.className = "hero hero-section rfos-hero-recomposed";
        const content = w.document.createElement("div");
        content.className = "hero-content";
        hero.append(content);
        w.document.body.prepend(hero);
        content.append(w.document.getElementById("fxhf-root"));
        const legacy = w.document.createElement("div");
        legacy.className = "rfos-stage-wrap";
        legacy.textContent = "RAFI — Même quelques mots me suffisent.";
        content.append(legacy);
        const estimation = w.document.createElement("section");
        estimation.id = "fixeo-estimation-signature";
        hero.after(estimation);
        Object.defineProperty(w, "innerWidth", { value: width });
      },
    });
    const doc = s.w.document;
    const style = doc.createElement("style");
    style.textContent = read("css/homepage-conversion-optimizer.css") + read("css/fixeo-rafi-os-v1.css") + read("css/fixeo-hero-flagship-v1.css");
    doc.head.append(style);
    function viewportRules(rules) {
      return [...rules].map((rule) => {
        if (!rule.media) return rule.cssText;
        const query = rule.media.mediaText;
        if (query.includes("prefers-reduced-motion")) return "";
        const matches = [...query.matchAll(/(min|max)-(width|height):\s*(\d+)px/g)].every(([, bound, axis, n]) => {
          const size = axis === "width" ? width : 568;
          return bound === "max" ? size <= +n : size >= +n;
        });
        return matches ? viewportRules(rule.cssRules) : "";
      }).join("\n");
    }
    style.textContent = viewportRules(style.sheet.cssRules);
    const computed = (selector) => s.w.getComputedStyle(doc.querySelector(selector));
    assert.equal(doc.querySelector('.fxhf-subtitle').textContent,
      'Écrivez, parlez ou montrez. RAFI comprend et vous guide.');
    // Presentation may become finer, but the native touch surfaces must not.
    for (const selector of ['.fxhf-mic', '.fxhf-speech-lang', '.fxhf-consent']) {
      assert.ok(parseFloat(computed(selector).minHeight) >= 44, selector);
    }
    assert.ok(parseFloat(computed('.fxhf-need-input').height) >= 80);
    assert.notEqual(computed('.fxhf-smart-prompt').color, computed('.fxhf-need-input').color);
    assert.equal(computed('.fxhf-smart-prompt').pointerEvents, 'none');
    assert.equal(computed('.fxhf-submit').minHeight, '52px');
    assert.equal(computed('.fxhf-rafi-core').position, 'absolute', 'artwork must not grow the grid slot');
    assert.equal(computed('.fxhf-rafi-face').position, 'absolute');
    assert.equal(computed('.fxhf-rafi-face').left, '50%');
    assert.equal(computed('.fxhf-rafi-face').top, '50%');
    assert.equal(computed('.fxhf-rafi-face').maxWidth, 'none', 'transparent canvas must not be constrained to the slot');
    assert.equal(computed('.fxhf-rafi-halo').maxWidth, 'none', 'legacy 100% cap must not squash and offset the halo');
    assert.equal(computed('.fxhf-rafi-halo').width, computed('.fxhf-rafi-halo').height, 'halo must be square');
    assert.equal(computed('.fxhf-actions').backgroundColor, 'rgba(0, 0, 0, 0)', 'no dark rectangle behind CTA');
    assert.equal(computed('.fxhf-title').fontWeight, '700');
    assert.equal(computed('.fxhf-subtitle').fontWeight, '500');
    assert.equal(computed('.fxhf-rafi-sphere').transform, 'scale(.94)', 'uniform 6% reduction, including face and halo');
    assert.equal(computed('.fxhf-rafi-sphere').transformOrigin, 'center');
    assert.equal(computed('.fxhf-rafi-sphere').width, '60px', 'keep the existing decoration slot');
    assert.equal(computed('.fxhf-rafi-face').transform, 'translate(-50%, -50%)');
    assert.equal(computed('.fxhf-rafi-halo').animation, 'fxhf-rafi-atmosphere 6s ease-in-out infinite');
    for (const filled of [false, true]) {
      if (filled) s.fill();
      assert.equal(computed(".fxhf-content").gridTemplateRows, "auto auto auto");
      assert.equal(computed(".fxhf-content").alignSelf, "start");
      assert.equal(computed(".fxhf-universal").height, "auto");
      assert.equal(computed(".fxhf-universal").minHeight, "0");
      assert.equal(computed("#home").minHeight, "0");
      assert.equal(computed(".fxhf-universal").alignContent, "start");
      assert.equal(computed(".fxhf-scroll").overflow, "visible");
      assert.equal(computed(".rfos-stage-wrap").display, "none");
      assert.equal(computed(".fxhf-actions").position, "static");
      assert.equal(s.q("fxhf-submit").disabled, !filled);
    }

    // The real file-input handler sets data-fxhf-photos. Previously that alone
    // hid the subtitle and pulled the stepper towards the stationary RAFI orb.
    // Assert CSS/DOM stability, not pixels: physical Safari remains a manual gate.
    const heading = doc.querySelector('.fxhf-heading');
    const headingStyles = () => ['.fxhf-heading', '.fxhf-title', '.fxhf-subtitle',
      '.fxhf-progress', '.fxhf-visual', '.fxhf-rafi-sphere'].map(selector => {
      const css = computed(selector);
      return ['display', 'position', 'height', 'minHeight', 'maxHeight', 'transform',
        'marginTop', 'marginBottom', 'paddingTop', 'paddingBottom', 'fontSize',
        'lineHeight', 'fontWeight'].map(property => css[property]);
    });
    const headingBeforePhotos = headingStyles();
    s.change('fxhf-need-input', '');
    s.change('fxhf-consent', false);
    for (let count = 1; count <= 3; count++) {
      // Photo-only first, then add another photo after entering text.
      if (count === 2) s.change('fxhf-need-input', 'Une fuite à vérifier.');
      s.photo(count === 1 ? 'fxhf-camera-file' : 'fxhf-files');
      const photos = s.q('fxhf-photos');
      assert.equal(s.q('fxhf-root').dataset.fxhfPhotos, String(count));
      assert.equal(photos.querySelectorAll('figure').length, count);
      assert.match(photos.textContent, new RegExp(count + ' photo'));
      assert.equal(photos.parentElement, s.q('fxhf-panel'));
      assert.equal(computed('.fxhf-photos').display, 'flex');
      assert.equal(computed('.fxhf-photos').flexWrap, 'wrap');
      assert.equal(computed('.fxhf-photos').gap, '8px');
      assert.equal(computed('.fxhf-photos').marginTop, '12px');
      assert.ok(['', 'static'].includes(computed('.fxhf-photos').position));
      assert.ok(['', 'none'].includes(computed('.fxhf-photos').transform));
      assert.equal(computed('.fxhf-subtitle').display, 'block', 'photo must not collapse the heading');
      assert.equal(computed('.fxhf-universal').height, 'auto');
      assert.equal(computed('.fxhf-universal').minHeight, '0');
      assert.equal(computed('#home').minHeight, '0');
      assert.equal(computed('.fxhf-scroll').overflow, 'visible');
      assert.equal(doc.querySelector('.fxhf-heading'), heading, 'no heading rebuild');
      assert.deepEqual(headingStyles(), headingBeforePhotos, 'photo must not compress or shift heading styles');
      const order = ['.fxhf-need-field', '.fxhf-photos', '.fxhf-consent', '.fxhf-privacy', '.fxhf-actions']
        .map(selector => doc.querySelector(selector));
      for (let i = 1; i < order.length; i++)
        assert.ok(order[i - 1].compareDocumentPosition(order[i]) & s.w.Node.DOCUMENT_POSITION_FOLLOWING);
      for (const consent of [false, true]) {
        s.change('fxhf-consent', consent);
        assert.equal(s.q('fxhf-submit').disabled, !consent);
        assert.deepEqual(headingStyles(), headingBeforePhotos);
      }
    }
    assert.equal(s.q('fxhf-need-input').value, 'Une fuite à vérifier.');
    assert.equal(s.calls.length, 0, 'local preview and consent must not create a server dossier');
    assert.equal(s.uploads.length, 0, 'photos are not uploaded before analysis');
    s.q("fxhf-need-input").focus();
    assert.equal(doc.activeElement, s.q("fxhf-need-input"));
    doc.body.classList.add("fxhf-keyboard");
    assert.equal(computed("#home").minHeight, "var(--fxhf-viewport-height, 100svh)", "keyboard document anchoring is retained");
    assert.equal(computed("#fxhf-root").overflowY, "auto");
    assert.equal(computed(".fxhf-universal").minHeight, "0");
    assert.equal(computed(".fxhf-actions").position, "static");
    assert.equal(computed('.fxhf-subtitle').display, 'none', 'retain intentional keyboard compaction');
    assert.equal(computed('.fxhf-visual').display, 'none');
    assert.equal(computed('.fxhf-photos').display, 'flex');
    assert.ok(s.q("fxhf-root").contains(s.q("fxhf-submit")));
    assert.equal(doc.querySelector("#home").nextElementSibling.id, "fixeo-estimation-signature");
    assert.notEqual(computed("#fixeo-estimation-signature").display, "none");
    doc.body.classList.remove("fxhf-keyboard");
    assert.equal(computed("#home").minHeight, "0", "no empty viewport tail returns after keyboard closes");
    assert.deepEqual(headingStyles(), headingBeforePhotos, 'photo heading recovers after keyboard closes');
    for (let remaining = 2; remaining >= 0; remaining--) {
      s.q('fxhf-photos').querySelector('button').click();
      await s.until(() => s.q('fxhf-root').dataset.fxhfPhotos === String(remaining));
      assert.deepEqual(headingStyles(), headingBeforePhotos, 'removing photos keeps the heading stable');
    }
    assert.equal(computed('.fxhf-photos').display, 'none');
    assert.equal(s.revoked.length, 3);
    assert.equal(s.calls.length, 0);
    s.q("fxhf-submit").click();
    await s.until(() => s.q("fxhf-root").dataset.fxhfState === "safety");
    assert.equal(computed(".fxhf-content").gridTemplateRows, "auto minmax(0, 1fr) auto");
    assert.equal(computed("#home").minHeight, "var(--fxhf-viewport-height, 100svh)", "SAFETY keeps its viewport workspace");
    assert.equal(computed(".fxhf-universal").minHeight, "220px");
    assert.equal(computed('.fxhf-title').fontWeight, '600', 'NEED weight does not leak to SAFETY');
    assert.ok(['', 'none'].includes(computed('.fxhf-rafi-sphere').transform), 'NEED orb reduction does not leak to SAFETY');
    assert.equal(computed('.fxhf-title').textShadow, '', 'NEED title treatment must not leak to SAFETY');
    assert.notEqual(computed(".rfos-stage-wrap").display, "none", "legacy visibility outside NEED is untouched");
    // Exercise only CSS state matching here; the functional suite covers the
    // corresponding transitions without changing the real journey state.
    for (const state of ['analysis', 'questions', 'result', 'confirmation', 'matching', 'dispatching', 'acceptance', 'mission', 'retry']) {
      s.q('fxhf-root').dataset.fxhfState = state;
      assert.equal(computed('#home').minHeight, 'var(--fxhf-viewport-height, 100svh)', state);
      assert.equal(computed('.fxhf-universal').minHeight, '220px', state);
    }
  });
}

// UI timers are deterministic; no provider, camera or physical device is used.
function promptClock(w, reduced = false) {
  let now = 0,
    seq = 0;
  const timers = new Map(),
    changes = new Set();
  w.FIXEO_DETECTED_CITY = "fes";
  w.setTimeout = (fn, delay = 0) => {
    const id = ++seq;
    timers.set(id, { at: now + delay, fn });
    return id;
  };
  w.clearTimeout = (id) => timers.delete(id);
  const motion = {
    matches: reduced,
    addEventListener: (_, fn) => changes.add(fn),
    removeEventListener: (_, fn) => changes.delete(fn),
  };
  w.matchMedia = () => motion;
  return {
    tick(ms) {
      const target = now + ms;
      for (let count = 0; count < 10000; count++) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > target) {
          now = target;
          return;
        }
        timers.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      throw Error("UI timer runaway");
    },
    reduce(value) {
      motion.matches = value;
      changes.forEach((fn) => fn());
    },
    pending: () => timers.size,
  };
}
test("Smart RAFI rotates FR/Darija as aria-hidden decoration, never draft/API content", async (t) => {
  let clock;
  const s = setup(t, {
    configure(w) {
      clock = promptClock(w);
    },
  });
  await new Promise((r) => setTimeout(r, 0));
  const prompt = s.q("fxhf-root").querySelector(".fxhf-smart-prompt"),
    input = s.q("fxhf-need-input");
  const langs = new Set(),
    texts = new Set();
  for (let i = 0; i < 160; i++) {
    clock.tick(100);
    if (!prompt.hidden) {
      langs.add(prompt.querySelector("span").lang);
      texts.add(prompt.textContent);
    }
    assert.equal(input.value, "");
  }
  assert.deepEqual([...langs].sort(), ["ary-Latn", "fr"]);
  assert.ok(texts.size > 20, "typing changes the decorative copy");
  assert.equal(prompt.getAttribute("aria-hidden"), "true");
  assert.equal(
    input.getAttribute("aria-label"),
    "Décrivez votre problème ou votre besoin",
  );
  assert.equal(s.calls.length, 0);
  assert.equal(s.q("fxhf-submit").disabled, true);
  s.photo();
  s.change("fxhf-consent", true);
  await s.analyze();
  const creation = s.calls.find((call) => call.action === "create");
  assert.equal(
    creation.input.description,
    "",
    "animated phrases are never submitted",
  );
});
test("Smart RAFI stops immediately for touch, focus, paste, input and speech; resumes only empty and blurred", async (t) => {
  let clock;
  const s = setup(t, {
    configure(w) {
      clock = promptClock(w);
    },
  });
  await new Promise((r) => setTimeout(r, 0));
  const input = s.q("fxhf-need-input"),
    prompt = s.q("fxhf-root").querySelector(".fxhf-smart-prompt");
  clock.tick(900);
  assert.equal(prompt.hidden, false);
  for (const event of [
    "pointerdown",
    "touchstart",
    "paste",
    "beforeinput",
    "compositionstart",
  ]) {
    input.dispatchEvent(new s.w.Event(event));
    assert.equal(prompt.hidden, true, event);
    clock.tick(4000);
    assert.equal(prompt.hidden, true, event);
    input.focus();
    input.blur();
    clock.tick(900);
    assert.equal(prompt.hidden, false);
  }
  input.focus();
  clock.tick(5000);
  assert.equal(prompt.hidden, true);
  s.change("fxhf-need-input", "Mon propre besoin");
  input.blur();
  clock.tick(5000);
  assert.equal(prompt.hidden, true);
  assert.equal(input.value, "Mon propre besoin");
  input.focus();
  s.change("fxhf-need-input", "");
  input.blur();
  clock.tick(600);
  assert.equal(prompt.hidden, true);
  clock.tick(150);
  assert.equal(prompt.hidden, false);
  s.w.MediaRecorder = function () {};
  Object.defineProperty(s.w.navigator, "mediaDevices", {
    value: { getUserMedia: () => new Promise(() => {}) },
  });
  s.q("fxhf-mic").click();
  clock.tick(10000);
  assert.equal(
    prompt.hidden,
    true,
    "permission prompt stops decorative typing",
  );
  assert.equal(s.calls.length, 0);
});
test("Smart RAFI offers 24 alternating trade examples without changing draft or safety", async (t) => {
  let clock;
  const s = setup(t, { configure(w) { clock = promptClock(w); } });
  await new Promise((r) => setTimeout(r, 0));
  const prompt = s.q("fxhf-root").querySelector(".fxhf-smart-prompt");
  const seen = new Map();
  for (let i = 0; i < 1150; i++) {
    clock.tick(100);
    if (prompt.classList.contains("fxhf-prompt-pause"))
      seen.set(prompt.textContent, prompt.querySelector("span").lang);
    assert.equal(s.q("fxhf-need-input").value, "");
    assert.equal(s.q("fxhf-root").dataset.fxhfState, "need");
  }
  assert.equal(seen.size, 24);
  assert.deepEqual([...seen.values()], Array.from({ length: 24 }, (_, i) => i % 2 ? "ary-Latn" : "fr"));
  for (const [phrase, lang] of seen) {
    assert.ok(phrase.length <= 34, phrase);
    if (lang === "ary-Latn") assert.equal(/\p{Script=Arabic}/u.test(phrase), false);
  }
  assert.match([...seen.keys()].join(" "), /étincelles/);
  assert.equal(s.calls.length, 0, "even a decorative danger example never reaches the API");
});
test("Smart RAFI stops for photo choices and returns only to empty blurred input", async (t) => {
  let clock;
  const s = setup(t, { configure(w) { clock = promptClock(w); } });
  await new Promise((r) => setTimeout(r, 0));
  const prompt = s.q("fxhf-root").querySelector(".fxhf-smart-prompt");
  clock.tick(1000);
  assert.equal(prompt.hidden, false);
  s.q("fxhf-show").click();
  assert.equal(prompt.hidden, true);
  s.w.document.dispatchEvent(new s.w.Event("visibilitychange"));
  clock.tick(15000);
  assert.equal(prompt.hidden, true);
  assert.equal(clock.pending(), 0);
  s.q("fxhf-show").click();
  clock.tick(1000);
  assert.equal(prompt.hidden, false);
  s.change("fxhf-need-input", "Ma propre description");
  s.q("fxhf-show").click();
  s.photo();
  clock.tick(15000);
  assert.equal(prompt.hidden, true);
  assert.equal(s.q("fxhf-need-input").value, "Ma propre description");
  assert.equal(s.calls.length, 0);
});
for (const width of [320, 390]) {
  test(`Floating actions avoid CTA, heading and cards after Hero at ${width}px`, async (t) => {
    let targetRect;
    const s = setup(t, {
      configure(w) {
        Object.defineProperty(w, "innerWidth", { value: width });
        const main = w.document.createElement("main");
        main.innerHTML = '<h2>Titre important</h2><button>Continuer</button><article class="feature-card">Contenu</article>';
        w.document.body.append(main);
        for (const el of main.children) el.getBoundingClientRect = () => targetRect;
        targetRect = { left: 0, right: width, top: 400, bottom: 500, width, height: 100 };
        w.document.getElementById("fxhf-root").getBoundingClientRect = () => ({ top: -600, bottom: -10, width });
        w.document.getElementById("fixeo-urgent-fab").getBoundingClientRect = () => ({ left: 14, right: 114, top: 470, bottom: 518, width: 100, height: 48 });
        w.document.querySelector(".chat-widget").getBoundingClientRect = () => ({ left: width - 68, right: width - 14, top: 470, bottom: 524, width: 54, height: 54 });
      },
    });
    const body = s.w.document.body;
    await wait(() => body.classList.contains("fxhf-urgent-obscured"));
    assert.equal(body.classList.contains("fxhf-chat-obscured"), true);
    assert.equal(body.classList.contains("fxhf-immersive"), false);
    targetRect = { left: 0, right: width, top: 100, bottom: 300, width, height: 200 };
    s.w.dispatchEvent(new s.w.Event("scroll"));
    await wait(() => !body.classList.contains("fxhf-urgent-obscured"));
    assert.equal(body.classList.contains("fxhf-chat-obscured"), false);
    s.q("fxhf-root").getBoundingClientRect = () => ({ top: 0, bottom: 568, width });
    s.w.dispatchEvent(new s.w.Event("scroll"));
    await wait(() => body.classList.contains("fxhf-immersive"));
    assert.equal(s.calls.length, 0);
  });
}
test("Smart RAFI reduced-motion stays static, reacts to preference changes, and stops on pagehide", async (t) => {
  let clock;
  const s = setup(t, {
    configure(w) {
      clock = promptClock(w, true);
    },
  });
  await new Promise((r) => setTimeout(r, 0));
  const input = s.q("fxhf-need-input"),
    prompt = s.q("fxhf-root").querySelector(".fxhf-smart-prompt");
  clock.tick(10000);
  assert.equal(prompt.hidden, true);
  assert.equal(input.placeholder, "Décrivez votre problème…");
  assert.equal(clock.pending(), 0);
  clock.reduce(false);
  clock.tick(1000);
  assert.equal(prompt.hidden, false);
  clock.reduce(true);
  assert.equal(prompt.hidden, true);
  assert.equal(clock.pending(), 0);
  clock.reduce(false);
  clock.tick(1000);
  s.w.dispatchEvent(new s.w.Event("pagehide"));
  assert.equal(prompt.hidden, true);
  assert.equal(clock.pending(), 0);
  assert.equal(input.value, "");
});
test("Hero viewport manager reserves visible keyboard height and restores floating controls on leaving Hero", async (t) => {
  const s = setup(t, {
    configure(w) {
      const viewport = new w.EventTarget();
      viewport.height = 844;
      viewport.offsetTop = 0;
      Object.defineProperty(w, "visualViewport", { value: viewport });
      Object.defineProperty(w, "innerWidth", { value: 390 });
      Object.defineProperty(w, "innerHeight", { value: 844 });
      const header = w.document.createElement("header");
      header.className = "fixeo-gh-universal-shell";
      header.getBoundingClientRect = () => ({ top: 0, bottom: 64, height: 64 });
      w.document.body.prepend(header);
      w.document.getElementById("fxhf-root").getBoundingClientRect = () => ({
        top: 64,
        bottom: 844,
        width: 390,
      });
    },
  });
  await wait(() => s.w.document.body.classList.contains("fxhf-immersive"));
  assert.equal(
    s.q("fxhf-root").style.getPropertyValue("--fxhf-header-height"),
    "64px",
  );
  s.q("fxhf-need-input").focus();
  s.w.visualViewport.height = 340;
  s.w.visualViewport.offsetTop = 20;
  s.w.visualViewport.dispatchEvent(new s.w.Event("resize"));
  await wait(() => s.w.document.body.classList.contains("fxhf-keyboard"));
  assert.equal(
    s.q("fxhf-root").style.getPropertyValue("--fxhf-keyboard-top"),
    "64px",
  );
  assert.equal(
    s.q("fxhf-root").style.getPropertyValue("--fxhf-keyboard-height"),
    "296px",
  );
  assert.equal(s.q("fxhf-need-input").matches(":disabled"), false);
  s.q("outside").focus();
  s.w.visualViewport.height = 844;
  s.w.visualViewport.offsetTop = 0;
  s.q("fxhf-root").getBoundingClientRect = () => ({
    top: -900,
    bottom: -56,
    width: 390,
  });
  s.w.dispatchEvent(new s.w.Event("scroll"));
  await wait(() => !s.w.document.body.classList.contains("fxhf-immersive"));
  assert.equal(s.w.document.body.classList.contains("fxhf-keyboard"), false);
  assert.equal(s.q("fixeo-urgent-fab").hasAttribute("style"), false);
  assert.equal(
    s.w.document.querySelector(".chat-widget").hasAttribute("style"),
    false,
  );
});
test("Hero premium preserves three photos, safety signals and primary footer through result/confirmation/success", async (t) => {
  const s = setup(t);
  s.fill();
  s.photo();
  s.photo();
  s.photo();
  assert.equal(s.q("fxhf-photos").querySelectorAll("figure").length, 3);
  assert.match(s.q("fxhf-photos").textContent, /3 photos prêtes/);
  s.q("fxhf-submit").click();
  await s.until(() => s.q("fxhf-root").dataset.fxhfState === "safety");
  assert.equal(
    s.q("fxhf-panel").querySelectorAll(".fxhf-hazards input").length,
    7,
  );
  assert.match(s.q("fxhf-panel").textContent, /aucune manipulation/);
  function footer() {
    const actions = s.q("fxhf-actions"),
      scroll = s.q("fxhf-root").querySelector(".fxhf-scroll");
    assert.equal(
      scroll.contains(actions),
      false,
      "CTA must occupy its own grid row",
    );
    assert.equal(actions.querySelectorAll(".fxhf-submit").length, 1);
  }
  footer();
  s.click("Retour");
  await s.until(() => s.q("fxhf-submit"));
  assert.equal(s.q("fxhf-photos").querySelectorAll("figure").length, 3);
  assert.equal(s.q("fxhf-location").value, "rabat");
  await s.analyze();
  footer();
  const optional = s.q("fxhf-root").querySelector(".fxhf-optional");
  assert.equal(optional.open, false);
  optional.open = true;
  assert.equal(optional.contains(s.q("fxhf-diagnostic")), true);
  assert.equal(optional.contains(s.q("fxhf-estimation")), true);
  s.q("fxhf-entrust").click();
  await s.until(() => s.q("fxhf-phone"));
  footer();
  assert.match(
    s.q("fxhf-panel").querySelector(".fxhf-recap summary").textContent,
    /Plombier.*Rabat/,
  );
  s.change("fxhf-phone", "0600000000");
  s.q("fxhf-confirm").click();
  await s.until(() => s.q("fxhf-root").dataset.fxhfState === "matching");
  footer();
  assert.equal(s.counts().confirmCount, 1);
  assert.equal(
    s.q("fxhf-root").querySelectorAll(".fxhf-lifecycle .done").length,
    2,
    "no fabricated matching/dispatch success",
  );
  assert.match(
    s.q("fxhf-root").querySelector(".fxhf-reference").textContent,
    /FX-FIXTURE/,
  );
});
