import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "mission-evidence-private-v1";
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authorization = req.headers.get("authorization") || "";

  if (!url || !anon || !serviceKey || !authorization) {
    return json({ ok: false, error: "AUTH_UNAVAILABLE" }, 401);
  }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return json({ ok: false, error: "UNAUTHENTICATED" }, 401);

  const body = await req.json().catch(() => null);
  const action = String(body?.action || "");

  if (action === "create_upload") {
    const missionId = body?.mission_id;
    const kind = String(body?.kind || "");
    const mimeType = String(body?.mime_type || "image/jpeg");

    if (!isUuid(missionId) || !["before", "after"].includes(kind) || !MIME_EXT[mimeType]) {
      return json({ ok: false, error: "INVALID_INPUT" }, 400);
    }

    const { data: mission, error: missionError } = await service
      .from("missions")
      .select("id,request_id,artisan_profile_id,status")
      .eq("id", missionId)
      .maybeSingle();
    if (missionError || !mission) return json({ ok: false, error: "MISSION_NOT_FOUND" }, 404);

    const { data: artisan } = await service
      .from("artisans")
      .select("owner_user_id")
      .eq("id", mission.artisan_profile_id)
      .maybeSingle();
    if (!artisan || artisan.owner_user_id !== user.id) return json({ ok: false, error: "FORBIDDEN" }, 403);

    const { data: request } = await service
      .from("service_requests")
      .select("status")
      .eq("id", mission.request_id)
      .maybeSingle();
    if (!request) return json({ ok: false, error: "REQUEST_NOT_FOUND" }, 404);

    const allowed = kind === "before"
      ? ["assigned", "in_progress"].includes(request.status) && mission.status === "pending"
      : ["in_progress", "completed"].includes(request.status) && ["pending", "done"].includes(mission.status);
    if (!allowed) return json({ ok: false, error: "INVALID_MISSION_STATE" }, 409);

    const evidenceId = crypto.randomUUID();
    const ext = MIME_EXT[mimeType];
    const path = `missions/${missionId}/${kind}/${evidenceId}.${ext}`;

    const { data: signed, error: signedError } = await service.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (signedError || !signed?.token) return json({ ok: false, error: "UPLOAD_TICKET_FAILED" }, 503);

    const { error: insertError } = await service
      .from("mobile_mission_evidence_v1")
      .insert({
        id: evidenceId,
        mission_id: missionId,
        uploaded_by: user.id,
        kind,
        storage_path: path,
        mime_type: mimeType,
        status: "pending",
      });
    if (insertError) return json({ ok: false, error: "EVIDENCE_REGISTER_FAILED" }, 503);

    return json({
      ok: true,
      evidence_id: evidenceId,
      bucket: BUCKET,
      path,
      token: signed.token,
    });
  }

  if (action === "confirm_upload") {
    const evidenceId = body?.evidence_id;
    if (!isUuid(evidenceId)) return json({ ok: false, error: "INVALID_EVIDENCE_ID" }, 400);

    const { data: evidence, error: evidenceError } = await service
      .from("mobile_mission_evidence_v1")
      .select("id,mission_id,uploaded_by,kind,storage_path,status")
      .eq("id", evidenceId)
      .maybeSingle();
    if (evidenceError || !evidence) return json({ ok: false, error: "EVIDENCE_NOT_FOUND" }, 404);
    if (evidence.uploaded_by !== user.id) return json({ ok: false, error: "FORBIDDEN" }, 403);
    if (evidence.status === "ready") return json({ ok: true, already_confirmed: true });

    const parts = String(evidence.storage_path).split("/");
    const fileName = parts.pop() || "";
    const folder = parts.join("/");
    const { data: listed, error: listError } = await service.storage
      .from(BUCKET)
      .list(folder, { search: fileName, limit: 5 });
    if (listError || !(listed || []).some((item: any) => item.name === fileName)) {
      return json({ ok: false, error: "OBJECT_NOT_FOUND" }, 409);
    }

    const { error: updateError } = await service
      .from("mobile_mission_evidence_v1")
      .update({ status: "ready", confirmed_at: new Date().toISOString() })
      .eq("id", evidenceId)
      .eq("uploaded_by", user.id);
    if (updateError) return json({ ok: false, error: "CONFIRM_FAILED" }, 503);

    return json({ ok: true, evidence_id: evidenceId });
  }

  if (action === "list") {
    const missionId = body?.mission_id;
    if (!isUuid(missionId)) return json({ ok: false, error: "INVALID_MISSION_ID" }, 400);

    const { data: mission, error: missionError } = await service
      .from("missions")
      .select("id,request_id,artisan_profile_id")
      .eq("id", missionId)
      .maybeSingle();
    if (missionError || !mission) return json({ ok: false, error: "MISSION_NOT_FOUND" }, 404);

    const { data: request } = await service
      .from("service_requests")
      .select("client_profile_id")
      .eq("id", mission.request_id)
      .maybeSingle();
    const { data: artisan } = await service
      .from("artisans")
      .select("owner_user_id")
      .eq("id", mission.artisan_profile_id)
      .maybeSingle();

    const allowed = request?.client_profile_id === user.id || artisan?.owner_user_id === user.id;
    if (!allowed) return json({ ok: false, error: "FORBIDDEN" }, 403);

    const { data: rows, error: rowsError } = await service
      .from("mobile_mission_evidence_v1")
      .select("id,kind,storage_path,mime_type,created_at")
      .eq("mission_id", missionId)
      .eq("status", "ready")
      .order("created_at", { ascending: true });
    if (rowsError) return json({ ok: false, error: "EVIDENCE_LOOKUP_FAILED" }, 503);

    const paths = (rows || []).map((row: any) => row.storage_path);
    const signedMap = new Map<string, string>();
    if (paths.length) {
      const { data: signedRows, error: signedError } = await service.storage
        .from(BUCKET)
        .createSignedUrls(paths, 900);
      if (signedError) return json({ ok: false, error: "SIGNED_READ_FAILED" }, 503);
      for (const item of signedRows || []) {
        if (item.path && item.signedUrl) signedMap.set(item.path, item.signedUrl);
      }
    }

    return json({
      ok: true,
      evidence: (rows || []).map((row: any) => ({
        id: row.id,
        kind: row.kind,
        mime_type: row.mime_type,
        created_at: row.created_at,
        signed_url: signedMap.get(row.storage_path) || null,
      })),
    });
  }

  return json({ ok: false, error: "UNKNOWN_ACTION" }, 400);
});
