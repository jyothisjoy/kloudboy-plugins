#!/usr/bin/env node
'use strict';
// Factory dashboard: serves index.html and run events from ~/.factory/runs. Node built-ins only.
//   node server.js            run in the foreground
//   node server.js --detach   start in the background (no-op if already running) and exit
// Env: FACTORY_DASHBOARD_PORT (4317), FACTORY_DASHBOARD_HOST (127.0.0.1),
//      FACTORY_DASHBOARD_KEY (required header x-factory-key on POST /events when set).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');

const PORT = Number(process.env.FACTORY_DASHBOARD_PORT) || 4317;
const HOST = process.env.FACTORY_DASHBOARD_HOST || '127.0.0.1';
const RUNS = path.join(os.homedir(), '.factory', 'runs');
const URL_BASE = `http://127.0.0.1:${PORT}`;

const safeName = (s) => String(s || '').replace(/[^\w.-]/g, '-').slice(0, 80);

async function isRunning() {
  try {
    const r = await fetch(`${URL_BASE}/api/ping`, { signal: AbortSignal.timeout(800) });
    return r.ok;
  } catch { return false; }
}

async function detach() {
  if (await isRunning()) { console.log(`Factory dashboard already running: ${URL_BASE}`); return; }
  const child = cp.spawn(process.execPath, [__filename], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  console.log(`Factory dashboard started: ${URL_BASE}`);
}

function projectFiles(project, days = 14) {
  const dir = path.join(RUNS, safeName(project));
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort().slice(-days).map((f) => path.join(dir, f));
  } catch { return []; }
}

function readEvents(project) {
  const out = [];
  for (const file of projectFiles(project)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); } catch { /* skip a torn line */ }
    }
  }
  return out.slice(-20000);
}

function signature(project) {
  return projectFiles(project).map((f) => { try { const s = fs.statSync(f); return s.size + ':' + s.mtimeMs; } catch { return ''; } }).join('|');
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, URL_BASE);
    const project = url.searchParams.get('project') || '';

    if (req.method === 'GET' && url.pathname === '/') {
      return send(res, 200, fs.readFileSync(path.join(__dirname, 'index.html')), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/api/ping') return send(res, 200, { ok: true });
    if (req.method === 'GET' && url.pathname === '/api/projects') {
      let names = [];
      try { names = fs.readdirSync(RUNS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { /* none yet */ }
      const list = names.map((name) => {
        const files = projectFiles(name, 1);
        const last = files.length ? fs.statSync(files[0]).mtimeMs : 0;
        return { name, lastAt: last };
      }).sort((a, b) => b.lastAt - a.lastAt);
      return send(res, 200, list);
    }
    if (req.method === 'GET' && url.pathname === '/api/events') return send(res, 200, readEvents(project));
    if (req.method === 'GET' && url.pathname === '/api/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      let last = signature(project);
      let ticks = 0;
      const timer = setInterval(() => {
        const now = signature(project);
        if (now !== last) { last = now; res.write('data: changed\n\n'); }
        if (++ticks % 15 === 0) res.write(': ping\n\n');
      }, 1000);
      req.on('close', () => clearInterval(timer));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/events') {
      const key = process.env.FACTORY_DASHBOARD_KEY;
      if (key && req.headers['x-factory-key'] !== key) return send(res, 401, { error: 'bad key' });
      let body = '';
      req.on('data', (d) => { body += d; if (body.length > 65536) req.destroy(); });
      req.on('end', () => {
        try {
          const ev = JSON.parse(body);
          const name = safeName(ev.project);
          if (!name) return send(res, 400, { error: 'project required' });
          const dir = path.join(RUNS, name);
          fs.mkdirSync(dir, { recursive: true });
          fs.appendFileSync(path.join(dir, new Date().toISOString().slice(0, 10) + '.jsonl'), JSON.stringify(ev) + '\n');
          send(res, 204, '');
        } catch { send(res, 400, { error: 'invalid json' }); }
      });
      return;
    }
    send(res, 404, { error: 'not found' });
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') { console.log(`Port ${PORT} in use; dashboard probably already running at ${URL_BASE}`); process.exit(0); }
    throw err;
  });
  server.listen(PORT, HOST, () => console.log(`Factory dashboard: http://${HOST}:${PORT}`));
}

if (process.argv.includes('--detach')) detach(); else serve();
