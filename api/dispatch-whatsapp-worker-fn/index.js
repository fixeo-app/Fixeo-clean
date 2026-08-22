// FIXEO Dispatch WhatsApp Worker — V1 DRY RUN
// No real WhatsApp message is sent by this version.

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      ok: false,
      error: "METHOD_NOT_ALLOWED"
    });
  }
const workerSecret = process.env.DISPATCH_WHATSAPP_WORKER_SECRET;

if (!workerSecret) {
  return res.status(500).json({
    ok: false,
    error: "WORKER_SECRET_MISSING"
  });
}

const authHeader = String(req.headers.authorization || "");

if (authHeader !== "Bearer " + workerSecret) {
  return res.status(401).json({
    ok: false,
    error: "UNAUTHORIZED"
  });
}
 const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const whatsappAccessToken = process.env.WHATSAPP_ACCESS_TOKEN;

if (
  !supabaseUrl ||
  !serviceRoleKey ||
  !whatsappPhoneNumberId ||
  !whatsappAccessToken
) {
    return res.status(500).json({
      ok: false,
      error: "SERVER_CONFIGURATION_MISSING"
    });
  }

  try {
    // Call the validated Supabase RPC.
   const rpcResponse = await fetch(
  supabaseUrl + "/rest/v1/rpc/dispatch_notification_worker_peek_v1",
  {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      p_channel: "WHATSAPP"
    })
  }
);

    const rpcText = await rpcResponse.text();

    if (!rpcResponse.ok) {
      console.error(
        "[FIXEO dispatch worker] worker_next RPC failed",
        rpcResponse.status,
        rpcText
      );

      return res.status(500).json({
        ok: false,
        error: "WORKER_NEXT_FAILED",
        detail: rpcText
      });
    }

    let data;

    try {
      data = rpcText ? JSON.parse(rpcText) : [];
    } catch {
      return res.status(500).json({
        ok: false,
        error: "INVALID_RPC_RESPONSE"
      });
    }

    const notification =
      Array.isArray(data) ? data[0] : data;

    if (!notification) {
      return res.status(200).json({
        ok: true,
        mode: "DRY_RUN",
        state: "QUEUE_EMPTY"
      });
    }

    const contactPhone =
      String(notification.contact_phone || "").trim() || null;

    if (!contactPhone) {
      return res.status(200).json({
        ok: true,
        mode: "DRY_RUN",
        state: "PHONE_MISSING",
        notification_id:
          notification.notification_id || null,
        request_id:
          notification.request_id || null,
        artisan_id:
          notification.artisan_id || null
      });
    }

    // IMPORTANT:
    // No Meta / WhatsApp API call exists in this version.
    // Nothing is sent externally.

    return res.status(200).json({
      ok: true,
      mode: "DRY_RUN",
      state: "READY_TO_SEND",
      notification: {
        notification_id:
          notification.notification_id,
        request_id:
          notification.request_id,
        artisan_id:
          notification.artisan_id,
        notification_type:
          notification.notification_type,
        channel:
          notification.channel,
        notification_status:
          notification.notification_status,
        attempt_count:
          notification.attempt_count,
        contact_phone:
          contactPhone,
        claimed_at:
          notification.claimed_at
      }
    });

  } catch (error) {
    console.error(
      "[FIXEO dispatch worker] unexpected error",
      error
    );

    return res.status(500).json({
      ok: false,
      error: "UNEXPECTED_WORKER_ERROR"
    });
  }
};
