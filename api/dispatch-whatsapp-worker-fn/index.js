// FIXEO Dispatch WhatsApp Worker — V1 DRY RUN
// No real WhatsApp message is sent by this version.

const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  // Only POST is allowed.
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      ok: false,
      error: "METHOD_NOT_ALLOWED",
    });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({
        ok: false,
        error: "SERVER_CONFIGURATION_MISSING",
      });
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    // Atomically claim the next pending WhatsApp notification.
    const { data, error } = await supabase.rpc(
      "dispatch_notification_worker_next_v1",
      {
        p_channel: "WHATSAPP",
      }
    );

    if (error) {
      console.error(
        "[FIXEO dispatch worker] worker_next RPC error:",
        error
      );

      return res.status(500).json({
        ok: false,
        error: "WORKER_NEXT_FAILED",
        detail: error.message,
      });
    }

    // Depending on Supabase/Postgres return shape,
    // a SETOF/table function normally returns an array.
    const notification = Array.isArray(data)
      ? data[0]
      : data;

    // Queue empty.
    if (!notification) {
      return res.status(200).json({
        ok: true,
        mode: "DRY_RUN",
        state: "QUEUE_EMPTY",
      });
    }

    const contactPhone =
      notification.contact_phone || null;

    // Safety guard: never attempt anything without a phone.
    if (!contactPhone) {
      return res.status(200).json({
        ok: true,
        mode: "DRY_RUN",
        state: "PHONE_MISSING",
        notification_id: notification.id,
        request_id: notification.request_id,
        artisan_id: notification.artisan_id,
      });
    }

    // IMPORTANT:
    // V1 is deliberately DRY RUN.
    // No Meta / WhatsApp API call exists here.
    // No message is actually sent.

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
        contact_phone: contactPhone,
      },
    });
  } catch (error) {
    console.error(
      "[FIXEO dispatch worker] unexpected error:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: "UNEXPECTED_WORKER_ERROR",
    });
  }
};
