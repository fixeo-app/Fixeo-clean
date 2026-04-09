/* ============================================================
   FIXEO V14 — paypalCapture.js
   Module Express séparé — Endpoint POST /api/booking/capture
   Demandé par le brief : fichier dédié à la capture PayPal
   ─────────────────────────────────────────────────────────────
   Ce module est INCLUS dans api/server.js via require().
   Il peut aussi être utilisé de façon autonome.
   
   SÉCURITÉ : credentials chargés depuis .env (jamais en dur)
   PROTECTION : anti-doublon par capturedOrders Set (partagé)
   SLOT LOCK : géré côté frontend via FixeoSlotLock
   ============================================================ */

'use strict';

const express = require('express');
const fetch   = require('node-fetch');
const router  = express.Router();

/* ── Config PayPal (depuis .env) ──────────────────────────── */
const PAYPAL_MODE   = process.env.PAYPAL_MODE   || 'sandbox';
const CLIENT_ID     = process.env.PAYPAL_CLIENT_ID;
const SECRET        = process.env.PAYPAL_SECRET;
const PAYPAL_BASE   = PAYPAL_MODE === 'sandbox'
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

/* ── Taux & commission ────────────────────────────────────── */
const COMMISSION_RATE = 0.15;
const MAD_TO_USD      = 0.10;

/* ── Anti-doublon partagé (référence externe si disponible) ── */
let _capturedOrders;
function getCapturedSet() {
  if (!_capturedOrders) _capturedOrders = new Set();
  return _capturedOrders;
}

/* ── Injecter un Set externe (depuis server.js) ─────────────
   Usage : require('./paypalCapture').setCapturedOrders(set)    */
router.setCapturedOrders = function(set) {
  _capturedOrders = set;
};

/* ── Utilitaires ──────────────────────────────────────────── */
function _generateRef() {
  return 'BKG-' + Date.now().toString(36).toUpperCase();
}

async function _getAccessToken() {
  if (!CLIENT_ID || !SECRET) {
    throw new Error('PAYPAL_CLIENT_ID / PAYPAL_SECRET manquants dans .env');
  }
  const creds = Buffer.from(`${CLIENT_ID}:${SECRET}`).toString('base64');
  const r = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method : 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type' : 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`PayPal OAuth error ${r.status}: ${txt}`);
  }
  const data = await r.json();
  return data.access_token;
}

/* ══════════════════════════════════════════════════════════════
   POST /api/booking/capture
   ──────────────────────────────────────────────────────────────
   Body  : { orderID, bookingData? }
   Retour: { success, status, txnId, bookingRef, commission, netArtisan }
══════════════════════════════════════════════════════════════ */
router.post('/capture', async (req, res) => {
  console.log('\n[paypalCapture] ══ POST /api/booking/capture ══');
  console.log('[paypalCapture] Body:', JSON.stringify(req.body));

  const { orderID, bookingData } = req.body;

  /* Validation */
  if (!orderID) {
    return res.status(400).json({ success: false, error: 'orderID manquant.' });
  }

  /* Anti-doublon */
  const captured = getCapturedSet();
  if (captured.has(orderID)) {
    console.warn(`[paypalCapture] ⚠️ Double capture ignorée : ${orderID}`);
    return res.status(409).json({ success: false, error: 'Paiement déjà capturé pour cet orderID.' });
  }

  try {
    /* 1. Token OAuth */
    const accessToken = await _getAccessToken();
    console.log('[paypalCapture] ✅ Token obtenu');

    /* 2. Capture PayPal */
    const response = await fetch(
      `${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`,
      {
        method : 'POST',
        headers: {
          'Authorization'    : `Bearer ${accessToken}`,
          'Content-Type'     : 'application/json',
          'PayPal-Request-Id': `FIXEO-BKG-${orderID}`
        }
      }
    );

    const rawText = await response.text();
    console.log(`[paypalCapture] capture HTTP status : ${response.status}`);

    if (!response.ok) {
      let errObj;
      try { errObj = JSON.parse(rawText); } catch { errObj = { raw: rawText }; }
      console.error('[paypalCapture] ❌ Erreur capture:', errObj);
      return res.status(response.status).json({
        success: false,
        error  : 'Erreur capture PayPal',
        details: errObj
      });
    }

    const capture = JSON.parse(rawText);
    const txnId   = (
      capture.purchase_units?.[0]?.payments?.captures?.[0]?.id
    ) || capture.id || orderID;

    console.log(`[paypalCapture] Statut capture : ${capture.status} — txnId : ${txnId}`);

    if (capture.status === 'COMPLETED') {
      /* Marquer comme capturé */
      captured.add(orderID);

      /* Calcul commission */
      const madAmount  = bookingData?._total ? parseFloat(bookingData._total) : 100;
      const commission = Math.round(madAmount * COMMISSION_RATE);
      const netArtisan = Math.round(madAmount - commission);
      const bookingRef = _generateRef();

      console.log(`[paypalCapture] ✅ COMPLETED | txnId=${txnId} | ref=${bookingRef} | net=${netArtisan} MAD`);

      return res.json({
        success    : true,
        status     : 'COMPLETED',
        txnId      : txnId,
        orderId    : orderID,
        bookingRef : bookingRef,
        commission : commission,
        netArtisan : netArtisan
      });

    } else {
      console.warn(`[paypalCapture] ⚠️ Paiement NON complété — statut : ${capture.status}`);
      return res.status(400).json({ success: false, status: capture.status });
    }

  } catch (err) {
    console.error('[paypalCapture] ❌ Exception:', err.message);
    return res.status(500).json({ success: false, error: err.toString() });
  }
});

module.exports = router;
