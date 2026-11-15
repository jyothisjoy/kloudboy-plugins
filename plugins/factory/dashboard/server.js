#!/usr/bin/env node
'use strict';
// Factory dashboard: serves index.html and run events from ~/.factory/runs. Node built-ins only.
//   node server.js            run in the foreground
//   node server.js --detach   start in the background (no-op if already running) and exit
//   node server.js --stop     stop the running dashboard (refuses while dashboard-started runs work)
//   node server.js --stop --force   stop it and the runs it started
// Env: FACTORY_DASHBOARD_PORT (4317), FACTORY_DASHBOARD_HOST (127.0.0.1),
//      FACTORY_DASHBOARD_KEY (required header x-factory-key on POST /events when set),
//      FACTORY_PLUGIN_DIR (dev only: --plugin-dir for the sessions the dashboard starts).
// Starting runs (/api/launch, /api/reply, /api/stop, /api/dismiss) works only on a loopback address,
// for requests whose Host is this machine and that carry the token served in the page.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const crypto = require('node:crypto');

const PORT = Number(process.env.FACTORY_DASHBOARD_PORT) || 4317;
const HOST = process.env.FACTORY_DASHBOARD_HOST || '127.0.0.1';
const HOME = path.join(os.homedir(), '.factory');
const RUNS = path.join(HOME, 'runs');
const LAUNCHES = path.join(HOME, 'launches.json');
const URL_BASE = `http://127.0.0.1:${PORT}`;
const LOOPBACK = ['127.0.0.1', 'localhost', '::1'].includes(HOST);
const TOKEN = crypto.randomBytes(24).toString('hex');
// Run types the dashboard can start: the factory command and the agents a run may turn off.
const KINDS = {
  feature: { command: '/factory:feature', optional: ['tester', 'debugger', 'reviewer', 'ui-checker'], needsText: true },
  bugfix: { command: '/factory:bugfix', optional: ['tester', 'reviewer'], needsText: true },
  security: { command: '/factory:security', optional: ['tester', 'debugger', 'reviewer'], needsText: false },
};
// No bypassPermissions: a page in a browser must not be able to start a session with every check off.
const MODES = ['acceptEdits', 'auto'];
const LAUNCH_ROUTES = ['/api/launches', '/api/launch', '/api/reply', '/api/stop', '/api/dismiss'];
const children = new Map(); // launch id → running claude process
const stopping = new Set(); // launch ids stopped from the dashboard

const safeName = (s) => String(s || '').replace(/[^\w.-]/g, '-').slice(0, 80);
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const registered = () => readJson(path.join(HOME, 'projects.json'), {});

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

// Stop the dashboard on this port. It names its own process in /api/ping, so nothing else on the
// port can be killed by mistake. Refuses while runs it started are working, unless forced.
async function stop(force) {
  let info = null;
  try { info = await (await fetch(`${URL_BASE}/api/ping`, { signal: AbortSignal.timeout(800) })).json(); } catch { /* not running */ }
  if (!info || info.app !== 'factory-dashboard' || !Number.isInteger(info.pid)) {
    console.log(`No factory dashboard is running at ${URL_BASE}.`);
    return;
  }
  if (info.working && !force) {
    console.log(`Not stopped: ${info.working} run(s) started from the dashboard are still working. Stop or finish them in the dashboard, or run with --stop --force to stop them too.`);
    process.exitCode = 1;
    return;
  }
  // The whole process tree, so sessions the dashboard started stop with it.
  if (process.platform === 'win32') cp.spawnSync('taskkill', ['/pid', String(info.pid), '/T', '/F'], { windowsHide: true });
  else { try { process.kill(info.pid, 'SIGTERM'); } catch { /* already gone */ } }
  for (let i = 0; i < 25 && (await isRunning()); i++) await new Promise((r) => setTimeout(r, 200));
  if (await isRunning()) {
    console.log(`The dashboard (process ${info.pid}) did not stop. End it in Task Manager or with: taskkill /pid ${info.pid} /T /F`);
    process.exitCode = 1;
    return;
  }
  if (info.working) {
    for (const job of readJson(LAUNCHES, [])) {
      if (job.status === 'running') saveLaunch({ ...job, status: 'stopped', message: 'Stopped together with the dashboard.' });
    }
  }
  console.log(`Factory dashboard stopped${info.working ? `, with ${info.working} run(s) it was working on` : ''}.`);
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
  return [...projectFiles(project), LAUNCHES].map((f) => { try { const s = fs.statSync(f); return s.size + ':' + s.mtimeMs; } catch { return ''; } }).join('|');
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 65536) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
  });
}

const hostOk = (req) => [`127.0.0.1:${PORT}`, `localhost:${PORT}`, `[::1]:${PORT}`].includes(req.headers.host);

// A registered project's folder, only if it still holds a factory config for the same project.
function projectRoot(name) {
  const root = registered()[name];
  if (!root) return null;
  const cfg = require('../hooks/lib/common').loadConfig(root);
  return cfg && safeName(cfg.project || path.basename(root)) === name ? root : null;
}

function saveLaunch(job) {
  job.updated = Date.now();
  const list = readJson(LAUNCHES, []).filter((j) => j.id !== job.id);
  list.push(job);
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(LAUNCHES, JSON.stringify(list.slice(-50), null, 2));
}

// Start (or resume) the headless session of a launch. The prompt goes on stdin; every argument is a
// fixed flag, a UUID or an allow-listed mode, so nothing a person typed reaches a command line.
function runClaude(job, root, prompt, resume) {
  const args = ['-p', '--output-format', 'json', '--permission-mode', job.mode, resume ? '--resume' : '--session-id', job.id];
  const dev = process.env.FACTORY_PLUGIN_DIR;
  if (dev && !/["%!^&|<>]/.test(dev)) args.push('--plugin-dir', dev);
  // A dashboard started by a SessionStart hook inherits that session's identity; the new session
  // must not, or it would report into the session that happened to start the dashboard.
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (k === 'CLAUDECODE' || k === 'CLAUDE_PID' || k === 'CLAUDE_PLUGIN_ROOT' || k === 'CLAUDE_PROJECT_DIR'
      || /^CLAUDE_CODE_(SESSION|CHILD|MESSAGING|ENTRYPOINT|EXECPATH)/.test(k)) delete env[k];
  }
  // On Windows, claude may be a .cmd shim, which needs a shell.
  const child = process.platform === 'win32'
    ? cp.spawn(['claude', ...args.map((a) => (/^[\w.:/\\-]+$/.test(a) ? a : `"${a}"`))].join(' '), { cwd: root, env, shell: true, windowsHide: true })
    : cp.spawn('claude', args, { cwd: root, env });
  children.set(job.id, child);
  Object.assign(job, { status: 'running', message: '' });
  saveLaunch(job);
  fs.mkdirSync(path.join(HOME, 'launches'), { recursive: true });
  const log = fs.createWriteStream(path.join(HOME, 'launches', job.id + '.log'), { flags: 'a' });
  let out = '', err = '', done = false;
  child.stdout.on('data', (d) => { out += d; log.write(d); });
  child.stderr.on('data', (d) => { err = (err + d).slice(-4000); log.write(d); });
  child.stdin.on('error', () => {});
  child.stdin.end(prompt);
  const finish = (code, failure) => {
    if (done) return;
    done = true;
    children.delete(job.id);
    log.end();
    let result = null;
    try { const j = JSON.parse(out); result = Array.isArray(j) ? j.filter((x) => x.type === 'result').at(-1) : j; } catch { /* no result */ }
    const run = readJson(path.join(root, '.factory', 'state', 'run.json'), {});
    const finished = run.finished && Date.parse(run.finished) >= job.started;
    job.message = String((result && result.result) || failure || err.trim() || `claude exited with code ${code}`).slice(-20000);
    job.status = stopping.has(job.id) ? 'stopped' : code !== 0 || !result || result.is_error ? 'failed' : finished ? 'done' : 'waiting';
    stopping.delete(job.id);
    saveLaunch(job);
  };
  child.on('error', (e) => finish(-1, `Could not start claude: ${e.message}`));
  child.on('close', (code) => finish(code));
}

async function launchApi(req, res, url) {
  if (!LOOPBACK) return send(res, 403, { error: 'Starting runs needs the dashboard on 127.0.0.1.' });
  if (req.headers['x-factory-token'] !== TOKEN) return send(res, 403, { error: 'Reload the dashboard page and try again.' });
  const jobs = readJson(LAUNCHES, []);

  if (req.method === 'GET' && url.pathname === '/api/launches') {
    const name = url.searchParams.get('project') || '';
    const list = jobs.filter((j) => j.project === name && !j.dismissed).reverse().slice(0, 5);
    const root = projectRoot(name);
    if (root && list[0] && list[0].status === 'waiting') {
      const read = (f) => { try { return fs.readFileSync(path.join(root, '.factory', f), 'utf8').slice(0, 50000); } catch { return undefined; } };
      // A security run waits on its report; the others on their plan.
      if (list[0].kind === 'security') list[0].report = read('security.md');
      else list[0].plan = read('plan.md');
    }
    return send(res, 200, list);
  }
  if (req.method !== 'POST') return send(res, 404, { error: 'not found' });
  const body = await readBody(req);
  if (!body) return send(res, 400, { error: 'Invalid request.' });

  if (url.pathname === '/api/launch') {
    const name = safeName(body.project);
    const root = projectRoot(name);
    if (!root) return send(res, 400, { error: 'Unknown project. Open a Claude Code session in it once so the factory registers it.' });
    const kind = body.kind || 'feature';
    const type = Object.hasOwn(KINDS, kind) ? KINDS[kind] : null;
    if (!type) return send(res, 400, { error: `Run type must be one of ${Object.keys(KINDS).join(', ')}.` });
    const spec = String(body.spec || '').trim();
    if ((type.needsText && !spec) || spec.length > 20000) {
      return send(res, 400, { error: `Write a ${kind === 'bugfix' ? 'bug report' : 'spec'} (up to 20,000 characters).` });
    }
    const skip = Array.isArray(body.skip) ? [...new Set(body.skip.map(String))] : [];
    if (skip.some((a) => !type.optional.includes(a))) return send(res, 400, { error: `Only ${type.optional.join(', ')} can be turned off.` });
    if (body.mode !== undefined && !MODES.includes(body.mode)) return send(res, 400, { error: `Permission mode must be one of ${MODES.join(', ')}.` });
    const mode = body.mode || 'acceptEdits';
    if (jobs.some((j) => j.project === name && children.has(j.id))) return send(res, 409, { error: 'A run started from the dashboard is still working in this project.' });
    const dir = path.join(root, '.factory', 'state');
    fs.mkdirSync(dir, { recursive: true });
    if (spec) fs.writeFileSync(path.join(dir, 'dashboard-spec.md'), spec + '\n');
    const first = spec.split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).find(Boolean) || '';
    const title = (kind === 'security' ? `Security check: ${first || 'whole project'}` : kind === 'bugfix' ? `Fix: ${first}` : first).slice(0, 80);
    const job = { id: crypto.randomUUID(), project: name, kind, title, skip, mode, started: Date.now() };
    const args = [skip.length ? `--skip ${skip.join(',')}` : '', spec ? '.factory/state/dashboard-spec.md' : ''].filter(Boolean).join(' ');
    runClaude(job, root, `${type.command}${args ? ' ' + args : ''}`, false);
    return send(res, 200, job);
  }

  const job = jobs.find((j) => j.id === body.id);
  if (!job) return send(res, 404, { error: 'Unknown run.' });
  if (url.pathname === '/api/reply') {
    const text = String(body.text || '').trim();
    const root = projectRoot(job.project);
    if (!text || text.length > 20000) return send(res, 400, { error: 'Write a reply.' });
    if (!root) return send(res, 400, { error: 'The project folder is no longer registered.' });
    if (children.has(job.id)) return send(res, 409, { error: 'The run is still working.' });
    runClaude(job, root, text, true);
    return send(res, 200, job);
  }
  if (url.pathname === '/api/stop') {
    const child = children.get(job.id);
    if (!child) return send(res, 409, { error: 'The run is not working.' });
    stopping.add(job.id);
    if (process.platform === 'win32') cp.spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    else child.kill('SIGTERM');
    return send(res, 200, { ok: true });
  }
  if (url.pathname === '/api/dismiss') {
    if (children.has(job.id)) return send(res, 409, { error: 'Stop the run first.' });
    saveLaunch({ ...job, dismissed: true });
    return send(res, 200, { ok: true });
  }
  return send(res, 404, { error: 'not found' });
}

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, URL_BASE);
    const project = url.searchParams.get('project') || '';
    // On loopback, refuse other Host names so a DNS-rebinding page can't read runs or the token.
    if (LOOPBACK && url.pathname !== '/events' && !hostOk(req)) return send(res, 403, { error: 'bad host' });

    if (req.method === 'GET' && url.pathname === '/') {
      const page = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').replace('__FACTORY_TOKEN__', LOOPBACK ? TOKEN : '');
      return send(res, 200, page, 'text/html; charset=utf-8');
    }
    if (LAUNCH_ROUTES.includes(url.pathname)) {
      launchApi(req, res, url).catch(() => send(res, 500, { error: 'Something went wrong in the dashboard server.' }));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/ping') {
      return send(res, 200, { ok: true, app: 'factory-dashboard', pid: process.pid, working: children.size });
    }
    if (req.method === 'GET' && url.pathname === '/api/projects') {
      let names = [];
      try { names = fs.readdirSync(RUNS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { /* none yet */ }
      const reg = registered();
      const list = [...new Set([...names, ...Object.keys(reg)])].map((name) => {
        const files = projectFiles(name, 1);
        const last = files.length ? fs.statSync(files[0]).mtimeMs : 0;
        return { name, lastAt: last, launchable: LOOPBACK && Boolean(reg[name]) };
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
  // Sessions started by an earlier dashboard process can't be watched any more.
  for (const job of readJson(LAUNCHES, [])) {
    if (job.status === 'running') {
      saveLaunch({ ...job, status: 'waiting', message: 'The dashboard restarted while this run was working. Check the project (git log, .factory/plan.md), then reply to continue it.' });
    }
  }
  // --stop on macOS/Linux sends SIGTERM: take the sessions this dashboard started down with it.
  process.on('SIGTERM', () => { for (const c of children.values()) c.kill('SIGTERM'); process.exit(0); });
  server.listen(PORT, HOST, () => console.log(`Factory dashboard: http://${HOST}:${PORT}`));
}

if (process.argv.includes('--stop')) stop(process.argv.includes('--force'));
else if (process.argv.includes('--detach')) detach();
else serve();
