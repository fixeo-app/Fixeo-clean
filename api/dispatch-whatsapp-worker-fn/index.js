'use strict';

const { timingSafeEqual } = require('node:crypto');
const { assertServerTarget } = require('../supabase-environment');

const MAX_ATTEMPTS = 3;
const META_TIMEOUT_MS = 15000;

function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function safeEqualBearer(header, secret) {
  const supplied = Buffer.from(String(header || ''));
  const expected = Buffer.from('Bearer ' + secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function trimSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function parseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) { return null; }
}

function normalizeMoroccoPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = '212' + digits.slice(1);
  if (!/^212[5-7]\d{8}$/.test(digits)) return null;
  return digits;
}

function retryableStatus(status) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

async function rpc({ supabaseUrl, serviceRoleKey }, name, body) {
  const response = await fetch(
    trimSlash(supabaseUrl) + '/rest/v1/rpc/' + name,
    {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: 'Bearer ' + serviceRoleKey,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(body || {}),
      signal: AbortSignal.timeout(15000)
    }
  );
  const text = await response.text();
  if (!response.ok) {
    const error = new Error('RPC_FAILED');
    error.status = response.status;
    error.detail = text.slice(0, 500);
    throw error;
  }
  return parseJson(text);
}

async function finalizeFailure(config, notificationId, errorCode) {
  return rpc(
    config,
    'dispatch_finalize_notification_v1',
    {
      p_notification_id: notificationId,
      p_final_status: 'FAILED',
      p_provider_message_id: null,
      p_last_error: String(errorCode || 'WHATSAPP_SEND_FAILED').slice(0, 500)
    }
  );
}

async function releaseForRetry(config, notificationId, errorCode) {
  return rpc(
    config,
    'dispatch_retry_notification_v1',
    {
      p_notification_id: notificationId,
      p_last_error: String(errorCode || 'WHATSAPP_RETRYABLE_FAILURE').slice(0, 500)
    }
  );
}

function templatePayload(to, templateName, languageCode) {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode }
    }
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const workerSecret = process.env.DISPATCH_WHATSAPP_WORKER_SECRET;
  if (!workerSecret || workerSecret.length < 32) {
    return json(res, 503, { ok: false, error: 'WORKER_SECRET_MISSING' });
  }
  if (!safeEqualBearer(req.headers.authorization, workerSecret)) {
    return json(res, 401, { ok: false, error: 'UNAUTHORIZED' });
  }

  if ((req.query && Object.keys(req.query).length) ||
      (req.body && Object.keys(req.body).length)) {
    return json(res, 400, { ok: false, error: 'NO_PARAMETERS_ALLOWED' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return json(res, 503, { ok: false, error: 'SERVER_CONFIGURATION_MISSING' });
  }

  try {
    assertServerTarget();
  } catch (_) {
    return json(res, 503, { ok: false, error: 'SUPABASE_TARGET_REJECTED' });
  }

  const config = { supabaseUrl, serviceRoleKey };
  const sendEnabled = process.env.WHATSAPP_SEND_ENABLED === 'true';

  try {
    if (!sendEnabled) {
      const data = await rpc(config, 'dispatch_notification_worker_peek_v1', {
        p_channel: 'WHATSAPP'
      });
      const notification = Array.isArray(data) ? data[0] : data;
      if (!notification) {
        return json(res, 200, {
          ok: true,
          mode: 'PRE_CUTOVER',
          send_enabled: false,
          state: 'QUEUE_EMPTY'
        });
      }
      return json(res, 200, {
        ok: true,
        mode: 'PRE_CUTOVER',
        send_enabled: false,
        state: 'READY_TO_SEND',
        notification: {
          notification_id: notification.notification_id || null,
          request_id: notification.request_id || null,
          artisan_id: notification.artisan_id || null,
          notification_type: notification.notification_type || null,
          attempt_count: notification.attempt_count ?? null
        }
      });
    }

    const wabaId = String(process.env.WHATSAPP_WABA_ID || '').trim();
    const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
    const accessToken = String(process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
    const apiVersion = String(process.env.WHATSAPP_GRAPH_API_VERSION || '').trim();
    const templateName = String(process.env.WHATSAPP_DISPATCH_TEMPLATE_NAME || '').trim();
    const templateLanguage = String(process.env.WHATSAPP_DISPATCH_TEMPLATE_LANGUAGE || '').trim();

    if (!/^\d+$/.test(wabaId) || !/^\d+$/.test(phoneNumberId) || !accessToken ||
        !/^v\d+\.\d+$/.test(apiVersion) || !templateName || !templateLanguage) {
      return json(res, 503, { ok: false, error: 'META_CONFIGURATION_MISSING' });
    }

    const claimedData = await rpc(config, 'dispatch_notification_worker_next_v1', {
      p_channel: 'WHATSAPP'
    });
    const notification = Array.isArray(claimedData) ? claimedData[0] : claimedData;

    if (!notification) {
      return json(res, 200, {
        ok: true,
        mode: 'LIVE',
        send_enabled: true,
        state: 'QUEUE_EMPTY'
      });
    }

    const notificationId = notification.notification_id;
    const to = normalizeMoroccoPhone(notification.contact_phone);

    if (!notificationId || !to) {
      if (notificationId) {
        await finalizeFailure(config, notificationId, 'INVALID_RECIPIENT_PHONE');
      }
      return json(res, 422, {
        ok: false,
        mode: 'LIVE',
        state: 'RECIPIENT_INVALID',
        notification_id: notificationId || null
      });
    }

    let metaResponse;
    let metaText = '';
    try {
      metaResponse = await fetch(
        `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + accessToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(templatePayload(to, templateName, templateLanguage)),
          signal: AbortSignal.timeout(META_TIMEOUT_MS)
        }
      );
      metaText = await metaResponse.text();
    } catch (error) {
      const failureCode =
        error && error.name === 'TimeoutError' ? 'META_DELIVERY_UNKNOWN_TIMEOUT' : 'META_DELIVERY_UNKNOWN_NETWORK';
      await finalizeFailure(config, notificationId, failureCode);
      return json(res, 502, {
        ok: false,
        mode: 'LIVE',
        state: 'DELIVERY_UNKNOWN',
        notification_id: notificationId
      });
    }

    const metaBody = parseJson(metaText);
    const providerMessageId = metaBody?.messages?.[0]?.id || null;

    if (metaResponse.ok && providerMessageId) {
      await rpc(config, 'dispatch_finalize_notification_v1', {
        p_notification_id: notificationId,
        p_final_status: 'SENT',
        p_provider_message_id: providerMessageId,
        p_last_error: null
      });
      return json(res, 200, {
        ok: true,
        mode: 'LIVE',
        state: 'SENT',
        notification_id: notificationId,
        provider_message_id: providerMessageId
      });
    }

    const providerCode =
      metaBody?.error?.code != null ? String(metaBody.error.code) : `HTTP_${metaResponse.status}`;
    const errorCode = `META_${providerCode}`.slice(0, 500);

    if (retryableStatus(metaResponse.status) &&
        Number(notification.attempt_count || 0) < MAX_ATTEMPTS) {
      const retryResult = await releaseForRetry(config, notificationId, errorCode);
      const retry = Array.isArray(retryResult) ? retryResult[0] || null : retryResult || null;
      return json(res, 502, {
        ok: false,
        mode: 'LIVE',
        state: retry?.reason === 'RETRY_SCHEDULED' ? 'RETRY_SCHEDULED' : 'FAILED',
        notification_id: notificationId,
        provider_status: metaResponse.status
      });
    }

    await finalizeFailure(config, notificationId, errorCode);
    return json(res, 502, {
      ok: false,
      mode: 'LIVE',
      state: 'FAILED',
      notification_id: notificationId,
      provider_status: metaResponse.status
    });
  } catch (error) {
    console.error('[FIXEO WhatsApp worker] unexpected error', error?.message || error);
    return json(res, 502, { ok: false, error: 'WHATSAPP_WORKER_UNAVAILABLE' });
  }
};

module.exports._test = {
  normalizeMoroccoPhone,
  retryableStatus,
  templatePayload
};
