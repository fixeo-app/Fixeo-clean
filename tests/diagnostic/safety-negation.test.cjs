"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { evaluateSafety } = require("../../api/diagnostic/safety");
const { analyze } = require("../../api/diagnostic/engine");

test("explicit local negations reach analysis without certifying safety", () => {
  for (const description of [
    "sans inondation",
    "Une petite fuite, sans inondation.",
    "pas de fuite de gaz",
    "aucune fumée",
    "AUCUNE FUMÉE",
    "Il n’y a pas de fumée.",
    "Je ne vois pas de flammes.",
    "Pas d’inondation.",
    "Sans aucune fumée.",
    "Sans aucun incendie.",
    "Aucune odeur de gaz.",
    "Pas de fuite importante.",
    "Aucun effondrement.",
    "Aucun affaissement.",
    "Pas de fils dénudés.",
    "Aucune étincelle.",
    "Aucune trace de fumée.",
    "Pas de signe d’inondation.",
    "Pas de fuite de gaz, aucune fumée, sans inondation.",
    "TEST E2E FIXEO - NE PAS INTERVENIR. De l’eau goutte sous le lavabo, sans inondation ni danger électrique.",
  ]) {
    const result = evaluateSafety({ description });
    assert.deepEqual(result.signals, [], description);
    assert.equal(result.stop, false, description);
    assert.equal(result.safety_cleared, false, description);
  }
});

test("affirmative hazards and a second positive mention remain blocked", () => {
  for (const [description, signal] of [
    ["Une inondation dans la cuisine", "flood"],
    ["Une fuite de gaz", "gas"],
    ["Une odeur de gaz", "gas"],
    ["De la fumée", "fire"],
    ["Des flammes", "fire"],
    ["Des étincelles", "electricity"],
    ["Un fil sous tension", "electricity"],
    ["Une fuite importante", "major_leak"],
    ["Un affaissement", "structure"],
    ["ريحة الغاز", "gas"],
    ["دخان", "fire"],
    ["gas leak", "gas"],
    ["electrical fire", "fire"],
    ["flooding", "flood"],
    ["Sans inondation, mais une odeur de gaz apparaît.", "gas"],
    ["Pas de fumée ici, de la fumée sort de la prise.", "fire"],
    ["Pas de fuite, une odeur de gaz est présente.", "gas"],
    ["Une fuite de gaz, aucune fumée.", "gas"],
    ["Sans inondation. Une inondation apparaît ensuite.", "flood"],
  ]) {
    const result = evaluateSafety({ description });
    assert.equal(result.stop, true, description);
    assert.ok(result.signals.includes(signal), description);
  }
});

test("questions, uncertainty, exceptions and double negation fail closed", () => {
  for (const description of [
    "Sans inondation ?",
    "Pas de fuite de gaz ?",
    "Je ne suis pas sûr : aucune fumée.",
    "Je ne peux pas confirmer : aucune fumée.",
    "Je ne peux pas exclure une fuite de gaz.",
    "Aucune fuite de gaz ne peut être exclue.",
    "Ce n’est pas sans inondation.",
    "Pas aucune fumée.",
    "Ce n’est pas vrai : aucune fumée.",
    "Sans inondation, sauf au sous-sol.",
    "Pas seulement de la fumée.",
    "Pas forcément de la fumée.",
    "Peut-être aucune fumée.",
    "Si aucune fumée apparaît.",
    "Aucune fumée, sauf près de la prise.",
    "Pas de doute, une fuite de gaz.",
  ])
    assert.equal(evaluateSafety({ description }).stop, true, description);
});

test("negation cannot cancel confirmed, previous or model hazards, or cross fields", () => {
  const input = { description: "Sans inondation, aucune fumée." };
  for (const result of [
    evaluateSafety({ ...input, safety_signals: ["flood"] }),
    evaluateSafety(input, null, ["flood"]),
    evaluateSafety(input, { safety_signals: ["fire"], urgency: "low" }),
    evaluateSafety(input, { safety_signals: [], urgency: "critical" }),
    evaluateSafety({ ...input, answers: { water_spreading: "yes" } }),
    evaluateSafety({ description: "pas de", answers: { detail: "fumée" } }),
    evaluateSafety({ description: "Une odeur", answers: { detail: "de gaz" } }),
    evaluateSafety({ ...input, answers: { detail: "Une odeur de gaz" } }),
  ]) {
    assert.equal(result.stop, true);
    assert.equal(result.safety_cleared, false);
  }
});

test("engine calls provider for the production regression and stops a real hazard before AI", async () => {
  let calls = 0;
  const provider = {
    async analyze() {
      calls++;
      return {
        result: {
          trade: "plomberie",
          problem: "Fuite au raccord sous lavabo",
          observations: [],
          hypotheses: ["Joint possiblement usé"],
          urgency: "moderate",
          urgency_reason: "Écoulement localisé",
          checks: [],
          possible_parts: ["Joint"],
          question_ids: [],
          safety_signals: [],
        },
        usage: {},
      };
    },
  };
  const run = (description) =>
    analyze(
      {
        input: { description, answers: {}, safety_signals: [] },
        media: [],
      },
      { provider, mediaStore: {} },
    );
  const result = await run(
    "De l’eau goutte sous le lavabo, sans inondation ni danger électrique.",
  );
  assert.equal(result.providerCalled, true);
  assert.equal(result.result.safety.stop, false);
  assert.equal(result.result.next, "qualification");
  const stopped = await run(
    "De l’eau goutte sous le lavabo. Une inondation se propage.",
  );
  assert.equal(stopped.providerCalled, false);
  assert.equal(stopped.result.next, "safety_stop");
  assert.equal(calls, 1);
});
