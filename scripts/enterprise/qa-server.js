#!/usr/bin/env node
/**
 * QA Server for Enterprise Dashboard
 * Serves enterprise-dashboard.html with mock Supabase injected BEFORE real JS loads.
 * Listens on 127.0.0.1:18099
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../');
const PORT = 18099;
const HOST = '127.0.0.1';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.txt':  'text/plain; charset=utf-8',
};

// ── Mock injection script inserted before real app JS ──────────────────────
const MOCK_SCRIPT = `<script>
/* ================================================================
   QA SERVER MOCK — injected before enterprise-dashboard-v1.js
   ================================================================ */

// ── Mock data ─────────────────────────────────────────────────────
window._MOCK_DATA = {
  enterprise_members: [
    { id: 'mem-001', enterprise_id: 'ent-001', user_id: 'user-test-001', role: 'owner',
      full_name: 'Test Owner', email: 'test@fixeo.ma',
      enterprise_accounts: { id: 'ent-001', name: 'FIXEO Test Corp' },
      users: { email: 'test@fixeo.ma', full_name: 'Test Owner' } },
    { id: 'mem-002', enterprise_id: 'ent-001', user_id: 'user-test-002', role: 'admin',
      full_name: 'Admin User', email: 'admin@fixeo.ma',
      enterprise_accounts: { id: 'ent-001', name: 'FIXEO Test Corp' },
      users: { email: 'admin@fixeo.ma', full_name: 'Admin User' } }
  ],
  enterprise_sites: [
    { id: 'site-001', enterprise_id: 'ent-001', name: 'Site Alpha', city: 'Casablanca',
      address: '10 rue Moulay', status: 'active',
      created_at: new Date(Date.now()-86400000*10).toISOString() },
    { id: 'site-002', enterprise_id: 'ent-001', name: 'Site Beta', city: 'Rabat',
      address: '5 avenue Hassan', status: 'active',
      created_at: new Date(Date.now()-86400000*5).toISOString() }
  ],
  service_requests: [
    { id: 'req-00000001-aaaa-bbbb-cccc-dddddddd0001', category: 'Plomberie',
      description: 'Fuite eau urgente au sous-sol', urgency: 'now', status: 'new',
      enterprise_site_id: 'site-001', created_at: new Date(Date.now()-3600000).toISOString(),
      enterprise_request_context: { enterprise_id: 'ent-001' } },
    { id: 'req-00000002-aaaa-bbbb-cccc-dddddddd0002', category: 'Électricité',
      description: 'Disjoncteur principal défaillant', urgency: 'urgent', status: 'completed',
      enterprise_site_id: 'site-001', created_at: new Date(Date.now()-86400000*2).toISOString(),
      enterprise_request_context: { enterprise_id: 'ent-001' } },
    { id: 'req-00000003-aaaa-bbbb-cccc-dddddddd0003', category: 'HVAC',
      description: 'Climatiseur en panne salle réunion', urgency: '', status: 'in_progress',
      enterprise_site_id: 'site-002', created_at: new Date(Date.now()-86400000*3).toISOString(),
      enterprise_request_context: { enterprise_id: 'ent-001' } },
    { id: 'req-00000004-aaaa-bbbb-cccc-dddddddd0004', category: 'Menuiserie',
      description: 'Porte entrée bloquée', urgency: 'urgent', status: 'assigned',
      enterprise_site_id: 'site-002', created_at: new Date(Date.now()-86400000).toISOString(),
      enterprise_request_context: { enterprise_id: 'ent-001' } },
    { id: 'req-00000005-aaaa-bbbb-cccc-dddddddd0005', category: 'Peinture',
      description: 'Peinture urgente bureau direction', urgency: '', status: 'no_match',
      enterprise_site_id: 'site-001', created_at: new Date(Date.now()-86400000*7).toISOString(),
      enterprise_request_context: { enterprise_id: 'ent-001' } },
    { id: 'req-00000006-aaaa-bbbb-cccc-dddddddd0006', category: 'Nettoyage',
      description: 'Nettoyage après travaux', urgency: '', status: 'validated',
      enterprise_site_id: 'site-001', created_at: new Date(Date.now()-86400000*14).toISOString(),
      enterprise_request_context: { enterprise_id: 'ent-001' } },
    { id: 'req-00000007-aaaa-bbbb-cccc-dddddddd0007', category: 'Serrurerie',
      description: 'Serrure cassée bureau 2', urgency: '', status: 'cancelled',
      enterprise_site_id: 'site-001', created_at: new Date(Date.now()-86400000*20).toISOString(),
      enterprise_request_context: { enterprise_id: 'ent-001' } },
    { id: 'req-00000008-aaaa-bbbb-cccc-dddddddd0008', category: 'Plomberie',
      description: 'Évier bouché cuisine', urgency: '', status: 'new',
      enterprise_site_id: 'site-002', created_at: new Date(Date.now()-86400000*4).toISOString(),
      enterprise_request_context: { enterprise_id: 'ent-001' } }
  ]
};

// ── Mock Supabase client ──────────────────────────────────────────
window._supabase = {
  auth: {
    getSession: async function() {
      return {
        data: {
          session: {
            user: { id: 'user-test-001', email: 'test@fixeo.ma' },
            access_token: 'mock-token'
          }
        },
        error: null
      };
    },
    onAuthStateChange: function(cb) {
      setTimeout(function() {
        cb('SIGNED_IN', {
          user: { id: 'user-test-001', email: 'test@fixeo.ma' },
          access_token: 'mock-token'
        });
      }, 100);
      return { data: { subscription: { unsubscribe: function(){} } } };
    },
    signOut: async function() { return { error: null }; }
  },
  from: function(table) {
    var self = {
      _table: table,
      _filters: [],
      select: function(cols) { return self; },
      eq: function(col, val) { self._filters.push({col,val}); return self; },
      in: function(col, vals) { return self; },
      or: function(expr) { return self; },
      ilike: function(col, val) { return self; },
      order: function(col, opts) { return self; },
      limit: function(n) { return self; },
      range: function(from, to) { return self; },
      gte: function(col, val) { return self; },
      lte: function(col, val) { return self; },
      gt: function(col, val) { return self; },
      lt: function(col, val) { return self; },
      not: function(col, op, val) { return self; },
      then: function(resolve, reject) {
        var p = Promise.resolve().then(function() {
          var mockData = window._MOCK_DATA || {};
          var rows = (mockData[table] || []).slice();
          self._filters.forEach(function(f) {
            if(f.col === 'user_id') {
              var filtered = rows.filter(function(r){ return r[f.col] === f.val; });
              if(filtered.length) rows = filtered;
            } else if(f.col === 'enterprise_id') {
              rows = rows.filter(function(r){ return r[f.col] === f.val; });
            } else if(f.col === 'enterprise_request_context.enterprise_id') {
              rows = rows.filter(function(r) {
                return r.enterprise_request_context && r.enterprise_request_context.enterprise_id === f.val;
              });
            }
            // Other filters pass through — mock returns all rows
          });
          return { data: rows, error: null };
        });
        if(typeof resolve === 'function') {
          return p.then(resolve, reject);
        }
        return p;
      }
    };
    return self;
  },
  rpc: function(name, params) {
    return Promise.resolve({ data: { id: 'mock-rpc-result-001' }, error: null });
  }
};

console.log('[QA-MOCK] Supabase mock injected. User: user-test-001');
<\/script>
`;

function serveMockHTML(res, htmlPath) {
  let html = fs.readFileSync(htmlPath, 'utf8');
  // Inject mock BEFORE the closing </head> tag (or before first <script> in body)
  // Strategy: inject right before the first <script src= that loads enterprise JS
  const injectMarker = '<script src="js/enterprise-dashboard-v1.js"';
  const idx = html.indexOf(injectMarker);
  if (idx !== -1) {
    html = html.slice(0, idx) + MOCK_SCRIPT + '\n' + html.slice(idx);
  } else {
    // Fallback: inject at start of <body>
    const bodyIdx = html.indexOf('<body');
    const bodyEnd = html.indexOf('>', bodyIdx) + 1;
    html = html.slice(0, bodyEnd) + '\n' + MOCK_SCRIPT + html.slice(bodyEnd);
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

const server = http.createServer(function(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/' || urlPath === '/enterprise-dashboard.html') {
    const htmlPath = path.join(ROOT, 'enterprise-dashboard.html');
    if (!fs.existsSync(htmlPath)) {
      res.writeHead(404); res.end('enterprise-dashboard.html not found');
      return;
    }
    try {
      serveMockHTML(res, htmlPath);
    } catch(e) {
      res.writeHead(500); res.end('Server error: ' + e.message);
    }
    return;
  }

  // For test harness HTML files
  if (urlPath.startsWith('/tests/')) {
    const filePath = path.join(ROOT, urlPath.slice(1));
    const ext = path.extname(filePath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': mime });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404); res.end('Not found: ' + urlPath);
    }
    return;
  }

  // Static files
  const filePath = path.join(ROOT, urlPath.slice(1));
  const ext = path.extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404); res.end('Not found: ' + urlPath);
    return;
  }

  res.writeHead(200, { 'Content-Type': mime });
  res.end(fs.readFileSync(filePath));
});

server.listen(PORT, HOST, function() {
  console.log('[QA-SERVER] Listening on http://' + HOST + ':' + PORT);
  console.log('[QA-SERVER] Root: ' + ROOT);
});

server.on('error', function(e) {
  if (e.code === 'EADDRINUSE') {
    console.error('[QA-SERVER] Port ' + PORT + ' already in use. Kill existing process first.');
  } else {
    console.error('[QA-SERVER] Error:', e.message);
  }
  process.exit(1);
});
