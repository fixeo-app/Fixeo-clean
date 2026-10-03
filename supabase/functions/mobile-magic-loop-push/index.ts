import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type PushEntry = {
  token: string;
  message: Record<string, unknown>;
  artisanId?: string;
};

async function sendExpo(service: any, entries: PushEntry[]) {
  if (!entries.length) return { delivered: 0, successfulArtisanIds: [] as string[] };

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(entries.map((entry) => entry.message)),
  });

  if (!response.ok) throw new Error("EXPO_PUSH_UNAVAILABLE");
  const payload = await response.json();
  const tickets = Array.isArray(payload?.data) ? payload.data : [payload?.data];

  let delivered = 0;
  const successfulArtisans = new Set<string>();

  for (let i = 0; i < entries.length; i++) {
    const ticket = tickets[i];
    const entry = entries[i];
    if (ticket?.status === "ok") {
      delivered += 1;
      if (entry.artisanId) successfulArtisans.add(entry.artisanId);
      continue;
    }

    if (ticket?.details?.error === "DeviceNotRegistered") {
      await service
        .from("mobile_devices")
        .update({ enabled: false, updated_at: new Date().toISOString() })
        .eq("expo_push_token", entry.token);
    }
  }

  return { delivered, successfulArtisanIds: [...successfulArtisans] };
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
  const action = body?.action;
  const requestId = body?.request_id;
  if (!isUuid(requestId)) return json({ ok: false, error: "INVALID_REQUEST_ID" }, 400);

  if (action === "dispatch_opportunities") {
    const { data: request, error: requestError } = await service
      .from("service_requests")
      .select("id,client_profile_id,service_category,city,status")
      .eq("id", requestId)
      .maybeSingle();

    if (requestError || !request) return json({ ok: false, error: "REQUEST_NOT_FOUND" }, 404);
    if (request.client_profile_id !== user.id) return json({ ok: false, error: "FORBIDDEN" }, 403);
    if (request.status !== "new") return json({ ok: true, delivered: 0, reason: "request_not_new" });

    const { data: queueRows, error: queueError } = await service
      .from("dispatch_execution_queue")
      .select("artisan_id,execution_status")
      .eq("request_id", requestId)
      .eq("execution_status", "QUEUED");

    if (queueError) return json({ ok: false, error: "QUEUE_UNAVAILABLE" }, 503);
    const artisanIds = [...new Set((queueRows || []).map((row: any) => row.artisan_id).filter(Boolean))];
    if (!artisanIds.length) return json({ ok: true, delivered: 0, reason: "no_queued_artisan" });

    const { data: artisans, error: artisansError } = await service
      .from("artisans")
      .select("id,owner_user_id")
      .in("id", artisanIds);

    if (artisansError) return json({ ok: false, error: "ARTISAN_LOOKUP_FAILED" }, 503);

    const ownerByArtisan = new Map<string, string>();
    for (const artisan of artisans || []) {
      if (artisan.owner_user_id) ownerByArtisan.set(artisan.id, artisan.owner_user_id);
    }
    const ownerIds = [...new Set([...ownerByArtisan.values()])];
    if (!ownerIds.length) return json({ ok: true, delivered: 0, reason: "no_claimed_artisan" });

    const { data: devices, error: devicesError } = await service
      .from("mobile_devices")
      .select("user_id,expo_push_token")
      .in("user_id", ownerIds)
      .eq("enabled", true);

    if (devicesError) return json({ ok: false, error: "DEVICE_LOOKUP_FAILED" }, 503);

    const artisanByOwner = new Map<string, string>();
    for (const [artisanId, ownerId] of ownerByArtisan.entries()) artisanByOwner.set(ownerId, artisanId);

    const entries: PushEntry[] = (devices || []).map((device: any) => ({
      token: device.expo_push_token,
      artisanId: artisanByOwner.get(device.user_id),
      message: {
        to: device.expo_push_token,
        sound: "default",
        channelId: "fixeo-opportunities",
        title: "Nouvelle opportunité FIXEO",
        body: [request.service_category, request.city].filter(Boolean).join(" · "),
        data: { screen: "artisan", type: "dispatch_offer", request_id: requestId },
      },
    }));

    const sent = await sendExpo(service, entries);

    if (sent.successfulArtisanIds.length) {
      await service
        .from("dispatch_execution_queue")
        .update({ execution_status: "CONTACTED", updated_at: new Date().toISOString() })
        .eq("request_id", requestId)
        .eq("execution_status", "QUEUED")
        .in("artisan_id", sent.successfulArtisanIds);
    }

    return json({ ok: true, delivered: sent.delivered, contacted_artisans: sent.successfulArtisanIds.length });
  }

  if (action === "mission_accepted") {
    const { data: mission, error: missionError } = await service
      .from("missions")
      .select("id,artisan_profile_id,status")
      .eq("request_id", requestId)
      .eq("status", "pending")
      .maybeSingle();

    if (missionError || !mission) return json({ ok: false, error: "ACCEPTED_MISSION_NOT_FOUND" }, 409);

    const { data: artisan } = await service
      .from("artisans")
      .select("owner_user_id")
      .eq("id", mission.artisan_profile_id)
      .maybeSingle();
    if (!artisan || artisan.owner_user_id !== user.id) return json({ ok: false, error: "FORBIDDEN" }, 403);

    const published = await userClient.rpc("publish_notification_event_s1b", {
      p_event: "mission_accepted",
      p_entity_id: requestId,
    });
    if (published.error) return json({ ok: false, error: "NOTIFICATION_EVENT_REJECTED" }, 403);

    const { data: request } = await service
      .from("service_requests")
      .select("client_profile_id")
      .eq("id", requestId)
      .maybeSingle();
    const clientId = request?.client_profile_id;
    if (!clientId) return json({ ok: true, delivered: 0, reason: "guest_client" });

    const { data: notification } = await service
      .from("notifications")
      .select("id,metadata")
      .eq("recipient_user_id", clientId)
      .eq("related_entity_id", requestId)
      .eq("type", "c_artisan_assigned")
      .maybeSingle();

    if ((notification?.metadata as any)?.mobile_push_sent_at) {
      return json({ ok: true, delivered: 0, reason: "already_pushed" });
    }

    const { data: devices, error: devicesError } = await service
      .from("mobile_devices")
      .select("expo_push_token")
      .eq("user_id", clientId)
      .eq("enabled", true);
    if (devicesError) return json({ ok: false, error: "DEVICE_LOOKUP_FAILED" }, 503);

    const entries: PushEntry[] = (devices || []).map((device: any) => ({
      token: device.expo_push_token,
      message: {
        to: device.expo_push_token,
        sound: "default",
        title: "Artisan trouvé",
        body: "Votre artisan est trouvé. FIXEO suit l’intervention avec vous.",
        data: { screen: "client-mission", type: "artisan_assigned", request_id: requestId, mission_id: mission.id },
      },
    }));
    const sent = await sendExpo(service, entries);

    if (sent.delivered > 0 && notification?.id) {
      await service
        .from("notifications")
        .update({
          metadata: {
            ...(notification.metadata || {}),
            mobile_push_sent_at: new Date().toISOString(),
          },
        })
        .eq("id", notification.id);
    }

    return json({ ok: true, delivered: sent.delivered });
  }


  if (action === "mission_arrived") {
    const { data: mission, error: missionError } = await service
      .from("missions")
      .select("id,request_id,artisan_profile_id,status")
      .eq("request_id", requestId)
      .eq("status", "pending")
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
      .select("client_profile_id,status")
      .eq("id", requestId)
      .maybeSingle();
    if (!request || !["assigned","in_progress"].includes(request.status)) {
      return json({ ok: false, error: "INVALID_REQUEST_STATE" }, 409);
    }
    if (!request.client_profile_id) return json({ ok: true, delivered: 0, reason: "guest_client" });

    const { data: notification } = await service
      .from("notifications")
      .select("id,metadata")
      .eq("recipient_user_id", request.client_profile_id)
      .eq("related_entity_id", requestId)
      .eq("type", "c_artisan_arrived")
      .maybeSingle();

    if ((notification?.metadata as any)?.mobile_push_sent_at) {
      return json({ ok: true, delivered: 0, reason: "already_pushed" });
    }

    const { data: devices, error: devicesError } = await service
      .from("mobile_devices")
      .select("expo_push_token")
      .eq("user_id", request.client_profile_id)
      .eq("enabled", true);
    if (devicesError) return json({ ok: false, error: "DEVICE_LOOKUP_FAILED" }, 503);

    const entries: PushEntry[] = (devices || []).map((device: any) => ({
      token: device.expo_push_token,
      message: {
        to: device.expo_push_token,
        sound: "default",
        title: "Votre artisan est arrivé",
        body: "L’artisan FIXEO est sur place. Vous gardez le suivi dans l’application.",
        data: { screen: "client-mission", type: "artisan_arrived", request_id: requestId, mission_id: mission.id },
      },
    }));
    const sent = await sendExpo(service, entries);

    if (sent.delivered > 0 && notification?.id) {
      await service
        .from("notifications")
        .update({
          metadata: {
            ...(notification.metadata || {}),
            mobile_push_sent_at: new Date().toISOString(),
          },
        })
        .eq("id", notification.id);
    }

    return json({ ok: true, delivered: sent.delivered });
  }

  if (action === "mission_started" || action === "mission_completed") {
    const expectedMissionStatus = action === "mission_started" ? "pending" : "done";
    const expectedRequestStatus = action === "mission_started" ? "in_progress" : "completed";
    const eventName = action === "mission_started" ? "mission_started" : "mission_completed";
    const notificationType = action === "mission_started" ? "c_mission_started" : "c_mission_completed";

    const { data: mission, error: missionError } = await service
      .from("missions")
      .select("id,artisan_profile_id,status")
      .eq("request_id", requestId)
      .eq("status", expectedMissionStatus)
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
      .select("client_profile_id,status")
      .eq("id", requestId)
      .maybeSingle();
    if (!request || request.status !== expectedRequestStatus) {
      return json({ ok: false, error: "INVALID_REQUEST_STATE" }, 409);
    }

    const published = await userClient.rpc("publish_notification_event_s1b", {
      p_event: eventName,
      p_entity_id: requestId,
    });
    if (published.error) return json({ ok: false, error: "NOTIFICATION_EVENT_REJECTED" }, 403);

    if (!request.client_profile_id) return json({ ok: true, delivered: 0, reason: "guest_client" });

    const { data: notification } = await service
      .from("notifications")
      .select("id,metadata")
      .eq("recipient_user_id", request.client_profile_id)
      .eq("related_entity_id", requestId)
      .eq("type", notificationType)
      .maybeSingle();

    if ((notification?.metadata as any)?.mobile_push_sent_at) {
      return json({ ok: true, delivered: 0, reason: "already_pushed" });
    }

    const { data: devices, error: devicesError } = await service
      .from("mobile_devices")
      .select("expo_push_token")
      .eq("user_id", request.client_profile_id)
      .eq("enabled", true);
    if (devicesError) return json({ ok: false, error: "DEVICE_LOOKUP_FAILED" }, 503);

    const title = action === "mission_started" ? "Intervention démarrée" : "Intervention terminée";
    const bodyText = action === "mission_started"
      ? "Votre artisan a démarré l’intervention. FIXEO continue le suivi."
      : "L’intervention est terminée. Confirmez la bonne fin depuis FIXEO.";

    const entries: PushEntry[] = (devices || []).map((device: any) => ({
      token: device.expo_push_token,
      message: {
        to: device.expo_push_token,
        sound: "default",
        title,
        body: bodyText,
        data: { screen: "client-mission", type: notificationType, request_id: requestId, mission_id: mission.id },
      },
    }));
    const sent = await sendExpo(service, entries);

    if (sent.delivered > 0 && notification?.id) {
      await service
        .from("notifications")
        .update({
          metadata: {
            ...(notification.metadata || {}),
            mobile_push_sent_at: new Date().toISOString(),
          },
        })
        .eq("id", notification.id);
    }

    return json({ ok: true, delivered: sent.delivered });
  }

  if (action === "mission_validated") {
    const { data: request, error: requestError } = await service
      .from("service_requests")
      .select("client_profile_id,status")
      .eq("id", requestId)
      .maybeSingle();

    if (requestError || !request) return json({ ok: false, error: "REQUEST_NOT_FOUND" }, 404);
    if (request.client_profile_id !== user.id) return json({ ok: false, error: "FORBIDDEN" }, 403);
    if (request.status !== "validated") return json({ ok: false, error: "INVALID_REQUEST_STATE" }, 409);

    const { data: mission, error: missionError } = await service
      .from("missions")
      .select("id,artisan_profile_id,status")
      .eq("request_id", requestId)
      .eq("status", "validated")
      .maybeSingle();
    if (missionError || !mission) return json({ ok: false, error: "MISSION_NOT_FOUND" }, 404);

    const published = await userClient.rpc("publish_notification_event_s1b", {
      p_event: "mission_validated",
      p_entity_id: requestId,
    });
    if (published.error) return json({ ok: false, error: "NOTIFICATION_EVENT_REJECTED" }, 403);

    const { data: artisan } = await service
      .from("artisans")
      .select("owner_user_id")
      .eq("id", mission.artisan_profile_id)
      .maybeSingle();
    const artisanOwner = artisan?.owner_user_id;
    if (!artisanOwner) return json({ ok: true, delivered: 0, reason: "artisan_unclaimed" });

    const { data: notification } = await service
      .from("notifications")
      .select("id,metadata")
      .eq("recipient_user_id", artisanOwner)
      .eq("related_entity_id", requestId)
      .eq("type", "a_mission_validated")
      .maybeSingle();

    if ((notification?.metadata as any)?.mobile_push_sent_at) {
      return json({ ok: true, delivered: 0, reason: "already_pushed" });
    }

    const { data: devices, error: devicesError } = await service
      .from("mobile_devices")
      .select("expo_push_token")
      .eq("user_id", artisanOwner)
      .eq("enabled", true);
    if (devicesError) return json({ ok: false, error: "DEVICE_LOOKUP_FAILED" }, 503);

    const entries: PushEntry[] = (devices || []).map((device: any) => ({
      token: device.expo_push_token,
      message: {
        to: device.expo_push_token,
        sound: "default",
        channelId: "fixeo-opportunities",
        title: "Mission validée",
        body: "Le client a confirmé la bonne fin de l’intervention.",
        data: { screen: "artisan", type: "mission_validated", request_id: requestId, mission_id: mission.id },
      },
    }));
    const sent = await sendExpo(service, entries);

    if (sent.delivered > 0 && notification?.id) {
      await service
        .from("notifications")
        .update({
          metadata: {
            ...(notification.metadata || {}),
            mobile_push_sent_at: new Date().toISOString(),
          },
        })
        .eq("id", notification.id);
    }

    return json({ ok: true, delivered: sent.delivered });
  }

  return json({ ok: false, error: "UNKNOWN_ACTION" }, 400);
});
