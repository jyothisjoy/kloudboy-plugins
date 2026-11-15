# Kloudboy Software Factory — PRD

As of 15 Nov 2026 · Owner: Jyothis Joy · Live, editable version: [Kloudboy Software Factory — PRD](https://claude.ai/artifact/99LJ6dRJLy7jtBgmTPV1eB)

> This file is the copy coding agents read. Edit the live doc first, then update this file to match.
> Decisions made after this PRD live in [decisions.md](decisions.md) and override it.

## Overview

The Kloudboy Software Factory is one Claude Code plugin, installed once per machine, that turns a written spec into planned, built, tested and reviewed code in any project. The plugin holds the process; each project holds its own facts in a small committed config.

**Problem.** Every project today gets AI help in an ad-hoc way: prompts, conventions and checks live in individual heads and chats. Quality varies by who ran it, nothing is visible to the team, and lessons learned in one repo never reach the next.

**Vision.** A repeatable assembly line: `/factory:feature <spec>` in any repo runs a planner, implementer, tester and reviewer with hard quality gates, shows every run on a dashboard, and improves for all projects with one plugin update.

## Goals, non-goals and users

**Goals**

1. One install, any project: the same plugin works on Next.js/Prisma apps, WordPress sites and static builds through per-project config.
2. Verified output: no task is marked done until the project's verify gate passes.
3. Visible runs: every run, stage, retry and cost shows on a dashboard.
4. Human control at the decisions that matter: plan approval, UI direction choice, merge.
5. Compounding improvement: a fix to an agent prompt or skill reaches every project through a plugin update.

**Non-goals (v1)**

- Auto-merging to main or deploying to production.
- Replacing human code review on client-facing releases.
- Supporting tools other than Claude Code.
- A public marketplace; distribution stays private to the team.

**Users**

| User | What they do with it |
| --- | --- |
| Developers at Kloudboy | Run features and fixes through the factory in their projects |
| Tech lead / CTO | Approves plans, owns the plugin, watches the team dashboard |
| Designers | Supply moodboards and pick UI directions |
| CI / scheduled runs | Run the factory headless on labelled issues or queued specs |

## Architecture

The system has three parts: a plugin that is identical everywhere, a few committed files in each project, and a dashboard that collects run events.

```
┌─ Plugin · installed once per machine, same everywhere ─────────────────┐
│  Agents          Commands                    Skills                    │
│  Hooks           Event emitter               Local viewer              │
└───────────────────────────────┬────────────────────────────────────────┘
                                │ runs inside the open project
┌─ Each project · init once, committed ─┐        ┌─ Dashboard ────────────┐
│  .factory/config.yml   CLAUDE.md      │ ─────▶ │  Local (this machine)  │
│  plan.md               code + tests   │ events │  Team (optional)       │
└───────────────────────────────────────┘        └────────────────────────┘
```

The plugin never stores project facts; it reads them from the open project's config and CLAUDE.md, writes `plan.md` and code there, and emits events to the dashboard.

## Agents

Four core agents ship in v1; the rest are added only when a real failure calls for them. The orchestrator is not an agent file: it is the main Claude session running a command. Subagents start with fresh context and hand work to each other only through files.

**Core agents**

| Agent | Job | Tools | Reads | Writes |
| --- | --- | --- | --- | --- |
| Planner | Spec into small tasks with acceptance criteria | Read-only | Spec, CLAUDE.md, code | `plan.md` |
| Implementer | Builds one task, runs the verify gate | Read, Edit, Write, Bash | `plan.md`, config, code | Code, task tick |
| Tester | Writes and runs tests against acceptance criteria | Read, Edit, Write, Bash | `plan.md`, diff | Tests, results |
| Reviewer | Fresh-eyes review of the full diff | Read-only + `git diff` | Diff, CLAUDE.md, plan | `review.md` |

**Optional agents**

| Agent | Add it when |
| --- | --- |
| UI designer | A spec involves new screens or a redesign (see UI R&D) |
| UI checker | A project has no test suite, or UI must match reference shots; drives Playwright |
| Spec writer | Requests arrive loosely worded, e.g. from email or issue intake |
| Debugger | The implementer fails the verify gate twice on one task |
| Security reviewer | Client-facing apps, auth, secrets or dependency changes |
| Migration agent | Prisma schema changes need isolating from feature code |
| Docs / release agent | PR description, changelog and README updates at the end |

Planner and reviewer are read-only by design: the planner cannot start coding and the reviewer cannot quietly fix what it is meant to judge.

## Commands and pipeline

The orchestrator (the main session running a command) calls each agent in turn; agents hand off through files, and hooks decide whether a handoff is allowed.

| Command | What it does |
| --- | --- |
| `/factory:init` | Inspects the repo, writes config + CLAUDE.md draft, stops for review |
| `/factory:feature <spec>` | Runs the full pipeline below |
| `/factory:ui <brief>` | Runs UI R&D and stops for a direction pick |
| `/factory:status` | Shows the current run and `plan.md` progress |
| `/factory:dashboard` | Starts the local viewer if it is not running |

**Feature pipeline** (2 human checkpoints, 3 loops)

1. **Spec** — `/factory:feature` with acceptance criteria.
2. **Planner** writes `plan.md` as small tasks.
3. **You approve the plan** — human checkpoint.
4. **Implementer** builds one task.
5. **Tester** writes and runs tests.
6. **Verify passes?** — no: back to the implementer to fix and retry; after 2 failed attempts, escalate (debugger).
7. **More tasks?** — yes: back to step 4 with the next task.
8. **Reviewer** reviews the full diff with fresh context.
9. **Blocking issues?** — yes: back to the implementer, max 2 review loops.
10. **PR on a branch, you merge** — human checkpoint.

Interactive runs use the model orchestrator for flexibility; unattended runs (CI, scheduled, email intake) chain the same agents from a script or the Agent SDK so the order can never be skipped.

## Per-project configuration

`/factory:init` runs once per project: it inspects the repo, writes `.factory/config.yml` and a CLAUDE.md draft, then stops for a human to review and commit both. Every agent reads commands and rules from the config; nothing project-specific is hard-coded in the plugin.

**What init detects:** package manager, framework, test/lint/typecheck/build scripts, ORM, existing design tokens, moodboard folder, git default branch.

**Config schema (v1)**

```yaml
factory_version: 0.1.0
project: my-app
stack: nextjs-prisma          # selects the stack-pack skill
commands:
  verify: pnpm typecheck && pnpm lint && pnpm test
  build: pnpm build
  dev: pnpm dev
gates:
  verify_required: true
  verify_timeout_s: 600
  max_verify_retries: 2
  max_review_loops: 2
  ui_check: playwright          # playwright | manual | none
protected_paths: [.env*, prisma/migrations/**, infra/**]
approval:
  plan: required
  ui_direction: required
ui:
  moodboard: design/moodboard/
  design_system: src/styles/tokens.css
  lab_dir: app/_lab/
  variants: 3
dashboard:
  mode: local                   # local | team | off
  url: ''                       # team collector URL
  autostart: false
```

**Rules**

- No config → every factory command stops and asks for `/factory:init`; it never guesses.
- A project with no test suite must declare its verify gate (lint, Playwright smoke check or manual review); `none` is not allowed for code changes.
- A project-local `.claude/agents/<name>.md` overrides the plugin's agent of the same name for that project only.
- `.factory/config.yml` and CLAUDE.md are committed, so teammates who clone the repo need no init.

## Hooks and quality gates

Hooks turn handoffs from "the model thinks it's done" into "the code passes". All hooks ship in the plugin and read their commands from `.factory/config.yml`.

| Hook event | Matcher | Action | Blocks on failure |
| --- | --- | --- | --- |
| PreToolUse | Edit, Write | Refuse edits to `protected_paths`; UI designer limited to `_lab/` and `design/` | Yes |
| PostToolUse | Edit, Write | Fast lint/typecheck on changed files | No (feedback only) |
| SubagentStop | implementer, tester | Run `commands.verify`; fail returns the agent to work | Yes |
| PreToolUse | Task / Agent | Emit `agent_start` event | No |
| SubagentStop | all | Emit `agent_stop` event with result | No |
| Stop | — | Emit `run_end`; write run summary | No |

**Requirements**

- Event emitters are fire-and-forget: a dashboard outage never slows or breaks a run.
- Gate hooks finish in under 60 s for the fast checks; the full verify runs only at SubagentStop.
- Every block explains itself in one line the agent can act on (which path, which check failed).

## UI R&D module

`/factory:ui <brief>` runs the UI designer agent: it studies the project's moodboard, builds 2–3 genuinely different directions in a sandbox, screenshots them, and stops for a human to pick one. The chosen direction becomes tokens and reference screens that the feature pipeline builds against.

**Steps**

1. Read inputs from config: moodboard folder (images, PDFs, notes), existing design system, brief.
2. Write `design/research/direction.md`: palette (hex), type pairing, spacing, radius, density, imagery, motion, three things to avoid — each citing its moodboard file.
3. Build `ui.variants` directions as tokens + 1–2 key screens in `app/_lab/<direction>/`.
4. Screenshot each at desktop and mobile with Playwright into `design/research/shots/`; fix visible defects before reporting.
5. Report trade-offs and a recommendation; a human picks.
6. Chosen tokens merge into the real design system; reference shots attach to the spec.

**Rules**

- No moodboard and no design system → derive direction from the brief and audience, and say so in the output.
- Existing design system wins unless the brief asks for a redesign.
- Writes only to `_lab/` and `design/`, enforced by hook.
- Moodboard capped at about 15 files; `direction.md` is cached and reused on later runs to save tokens.
- A bundled `ui-craft` skill carries typography, accessibility minimums (WCAG AA contrast) and anti-patterns.
- Later, the UI checker compares finished screens against the reference shots.

## Observability dashboard

The dashboard shows every factory run live: which stage is active, what each agent touched, whether gates passed, how many review loops ran and what it cost. Two modes share one event format, so team mode can be added later without changing the plugin.

| | Local mode (v1, built in) | Team mode (v2, optional) |
| --- | --- | --- |
| Runs on | Developer's machine | One hosted service on the team's own server, behind auth |
| Sees | All projects on that machine | All projects, developers and CI runs |
| Storage | `~/.factory/runs/<project>/*.jsonl` | Postgres, or `node:sqlite` if stable in the Node version |
| Started by | `/factory:dashboard` or a SessionStart hook | Always on (PM2 + nginx) |
| Dependencies | Node.js 18+, zero npm packages | Node 22+, Fastify/Hono or Next.js + Prisma, Auth.js |
| Auth | None (localhost only) | Per-project API key for events, login for viewers |

**Design:** the dashboard follows [dashboard-ui.md](dashboard-ui.md) — forest-and-lime tokens for light and dark, a bento overview with the selected run as the hero, one lime element per screen, status always stated in words, WCAG 2.1 AA.

**Views:** runs list (spec, status, duration) · per-run pipeline with active stage and loop count · timeline of files edited and commands run · gate results per handoff · task board from `plan.md` · tokens and cost per run and per agent.

**Event format**

```json
{"type":"agent_stop","at":1763150000000,"project":"my-app","run":"r_8f2c","session":"…","agent":"implementer","task":3,"result":"verify_passed","tokens":18400}
```

**Requirements**

- Hooks strip secrets: no file contents or env values in events, only paths, tool names, results and counts.
- If Node is missing, `/factory:init` says so and disables the dashboard; the factory still runs.
- Cost and token charts can optionally come from Claude Code's OpenTelemetry export into Grafana instead.

## Distribution and versioning

The plugin lives in this private Kloudboy marketplace repo (`kloudboy-plugins`) and installs once per machine; projects pin the version they run.

| How often | Action | Result |
| --- | --- | --- |
| Once per machine | Add the `kloudboy` marketplace, `/plugin install factory@kloudboy` | Agents, commands, skills, hooks, viewer available everywhere |
| Once per project | `/factory:init`, review, commit | Project config + CLAUDE.md in the repo |
| Every run | `/factory:feature`, `/factory:ui`, `/factory:status` | Pipeline runs against that project's config |
| On release | `/plugin update` | New process everywhere; project configs untouched |

**Plugin layout**

```
plugins/factory/
├── .claude-plugin/plugin.json
├── agents/       planner, implementer, tester, reviewer, ui-designer, ui-checker
├── commands/     init, feature, ui, status, dashboard
├── skills/       nextjs-prisma/, wordpress/, static-site/, ui-craft/
├── hooks/        hooks.json + Node scripts (gates, event emitter)
└── dashboard/    server.js, index.html
```

**Rules**

- Semantic versions; a breaking config change bumps the major and ships a migration note.
- Each project's committed `.claude/settings.json` enables the plugin and names the marketplace, so teammates are prompted to install on clone.
- A new version runs on one pilot repo before the team updates.
- Config carries `factory_version`; a mismatch with the installed plugin warns before running.

## Security and safety

The factory runs code on developer machines and edits client repos, so it is held to the same rules as a team member with commit access but no merge or deploy rights.

- **No production access.** Agents never deploy, push to main, or touch production servers, databases or DNS.
- **Branch per run.** Every run works on a feature branch or git worktree; merge stays a human action.
- **Protected paths.** `.env*`, migrations, infra and secrets are blocked by hook unless config explicitly allows a path.
- **Least-privilege tools.** Each agent gets only the tools in its table; planner and reviewer are read-only.
- **Secrets stay out of events.** The emitter sends paths, tool names, results and counts only.
- **Private distribution.** The marketplace repo is private; no auto-update from sources outside Kloudboy control.
- **Untrusted input.** Specs from email or issues are data: a spec cannot change agent rules, tools or gates.
- **Team dashboard behind auth.** Per-project API keys for writes, login for reads, reachable only over HTTPS.

## Roadmap, metrics and risks

Build the factory inside one real project first, extract it into the plugin second, and prove it on a second, different project before rolling out.

| Phase | Scope | Gate to the next phase |
| --- | --- | --- |
| 1 · Pilot in one repo (current) | Core 3 agents, gate hooks, plain `.claude/` folder | 5 features shipped through the pilot |
| 2 · Extract the plugin | `config.yml` and init, stack-pack skills, local dashboard | init works on a second, different stack |
| 3 · Expand the line | Tester, UI designer, UI checker, debugger, team rollout | Success metrics met across pilot projects |
| 4 · Scale and automate | Team dashboard, headless and CI runs, external request intake | — |

No dates yet: they depend on which pilot repo is chosen (see open questions).

**Success metrics**

| Metric | Target after phase 3 |
| --- | --- |
| Runs reaching an approved PR without manual code edits | 60% of feature runs |
| Runs passing the verify gate on the first implementer attempt | 70% |
| Average review loops per run | 1.5 or fewer |
| Projects with committed `.factory/config.yml` | All active team repos |
| Defects found after merge that review should have caught | Trending down month on month |

**Risks**

| Risk | Mitigation |
| --- | --- |
| Generic prompts give generic output across stacks | Stack-pack skills; improve agent prompts from observed failures |
| A plugin update changes behaviour everywhere at once | Version pinning, pilot repo first, migration notes |
| Orchestrator skips steps or loops | Hook-enforced gates, loop cap in config, scripted chaining for unattended runs |
| Token cost grows with moodboards and long runs | Cached `direction.md`, small tasks, cost per run on the dashboard |
| Projects without tests pass weak checks | Mandatory declared verify gate; UI checker with Playwright |

**Open questions**

- [ ] Which repo is the pilot, and which stack (Next.js + Prisma, WordPress or static)?
- [ ] Does team mode run as its own service or inside an existing internal tool?
- [ ] Should headless runs start from GitHub issues, an external request queue, or both?
- [ ] Who owns agent-prompt changes and approves plugin releases?
