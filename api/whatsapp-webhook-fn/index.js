'use strict';

const { createHmac, timingSafeEqual } = require('node:crypto');
const { assertServerTarget } = require('../supabase-environment');

function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function trimSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function parseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) { return null; }
}

function metaTimestamp(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

async function readBody(req) {
  if (Buffer.isBuffer(req.rawBody)) {
    return { raw: req.rawBody, body: parseJson(req.rawBody.toString('utf8')) };
  }
  if (typeof req.rawBody === 'string') {
    return { raw: Buffer.from(req.rawBody), body: parseJson(req.rawBody) };
  }
  if (Buffer.isBuffer(req.body)) {
    return { raw: req.body, body: parseJson(req.body.toString('utf8')) };
  }
  if (typeof req.body === 'string') {
    return { raw: Buffer.from(req.body), body: parseJson(req.body) };
  }
  if (req.body && typeof req.body === 'object') {
    const raw = Buffer.from(JSON.stringify(req.body));
    return { raw, body: req.body };
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks);
  return { raw, body: parseJson(raw.toString('utf8')) };
}

function validSignature(raw, header, appSecret) {
  if (!raw || !appSecret || !header) return false;
  const expected = 'sha256=' + createHmac('sha256', appSecret).update(raw).digest('hex');
  const a = Buffer.from(String(header));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
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

function messageEnvelope(message, phoneNumberId) {
  if (!message || typeof message !== 'object') return null;
  const providerMessageId = String(message.id || '').trim();
  const from = String(message.from || '').replace(/\D/g, '');
  if (!providerMessageId || !from) return null;

  const type = String(message.type || 'unknown').toLowerCase();
  let text = null;
  let mediaId = null;
  let caption = null;

  if (type === 'text') {
    text = message.text?.body || null;
  } else if (['image', 'video', 'audio', 'document', 'sticker'].includes(type)) {
    mediaId = message[type]?.id || null;
    caption = message[type]?.caption || null;
  } else if (type === 'interactive') {
    text =
      message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.title ||
      null;
  } else if (type === 'button') {
    text = message.button?.text || null;
  } else if (type === 'reaction') {
    text = message.reaction?.emoji || null;
  } else if (type === 'system') {
    text = message.system?.body || null;
  }

  return {
    p_provider_message_id: providerMessageId,
    p_from_e164: from,
    p_phone_number_id: phoneNumberId || null,
    p_message_type: type,
    p_message_text: text,
    p_media_id: mediaId,
    p_caption: caption,
    p_provider_timestamp: metaTimestamp(message.timestamp)
  };
}

function statusEnvelope(status) {
  if (!status || typeof status !== 'object') return null;
  const providerMessageId = String(status.id || '').trim();
  const providerStatus = String(status.status || '').toLowerCase();
  if (!providerMessageId || !['sent', 'delivered', 'read', 'failed'].includes(providerStatus)) {
    return null;
  }
  const firstError = Array.isArray(status.errors) ? status.errors[0] : null;
  return {
    p_provider_message_id: providerMessageId,
    p_provider_status: providerStatus,
    p_provider_timestamp: metaTimestamp(status.timestamp),
    p_error_code: firstError?.code != null ? String(firstError.code) : null,
    p_error_title: firstError?.title || firstError?.message || null
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const baseUrl = 'https://' + (req.headers.host || 'www.fixeo.ma');
    const url = new URL(req.url, baseUrl);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    if (!verifyToken) return res.status(500).send('Webhook verify token not configured');
    if (mode === 'subscribe' && token === verifyToken && challenge) {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const processingEnabled = process.env.WHATSAPP_WEBHOOK_PROCESS_ENABLED === 'true';

  if (!processingEnabled) {
    return json(res, 200, {
      ok: true,
      mode: 'PRE_CUTOVER',
      processing_enabled: false,
      state: 'EVENT_ACKNOWLEDGED'
    });
  }

  const appSecret = String(process.env.WHATSAPP_APP_SECRET || '').trim();
  const expectedWabaId = String(process.env.WHATSAPP_WABA_ID || '').trim();
  const expectedPhoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!appSecret || !/^\d+$/.test(expectedWabaId) || !/^\d+$/.test(expectedPhoneNumberId) ||
      !supabaseUrl || !serviceRoleKey) {
    return json(res, 503, { ok: false, error: 'WEBHOOK_CONFIGURATION_MISSING' });
  }

  try {
    assertServerTarget();
  } catch (_) {
    return json(res, 503, { ok: false, error: 'SUPABASE_TARGET_REJECTED' });
  }

  try {
    const { raw, body } = await readBody(req);
    const signature = req.headers['x-hub-signature-256'];
    if (!validSignature(raw, signature, appSecret)) {
      return json(res, 401, { ok: false, error: 'INVALID_SIGNATURE' });
    }

    if (!body || body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) {
      return json(res, 200, { ok: true, state: 'IGNORED_UNSUPPORTED_EVENT' });
    }

    const config = { supabaseUrl, serviceRoleKey };
    let statusesRecorded = 0;
    let inboundRecorded = 0;
    let ignored = 0;

    for (const entry of body.entry) {
      if (String(entry?.id || '') !== expectedWabaId) {
        ignored += 1;
        continue;
      }

      for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
        if (change?.field !== 'messages') {
          ignored += 1;
          continue;
        }

        const value = change?.value || {};
        const phoneNumberId = String(value?.metadata?.phone_number_id || '');
        if (phoneNumberId !== expectedPhoneNumberId) {
          ignored += 1;
          continue;
        }

        for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
          const envelope = statusEnvelope(status);
          if (!envelope) {
            ignored += 1;
            continue;
          }
          await rpc(config, 'dispatch_record_whatsapp_status_v1', envelope);
          statusesRecorded += 1;
        }

        for (const message of Array.isArray(value.messages) ? value.messages : []) {
          const envelope = messageEnvelope(message, phoneNumberId);
          if (!envelope) {
            ignored += 1;
            continue;
          }
          await rpc(config, 'whatsapp_ingest_inbound_message_v1', envelope);
          inboundRecorded += 1;
        }
      }
    }

    return json(res, 200, {
      ok: true,
      state: 'EVENT_PROCESSED',
      statuses_recorded: statusesRecorded,
      inbound_recorded: inboundRecorded,
      ignored
    });
  } catch (error) {
    console.error('[FIXEO WhatsApp webhook] processing error', error?.message || error);
    return json(res, 502, { ok: false, error: 'WEBHOOK_PROCESSING_FAILED' });
  }
};

module.exports._test = {
  metaTimestamp,
  validSignature,
  messageEnvelope,
  statusEnvelope
};
