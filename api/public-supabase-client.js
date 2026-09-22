'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { publicConfig } = require('./supabase-environment');

function clientScript(env = process.env) {
  const config = publicConfig(env);
  // Static path is traced into the existing Vercel server function bundle.
  const source = fs.readFileSync(path.join(__dirname, '../js/supabase-client.js'), 'utf8');
  return 'window.FIXEO_ENV = ' + JSON.stringify(config) + ';\n' + source;
}

function serveClient(req, res) {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try { return res.send(clientScript()); } catch (_) {
    return res.status(503).send('/* Public configuration unavailable. */');
  }
}

module.exports = { clientScript, serveClient };
