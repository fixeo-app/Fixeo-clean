"use strict";
// Controlled E2E: actual modal + safety/grounding engine + confirmation service
// + existing production SQL RPCs in ephemeral PostgreSQL. Storage/AI/delivery
// are fixtures. No Supabase, notifications, live quota or business rows touched.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const { JSDOM } = require("jsdom");
const { analyze } = require("../../api/diagnostic/engine");
const { hash } = require("../../api/diagnostic/auth");
const { photoObservations } = require("../../api/diagnostic/photo-grounding");
const {
  confirmationContext,
  confirmIntervention,
  interventionStatus,
} = require("../../api/diagnostic/intervention");
const root = path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const actor = "g:" + "a".repeat(64),
  env = { FIXEO_ESTIMATOR_SECRET: "fixture-only-not-a-real-secret" };
const wait = async (predicate) => {
  for (let i = 0; i < 500; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error("UI did not reach expected state");
};
const tick = () => new Promise((r) => setTimeout(r, 10));

test("A–O Diagnostic intervention controlled E2E matrix", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE public.profiles(id uuid PRIMARY KEY,phone text);
  CREATE TABLE public.service_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_category text, city text, description text, client_phone text,
    urgency text CHECK(urgency IN ('normale','urgent','now')), status text CHECK(status IN ('new','assigned','in_progress','completed','validated','cancelled','no_match')), idempotency_key text UNIQUE, tracking_ref text, guest_token_hash text, client_profile_id uuid, pricing_offer_id uuid);
  CREATE TABLE public.dispatch_execution_queue(request_id uuid,execution_status text);
  CREATE TABLE public.dispatch_notification_outbox(request_id uuid,notification_type text,notification_status text,sent_at timestamptz,provider_message_id text);
  CREATE TABLE public.missions(request_id text,status text);
  CREATE FUNCTION public.dispatch_execute_v1(p_id uuid,p_n integer) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
    IF EXISTS(SELECT FROM public.service_requests WHERE id=p_id AND description LIKE '%DB_ROLLBACK_FIXTURE%') THEN RAISE EXCEPTION 'FIXTURE_MATCHING_FAILURE'; END IF;
    INSERT INTO public.dispatch_execution_queue VALUES(p_id,'QUEUED'); END $$;
  CREATE FUNCTION public.trigger_dispatch_v2_on_service_request() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.status='new' THEN PERFORM public.dispatch_execute_v1(NEW.id,3); END IF; RETURN NEW; END $$;
  CREATE TRIGGER trg_dispatch_v2_on_service_request AFTER INSERT ON public.service_requests FOR EACH ROW EXECUTE FUNCTION public.trigger_dispatch_v2_on_service_request();`);
  await db.exec(
    read("supabase/migrations/20260921174531_diagnostic_foundation_v1.sql"),
  );
  await db.exec(
    "ALTER TABLE fixeo_private.diagnostic_sessions_v1 ADD booking_context jsonb",
  );
  const bridge = read(
    "supabase/migrations/20260922014439_diagnostic_bridge_preserve_estimation_v1.sql",
  );
  for (const fn of [
    "fixeo_private.diagnostic_booking_context_v1",
    "fixeo_private.diagnostic_bind_v1",
    "public.create_diagnostic_quote_request_v1",
  ])
    await db.exec(
      bridge.match(
        new RegExp(
          "CREATE FUNCTION " +
            fn.replaceAll(".", "\\.") +
            "[\\s\\S]*?END \\$fn\\$;",
        ),
      )[0],
    );
  await db.exec(
    read(
      "supabase/migrations/20260922161825_diagnostic_critical_request_v2.sql",
    ),
  );
  const count = async (id) =>
    (
      await db.query(
        "SELECT count(*)::int n FROM public.service_requests WHERE idempotency_key IN ($1,$2)",
        ["diagnostic-quote:" + id, "diagnostic-critical:" + id],
      )
    ).rows[0].n;
  const dataFor = async (id) => {
    const session = (
      await db.query(
        "SELECT to_jsonb(s) value FROM fixeo_private.diagnostic_sessions_v1 s WHERE id=$1",
        [id],
      )
    ).rows[0].value;
    const run = session.selected_run_id
      ? (
          await db.query(
            "SELECT to_jsonb(r) value FROM fixeo_private.diagnostic_runs_v1 r WHERE id=$1",
            [session.selected_run_id],
          )
        ).rows[0].value
      : null;
    return { session, run };
  };
  async function setup(st, opts = {}) {
    const dom = new JSDOM(
      '<button id="opener">Ouvrir</button><button id="fixeo-urgent-fab">Urgence</button><div class="chat-widget">WhatsApp</div>',
      {
        url: "https://fixture.invalid",
        runScripts: "outside-only",
        pretendToBeVisual: true,
      },
    );
    st.after(() => dom.window.close());
    const w = dom.window,
      calls = [],
      photos = [],
      id = randomUUID();
    let session,
      lost = !!opts.lost,
      offline = false,
      held;
    const transport = {
      rpc: async (name, params) => {
        assert.ok(
          [
            "create_diagnostic_quote_request_v1",
            "create_diagnostic_critical_request_v1",
          ].includes(name),
        );
        const values = Object.values(params).map((v) =>
          typeof v === "object" ? JSON.stringify(v) : v,
        );
        return (
          await db.query(
            "SELECT public." +
              name +
              "(" +
              values.map((_, i) => "$" + (i + 1)).join(",") +
              ") value",
            values,
          )
        ).rows[0].value;
      },
      request: async (raw) => {
        if (offline) throw Error("Followup unavailable");
        const url = new URL(raw, "https://fixture.invalid"),
          table = url.pathname.split("/").pop();
        assert.ok(
          [
            "service_requests",
            "profiles",
            "dispatch_execution_queue",
            "dispatch_notification_outbox",
            "missions",
          ].includes(table),
        );
        const columns = url.searchParams.get("select");
        assert.match(columns, /^[a-z_,]+$/);
        const values = [],
          filters = [];
        for (const [key, value] of url.searchParams) {
          if (["select", "limit"].includes(key)) continue;
          assert.ok(
            ["id", "request_id", "notification_type", "status"].includes(key),
          );
          if (value.startsWith("eq.")) {
            values.push(value.slice(3));
            filters.push(key + "=$" + values.length);
          } else {
            assert.equal(value, "in.(pending,done,validated)");
            filters.push("status IN ('pending','done','validated')");
          }
        }
        return (
          await db.query(
            "SELECT " +
              columns +
              " FROM public." +
              table +
              " WHERE " +
              filters.join(" AND ") +
              " LIMIT " +
              Number(url.searchParams.get("limit")),
            values,
          )
        ).rows;
      },
    };
    const publicSession = async () => {
      const d = await dataFor(id);
      session = {
        ...d.session,
        result_run_id: d.run?.id,
        result: d.run?.result,
        media: photos,
        request_id: d.session.service_request_id,
      };
      return { session };
    };
    const api = async (r) => {
      calls.push(r);
      if (r.action === "create") {
        await db.query(
          `INSERT INTO fixeo_private.diagnostic_sessions_v1(id,guest_secret_hash,owner_key,city_slug,input,consent_version,expires_at) VALUES($1,$2,$3,$4,$5,'diagnostic-privacy-v1',now()+interval '24 hours')`,
          [id, "a".repeat(64), actor, r.city_slug, JSON.stringify(r.input)],
        );
        return publicSession();
      }
      if (r.action === "get") return publicSession();
      if (r.action === "update") {
        await db.query(
          "UPDATE fixeo_private.diagnostic_sessions_v1 SET input=$2,revision=revision+1,state='draft',selected_run_id=NULL WHERE id=$1",
          [id, JSON.stringify(r.input)],
        );
        return publicSession();
      }
      if (r.action === "media_reserve") {
        photos.push({ id: randomUUID(), state: "pending", kind: "photo" });
        return {
          ...(await publicSession()),
          upload: {
            media_id: photos[0].id,
            url: "https://storage.fixture.invalid/private",
          },
        };
      }
      if (r.action === "media_validate") {
        photos[0].state = "ready";
        return publicSession();
      }
      if (r.action === "analyze") {
        const d = await dataFor(id),
          bytes = Buffer.from("private fixture photo bytes");
        const evidence = photos.map((p) => ({
          media_id: p.id,
          status: "informative",
          safety_signals: [],
          observations: [
            { text: "La poignée présente une fissure.", location: "au centre" },
          ],
        }));
        const ambiguous =
          opts.ambiguous && !Object.keys(d.session.input.answers).length;
        const model = {
          trade: ambiguous ? "autre" : "menuiserie",
          problem: ambiguous
            ? "Nature à préciser"
            : "Poignée à faire vérifier par un professionnel.",
          observations: photoObservations(evidence),
          hypotheses: ["Usure possible."],
          urgency: "moderate",
          urgency_reason: "Une vérification est recommandée.",
          checks: [],
          possible_parts: [],
          question_ids: opts.ambiguous
            ? ["onset", "affected_area", "occurrence"]
            : ["onset"],
          safety_signals: [],
        };
        const result = (
          await analyze(
            {
              input: d.session.input,
              media: photos.map((p) => ({
                id: p.id,
                path: p.id,
                sha256: hash(bytes),
              })),
            },
            {
              provider: {
                analyze: async () => ({
                  result: model,
                  photoEvidence: evidence,
                  usage: {},
                }),
              },
              mediaStore: { download: async () => bytes },
            },
          )
        ).result;
        const run = randomUUID();
        await db.query(
          `INSERT INTO fixeo_private.diagnostic_runs_v1(id,session_id,revision,state,input_snapshot,result,provider,model,contract_version,reserved_micro_usd,finished_at) VALUES($1,$2,$3,'complete','{}',$4,'fixture','fixture','fixeo-diagnostic-v1',0,now())`,
          [run, id, d.session.revision, JSON.stringify(result)],
        );
        await db.query(
          "UPDATE fixeo_private.diagnostic_sessions_v1 SET selected_run_id=$2,state='ready' WHERE id=$1",
          [id, run],
        );
        return publicSession();
      }
      const data = await dataFor(id),
        args = { data, body: r, transport, actor, env };
      if (r.action === "confirmation_context") return confirmationContext(args);
      if (r.action === "intervention_status")
        return {
          ok: true,
          progress: await interventionStatus(data, transport),
        };
      if (r.action === "confirm_intervention") {
        if (opts.hold)
          await new Promise((resolve) => {
            held = resolve;
          });
        const saved = await confirmIntervention(args);
        if (opts.postFailure) {
          offline = true;
          saved.progress = await interventionStatus(
            await dataFor(id),
            transport,
          );
        }
        if (lost) {
          lost = false;
          throw Error("Network response lost after commit");
        }
        return saved;
      }
      throw Error("Unexpected " + r.action);
    };
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    w.HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
    w.URL.createObjectURL = () => "blob:fixture";
    w.URL.revokeObjectURL = () => {};
    w.XMLHttpRequest = class {
      constructor() {
        this.upload = {};
      }
      open() {}
      setRequestHeader() {}
      send(file) {
        assert.ok(file.size);
        this.status = 200;
        this.onload();
      }
    };
    w.FixeoDiagnostic = { setActive() {}, api, saveTracking() {} };
    w.FixeoEstimatorV2 = {
      open() {
        throw Error("Forbidden Estimation redirect");
      },
    };
    w.eval(read("js/fixeo-diagnostic-modal-v1.js"));
    const q = (id) => w.document.getElementById(id),
      change = (id, value) => {
        const el = q(id);
        if (el.type === "checkbox") el.checked = value;
        else el.value = value;
        el.dispatchEvent(new w.Event("input", { bubbles: true }));
        el.dispatchEvent(new w.Event("change", { bubbles: true }));
      };
    const clickNext = () => q("fxdiag-next").click();
    await w.FixeoDiagnosticModal.open({ opener: q("opener") });
    change(
      "fxdiag-description",
      opts.description || "Ma poignée ne fonctionne plus.",
    );
    change("fxdiag-city", "rabat");
    change("fxdiag-consent", true);
    if (opts.photo !== false) {
      const field = q("fxdiag-files");
      Object.defineProperty(field, "files", {
        value: [
          new w.File([new Uint8Array(100)], "photo.jpg", {
            type: "image/jpeg",
          }),
        ],
      });
      field.dispatchEvent(new w.Event("change"));
    }
    clickNext();
    await tick();
    clickNext();
    await wait(
      () =>
        q("fxdiag-next") &&
        (!q("fxdiag-next").disabled || q("fxdiag-critical-ack")) &&
        !q("fxdiag-work-status"),
    );
    const confirmScreen = async () => {
      clickNext();
      await wait(() => q("fxdiag-confirm-phone") || q("fxdiag-critical-phone"));
    };
    const confirm = async () => {
      await confirmScreen();
      change(
        q("fxdiag-critical-phone")
          ? "fxdiag-critical-phone"
          : "fxdiag-confirm-phone",
        "0600000000",
      );
      clickNext();
      await wait(
        () =>
          w.document.body.textContent.includes("FIXEO prend en charge") ||
          w.document.body.textContent.includes(
            "Demande critique enregistrée",
          ) ||
          w.document.body.textContent.includes("Réessayer"),
      );
    };
    return {
      w,
      q,
      change,
      clickNext,
      id,
      calls,
      api,
      transport,
      confirm,
      confirmScreen,
      release: async () => {
        await wait(() => !!held);
        held();
      },
      text: () => w.document.body.textContent,
      session: () => session,
    };
  }
  await t.test(
    "A/F/L photo informative → zero questions → confirmation → one canonical technical request; no Estimation",
    async (st) => {
      const s = await setup(st);
      assert.equal(s.w.document.querySelector(".fxdiag-quick-answers"), null);
      await s.confirm();
      assert.equal(await count(s.id), 1);
      const d = await dataFor(s.id);
      assert.equal(d.session.state, "bound");
      assert.equal(d.run.result.safety.level, "TECHNICAL");
      assert.match(s.text(), /notification/);
      assert.ok(!s.calls.some((c) => c.action === "handoff"));
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int n FROM dispatch_execution_queue WHERE request_id=$1",
            [d.session.service_request_id],
          )
        ).rows[0].n,
        1,
      );
    },
  );
  for (const [label, choice] of [
    ["B", "quick"],
    ["C", "unknown"],
    ["D", "skip"],
    ["E", "blank"],
    ["E2", "custom"],
  ])
    await t.test(
      label +
        " adaptive one-tap optional question continues without forced keyboard",
      async (st) => {
        const s = await setup(st, { ambiguous: true });
        assert.equal(
          s.w.document.querySelectorAll(".fxdiag-question-title").length,
          1,
        );
        assert.ok(
          !["INPUT", "TEXTAREA"].includes(s.w.document.activeElement.tagName),
        );
        if (choice === "skip") s.clickNext();
        else if (["blank", "custom"].includes(choice)) {
          s.q("fxdiag-other").click();
          assert.equal(s.w.document.activeElement.id, "fxdiag-q-affected_area");
          if (choice === "custom")
            s.change("fxdiag-q-affected_area", "Équipement");
          s.q("fxdiag-save-answer").click();
        } else
          s.w.document
            .querySelector(
              '[data-answer="' +
                (choice === "unknown" ? "unknown" : "Équipement") +
                '"]',
            )
            .click();
        await wait(() => s.q("fxdiag-next")?.textContent.includes("Demander"));
        await s.confirm();
        assert.equal(await count(s.id), 1);
        assert.equal(
          (await dataFor(s.id)).session.input.answers.affected_area,
          ["unknown", "skip", "blank"].includes(choice)
            ? "unknown"
            : "Équipement",
        );
      },
    );
  await t.test(
    "G urgent noncritical continues with strong warning",
    async (st) => {
      const s = await setup(st, {
        description: "Prise cassée avec un câble apparent.",
      });
      assert.match(s.text(), /Ne touchez pas/);
      await s.confirm();
      const d = await dataFor(s.id);
      assert.equal(d.run.result.safety.level, "URGENT");
      assert.equal(
        (
          await db.query("SELECT urgency FROM service_requests WHERE id=$1", [
            d.session.service_request_id,
          ])
        ).rows[0].urgency,
        "urgent",
      );
    },
  );
  await t.test(
    "H critical acknowledgement → compact confirmation → canonical CRITICAL request",
    async (st) => {
      const s = await setup(st, { description: "Odeur de gaz forte." });
      assert.equal(s.q("fxdiag-next").disabled, true);
      s.change("fxdiag-critical-ack", true);
      await s.confirm();
      const d = await dataFor(s.id);
      assert.equal(d.session.booking_context.risk_level, "CRITICAL");
      assert.equal(d.session.booking_context.acknowledgement.accepted, true);
      assert.equal(await count(s.id), 1);
      assert.match(s.text(), /services d’urgence/);
    },
  );
  await t.test(
    "I double click and concurrent server retries create only one request and dispatch",
    async (st) => {
      const s = await setup(st, { hold: true });
      await s.confirmScreen();
      s.change("fxdiag-confirm-phone", "0600000000");
      const btn = s.q("fxdiag-next");
      btn.click();
      btn.click();
      await wait(() =>
        s.calls.some((c) => c.action === "confirm_intervention"),
      );
      await s.release();
      await wait(() => s.text().includes("FIXEO prend en charge"));
      assert.equal(
        s.calls.filter((c) => c.action === "confirm_intervention").length,
        1,
      );
      const d = await dataFor(s.id),
        body = {
          revision: d.session.revision,
          run_id: d.run.id,
          client_phone: "0600000000",
        };
      const replies = await Promise.all(
        [1, 2].map(() =>
          confirmIntervention({
            body,
            data: d,
            transport: s.transport,
            actor,
            env,
          }),
        ),
      );
      assert.equal(replies[0].request_id, replies[1].request_id);
      assert.equal(await count(s.id), 1);
    },
  );
  await t.test(
    "J lost response after commit → retry and refresh preserve the same request",
    async (st) => {
      const s = await setup(st, { lost: true });
      await s.confirm();
      assert.match(s.text(), /Réessayer/);
      const first = (await dataFor(s.id)).session.service_request_id;
      assert.equal(s.q("fxdiag-confirm-phone").value, "0600000000");
      s.clickNext();
      await wait(() => s.text().includes("FIXEO prend en charge"));
      assert.equal((await dataFor(s.id)).session.service_request_id, first);
      s.w.document.querySelector(".fxdiag-close").click();
      await s.w.FixeoDiagnosticModal.open({});
      assert.match(s.text(), /FIXEO prend en charge/);
      assert.equal(await count(s.id), 1);
    },
  );
  await t.test(
    "K committed request survives followup outage; refresh never inserts",
    async (st) => {
      const s = await setup(st, { postFailure: true });
      await s.confirm();
      assert.equal(await count(s.id), 1);
      assert.match(s.text(), /enregistrée/);
      const n = s.calls.filter(
        (c) => c.action === "confirm_intervention",
      ).length;
      s.clickNext();
      await tick();
      assert.equal(
        s.calls.filter((c) => c.action === "confirm_intervention").length,
        n,
      );
      assert.equal(await count(s.id), 1);
    },
  );
  await t.test(
    "K2 matching error inside existing insertion transaction rolls back cleanly, draft retained",
    async (st) => {
      const s = await setup(st, {
        description: "DB_ROLLBACK_FIXTURE poignée cassée",
      });
      await s.confirm();
      assert.match(s.text(), /Réessayer/);
      assert.equal(await count(s.id), 0);
      assert.equal((await dataFor(s.id)).session.state, "ready");
      assert.equal(s.q("fxdiag-confirm-phone").value, "0600000000");
    },
  );
  await t.test(
    "M confirmation back/reopen preserves city, photo, result and phone",
    async (st) => {
      const s = await setup(st);
      await s.confirmScreen();
      s.change("fxdiag-confirm-phone", "0611111111");
      s.q("fxdiag-back").click();
      await tick();
      await s.confirmScreen();
      assert.equal(s.q("fxdiag-confirm-phone").value, "0611111111");
      assert.match(s.text(), /Rabat/);
      s.w.document.querySelector(".fxdiag-close").click();
      await s.w.FixeoDiagnosticModal.open({});
      assert.equal(s.q("fxdiag-confirm-phone").value, "0611111111");
      assert.equal(s.session().media.length, 1);
      assert.equal(await count(s.id), 0);
    },
  );
  await t.test(
    "N contradictory text/photo remain distinct through result and binding",
    async (st) => {
      const s = await setup(st, {
        description: "La poignée est intacte selon moi.",
      });
      const before = (await dataFor(s.id)).run.result;
      assert.ok(
        before.facts.some(
          (f) =>
            f.provenance === "user_declared" && f.value.includes("intacte"),
        ),
      );
      assert.ok(
        before.facts.some(
          (f) => f.provenance === "observed" && f.value.includes("fissure"),
        ),
      );
      assert.match(s.text(), /Observé sur la photo/);
      assert.match(s.text(), /Votre description/);
      await s.confirm();
      assert.deepEqual((await dataFor(s.id)).run.result, before);
    },
  );
  await t.test(
    "O Diagnostic has no Estimation call; critical and grounding implementations reused",
    () => {
      const source = read("js/fixeo-diagnostic-modal-v1.js");
      assert.doesNotMatch(source, /FixeoEstimatorV2|action:\s*['"]handoff['"]/);
      assert.match(read("api/diagnostic/intervention.js"), /confirmCritical/);
    },
  );
});
