"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  createOpenAIAdapter,
} = require("../../api/diagnostic/providers/openai");
const { analyze } = require("../../api/diagnostic/engine");
const { createHandler } = require("../../api/diagnostic");
const { config } = require("../../api/diagnostic/config");
const { hash } = require("../../api/diagnostic/auth");
const { validateProviderResult } = require("../../api/diagnostic/contract");
const {
  assertTextSynthesis,
  assertPhotoObservations,
  photoObservations,
  validatePhotoEvidence,
  groundTextSynthesis,
} = require("../../api/diagnostic/photo-grounding");
const {
  groundingLogDetails,
  groundingError,
  groundingNormalizationDetails,
} = require("../../api/diagnostic/grounding-errors");
const id = "dc986e10-b315-4000-8000-2d458b457704";
const otherId = "ed986e10-b315-4000-8000-2d458b457705";
const evidence = () => [
  {
    media_id: id,
    status: "informative",
    safety_signals: ["electrical_risk"],
    observations: [
      {
        text: "Un cache de prise est cassé avec un câble apparent.",
        location: "au centre",
      },
    ],
  },
];
const synthesis = () => ({
  trade: "electricite",
  problem: "Équipement électrique détérioré à faire vérifier.",
  observations: [],
  hypotheses: ["Défaut de protection possible."],
  urgency: "high",
  urgency_reason: "Une intervention professionnelle est recommandée.",
  checks: ["Vérification visuelle sur place par un électricien."],
  possible_parts: ["Cache de prise à confirmer"],
  question_ids: [],
  safety_signals: ["electrical_risk"],
});
const env = {
  NODE_ENV: "test",
  OPENAI_API_KEY: "fixture",
  FIXEO_DIAGNOSTIC_MODEL: "fixture",
  FIXEO_DIAGNOSTIC_SECRET: "test-only-diagnostic-key".repeat(2),
};
const description = "Prise cassée avec un câble apparent.";
const input = (text = description) => ({
  description: text,
  answers: {},
  safety_signals: [],
});

// A real, non-uniform repository image exercises both adapter passes. The
// injected vision RESPONSE represents the reported damaged-socket scenario:
// this regression checks grounding/routing, not a live model's perception and
// does not claim to replay the customer's private iPhone photo.
const bytes = () =>
  fs.readFile(path.join(__dirname, "../../img/blog/electricite-blog.webp"));
function provider(photos, result, calls = []) {
  return createOpenAIAdapter({
    env,
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      const output =
        body.text.format.name === "fixeo_photo_evidence_v1"
          ? { photos }
          : result;
      return new Response(
        JSON.stringify({
          status: "completed",
          model: "fixture",
          output: [
            {
              content: [{ type: "output_text", text: JSON.stringify(output) }],
            },
          ],
        }),
      );
    },
  });
}
async function run({
  photos = evidence(),
  result = synthesis(),
  text = description,
  withPhoto = true,
} = {}) {
  const image = withPhoto ? await bytes() : null,
    calls = [];
  const out = await analyze(
    {
      input: input(text),
      media: withPhoto
        ? [{ id, path: "fixture/private.webp", sha256: hash(image) }]
        : [],
    },
    {
      provider: provider(photos, result, calls),
      mediaStore: { download: async () => image },
    },
  );
  return { ...out, calls };
}
function rejectsWith(fn, stage, condition, field) {
  assert.throws(fn, (error) => {
    assert.deepEqual(groundingLogDetails(error), {
      stage,
      condition,
      ...(field ? { field } : {}),
    });
    return true;
  });
}

test("production regression: informative electrical photo + valid literal finding + normal visual-check language yields a complete noncritical result", async () => {
  const out = await run();
  assert.equal(out.calls.length, 2);
  assert.equal(out.result.trade.value, "electricite");
  assert.equal(out.result.safety.level, "URGENT");
  assert.equal(out.result.safety.stop, false);
  assert.equal(out.result.next, "qualification");
  assert.equal(out.result.urgency.value, "high");
  assert.equal(out.result.problem.provenance, "ai_inferred");
  const observed = out.result.facts.filter((f) => f.provenance === "observed");
  assert.equal(observed.length, 1);
  assert.equal(observed[0].value, photoObservations(evidence())[0].text);
  assert.deepEqual(observed[0].media_ids, [id]);
  assert.ok(out.result.checks.includes(synthesis().checks[0]));
  assert.equal(
    out.result.facts.find((f) => f.key === "user_description").provenance,
    "user_declared",
  );
});

for (const [field, value] of [
  [
    "problem",
    "Défaut électrique à préciser ; la photo complète la description.",
  ],
  ["hypotheses", ["Défaut non visible à confirmer par un professionnel."]],
  ["urgency_reason", "L’image ne permet pas de confirmer l’état interne."],
  ["checks", ["Vérification visuelle et observation sur place recommandées."]],
  [
    "possible_parts",
    ["Cache de prise à confirmer après observation professionnelle."],
  ],
])
  test(`normal diagnostic vocabulary in ${field} is not forged photo provenance`, () => {
    assert.doesNotThrow(() =>
      assertTextSynthesis({ ...synthesis(), [field]: value }, evidence()),
    );
  });

test("photo-only inference retains isolated facts without manufacturing a customer declaration", async () => {
  const out = await run({ text: "" });
  assert.equal(out.result.next, "qualification");
  assert.equal(out.result.trade.value, "electricite");
  assert.equal(
    out.result.facts.filter((f) => f.provenance === "observed").length,
    1,
  );
});

test("valid electrical-photo paraphrase cannot trigger a false 502: only literal isolated findings become photo proof", async () => {
  const out = await run({
    result: {
      ...synthesis(),
      problem: "Prise endommagée avec des fils visibles.",
      hypotheses: ["Protection électrique possiblement détériorée."],
    },
  });
  assert.equal(out.result.next, "qualification");
  assert.equal(out.result.safety.stop, false);
  assert.equal(out.result.trade.value, "electricite");
  assert.deepEqual(out.usage.grounding_normalized_fields, ["problem"]);
  assert.equal(out.result.problem.value, evidence()[0].observations[0].text);
  assert.equal(out.result.problem.provenance, "ai_inferred");
  assert.equal(
    out.result.facts.find((f) => f.provenance === "observed").value,
    photoObservations(evidence())[0].text,
  );
});

test("unsupported photographic prose is removed in all fields without inventing replacements or losing danger signals", () => {
  const raw = {
    ...synthesis(),
    problem: "La photo montre du métal fondu.",
    hypotheses: ["Fuite visible au lavabo.", "Défaut de protection possible."],
    checks: ["Du métal fondu est visible."],
    urgency_reason: "La photo montre des flammes.",
    possible_parts: ["Tuyau brûlé visible."],
    safety_signals: ["fire"],
    urgency: "critical",
  };
  const out = groundTextSynthesis(raw, evidence());
  assert.deepEqual(
    out.normalizedFields.sort(),
    [
      "problem",
      "hypotheses",
      "checks",
      "urgency_reason",
      "possible_parts",
    ].sort(),
  );
  assert.doesNotMatch(
    JSON.stringify(out.result),
    /métal fondu|Fuite visible|Tuyau brûlé|montre des flammes/,
  );
  assert.deepEqual(out.result.hypotheses, ["Défaut de protection possible."]);
  assert.deepEqual(out.result.possible_parts, []);
  assert.deepEqual(out.result.safety_signals, ["fire"]);
  assert.equal(out.result.urgency, "critical");
  assert.equal(
    raw.problem,
    "La photo montre du métal fondu.",
    "No mutation of the original provider response",
  );
  rejectsWith(
    () =>
      groundTextSynthesis(
        { ...raw, observations: photoObservations(evidence()) },
        evidence(),
      ),
    "synthesis",
    "observations_not_empty",
  );
});

test("normalization log metadata contains only known field labels", () => {
  assert.deepEqual(
    groundingNormalizationDetails([
      "checks",
      "private-fixture-description",
      id,
      "checks",
    ]),
    {
      stage: "synthesis",
      condition: "unbound_visual_claim",
      fields: ["checks"],
    },
  );
  assert.equal(
    groundingNormalizationDetails(["private-fixture-description"]),
    undefined,
  );
  assert.equal(
    groundingNormalizationDetails("private-fixture-description"),
    undefined,
  );
});

test("a multi-sentence isolated observation remains valid when used as the grounded replacement", () => {
  const photos = [
    {
      ...evidence()[0],
      observations: [
        {
          text: "Un cache est cassé. Un câble est visible.",
          location: "au centre",
        },
      ],
    },
  ];
  const out = groundTextSynthesis(
    { ...synthesis(), problem: "Fils visibles dans une prise cassée." },
    photos,
  );
  assert.equal(out.result.problem, photos[0].observations[0].text);
  assert.doesNotThrow(() => assertTextSynthesis(out.result, photos));
  rejectsWith(
    () =>
      assertTextSynthesis(
        {
          ...out.result,
          problem: out.result.problem + " Du métal fondu est visible.",
        },
        photos,
      ),
    "synthesis",
    "unbound_visual_claim",
    "problem",
  );
});

test("inconclusive photo supports useful text analysis, never a visual finding", async () => {
  const out = await run({
    photos: [
      {
        ...evidence()[0],
        status: "inconclusive",
        observations: [],
        safety_signals: [],
      },
    ],
  });
  assert.equal(out.result.next, "qualification");
  assert.equal(
    out.result.facts.some((f) => f.provenance === "observed"),
    false,
  );
  assert.match(out.result.checks[0], /Photo 1 non concluante/);
});

test("text only permits normal photo/observation vocabulary without vision or observed provenance", async () => {
  const out = await run({
    withPhoto: false,
    result: {
      ...synthesis(),
      checks: [
        "Une photo peut compléter la description. Observation professionnelle recommandée.",
      ],
    },
  });
  assert.equal(out.calls.length, 1);
  assert.equal(out.result.next, "qualification");
  assert.equal(
    out.result.facts.some((f) => f.provenance === "observed"),
    false,
  );
});

test("literal photo attribution is allowed only when the entire claim belongs to isolated vision", () => {
  assert.doesNotThrow(() =>
    assertTextSynthesis(
      {
        ...synthesis(),
        problem: "La photo montre " + evidence()[0].observations[0].text,
      },
      evidence(),
    ),
  );
  for (const problem of [
    "La photo montre des traces de brûlure autour de la prise.",
    "La photo montre un cache de prise est cassé avec un câble apparent et du métal fondu.",
    "Un fil brûlé est visible près de la prise.",
    "Une fuite a été observée.",
    "On voit de la fumée autour du câble.",
    "Cette photo ne montre aucune fissure.",
    "Photo : du métal fondu autour de la prise.",
  ])
    rejectsWith(
      () => assertTextSynthesis({ ...synthesis(), problem }, evidence()),
      "synthesis",
      "unbound_visual_claim",
      "problem",
    );
  rejectsWith(
    () =>
      assertTextSynthesis(
        {
          ...synthesis(),
          problem: "La photo montre " + evidence()[0].observations[0].text,
        },
        [],
      ),
    "synthesis",
    "unbound_visual_claim",
    "problem",
  );
});

test("every prose field rejects an invented affirmative visual claim with the field label only", () => {
  for (const field of [
    "problem",
    "hypotheses",
    "urgency_reason",
    "checks",
    "possible_parts",
  ]) {
    const fake = "La photo montre du métal fondu.";
    const value = Array.isArray(synthesis()[field]) ? [fake] : fake;
    rejectsWith(
      () => assertTextSynthesis({ ...synthesis(), [field]: value }, evidence()),
      "synthesis",
      "unbound_visual_claim",
      field,
    );
  }
});

test("a real visible finding can be referenced literally; generic photography and visibility vocabulary does not require fake observations", () => {
  const photos = [
    {
      ...evidence()[0],
      observations: [
        {
          text: "Un câble est visible au centre de la prise.",
          location: "au centre",
        },
      ],
    },
  ];
  assert.doesNotThrow(() =>
    assertTextSynthesis(
      { ...synthesis(), problem: photos[0].observations[0].text },
      photos,
    ),
  );
  assert.doesNotThrow(() =>
    assertTextSynthesis(
      {
        ...synthesis(),
        checks: [
          "Une photographie complémentaire peut aider le professionnel.",
          "À vérifier sur place si le défaut est visible.",
        ],
      },
      [],
    ),
  );
  rejectsWith(
    () =>
      assertTextSynthesis(
        { ...synthesis(), problem: photos[0].observations[0].text },
        [],
      ),
    "synthesis",
    "unbound_visual_claim",
    "problem",
  );
  rejectsWith(
    () =>
      assertTextSynthesis(
        {
          ...synthesis(),
          problem:
            "L’image ne permet pas de confirmer l’état interne, mais du métal fondu est visible.",
        },
        photos,
      ),
    "synthesis",
    "unbound_visual_claim",
    "problem",
  );
});

test("analyze HTTP action finishes and returns 200 for the valid electrical-photo regression", async () => {
  const image = await bytes(),
    cfg = { ...config(env), enabled: true },
    calls = [],
    logs = [];
  const handler = createHandler({
    env,
    cfg,
    logger: {
      warn() {
        assert.fail("No grounding error for valid result");
      },
      info(line) {
        logs.push(JSON.parse(line));
      },
    },
    provider: provider(evidence(), {
      ...synthesis(),
      problem: "Prise endommagée avec des fils visibles.",
    }),
    mediaStore: { download: async () => image },
    transport: {
      rpc: async (name, args) => {
        if (name === "diagnostic_quota_v1") return {};
        assert.equal(name, "diagnostic_state_v1");
        calls.push(args.p_action);
        if (args.p_action === "run_start")
          return {
            run: {
              input_snapshot: {
                input: input(),
                media: [
                  { id, path: "fixture/private.webp", sha256: hash(image) },
                ],
              },
            },
          };
        assert.equal(args.p_action, "run_finish");
        return {
          session: {
            id,
            revision: 1,
            state: "ready",
            input: input(),
            city_slug: "rabat",
          },
          run: {
            id: otherId,
            state: "complete",
            revision: 1,
            result: args.p_payload.result,
          },
          media: [],
        };
      },
    },
  });
  const req = {
    method: "POST",
    headers: {
      origin: cfg.origin,
      "x-fixeo-diagnostic": "1",
      "content-type": "application/json",
      cookie: cfg.cookie + "=" + "a".repeat(64),
    },
    body: { action: "analyze", session_id: id, run_id: otherId, revision: 1 },
  };
  const res = {
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.session.result.next, "qualification");
  assert.equal(res.body.session.result.safety.stop, false);
  assert.deepEqual(calls, ["run_start", "run_finish"]);
  assert.deepEqual(logs[0].grounding, {
    stage: "synthesis",
    condition: "unbound_visual_claim",
    fields: ["problem"],
  });
  assert.equal(logs[0].event, "diagnostic_grounding_normalized");
  assert.doesNotMatch(
    JSON.stringify(logs),
    /dc986|ed986|Prise|visibles|câble|fixture/,
  );
});

test("missing/nonempty synthesis observations have distinct instrumentation and fail closed even when copied correctly", () => {
  rejectsWith(
    () => assertTextSynthesis({ ...synthesis(), observations: undefined }),
    "synthesis",
    "observations_missing",
  );
  rejectsWith(
    () =>
      assertTextSynthesis(
        { ...synthesis(), observations: photoObservations(evidence()) },
        evidence(),
      ),
    "synthesis",
    "observations_not_empty",
  );
});

test("engine observation comparison is structural, independent of object key order, and rejects every changed fact component", () => {
  const facts = photoObservations(evidence());
  assert.doesNotThrow(() =>
    assertPhotoObservations(
      facts.map(({ text, provenance, media_ids }) => ({
        media_ids,
        provenance,
        text,
      })),
      evidence(),
    ),
  );
  for (const [observations, condition] of [
    [[], "observation_count"],
    [[{ ...facts[0], text: "Du métal fondu." }], "observation_text"],
    [[{ ...facts[0], provenance: "ai_inferred" }], "observation_provenance"],
    [[{ ...facts[0], media_ids: [otherId] }], "observation_media_ids"],
  ])
    rejectsWith(
      () => assertPhotoObservations(observations, evidence()),
      "engine",
      condition,
    );
});

test("photo evidence identifies exact structural failures, without logging IDs or observations", () => {
  const photo = evidence()[0];
  for (const [photos, ids, condition] of [
    [null, [id], "schema"],
    [[photo], [id, otherId], "photo_count"],
    [[photo], [otherId], "media_id"],
    [[photo, photo], [id, otherId], "media_id"],
    [[{ ...photo, status: "inconclusive" }], [id], "inconclusive_observations"],
    [
      [{ ...photo, observations: [] }],
      [id],
      "informative_without_observations",
    ],
  ])
    rejectsWith(
      () => validatePhotoEvidence({ photos }, ids),
      "photo_evidence",
      condition,
    );
});

test("provider provenance and media validation remain strict and independently identifiable", () => {
  const fact = photoObservations(evidence())[0];
  for (const [observation, condition] of [
    [{ ...fact, provenance: "user_confirmed" }, "schema"],
    [{ ...fact, media_ids: [] }, "observation_without_media"],
    [{ ...fact, media_ids: [otherId] }, "unknown_media"],
  ])
    rejectsWith(
      () =>
        validateProviderResult(
          { ...synthesis(), observations: [observation] },
          [id],
        ),
      "provider_result",
      condition,
    );
});

test("critical visual danger takes precedence over contradicting text and a lower-risk synthesis", async () => {
  const photos = [
    {
      ...evidence()[0],
      safety_signals: ["fire"],
      observations: [
        { text: "De la fumée grise entoure la prise.", location: "au centre" },
      ],
    },
  ];
  const out = await run({
    photos,
    text: "Pas de fumée. Seulement un cache cassé.",
  });
  assert.equal(out.result.safety.level, "CRITICAL");
  assert.equal(out.result.safety.stop, true);
  assert.equal(out.result.next, "safety_stop");
  assert.ok(out.result.safety.signals.includes("fire"));
});

test("contradicting user description never contaminates the isolated photographic facts", async () => {
  const out = await run({
    text: "Le cache est intact ; le tuyau fuit dans la cuisine.",
  });
  assert.equal(
    out.result.facts.find((f) => f.provenance === "observed").value,
    photoObservations(evidence())[0].text,
  );
  assert.equal(
    out.result.facts.find((f) => f.key === "user_description").provenance,
    "user_declared",
  );
  assert.equal(out.result.trade.value, "electricite");
});

test("real text danger remains a pre-AI stop; no photo or model call", async () => {
  const out = await run({
    text: "Des étincelles actives sortent de la prise.",
  });
  assert.equal(out.calls.length, 0);
  assert.equal(out.providerCalled, false);
  assert.equal(out.result.safety.level, "CRITICAL");
});

test("production error log includes only trusted branch/condition/field, not evidence or attacker-supplied metadata", async () => {
  const cfg = { ...config(env), enabled: true },
    logs = [];
  const error = groundingError("synthesis", "unbound_visual_claim", "checks");
  error.grounding = {
    text: "private-fixture-description",
    token: "private-fixture-token",
    media_id: id,
  };
  error.diagnosticGrounding = error.grounding;
  const handler = createHandler({
    env,
    cfg,
    logger: { warn: (line) => logs.push(JSON.parse(line)) },
    mediaStore: {},
    provider: {
      analyze: async () => {
        throw error;
      },
    },
    transport: {
      rpc: async (name, args) => {
        if (name === "diagnostic_quota_v1") return {};
        assert.equal(name, "diagnostic_state_v1");
        if (args.p_action === "run_start")
          return { run: { input_snapshot: { input: input(), media: [] } } };
        assert.equal(args.p_action, "run_fail");
        return {};
      },
    },
  });
  const req = {
    method: "POST",
    headers: {
      origin: cfg.origin,
      "x-fixeo-diagnostic": "1",
      "content-type": "application/json",
      cookie: cfg.cookie + "=" + "a".repeat(64),
    },
    body: { action: "analyze", session_id: id, run_id: otherId, revision: 1 },
  };
  const res = {
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  await handler(req, res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error, "UNGROUNDED_PROVIDER_OBSERVATION");
  assert.deepEqual(logs[0].grounding, {
    stage: "synthesis",
    condition: "unbound_visual_claim",
    field: "checks",
  });
  assert.deepEqual(
    Object.keys(logs[0]).sort(),
    ["event", "request_id", "action", "code", "latency_ms", "grounding"].sort(),
  );
  assert.doesNotMatch(
    JSON.stringify(logs),
    /private-fixture|dc986|ed986|Prise cassée/,
  );
  assert.equal(res.body.grounding, undefined);
  assert.equal(groundingLogDetails(new Error("private-fixture")), undefined);
});
