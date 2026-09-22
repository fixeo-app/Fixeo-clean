"use strict";
const { DiagnosticError } = require("./transport");

// Fixed internal labels only. Never copy a provider value, schema error, media
// ID, customer text or response body into logging metadata.
const conditions = {
  synthesis: [
    "observations_missing",
    "observations_not_empty",
    "unbound_visual_claim",
  ],
  engine: [
    "observation_count",
    "observation_text",
    "observation_provenance",
    "observation_media_ids",
  ],
  photo_evidence: [
    "schema",
    "photo_count",
    "media_id",
    "inconclusive_observations",
    "informative_without_observations",
    "missing_media",
  ],
  provider_result: ["schema", "observation_without_media", "unknown_media"],
};
const fields = new Set([
  "problem",
  "hypotheses",
  "urgency_reason",
  "checks",
  "possible_parts",
]);
const metadata = new WeakMap();
function markGroundingError(error, stage, condition, field) {
  if (conditions[stage]?.includes(condition)) {
    metadata.set(
      error,
      Object.freeze({
        stage,
        condition,
        ...(fields.has(field) ? { field } : {}),
      }),
    );
  }
  return error;
}
function groundingError(stage, condition, field) {
  return markGroundingError(
    new DiagnosticError(
      stage === "photo_evidence"
        ? "PHOTO_EVIDENCE_INVALID"
        : "UNGROUNDED_PROVIDER_OBSERVATION",
      502,
    ),
    stage,
    condition,
    field,
  );
}
function groundingLogDetails(error) {
  return metadata.get(error);
}
module.exports = { groundingError, markGroundingError, groundingLogDetails };
