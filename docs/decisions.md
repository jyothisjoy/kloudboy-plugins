# Decisions

Decisions that change or clarify [PRD.md](PRD.md). Newest first. A decision here overrides the PRD.
Format: date · decision · why.

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
