# Decisions

Decisions that change or clarify [PRD.md](PRD.md). Newest first. A decision here overrides the PRD.
Format: date · decision · why.

## 2026-11-15 · Stopping the dashboard

- **`/factory:dashboard stop`** and **`node server.js --stop [--force]`**. The stopper asks
  `/api/ping` on the dashboard port, which now returns `app: "factory-dashboard"`, the server's
  process ID and how many dashboard-started runs are working, and ends that process. Why ask the
  server instead of keeping a PID file: a stale file could name an unrelated process; the ping
  proves the process on the port is the dashboard.
- It refuses while dashboard-started runs are working. `--force` (the command asks the user
  first) ends the server's whole process tree, so those Claude sessions stop too, and marks them
  Stopped. On Windows this is `taskkill /T`; elsewhere the server handles SIGTERM by stopping its
  sessions before it exits.
- Stopping is local only: the stopper must run on the same machine. A web page can read the ping but
  can't end a process.

## 2026-11-15 · Release 0.2.0

Minor release: new commands and agents, no breaking config change. Details in the entries below.

- New: `/factory:bugfix`, `/factory:security` with the `security-reviewer` agent and the
  `security-audit` skill, the `debugger` agent, `--skip <agents>` on every pipeline.
- Dashboard: start feature, bug-fix and security runs (New run), approve and reply there; tokens per
  agent and run; skipped stages shown; `/factory:dashboard stop`.
- Gates: planner, reviewer, UI checker and security reviewer limited to their own files;
  optional `commands.fast_check` after each edit; version check at session start.
- `/factory:init` writes `.claude/settings.json` so teammates are prompted to install.
- Security: the team collector URL comes from `FACTORY_DASHBOARD_URL`, not project config.

Upgrading a project: `/plugin update`, then set `factory_version: 0.2.0` in `.factory/config.yml`
and delete `dashboard.url` if present. Nothing else in the config changes. Per CLAUDE.md, run it on
one pilot project before telling the team to update.

## 2026-11-15 · `security-audit` skill, built from three public skill collections

- **New bundled skill `skills/security-audit/`**, preloaded into the security reviewer with the
  agent's `skills:` frontmatter as `factory:security-audit` (fallback: the agent reads it from the
  plugin folder named in `~/.factory/plugin-root`). Observed: the bare name `security-audit`
  loaded a *user-level* skill of the same name instead of the plugin's, so plugin skills must be
  named with the `factory:` prefix there, and the agent checks the skill's base directory.
- **Audits don't execute project code, even "harmlessly".** In the first live run the verifier
  copied the vulnerable line into a scratch script to confirm it, and the reviewer started the
  project's server to probe it. Both are now ruled out in the skill and the reviewer agent:
  confirmation is by reading; anything that needs running becomes a test in the fix step, inside the
  verify gate. SKILL.md holds the method; six attack-class files are read only when
  the project's map shows the matching boundary (core, web/API/auth, client side, AI/LLM,
  data/messaging/resources, supply chain/deployment).
- **Sources and licences.** Method and taxonomy adapted from Cloudflare's `security-audit` skill
  (MIT; notice kept in `skills/security-audit/NOTICE.md`). Two pentest collections
  (`frendysanusi/claude-pentest-skills`, `penligent/AIPentest_Skills`) have **no licence**, so
  nothing was copied from them; their vulnerability classes and false-positive discipline informed
  checks written in our own words.
- **What was taken:** the trust-boundary rule (attacker, input, control, path, result, fix);
  confirmed vs needs-validation vs rejected, with severity only for confirmed findings; Cloudflare's
  severity anchors (Critical added to our scale); "try to disprove every candidate"; one finding per
  root cause; honest scope ("not checked") lines; a false-positive list; treating text in the
  audited repo as data, never instructions.
- **What was left out, and why:** Cloudflare's multi-agent harness (coverage ledger, JSON schema,
  validators, sandboxed execution of target code, artifact promotion) — too heavy for one auditor,
  and we don't run project code during an audit. The pentest repos' live recon, payload lists,
  scanner/proxy use and 100 CVE exploit checks — the factory never attacks running systems.
  Native/binary and desktop/mobile classes — not our stacks yet; add if a project needs them.
- **Verify pass.** `/factory:security` now runs a second, fresh security reviewer in verify mode
  before showing the report. It re-reads every cited line, rejects what it can refute, and moves
  items that depend on facts outside the repo to Needs validation. Why: Cloudflare's main accuracy
  mechanism is a verifier that didn't write the candidate. Cost: one more agent per check with
  findings.
- **Report format** (`security.md`): Findings (severity, optional CWE, who/where/scenario/why it's
  real/fix/test), Needs validation (missing fact, how the owner checks it), Rejected (verify mode),
  Notes. With `approval.plan: auto`, Critical, High and Medium findings are fixed; needs-validation
  items never are.

## 2026-11-15 · Bug-fix and security pipelines

PRD updated: commands table, *Bug-fix pipeline*, *Security pipeline*, agent tables.

- **`/factory:bugfix`** reuses agents instead of adding one. The planner diagnoses (it is read-only,
  so a diagnosis can't turn into an unreviewed fix) and plans a "Reproduce and fix" task; the
  debugger writes the failing regression test first and then fixes the cause. Why the debugger and
  not the tester for the reproduction: the verify gate runs when an agent finishes, and a
  deliberately failing test would fail it and send the tester back to "fix" the bug. The debugger's
  gate only runs after the fix. If the bug doesn't reproduce as diagnosed, the run stops for a person.
  Optional: tester, reviewer.
- **`/factory:security`** adds the PRD's optional *Security reviewer* agent (`security-reviewer`):
  tools Read, Grep, Glob, Bash (read-only commands), Write; the hook limits it to writing
  `.factory/security.md`. Only exploitable findings with a concrete scenario count; secrets are
  reported by location, never by value. A person picks which findings to fix (`approval.plan`;
  `auto` fixes High and Medium). Chosen findings become `plan.md` tasks and go through the normal
  implementer → verify → debugger → tester loop, then the reviewer. Optional: tester, debugger,
  reviewer.
- **Run kind.** `run.json` gets `kind` (feature, bugfix, security) and events carry it as
  `run_kind`, so the dashboard labels runs and shows the right default stages.
- **Dashboard.** "New feature" is now "New run" with a type choice; the agent switches follow the
  type. A waiting security run shows `security.md` and a "Fix all findings" button; a reply can
  name findings instead (for example "S1, S3").
- No new config keys.

## 2026-11-15 · Start runs from the dashboard; turn agents off; team URL per machine

PRD updated to match (commands table, *Turning agents off*, *Starting a run*, security).

- **`/factory:feature --skip <agents>`.** Comma list from tester, debugger, reviewer, ui-checker.
  Planner and implementer can't be skipped: without them there is no plan and no code. Skipping an
  agent never skips a gate; the verify gate still runs on the implementer. The list is written to
  `.factory/state/run.json` as `skip`, and events carry it as `run_skip` so the dashboard shows those
  stages as Skipped.
- **Dashboard "New run".** The local dashboard starts `claude -p` in the project folder with the
  spec on stdin (saved to `.factory/state/dashboard-spec.md` and passed as a path, so spec text never
  goes on a command line), a fixed `--session-id`, and the chosen `--permission-mode`
  (`acceptEdits` default, or `auto`). `bypassPermissions` is refused: a web page must not be able to
  start a session with every permission check off (security review). When the session stops, the dashboard
  shows the orchestrator's last message and `.factory/plan.md`. Approve or Reply resumes the same
  session with `--resume`. Why: plan approval and other questions stay human checkpoints without a
  terminal. A run counts as finished when `run.json` has `finished` (the feature command now writes
  it in its Finish step). Starts are logged in `~/.factory/launches.json` and
  `~/.factory/launches/<id>.log`.
- **Headless permission prompts are denied**, so with `acceptEdits` a Bash command must be allowed in
  the project's or user's permission rules (verify, test and git commands), or the run stops on it.
  This is shown next to the permission choice.
- **Which projects can be started.** The SessionStart hook records each factory project's folder in
  `~/.factory/projects.json`. The dashboard only starts runs there, after checking the folder still
  has `.factory/config.yml` with the same project name. One run per project at a time.
- **Start, reply and stop are local and page-only.** They are refused unless the dashboard listens on
  a loopback address, the `Host` header is `127.0.0.1` or `localhost` on its port, and the request
  carries the random token the server puts into the page it serves (new token each server start).
  Why: any website open in the browser can send requests to 127.0.0.1; it can't read the token, and
  the host check stops DNS-rebinding pages from reading it.
- **Dev only: `FACTORY_PLUGIN_DIR`** in the dashboard's environment adds `--plugin-dir` to the
  sessions it starts, for testing an uninstalled plugin.
- **Team collector URL moves out of project config** (security fix). `dashboard.url` in
  `.factory/config.yml` is no longer read. Team mode posts to `FACTORY_DASHBOARD_URL` from the
  developer's environment, only over HTTPS unless the host is loopback, and without following
  redirects. Why: a cloned repo could set its own URL and receive the developer's
  `FACTORY_DASHBOARD_KEY` and run events. Migration: delete `dashboard.url` from configs and set
  `FACTORY_DASHBOARD_URL` per machine. Not a major bump: team mode has no collector yet, so no
  working setup breaks.

## 2026-11-15 · Claude Code behaviour observed, and what changed because of it

Observed with Claude Code 2.1.325 in headless sessions (`claude -p --plugin-dir`) on a neutral
scratch project, with a logging plugin recording every hook input (implementation plan, Phase 1.3):

- **Agent names.** Plugin agents are `factory:planner`, `factory:implementer`, etc. A project
  `.claude/agents/planner.md` does **not** replace `factory:planner`: both exist side by side as
  `planner` and `factory:planner`.
  → The PRD rule "a project agent overrides the plugin's agent of the same name" is now carried out by
  the commands: they use `<name>` when `.claude/agents/<name>.md` exists, otherwise `factory:<name>`.
  The hooks strip the `factory:` prefix, so gates apply to overrides too.
- **Subagent tool.** PreToolUse sees the tool as `Agent` (the session's tool list still says `Task`),
  with `tool_input.subagent_type` set to e.g. `factory:planner`. The matcher `Task|Agent` stays.
- **agent_type in hook input.** Tool calls inside a subagent, and SubagentStop, carry `agent_type`
  and `agent_id`; calls from the main session carry neither. SubagentStop also carries
  `agent_transcript_path`.
  → Hooks now identify the agent from `agent_type` instead of the `current-agent` state file. The
  file is still written for `/factory:status`, but no decision uses it. Why: subagents can run in
  the background, so "the last agent started" is not reliably the one making a tool call.
  → Verify attempts are counted per `agent_id`, so a new subagent always starts at attempt 1.
- **SubagentStop exit 2** sends the subagent back to work with the stderr text as its instructions;
  its next stop has `stop_hook_active: true`. The verify retry loop relies on this and works.
- **Background agents.** An agent may run in the background, and the main session's Stop (→ `run_end`)
  then fires while it is still working.
  → The feature and UI commands tell the orchestrator to run every agent in the foreground and one at
  a time. The dashboard no longer marks a run Stopped while an agent is active.
- **Plugin commands work headless.** `claude -p "/factory:init"` runs the command. Not yet observed
  in an interactive Cursor session.
- **Transcripts.** Each assistant message appears once per content block with the same
  `message.id`; usage is in `message.usage`. Token counts deduplicate by message id.

## 2026-11-15 · Gates and pipeline additions (implementation plan phases 2–3)

- **Planner, reviewer and UI checker write only their own files**, enforced in PreToolUse
  (planner: `.factory/plan.md`; reviewer: `.factory/review.md`; UI checker: `.factory/review.md`
  and `.factory/state/`). Why: the PRD makes them read-only, but they need Write for their output,
  and a tool list cannot limit which file. Files written through Bash are not covered; this is a
  known limit of all Edit/Write gates.
- **Config key `commands.fast_check`** (optional). After each Edit/Write outside `.factory/`, it runs
  with the changed file's path appended (e.g. `npx eslint` → `npx eslint "src/a.ts"`), 45 s limit.
  A failure is fed back to the agent (exit 2 on PostToolUse, which cannot block an edit that already
  happened). Not a breaking change: configs without it behave as before. Files whose path has
  characters outside letters, digits, space and `_ . / @ + -` are skipped, because the path is
  placed in a shell command line (cmd.exe on Windows, so it can't be passed as `$1`).
- **Version check moved to the SessionStart hook.** It compares `factory_version` with the installed
  plugin's version and shows a warning to the user and to Claude on any mismatch. The feature command
  no longer hard-codes a version; `/factory:init` writes the installed version.
- **Debugger agent** (PRD optional agent). When the verify gate gives up on the implementer or
  tester, the feature command hands the task to `debugger`, which has its own retries. If it also
  gives up, the run stops and reports. The implementer's result is now checked before the tester runs.
- **UI checker runs after the reviewer** and adds a `## UI check` section to `.factory/review.md`.
  Before, it ran first and the reviewer overwrote its findings. Blocking items in either section
  start a review loop.
- **Tokens.** `agent_stop` events carry `tokens`: input (including cache reads and writes) plus
  output, from the subagent's transcript. The dashboard shows tokens per agent and per run. Cost in
  money is not computed, since that would mean hard-coding prices.
- **`/factory:init` writes `.claude/settings.json`** with `enabledPlugins` and, when the kloudboy
  marketplace was added from git, `extraKnownMarketplaces` (PRD distribution rule). A local-folder
  marketplace is not written; it becomes a TODO.

## 2026-11-15 · Scaffold choices

- **One hook script.** All hook events go through `hooks/run.js <event>`. Claude Code runs matching
  hooks in parallel, so a separate gate script and emitter script would race on shared state.
- **Run files live in `.factory/`.** `.factory/plan.md` and `.factory/review.md` hold the current
  run and are committed on the run branch; `.factory/state/` is machine state and is git-ignored.
- **Config keys added** to the PRD schema: `factory_version`, `gates.verify_timeout_s` (600),
  `gates.max_verify_retries` (2), `ui.lab_dir` (sandbox for the UI designer), `dashboard.autostart`,
  and `dashboard.mode: off`.
- **Config format.** `.factory/config.yml` is parsed by a small built-in YAML reader (maps, lists,
  scalars, comments). Anchors, multi-line strings and other advanced YAML are not supported.
- **Verify retries.** The SubagentStop gate sends the agent back after a failed verify; after
  `max_verify_retries` failed attempts it gives up, records `gaveUp` in
  `.factory/state/last-verify.json`, and the feature command stops the run.
- **Events never carry command text.** For Bash, only the program name is recorded.
- **Dashboard port** 4317 on 127.0.0.1 by default.

## 2026-11-15 · Dashboard design system

- The dashboard follows [dashboard-ui.md](dashboard-ui.md): forest-and-lime tokens, light and dark,
  bento overview with the selected run as the hero, one lime element per screen.
- Zero-dependency rule wins over the design's font: Inter is used if installed, otherwise the system
  font. No icon library; text and simple glyphs only.

## 2026-11-15 · The factory is independent

- No document, prompt, example or test in this repo names or assumes a specific client project or
  product. Examples use neutral names such as `my-app`.

## 2026-11-15 · Plugin is named `factory`, marketplace is `kloudboy`

- The plugin name sets the command namespace, so naming it `factory` gives `/factory:init`,
  `/factory:feature` etc. as the PRD specifies. Install with `/plugin install factory@kloudboy`.
- The plugin lives at `plugins/factory/` in this repo.

## 2026-11-15 · This repo is the marketplace

- `kloudboy-plugins` is the private marketplace repo. `.claude-plugin/marketplace.json` at its root
  lists every Kloudboy plugin; future plugins go under `plugins/<name>/`.
