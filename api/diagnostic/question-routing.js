"use strict";
const { QUESTIONS } = require("./contract");
const normalize = (s) =>
  String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

// The provider proposes questions; this bounded policy only keeps questions
// that can still change qualification. Safety evaluation is untouched and
// takes place before this function. Unknown/skipped answers count as answered.
function qualificationQuestions(input, model, photos, safety) {
  if (safety.stop) return [];
  const answers = input.answers || {};
  const remaining =
    3 - Object.keys(answers).filter((id) => QUESTIONS[id]).length;
  if (remaining <= 0) return [];
  const informative = photos.some((photo) => photo.status === "informative");
  const description = normalize(input.description);
  const evidence = normalize(
    photos.flatMap((p) => p.observations.map((o) => o.text)).join(" "),
  );
  const context = description + " " + evidence;
  const ambiguous =
    model.trade === "autre" ||
    /a preciser|indetermine|incertain|informations? insuffisantes?/.test(
      normalize(model.problem),
    ) ||
    (!informative && description.trim().length < 20);
  const relevant = {
    onset:
      !informative &&
      ambiguous &&
      !/depuis|aujourd'hui|hier|semaine|jour|mois/.test(description),
    affected_area:
      ambiguous &&
      !/\b(?:mur|plafond|sol|cuisine|salle de bain|lavabo|prise|serrure|toit)\b/.test(
        context,
      ),
    occurrence:
      !informative &&
      ambiguous &&
      !/toujours|parfois|intermittent|lorsque|quand|en continu/.test(
        description,
      ),
    smoke_sparks:
      model.trade === "electricite" ||
      /electri|prise|cable|fumee|brul|chauff|appareil/.test(context),
    gas_smell: /\bgaz\b|chaudiere|chauffe.eau|bruleur|cuisiniere/.test(context),
    water_spreading: /\beau\b|fuite|humid|infiltr|inond/.test(context),
    structure_moving:
      model.trade === "maconnerie" ||
      /fissur|toit|structure|affaisse|effondr/.test(context),
  };
  return model.question_ids
    .filter((id) => !Object.hasOwn(answers, id) && relevant[id])
    .slice(0, Math.min(2, remaining))
    .map((id) => ({ id, ...QUESTIONS[id], optional: true }));
}
module.exports = { qualificationQuestions };
