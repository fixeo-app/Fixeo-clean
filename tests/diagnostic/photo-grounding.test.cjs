"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const {
  createOpenAIAdapter,
} = require("../../api/diagnostic/providers/openai");
const { analyze } = require("../../api/diagnostic/engine");
const { hash } = require("../../api/diagnostic/auth");
const {
  isUniformPhoto,
  validatePhotoEvidence,
} = require("../../api/diagnostic/photo-grounding");
const id = "dc986e10-b315-4000-8000-2d458b457704";
const otherId = "ed986e10-b315-4000-8000-2d458b457705";
const env = { OPENAI_API_KEY: "fixture", FIXEO_DIAGNOSTIC_MODEL: "fixture" };
const description =
  "De l’eau goutte au raccord sous le lavabo quand le robinet est ouvert, sans inondation.";
const sample = () => ({
  trade: "plomberie",
  problem: "Selon votre description, fuite possible au raccord du siphon.",
  observations: [],
  hypotheses: ["Joint possiblement usé"],
  urgency: "moderate",
  urgency_reason: "Écoulement localisé déclaré par le client.",
  checks: ["Étanchéité du raccord à confirmer sur place."],
  possible_parts: ["Joint de siphon"],
  question_ids: [],
  safety_signals: [],
});
const flat = () =>
  sharp({
    create: { width: 64, height: 64, channels: 3, background: "#427896" },
  })
    .webp()
    .toBuffer();
// Existing repository photo, visually checked: white U-shaped pipe below the
// sink, metal pipes and open cabinet. No visible drops prove a leak.
const informative = () =>
  fs.readFile(path.join(__dirname, "../../img/blog/plomberie-blog.webp"));
const response = (result) =>
  new Response(
    JSON.stringify({
      status: "completed",
      model: "fixture-revision",
      output: [
        { content: [{ type: "output_text", text: JSON.stringify(result) }] },
      ],
      usage: { input_tokens: 100, output_tokens: 40 },
    }),
  );
const photo = (status = "informative") => ({
  media_id: id,
  status,
  safety_signals: [],
  observations:
    status === "informative"
      ? [
          {
            text: "Un tuyau blanc forme un U sous un évier.",
            location: "au centre droit du meuble ouvert",
          },
        ]
      : [],
});
function adapter(vision, synthesis = sample(), calls = []) {
  return createOpenAIAdapter({
    env,
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      const body = JSON.parse(options.body);
      calls.push(body);
      assert.equal(body.store, false);
      assert.equal(body.tools, undefined);
      return response(
        body.text.format.name === "fixeo_photo_evidence_v1"
          ? vision
          : synthesis,
      );
    },
  });
}
async function run(bytes, provider, text = description) {
  return analyze(
    {
      input: { description: text, answers: {}, safety_signals: [] },
      media: [{ id, path: "safe/fixture.webp", sha256: hash(bytes) }],
    },
    {
      provider,
      mediaStore: {
        async download() {
          return bytes;
        },
      },
    },
  );
}

test("neutral synthetic photo is deterministically inconclusive; no visual findings are requested or invented", async () => {
  const bytes = await flat(),
    calls = [];
  assert.equal(await isUniformPhoto(bytes), true);
  const result = await run(bytes, adapter(null, sample(), calls));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].text.format.name, "fixeo_diagnostic_v1");
  assert.ok(
    calls[0].input[0].content.every((item) => item.type === "input_text"),
  );
  assert.deepEqual(result.result.photo_assessments, [
    { media_id: id, status: "inconclusive" },
  ]);
  assert.equal(
    result.result.facts.filter((f) => f.provenance === "observed").length,
    0,
  );
  assert.match(result.result.checks[0], /Photo 1 non concluante/);
  assert.equal(result.result.safety.stop, false);
});

test("informative photo is read without description or answers; only its exact isolated facts are displayed as observed", async () => {
  const bytes = await informative(),
    calls = [];
  assert.equal(await isUniformPhoto(bytes), false);
  const result = await run(
    bytes,
    adapter({ photos: [photo()] }, sample(), calls),
  );
  assert.equal(calls.length, 2);
  const visualInput = calls[0].input[0].content;
  assert.deepEqual(
    visualInput.filter((item) => item.type === "input_text"),
    [{ type: "input_text", text: "Evidence media_id: " + id }],
  );
  assert.equal(visualInput[1].type, "input_image");
  assert.equal(visualInput[1].detail, "high");
  const synthesisInput = calls[1].input[0].content;
  assert.equal(synthesisInput.length, 1);
  const sources = JSON.parse(synthesisInput[0].text);
  assert.equal(sources.user_description, description);
  assert.deepEqual(sources.photo_evidence, [photo()]);
  assert.equal(calls[1].text.format.schema.properties.observations.maxItems, 0);
  const observed = result.result.facts.filter(
    (f) => f.provenance === "observed",
  );
  assert.equal(observed.length, 1);
  assert.equal(
    observed[0].value,
    "Un tuyau blanc forme un U sous un évier. (au centre droit du meuble ouvert)",
  );
  assert.doesNotMatch(observed[0].value, /goutte|fuite/i);
  assert.deepEqual(observed[0].media_ids, [id]);
  assert.equal(result.usage.input_tokens, 200);
  assert.equal(result.usage.output_tokens, 80);
});

test("useful description survives an inconclusive photo and retains its own provenance, including in the legacy modal", async () => {
  const result = await run(
    await informative(),
    adapter({ photos: [photo("inconclusive")] }),
  );
  assert.equal(result.result.trade.value, "plomberie");
  assert.equal(result.result.problem.provenance, "ai_inferred");
  assert.equal(result.result.next, "qualification");
  const declared = result.result.facts.find(
    (f) => f.key === "user_description",
  );
  assert.equal(declared.value, description);
  assert.equal(declared.provenance, "user_declared");
  assert.equal(declared.media_ids, undefined);
  assert.equal(
    result.result.facts.some((f) => f.provenance === "observed"),
    false,
  );
  assert.match(result.result.checks[0], /non concluante/);
});

test("synthesis cannot invent photographic evidence in observations or in another result field", async () => {
  const bytes = await flat();
  for (const forged of [
    {
      ...sample(),
      observations: [
        {
          text: "Des gouttes tombent du siphon.",
          provenance: "observed",
          media_ids: [id],
        },
      ],
    },
    { ...sample(), problem: "La photo montre de l’eau qui coule." },
    { ...sample(), hypotheses: ["Fuite visible sous le lavabo"] },
    { ...sample(), urgency_reason: "Une fuite a été observée." },
  ])
    await assert.rejects(
      run(bytes, adapter(null, forged)),
      /UNGROUNDED_PROVIDER_OBSERVATION/,
    );
});

test("missing, duplicate, unknown or contradictory photo evidence fails closed", () => {
  for (const [photos, ids] of [
    [[], [id]],
    [[photo()], [otherId]],
    [
      [photo(), photo()],
      [id, otherId],
    ],
    [[{ ...photo(), status: "inconclusive" }], [id]],
    [[{ ...photo(), observations: [] }], [id]],
  ])
    assert.throws(
      () => validatePhotoEvidence({ photos }, ids),
      /PHOTO_EVIDENCE_INVALID/,
    );
});

test("real declared danger still stops before photo download or AI, even with a neutral photo", async () => {
  const result = await analyze(
    {
      input: {
        description: "Une odeur de gaz est présente près de la chaudière.",
        answers: {},
        safety_signals: [],
      },
      media: [{ id, path: "unused" }],
    },
    {
      provider: {
        analyze() {
          assert.fail("No provider call for declared danger");
        },
      },
      mediaStore: {
        download() {
          assert.fail("No media access for declared danger");
        },
      },
    },
  );
  assert.equal(result.providerCalled, false);
  assert.equal(result.result.next, "safety_stop");
  assert.ok(result.result.safety.signals.includes("gas"));
});

test("isolated visual danger cannot be cancelled by the text synthesis or a user negation", async () => {
  // Deliberate provider stub: verifies propagation of visual danger, not model accuracy.
  const evidence = { ...photo(), safety_signals: ["electricity"] };
  const result = await run(
    await informative(),
    adapter({ photos: [evidence] }),
    "Aucune étincelle. Petit problème au lavabo.",
  );
  assert.equal(result.result.safety.stop, true);
  assert.ok(result.result.safety.signals.includes("electricity"));
  assert.equal(result.result.next, "safety_stop");
  assert.equal(result.result.safety.safety_cleared, false);
});

test("multiple photos keep separate evidence; a uniform photo cannot inherit findings from an informative photo", async () => {
  const calls = [],
    bytes = await informative();
  const out = await adapter({ photos: [photo()] }, sample(), calls).analyze({
    description,
    answers: {},
    question_round: 0,
    media: [
      { id: otherId, bytes: await flat() },
      { id, bytes },
    ],
  });
  assert.equal(calls[0].input[0].content.length, 2);
  assert.deepEqual(
    out.photoEvidence.map((p) => p.status),
    ["inconclusive", "informative"],
  );
  assert.ok(
    out.result.observations.every(
      (o) => o.media_ids.length === 1 && o.media_ids[0] === id,
    ),
  );
});

test("both provider passes share the original timeout budget", async (t) => {
  const bytes = await informative();
  let now = Date.now(),
    calls = 0;
  t.mock.method(Date, "now", () => now);
  const provider = createOpenAIAdapter({
    env,
    timeout: 25000,
    fetchImpl: async () => {
      calls++;
      now += 24500;
      return response({ photos: [photo()] });
    },
  });
  await assert.rejects(
    provider.analyze({ description, answers: {}, media: [{ id, bytes }] }),
    /PROVIDER_TIMEOUT/,
  );
  assert.equal(calls, 1, "A second call cannot restart the timeout budget");
});

test("engine refuses findings not copied from the isolated photo evidence", async () => {
  const bytes = await informative();
  await assert.rejects(
    run(bytes, {
      async analyze() {
        return {
          result: {
            ...sample(),
            observations: [
              {
                text: "De l’eau coule.",
                provenance: "observed",
                media_ids: [id],
              },
            ],
          },
          photoEvidence: [photo()],
          usage: {},
        };
      },
    }),
    /UNGROUNDED_PROVIDER_OBSERVATION/,
  );
});
