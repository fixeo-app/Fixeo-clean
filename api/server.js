/* ============================================================
   FIXEO V14 ULTIMATE — PAYPAL SANDBOX BACKEND
   Node.js / Express · Endpoints sécurisés
   ============================================================
   Démarrage : cd api && npm install && node server.js
   Ou avec nodemon : nodemon server.js

   CORRECTIONS V14 ULTIMATE :
     FIX-CORE-1 : TEMP_TEST_MODE désactivé → montant RÉEL dynamique
     FIX-CORE-2 : Validation montant (min 0.01 USD, max 9999 USD)
     FIX-CORE-3 : Retour create-order = { orderID } uniquement
     FIX-CORE-4 : Retour capture-order = { success, status, txnId,
                  bookingRef, commission, netArtisan }
     FIX-CORE-5 : Log complet PayPal (debug) + masquage credentials
     FIX-CORE-6 : Alias POST /api/booking/capture (compatibilité brief)
     FIX-CORE-7 : Reconnect Booking ACTIF après capture COMPLETED
     FIX-4      : CORS — origines multiples + ngrok + sandbox permissif
     FIX-5      : return_url / cancel_url via SITE_URL dans .env
     FIX-V14-A  : Compatibilité Vercel (export module.exports)
     FIX-V14-B  : CORS ngrok/tunnel automatique
     FIX-V14-C  : Health check enrichi + version
     FIX-V14-D  : Serveur statique frontend en mode local
   ============================================================ */

'use strict';

const path       = require('path');
const express    = require('express');
const cors       = require('cors');
const bodyParser = require('body-parser');
const fetch      = require('node-fetch');
const multer     = require('multer');

/* FIX-V14-D : Serveur statique pour les tests locaux (frontend) */
const fs         = require('fs');

/* FIX-CORE-5 : Chercher .env dans le dossier parent (projet)
   qu'on soit lancé depuis /api ou depuis /fixed */
require('dotenv').config({
  path: path.resolve(__dirname, '../.env')
});

const app  = express();
const PORT = process.env.PORT || 3001;

/* ── Config PayPal ─────────────────────────────────────────── */
const PAYPAL_MODE      = process.env.PAYPAL_MODE      || 'sandbox';
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET    = process.env.PAYPAL_SECRET;

/* FIX-5 : URL du site configurable via .env */
const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';

/* ── Supabase public env (frontend) ───────────────────────── */
const SUPABASE_URL      = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

const PAYPAL_BASE_URL = PAYPAL_MODE === 'sandbox'
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

/* ══════════════════════════════════════════════════════════════
   FIX-CORE-1 : TEMP_TEST_MODE DÉSACTIVÉ — Montant réel dynamique
   Le montant envoyé par le frontend est utilisé directement.
══════════════════════════════════════════════════════════════ */
const TEMP_TEST_MODE  = false;  // ← V14 : désactivé, montant réel
const TEMP_USD_AMOUNT = '10.00'; // conservé pour référence seulement

/* Taux de conversion et commission */
const COMMISSION_RATE = 0.15;
const MAD_TO_USD      = 0.10;

/* ── Vérification des credentials au démarrage ─────────────── */
console.log('\n════════════════════════════════════════════════');
console.log('  FIXEO V14 — PayPal Backend — ULTIMATE FIX   ');
console.log('════════════════════════════════════════════════');
console.log(`  Mode PayPal : ${PAYPAL_MODE.toUpperCase()}`);
console.log(`  Test Mode   : ❌ Désactivé — montant RÉEL dynamique`);
console.log(`  CLIENT_ID   : ${PAYPAL_CLIENT_ID ? '✅ Chargé' : '❌ MANQUANT'}`);
console.log(`  SECRET      : ${PAYPAL_SECRET    ? '✅ Chargé' : '❌ MANQUANT'}`);
console.log(`  Site URL    : ${SITE_URL}`);
console.log('════════════════════════════════════════════════\n');

if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) {
  console.error('⛔ ERREUR CRITIQUE : PAYPAL_CLIENT_ID et PAYPAL_SECRET sont requis.');
  console.error('   Créez un fichier .env à la racine du projet (dossier fixed/)');
  console.error('   basé sur .env.example et remplissez les credentials PayPal.');
}

/* ── Anti-doublon : stocker les orderIds capturés en mémoire ── */
const capturedOrders = new Set();

/* FIX-BRIEF : paypalCapture.js — module séparé demandé par le brief */
/* Partage le même Set anti-doublon que server.js */
const paypalCaptureModule = require('./paypalCapture');
paypalCaptureModule.setCapturedOrders(capturedOrders);

/* ── FIX-4 : CORS ─────────────────────────────────────────── */
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'file://'
];

if (process.env.SITE_URL && !allowedOrigins.includes(process.env.SITE_URL)) {
  allowedOrigins.push(process.env.SITE_URL);
}
if (process.env.ALLOWED_ORIGIN && !allowedOrigins.includes(process.env.ALLOWED_ORIGIN)) {
  allowedOrigins.push(process.env.ALLOWED_ORIGIN);
}

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
    /* FIX-V14-B : ngrok/tunnel → autorisé automatiquement en sandbox */
    if (
      origin.includes('ngrok') ||
      origin.includes('loca.lt') ||
      origin.includes('tunnel') ||
      origin.includes('vercel.app') ||
      PAYPAL_MODE === 'sandbox'
    ) {
      console.log('[Fixeo CORS] Origin autorisée (sandbox/ngrok/vercel):', origin);
      return callback(null, true);
    }
    callback(new Error('CORS: Origine non autorisée — ' + origin));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Auth'],
  credentials: true
}));

/* Pre-flight OPTIONS */
app.options('*', cors());
/* V20 : pre-flight étendu pour PUT/DELETE artisans */
app.options('/api/admin/artisans/*', cors());

app.use(bodyParser.json());

/* ── Exposer les variables frontend publiques ─────────────── */
app.get('/api/env.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.send(`window.FIXEO_ENV = Object.assign({}, window.FIXEO_ENV || {}, {
    SUPABASE_URL: ${JSON.stringify(SUPABASE_URL)},
    SUPABASE_ANON_KEY: ${JSON.stringify(SUPABASE_ANON_KEY)}
  });`);
});

app.get('/api/env', (req, res) => {
  res.json({
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  });
});

/* Servir les avatars artisans statiquement */
app.use('/uploads', express.static(require('path').join(__dirname, '..', 'uploads')));

/* ══════════════════════════════════════════════════════════════
   UTILITAIRE : Obtenir un token d'accès PayPal (OAuth 2.0)
══════════════════════════════════════════════════════════════ */
async function getPayPalAccessToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) {
    throw new Error('PAYPAL_CLIENT_ID ou PAYPAL_SECRET manquant dans .env');
  }

  const credentials = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');

  console.log('[Fixeo PayPal] → Demande de token OAuth...');

  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method  : 'POST',
    headers : {
      'Authorization' : `Basic ${credentials}`,
      'Content-Type'  : 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  const rawText = await response.text();

  console.log(`[Fixeo PayPal] OAuth status : ${response.status}`);
  if (!response.ok) {
    console.error('[Fixeo PayPal] OAuth error (raw):', rawText);
    throw new Error(`PayPal OAuth error: ${response.status} — ${rawText}`);
  }

  const data = JSON.parse(rawText);
  console.log('[Fixeo PayPal] ✅ Token obtenu (expires_in:', data.expires_in, 's)');
  return data.access_token;
}

/* ── Convertir MAD → USD pour sandbox ──────────────────────── */
function madToUsd(mad) {
  const usd = (parseFloat(mad) * MAD_TO_USD).toFixed(2);
  return parseFloat(usd) < 0.01 ? '0.01' : usd;
}

/* ── Générer une référence de réservation ──────────────────── */
function generateBookingRef() {
  return 'BKG-' + Date.now().toString(36).toUpperCase();
}

/* ══════════════════════════════════════════════════════════════
   ENDPOINT 1 — POST /api/paypal/create-order
   ──────────────────────────────────────────────────────────────
   FIX-CORE-1 : Montant RÉEL dynamique (TEMP_TEST_MODE = false)
   FIX-CORE-2 : Validation du montant (min 0.01 USD, max 9999)
   FIX-CORE-3 : Retourne UNIQUEMENT { orderID }
══════════════════════════════════════════════════════════════ */
app.post('/api/paypal/create-order', async (req, res) => {
  console.log('\n[Fixeo API] ══ create-order ══════════════════');
  console.log('[Fixeo API] Body reçu:', JSON.stringify(req.body));

  try {
    /* ── FIX-CORE-1 : Montant RÉEL dynamique ─────────── */
    const { amount } = req.body;
    if (!amount || isNaN(parseFloat(amount))) {
      return res.status(400).json({ error: 'Montant invalide ou manquant.' });
    }

    const usdAmount = madToUsd(amount);
    const usdFloat  = parseFloat(usdAmount);

    /* FIX-CORE-2 : Validation min/max */
    if (usdFloat < 0.01) {
      return res.status(400).json({ error: 'Montant minimum : 0.01 USD.' });
    }
    if (usdFloat > 9999) {
      return res.status(400).json({ error: 'Montant maximum : 9999 USD.' });
    }

    console.log(`[Fixeo API] Montant dynamique : ${amount} MAD → ${usdAmount} USD`);

    /* ── Obtenir le token ──────────────────────────────── */
    const accessToken = await getPayPalAccessToken();

    /* ── Payload de la commande ────────────────────────── */
    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: {
            currency_code : 'USD',
            value         : usdAmount
          },
          description: req.body.service
            ? `Fixeo – ${String(req.body.service).substring(0, 100)}`
            : 'Service Fixeo Maroc'
        }
      ],
      application_context: {
        brand_name  : 'Fixeo Maroc',
        locale      : 'fr_FR',
        user_action : 'PAY_NOW',
        return_url  : `${SITE_URL}/payment-success.html`,
        cancel_url  : `${SITE_URL}/payment-cancel.html`
      }
    };

    console.log('[Fixeo API] Payload PayPal:', JSON.stringify(orderPayload));

    /* ── Créer la commande chez PayPal ─────────────────── */
    const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method  : 'POST',
      headers : {
        'Authorization'    : `Bearer ${accessToken}`,
        'Content-Type'     : 'application/json',
        'PayPal-Request-Id': `FIXEO-${Date.now()}`
      },
      body: JSON.stringify(orderPayload)
    });

    const rawText = await response.text();

    console.log(`[Fixeo API] create-order HTTP status : ${response.status}`);
    console.log('[Fixeo API] create-order RAW response :', rawText);

    if (!response.ok) {
      let errObj;
      try { errObj = JSON.parse(rawText); } catch { errObj = { raw: rawText }; }
      console.error('[Fixeo API] ❌ create-order error:', errObj);
      return res.status(response.status).json({
        error  : 'Erreur création commande PayPal',
        details: errObj
      });
    }

    const order = JSON.parse(rawText);
    console.log(`[Fixeo API] ✅ Order créé : ${order.id} — status: ${order.status}`);

    /* ── FIX-CORE-3 : Retour MINIMAL — uniquement orderID ── */
    return res.json({ orderID: order.id });

  } catch (err) {
    console.error('[Fixeo API] ❌ create-order exception:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   ENDPOINT 2 — POST /api/paypal/capture-order
   ──────────────────────────────────────────────────────────────
   FIX-CORE-4 : Retour étendu :
                { success, status, txnId, bookingRef, commission, netArtisan }
   FIX-CORE-7 : Reconnect Booking ACTIF (bookingRef généré + commission)
══════════════════════════════════════════════════════════════ */
app.post('/api/paypal/capture-order', async (req, res) => {
  console.log('\n[Fixeo API] ══ capture-order ═════════════════');
  console.log('[Fixeo API] Body reçu:', JSON.stringify(req.body));

  try {
    const { orderID, bookingData } = req.body;

    /* Validation */
    if (!orderID) {
      return res.status(400).json({ success: false, error: 'orderID manquant.' });
    }

    /* Anti-doublon */
    if (capturedOrders.has(orderID)) {
      console.warn(`[Fixeo API] ⚠️  Double capture ignorée : ${orderID}`);
      return res.status(409).json({ success: false, error: 'Paiement déjà capturé pour cet orderID.' });
    }

    /* ── Obtenir le token ──────────────────────────────── */
    const accessToken = await getPayPalAccessToken();

    /* ── Appel capture PayPal ──────────────────────────── */
    console.log(`[Fixeo API] → Capture de l'ordre ${orderID}...`);

    const response = await fetch(
      `${PAYPAL_BASE_URL}/v2/checkout/orders/${orderID}/capture`,
      {
        method  : 'POST',
        headers : {
          'Authorization'    : `Bearer ${accessToken}`,
          'Content-Type'     : 'application/json',
          'PayPal-Request-Id': `FIXEO-CAP-${orderID}`
        }
      }
    );

    const rawText = await response.text();

    console.log(`[Fixeo API] capture-order HTTP status : ${response.status}`);
    console.log('[Fixeo API] capture-order RAW response :', rawText);

    if (!response.ok) {
      let errObj;
      try { errObj = JSON.parse(rawText); } catch { errObj = { raw: rawText }; }
      console.error('[Fixeo API] ❌ capture-order error:', errObj);
      return res.status(response.status).json({
        success: false,
        status : `HTTP_${response.status}`,
        error  : 'Erreur capture PayPal',
        details: errObj
      });
    }

    const capture = JSON.parse(rawText);

    /* Extraire le Transaction ID */
    const txnId = (
      capture.purchase_units?.[0]?.payments?.captures?.[0]?.id
    ) || capture.id || orderID;

    /* Extraire le montant capturé depuis la réponse PayPal */
    const capturedAmount = parseFloat(
      capture.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value || 0
    );

    console.log(`[Fixeo API] Statut capture : ${capture.status} — txnId : ${txnId}`);

    /* ── FIX-CORE-4 : Vérifier le statut et répondre ──── */
    if (capture.status === 'COMPLETED') {
      /* Marquer comme capturé (anti-doublon) */
      capturedOrders.add(orderID);
      console.log(`[Fixeo API] ✅ Paiement COMPLETED — txnId : ${txnId}`);

      /* ────────────────────────────────────────────────────
         FIX-CORE-7 : RECONNECT BOOKING ACTIF
         Calcul commission + bookingRef + net artisan
      ────────────────────────────────────────────────────── */
      const madAmount  = bookingData?._total || bookingData?.price
        ? parseFloat(bookingData._total || bookingData.price)
        : (capturedAmount / MAD_TO_USD);

      const commission = Math.round(madAmount * COMMISSION_RATE);
      const netArtisan = Math.round(madAmount - commission);
      const bookingRef = generateBookingRef();

      console.log(`[Fixeo API] Booking: ref=${bookingRef}, commission=${commission} MAD, net=${netArtisan} MAD`);

      return res.json({
        success     : true,
        status      : 'COMPLETED',    /* ← requis par paypal-sandbox.js */
        txnId       : txnId,
        orderId     : orderID,
        bookingRef  : bookingRef,
        commission  : commission,
        netArtisan  : netArtisan,
        amountUSD   : capturedAmount
      });

    } else {
      console.warn(`[Fixeo API] ⚠️  Paiement NON complété — statut : ${capture.status}`);
      return res.status(400).json({
        success: false,
        status : capture.status
      });
    }

  } catch (err) {
    console.error('[Fixeo API] ❌ capture-order exception:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   FIX-CORE-6 : ALIAS POST /api/booking/capture
   Compatibilité avec le code frontend du brief (onApprove)
   Délègue vers la même logique que capture-order
══════════════════════════════════════════════════════════════ */
app.post('/api/booking/capture', async (req, res) => {
  console.log('\n[Fixeo API] ══ /api/booking/capture (alias) ══');
  /* Normaliser : le brief envoie { orderID }, on garde le même format */
  const { orderID, bookingData } = req.body;

  if (!orderID) {
    return res.status(400).json({ success: false, error: 'orderID manquant.' });
  }

  /* Anti-doublon */
  if (capturedOrders.has(orderID)) {
    console.warn(`[Fixeo API] ⚠️  Double capture ignorée (alias): ${orderID}`);
    return res.status(409).json({ success: false, error: 'Paiement déjà capturé.' });
  }

  try {
    const accessToken = await getPayPalAccessToken();

    const response = await fetch(
      `${PAYPAL_BASE_URL}/v2/checkout/orders/${orderID}/capture`,
      {
        method  : 'POST',
        headers : {
          'Authorization'    : `Bearer ${accessToken}`,
          'Content-Type'     : 'application/json',
          'PayPal-Request-Id': `FIXEO-BKG-${orderID}`
        }
      }
    );

    const rawText = await response.text();
    console.log(`[Fixeo API] /booking/capture HTTP status : ${response.status}`);

    if (!response.ok) {
      let errObj;
      try { errObj = JSON.parse(rawText); } catch { errObj = { raw: rawText }; }
      return res.status(response.status).json({ success: false, error: 'Erreur capture', details: errObj });
    }

    const capture = JSON.parse(rawText);

    const txnId = (
      capture.purchase_units?.[0]?.payments?.captures?.[0]?.id
    ) || capture.id || orderID;

    if (capture.status === 'COMPLETED') {
      capturedOrders.add(orderID);

      const madAmount  = bookingData?._total ? parseFloat(bookingData._total) : 100;
      const commission = Math.round(madAmount * COMMISSION_RATE);
      const netArtisan = Math.round(madAmount - commission);
      const bookingRef = generateBookingRef();

      console.log(`[Fixeo API] ✅ /booking/capture COMPLETED — txnId : ${txnId}`);

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
      return res.status(400).json({ success: false, status: capture.status });
    }

  } catch (err) {
    console.error('[Fixeo API] ❌ /booking/capture exception:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ── Health check ──────────────────────────────────────────── */
app.get('/api/health', (req, res) => {
  res.json({
    status    : 'ok',
    version   : 'v14-ultimate',
    mode      : PAYPAL_MODE,
    testMode  : false,
    amount    : 'dynamique (MAD → USD)',
    endpoints : [
      'POST /api/paypal/create-order',
      'POST /api/paypal/capture-order',
      'POST /api/booking/capture  (alias)'
    ],
    clientId  : PAYPAL_CLIENT_ID ? '✅ chargé' : '❌ manquant',
    secret    : PAYPAL_SECRET    ? '✅ chargé' : '❌ manquant',
    siteUrl   : SITE_URL,
    cors      : 'ngrok + vercel + localhost',
    time      : new Date().toISOString()
  });
});

/* FIX-V14-D : Servir le frontend statique en mode local (port 3001) */
const frontendPath = path.resolve(__dirname, '..');
if (fs.existsSync(path.join(frontendPath, 'index.html'))) {
  app.use(express.static(frontendPath));
  console.log(`[Fixeo] 📂 Frontend statique servi depuis : ${frontendPath}`);

  const artisanProfileHtmlPath = path.join(frontendPath, 'artisan-profile.html');
  app.get(['/artisan/:slug', '/artisan/:slug/'], function(req, res) {
    if (fs.existsSync(artisanProfileHtmlPath)) {
      return res.sendFile(artisanProfileHtmlPath);
    }
    return res.status(404).send('Profil indisponible');
  });

  const serviceSeoHtmlPath = path.join(frontendPath, 'service-seo.html');
  app.get(['/services/:service', '/services/:service/', '/services/:service/:ville', '/services/:service/:ville/'], function(req, res) {
    if (fs.existsSync(serviceSeoHtmlPath)) {
      return res.sendFile(serviceSeoHtmlPath);
    }
    return res.status(404).send('Page service indisponible');
  });

  /* Fallback SPA : toute URL non-API → index.html */
  app.get('*', function(req, res) {
    if (!req.path.startsWith('/api')) {
      const filePath = path.join(frontendPath, req.path);
      const htmlPath = path.join(frontendPath, req.path + '.html');
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        res.sendFile(filePath);
      } else if (fs.existsSync(htmlPath) && fs.statSync(htmlPath).isFile()) {
        res.sendFile(htmlPath);
      } else {
        res.sendFile(path.join(frontendPath, 'index.html'));
      }
    }
  });
}

/* ── Démarrage ─────────────────────────────────────────────── */

/* ═══════════════════════════════════════════════════════
   CONVERSION BOOST v22 — Endpoints recommandés & top
   NOTE: These use mock data; swap for real DB queries
════════════════════════════════════════════════════════ */

// GET /api/artisans/recommended — Returns best available artisan
app.get('/api/artisans/recommended', (req, res) => {
  // In production: query DB for best available artisan near user location
  const mockArtisan = {
    id: 1,
    name: 'Karim Benali',
    service: 'Plomberie',
    category: 'plomberie',
    rating: 4.9,
    city: 'Casablanca',
    availability: 'available',
  };
  res.json(mockArtisan);
});

// GET /api/artisans/top — Returns top 8 artisans
app.get('/api/artisans/top', (req, res) => {
  // In production: query DB sorted by trust_score DESC, rating DESC
  const mockTop = [
    { id: 4, name: 'Fatima Zahra',  initials: 'FZ', rating: 4.9, city: 'Marrakech', reviewCount: 210, trustScore: 99 },
    { id: 1, name: 'Karim Benali',  initials: 'KB', rating: 4.9, city: 'Casablanca', reviewCount: 127, trustScore: 96 },
    { id: 2, name: 'Sara Doukkali', initials: 'SD', rating: 4.8, city: 'Casablanca', reviewCount: 98, trustScore: 91 },
    { id: 7, name: 'Youssef Kadi',  initials: 'YK', rating: 4.7, city: 'Tanger', reviewCount: 91, trustScore: 87 },
    { id: 3, name: 'Omar Tahiri',   initials: 'OT', rating: 4.7, city: 'Rabat', reviewCount: 85, trustScore: 88 },
    { id: 5, name: 'Hassan Mrani',  initials: 'HM', rating: 4.8, city: 'Fès', reviewCount: 72, trustScore: 85 },
    { id: 6, name: 'Aicha Lamine',  initials: 'AL', rating: 4.6, city: 'Agadir', reviewCount: 63, trustScore: 80 },
    { id: 8, name: 'Nadia El Fassi',initials: 'NE', rating: 4.8, city: 'Rabat', reviewCount: 145, trustScore: 93 },
  ];
  res.json(mockTop);
});

app.listen(PORT, () => {
  console.log(`🚀 Fixeo PayPal API V14 démarrée sur le PORT ${PORT}`);
  console.log(`   Health    : http://localhost:${PORT}/api/health`);
  console.log(`   Orders    : POST http://localhost:${PORT}/api/paypal/create-order`);
  console.log(`   Capture   : POST http://localhost:${PORT}/api/paypal/capture-order`);
  console.log(`   Alias     : POST http://localhost:${PORT}/api/booking/capture\n`);
});

module.exports = app;

/* ══════════════════════════════════════════════════════════════
   ENDPOINT COD — POST /api/booking/cod
   ──────────────────────────────────────────────────────────────
   Cash on Delivery pour le marché marocain.
   - Slot lock actif dès la création
   - Commission 10% automatique
   - Statut : pending_cod (en attente de confirmation admin)
   - Pas de paiement en ligne — paiement à la livraison
   ──────────────────────────────────────────────────────────────
   Retour : { success, orderID, orderStatus, slotLock, commission,
              netArtisan, bookingRef, message }
══════════════════════════════════════════════════════════════ */

/* Anti-doublon pour les commandes COD */
const codOrders = new Map(); // orderID → timestamp

const COD_COMMISSION_RATE = 0.15; // 10% pour COD

app.post('/api/booking/cod', async (req, res) => {
  console.log('\n[Fixeo API] ══ /api/booking/cod ══════════════');
  console.log('[Fixeo API] Body reçu:', JSON.stringify(req.body));

  try {
    const { orderID, clientDetails } = req.body;

    /* ── Validation ──────────────────────────────────────── */
    if (!orderID) {
      return res.status(400).json({
        success: false,
        error: 'orderID manquant dans la requête.'
      });
    }

    if (!clientDetails || typeof clientDetails !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'clientDetails manquant ou invalide.'
      });
    }

    const totalAmount = parseFloat(clientDetails.totalAmount || clientDetails.price || 0);
    if (isNaN(totalAmount) || totalAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'totalAmount invalide ou manquant dans clientDetails.'
      });
    }

    /* ── Anti-doublon ────────────────────────────────────── */
    if (codOrders.has(orderID)) {
      console.warn(`[Fixeo API] ⚠️  COD doublon ignoré : ${orderID}`);
      return res.status(409).json({
        success: false,
        error: 'Commande COD déjà enregistrée pour cet orderID.'
      });
    }

    /* ── Calcul commission & net artisan ─────────────────── */
    const commission = Math.round(totalAmount * COD_COMMISSION_RATE);
    const netArtisan = Math.round(totalAmount - commission);

    /* ── Génération référence booking ────────────────────── */
    const bookingRef = 'COD-' + Date.now().toString(36).toUpperCase();

    /* ── Enregistrement (anti-doublon + simulation DB) ───── */
    codOrders.set(orderID, {
      orderID,
      bookingRef,
      clientDetails,
      totalAmount,
      commission,
      netArtisan,
      paymentMethod : 'Paiement cash après intervention',
      orderStatus   : 'pending_cod',
      slotLock      : true,
      createdAt     : new Date().toISOString(),
    });

    console.log(`[Fixeo API] ✅ COD enregistré — ref: ${bookingRef} | montant: ${totalAmount} MAD | commission: ${commission} MAD | net artisan: ${netArtisan} MAD`);

    /* ── Réponse succès ──────────────────────────────────── */
    return res.json({
      success      : true,
      orderID      : orderID,
      bookingRef   : bookingRef,
      orderStatus  : 'pending_cod',
      slotLock     : true,
      paymentMethod: 'Cash on Delivery',
      totalAmount  : totalAmount,
      commission   : commission,
      netArtisan   : netArtisan,
      message      : 'Commande Cash on Delivery enregistrée avec succès. Paiement à effectuer lors de la livraison.',
      meta: {
        artisan    : clientDetails.artisanName || clientDetails.artisan || '—',
        service    : clientDetails.service || '—',
        date       : clientDetails.date    || '—',
        timeSlot   : clientDetails.timeSlot || clientDetails.time || '—',
        address    : clientDetails.address || '—',
        phone      : clientDetails.phone   || '—',
      }
    });

  } catch (err) {
    console.error('[Fixeo API] ❌ /api/booking/cod exception:', err.message);
    return res.status(500).json({
      success: false,
      error  : err.toString()
    });
  }
});

/* ── Alias GET /api/booking/cod/list — Admin : liste des commandes COD ── */
app.get('/api/booking/cod/list', (req, res) => {
  const list = Array.from(codOrders.values());
  res.json({ success: true, count: list.length, orders: list });
});

/* ══════════════════════════════════════════════════════════════
   ENDPOINT ADMIN — GET /api/admin/orders
   ──────────────────────────────────────────────────────────────
   Agrège toutes les commandes (COD + PayPal) pour le dashboard
   admin. Triées par date décroissante.
   ──────────────────────────────────────────────────────────────
   Retour : { success, count, codCount, paypalCount, orders[] }
══════════════════════════════════════════════════════════════ */
app.get('/api/admin/orders', (req, res) => {
  /* ── Commandes COD (Map en mémoire) ─────────────────────── */
  const codList = Array.from(codOrders.values());

  /* ── Commandes PayPal (Set orderIDs capturés) ───────────── */
  const paypalList = Array.from(capturedOrders).map(id => ({
    orderID       : id,
    bookingRef    : id,
    paymentMethod : 'PayPal',
    orderStatus   : 'completed',
    slotLock      : false,
    commission    : null,
    netArtisan    : null,
    totalAmount   : null,
    clientDetails : {},
    createdAt     : new Date().toISOString(),
  }));

  /* ── Fusionner & trier par date décroissante ─────────────── */
  const allOrders = [...codList, ...paypalList].sort((a, b) => {
    const da = new Date(a.createdAt || 0);
    const db = new Date(b.createdAt || 0);
    return db - da;
  });

  console.log(`[Fixeo Admin] GET /api/admin/orders → ${allOrders.length} commande(s) (COD: ${codList.length}, PayPal: ${paypalList.length})`);

  res.json({
    success     : true,
    count       : allOrders.length,
    codCount    : codList.length,
    paypalCount : paypalList.length,
    orders      : allOrders
  });
});

/* ── Mise à jour du health check pour inclure COD ── */
app.get('/api/health/cod', (req, res) => {
  res.json({
    status     : 'ok',
    endpoint   : 'POST /api/booking/cod',
    commissionRate: (COD_COMMISSION_RATE * 100) + '%',
    ordersInMemory: codOrders.size,
    time       : new Date().toISOString()
  });
});

/* ══════════════════════════════════════════════════════════════
   MODULE ARTISANS ADMIN — Fixeo v21
   ─────────────────────────────────────────────────────────────
   Endpoints :
     POST   /api/admin/artisans/add          → Ajouter artisan (multipart)
     GET    /api/admin/artisans              → Lister artisans
     PUT    /api/admin/artisans/:id          → Modifier artisan complet (multipart)
     PUT    /api/admin/artisans/:id/status   → Changer statut uniquement
     DELETE /api/admin/artisans/:id          → Supprimer artisan
     GET    /api/marketplace/artisans        → Artisans ACTIFS (marketplace)
   ─────────────────────────────────────────────────────────────
   Stockage : Map en mémoire (artisansStore)
   Initialisation : 12 artisans de démonstration (statut actif)
══════════════════════════════════════════════════════════════ */

/* ── Multer — Upload avatars artisans ────────────────────── */
const _UPLOADS_DIR = require('path').join(__dirname, '..', 'uploads', 'artisans');
const _fs = require('fs');
if (!_fs.existsSync(_UPLOADS_DIR)) _fs.mkdirSync(_UPLOADS_DIR, { recursive: true });

const _artisanStorage = multer.diskStorage({
  destination : (req, file, cb) => cb(null, _UPLOADS_DIR),
  filename    : (req, file, cb) => {
    const ext  = require('path').extname(file.originalname).toLowerCase() || '.jpg';
    const name = 'avatar_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + ext;
    cb(null, name);
  }
});
const _uploadAvatar = multer({
  storage   : _artisanStorage,
  limits    : { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/image\/(jpeg|png|webp|gif)/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Format image invalide. Utilisez JPG, PNG ou WebP.'));
  }
}).single('avatar');

/* ── Store artisans en mémoire ─────────────────────────────── */
const artisansStore = new Map();

/* ── Artisans de démonstration initiaux ─────────────────────── */
const _demoArtisans = [
  { id:'art_demo_1', name:'Karim Benali',       email:'karim@fixeo.ma',    role:'artisan', service:'Plomberie',     phone:'0600000001', description:'Plombier certifié 12 ans, urgences 24/7.',        avatar:'', status:'active',   createdAt: new Date().toISOString(), certified:true  },
  { id:'art_demo_2', name:'Sara Doukkali',       email:'sara@fixeo.ma',     role:'artisan', service:'Peinture',      phone:'0600000002', description:'Peintre décoratrice, espaces modernes.',          avatar:'', status:'active',   createdAt: new Date().toISOString(), certified:true  },
  { id:'art_demo_3', name:'Omar Tahiri',         email:'omar@fixeo.ma',     role:'artisan', service:'Électricité',   phone:'0600000003', description:'Électricien agréé NFC 15-100.',                  avatar:'', status:'active',   createdAt: new Date().toISOString(), certified:true  },
  { id:'art_demo_4', name:'Fatima Zahra',        email:'fatima@fixeo.ma',   role:'artisan', service:'Nettoyage',     phone:'0600000004', description:'Nettoyage professionnel résidentiel & commercial.',avatar:'', status:'active',   createdAt: new Date().toISOString(), certified:true  },
  { id:'art_demo_5', name:'Hassan Mrani',        email:'hassan@fixeo.ma',   role:'artisan', service:'Jardinage',     phone:'0600000005', description:'Paysagiste 8 ans, aménagement extérieur.',       avatar:'', status:'active',   createdAt: new Date().toISOString(), certified:false },
  { id:'art_demo_6', name:'Aicha Lamine',        email:'aicha@fixeo.ma',    role:'artisan', service:'Déménagement',  phone:'0600000006', description:'Déménagement professionnel avec camion.',         avatar:'', status:'active',   createdAt: new Date().toISOString(), certified:false },
  { id:'art_demo_7', name:'Youssef Kadi',        email:'youssef@fixeo.ma',  role:'artisan', service:'Bricolage',     phone:'0600000007', description:'Bricoleur polyvalent, petits travaux.',           avatar:'', status:'active',   createdAt: new Date().toISOString(), certified:false },
  { id:'art_demo_8', name:'Nadia Rhouat',        email:'nadia@fixeo.ma',    role:'artisan', service:'Climatisation', phone:'0600000008', description:'Technicienne climatisation & chauffage.',         avatar:'', status:'active',   createdAt: new Date().toISOString(), certified:true  },
  { id:'art_demo_9', name:'Rachid Ouali',        email:'rachid@fixeo.ma',   role:'artisan', service:'Menuiserie',    phone:'0600000009', description:'Menuisier ébéniste 15 ans, meubles sur mesure.',  avatar:'', status:'active',   createdAt: new Date().toISOString(), certified:true  },
  { id:'art_demo_10',name:'Imane Zahiri',        email:'imane@fixeo.ma',    role:'artisan', service:'Maçonnerie',    phone:'0600000010', description:'Maçonne pro, carrelage, enduit et finitions.',    avatar:'', status:'active',   createdAt: new Date().toISOString(), certified:false },
  { id:'art_demo_11',name:'Samir Benhaddou',     email:'samir@fixeo.ma',    role:'artisan', service:'Climatisation', phone:'0600000011', description:'Expert climatisation & énergies renouvelables.',   avatar:'', status:'active',   createdAt: new Date().toISOString(), certified:true  },
  { id:'art_demo_12',name:'Khalid Fassi',        email:'khalid@fixeo.ma',   role:'artisan', service:'Serrurerie',    phone:'0600000012', description:'Serrurier toutes marques, urgences.',             avatar:'', status:'inactive', createdAt: new Date().toISOString(), certified:false },
];
_demoArtisans.forEach(a => artisansStore.set(a.id, a));
console.log('[Fixeo Artisans] ✅ Store initialisé —', artisansStore.size, 'artisan(s)');

/* ── Helper : vérifier token admin (frontend-only auth) ──── */
function _isAdminRequest(req) {
  /* Dans ce projet, l'auth est frontend uniquement (localStorage).
     On vérifie l'en-tête X-Admin-Auth envoyé par le dashboard admin. */
  const h = req.headers['x-admin-auth'];
  return h === 'fixeo_admin_v20' || h === '1';
}

/* ══════════════════════════════════════════════════════════════
   POST /api/admin/artisans/add — Ajouter un artisan (multipart/form-data)
══════════════════════════════════════════════════════════════ */
app.post('/api/admin/artisans/add', (req, res) => {
  _uploadAvatar(req, res, (uploadErr) => {
    console.log('[Fixeo Artisans] ══ POST /api/admin/artisans/add ══');

    if (uploadErr) {
      return res.status(400).json({ success: false, error: uploadErr.message });
    }
    if (!_isAdminRequest(req)) {
      return res.status(403).json({ success: false, error: 'Unauthorized — admin token required' });
    }

    const {
      name, email, phone, service, city, zones,
      subscriptionPlan, status, certified, description
    } = req.body;

    /* Validation */
    if (!name || !name.trim())
      return res.status(400).json({ success: false, error: 'Le nom est requis.' });
    if (!phone || !phone.trim())
      return res.status(400).json({ success: false, error: 'Le téléphone est requis.' });
    if (!service || !service.trim())
      return res.status(400).json({ success: false, error: 'Le service est requis.' });

    /* Vérifier unicité email */
    if (email && email.trim()) {
      for (const [, a] of artisansStore) {
        if (a.email && a.email.toLowerCase() === email.trim().toLowerCase()) {
          return res.status(409).json({ success: false, error: `Un artisan avec l'email "${email.trim()}" existe déjà.` });
        }
      }
    }

    /* Vérifier unicité téléphone */
    const phoneNorm = phone.trim().replace(/\s/g, '');
    for (const [, a] of artisansStore) {
      if (a.phone && a.phone.replace(/\s/g, '') === phoneNorm) {
        return res.status(409).json({ success: false, error: `Un artisan avec le téléphone "${phone}" existe déjà.` });
      }
    }

    /* URL avatar uploadé */
    let avatarUrl = '';
    if (req.file) {
      avatarUrl = '/uploads/artisans/' + req.file.filename;
    }

    const newArtisan = {
      id              : 'art_' + Date.now(),
      name            : name.trim(),
      email           : email ? email.trim().toLowerCase() : '',
      role            : 'artisan',
      service         : service.trim(),
      phone           : phone.trim(),
      city            : (city || '').trim(),
      zones           : (zones || '').trim(),
      subscriptionPlan: ['free','pro','premium'].includes(subscriptionPlan) ? subscriptionPlan : 'free',
      status          : status === 'inactive' ? 'inactive' : 'active',
      certified       : certified === 'true' || certified === true,
      description     : (description || '').trim(),
      avatar          : avatarUrl,
      rating          : 0,
      missions        : 0,
      createdAt       : new Date().toISOString()
    };

    artisansStore.set(newArtisan.id, newArtisan);
    console.log('[Fixeo Artisans] ✅ Artisan ajouté :', newArtisan.id, '—', newArtisan.name);
    res.json({ success: true, artisan: newArtisan });
  });
});

/* ══════════════════════════════════════════════════════════════
   GET /api/admin/artisans — Lister tous les artisans (admin)
══════════════════════════════════════════════════════════════ */
app.get('/api/admin/artisans', (req, res) => {
  if (!_isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Unauthorized' });
  }
  const list = Array.from(artisansStore.values()).sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
  res.json({ success: true, count: list.length, artisans: list });
});

/* ══════════════════════════════════════════════════════════════
   PUT /api/admin/artisans/:id — Modifier artisan complet (multipart/form-data)
══════════════════════════════════════════════════════════════ */
app.put('/api/admin/artisans/:id', (req, res) => {
  /* Si la requête cible /status, laisser passer au handler suivant */
  if (req.params.id === 'status') return res.status(400).json({ success: false, error: 'ID invalide.' });

  _uploadAvatar(req, res, (uploadErr) => {
    const { id } = req.params;
    console.log('[Fixeo Artisans] ══ PUT /api/admin/artisans/' + id + ' ══');

    if (uploadErr) {
      return res.status(400).json({ success: false, error: uploadErr.message });
    }
    if (!_isAdminRequest(req)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    if (!artisansStore.has(id)) {
      return res.status(404).json({ success: false, error: 'Artisan introuvable.' });
    }

    const {
      name, email, phone, service, city, zones,
      subscriptionPlan, status, certified, description, rating, missions
    } = req.body;

    /* Validation */
    if (!name || !name.trim())
      return res.status(400).json({ success: false, error: 'Le nom est requis.' });
    if (!phone || !phone.trim())
      return res.status(400).json({ success: false, error: 'Le téléphone est requis.' });
    if (!service || !service.trim())
      return res.status(400).json({ success: false, error: 'Le service est requis.' });

    /* Doublons email (excl. artisan en cours) */
    if (email && email.trim()) {
      for (const [aid, a] of artisansStore) {
        if (aid !== id && a.email && a.email.toLowerCase() === email.trim().toLowerCase()) {
          return res.status(409).json({ success: false, error: `L'email "${email.trim()}" est déjà utilisé par un autre artisan.` });
        }
      }
    }

    /* Doublons téléphone (excl. artisan en cours) */
    const phoneNorm = phone.trim().replace(/\s/g, '');
    for (const [aid, a] of artisansStore) {
      if (aid !== id && a.phone && a.phone.replace(/\s/g, '') === phoneNorm) {
        return res.status(409).json({ success: false, error: `Le téléphone "${phone}" est déjà utilisé par un autre artisan.` });
      }
    }

    const existing = artisansStore.get(id);

    /* Avatar : conserver l'ancien si pas de nouveau fichier */
    let avatarUrl = existing.avatar || '';
    if (req.file) {
      avatarUrl = '/uploads/artisans/' + req.file.filename;
    }

    const updatedArtisan = {
      ...existing,
      name            : name.trim(),
      email           : email ? email.trim().toLowerCase() : (existing.email || ''),
      phone           : phone.trim(),
      service         : service.trim(),
      city            : (city || '').trim(),
      zones           : (zones || '').trim(),
      subscriptionPlan: ['free','pro','premium'].includes(subscriptionPlan) ? subscriptionPlan : (existing.subscriptionPlan || 'free'),
      status          : ['active','inactive'].includes(status) ? status : existing.status,
      certified       : certified === 'true' || certified === true,
      description     : (description || '').trim(),
      avatar          : avatarUrl,
      rating          : !isNaN(parseFloat(rating)) ? parseFloat(rating) : (existing.rating || 0),
      missions        : !isNaN(parseInt(missions, 10)) ? parseInt(missions, 10) : (existing.missions || 0),
      updatedAt       : new Date().toISOString()
    };

    artisansStore.set(id, updatedArtisan);
    console.log('[Fixeo Artisans] ✅ Artisan mis à jour :', id, '—', updatedArtisan.name);
    res.json({ success: true, artisan: updatedArtisan });
  });
});

/* ══════════════════════════════════════════════════════════════
   PUT /api/admin/artisans/:id/status — Changer statut uniquement
══════════════════════════════════════════════════════════════ */
app.put('/api/admin/artisans/:id/status', (req, res) => {
  if (!_isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Unauthorized' });
  }
  const { id } = req.params;
  const { status } = req.body;

  if (!artisansStore.has(id)) {
    return res.status(404).json({ success: false, error: 'Artisan introuvable.' });
  }
  if (!['active', 'inactive'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Statut invalide (active|inactive).' });
  }

  const artisan = artisansStore.get(id);
  artisan.status = status;
  artisansStore.set(id, artisan);

  console.log('[Fixeo Artisans] 🔄 Statut mis à jour :', id, '→', status);
  res.json({ success: true, artisan });
});

/* ══════════════════════════════════════════════════════════════
   DELETE /api/admin/artisans/:id — Supprimer artisan
══════════════════════════════════════════════════════════════ */
app.delete('/api/admin/artisans/:id', (req, res) => {
  if (!_isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Unauthorized' });
  }
  const { id } = req.params;

  if (!artisansStore.has(id)) {
    return res.status(404).json({ success: false, error: 'Artisan introuvable.' });
  }

  const artisan = artisansStore.get(id);
  artisansStore.delete(id);

  console.log('[Fixeo Artisans] 🗑 Artisan supprimé :', id, '—', artisan.name);
  res.json({ success: true, deleted: artisan });
});

/* ══════════════════════════════════════════════════════════════
   GET /api/marketplace/artisans — Artisans ACTIFS (marketplace)
   Public — filtre uniquement status='active'
══════════════════════════════════════════════════════════════ */
app.get('/api/marketplace/artisans', (req, res) => {
  const active = Array.from(artisansStore.values())
    .filter(a => a.status === 'active')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ success: true, count: active.length, artisans: active });
});
