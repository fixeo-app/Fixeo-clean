"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const {
  qualificationQuestions,
} = require("../../api/diagnostic/question-routing");
const {
  qualified,
  confirmationContext,
  confirmIntervention,
  interventionStatus,
} = require("../../api/diagnostic/intervention");
const { RISK_VERSION } = require("../../api/diagnostic/safety");
const env = { FIXEO_ESTIMATOR_SECRET: "fixture-only-not-a-real-secret" };
const actor = "g:" + "a".repeat(64);
function dossier(level = "TECHNICAL") {
  const id = randomUUID(),
    runId = randomUUID();
  return {
    session: {
      id,
      revision: 1,
      selected_run_id: runId,
      state: "ready",
      city_slug: "rabat",
      input: {
        description: "Robinet à faire vérifier.",
        answers: { onset: "unknown" },
      },
    },
    run: {
      id: runId,
      revision: 1,
      state: "complete",
      result: {
        safety: {
          version: RISK_VERSION,
          level,
          stop: level === "CRITICAL",
          urgency:
            level === "CRITICAL"
              ? "now"
              : level === "URGENT"
                ? "urgent"
                : "normale",
        },
        trade: { value: "plomberie" },
        problem: { value: "Robinet à vérifier" },
        questions: [],
      },
    },
  };
}
const bodyFor = (d) => ({
  revision: 1,
  run_id: d.run.id,
  client_phone: "06 00 00 00 00",
});
const photo = [
  { status: "informative", observations: [{ text: "Cache fissuré" }] },
];
const questionModel = {
  trade: "autre",
  problem: "Nature à préciser",
  question_ids: ["onset", "affected_area", "occurrence", "gas_smell"],
};
for (const [name, input, model, photos, expected] of [
  [
    "informative evidence and qualified trade: zero questions",
    { description: "Poignée cassée", answers: {} },
    { ...questionModel, trade: "menuiserie", problem: "Poignée à remplacer" },
    photo,
    [],
  ],
  [
    "ambiguous photo: only a relevant area question",
    { description: "Que faire ?", answers: {} },
    questionModel,
    photo,
    ["affected_area"],
  ],
  [
    "unknown/skipped answers are never asked again",
    {
      description: "",
      answers: { onset: "unknown", affected_area: "unknown" },
    },
    questionModel,
    [],
    [],
  ],
  [
    "maximum two questions across rounds",
    {
      description: "",
      answers: {
        onset: "unknown",
        affected_area: "Mur",
        occurrence: "unknown",
      },
    },
    questionModel,
    [],
    [],
  ],
  [
    "known onset/area/frequency are not asked again",
    { description: "Depuis hier fuite sous le lavabo en continu", answers: {} },
    questionModel,
    [],
    [],
  ],
  [
    "unrelated gas and structure questions omitted",
    { description: "Serrure bloquée à faire vérifier.", answers: {} },
    {
      trade: "serrurerie",
      problem: "Serrure bloquée",
      question_ids: ["gas_smell", "structure_moving", "smoke_sparks"],
    },
    [],
    [],
  ],
])
  test(name, () =>
    assert.deepEqual(
      qualificationQuestions(input, model, photos, { stop: false }).map(
        (q) => q.id,
      ),
      expected,
    ),
  );
test("critical routing never yields qualification questions", () =>
  assert.deepEqual(
    qualificationQuestions({}, questionModel, [], { stop: true }),
    [],
  ));
for (const [trade, options, hazard] of [
  ["plomberie", ["Robinet / évier", "WC", "Douche / baignoire", "Canalisation"], "water_spreading"],
  ["electricite", ["Prise / interrupteur", "Éclairage", "Tableau électrique", "Appareil"], "smoke_sparks"],
  ["climatisation", ["Unité intérieure", "Unité extérieure", "Plusieurs unités"], null],
  ["maconnerie", ["Mur", "Plafond", "Sol", "Façade"], "structure_moving"],
  ["autre", ["À l’intérieur", "À l’extérieur", "Plusieurs endroits"], null],
]) {
  test(`area choices match ${trade}, never another trade's surfaces`, () => {
    const input = { description: "À préciser", answers: {} };
    const model = { ...questionModel, trade };
    const questions = qualificationQuestions(input, model, [], { stop: false });
    assert.deepEqual(questions.find(q => q.id === "affected_area").options, options);
    assert(questions.every(q => q.optional));
    assert(questions.length <= 2);
    if (hazard) {
      const description = trade === "plomberie" ? "Une fuite d’eau" : "Un problème à préciser";
      assert.deepEqual(qualificationQuestions({ description, answers: {} },
        { ...model, question_ids: [hazard] }, [], { stop: false }).map(q => q.id), [hazard]);
    }
  });
}
for (const [trade, description, question] of [
  ["plomberie", "Une fuite", "onset"],
  ["plomberie", "Sous mon lavabo", "affected_area"],
  ["electricite", "Ma prise ne fonctionne plus", "affected_area"],
  ["climatisation", "L’unité extérieure fait du bruit", "affected_area"],
  ["maconnerie", "Une fissure sur mon mur", "affected_area"],
  ["serrurerie", "Ma porte est bloquée", "affected_area"],
  ["serrurerie", "Clé perdue", "occurrence"],
]) {
  test(`already-known ${trade} facts skip ${question}: ${description}`, () => {
    assert.deepEqual(qualificationQuestions({ description, answers: {} },
      { trade, problem: description, question_ids: [question] }, [], { stop: false }), []);
  });
}
test("clear locksmith needs zero questions, including a short description", () => {
  for (const description of ["Ma porte est bloquée", "Porte claquée", "Clé cassée", "J’ai perdu ma clé"]) {
    assert.deepEqual(qualificationQuestions({ description, answers: {} }, {
      trade: "serrurerie", problem: description,
      question_ids: ["affected_area", "onset", "occurrence"],
    }, [], { stop: false }), []);
  }
});
test("two questions total, including optional/skipped answers over later rounds", () => {
  const input = { description: "Un souci", answers: {} };
  const first = qualificationQuestions(input, questionModel, [], { stop: false });
  assert.equal(first.length, 2);
  input.answers[first[0].id] = "unknown";
  assert.equal(qualificationQuestions(input, questionModel, [], { stop: false }).length, 1);
  input.answers[first[1].id] = "unknown";
  assert.deepEqual(qualificationQuestions(input, questionModel, [], { stop: false }), []);
});
test("photo facts and the effective electrical risk trade control area routing", () => {
  const model = { ...questionModel, trade: "climatisation", question_ids: ["affected_area"] };
  assert.deepEqual(qualificationQuestions({ description: "Un problème", answers: {} }, model,
    [{ status: "informative", observations: [{ text: "Unité extérieure visible" }] }], { stop: false }), []);
  const [question] = qualificationQuestions({ description: "Un problème", answers: {} }, model,
    [], { stop: false, signals: ["electrical_risk"] });
  assert.deepEqual(question.options, ["Prise / interrupteur", "Éclairage", "Tableau électrique", "Appareil"]);
});
test("exact selected run, revision, completed state and current risk contract required", () => {
  const d = dossier();
  assert.equal(qualified(d, 1, d.run.id), d.run.result);
  for (const [revision, run] of [
    [2, d.run.id],
    [1, randomUUID()],
    [1, undefined],
  ])
    assert.throws(
      () => qualified(d, revision, run),
      /DIAGNOSTIC_NOT_QUALIFIED/,
    );
  d.run.result.safety.stop = true;
  assert.throws(() => qualified(d, 1, d.run.id), /DIAGNOSTIC_NOT_QUALIFIED/);
});
test("reuse only the authenticated owner profile phone", async () => {
  const d = dossier();
  d.session.owner_user_id = randomUUID();
  let requested;
  const context = await confirmationContext({
    data: d,
    body: bodyFor(d),
    transport: {
      request: async (url) => {
        requested = new URL(url, "https://fixture.invalid");
        return [{ phone: "+212 600000000" }];
      },
    },
  });
  assert.equal(context.client_phone, "+212600000000");
  assert.equal(
    requested.searchParams.get("id"),
    "eq." + d.session.owner_user_id,
  );
});
for (const level of ["TECHNICAL", "URGENT"])
  test(
    level +
      " uses canonical quote RPC, server facts and deterministic retry credentials",
    async () => {
      const data = dossier(level),
        calls = [],
        id = randomUUID();
      const transport = {
        rpc: async (name, params) => {
          calls.push({ name, params });
          return { ok: true, request_id: id };
        },
        request: async () => {
          throw Error("read offline");
        },
      };
      const body = {
        ...bodyFor(data),
        city_slug: "fake",
        trade: "fake",
        urgency: "now",
      };
      const a = await confirmIntervention({
          data,
          body,
          actor,
          transport,
          env,
        }),
        b = await confirmIntervention({ data, body, actor, transport, env });
      assert.equal(a.guest_token, b.guest_token);
      assert.equal(a.progress.sync_pending, true);
      assert.equal(a.request_id, id);
      assert.equal(calls.length, 2);
      assert.equal(calls[0].name, "create_diagnostic_quote_request_v1");
      assert.deepEqual(calls[0].params, calls[1].params);
      assert.equal(calls[0].params.p_city_slug, "rabat");
      assert.equal(calls[0].params.p_service_category, "plomberie");
      assert.deepEqual(calls[0].params.p_diagnostic.qualification_answers, [
        { question_id: "onset", value: "unknown" },
      ]);
    },
  );
test("critical acknowledgement cannot be skipped, falsified or used for another run", async () => {
  const data = dossier("CRITICAL");
  let calls = 0;
  const transport = {
    rpc: async () => {
      calls++;
    },
  };
  for (const acknowledgement of [
    undefined,
    { accepted: false },
    { accepted: true, version: "fixeo-critical-ack-v1", run_id: randomUUID() },
  ])
    await assert.rejects(
      confirmIntervention({
        data,
        body: { ...bodyFor(data), acknowledgement },
        actor,
        transport,
        env,
      }),
      /SAFETY_ACKNOWLEDGEMENT_REQUIRED/,
    );
  assert.equal(calls, 0);
});
for (const [label, sr, queue, notices, missions, stage] of [
  [
    "queue is not contact",
    "new",
    [{ execution_status: "QUEUED" }],
    [],
    [],
    "dispatch_prepared",
  ],
  [
    "CONTACTED alone is not delivery",
    "new",
    [{ execution_status: "CONTACTED" }],
    [],
    [],
    "registered",
  ],
  [
    "outbox pending is not sent",
    "new",
    [],
    [{ notification_status: "PENDING" }],
    [],
    "dispatch_prepared",
  ],
  [
    "SENT without delivery evidence is not sent",
    "new",
    [],
    [{ notification_status: "SENT" }],
    [],
    "registered",
  ],
  [
    "real send is not acceptance",
    "new",
    [],
    [
      {
        notification_status: "SENT",
        sent_at: "fixture",
        provider_message_id: "private-fixture-id",
      },
    ],
    [],
    "notification_sent",
  ],
  [
    "assigned without mission remains unconfirmed",
    "assigned",
    [],
    [],
    [],
    "registered",
  ],
  [
    "assigned with pending mission is confirmed",
    "assigned",
    [],
    [],
    [{ status: "pending" }],
    "artisan_confirmed",
  ],
  [
    "in progress mission",
    "in_progress",
    [],
    [],
    [{ status: "pending" }],
    "intervention",
  ],
  ["finished mission", "completed", [], [], [{ status: "done" }], "completed"],
  ["cancelled request", "cancelled", [], [], [], "cancelled"],
])
  test("truthful lifecycle: " + label, async () => {
    const id = randomUUID(),
      paths = [];
    const transport = {
      request: async (url) => {
        paths.push(url);
        return url.includes("/service_requests?")
          ? [{ status: sr, urgency: "normale" }]
          : url.includes("/dispatch_execution_queue?")
            ? queue
            : url.includes("/dispatch_notification_outbox?")
              ? notices
              : missions;
      },
    };
    const r = await interventionStatus(
      { session: { service_request_id: id } },
      transport,
    );
    assert.equal(r.stage, stage);
    assert.ok(paths.every((p) => decodeURIComponent(p).includes("eq." + id)));
    assert.doesNotMatch(JSON.stringify(r), /private-fixture-id/);
  });
test("followup failures preserve registration and require only a read retry", async () => {
  const id = randomUUID();
  const r = await interventionStatus(
    { session: { service_request_id: id } },
    {
      request: async () => {
        throw Error("offline");
      },
    },
  );
  assert.deepEqual(r, {
    request_id: id,
    stage: "registered",
    matching: "unconfirmed",
    notification: "unconfirmed",
    sync_pending: true,
  });
});

const { createHandler } = require("../../api/diagnostic");
const { config } = require("../../api/diagnostic/config");
const { DiagnosticError } = require("../../api/diagnostic/transport");
for (const action of [
  "confirmation_context",
  "confirm_intervention",
  "intervention_status",
])
  test(
    action + " retains same-origin, owner lock and quota gates",
    async () => {
      const data = dossier(),
        requestId = randomUUID(),
        calls = [];
      if (action === "intervention_status") {
        data.session.state = "bound";
        data.session.service_request_id = requestId;
      }
      const apiEnv = {
          ...env,
          NODE_ENV: "test",
          FIXEO_DIAGNOSTIC_SECRET: "fixture-diagnostic-key".repeat(2),
        },
        cfg = { ...config(apiEnv), enabled: true };
      let unauthorized = false;
      const handler = createHandler({
        env: apiEnv,
        cfg,
        logger: { warn() {} },
        mediaStore: {},
        transport: {
          rpc: async (name, args) => {
            calls.push(name);
            if (name === "diagnostic_quota_v1") return {};
            if (name === "diagnostic_state_v1") {
              assert.equal(args.p_action, "get");
              if (unauthorized)
                throw new DiagnosticError("DIAGNOSTIC_NOT_FOUND", 404);
              return data;
            }
            assert.equal(name, "create_diagnostic_quote_request_v1");
            return { ok: true, request_id: requestId };
          },
          request: async () => [{ status: "new", urgency: "normale" }],
        },
      });
      const req = {
        method: "POST",
        headers: {
          origin: cfg.origin,
          "content-type": "application/json",
          "x-fixeo-diagnostic": "1",
          cookie: cfg.cookie + "=" + "a".repeat(64),
        },
        body: {
          action,
          session_id: data.session.id,
          ...bodyFor(data),
          request_id: randomUUID(),
        },
      };
      const res = {
        setHeader() {},
        status(code) {
          this.code = code;
          return this;
        },
        json(value) {
          this.value = value;
          return this;
        },
      };
      await handler(req, res);
      assert.equal(res.code, 200);
      assert.deepEqual(calls.slice(0, 3), [
        "diagnostic_quota_v1",
        "diagnostic_quota_v1",
        "diagnostic_state_v1",
      ]);
      calls.length = 0;
      unauthorized = true;
      await handler(req, res);
      assert.equal(res.code, 404);
      assert.ok(!calls.includes("create_diagnostic_quote_request_v1"));
      calls.length = 0;
      req.headers.origin = "https://untrusted.invalid";
      await handler(req, res);
      assert.equal(res.code, 403);
      assert.deepEqual(calls, []);
    },
  );
