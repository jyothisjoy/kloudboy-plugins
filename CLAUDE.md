# CLAUDE.md — kloudboy-plugins

This repo is Kloudboy's **private Claude Code plugin marketplace**. Its first and main plugin is
**factory**: a software factory that plans, builds, tests and reviews code in any project from a
written spec. The factory is independent of any client or product: never name, assume or
hard-code a specific project anywhere in this repo (docs, prompts, examples, tests).

This file is the single source of truth for how to work in this repo. If something is not covered
here or in `docs/`, **ask before assuming**.

## Read first

1. `docs/PRD.md` — the product requirements. Every feature, agent, command, hook and dashboard
   behaviour is specified there. Build to the PRD; do not add scope it does not describe.
2. `docs/decisions.md` — decisions taken since the PRD. A decision here overrides the PRD.
3. `docs/implementation-plan.md` — what to build next, in order, with the check for each task.
4. `docs/dashboard-ui.md` — the dashboard's design system. Any dashboard UI work follows it:
   tokens only, one lime element per screen, status always in words.
5. `docs/README.md` — index of everything in `docs/`.

If the PRD and the code disagree, stop and ask which one is right. Do not silently "fix" either.

## How to work

These behaviour rules follow the four principles of the Karpathy-inspired CLAUDE.md
([forrestchang/andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills), MIT),
adapted for this repo. They favour care over speed; for trivial changes (a typo, an obvious
one-liner) use judgment.

### 1. Think before coding
- State your assumptions before you implement. If you are unsure, ask instead of guessing.
- If a request can be read more than one way, lay out the readings; don't pick one silently.
- If a simpler approach exists than the one asked for, say so. Push back when it's warranted.
- If something is unclear, stop, name exactly what is confusing, and ask.

### 2. Simplicity first
- Write the least code that solves the problem. Nothing speculative.
- No features, options or configurability beyond what was asked or what the PRD specifies.
- No abstractions for code used once; no error handling for cases that cannot happen.
- If the solution could be a quarter of its length, rewrite it. Test: would a senior engineer
  call this overcomplicated? If yes, simplify.

### 3. Surgical changes
- Touch only what the task needs. Don't reformat, rename or "improve" neighbouring code.
- Match the existing style, even where you would do it differently.
- Noticed unrelated problems or dead code? Mention them; don't change them.
- Clean up only your own mess: remove imports, variables and functions that *your* change left
  unused; leave pre-existing dead code alone unless asked.
- Test: every changed line traces back to the request.

### 4. Goal-driven execution
- Turn each task into a checkable goal before starting: "fix the bug" → "write a check that
  reproduces it, then make it pass"; "refactor X" → "same results before and after".
- For multi-step work, state a short plan where every step has its check:
  `1. <step> → verify: <check>`.
- Don't call something done until its check passes. In this repo the checks are: JSON files
  parse, hook scripts run standalone with sample input, and the plugin installs from the local
  marketplace.

These rules are working when diffs contain only what was asked, code is simple the first time,
and questions come before implementation rather than after a mistake.

## Repo layout (target)

```
kloudboy-plugins/
├── .claude-plugin/marketplace.json     # marketplace "kloudboy" — lists every plugin
├── plugins/
│   └── factory/                        # the software factory plugin → /factory:* commands
│       ├── .claude-plugin/plugin.json
│       ├── agents/                     # planner, implementer, tester, reviewer, ui-designer, ui-checker
│       ├── commands/                   # init, feature, ui, status, dashboard
│       ├── skills/                     # nextjs-prisma/, wordpress/, static-site/, ui-craft/
│       ├── hooks/                      # hooks.json + Node scripts (gates + event emitter)
│       └── dashboard/                  # zero-dependency local viewer (server.js + index.html)
├── docs/                               # PRD, decisions, index
└── CLAUDE.md
```

## Naming

- Marketplace name: `kloudboy`. Plugin name: `factory`. Install: `/plugin install factory@kloudboy`.
- The plugin name is the command namespace, so commands are `/factory:init`, `/factory:feature`, etc.
  Never rename the plugin without updating the PRD and every project's settings.

## Rules for plugin code

**The plugin holds the process; projects hold the facts.**
- Nothing project-specific (commands, paths, stack names, client names) is hard-coded in the plugin.
  Agents and hooks read everything from the project's `.factory/config.yml`.
- No config in a project → every factory command stops and tells the user to run `/factory:init`.

**Runtime dependencies: none.**
- Hooks and the local dashboard run on Node.js 18+ built-ins only (`node:http`, `node:fs`, `fetch`).
  No `package.json` dependencies, no `node_modules`, no build step in `plugins/factory/`.
- Reference plugin files through `${CLAUDE_PLUGIN_ROOT}` in hooks.json; never absolute paths.

**Hooks.**
- One Node script per hook event, called with the event name as an argument.
- Block only with exit code 2 and **one actionable line** on stderr (which path, which check, what to do).
- Event emitting is fire-and-forget: a missing or down dashboard must never slow or fail a run.
- Events carry paths, tool names, agent names, results and counts only — never file contents,
  command text, env values or secrets.
- Long gates (the verify command) set an explicit `timeout` in hooks.json.

**Agents.**
- Least-privilege `tools:` in every agent's frontmatter, matching the PRD's agent table.
  Planner and reviewer are read-only. UI designer may write only to the sandbox paths.
- Agents hand off through files (`plan.md`, `review.md`, `.factory/state/`), never through memory.

**Windows first.** The team develops on Windows with Cursor + Claude Code.
- Hook commands are `node "<script>"`, never bash-only syntax.
- Use `path.join` / `path.relative`; normalise to forward slashes before matching globs.

## Versioning and releases

- Semantic versions. Bump `version` in **both** `plugins/factory/.claude-plugin/plugin.json` and
  `.claude-plugin/marketplace.json` together.
- A breaking change to `.factory/config.yml` bumps the major version and adds a migration note to
  `docs/decisions.md`.
- Test a new version on one pilot project before telling the team to `/plugin update`.

## Testing locally

- Add this folder as a local marketplace: `/plugin marketplace add D:\react\kloudboy-plugins`,
  then `/plugin install factory@kloudboy`. After edits, reinstall or update the plugin.
- Hook scripts must also run standalone: `echo '{...}' | node plugins/factory/hooks/<script>.js <event>`.
- Validate JSON files (marketplace.json, plugin.json, hooks.json) before finishing any change.

## Docs

- `docs/` is where planning lives. Keep `docs/PRD.md` and the live PRD in sync (see `docs/README.md`).
- Record every decision that changes or clarifies the PRD in `docs/decisions.md`, newest first.

## Don't

- Don't commit, push or tag unless asked.
- Don't add npm dependencies to the plugin runtime.
- Don't add agents, commands or config keys that the PRD does not describe — propose them first.
