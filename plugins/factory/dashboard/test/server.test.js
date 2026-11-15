'use strict';
// Dashboard server tests: node --test plugins/factory/dashboard/test/server.test.js
// A fake `claude` on the PATH stands in for Claude Code, so starting a run costs nothing: it records
// its arguments and stdin, "plans" on the first call and "finishes" when told the plan is approved.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const SERVER = path.join(__dirname, '..', 'server.js');

const FAKE = `
const fs = require('fs'), path = require('path');
let input = '';
process.stdin.on('data', (d) => (input += d)).on('end', () => {
  fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args: process.argv.slice(2), input, cwd: process.cwd() }) + '\\n');
  const state = path.join(process.cwd(), '.factory', 'state');
  if (input.includes('--skip tester,debugger,reviewer')) return setTimeout(() => {}, 60000); // a long run, to be stopped
  let result = 'Plan ready. Approve it to continue.';
  if (input.startsWith('/factory:feature')) fs.writeFileSync(path.join(process.cwd(), '.factory', 'plan.md'), '# Plan\\n- [ ] 1. Do it\\n');
  if (/approved/i.test(input)) {
    fs.writeFileSync(path.join(state, 'run.json'), JSON.stringify({ title: 'T', finished: new Date().toISOString() }));
    result = 'Run finished on factory/do-it.';
  }
  console.log(JSON.stringify([{ type: 'system' }, { type: 'result', subtype: 'success', is_error: false, result }]));
});`;

function setup() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-dash-'));
  const home = path.join(base, 'home');
  const root = path.join(base, 'my-app');
  const bin = path.join(base, 'bin');
  for (const d of [path.join(home, '.factory'), path.join(root, '.factory'), bin]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(root, '.factory', 'config.yml'), 'project: my-app\n');
  fs.writeFileSync(path.join(home, '.factory', 'projects.json'), JSON.stringify({ 'my-app': root, gone: path.join(base, 'nope') }));
  fs.writeFileSync(path.join(bin, 'fake-claude.js'), FAKE);
  fs.writeFileSync(path.join(bin, 'claude.cmd'), '@node "%~dp0fake-claude.js" %*\r\n');
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\nexec node "${path.join(bin, 'fake-claude.js')}" "$@"\n`, { mode: 0o755 });
  return { base, home, root, bin, log: path.join(base, 'claude-calls.jsonl') };
}

async function start(env, extra = {}) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const vars = {
    ...process.env, HOME: env.home, USERPROFILE: env.home, FACTORY_DASHBOARD_PORT: String(port), FAKE_LOG: env.log,
    PATH: env.bin + path.delimiter + process.env.PATH, FACTORY_PLUGIN_DIR: '', ...extra,
  };
  const child = cp.spawn(process.execPath, [SERVER], { env: vars });
  const exited = new Promise((resolve) => child.on('exit', resolve));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(base + '/api/ping')).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const page = await (await fetch(base + '/')).text();
  const token = page.match(/name="factory-token" content="([^"]*)"/)[1];
  const call = async (url, body, headers = {}) => {
    const r = await fetch(base + url, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', 'x-factory-token': token, ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  // Runs `node server.js --stop [--force]` against this server, as a person would.
  const stopCmd = (...flags) => cp.spawnSync(process.execPath, [SERVER, '--stop', ...flags], { env: vars, encoding: 'utf8' });
  return { child, base, token, call, exited, stopCmd, stop: () => child.kill() };
}

async function until(fn) {
  for (let i = 0; i < 100; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('timed out');
}

test('start, plan, approve, finish: one session, prompts on stdin only', async () => {
  const env = setup();
  const s = await start(env);
  try {
    assert.match(s.token, /^[0-9a-f]{48}$/);
    const projects = (await s.call('/api/projects')).body;
    assert.ok(projects.find((p) => p.name === 'my-app').launchable);

    const spec = 'Add a "do it" button\n\nDone when: it does it & says so';
    const r = await s.call('/api/launch', { project: 'my-app', spec, skip: ['tester', 'reviewer'], mode: 'acceptEdits' });
    assert.strictEqual(r.status, 200);
    const id = r.body.id;

    const waiting = await until(async () => (await s.call('/api/launches?project=my-app')).body.find((j) => j.status === 'waiting'));
    assert.strictEqual(waiting.title, 'Add a "do it" button');
    assert.match(waiting.message, /Plan ready/);
    assert.match(waiting.plan, /Do it/);
    assert.strictEqual(fs.readFileSync(path.join(env.root, '.factory', 'state', 'dashboard-spec.md'), 'utf8'), spec + '\n');

    assert.strictEqual((await s.call('/api/reply', { id, text: 'Plan approved. Continue the run.' })).status, 200);
    const done = await until(async () => (await s.call('/api/launches?project=my-app')).body.find((j) => j.status === 'done'));
    assert.match(done.message, /finished/);

    const calls = fs.readFileSync(env.log, 'utf8').trim().split('\n').map(JSON.parse);
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0].input, '/factory:feature --skip tester,reviewer .factory/state/dashboard-spec.md');
    assert.ok(calls[0].args.includes('--session-id') && calls[0].args.includes(id));
    assert.ok(calls[1].args.includes('--resume') && calls[1].args.includes(id));
    assert.ok(calls[0].args.includes('acceptEdits'));
    assert.ok(!calls.some((c) => c.args.join(' ').includes('do it')), 'spec text never on the command line');
    assert.strictEqual(fs.realpathSync(calls[0].cwd), fs.realpathSync(env.root));

    assert.strictEqual((await s.call('/api/dismiss', { id })).status, 200);
    assert.strictEqual((await s.call('/api/launches?project=my-app')).body.length, 0);
  } finally { s.stop(); }
});

test('bug fix and security runs start their own commands', async () => {
  const env = setup();
  const s = await start(env);
  try {
    const bug = await s.call('/api/launch', { project: 'my-app', kind: 'bugfix', spec: 'Totals are off by one\nExpected 3, got 2', skip: ['reviewer'] });
    assert.strictEqual(bug.status, 200);
    assert.strictEqual(bug.body.title, 'Fix: Totals are off by one');
    await until(async () => (await s.call('/api/launches?project=my-app')).body.find((j) => j.id === bug.body.id && j.status !== 'running'));

    const sec = await s.call('/api/launch', { project: 'my-app', kind: 'security', spec: '' });
    assert.strictEqual(sec.status, 200, 'a security check needs no focus');
    assert.strictEqual(sec.body.title, 'Security check: whole project');
    await until(async () => (await s.call('/api/launches?project=my-app')).body.find((j) => j.id === sec.body.id && j.status !== 'running'));

    const calls = fs.readFileSync(env.log, 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepStrictEqual(calls.map((c) => c.input), ['/factory:bugfix --skip reviewer .factory/state/dashboard-spec.md', '/factory:security']);

    const bad = await s.call('/api/launch', { project: 'my-app', kind: 'bugfix', spec: 'x', skip: ['debugger'] });
    assert.strictEqual(bad.status, 400, 'the debugger is the bug fixer');
    assert.match(bad.body.error, /Only tester, reviewer/);
    assert.strictEqual((await s.call('/api/launch', { project: 'my-app', kind: 'bugfix', spec: '' })).status, 400, 'a bug fix needs a report');
    assert.strictEqual((await s.call('/api/launch', { project: 'my-app', kind: 'deploy', spec: 'x' })).status, 400);
    assert.strictEqual((await s.call('/api/launch', { project: 'my-app', kind: 'constructor', spec: 'x' })).status, 400);
  } finally { s.stop(); }
});

test('a run stopped from the dashboard shows as stopped', async () => {
  const env = setup();
  const s = await start(env);
  try {
    const r = await s.call('/api/launch', { project: 'my-app', kind: 'security', spec: '', skip: ['tester', 'debugger', 'reviewer'] });
    await until(() => fs.existsSync(env.log));
    assert.strictEqual((await s.call('/api/stop', { id: r.body.id })).status, 200);
    const job = await until(async () => (await s.call('/api/launches?project=my-app')).body.find((j) => j.status !== 'running'));
    assert.strictEqual(job.status, 'stopped');
  } finally { s.stop(); }
});

test('--stop stops the dashboard, and says so when none is running', async () => {
  const env = setup();
  const s = await start(env);
  const r = s.stopCmd();
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Factory dashboard stopped\./);
  await s.exited;
  const again = s.stopCmd();
  assert.match(again.stdout, /No factory dashboard is running/);
});

test('--stop refuses while a dashboard run works; --force stops both', async () => {
  const env = setup();
  const s = await start(env);
  try {
    const r = await s.call('/api/launch', { project: 'my-app', kind: 'security', spec: '', skip: ['tester', 'debugger', 'reviewer'] });
    await until(() => fs.existsSync(env.log));
    const refused = s.stopCmd();
    assert.strictEqual(refused.status, 1);
    assert.match(refused.stdout, /1 run\(s\) started from the dashboard are still working/);
    assert.strictEqual((await s.call('/api/ping')).body.working, 1, 'still running');

    const forced = s.stopCmd('--force');
    assert.strictEqual(forced.status, 0, forced.stdout + forced.stderr);
    assert.match(forced.stdout, /stopped, with 1 run\(s\)/);
    await s.exited;
    const job = JSON.parse(fs.readFileSync(path.join(env.home, '.factory', 'launches.json'), 'utf8')).find((j) => j.id === r.body.id);
    assert.strictEqual(job.status, 'stopped');
  } finally { s.stop(); }
});

test('starting a run needs the page token and this machine as Host', async () => {
  const env = setup();
  const s = await start(env);
  try {
    const body = { project: 'my-app', spec: 'x' };
    assert.strictEqual((await s.call('/api/launch', body, { 'x-factory-token': 'wrong' })).status, 403);
    assert.strictEqual((await s.call('/api/launches?project=my-app', null, { 'x-factory-token': '' })).status, 403);
    // A DNS-rebinding page reaches 127.0.0.1 under its own host name.
    const rebind = await new Promise((resolve) => {
      const req = require('node:http').request(s.base + '/', { agent: false, headers: { host: 'evil.example:80' } }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', () => {});
      req.end();
    });
    assert.strictEqual(rebind, 403);
    assert.ok(!fs.existsSync(env.log), 'claude never started');
  } finally { s.stop(); }
});

test('launch input is checked', async () => {
  const env = setup();
  const s = await start(env);
  try {
    assert.strictEqual((await s.call('/api/launch', { project: 'other', spec: 'x' })).status, 400, 'unregistered project');
    assert.strictEqual((await s.call('/api/launch', { project: 'gone', spec: 'x' })).status, 400, 'folder without config');
    assert.strictEqual((await s.call('/api/launch', { project: 'my-app', spec: '  ' })).status, 400, 'empty spec');
    const r = await s.call('/api/launch', { project: 'my-app', spec: 'x', skip: ['implementer'] });
    assert.strictEqual(r.status, 400);
    assert.match(r.body.error, /Only tester, debugger, reviewer, ui-checker/);
    assert.strictEqual((await s.call('/api/launch', { project: 'my-app', spec: 'x', mode: 'bypassPermissions' })).status, 400, 'no bypass from a web page');
    assert.ok(!fs.existsSync(env.log), 'claude never started');
  } finally { s.stop(); }
});

test('not on loopback: runs can be viewed but not started', async () => {
  const env = setup();
  const s = await start(env, { FACTORY_DASHBOARD_HOST: '0.0.0.0' });
  try {
    assert.strictEqual(s.token, '');
    assert.strictEqual((await s.call('/api/launch', { project: 'my-app', spec: 'x' })).status, 403);
    assert.ok(!(await s.call('/api/projects')).body.some((p) => p.launchable));
  } finally { s.stop(); }
});
