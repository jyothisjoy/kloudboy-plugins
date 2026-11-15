'use strict';
// Shared helpers for factory hooks. Node built-ins only.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const HOME_DIR = path.join(os.homedir(), '.factory');

function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (raw += d));
    process.stdin.on('end', () => {
      try { resolve(raw.trim() ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
  });
}

// Walk up from `start` to the nearest folder holding .factory/config.yml.
function findRoot(start) {
  let dir = path.resolve(start || process.cwd());
  for (;;) {
    if (fs.existsSync(path.join(dir, '.factory', 'config.yml'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

// Minimal YAML for .factory/config.yml: nested maps by indentation, `- item` lists,
// inline [a, b] lists, quoted strings, numbers, booleans, # comments.
function parseYaml(src) {
  const root = {};
  const stack = [{ indent: -1, obj: root }];
  for (const raw of src.split(/\r?\n/)) {
    const line = stripComment(raw);
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    const text = line.trim();
    while (stack.length > 1 && indent <= stack.at(-1).indent) stack.pop();
    const frame = stack.at(-1);
    if (text.startsWith('- ') || text === '-') {
      if (!Array.isArray(frame.obj)) {
        if (frame.parent && frame.key) { frame.obj = frame.parent[frame.key] = []; } else continue;
      }
      frame.obj.push(scalar(text.slice(1).trim()));
      continue;
    }
    const m = text.match(/^([^:]+?):(?:\s+(.*))?$/);
    if (!m || Array.isArray(frame.obj)) continue;
    const key = m[1].trim();
    const val = m[2] === undefined ? '' : m[2].trim();
    if (val === '') {
      frame.obj[key] = {};
      stack.push({ indent, obj: frame.obj[key], parent: frame.obj, key });
    } else {
      frame.obj[key] = scalar(val);
    }
  }
  return root;
}

function stripComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

function scalar(v) {
  if (v === '' || v === "''" || v === '""') return '';
  if ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'")) return v.slice(1, -1);
  if (v[0] === '[' && v.at(-1) === ']') {
    const inner = v.slice(1, -1).trim();
    return inner ? inner.split(',').map((s) => scalar(s.trim())) : [];
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function loadConfig(root) {
  try { return parseYaml(fs.readFileSync(path.join(root, '.factory', 'config.yml'), 'utf8')); }
  catch { return null; }
}

function stateFile(root, name) {
  const dir = path.join(root, '.factory', 'state');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, name);
}
function readState(root, name) {
  try { return fs.readFileSync(stateFile(root, name), 'utf8').trim(); } catch { return ''; }
}
function readStateJson(root, name) {
  try { return JSON.parse(readState(root, name)); } catch { return null; }
}
function writeState(root, name, value) {
  fs.writeFileSync(stateFile(root, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}
function clearState(root, name) {
  try { fs.writeFileSync(stateFile(root, name), ''); } catch { /* ignore */ }
}

// Glob → RegExp. `**` crosses folders, `*` and `?` don't. A pattern without `/` matches the
// file name in any folder (like .gitignore).
function globToRegex(glob) {
  let g = String(glob).replace(/\\/g, '/').replace(/^\.\//, '');
  const anyDir = !g.replace(/\/$/, '').includes('/');
  if (g.endsWith('/')) g += '**';
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') {
      if (g[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp((anyDir ? '^(?:.*/)?' : '^') + re + '$');
}
function matchAny(rel, globs) {
  return (Array.isArray(globs) ? globs : []).find((g) => globToRegex(g).test(rel)) || null;
}

function toRel(root, file) {
  if (!file) return '';
  const abs = path.isAbsolute(file) ? file : path.join(root, file);
  return path.relative(root, abs).replace(/\\/g, '/');
}

function safeName(s) {
  return String(s || 'unknown').replace(/[^\w.-]/g, '-').slice(0, 80) || 'unknown';
}

// Append one event to ~/.factory/runs/<project>/<date>.jsonl and, in team mode, POST it.
// Never throws, never blocks for long: the dashboard is optional.
async function emit(cfg, root, event) {
  try {
    if (cfg?.dashboard?.mode === 'off') return;
    const project = safeName(cfg?.project || path.basename(root));
    const run = readStateJson(root, 'run.json');
    const ev = { at: Date.now(), project, run_title: run?.title, ...event };
    for (const k of Object.keys(ev)) if (ev[k] === undefined || ev[k] === '') delete ev[k];
    const dir = path.join(HOME_DIR, 'runs', project);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, new Date().toISOString().slice(0, 10) + '.jsonl'), JSON.stringify(ev) + '\n');
    const url = cfg?.dashboard?.mode === 'team' && cfg.dashboard.url;
    if (url && typeof fetch === 'function') {
      const headers = { 'content-type': 'application/json' };
      if (process.env.FACTORY_DASHBOARD_KEY) headers['x-factory-key'] = process.env.FACTORY_DASHBOARD_KEY;
      await fetch(url.replace(/\/$/, '') + '/events', {
        method: 'POST', headers, body: JSON.stringify(ev), signal: AbortSignal.timeout(1500),
      }).catch(() => {});
    }
  } catch { /* never break a run over telemetry */ }
}

function logError(err) {
  try {
    fs.mkdirSync(HOME_DIR, { recursive: true });
    fs.appendFileSync(path.join(HOME_DIR, 'hook-errors.log'), `${new Date().toISOString()} ${err && err.stack || err}\n`);
  } catch { /* ignore */ }
}

module.exports = {
  HOME_DIR, readStdin, findRoot, parseYaml, loadConfig, readState, readStateJson, writeState,
  clearState, globToRegex, matchAny, toRel, safeName, emit, logError,
};
