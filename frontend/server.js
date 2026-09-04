// MedLens Frontend Server
// Serves the static UI and proxies upload/ask requests to the n8n backend.
//
// Usage:  node frontend/server.js
// Then:   open http://localhost:3000

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const N8N = process.env.N8N_URL || 'http://localhost:5678';

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

// ── Proxy helper: forwards request body to n8n and streams response back ──
function proxyToN8n(req, res, targetPath) {
  const target = new URL(N8N);
  const headers = { ...req.headers };
  // Strip hop-by-hop and browser-specific headers that confuse n8n
  delete headers.host;
  delete headers['connection'];
  delete headers['accept-encoding'];
  delete headers['accept-language'];
  delete headers['sec-fetch-dest'];
  delete headers['sec-fetch-mode'];
  delete headers['sec-fetch-site'];
  headers.host = target.host;

  const opts = {
    hostname: target.hostname,
    port: target.port,
    path: targetPath,
    method: req.method,
    headers,
    timeout: 0,
  };

  console.log(`[proxy] → ${req.method} ${targetPath}  content-type: ${headers['content-type'] || 'none'}  content-length: ${headers['content-length'] || 'none'}`);

  const started = Date.now();
  const proxy = http.request(opts, upstream => {
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`[proxy] ← n8n ${upstream.statusCode} after ${elapsed}s  content-type: ${upstream.headers['content-type']}  content-length: ${upstream.headers['content-length']}`);

    // Collect body to log it for debugging
    const chunks = [];
    upstream.on('data', chunk => chunks.push(chunk));
    upstream.on('end', () => {
      const body = Buffer.concat(chunks);
      console.log(`[proxy] ← body size: ${body.length} bytes  preview: ${body.slice(0, 300).toString()}`);
      res.writeHead(upstream.statusCode, {
        'content-type': upstream.headers['content-type'] || 'application/json',
        'content-length': body.length,
        'access-control-allow-origin': '*',
      });
      res.end(body);
    });
  });
  proxy.on('timeout', () => {
    console.error('[proxy] Request to n8n timed out');
    proxy.destroy();
    if (!res.headersSent) {
      res.writeHead(504, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'n8n took too long to respond' }));
    }
  });
  proxy.on('error', err => {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Cannot reach n8n at ' + N8N }));
    }
  });
  req.pipe(proxy);
}

// ── Static file server ──
function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(__dirname, urlPath);

  // Safety: don't serve files outside the frontend directory
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + urlPath);
      return;
    }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

// ── Main router ──
const server = http.createServer((req, res) => {
  const url = req.url;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // Proxy: upload
  if (url === '/api/upload' && req.method === 'POST') {
    console.log('[upload] Proxying to n8n...');
    proxyToN8n(req, res, '/webhook/medlens/upload');
    return;
  }

  // Proxy: ask
  if (url === '/api/ask' && req.method === 'POST') {
    console.log('[ask] Proxying to n8n...');
    proxyToN8n(req, res, '/webhook/medlens/ask');
    return;
  }

  // Static files
  serveStatic(req, res);
});

server.timeout = 0;           // no socket timeout (Node v24+ defaults)
server.requestTimeout = 0;    // no request timeout
server.keepAliveTimeout = 0;

server.listen(PORT, () => {
  console.log('');
  console.log('  MedLens Frontend ready');
  console.log('  ----------------------');
  console.log('  Open:   http://localhost:' + PORT);
  console.log('  n8n:    ' + N8N);
  console.log('');
});
