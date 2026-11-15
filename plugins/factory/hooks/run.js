#!/usr/bin/env node
'use strict';
// Factory hook entry point: `node run.js <event>` with the hook's JSON on stdin.
// Exit 0 = allow. Exit 2 + one line on stderr = block (Claude sees the reason).
// Any unexpected error is logged to ~/.factory/hook-errors.log and the hook allows: the factory
// must never break a session because of its own bug.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const c = require('./lib/common');

const GATED_AGENTS = ['implementer', 'tester', 'debugger'];
const PLUGIN_VERSION = (() => {
  try { return require('../.claude-plugin/plugin.json').version; } catch { return ''; }
})();

function block(msg) {
  process.stderr.write(msg + '\n');
  process.exit(2);
}

function agentName(raw) {
  return String(raw || '').replace(/^factory:/, '').trim();
}

// Tool calls inside a subagent carry agent_type; calls from the main session don't.
function agentOf(input) {
  return agentName(input.agent_type) || 'orchestrator';
}

// Paths each restricted agent may write with Edit/Write. A path ending in "/" is a folder.
function writeAllowList(agent, cfg) {
  const lab = String((cfg.ui && cfg.ui.lab_dir) || 'app/_lab/').replace(/\\/g, '/').replace(/^\.\//, '');
  return {
    planner: ['.factory/plan.md'],
    reviewer: ['.factory/review.md'],
    'ui-checker': ['.factory/review.md', '.factory/state/'],
    'ui-designer': [lab.endsWith('/') ? lab : lab + '/', 'design/'],
  }[agent] || null;
}

async function main() {
  const event = process.argv[2];
  const input = await c.readStdin();
  const root = c.findRoot(input.cwd || process.cwd());

  if (event === 'session-start') {
    if (process.env.CLAUDE_PLUGIN_ROOT) {
      fs.mkdirSync(c.HOME_DIR, { recursive: true });
      fs.writeFileSync(path.join(c.HOME_DIR, 'plugin-root'), process.env.CLAUDE_PLUGIN_ROOT);
    }
    const cfg = root && c.loadConfig(root);
    const want = cfg && cfg.factory_version ? String(cfg.factory_version) : '';
    if (want && PLUGIN_VERSION && want !== PLUGIN_VERSION) {
      const msg = `Factory: .factory/config.yml says factory_version ${want} but factory ${PLUGIN_VERSION} is installed. Read the release notes in the factory's docs/decisions.md, then update the plugin or factory_version.`;
      process.stdout.write(JSON.stringify({ systemMessage: msg, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: msg } }));
    }
    if (cfg && cfg.dashboard && cfg.dashboard.autostart === true && cfg.dashboard.mode !== 'off') {
      const server = path.join(__dirname, '..', 'dashboard', 'server.js');
      cp.spawnSync(process.execPath, [server, '--detach'], { stdio: 'ignore', timeout: 5000 });
    }
    return;
  }

  if (!root) return; // factory not set up in this project: do nothing
  const cfg = c.loadConfig(root) || {};
  const session = input.session_id;

  if (event === 'pre-edit') {
    const ti = input.tool_input || {};
    const rel = c.toRel(root, ti.file_path || ti.notebook_path || ti.path);
    if (!rel) return;
    const hit = !rel.startsWith('..') && c.matchAny(rel, cfg.protected_paths);
    if (hit) {
      block(`Factory: "${rel}" is protected (matches "${hit}" in .factory/config.yml protected_paths). Don't edit it; report that the task needs it.`);
    }
    const agent = agentOf(input);
    const allowed = writeAllowList(agent, cfg);
    if (allowed && !allowed.some((p) => (p.endsWith('/') ? rel.startsWith(p) : rel === p))) {
      block(`Factory: the ${agent} may only write ${allowed.join(' or ')}; "${rel}" is not allowed.`);
    }
    return;
  }

  if (event === 'pre-agent') {
    const agent = agentName(input.tool_input && input.tool_input.subagent_type);
    c.writeState(root, 'current-agent', agent);
    await c.emit(cfg, root, { type: 'agent_start', session, agent });
    return;
  }

  if (event === 'post-tool') {
    const ti = input.tool_input || {};
    const agent = agentOf(input);
    if (input.tool_name === 'Bash') {
      // Only the program name: command lines can carry secrets.
      const words = String(ti.command || '').trim().split(/\s+/).filter((w) => !/^\w+=/.test(w));
      const name = (words[0] || '').replace(/^.*[\\/]/, '');
      const bin = /^[\w.+-]{1,40}$/.test(name) ? name : 'command';
      await c.emit(cfg, root, { type: 'tool', session, agent, tool: 'Bash', bin });
    } else {
      const rel = c.toRel(root, ti.file_path || ti.notebook_path || ti.path);
      await c.emit(cfg, root, { type: 'tool', session, agent, tool: input.tool_name, path: rel });
      const fast = cfg.commands && cfg.commands.fast_check;
      // The path goes into a shell command line, so only plain file names are checked.
      const plain = /^[\w./@+ -]+$/.test(rel) && !rel.startsWith('-');
      if (fast && plain && !rel.startsWith('..') && !rel.startsWith('.factory/')) {
        const res = cp.spawnSync(`${fast} "${rel}"`, { cwd: root, shell: true, encoding: 'utf8', timeout: 45000 });
        if (res.status !== 0 || res.error) {
          await c.emit(cfg, root, { type: 'gate', session, agent, check: 'fast', result: 'fast_check_failed', path: rel });
          const out = ((res.stdout || '') + (res.stderr || '') + (res.error ? res.error.message : '')).trim().slice(-1500);
          // PostToolUse runs after the edit, so exit 2 is feedback to the agent, not a block.
          block(`Factory fast check failed on "${rel}" (\`${fast}\`): fix it before moving on. Output tail:\n${out}`);
        }
      }
    }
    return;
  }

  if (event === 'subagent-stop') {
    const agent = agentName(input.agent_type) || c.readState(root, 'current-agent') || 'unknown';
    const tokens = transcriptTokens(input.agent_transcript_path);
    const verify = cfg.commands && cfg.commands.verify;
    const gates = cfg.gates || {};
    if (!GATED_AGENTS.includes(agent) || gates.verify_required === false || !verify) {
      c.clearState(root, 'current-agent');
      await c.emit(cfg, root, { type: 'agent_stop', session, agent, tokens, result: 'done' });
      return;
    }

    const fingerprint = treeFingerprint(root);
    if (fingerprint && fingerprint === c.readState(root, 'verified-tree')) {
      c.clearState(root, 'current-agent');
      await c.emit(cfg, root, { type: 'agent_stop', session, agent, tokens, result: 'verify_passed', cached: true });
      return;
    }

    const started = Date.now();
    const res = cp.spawnSync(String(verify), {
      cwd: root, shell: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
      timeout: (Number(gates.verify_timeout_s) || 600) * 1000,
    });
    const ok = res.status === 0 && !res.error;
    const output = ((res.stdout || '') + (res.stderr || '') + (res.error ? `\n${res.error.message}` : '')).slice(-4000);
    const record = { ok, agent, command: String(verify), at: new Date().toISOString(), ms: Date.now() - started, output };

    if (ok) {
      if (fingerprint) c.writeState(root, 'verified-tree', fingerprint);
      c.writeState(root, 'last-verify.json', record);
      c.clearState(root, 'current-agent');
      await c.emit(cfg, root, { type: 'agent_stop', session, agent, tokens, result: 'verify_passed' });
      return;
    }

    // Count attempts per subagent: a subagent sent back keeps its agent_id when it stops again.
    const prev = c.readStateJson(root, 'verify-attempts') || {};
    const id = input.agent_id || agent;
    const attempts = (prev.id === id ? Number(prev.n) || 0 : 0) + 1;
    c.writeState(root, 'verify-attempts', { id, n: attempts });
    const max = Number(gates.max_verify_retries) || 2;
    if (attempts < max) {
      c.writeState(root, 'last-verify.json', { ...record, attempts });
      await c.emit(cfg, root, { type: 'gate', session, agent, result: 'verify_failed', attempt: attempts });
      block(`Factory verify failed (attempt ${attempts} of ${max}): \`${verify}\`. Fix the failure and finish again. Output tail:\n${output.slice(-1500)}`);
    }
    c.writeState(root, 'last-verify.json', { ...record, attempts, gaveUp: true });
    c.clearState(root, 'current-agent');
    await c.emit(cfg, root, { type: 'agent_stop', session, agent, tokens, result: 'verify_failed', attempt: attempts });
    return;
  }

  if (event === 'stop') {
    await c.emit(cfg, root, { type: 'run_end', session });
  }
}

// Tokens the subagent used (input incl. cache + output), read from its transcript. A streamed
// message is written once per content block with the same id, so each id counts once.
function transcriptTokens(file) {
  if (!file) return undefined;
  try {
    const byId = new Map();
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.includes('"usage"')) continue;
      const m = JSON.parse(line).message;
      if (m && m.usage) byId.set(m.id || byId.size, m.usage);
    }
    let n = 0;
    for (const u of byId.values()) {
      n += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.output_tokens || 0);
    }
    return n || undefined;
  } catch { return undefined; }
}

// Hash of uncommitted changes + untracked files, so an unchanged tree isn't verified twice.
function treeFingerprint(root) {
  const git = (args) => cp.spawnSync('git', args, { cwd: root, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  const diff = git(['diff', 'HEAD']);
  if (diff.status !== 0) return null;
  const h = crypto.createHash('sha1').update(diff.stdout);
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']);
  for (const f of String(untracked.stdout || '').split('\0').filter((f) => f && !f.startsWith('.factory/state/'))) {
    h.update(f);
    try { h.update(fs.readFileSync(path.join(root, f))); } catch { /* unreadable: name only */ }
  }
  return h.digest('hex');
}

main().catch((err) => { c.logError(err); process.exit(0); });
