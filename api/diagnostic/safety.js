"use strict";
const { HAZARDS, QUESTIONS } = require("./contract");
const MESSAGES = Object.freeze({
  gas: "Éloignez-vous de la zone. Évitez toute flamme et toute manipulation électrique. Contactez les services d’urgence locaux depuis un lieu sûr.",
  electricity:
    "Gardez vos distances avec les équipements et l’eau à proximité. Ne touchez pas aux fils ni au tableau. En cas de danger immédiat, contactez les services d’urgence locaux.",
  electrical_risk:
    "Ne touchez pas à l’installation et coupez l’alimentation si cela peut être fait sans risque.",
  fire: "Mettez-vous à l’abri, éloignez les personnes et contactez les services d’urgence locaux. Ne tentez pas de réparer.",
  major_leak:
    "Éloignez-vous des zones inondées et des équipements électriques. Faites intervenir un professionnel rapidement.",
  flood:
    "Évitez la zone inondée et les équipements électriques. En cas de danger immédiat, contactez les services d’urgence locaux.",
  structure:
    "Éloignez-vous de la zone concernée et empêchez les personnes de s’en approcher. En cas de danger immédiat, contactez les services d’urgence locaux.",
  immediate_danger:
    "Mettez-vous à l’abri et contactez les services d’urgence locaux. FIXEO ne remplace pas les secours.",
});
const PATTERNS = Object.freeze({
  gas: /odeur.{0,20}gaz|fuite.{0,20}gaz|gas\s*(leak|smell)|ريحة.{0,15}(غاز|البوطا)|تسرب.{0,15}غاز/u,
  electricity:
    /electrocut|electrisat|etincell|(?:fil|cable|conducteur).{0,16}sous tension|odeur.{0,20}brule|electric\s*shock|\bsparks?\b|\blive (?:wire|cable)|شرار|صعق|eau.{0,35}(?:contact|sur |dans |touche).{0,25}(?:electri|prise|interrupteur|tableau|fil|cable)|(?:prise|interrupteur|tableau electrique).{0,16}(?:mouille|dans l'eau)|water.{0,30}(?:contact|on |touch).{0,25}(?:electric|socket|wire)/u,
  electrical_risk:
    /\b(?:prise|interrupteur|equipement electrique|installation electrique).{0,40}(?:cass|endommag|deterior|abim|cache.{0,12}(?:manquant|absent))|\b(?:fils?|cables?|conducteurs?).{0,20}(?:apparent|expose|denude)|\bcache.{0,12}(?:manquant|absent).{0,25}(?:prise|interrupteur)|\b(?:broken|damaged) (?:socket|outlet|switch)|\bexposed (?:wire|wiring|cable)/u,
  fire: /incendie|flammes?|fumee|\bfire\b|\bsmoke\b|حريق|دخان/u,
  major_leak:
    /fuite.{0,16}(importante|majeure|incontrol)|eau.{0,20}coule.{0,16}(fort|partout)/u,
  flood: /inond|flood|غرق|فيضان/u,
  structure:
    /effondr|affaisse|plafond.{0,15}tombe|collapse|انهيار|سقف.{0,15}طيح/u,
  immediate_danger: /\bdanger immediat\b|\bimmediate danger\b/u,
});
// Only explicit French noun-phrase negations are exempted from text detection.
// This is not a safety clearance: uncertain wording and every other source of
// danger (checkbox, previous result, model) still take precedence.
const NEGATED_MENTION =
  /\b(?:sans(?: aucune?)?\s+|aucun(?:e|s|es)?\s+|pas\s+(?:de\s+|d'))(?:(?:traces?|signes?) (?:de |d'))?(?:inondations?|fumees?|flammes?|incendies?|fuites? de gaz|odeurs? de gaz|etincelles?|(?:fils?|cables?) (?:denudes?|apparents?|exposes?|sous tension)|(?:prises?|interrupteurs?) (?:casse[es]*|endommage[es]*|deteriore[es]*)|danger immediat|odeurs? de brule|fuites? (?:importantes?|majeures?|incontrolables?)|effondrements?|affaissements?)\b/gu;
const UNCERTAIN =
  /\?|\b(?:dout\w*|incertain\w*|incertitude|exclu\w*|impossible|possible|peut|peuvent|pourrait|pourraient|semble\w*|suppos\w*|probable\w*|eventuel\w*|sauf|hormis|excepte|si|vrai|faux|seulement|uniquement|forcement|necessairement)\b/u;
const OTHER_NEGATION = /\b(?:pas|non|jamais|sans|aucun(?:e|s|es)?|ne)\b|\bn'/u;

function negatedRanges(text) {
  const negated = [];
  for (const match of text.matchAll(NEGATED_MENTION)) {
    // Context stays inside one sentence, but includes questions, exceptions,
    // double negations and denials such as "ce n'est pas vrai : aucune fumee".
    const start =
      Math.max(
        ...[".", "!", "?", ";", "\n"].map((c) =>
          text.lastIndexOf(c, match.index - 1),
        ),
      ) + 1;
    const tail = text.slice(match.index + match[0].length);
    const next = tail.search(/[.!?;\n]/u);
    const end =
      next < 0 ? text.length : match.index + match[0].length + next + 1;
    const context = text.slice(start, end);
    if (UNCERTAIN.test(context)) continue;
    let before = text.slice(start, match.index);
    // Earlier, independently accepted negations must not negate this one.
    for (const range of negated.filter((r) => r.start >= start).reverse())
      before =
        before.slice(0, range.start - start) +
        " ".repeat(range.end - range.start) +
        before.slice(range.end - start);
    before = before
      .replace(/\b(?:il\s+)?n'y\s+(?:a|avait)\s*$/u, "")
      .replace(
        /\b(?:je ne (?:vois|constate|observe)|nous ne (?:voyons|constatons|observons)|on ne (?:voit|constate|observe))\s*$/u,
        "",
      );
    if (OTHER_NEGATION.test(before)) continue;
    negated.push({ start: match.index, end: match.index + match[0].length });
  }
  return negated;
}

function textSignals(fields) {
  const normalized = fields.map((value) =>
    String(value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\u2018\u2019]/g, "'")
      .toLowerCase(),
  );
  const negated = [];
  let offset = 0;
  for (const field of normalized) {
    for (const range of negatedRanges(field))
      negated.push({ start: range.start + offset, end: range.end + offset });
    offset += field.length + 1;
  }
  // Preserve existing positive detection across fields, but only accept
  // negations contained entirely inside one description or answer.
  const text = normalized.join(" ");
  const signals = [];
  for (const [signal, pattern] of Object.entries(PATTERNS)) {
    const matches = text.matchAll(new RegExp(pattern.source, "gu"));
    for (const match of matches) {
      if (
        !negated.some(
          (range) =>
            match.index >= range.start &&
            match.index + match[0].length <= range.end,
        )
      ) {
        signals.push(signal);
        break;
      }
    }
  }
  return signals;
}
function evaluateSafety(input, model = null, previousSignals = []) {
  const signals = new Set(previousSignals.filter((s) => HAZARDS.includes(s)));
  const declared = Array.isArray(input.safety_signals)
    ? input.safety_signals
    : [];
  declared.filter((s) => HAZARDS.includes(s)).forEach((s) => signals.add(s));
  const fields = [
    input.description || "",
    ...Object.values(input.answers || {}),
  ];
  // Negation never carries from the description to a separate answer.
  textSignals(fields).forEach((signal) => signals.add(signal));
  for (const [key, answer] of Object.entries(input.answers || {})) {
    if (QUESTIONS[key]?.hazard && answer === "yes")
      signals.add(QUESTIONS[key].hazard);
  }
  if (model) {
    model.safety_signals.forEach((s) => signals.add(s));
    if (model.urgency === "critical") signals.add("immediate_danger");
  }
  const list = [...signals].sort();
  // Never downgrade a legacy/confirmed electricity signal. Only the explicit
  // technical-risk category may continue, and any critical source overrides it.
  const stop = list.some((signal) => signal !== "electrical_risk");
  return {
    version: "fixeo-safety-v1",
    signals: list,
    stop,
    urgency: stop
      ? "now"
      : signals.has("electrical_risk") || model?.urgency === "high"
        ? "urgent"
        : "normale",
    messages: list.map((s) => MESSAGES[s]),
    // "none" is a client declaration, never proof that an installation is safe.
    safety_cleared: false,
  };
}
module.exports = { evaluateSafety, MESSAGES };
