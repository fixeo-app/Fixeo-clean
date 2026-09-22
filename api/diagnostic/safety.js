'use strict';
const { HAZARDS, QUESTIONS } = require('./contract');
const MESSAGES = Object.freeze({
  gas: 'Éloignez-vous de la zone. Évitez toute flamme et toute manipulation électrique. Contactez les services d’urgence locaux depuis un lieu sûr.',
  electricity:
    'Gardez vos distances avec les équipements et l’eau à proximité. Ne touchez pas aux fils ni au tableau. En cas de danger immédiat, contactez les services d’urgence locaux.',
  fire: 'Mettez-vous à l’abri, éloignez les personnes et contactez les services d’urgence locaux. Ne tentez pas de réparer.',
  major_leak:
    'Éloignez-vous des zones inondées et des équipements électriques. Faites intervenir un professionnel rapidement.',
  flood:
    'Évitez la zone inondée et les équipements électriques. En cas de danger immédiat, contactez les services d’urgence locaux.',
  structure:
    'Éloignez-vous de la zone concernée et empêchez les personnes de s’en approcher. En cas de danger immédiat, contactez les services d’urgence locaux.',
  immediate_danger:
    'Mettez-vous à l’abri et contactez les services d’urgence locaux. FIXEO ne remplace pas les secours.',
});
const PATTERNS = Object.freeze({
  gas: /odeur.{0,20}gaz|fuite.{0,20}gaz|gas\s*(leak|smell)|ريحة.{0,15}(غاز|البوطا)|تسرب.{0,15}غاز/u,
  electricity:
    /electrocut|etincell|fil.{0,16}(denude|sous tension)|odeur.{0,20}brule|electric\s*shock|شرار|صعق/u,
  fire: /incendie|flammes?|fumee|\bfire\b|\bsmoke\b|حريق|دخان/u,
  major_leak:
    /fuite.{0,16}(importante|majeure|incontrol)|eau.{0,20}coule.{0,16}(fort|partout)/u,
  flood: /inond|flood|غرق|فيضان/u,
  structure:
    /effondr|affaisse|plafond.{0,15}tombe|collapse|انهيار|سقف.{0,15}طيح/u,
});
function evaluateSafety(input, model = null, previousSignals = []) {
  const signals = new Set(previousSignals.filter((s) => HAZARDS.includes(s)));
  const declared = Array.isArray(input.safety_signals)
    ? input.safety_signals
    : [];
  declared.filter((s) => HAZARDS.includes(s)).forEach((s) => signals.add(s));
  const normalized = [
    input.description || '',
    ...Object.values(input.answers || {}),
  ]
    .join(' ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  // Conservative: a negated keyword may request human review; it never certifies safety.
  for (const [signal, pattern] of Object.entries(PATTERNS))
    if (pattern.test(normalized)) signals.add(signal);
  for (const [key, answer] of Object.entries(input.answers || {})) {
    if (QUESTIONS[key]?.hazard && answer === 'yes')
      signals.add(QUESTIONS[key].hazard);
  }
  if (model) {
    model.safety_signals.forEach((s) => signals.add(s));
    if (model.urgency === 'critical') signals.add('immediate_danger');
  }
  const list = [...signals].sort();
  return {
    version: 'fixeo-safety-v1',
    signals: list,
    stop: list.length > 0,
    urgency: list.length
      ? 'now'
      : model?.urgency === 'high'
        ? 'urgent'
        : 'normale',
    messages: list.map((s) => MESSAGES[s]),
    // "none" is a client declaration, never proof that an installation is safe.
    safety_cleared: false,
  };
}
module.exports = { evaluateSafety, MESSAGES };
