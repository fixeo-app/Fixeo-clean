// FIXEO Dispatch WhatsApp Worker — V1 DRY RUN
// Aucun envoi réel. Aucun changement d'état dans l'outbox.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "METHOD_NOT_ALLOWED"
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({
      ok: false,
      error: "SERVER_CONFIGURATION_MISSING"
    });
  }

  try {
    const outboxUrl =
      ${supabaseUrl}/rest/v1/dispatch_notification_outbox +
      ?select=id,request_id,artisan_id,notification_type,channel,notification_status,attempt_count,created_at +
      &notification_status=eq.PENDING +
      &channel=eq.WHATSAPP +
      &attempt_count=lt.3 +
      &order=created_at.asc +
      &limit=1;

    const outboxResponse = await fetch(outboxUrl, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: Bearer ${serviceRoleKey},
        Accept: "application/json"
      }
    });

    if (!outboxResponse.ok) {
      const body = await outboxResponse.text();

      console.error("[FIXEO dispatch worker] outbox read failed", {
        status: outboxResponse.status,
        body
      });

      return res.status(500).json({
        ok: false,
        error: "OUTBOX_READ_FAILED"
      });
    }

    const pending = await outboxResponse.json();

    if (!Array.isArray(pending) || pending.length === 0) {
      return res.status(200).json({
        ok: true,
        mode: "DRY_RUN",
        state: "NO_PENDING_NOTIFICATION"
      });
    }

    const notification = pending[0];

    const artisanUrl =
      ${supabaseUrl}/rest/v1/artisans +
      ?select=id,phone_public,phone +
      &id=eq.${encodeURIComponent(notification.artisan_id)} +
      &limit=1;

    const artisanResponse = await fetch(artisanUrl, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: Bearer ${serviceRoleKey},
        Accept: "application/json"
      }
    });

    if (!artisanResponse.ok) {
      const body = await artisanResponse.text();

      console.error("[FIXEO dispatch worker] artisan read failed", {
        status: artisanResponse.status,
        body
      });

      return res.status(500).json({
        ok: false,
        error: "ARTISAN_READ_FAILED"
      });
    }

    const artisans = await artisanResponse.json();
    const artisan = Array.isArray(artisans) ? artisans[0] : null;

    if (!artisan) {
      return res.status(200).json({
        ok: true,
        mode: "DRY_RUN",
        state: "ARTISAN_NOT_FOUND",
        notification_id: notification.id
      });
    }

    const contactPhone =
      String(artisan.phone_public || "").trim() ||
      String(artisan.phone || "").trim() ||
      null;

    if (!contactPhone) {
      return res.status(200).json({
        ok: true,
        mode: "DRY_RUN",
        state: "PHONE_MISSING",
        notification_id: notification.id,
        request_id: notification.request_id,
        artisan_id: notification.artisan_id
      });
    }

    return res.status(200).json({
      ok: true,
      mode: "DRY_RUN",
      state: "READY_TO_SEND",
      notification: {
        notification_id: notification.id,
        request_id: notification.request_id,
        artisan_id: notification.artisan_id,
        notification_type: notification.notification_type,
        channel: notification.channel,
        notification_status: notification.notification_status,
        attempt_count: notification.attempt_count,
        contact_phone: contactPhone
      }
    });

  } catch (error) {
    console.error("[FIXEO dispatch worker] unexpected error", error);

    return res.status(500).json({
      ok: false,
      error: "UNEXPECTED_WORKER_ERROR"
    });
  }
}
