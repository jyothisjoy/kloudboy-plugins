'use strict';
// Hook tests: node --test "plugins/factory/hooks/test/*.test.js"
// Each test gets a throwaway project and a throwaway home folder, so nothing touches ~/.factory.
// Inputs mirror what Claude Code sends (observed in a real session, see docs/decisions.md):
// tool calls inside a subagent and SubagentStop carry agent_type ("factory:<name>") and agent_id.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const RUN = path.join(__dirname, '..', 'run.js');

function setup(config) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-test-'));
  const root = path.join(base, 'my-app');
  const home = path.join(base, 'home');
  fs.mkdirSync(path.join(root, '.factory'), { recursive: true });
  fs.mkdirSync(home);
  fs.writeFileSync(path.join(root, '.factory', 'config.yml'), config);
  return { root, home };
}

function spawnHook(env, event, input) {
  return cp.spawnSync(process.execPath, [RUN, event], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, HOME: env.home, USERPROFILE: env.home, CLAUDE_PLUGIN_ROOT: '' },
  });
}

function hook(env, event, input) {
  const res = spawnHook(env, event, { session_id: 's1', cwd: env.root, ...input });
  return { code: res.status, stderr: res.stderr, stdout: res.stdout };
}

function events(env) {
  const dir = path.join(env.home, '.factory', 'runs', 'my-app');
  return fs.readdirSync(dir).flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n').map(JSON.parse));
}

const state = (env, name) => fs.readFileSync(path.join(env.root, '.factory', 'state', name), 'utf8');
const file = (env, rel) => ({ file_path: path.join(env.root, ...rel.split('/')) });

const IMPL = { agent_type: 'factory:implementer', agent_id: 'i1' };

const BASE = [
  'project: my-app',
  'protected_paths: [.env*, prisma/migrations/**]',
  'ui:',
  '  lab_dir: app/_lab/',
];
const withVerify = (cmd, extra = []) => [...BASE, 'commands:', `  verify: ${cmd}`, ...extra].join('\n');

test('edit to a protected path is blocked with one actionable line', () => {
  const env = setup(BASE.join('\n'));
  const r = hook(env, 'pre-edit', { tool_name: 'Edit', tool_input: file(env, '.env.local') });
  assert.strictEqual(r.code, 2);
  assert.match(r.stderr, /"\.env\.local" is protected \(matches "\.env\*"/);
  assert.strictEqual(r.stderr.trim().split('\n').length, 1);

  const nested = hook(env, 'pre-edit', { tool_name: 'Write', tool_input: { file_path: 'prisma/migrations/001/migration.sql' } });
  assert.strictEqual(nested.code, 2);
});

test('edit to an ordinary path is allowed', () => {
  const env = setup(BASE.join('\n'));
  assert.strictEqual(hook(env, 'pre-edit', { ...IMPL, tool_name: 'Edit', tool_input: file(env, 'src/page.tsx') }).code, 0);
});

test('UI designer is held to the sandbox', () => {
  const env = setup(BASE.join('\n'));
  const ui = { agent_type: 'factory:ui-designer', agent_id: 'u1', tool_name: 'Write' };
  const out = hook(env, 'pre-edit', { ...ui, tool_input: file(env, 'src/app.css') });
  assert.strictEqual(out.code, 2);
  assert.match(out.stderr, /ui-designer may only write app\/_lab\/ or design\/; "src\/app\.css"/);
  assert.strictEqual(hook(env, 'pre-edit', { ...ui, tool_input: file(env, 'app/_lab/a/page.tsx') }).code, 0);
  assert.strictEqual(hook(env, 'pre-edit', { ...ui, tool_input: file(env, 'design/research/direction.md') }).code, 0);
});

test('planner and reviewer may write only their own file', () => {
  const env = setup(BASE.join('\n'));
  const edit = (agent, rel) => hook(env, 'pre-edit', { agent_type: agent, agent_id: 'x', tool_name: 'Write', tool_input: file(env, rel) });
  assert.strictEqual(edit('factory:planner', '.factory/plan.md').code, 0);
  const r = edit('factory:planner', 'src/index.ts');
  assert.strictEqual(r.code, 2);
  assert.match(r.stderr, /planner may only write \.factory\/plan\.md; "src\/index\.ts"/);
  assert.strictEqual(edit('factory:reviewer', '.factory/review.md').code, 0);
  assert.strictEqual(edit('factory:reviewer', '.factory/plan.md').code, 2);
  assert.strictEqual(edit('planner', 'src/index.ts').code, 2, 'a project override of the planner keeps the limit');
  assert.strictEqual(hook(env, 'pre-edit', { tool_name: 'Write', tool_input: file(env, 'src/index.ts') }).code, 0, 'main session is not limited');
});

test('verify passes: handoff allowed and recorded', () => {
  const env = setup(withVerify('node -e "process.exit(0)"'));
  assert.strictEqual(hook(env, 'subagent-stop', IMPL).code, 0);
  assert.strictEqual(JSON.parse(state(env, 'last-verify.json')).ok, true);
});

test('verify fails: agent sent back, then the gate gives up after max retries', () => {
  const env = setup(withVerify(`node -e "console.log('boom'); process.exit(1)"`, ['gates:', '  max_verify_retries: 2']));
  const first = hook(env, 'subagent-stop', IMPL);
  assert.strictEqual(first.code, 2);
  assert.match(first.stderr, /verify failed \(attempt 1 of 2\)/);
  assert.match(first.stderr, /boom/);

  const second = hook(env, 'subagent-stop', { ...IMPL, stop_hook_active: true });
  assert.strictEqual(second.code, 0, 'gives up instead of looping forever');
  const rec = JSON.parse(state(env, 'last-verify.json'));
  assert.strictEqual(rec.ok, false);
  assert.strictEqual(rec.gaveUp, true);
  assert.strictEqual(rec.attempts, 2);
});

test('a new subagent starts with fresh verify attempts', () => {
  const env = setup(withVerify('node -e "process.exit(1)"', ['gates:', '  max_verify_retries: 2']));
  assert.strictEqual(hook(env, 'subagent-stop', IMPL).code, 2);
  assert.strictEqual(hook(env, 'subagent-stop', { ...IMPL, agent_id: 'i2' }).code, 2, 'attempt 1 again, not a give-up');
});

test('agents without a gate are not verified', () => {
  const env = setup(withVerify('node -e "process.exit(1)"'));
  assert.strictEqual(hook(env, 'subagent-stop', { agent_type: 'factory:planner', agent_id: 'p1' }).code, 0);
});

test('events are written without command text', () => {
  const env = setup(withVerify('node -e "process.exit(0)"'));
  hook(env, 'pre-agent', { tool_name: 'Agent', tool_input: { subagent_type: 'factory:implementer' } });
  hook(env, 'post-tool', { ...IMPL, tool_name: 'Bash', tool_input: { command: 'API_KEY=secret123 pnpm test --token secret123' } });
  hook(env, 'post-tool', { ...IMPL, tool_name: 'Edit', tool_input: file(env, 'src/a.ts') });
  hook(env, 'post-tool', { tool_name: 'Bash', tool_input: { command: 'git status' } });
  hook(env, 'subagent-stop', IMPL);
  hook(env, 'stop', {});

  const evs = events(env);
  assert.deepStrictEqual(evs.map((e) => e.type), ['agent_start', 'tool', 'tool', 'tool', 'agent_stop', 'run_end']);
  assert.strictEqual(evs[0].agent, 'implementer');
  assert.strictEqual(evs[1].bin, 'pnpm');
  assert.strictEqual(evs[2].path, 'src/a.ts');
  assert.strictEqual(evs[3].agent, 'orchestrator');
  assert.strictEqual(evs[4].result, 'verify_passed');
  assert.ok(!JSON.stringify(evs).includes('secret123'), 'no command text or secrets in events');
});

test('agent_stop carries tokens from the subagent transcript, each message counted once', () => {
  const env = setup(BASE.join('\n'));
  const transcript = path.join(env.root, 'agent.jsonl');
  const msg = (id, usage) => JSON.stringify({ type: 'assistant', message: { id, usage } });
  fs.writeFileSync(transcript, [
    JSON.stringify({ type: 'user', message: { content: 'hi' } }),
    msg('m1', { input_tokens: 10, cache_read_input_tokens: 100, output_tokens: 5 }),
    msg('m1', { input_tokens: 10, cache_read_input_tokens: 100, output_tokens: 5 }),
    msg('m2', { input_tokens: 1, cache_creation_input_tokens: 20, output_tokens: 4 }),
  ].join('\n'));
  hook(env, 'subagent-stop', { agent_type: 'factory:planner', agent_id: 'p1', agent_transcript_path: transcript });
  assert.strictEqual(events(env).find((e) => e.type === 'agent_stop').tokens, 140);
});

test('fast check failure is fed back after the edit', () => {
  const check = `node -e "const f = process.argv[1]; if (f.includes('bad')) { console.log('lint: ' + f); process.exit(1); }"`;
  const env = setup([...BASE, 'commands:', `  fast_check: ${check}`].join('\n'));
  const edit = (rel) => hook(env, 'post-tool', { ...IMPL, tool_name: 'Edit', tool_input: file(env, rel) });
  assert.strictEqual(edit('src/good.ts').code, 0);
  const r = edit('src/bad.ts');
  assert.strictEqual(r.code, 2);
  assert.match(r.stderr, /fast check failed on "src\/bad\.ts"/);
  assert.match(r.stderr, /lint: src\/bad\.ts/);
  assert.strictEqual(edit('.factory/bad.md').code, 0, 'factory files are not checked');
  assert.strictEqual(edit('src/bad"&x.ts').code, 0, 'paths with shell characters are never put in a command line');
  assert.ok(events(env).some((e) => e.result === 'fast_check_failed' && e.path === 'src/bad.ts'));
});

test('session start warns when factory_version differs from the plugin', () => {
  const version = require('../../.claude-plugin/plugin.json').version;
  const old = setup([...BASE, 'factory_version: 0.0.1'].join('\n'));
  const r = hook(old, 'session-start', {});
  assert.strictEqual(r.code, 0);
  assert.match(JSON.parse(r.stdout).systemMessage, new RegExp(`factory_version 0\\.0\\.1 but factory ${version.replace(/\./g, '\\.')} is installed`));

  const same = setup([...BASE, `factory_version: ${version}`].join('\n'));
  assert.strictEqual(hook(same, 'session-start', {}).stdout, '');
});

test('dashboard mode off writes no events', () => {
  const env = setup([...BASE, 'dashboard:', '  mode: off'].join('\n'));
  hook(env, 'stop', {});
  assert.ok(!fs.existsSync(path.join(env.home, '.factory', 'runs')));
});

test('no factory config: hooks do nothing', () => {
  const env = setup('');
  fs.rmSync(path.join(env.root, '.factory'), { recursive: true });
  assert.strictEqual(hook(env, 'pre-edit', { tool_name: 'Edit', tool_input: file(env, '.env') }).code, 0);
});
