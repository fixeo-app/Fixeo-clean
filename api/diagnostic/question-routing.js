"use strict";
const { QUESTIONS } = require("./contract");
const normalize = (s) =>
  String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

// Existing text-answer IDs and validation stay unchanged. Only the router
// supplies area options; a surface questionnaire is never a universal default.
const AREAS = {
  plomberie: ["Robinet / évier", "WC", "Douche / baignoire", "Canalisation"],
  electricite: ["Prise / interrupteur", "Éclairage", "Tableau électrique", "Appareil"],
  climatisation: ["Unité intérieure", "Unité extérieure", "Plusieurs unités"],
  maconnerie: ["Mur", "Plafond", "Sol", "Façade"],
  autre: ["À l’intérieur", "À l’extérieur", "Plusieurs endroits"],
};
const KNOWN_AREA = {
  plomberie: /robinet|evier|lavabo|\bwc\b|toilette|douche|baignoire|canalis|tuyau/,
  electricite: /prise|interrupteur|eclairage|ampoule|tableau|disjoncteur|appareil/,
  climatisation: /unite.*(?:interieur|exterieur)|split|compresseur/,
  maconnerie: /\bmur\b|plafond|\bsol\b|facade|toit|balcon/,
  autre: /\bmur\b|plafond|\bsol\b|cuisine|salle de bain|lavabo|prise|serrure|porte|toit|interieur|exterieur/,
};
const KNOWN_PROBLEM = {
  plomberie: /fuite|bouch|debord|ecoul|pression/,
  electricite: /panne|disjonct|court.circuit|etincelle|ne.*(?:marche|fonctionne|allume)/,
  serrurerie: /(?:porte|serrure).*?(?:bloqu|claqu|ferm)|cle.*?(?:perd|cass|coinc|bloqu)|(?:perd|cass).*?cle/,
  climatisation: /froid|refroid|chauff|bruit|fuite|panne/,
  maconnerie: /fissur|affaisse|effondr|infiltr/,
};

// The provider proposes questions; this bounded policy only keeps questions
// that can still change qualification. Safety evaluation is untouched and
// takes place before this function. Unknown/skipped answers count as answered.
function qualificationQuestions(input, model, photos, safety) {
  if (safety.stop) return [];
  const answers = input.answers || {};
  const remaining =
    2 - Object.keys(answers).filter((id) => QUESTIONS[id]).length;
  if (remaining <= 0) return [];
  const informative = photos.some((photo) => photo.status === "informative");
  const description = normalize(input.description);
  const evidence = normalize(
    photos.flatMap((p) => p.observations.map((o) => o.text)).join(" "),
  );
  const context = [description, evidence, ...Object.values(answers)
    .filter((value) => !["yes", "no", "unknown"].includes(value))]
    .map(normalize).join(" ");
  // Match the effective trade used by the existing engine for electrical risk.
  const trade = safety.signals?.includes("electrical_risk")
    ? "electricite" : model.trade;
  const knownProblem = KNOWN_PROBLEM[trade]?.test(context);
  const ambiguous =
    trade === "autre" ||
    /a preciser|indetermine|incertain|informations? insuffisantes?/.test(
      normalize(model.problem),
    ) ||
    (!informative && !knownProblem && description.trim().length < 20);
  const relevant = {
    onset:
      !informative &&
      ambiguous &&
      !/depuis|aujourd'hui|hier|semaine|jour|mois/.test(description),
    affected_area:
      ambiguous &&
      !!AREAS[trade] && !KNOWN_AREA[trade].test(context),
    occurrence:
      !informative &&
      ambiguous &&
      !/toujours|parfois|intermittent|lorsque|quand|en continu/.test(
        description,
      ),
    smoke_sparks:
      trade === "electricite" ||
      /electri|prise|cable|fumee|brul|chauff|appareil/.test(context),
    gas_smell: /\bgaz\b|chaudiere|chauffe.eau|bruleur|cuisiniere/.test(context),
    water_spreading: /\beau\b|fuite|humid|infiltr|inond/.test(context),
    structure_moving:
      trade === "maconnerie" ||
      /fissur|toit|structure|affaisse|effondr/.test(context),
  };
  return model.question_ids
    .filter((id) => !Object.hasOwn(answers, id) && relevant[id])
    .slice(0, Math.min(2, remaining))
    .map((id) => ({
      id, ...QUESTIONS[id], optional: true,
      ...(id === "affected_area" ? { options: AREAS[trade] } : {}),
    }));
}
module.exports = { qualificationQuestions };
