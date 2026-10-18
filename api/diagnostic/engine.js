"use strict";
const { VERSION, QUESTIONS, validateProviderResult } = require("./contract");
const { evaluateSafety, safetyTrade } = require("./safety");
const { qualificationQuestions } = require("./question-routing");
const { hash } = require("./auth");
const { DiagnosticError } = require("./transport");
const {
  validatePhotoEvidence,
  assertPhotoObservations,
  assertProseGrounding,
  photoLimitations,
} = require("./photo-grounding");
const indicative =
  "Diagnostic indicatif — à confirmer par l’artisan si nécessaire.";
async function analyze(snapshot, { provider, mediaStore }) {
  const input = snapshot.input;
  const before = evaluateSafety(
    input,
    null,
    snapshot.previous_safety_signals || [],
  );
  const declarations = [
    {
      // Render the exact customer declaration with its existing provenance label
      // (the legacy modal hides only the old "description" key).
      key: "user_description",
      value: input.description,
      provenance: "user_declared",
    },
    ...(input.safety_signals || []).map((value) => ({
      key: "safety_signal",
      value,
      provenance: "user_confirmed",
    })),
    ...Object.entries(input.answers || {}).map(([key, value]) => ({
      key,
      value,
      provenance:
        QUESTIONS[key]?.type === "choice" ? "user_confirmed" : "user_declared",
    })),
  ];
  if (before.stop)
    return {
      result: {
        version: VERSION,
        indicative,
        trade: {
          value: safetyTrade(input, before.signals),
          provenance: "ai_inferred",
        },
        problem: {
          value:
            "Danger immédiat signalé — évaluation professionnelle nécessaire après mise en sécurité.",
          provenance: "ai_inferred",
        },
        facts: declarations,
        hypotheses: [],
        possible_parts: [],
        checks: [],
        questions: [],
        safety: before,
        urgency: {
          value: "critical",
          provenance: "ai_inferred",
          basis: before.version,
        },
        duration: null,
        pricing: null,
        next: "safety_stop",
      },
      usage: {},
      providerCalled: false,
    };
  const media = [];
  for (const item of snapshot.media) {
    const bytes = await mediaStore.download(item.path);
    if (hash(bytes) !== item.sha256)
      throw new DiagnosticError("MEDIA_INTEGRITY_FAILURE", 409);
    media.push({ id: item.id, bytes });
  }
  const output = await provider.analyze({
    description: input.description,
    answers: input.answers || {},
    media,
    question_round: Math.min(
      2,
      Math.ceil(Object.keys(input.answers || {}).length / 3),
    ),
  });
  const model = validateProviderResult(
    output.result,
    media.map((m) => m.id),
  );
  const photos = media.length
    ? validatePhotoEvidence(
        { photos: output.photoEvidence },
        media.map((m) => m.id),
      )
    : [];
  assertPhotoObservations(model.observations, photos);
  assertProseGrounding(model, photos);
  const safety = evaluateSafety(input, model, [
    ...before.signals,
    ...photos.flatMap((photo) => photo.safety_signals),
  ]);
  const electricalRisk = safety.signals.includes("electrical_risk");
  const questions = qualificationQuestions(input, model, photos, safety);
  return {
    result: {
      version: VERSION,
      indicative,
      trade: {
        value: electricalRisk ? "electricite" : model.trade,
        provenance: "ai_inferred",
      },
      problem: { value: model.problem, provenance: "ai_inferred" },
      facts: [
        ...declarations,
        ...model.observations.map((x, i) => ({
          key: "observation_" + i,
          value: x.text,
          provenance: x.provenance,
          media_ids: x.media_ids,
        })),
      ],
      hypotheses: model.hypotheses.map((value) => ({
        value,
        provenance: "ai_inferred",
      })),
      possible_parts: model.possible_parts.map((value) => ({
        value,
        provenance: "ai_inferred",
        certain: false,
      })),
      checks: [
        ...photoLimitations(photos),
        ...(safety.level === "URGENT"
          ? [
              electricalRisk
                ? "Intervention rapide d’un électricien recommandée. L’installation doit être vérifiée sur place par un professionnel."
                : "Intervention professionnelle rapide recommandée pour vérifier la situation sur place.",
            ]
          : []),
        ...model.checks,
      ],
      photo_assessments: photos.map(({ media_id, status }) => ({
        media_id,
        status,
      })),
      questions,
      safety,
      urgency: {
        value: safety.stop
          ? "critical"
          : safety.level === "URGENT"
            ? "high"
            : model.urgency,
        provenance: "ai_inferred",
        reason:
          safety.level === "URGENT" && !safety.stop
            ? "Situation à traiter rapidement par un professionnel. L’absence de signe actif ne garantit pas l’absence de danger."
            : model.urgency_reason,
      },
      duration: null,
      pricing: null,
      next: safety.stop
        ? "safety_stop"
        : questions.length
          ? "questions"
          : "qualification",
    },
    usage: output.usage,
    providerCalled: true,
  };
}
module.exports = { analyze };
