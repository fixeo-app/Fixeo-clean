"use strict";
const crypto = require("node:crypto");
const { hash } = require("./auth");
const { TRADES } = require("./contract");
const { RISK_VERSION } = require("./safety");
const { confirmCritical } = require("./critical-request");
const { DiagnosticError } = require("./transport");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const phoneValue = (value) =>
  typeof value === "string" ? value.replace(/[\s().-]+/g, "") : "";
const validPhone = (value) => /^(\+212|0)[5-7][0-9]{8}$/.test(value);

function qualified(data, revision, runId) {
  const s = data.session,
    run = data.run,
    r = run?.result;
  if (
    !s ||
    !run ||
    s.revision !== revision ||
    run.revision !== s.revision ||
    run.id !== s.selected_run_id ||
    run.id !== runId ||
    run.state !== "complete" ||
    !["ready", "bound"].includes(s.state) ||
    r?.safety?.version !== RISK_VERSION ||
    !TRADES.includes(r.trade?.value) ||
    !Array.isArray(r.questions) ||
    r.questions.length ||
    !["TECHNICAL", "URGENT", "CRITICAL"].includes(r.safety.level) ||
    r.safety.stop !== (r.safety.level === "CRITICAL")
  )
    throw new DiagnosticError("DIAGNOSTIC_NOT_QUALIFIED", 409);
  return r;
}
async function rows(transport, table, filter, columns, limit = 1) {
  return transport.request(
    "/rest/v1/" +
      table +
      "?" +
      new URLSearchParams({ ...filter, select: columns, limit: String(limit) }),
    { method: "GET" },
  );
}
async function knownPhone(data, transport) {
  const s = data.session;
  if (s.service_request_id && UUID.test(s.service_request_id)) {
    const [request] = await rows(
      transport,
      "service_requests",
      { id: "eq." + s.service_request_id },
      "client_phone",
    );
    const phone = phoneValue(request?.client_phone);
    if (validPhone(phone)) return phone;
  }
  if (s.owner_user_id && UUID.test(s.owner_user_id)) {
    const [profile] = await rows(
      transport,
      "profiles",
      { id: "eq." + s.owner_user_id },
      "phone",
    );
    const phone = phoneValue(profile?.phone);
    if (validPhone(phone)) return phone;
  }
  return "";
}

// Read only the request already bound to the authenticated Diagnostic dossier.
// No browser-provided request ID, matching call, notification or reassignment.
async function interventionStatus(data, transport) {
  const id = data.session?.service_request_id;
  if (!UUID.test(id || ""))
    throw new DiagnosticError("DIAGNOSTIC_NOT_BOOKED", 409);
  try {
    const [sr] = await rows(
      transport,
      "service_requests",
      { id: "eq." + id },
      "id,tracking_ref,status,urgency",
    );
    if (!sr) throw new Error("UNAVAILABLE");
    const queries = await Promise.allSettled([
      rows(
        transport,
        "dispatch_execution_queue",
        { request_id: "eq." + id },
        "execution_status",
        100,
      ),
      rows(
        transport,
        "dispatch_notification_outbox",
        { request_id: "eq." + id, notification_type: "eq.DISPATCH_REQUEST" },
        "notification_status,sent_at,provider_message_id",
        100,
      ),
      rows(
        transport,
        "missions",
        { request_id: "eq." + id, status: "in.(pending,done,validated)" },
        "status",
        1,
      ),
    ]);
    const [queue, notices, missions] = queries.map((q) =>
      q.status === "fulfilled" ? q.value : [],
    );
    const confirmed =
      ["assigned", "in_progress", "completed", "validated"].includes(
        sr.status,
      ) && missions.length > 0;
    const sent = notices.some(
      (n) =>
        n.notification_status === "SENT" && n.sent_at && n.provider_message_id,
    );
    const pending =
      queue.some((q) => q.execution_status === "QUEUED") ||
      notices.some((n) =>
        ["PENDING", "PROCESSING"].includes(n.notification_status),
      );
    const failed = notices.some((n) => n.notification_status === "FAILED");
    return {
      request_id: id,
      tracking_ref: sr.tracking_ref,
      request_status: sr.status,
      urgency: sr.urgency,
      stage:
        sr.status === "cancelled"
          ? "cancelled"
          : confirmed
            ? ["completed", "validated"].includes(sr.status)
              ? "completed"
              : sr.status === "in_progress"
                ? "intervention"
                : "artisan_confirmed"
            : sent
              ? "notification_sent"
              : pending
                ? "dispatch_prepared"
                : "registered",
      matching: queue.length
        ? "matched"
        : sr.status === "no_match"
          ? "no_match"
          : "unconfirmed",
      notification: sent
        ? "sent"
        : failed
          ? "failed"
          : pending
            ? "prepared"
            : "unconfirmed",
      sync_pending: queries.some((q) => q.status === "rejected"),
    };
  } catch (_) {
    // The request is durably bound. A read failure must never undo creation or
    // prompt another insertion; the owner can refresh this same request later.
    return {
      request_id: id,
      stage: "registered",
      matching: "unconfirmed",
      notification: "unconfirmed",
      sync_pending: true,
    };
  }
}
async function confirmationContext({ data, body, transport }) {
  const result = qualified(data, body.revision, body.run_id);
  const phone = await knownPhone(data, transport);
  return {
    ok: true,
    client_phone: phone,
    risk_level: result.safety.level,
    ...(data.session.state === "bound"
      ? { progress: await interventionStatus(data, transport) }
      : {}),
  };
}
async function confirmIntervention({ body, data, actor, transport, env }) {
  const r = qualified(data, body.revision, body.run_id),
    s = data.session,
    run = data.run;
  const phone = body.client_phone
    ? phoneValue(body.client_phone)
    : await knownPhone(data, transport);
  if (!validPhone(phone)) throw new DiagnosticError("INVALID_PHONE");
  let confirmation;
  if (r.safety.level === "CRITICAL") {
    // Keep the exact previously validated critical acknowledgement/RPC path.
    confirmation = await confirmCritical({
      body: { ...body, client_phone: phone },
      data,
      actor,
      transport,
      env,
    });
  } else {
    if (!["normale", "urgent"].includes(r.safety.urgency))
      throw new DiagnosticError("DIAGNOSTIC_NOT_QUALIFIED", 409);
    const token = crypto
      .createHmac("sha256", env.FIXEO_ESTIMATOR_SECRET)
      .update("fixeo-diagnostic-quote-guest:" + s.id)
      .digest("hex");
    const tracking =
      "FX-" +
      crypto
        .createHmac("sha256", env.FIXEO_ESTIMATOR_SECRET)
        .update("fixeo-diagnostic-quote-tracking:" + s.id)
        .digest("hex")
        .slice(0, 16)
        .toUpperCase();
    // Existing no-price request RPC already atomically locks, inserts and binds
    // the Diagnostic. Its name is historical; no Estimation call/token is needed.
    confirmation = await transport.rpc("create_diagnostic_quote_request_v1", {
      p_diagnostic: {
        session_id: s.id,
        revision: s.revision,
        run_id: run.id,
        actor,
        qualification_answers: Object.entries(s.input.answers || {}).map(
          ([question_id, value]) => ({ question_id, value }),
        ),
      },
      p_client_phone: phone,
      p_tracking_ref: tracking,
      p_guest_token_hash: hash(token),
      p_description: (
        "Demande d’intervention FIXEO — diagnostic indicatif, à confirmer par le professionnel. " +
        (r.problem?.value || "") +
        (s.input.description
          ? " — Déclaration client : " + s.input.description
          : "")
      ).slice(0, 1000),
      p_service_category: r.trade.value,
      p_city_slug: s.city_slug,
    });
    confirmation = {
      ...confirmation,
      guest_token: token,
      risk_level: r.safety.level,
      urgency: r.safety.urgency,
    };
  }
  if (!confirmation.ok || !UUID.test(confirmation.request_id || ""))
    throw new DiagnosticError("CONFIRMATION_REJECTED", 409);
  const progress = await interventionStatus(
    { session: { ...s, service_request_id: confirmation.request_id } },
    transport,
  );
  return { ...confirmation, progress };
}
module.exports = {
  qualified,
  confirmationContext,
  confirmIntervention,
  interventionStatus,
};
