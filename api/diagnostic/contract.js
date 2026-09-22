'use strict';

const VERSION = 'fixeo-diagnostic-v1';
const PROVENANCE = Object.freeze([
  'observed',
  'user_declared',
  'ai_inferred',
  'user_confirmed',
]);
const TRADES = Object.freeze([
  'plomberie',
  'electricite',
  'serrurerie',
  'climatisation',
  'bricolage',
  'menuiserie',
  'peinture',
  'maconnerie',
  'nettoyage',
  'jardinage',
  'demenagement',
  'carrelage',
  'autre',
]);
const CITIES = Object.freeze([
  'casablanca',
  'rabat',
  'marrakech',
  'fes',
  'tanger',
  'agadir',
  'meknes',
  'oujda',
  'kenitra',
  'tetouan',
  'sale',
  'temara',
  'el-jadida',
  'beni-mellal',
  'nador',
  'khouribga',
  'safi',
  'taza',
  'ouarzazate',
  'mohammedia',
]);
const HAZARDS = Object.freeze([
  'electricity',
  'electrical_risk',
  'technical_urgency',
  'gas',
  'fire',
  'major_leak',
  'flood',
  'structure',
  'immediate_danger',
]);
const QUESTIONS = Object.freeze({
  onset: { label: 'Depuis quand constatez-vous ce problème ?', type: 'text' },
  affected_area: {
    label: 'Où se situe le problème et quelle zone est concernée ?',
    type: 'text',
  },
  occurrence: {
    label: 'À quel moment le problème apparaît-il ?',
    type: 'text',
  },
  water_spreading: {
    label: 'L’eau se propage-t-elle rapidement ?',
    type: 'choice',
    hazard: 'flood',
  },
  smoke_sparks: {
    label:
      'Avez-vous constaté de la fumée, des étincelles ou une odeur de brûlé ?',
    type: 'choice',
    hazard: 'electricity',
  },
  gas_smell: {
    label: 'Avez-vous remarqué une odeur de gaz ?',
    type: 'choice',
    hazard: 'gas',
  },
  structure_moving: {
    label:
      'Avez-vous constaté un affaissement ou des éléments qui menacent de tomber ?',
    type: 'choice',
    hazard: 'structure',
  },
});
const MEDIA = Object.freeze({
  photo: {
    enabled: true,
    count: 3,
    max_bytes: 8 * 1024 * 1024,
    mime_types: ['image/jpeg', 'image/png', 'image/webp'],
    max_pixels: 24_000_000,
  },
  // Contract reserved. No environment variable alone may enable an unfinished pipeline.
  video: {
    enabled: false,
    count: 1,
    max_bytes: 20 * 1024 * 1024,
    max_seconds: 20,
    activation_requires: [
      'codec_validation',
      'durable_processing',
      'security_review',
      'cost_review',
    ],
  },
});
const text = (maxLength) => ({ type: 'string', maxLength });
const strings = (maxItems, maxLength) => ({
  type: 'array',
  maxItems,
  items: text(maxLength),
});
const providerSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'trade',
    'problem',
    'observations',
    'hypotheses',
    'urgency',
    'urgency_reason',
    'checks',
    'possible_parts',
    'question_ids',
    'safety_signals',
  ],
  properties: {
    trade: { type: 'string', enum: TRADES },
    problem: text(240),
    observations: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'provenance', 'media_ids'],
        properties: {
          text: text(200),
          provenance: { type: 'string', enum: ['observed', 'ai_inferred'] },
          media_ids: {
            type: 'array',
            maxItems: 3,
            uniqueItems: true,
            items: { type: 'string', pattern: '^[0-9a-f-]{36}$' },
          },
        },
      },
    },
    hypotheses: strings(4, 180),
    urgency: { type: 'string', enum: ['low', 'moderate', 'high', 'critical'] },
    urgency_reason: text(240),
    checks: strings(5, 180),
    possible_parts: strings(5, 100),
    question_ids: {
      type: 'array',
      maxItems: 3,
      uniqueItems: true,
      items: { type: 'string', enum: Object.keys(QUESTIONS) },
    },
    safety_signals: {
      type: 'array',
      maxItems: HAZARDS.length,
      uniqueItems: true,
      items: { type: 'string', enum: HAZARDS },
    },
  },
};
let validate;
function validateProviderResult(value, mediaIds) {
  if (!validate)
    validate = new (require('ajv'))({ allErrors: false, strict: true }).compile(
      providerSchema,
    );
  if (!validate(value)) throw new Error('PROVIDER_SCHEMA_INVALID');
  const allowed = new Set(mediaIds);
  for (const item of value.observations) {
    if (item.provenance === 'observed' && !item.media_ids.length)
      throw new Error('OBSERVATION_WITHOUT_MEDIA');
    if (item.media_ids.some((id) => !allowed.has(id)))
      throw new Error('UNKNOWN_MEDIA_EVIDENCE');
  }
  // Do not display model-authored repair procedures, even in another result field.
  const content = JSON.stringify(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (
    /(?:touchez|manipulez|demontez|rebranchez|ouvrez|coupez|shuntez|bypass|touch|disconnect|reconnect|افتح|المس).{0,45}(?:fil|cable|gaz|gas|electri|disjonct|tableau|breaker|الكهرب|الغاز)/u.test(
      content,
    )
  ) {
    throw new Error('UNSAFE_PROVIDER_CONTENT');
  }
  if (
    /(?:\b\d+(?:[.,]\d+)?\s*(?:dh|mad|dirhams?|euros?|minutes?|heures?)\b|[€$]|sans danger|aucun risque|garanti|(?:demontez|demonter|rebranchez|rebrancher|shuntez|shunter|manipulez|manipuler|reparez|reparer|devissez|devisser|ouvrez|coupez|connectez|remplacez|touchez|المس|افتح|bypass|disconnect|reconnect))/u.test(
      content,
    )
  ) {
    throw new Error('UNSAFE_PROVIDER_CONTENT');
  }
  return value;
}

module.exports = {
  VERSION,
  PROVENANCE,
  TRADES,
  CITIES,
  HAZARDS,
  QUESTIONS,
  MEDIA,
  providerSchema,
  validateProviderResult,
};
