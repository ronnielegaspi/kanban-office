#!/usr/bin/env node
/* PM Floor — office bridge server (zero dependencies, Node stdlib only).
   - Serves the static floor page + office-state.json (no-cache so the board polls fresh).
   - POST /api/request  -> queues a typed request into request-inbox.json for the Architect.
   - GET  /api/inbox    -> the request queue + processing state (board shows "planning…").
   Run:  node server.js   then open  http://localhost:8080/ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8080;
const INBOX = path.join(ROOT, 'request-inbox.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function readInbox() {
  try { return JSON.parse(fs.readFileSync(INBOX, 'utf8')); }
  catch (e) { return { queue: [] }; }
}
function writeInbox(d) {
  fs.writeFileSync(INBOX, JSON.stringify(d, null, 2));
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const pathname = decodeURIComponent(u.pathname);

  // --- API: file a request from the browser ---
  if (req.method === 'POST' && pathname === '/api/request') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      let p = {};
      try { p = JSON.parse(body || '{}'); } catch (e) {}
      const feature = (p.feature || '').toString().trim();
      if (!feature) {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'feature required' }));
      }
      const inbox = readInbox();
      inbox.queue = inbox.queue || [];
      const item = {
        id: 'r' + Date.now(),
        feature,
        priority: (p.priority || 'P1').toString(),
        capacity: Number(p.capacity) || 6,
        status: 'pending',            // pending -> processing -> done  (the Architect updates this)
        filedAt: new Date().toISOString()
      };
      inbox.queue.push(item);
      writeInbox(inbox);
      console.log('[request filed] ' + item.priority + '  ' + feature);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id: item.id }));
    });
    return;
  }

  // --- API: inbox / processing status ---
  if (req.method === 'GET' && pathname === '/api/inbox') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(readInbox()));
  }

  // --- static files ---
  let rel = pathname === '/' ? '/office-floor.html' : pathname;
  const filePath = path.normalize(path.join(ROOT, rel));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
    const ext = path.extname(filePath).toLowerCase();
    const headers = { 'content-type': MIME[ext] || 'application/octet-stream' };
    if (ext === '.json' || ext === '.html') headers['cache-control'] = 'no-store';
    res.writeHead(200, headers);
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('Kanban Office (browser mode) is live  ->  http://localhost:' + PORT + '/');
  console.log('Type a request in the browser; it queues into request-inbox.json for the Architect.');
});
